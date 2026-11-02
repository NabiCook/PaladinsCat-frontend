/**
 * Exchange a single authorization code after matching the transaction cookie and consuming server-side state. Validate the ID token and nonce, exchange tokens with the backend, and set session and CSRF cookies before redirecting to the safe return path. Validation failures clear the transaction cookie and redirect to the login error page; uncaught transport/JSON errors reject the promise. Provider tokens stay server-side.
 * refs: none
 */
import { operatorBackendFetch } from "@/lib/operator-transport.mjs";
import { NextRequest, NextResponse } from "next/server";
import { newCsrfToken, normalizedHttpsIssuer, safeReturnPath, parseTransaction, resolveInternalIssuer, stateMatches, validateIdToken } from "@/lib/oidc-security";
import { oidcBffServiceHeaders, type CfForwardHeaders } from "@/lib/oidc-bff-service";
import { oidcClientSecret } from "@/lib/oidc-client-secret";
import { oidcFetch } from "@/lib/oidc-transport";
import { FP_COOKIE, parseFingerprintCookie } from "@/lib/fingerprint";
import { accountSessionCookie, assertOperatorConfiguration, freshOperatorClaims, isOperatorBff, oidcTransactionCookie } from "@/lib/operator-plane";

/**
 * Selects the Node.js runtime required by this server handler.
 * Returns: `string`
 * refs: none
 */
export const runtime = "nodejs";
const CSRF_COOKIE = "__Host-pc_csrf";
function origin() { return process.env.PALADINSCAT_PUBLIC_ORIGIN || "http://localhost:3000"; }
function backend() {
  const base = (process.env.NEXT_SERVER_API_URL || "http://localhost:3005").replace(/\/$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}
function clear(response: NextResponse) { response.cookies.set(oidcTransactionCookie(), "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 }); }
function one(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}
// Forward the Cloudflare edge headers (cf-connecting-ip, cf-ray) plus the bounded browser
// inputs to the backend for security-event logging. user-agent/accept-language come from the
// request headers; screen/timezone/platform come from the first-party pc_fp cookie because a
// top-level navigation (from the IdP) cannot carry custom request headers. No other browser
// data crosses this boundary; the backend hashes the IP and the browser signature and the
// frontend never stores or logs the raw value.
function cfForwardHeaders(request: NextRequest): CfForwardHeaders {
  const headers: CfForwardHeaders = {};
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  const ray = request.headers.get("cf-ray")?.trim();
  const userAgent = request.headers.get("user-agent")?.trim();
  const acceptLanguage = request.headers.get("accept-language")?.trim();
  if (connectingIp) headers["cf-connecting-ip"] = connectingIp;
  if (ray) headers["cf-ray"] = ray;
  if (userAgent) headers["user-agent"] = userAgent;
  if (acceptLanguage) headers["accept-language"] = acceptLanguage;
  const fp = parseFingerprintCookie(request.cookies.get(FP_COOKIE)?.value);
  if (fp.screen) headers["x-paladinscat-fp-screen"] = fp.screen;
  if (fp.timezone) headers["x-paladinscat-fp-timezone"] = fp.timezone;
  if (fp.platform) headers["x-paladinscat-fp-platform"] = fp.platform;
  return headers;
}

/**
 * Exchange a single authorization code after matching the transaction cookie and consuming server-side state. Validate the ID token and nonce, exchange tokens with the backend, and set session and CSRF cookies before redirecting to the safe return path. Validation failures clear the transaction cookie and redirect to the login error page; uncaught transport/JSON errors reject the promise. Provider tokens stay server-side.
 * refs: doc: documents/02-technical/security/auth.md
 * I/O types: `request: NextRequest -> Promise<NextResponse<unknown>>`.
 */
export async function GET(request: NextRequest) {
  assertOperatorConfiguration();
  const url = new URL(request.url);
  const state = one(url, "state");
  const code = one(url, "code");
  if (!stateMatches(request.cookies.get(oidcTransactionCookie())?.value, state) || !code || url.searchParams.get("error")) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const consume = await operatorBackendFetch(`${backend()}/auth/oidc/transactions/consume`, { method: "POST", headers: { ...await oidcBffServiceHeaders(), "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ state }) });
  if (!consume.ok) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const txValue = await consume.json();
  const tx = parseTransaction(txValue);
  if (!tx) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const issuer = normalizedHttpsIssuer(process.env.OIDC_ISSUER);
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = oidcClientSecret();
  if (!issuer || !clientId || !clientSecret) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const serverIssuer = resolveInternalIssuer(issuer, process.env.OIDC_INTERNAL_ISSUER);
  const tokenResponse = await oidcFetch(`${serverIssuer}/protocol/openid-connect/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store", body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code, code_verifier: tx.verifier, redirect_uri: `${origin()}/api/auth/oidc/callback` }) });
  if (!tokenResponse.ok) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const token = await tokenResponse.json() as { access_token?: string; id_token?: string; refresh_token?: string };
  const idClaims = await validateIdToken(token.id_token, issuer, clientId, tx.nonce, serverIssuer);
  if (!token.access_token || !token.id_token || !token.refresh_token || !idClaims || (isOperatorBff() && !freshOperatorClaims(idClaims))) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  // Access tokens cross this server-to-server boundary only; they never reach browser JS or cookies.
  const keepSignedIn = idClaims.pc_keep_signed_in === true;
  // The validated id_token crosses this server-to-server boundary only; the backend stores it (encrypted) so RP-initiated logout can name the SSO session via id_token_hint.
  const exchangeBody: { access_token: string; id_token: string; refresh_token: string; session_ttl_hours?: number; nonce?: string } = { access_token: token.access_token, id_token: token.id_token, refresh_token: token.refresh_token };
  if (isOperatorBff()) exchangeBody.nonce = tx.nonce;
  else if (keepSignedIn) exchangeBody.session_ttl_hours = 72;
  const exchange = await operatorBackendFetch(`${backend()}/auth/oidc/exchange`, { method: "POST", headers: { ...await oidcBffServiceHeaders(cfForwardHeaders(request)), "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(exchangeBody) });
  if (!exchange.ok) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const result = await exchange.json() as { token?: string; expires_at?: string };
  if (!result.token || result.token.length > 512 || !result.expires_at) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const expiresMs = Date.parse(result.expires_at);
  const sessionMaxAge = Number.isFinite(expiresMs) ? Math.floor((expiresMs - Date.now()) / 1000) : 60 * 60 * 8;
  if (sessionMaxAge <= 0) { const response = NextResponse.redirect(new URL("/auth/login?oidc_error=1", origin())); clear(response); return response; }
  const returnPath = safeReturnPath(tx.returnPath);
  // One surface owns every browser session: the consolidated public app lands the
  // user on the validated return path in the same origin that set the cookie, so no
  // cross-host hand-off can strand a host-scoped session on a retired host.
  const response = NextResponse.redirect(new URL(returnPath, origin()));
  response.headers.set("Cache-Control", "private, no-store");
  clear(response);
  response.cookies.set(accountSessionCookie(), result.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: isOperatorBff() ? Math.min(sessionMaxAge, 900) : sessionMaxAge });
  // Deliberately readable by same-origin JS only; backend requires it to match X-CSRF-Token on unsafe cookie-auth requests.
  response.cookies.set(CSRF_COOKIE, newCsrfToken(), { httpOnly: false, secure: true, sameSite: "strict", path: "/", maxAge: sessionMaxAge });
  return response;
}
