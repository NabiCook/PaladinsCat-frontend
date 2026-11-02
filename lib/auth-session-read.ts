/** Bounded per-process session-read throttling for the /auth/me passthrough.
 *
 * refs: none
 */
import { operatorBackendFetch } from "./operator-transport.mjs";
/** Stop runaway session reads from already-loaded clients without caching auth. */
import { createHash } from "node:crypto";
import { serverApiBase } from "./server-api";
import { accountSessionCookie } from "./operator-plane";

/** Max session reads allowed per token before rate limiting kicks in.
 *
 * refs: none
 */
export const AUTH_SESSION_READ_LIMIT = 30;
/** Rolling window (ms) over which the per-token read budget is counted.
 *
 * refs: none
 */
export const AUTH_SESSION_READ_WINDOW_MS = 10_000;
/** Max distinct token hashes retained before the oldest bucket is evicted.
 *
 * refs: none
 */
export const AUTH_SESSION_READ_MAX_KEYS = 4096;

type Dependencies = { apiBase?: () => string; fetcher?: typeof fetch; now?: () => number };
type Bucket = { startedAt: number; reads: number };
const HOP_HEADERS = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

function stripHopHeaders(headers: Headers): void {
  for (const name of (headers.get("connection") || "").split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of HOP_HEADERS) headers.delete(name);
  headers.delete("host");
  headers.delete("content-length");
}

function sessionKey(headers: Headers): string | null {
  // Match the backend's Bearer-first session_token resolution exactly.
  const authorization = headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const prefix = `${accountSessionCookie()}=`;
  const cookie = (headers.get("cookie") || "").split(";")
    .map((part) => part.trim()).find((part) => part.startsWith(prefix) && part.length > prefix.length);
  const token = bearer || cookie?.slice(prefix.length);
  return token ? createHash("sha256").update(token).digest("hex") : null;
}

function errorResponse(status: number, code: string, message: string, retryAfter: number): Response {
  return Response.json({ error: { code, message } }, {
    status, headers: { "Cache-Control": "private, no-store", "Retry-After": String(retryAfter) },
  });
}

/** Each process keeps only bounded token hashes/counters; the backend still owns auth.
 *
 * I/O: in (dependencies: Dependencies) -> out (request: Request) => Promise<Response>
 *
 * refs: none
 */
export function createSessionReadHandler(dependencies: Dependencies = {}): (request: Request) => Promise<Response> {
  const buckets = new Map<string, Bucket>();
  const now = dependencies.now || Date.now;
  const apiBase = dependencies.apiBase || serverApiBase;
  const fetcher: typeof fetch = dependencies.fetcher || ((input, init) => operatorBackendFetch(input, init));
  return async (request) => {
    const key = sessionKey(request.headers);
    if (key) {
      const time = now();
      let bucket = buckets.get(key);
      if (bucket && (time < bucket.startedAt || time - bucket.startedAt >= AUTH_SESSION_READ_WINDOW_MS)) {
        buckets.delete(key);
        bucket = undefined;
      }
      if (!bucket) {
        if (buckets.size >= AUTH_SESSION_READ_MAX_KEYS) {
          for (const [storedKey, stored] of buckets) {
            if (time - stored.startedAt >= AUTH_SESSION_READ_WINDOW_MS) buckets.delete(storedKey);
          }
          if (buckets.size >= AUTH_SESSION_READ_MAX_KEYS) {
            const oldest = buckets.keys().next().value;
            if (oldest !== undefined) buckets.delete(oldest);
          }
        }
        bucket = { startedAt: time, reads: 0 };
        buckets.set(key, bucket);
      }
      if (bucket.reads >= AUTH_SESSION_READ_LIMIT) {
        return errorResponse(429, "AUTH_REFRESH_RATE_LIMITED", "Too many session checks. Please retry shortly.",
          Math.max(1, Math.ceil((bucket.startedAt + AUTH_SESSION_READ_WINDOW_MS - time) / 1000)));
      }
      bucket.reads += 1;
    }
    const headers = new Headers(request.headers);
    stripHopHeaders(headers);
    try {
      const upstream = await fetcher(`${apiBase().replace(/\/+$/, "")}/auth/me`, {
        method: "GET", headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      const responseHeaders = new Headers(upstream.headers);
      stripHopHeaders(responseHeaders);
      // fetch decompresses upstream bodies; do not advertise their old wire encoding.
      responseHeaders.delete("content-encoding");
      responseHeaders.set("Cache-Control", "private, no-store");
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      return errorResponse(503, "AUTH_SESSION_UNAVAILABLE", "Session verification is temporarily unavailable.", 5);
    }
  };
}

// Compiled API aliases share the same counters inside the serving Node process.
const runtimeState = globalThis as typeof globalThis & { pcAuthSessionReadHandler?: ReturnType<typeof createSessionReadHandler> };
/** Pre-built shared session-read handler reused by compiled API route aliases.
 *
 * refs: none
 */
export const readAuthSession = runtimeState.pcAuthSessionReadHandler ??= createSessionReadHandler();
