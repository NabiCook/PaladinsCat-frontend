/**
 * Render the /players/levels/account route with `PlayerLevelLeaderboard`.
 * refs: none
 */
import PlayerLevelLeaderboard from "@/components/player-level-leaderboard";

/**
 * Render the /players/levels/account route with `PlayerLevelLeaderboard`.
 * I/O types: `none -> JSX.Element`.
 * refs: doc: documents/02-technical/security/auth.md
 */
export default function AccountLevelLeaderboardPage() {
  return <PlayerLevelLeaderboard mode="account" />;
}
