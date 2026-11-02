/**
 * The neutral API alias uses the same session-read handler and burst budget.
 *
 * refs: none
 */
import { readAuthSession } from "@/lib/auth-session-read";

/** Next.js route runtime selector: run on the Node.js server runtime. refs: none */
export const runtime = "nodejs";

/** Next.js route data mode: always resolve fresh per request. refs: none */
export const dynamic = "force-dynamic";

/** GET: read the auth session via the shared session-read handler. refs: none */
export const GET = readAuthSession;
