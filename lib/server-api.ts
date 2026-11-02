/** Server-side backend JSON access: session forwarding, caching, and error handling.
 *
 * refs: none
 */
import { operatorBackendFetch } from "./operator-transport.mjs";
/**
 * Fetches JSON from the backend with server-side caching, revalidation, and error handling.
 * Keeps server api server-side and aligned with its data source.
 * refs: none
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { accountSessionCookie } from "./operator-plane";

type ServerFetchOptions = Omit<RequestInit, "signal"> & {
  timeoutMs?: number;
};

/** Forward the caller's session for protected SSR reads; never share account responses.
 *
 * I/O: in (path: string, options: ServerFetchOptions) -> out Promise<T>
 *
 * refs: none
 */
export async function fetchAccountServerJson<T>(path: string, options: ServerFetchOptions = {}): Promise<T> {
  const session = (await cookies()).get(accountSessionCookie())?.value;
  if (!session) throw new Error("Login required");
  return fetchServerJson<T>(path, {
    ...options, cache: "no-store", headers: { ...options.headers, Authorization: `Bearer ${session}` },
  });
}

/** Resolve the absolute internal backend origin used by server-owned requests.
 *
 * I/O: in () -> out string
 *
 * refs: none
 */
export function serverApiBase(): string {
  const value = (
    process.env.NEXT_SERVER_API_URL
    || process.env.NEXT_PUBLIC_API_URL
    || "http://localhost:3304"
  ).replace(/\/+$/, "");

  if (value.startsWith("/")) {
    throw new Error("Server API URL must be absolute");
  }
  return value;
}

/**
 * Fetches JSON from the backend with server-side caching, revalidation, and error handling.
 *
 * Forwards the caller's session (when one exists) on BOTH surfaces so the
 * backend can apply verified-user tier exemptions (unlimited rate limits).
 * The backend is the sole authority on whether a session grants unlimited
 * access; the frontend must not gate it.
 *
 * Uses dynamic data sources (`headers()`, `cookies()`) — do NOT call inside
 * an `unstable_cache` scope. Use `fetchServerJsonStatic` there instead.
 *
 * refs: none
 * I/O types: `path: string; options: ServerFetchOptions -> Promise<T>`.
 */
export async function fetchServerJson<T>(path: string, options: ServerFetchOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, ...requestOptions } = options;
  // Forward the incoming client User-Agent so the backend can distinguish
  // caller classes (e.g. the Wolper game overlay) for caller-aware caching.
  const incoming = await headers();
  const clientUa = incoming.get("user-agent") ?? undefined;
  const surface = incoming.get("x-paladinscat-surface") === "pro" ? "pro" : "public";
  const forwarded = new Headers(requestOptions.headers);
  if (!forwarded.has("accept")) forwarded.set("accept", "application/json");
  if (clientUa) forwarded.set("x-client-ua", clientUa);
  // Preserve ingress identity and request correlation on SSR backend reads.
  // Fetch options cannot supply identity absent from the incoming request.
  for (const name of ["cf-connecting-ip", "cf-ray"]) {
    const value = incoming.get(name)?.trim();
    if (value) forwarded.set(name, value);
    else forwarded.delete(name);
  }
  // Preserve Caddy's original HTTPS proof when a caller forwards browser
  // cookies; the backend keeps its cookie transport and CSRF checks.
  const forwardedProto = incoming.get("x-forwarded-proto");
  if (forwardedProto) forwarded.set("x-forwarded-proto", forwardedProto);
  else forwarded.delete("x-forwarded-proto");
  // Caddy owns the ingress marker; caller-supplied fetch options cannot promote it.
  forwarded.set("x-paladinscat-surface", surface);
  // Forward the session on every surface. The backend's identity::session()
  // resolves the token from the Authorization header (Bearer) or the
  // __Host-pc_session cookie and applies has_unlimited_website_access() to
  // grant verified users unlimited rate limits. Gating this on surface was a
  // production bug: public-surface SSR reads dropped the session, so the
  // backend treated verified users as guests and returned 429.
  const session = (await cookies()).get(accountSessionCookie())?.value;
  if (session && !forwarded.has("authorization")) forwarded.set("authorization", `Bearer ${session}`);
  const response = await operatorBackendFetch(`${serverApiBase()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...requestOptions,
    cache: requestOptions.cache ?? "no-store",
    headers: forwarded,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Server API ${response.status} for ${path}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Fetches JSON from the backend for use inside `unstable_cache` boundaries.
 *
 * Does NOT call `headers()` or `cookies()` — safe for static cache scopes
 * where Next.js rejects dynamic data sources. Always identifies as the
 * public surface; no session is forwarded (champion catalog data is public
 * and does not require tier-based access).
 *
 * refs: none
 * I/O types: `path: string; options: ServerFetchOptions -> Promise<T>`.
 */
export async function fetchServerJsonStatic<T>(path: string, options: ServerFetchOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, ...requestOptions } = options;
  const forwarded = new Headers(requestOptions.headers);
  if (!forwarded.has("accept")) forwarded.set("accept", "application/json");
  // Static scope: no dynamic headers available. Public surface is the only
  // valid identity for cached catalog reads.
  forwarded.set("x-paladinscat-surface", "public");
  const response = await operatorBackendFetch(`${serverApiBase()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...requestOptions,
    cache: requestOptions.cache ?? "no-store",
    headers: forwarded,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Server API ${response.status} for ${path}`);
  }
  return response.json() as Promise<T>;
}
