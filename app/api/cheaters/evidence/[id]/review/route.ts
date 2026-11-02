/**
 * Forward an authenticated administrator evidence decision to the internal API.
 *
 * refs: none
 */
import { NextRequest, NextResponse } from "next/server";

/** Next.js route runtime selector: run on the Node.js server runtime. refs: none */
export const runtime = "nodejs";

const FORWARDED_REQUEST_HEADERS = ["accept", "authorization", "content-type", "x-csrf-token", "origin", "x-forwarded-proto"] as const;
const FORWARDED_RESPONSE_HEADERS = ["cache-control", "content-type"] as const;

function backendBase(): string {
  return (process.env.NEXT_SERVER_API_URL || "http://localhost:3005").replace(/\/$/, "");
}

function forwardRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookies = ["__Host-pc_session", "__Host-pc_csrf"]
    .map((name) => request.cookies.get(name))
    .filter((cookie) => cookie?.value)
    .map((cookie) => `${cookie!.name}=${cookie!.value}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  return headers;
}

/**
 * Relay the review decision and preserve the backend authorization result.
 * I/O: in `(request: NextRequest, { params }: { params: Promise<{ id: string }> })` -> out `Promise<NextResponse>`.
 *
 * refs: endpoints: POST /cheaters/evidence/[id]/review
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const upstream = await fetch(`${backendBase()}/cheaters/evidence/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: forwardRequestHeaders(request),
      body: await request.text(),
      cache: "no-store",
    });
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
