/**
 * Privacy boundary: forward only a fixed URL and method, never browser headers or bodies.
 *
 * refs: none
 */
import { serverApiBase } from "@/lib/server-api";
import { anonymousPresenceRequestAllowed } from "@/lib/anonymous-presence-gate";

const headers = { "Cache-Control": "no-store", "X-PC-Presence": "aggregate-v1" };

async function presence(request: Request): Promise<Response> {
  if (!anonymousPresenceRequestAllowed(request, process.env.PALADINSCAT_PUBLIC_ORIGIN || "https://paladinscat.com")
    || (request.body !== null && request.headers.get("content-length") !== "0")) {
    return new Response(null, { status: 400, headers });
  }
  try {
    // Deliberately NOT the account transport, generic rewrite, or forwarded headers.
    const response = await fetch(`${serverApiBase()}/analytics/presence`, {
      method: request.method, cache: "no-store", credentials: "omit",
      redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(2_500),
    });
    if (request.method === "GET" && response.ok) return Response.json(await response.json(), { headers });
  } catch { /* No per-request analytics log or retry. */ }
  return new Response(null, { status: 503, headers });
}

/** GET: forward the anonymous-presence aggregate to the backend. refs: none */
export const GET = presence;
