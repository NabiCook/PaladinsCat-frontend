/**
 * Render the /players/elo/champion route with `ChampionEloPage`.
 * refs: none
 */
import ChampionEloPage from "../page";

/**
 * Render the /players/elo/champion route with `ChampionEloPage`.
 * I/O types: `none -> JSX.Element`.
 * refs: none
 */
export default function ChampionEloLeaderboardPage() {
  return <ChampionEloPage mode="champion" />;
}
