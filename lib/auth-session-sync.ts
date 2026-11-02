/** Storage carries session transitions, not an instruction to echo display caches.
 *
 * refs: none
 */

/** Decide whether a storage session event forces a display-cache revalidation.
 *
 * I/O: in (event: { key, oldValue, newValue: string | null }, confirmedUserId: number | null) -> out boolean
 *
 * refs: none
 */
export function shouldRevalidateStoredSession(
  event: { key: string | null; oldValue: string | null; newValue: string | null },
  confirmedUserId: number | null,
): boolean {
  if (event.key === null) return true;
  if (event.oldValue === event.newValue) return false;
  if (event.key === "pc_auth_token") return true;
  if (event.key !== "pc_auth_user") return false;
  if (event.newValue === null) return true;
  try {
    const cached: unknown = JSON.parse(event.newValue);
    if (!cached || typeof cached !== "object" || !("id" in cached)
      || typeof cached.id !== "number" || !Number.isSafeInteger(cached.id)) return false;
    // Only the server can confirm the identity or entitlement of another user.
    // Same-account cache field changes are display updates across releases.
    return cached.id !== confirmedUserId;
  } catch {
    return false;
  }
}
