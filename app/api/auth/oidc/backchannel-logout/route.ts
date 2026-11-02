/**
 * Validate the form logout token against the configured issuer and client before forwarding it to backend session revocation. Return 503 for missing configuration, 400 for malformed or missing form data, 401 for invalid tokens, 204 on successful revocation, or 502 when backend revocation fails.
 * refs: none
 */
import { operatorBackendFetch } from "@/lib/operator-transport.mjs";
import { NextRequest, NextResponse } from "next/server";
import { normalizedHttpsIssuer, resolveInternalIssuer, validateLogoutToken } from "@/lib/oidc-security";
import { oidcBffServiceHeaders } from "@/lib/oidc-bff-service";
import { assertOperatorConfiguration } from "@/lib/operator-plane";

/**
 * Selects the Node.js runtime required by this server handler.
 * Returns: `string`
 * refs: none
 */
export const runtime = "nodejs";
function backend() {
  const base = (process.env.NEXT_SERVER_API_URL || "http://localhost:3005").replace(/\/$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

async function boundedLogoutToken(request: NextRequest): Promise<string | number> {
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") || "")) return 415;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) return 400;
  if (declared !== null && Number(declared) > 65_536) return 413;
  if (!request.body) return 400;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new Error("Logout body deadline")); }, 5000);
    });
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65_536) { await reader.cancel(); return 413; }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const form = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(body));
    const tokens = form.getAll("logout_token");
    if (tokens.length !== 1 || !tokens[0] || tokens[0].length > 16_384) return 400;
    return tokens[0];
  } catch {
    void reader.cancel().catch(() => {});
    return 400;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}

// Keycloak POSTs a form-encoded logout_token (RS256, typ=Logout) here on backchannel logout.
// This route verifies the token server-side, then calls the service-token-protected backend
// revocation route. It is never a browser-facing page and returns no user data.
/**
 * Validate the form logout token against the configured issuer and client before forwarding it to backend session revocation. Return 503 for missing configuration, 400 for malformed or missing form data, 401 for invalid tokens, 204 on successful revocation, or 502 when backend revocation fails.
 * refs: doc: documents/02-technical/security/auth.md
 * I/O types: `request: NextRequest -> Promise<NextResponse<unknown>>`.
 */
export async function POST(request: NextRequest) {
  assertOperatorConfiguration();
  const issuer = normalizedHttpsIssuer(process.env.OIDC_ISSUER);
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!issuer || !clientId) return new NextResponse("OIDC is not configured", { status: 503 });
  const serverIssuer = resolveInternalIssuer(issuer, process.env.OIDC_INTERNAL_ISSUER);
  const logoutToken = await boundedLogoutToken(request);
  if (typeof logoutToken === "number") return new NextResponse("Invalid logout request", { status: logoutToken });
  const claims = await validateLogoutToken(logoutToken, issuer, clientId, serverIssuer);
  if (!claims || !claims.sid) return new NextResponse("Invalid logout token", { status: 401 });
  // Forward the raw logout_token form-encoded. The backend (Form binding) is the
  // authority: it re-validates signature/issuer/audience, applies jti replay
  // protection, and revokes the session row bound to the token's sid.
  const revoke = await operatorBackendFetch(`${backend()}/auth/oidc/backchannel-logout`, {
    method: "POST",
    headers: { ...await oidcBffServiceHeaders(), "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({ logout_token: logoutToken }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  // The browser receives an opaque success; the session row is already revoked by the backend.
  return new NextResponse(null, { status: revoke && revoke.ok ? 204 : 502 });
}
