/**
 * Start OIDC login or registration from a same-origin form. Return 403 for a foreign origin, 415 for unsupported media, and 400 for malformed forms or unsupported intent; store a transaction and submit PAR before setting the secure transaction cookie on a 303 redirect. Configuration or PAR failures return 503.
 * refs: none
 */
import { operatorBackendFetch } from "@/lib/operator-transport.mjs";
import { NextRequest, NextResponse } from "next/server";
import { buildParAuthorizationUrl, buildPushedAuthorizationRequest, createTransaction, normalizedHttpsIssuer, parsePushedAuthorizationResponse, requireSameOrigin, resolveInternalIssuer, safeReturnPath } from "@/lib/oidc-security";
import { oidcBffServiceHeaders } from "@/lib/oidc-bff-service";
import { oidcClientSecret } from "@/lib/oidc-client-secret";
import { oidcFetch } from "@/lib/oidc-transport";
import { isIP } from "node:net";
import { assertOperatorConfiguration, isOperatorBff, oidcTransactionCookie } from "@/lib/operator-plane";

/**
 * Selects the Node.js runtime required by this server handler.
 * Returns: `string`
 * refs: none
 */
export const runtime = "nodejs";
const PAR_MAX_BYTES = 8 * 1024;
function origin() { return process.env.PALADINSCAT_PUBLIC_ORIGIN || "http://localhost:3000"; }
function backend() {
  const base = (process.env.NEXT_SERVER_API_URL || "http://localhost:3005").replace(/\/$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}
function clientAddress(request: NextRequest): string | undefined {
  const address = request.headers.get("cf-connecting-ip")?.trim();
  return address && isIP(address) ? address : undefined;
}

async function readParResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > PAR_MAX_BYTES) { await reader.cancel(); return null; }
    chunks.push(next.value);
  }
  try { return parsePushedAuthorizationResponse(JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"))); } catch { return null; }
}

async function startOidc(intent: "login" | "create", returnPath: string, clientIp?: string) {
  try {
    return await performOidcStart(intent, returnPath, clientIp);
  } catch {
    // Service-token, configuration-file and transaction transport failures must
    // not escape as an unhandled 500 or expose credential-bearing exceptions.
    return temporarilyUnavailable();
  }
}

function temporarilyUnavailable() {
  return new NextResponse("OIDC is temporarily unavailable. Please try again shortly.", {
    status: 503,
    headers: { "Cache-Control": "private, no-store", "Retry-After": "5" },
  });
}

async function performOidcStart(intent: "login" | "create", returnPath: string, clientIp?: string) {
  assertOperatorConfiguration();
  if (isOperatorBff() && intent !== "login") return new NextResponse("Forbidden", { status: 403 });
  const transaction = createTransaction(returnPath);
  const issuer = normalizedHttpsIssuer(process.env.OIDC_ISSUER);
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = oidcClientSecret();
  if (!issuer || !clientId || !clientSecret) return new NextResponse("OIDC is not configured", { status: 503 });
  const serverIssuer = resolveInternalIssuer(issuer, process.env.OIDC_INTERNAL_ISSUER);
  const serviceHeaders = await oidcBffServiceHeaders();
  const stored = await operatorBackendFetch(`${backend()}/auth/oidc/transactions`, { method: "POST", headers: { ...serviceHeaders, ...(clientIp ? { "x-forwarded-for": clientIp } : {}), "content-type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(3_000), body: JSON.stringify({ state: transaction.state, nonce: transaction.nonce, verifier: transaction.verifier, return_path: transaction.returnPath }) });
  if (stored.status !== 201) return temporarilyUnavailable();
  const par = buildPushedAuthorizationRequest(serverIssuer, clientId, `${origin()}/api/auth/oidc/callback`, transaction);
  par.form.set("client_secret", clientSecret);
  if (isOperatorBff()) {
    par.form.set("acr_values", process.env.PALADINSCAT_OPERATOR_REQUIRED_ACR || "2");
    par.form.set("max_age", "0");
    par.form.set("prompt", "login");
  }
  // Registration is a fixed Keycloak prompt, never a browser-supplied auth parameter.
  if (intent === "create") par.form.set("prompt", "create");
  let requestUri: string | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const pushed = await oidcFetch(par.endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store", redirect: "error", signal: controller.signal, body: par.form });
    const parsed = pushed.ok ? await readParResponse(pushed) : null;
    requestUri = parsed?.requestUri;
  } catch { /* fail closed below */ } finally { clearTimeout(timeout); }
  if (!requestUri) return temporarilyUnavailable();
  // A 307 preserves the form POST to Keycloak; use 303 so the authorization endpoint receives a GET.
  const response = NextResponse.redirect(buildParAuthorizationUrl(issuer, clientId, requestUri), { status: 303 });
  response.cookies.set(oidcTransactionCookie(), transaction.state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}

/**
 * Start OIDC login or registration from a same-origin form. Return 403 for a foreign origin, 415 for unsupported media, and 400 for malformed forms or unsupported intent; store a transaction and submit PAR before setting the secure transaction cookie on a 303 redirect. Configuration or PAR failures return 503.
 * refs: doc: documents/02-technical/security/auth.md
 * I/O types: `request: NextRequest -> Promise<NextResponse<unknown>>`.
 */
export async function POST(request: NextRequest) {
  if (!requireSameOrigin(request.headers.get("origin"), origin())) return new NextResponse("Forbidden", { status: 403 });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType && contentType !== "application/x-www-form-urlencoded" && contentType !== "multipart/form-data") return new NextResponse("Unsupported media type", { status: 415 });
  let form: FormData;
  try { form = contentType ? await request.formData() : new FormData(); }
  catch { return new NextResponse("Invalid form", { status: 400 }); }
  const requestedIntent = form.get("intent");
  if (requestedIntent !== null && requestedIntent !== "create") return new NextResponse("Invalid OIDC intent", { status: 400 });
  return startOidc(requestedIntent === "create" ? "create" : "login", safeReturnPath(String(form.get("return") || "/")), clientAddress(request));
}

/**
 * Start OIDC login for an empty query, a single safe return path, or intent=create; reject other query shapes with 404. Store a transaction, submit PAR, and set a secure ten-minute transaction cookie on the 303 redirect; configuration or PAR failures return 503.
 * refs: doc: documents/02-technical/security/auth.md
 * I/O types: `request: NextRequest -> Promise<NextResponse<unknown>>`.
 */
export async function GET(request: NextRequest) {
  const entries = [...request.nextUrl.searchParams.entries()];
  if (entries.length === 0) return startOidc("login", "/", clientAddress(request));
  if (entries.length === 1 && entries[0][0] === "return") return startOidc("login", safeReturnPath(entries[0][1]), clientAddress(request));
  if (entries.length === 1 && entries[0][0] === "intent" && entries[0][1] === "create") return startOidc("create", "/", clientAddress(request));
  return new NextResponse("Not found", { status: 404 });
}
