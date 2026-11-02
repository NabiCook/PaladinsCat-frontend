/** Admission for the exact anonymous endpoint only; no cookie or identity lookup.
 *
 * refs: none
 */

/** Allow only the exact anonymous presence endpoint; reject any identity-bearing header.
 *
 * I/O: in (request: Request, publicOrigin: string) -> out boolean
 *
 * refs: none
 */
export function anonymousPresenceRequestAllowed(request: Request, publicOrigin: string): boolean {
  const url = new URL(request.url);
  return url.pathname === "/api/analytics/presence"
    && url.search === ""
    && request.method === "GET"
    && request.headers.get("sec-fetch-site") === "same-origin"
    && (!request.headers.has("origin") || request.headers.get("origin") === publicOrigin)
    && !request.headers.has("cookie")
    && !request.headers.has("authorization")
    && !request.headers.has("referer")
    && !request.headers.has("transfer-encoding")
    && (!request.headers.has("content-length") || request.headers.get("content-length") === "0");
}
