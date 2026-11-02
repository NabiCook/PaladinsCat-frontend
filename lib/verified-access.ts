/** Owns verified routing and the optional global invitation requirement.
 *
 * refs: none
 */

const LEGACY_STATS_PATHS = ["/game/items", "/game/maps", "/game/compositions"] as const;
const VERIFIED_PORTALS = ["/stats", "/players"] as const;
const ACCOUNT_PORTALS = ["/community", "/builds", "/tierlists", "/account", "/link-account", "/operations/tickets"] as const;

type AccessUser = { linkedPlayerId?: number | null; invitationActive?: boolean; invitationRequired?: boolean; invitationExpiresAt?: string | null };

/** Cached display identity never substitutes for a current invitation grant.
 *
 * I/O: in (user: AccessUser | null) -> out boolean
 *
 * refs: none
 */
export function hasStatsAccess(user: AccessUser | null): boolean {
  return user != null && user.linkedPlayerId != null && (user.invitationRequired === false || (user.invitationActive === true
    && (user.invitationExpiresAt == null || Date.parse(user.invitationExpiresAt) > Date.now())));
}

/** Base profiles keep limited account access until invitation enforcement is enabled.
 *
 * I/O: in (path: string) -> out boolean
 *
 * refs: none
 */
export function isLimitedProfilePath(path: string): boolean {
  return /^\/players\/[1-9]\d*\/?$/.test(path.split(/[?#]/, 1)[0]);
}

/** Identify every Community-menu route that requires a signed-in account.
 *
 * I/O: in (path: string) -> out boolean
 *
 * refs: none
 */
export function isAccountOnlyPath(path: string): boolean {
  return isLimitedProfilePath(path) || ACCOUNT_PORTALS.some((portal) => path === portal || path.startsWith(`${portal}/`));
}

/** Return the requested Community destination once browser authentication is known.
 *
 * I/O: in (requestedPath: string, user: AccessUser | null, isLoading: boolean) -> out string | null
 *
 * refs: none
 */
export function accountDestination(requestedPath: string, user: AccessUser | null, isLoading: boolean): string | null {
  if (isLoading) return null;
  if (!user) return `/auth/login?redirect=${encodeURIComponent(requestedPath)}`;
  return isVerifiedOnlyPath(requestedPath.split(/[?#]/, 1)[0])
    ? verifiedDestination(requestedPath, user, false) : requestedPath;
}

/** Identify directory roots and detail routes that require verification.
 *
 * I/O: in (path: string) -> out boolean
 *
 * refs: none
 */
export function isVerifiedOnlyPath(path: string): boolean {
  if (isLimitedProfilePath(path)) return true;
  if (["/community", "/builds", "/tierlists", "/operations/tickets"].some((portal) => path === portal || path.startsWith(`${portal}/`))) return true;
  if (VERIFIED_PORTALS.some((portal) => path === portal || path.startsWith(`${portal}/`))) return true;
  return LEGACY_STATS_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Return the allowed gated destination once browser authentication is known.
 *
 * I/O: in (requestedPath: string, user: AccessUser | null, isLoading: boolean) -> out string | null
 *
 * refs: none
 */
export function verifiedDestination(
  requestedPath: string,
  user: AccessUser | null,
  isLoading: boolean,
): string | null {
  if (isLoading) return null;
  if (!user) return `/auth/login?redirect=${encodeURIComponent(requestedPath)}`;
  if (!isVerifiedOnlyPath(requestedPath.split(/[?#]/, 1)[0])) return requestedPath;
  if (user.invitationRequired === false && isAccountOnlyPath(requestedPath.split(/[?#]/, 1)[0])) return requestedPath;
  if (user.linkedPlayerId == null) return "/link-account";
  if (!hasStatsAccess(user)) return "/account#invitation";
  return requestedPath;
}
