/**
 * Render the /players/elo/account route with `ChampionEloPage`.
 * refs: none
 */
import ChampionEloPage from "../page";

/**
 * Render the /players/elo/account route with `ChampionEloPage`.
 * I/O types: `none -> JSX.Element`.
 * refs: doc: documents/02-technical/security/auth.md
 */
export default function AccountEloPage() {
  return <ChampionEloPage mode="account" />;
}
