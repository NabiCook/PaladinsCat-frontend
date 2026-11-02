/** Server-confirmed Pro entitlement and navigation-only native compatibility.
 *
 * refs: none
 */
import { serverApiBase } from "./server-api";

/** The public PaladinsCat origin (the default browser surface).
 *
 * refs: none
 */
export const PUBLIC_ORIGIN = "https://paladinscat.com";

/** Native clients choose the cheaper public surface; this never grants access.
 *
 * I/O: in (headers: Headers) -> out boolean
 *
 * refs: none
 */
export function isWolper(headers: Headers): boolean {
  return [headers.get("user-agent"), headers.get("x-client-ua")]
    .some(agent => agent?.toLowerCase().includes("wolper"));
}

/** The global invitation rollout switch is not a Pro entitlement.
 *
 * I/O: in (value: unknown) -> out boolean
 *
 * refs: none
 */
export function hasProAccess(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const account = value as Record<string, unknown>;
  if (account.regulation_stage !== 0) return false;
  const rawPlayerId = account.linked_player_id;
  // PostgreSQL bigint IDs arrive as decimal strings in the real auth response.
  // Accept only their canonical, positive representation within the safe range.
  const linkedPlayerId = typeof rawPlayerId === "string" && /^[1-9][0-9]{0,15}$/.test(rawPlayerId)
    && String(Number(rawPlayerId)) === rawPlayerId ? Number(rawPlayerId) : rawPlayerId;
  if (typeof linkedPlayerId !== "number" || !Number.isSafeInteger(linkedPlayerId)
      || linkedPlayerId <= 0 || account.invitation_active !== true) return false;
  if (account.access_restriction != null) return false;
  if (account.access_restriction_kind != null && account.access_restriction_kind !== "") return false;
  if (account.invitation_expires_at != null
      && (typeof account.invitation_expires_at !== "string" || Date.parse(account.invitation_expires_at) <= Date.now()
        || !Number.isFinite(Date.parse(account.invitation_expires_at)))) return false;
  return true;
}

/** Revalidate an opaque application session with its Rust owner, without cached grants.
 *
 * I/O: in (token: string, incoming?: Headers) -> out Promise<boolean>
 *
 * refs: none
 */
export async function proveProSession(token: string, incoming?: Headers): Promise<boolean> {
  if (!token || token.length > 512) return false;
  try {
    const headers = new Headers({ accept: "application/json", authorization: `Bearer ${token}` });
    for (const key of ["cf-connecting-ip", "cf-ray", "user-agent"] as const) {
      const value = incoming?.get(key);
      if (value) headers.set(key, value);
    }
    const response = await fetch(`${serverApiBase()}/auth/me`, {
      headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2_500),
    });
    return response.ok && hasProAccess(await response.json());
  } catch {
    return false;
  }
}
