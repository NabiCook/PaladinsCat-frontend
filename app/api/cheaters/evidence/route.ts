/**
 * Stream evidence-list reads and multipart submissions to the internal API.
 *
 * The shared rewrite answers the collection too slowly for a five-image upload
 * because AVIF generation runs synchronously before the report is durable, so
 * this focused route preserves the request stream. Reads relay query and session
 * context unchanged; every other API route keeps the shared rewrite.
 *
 * refs: GET /cheaters/evidence · POST /cheaters/evidence · migrations: 166
 */
import { NextRequest, NextResponse } from "next/server";

/**
 * Select the Node.js runtime for this route handler.
 * refs: none
 */
export const runtime = "nodejs";
/**
 * Allow up to 180 seconds for the evidence proxy request.
 * refs: none
 */
export const maxDuration = 180;

const FORWARDED_REQUEST_HEADERS = ["accept", "authorization", "content-type", "x-csrf-token", "origin", "x-forwarded-proto"] as const;
const FORWARDED_RESPONSE_HEADERS = ["cache-control", "content-type"] as const;

/** Resolve the backend base address from the server-only runtime setting. */
function backendBase(): string {
  return (process.env.NEXT_SERVER_API_URL || "http://localhost:3005").replace(/\/$/, "");
}

/** Copy the narrow header allowlist required by evidence reads and uploads. */
function forwardRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // OIDC sessions live in an HttpOnly cookie rather than a browser bearer token.
  // Preserve the backend identity owner's cookie contract without forwarding
  // unrelated browser cookies.
  const cookies = ["__Host-pc_session", "__Host-pc_csrf"]
    .map((name) => request.cookies.get(name))
    .filter((cookie) => cookie?.value)
    .map((cookie) => `${cookie!.name}=${cookie!.value}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  return headers;
}

/** Relay the collection endpoint without buffering multipart image bytes. */
async function forwardEvidence(request: NextRequest): Promise<NextResponse> {
  const target = new URL(`${backendBase()}/cheaters/evidence`);
  target.search = request.nextUrl.search;
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers: forwardRequestHeaders(request),
    cache: "no-store",
    duplex: "half",
    ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: request.body }),
  };
  try {
    const upstream = await fetch(target, init);
    const headers = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return new NextResponse("Evidence service is unavailable", { status: 502 });
  }
}

/**
 * Relay the evidence collection read; the query string carries the published
 * filters and the backend applies its own Read/Verified/Admin contract.
 * I/O types: `request: NextRequest -> Promise<NextResponse>`.
 * refs: GET /cheaters/evidence
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return forwardEvidence(request);
}

/**
 * Proxy evidence submissions, including multipart bodies, to the backend through forwardEvidence; forward session and CSRF context and preserve the backend response status.
 * I/O types: `request: NextRequest -> Promise<NextResponse>`.
 * refs: none
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return forwardEvidence(request);
}
