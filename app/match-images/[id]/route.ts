/**
 * Caller-bound match admission precedes both fresh and cached exports.
 *
 * refs: none
 */
import { matchImage } from "../../../lib/match-image";

/** Next.js route data mode: always resolve fresh per request. refs: none */
export const dynamic = "force-dynamic";

/** GET: export a caller-bound match image (fresh or cached). refs: none */
export const GET = matchImage;
