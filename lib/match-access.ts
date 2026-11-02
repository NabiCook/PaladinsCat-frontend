/** Own the frontend projection of the backend match-access tier.
 *
 * refs: none
 */

/** The match-access tier a viewer is authenticated at.
 *
 * refs: none
 */
export type MatchAccessTier = "guest" | "account" | "verified";

/** Project a match-access tier into the frontend's tiered detail visibility.
 *
 * I/O: in (tier: MatchAccessTier) -> out { loadouts: boolean; fullDetails: boolean }
 *
 * refs: none
 */
export function matchDetailSections(tier: MatchAccessTier) {
  return {
    // Two-tier visual model (2026-10-13): every tier sees loadouts; only
    // verified sees full details. Guest now absorbs the former unverified
    // (account) look — scoreboard + loadouts. The backend still distinguishes
    // guest vs account for daily-lookup rate limits (5 vs 50), which is unchanged.
    loadouts: true,
    fullDetails: tier === "verified",
  };
}
