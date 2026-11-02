/**
 * Stream community post reads and multipart submissions to the internal API.
 * The normal Next rewrite has a short upstream-response timeout, while image
 * conversion is synchronous before a post becomes durable. Keep this route
 * aligned with the evidence upload proxy so the request body is streamed and
 * the backend has time to store the original and generated AVIF.
 * refs: endpoints: GET /community/posts · endpoints: POST /community/posts · migrations: 177
 */
import { NextRequest, NextResponse } from "next/server";

/**
 * Select the Node.js runtime for the streaming proxy.
 * refs: none
 */
export const runtime = "nodejs";
/**
 * Allow synchronous image conversion to complete before the proxy expires.
 * refs: none
 */
export const maxDuration = 180;

const FORWARDED_REQUEST_HEADERS = ["accept", "authorization", "content-type", "x-csrf-token", "origin", "x-forwarded-proto"] as const;
const FORWARDED_RESPONSE_HEADERS = ["cache-control", "content-type", "retry-after"] as const;

/** Resolve the backend base address from the server-only runtime setting. */
function backendBase(): string {
  return (process.env.NEXT_SERVER_API_URL || "http://localhost:3005").replace(/\/$/, "");
}

/** Copy the narrow header allowlist required by community reads and uploads. */
function forwardRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // OIDC sessions live in an HttpOnly cookie rather than a browser bearer
  // token. Forward only the identity and CSRF cookies required by the backend.
  const cookies = ["__Host-pc_session", "__Host-pc_csrf"]
    .map((name) => request.cookies.get(name))
    .filter((cookie) => cookie?.value)
    .map((cookie) => `${cookie!.name}=${cookie!.value}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  return headers;
}

/** Relay the collection endpoint without buffering multipart image bytes. */
async function forwardCommunityPosts(request: NextRequest): Promise<NextResponse> {
  const target = new URL(`${backendBase()}/community/posts`);
  target.search = request.nextUrl.search;
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers: forwardRequestHeaders(request),
    cache: "no-store",
    duplex: "half",
    ...(request.method === "GET" ? {} : { body: request.body }),
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
    return new NextResponse("Community service is unavailable", { status: 502 });
  }
}

/**
 * Proxy community post listing reads to the backend.
 * I/O: in `request: NextRequest` -> out `Promise<NextResponse>`.
 *
 * refs: endpoints: GET /community/posts
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return forwardCommunityPosts(request);
}

/**
 * Proxy community post creation, including multipart image bodies.
 * I/O: in `request: NextRequest` -> out `Promise<NextResponse>`.
 *
 * refs: endpoints: POST /community/posts
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return forwardCommunityPosts(request);
}
