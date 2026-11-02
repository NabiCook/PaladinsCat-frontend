/** Server-owned operator mode. Request headers never choose an authentication plane.
 *
 * refs: none
 */
/** Report whether the process runs in the server-owned operator BFF mode.
 *
 * I/O: in () -> out boolean
 *
 * refs: none
 */
export function isOperatorBff(): boolean {
  const mode = process.env.PALADINSCAT_OPERATOR_BFF;
  if (mode === undefined || mode === "" || mode === "0") return false;
  if (mode !== "1") throw new Error("Invalid operator BFF mode");
  return true;
}

/** Host-only names prevent a public browser session from becoming an operator session.
 *
 * I/O: in () -> out string
 *
 * refs: none
 */
export function accountSessionCookie(): string {
  return isOperatorBff() ? "__Host-pc_admin_session" : "__Host-pc_session";
}

/** Return the OIDC transaction cookie name for the current authentication plane.
 *
 * I/O: in () -> out string
 *
 * refs: none
 */
export function oidcTransactionCookie(): string {
  return isOperatorBff() ? "__Host-pc_admin_oidc_txn" : "__Host-pc_oidc_txn";
}

/** Fail closed before contacting the provider if the private instance is misconfigured.
 *
 * I/O: in () -> out void
 *
 * refs: none
 */
export function assertOperatorConfiguration(): void {
  if (!isOperatorBff()) return;
  const value = process.env.PALADINSCAT_OPERATOR_ORIGIN;
  const publicOrigin = process.env.PALADINSCAT_PUBLIC_ORIGIN;
  const origin = value ? new URL(value) : null;
  if (!origin || origin.protocol !== "https:" || origin.username || origin.password
      || origin.pathname !== "/" || origin.search || origin.hash
      || origin.origin !== value || publicOrigin !== value
      || process.env.OIDC_CLIENT_ID !== "paladinscat-operator"
      || process.env.PALADINSCAT_SERVICE_OIDC_CLIENT_ID !== "paladinscat-operator-bff") {
    throw new Error("Operator identity configuration is incomplete");
  }
  const backend = new URL(process.env.NEXT_SERVER_API_URL || "");
  if (backend.protocol !== "https:" || backend.hostname !== "backend-rust-operator" || backend.port !== "3006"
      || backend.username || backend.password || backend.search || backend.hash
      || !["", "/", "/v1"].includes(backend.pathname)) {
    throw new Error("Operator backend configuration is invalid");
  }
}

/** Restrict the private instance to operator UI, authentication and static resources.
 *
 * I/O: in (path: string, method: string) -> out string | null
 *
 * refs: none
 */
export function operatorApiSuffix(path: string, method = "GET"): string | null {
  if (path.includes("%") || path.includes("\\") || path.includes("//") || path.split("/").some(value => value === "." || value === "..")) return null;
  const prefix = ["/api", "/_pc"].find(value => path.startsWith(`${value}/`));
  if (!prefix) return null;
  const suffix = path.slice(prefix.length);
  if (suffix === "/admin" || suffix.startsWith("/admin/")) return suffix;
  if (suffix === "/auth/me" && ["GET", "HEAD"].includes(method)) return suffix;
  if (suffix === "/auth/logout" && method === "POST") return suffix;
  const id = "[1-9][0-9]{0,18}";
  const routes: [string, string[]][] = [
    [`^/players/${id}/(?:clear-tag|report)$`, ["POST"]],
    ["^/cheaters/evidence/review$", ["GET", "HEAD"]],
    [`^/cheaters/evidence/${id}/review$`, ["POST"]],
    [`^/cheaters/evidence/${id}/(?:file|media/[0-9]{1,3})$`, ["GET", "HEAD"]],
    [`^/community/(?:posts|comments)/${id}$`, ["PUT", "DELETE"]],
    [`^/community/chat/${id}$`, ["DELETE"]],
    [`^/tierlists/${id}$`, ["PUT"]],
  ];
  return routes.some(([pattern, methods]) => methods.includes(method) && new RegExp(pattern).test(suffix)) ? suffix : null;
}

/** Report whether a path is allowed on the private operator instance.
 *
 * I/O: in (path: string, method: string) -> out boolean
 *
 * refs: none
 */
export function operatorPathAllowed(path: string, method = "GET"): boolean {
  if (path.includes("%") || path.includes("\\") || path.includes("//") || path.split("/").some(value => value === "." || value === "..")) return false;
  if (path === "/" || path === "/admin" || path.startsWith("/admin/")) return true;
  if (path === "/auth/login" || path === "/favicon.ico" || path === "/robots.txt") return true;
  if (path.startsWith("/_next/") || path.startsWith("/images/") || path.startsWith("/fonts/")) return true;
  if (["login", "callback", "logout", "backchannel-logout"].some(name => path === `/api/auth/oidc/${name}`)) return true;
  return operatorApiSuffix(path, method) !== null;
}

/** Require signed fresh authentication claims in addition to backend verification.
 *
 * I/O: in (claims: { auth_time?: unknown; acr?: unknown }, now: number) -> out boolean
 *
 * refs: none
 */
export function freshOperatorClaims(claims: { auth_time?: unknown; acr?: unknown }, now = Date.now()): boolean {
  return claims.acr === (process.env.PALADINSCAT_OPERATOR_REQUIRED_ACR || "2")
    && typeof claims.auth_time === "number" && Number.isSafeInteger(claims.auth_time)
    && claims.auth_time <= Math.floor(now / 1000) + 30
    && claims.auth_time >= Math.floor(now / 1000) - 300;
}
