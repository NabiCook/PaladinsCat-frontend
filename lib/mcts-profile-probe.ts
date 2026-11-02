/** Probe whether a player id has an MCTS capture behind the public profile 404.
 * The public API answers "Player not found" for both unknown players and
 * accounts the Hi-Rez API hides, so the capture endpoint is the only signal.
 * refs: endpoints: GET /players/{id}/mcts-profile, GET /players/{id}
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
const PROBE_TIMEOUT_MS = 20_000;

/**
 * Report whether the capture endpoint returns a profile for this id.
 * Redirect callers only on a 200; every other outcome is a plain "no".
 * I/O: in `id: string` -> out `Promise<boolean>`
 * refs: endpoints: GET /players/{id}/mcts-profile
 */
export async function hasMctsPrivateProfile(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const response = await fetch(`${API_BASE}/players/${encodeURIComponent(id)}/mcts-profile`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
