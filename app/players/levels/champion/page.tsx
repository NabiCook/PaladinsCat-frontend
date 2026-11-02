/**
 * Render the /players/levels/champion route with `PlayerLevelLeaderboard`.
 * refs: none
 */
import PlayerLevelLeaderboard from "@/components/player-level-leaderboard";

/**
 * Render the /players/levels/champion route with `PlayerLevelLeaderboard`.
 * I/O types: `none -> JSX.Element`.
 * refs: none
 */
export default function ChampionLevelLeaderboardPage() {
  return <PlayerLevelLeaderboard mode="champion" />;
}
