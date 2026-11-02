/** Preserve Rust session decisions through an app-owned, private response. */
import { serverApiBase } from "./server-api";

type Dependencies = { apiBase?: () => string; fetcher?: typeof fetch };
const HOP_HEADERS = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

function stripHopHeaders(headers: Headers): void {
  for (const name of (headers.get("connection") || "").split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of HOP_HEADERS) headers.delete(name);
  headers.delete("host");
  headers.delete("content-length");
}

/** Pro admission remains in proxy.ts; this handler never adds a user quota. */
export function createAuthSessionProxy(dependencies: Dependencies = {}): (request: Request) => Promise<Response> {
  const apiBase = dependencies.apiBase || serverApiBase;
  const fetcher: typeof fetch = dependencies.fetcher || ((input, init) => fetch(input, init));
  return async (request) => {
    const headers = new Headers(request.headers);
    stripHopHeaders(headers);
    try {
      const upstream = await fetcher(`${apiBase().replace(/\/+$/, "")}/auth/me`, {
        method: "GET", headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      const responseHeaders = new Headers(upstream.headers);
      stripHopHeaders(responseHeaders);
      // fetch decompresses the body before this app-owned response sends it.
      responseHeaders.delete("content-encoding");
      responseHeaders.set("Cache-Control", "private, no-store");
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      return Response.json({ error: { code: "AUTH_SESSION_UNAVAILABLE" } }, {
        status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "5" },
      });
    }
  };
}

export const proxyAuthSession = createAuthSessionProxy();
