/** Match exports must spend the caller's backend grant before consulting the renderer.
 *
 * refs: none
 */
import { serverApiBase } from "./server-api";
import { readBodyWithinLimit } from "./bounded-response-body";

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const NO_STORE = { "cache-control": "private, no-store" };

function errorResponse(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status, headers: NO_STORE });
}

function callerHeaders(request: Request): Headers {
  const headers = new Headers({ accept: "application/json" });
  for (const name of ["authorization", "cf-connecting-ip", "cf-ray", "x-forwarded-proto", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Pin custom aliases from the edge-owned originals; incoming aliases confer no identity.
  for (const [original, alias] of [["cf-connecting-ip", "x-paladinscat-client-ip"], ["cf-ray", "x-paladinscat-cf-ray"]]) {
    const value = request.headers.get(original);
    if (value) headers.set(alias, value);
  }
  const session = (request.headers.get("cookie") || "").split(";")
    .map((part) => part.trim()).find((part) => part.startsWith("__Host-pc_session="));
  if (session) headers.set("cookie", session);
  headers.set("x-paladinscat-surface", request.headers.get("x-paladinscat-surface") === "pro" ? "pro" : "public");
  return headers;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function admittedMatch(payload: unknown, id: string): boolean {
  if (!record(payload) || payload.count !== 1 || !Array.isArray(payload.matches) || payload.matches.length !== 1) return false;
  const entry: unknown = payload.matches[0];
  if (!record(entry) || !record(entry.match)) return false;
  const matchId = entry.match.match_id;
  if (!(typeof matchId === "string" && /^[1-9]\d*$/.test(matchId))
      && !(typeof matchId === "number" && Number.isSafeInteger(matchId) && matchId > 0)) return false;
  if (BigInt(matchId as string | number) !== BigInt(id)) return false;
  const access = payload.access;
  if (!record(access)) return false;
  if (access.tier === "verified") return access.limit === null && access.remaining === null && access.resetAtMs === null;
  return (access.tier === "guest" || access.tier === "account")
    && typeof access.limit === "number" && Number.isSafeInteger(access.limit) && access.limit > 0
    && typeof access.remaining === "number" && Number.isSafeInteger(access.remaining)
    && access.remaining >= 0 && access.remaining <= access.limit
    && typeof access.resetAtMs === "number" && Number.isSafeInteger(access.resetAtMs) && access.resetAtMs > 0;
}

/** Authorize every export, including renderer cache hits, through the existing match owner.
 *
 * I/O: in (request: Request, context: { params: Promise<{ id: string }> }) -> out Promise<Response>
 *
 * refs: none
 */
export async function matchImage(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{6,20}$/.test(id)) return errorResponse(400, "INVALID_MATCH_ID");
  try {
    const admission = await fetch(`${serverApiBase()}/matches/${id}?skipRecovery=true`, {
      headers: callerHeaders(request), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    const body = await readBodyWithinLimit(admission.body, MAX_RESPONSE_BYTES);
    if (!body) return errorResponse(503, "MATCH_ACCESS_UNAVAILABLE");
    if (!admission.ok) {
      const headers = new Headers({ ...NO_STORE, "content-type": "application/json" });
      const retryAfter = admission.headers.get("retry-after");
      if (retryAfter) headers.set("retry-after", retryAfter);
      return new Response(new Uint8Array(body).buffer, { status: admission.status, headers });
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(body));
    if (!admittedMatch(payload, id)) {
      return record(payload) && payload.count === 0
        ? errorResponse(404, "MATCH_NOT_CACHED") : errorResponse(503, "MATCH_ACCESS_UNAVAILABLE");
    }
    const renderer = (process.env.PALADINSCAT_RENDER_URL ?? "http://127.0.0.1:3020").replace(/\/$/, "");
    const response = await fetch(`${renderer}/matches/${id}/image`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/png") {
      return errorResponse(503, "MATCH_IMAGE_UNAVAILABLE");
    }
    const image = await readBodyWithinLimit(response.body, MAX_RESPONSE_BYTES);
    if (!image) return errorResponse(503, "MATCH_IMAGE_UNAVAILABLE");
    return new Response(new Uint8Array(image).buffer, { headers: { ...NO_STORE, "content-type": "image/png" } });
  } catch {
    return errorResponse(503, "MATCH_ACCESS_UNAVAILABLE");
  }
}
