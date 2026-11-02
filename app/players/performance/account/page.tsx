/**
 * Render the /players/performance/account route with `PerformanceLeaderboardPage`.
 * refs: none
 */
import PerformanceLeaderboardPage from "../page";

/**
 * Render the /players/performance/account route with `PerformanceLeaderboardPage`.
 * I/O types: `none -> JSX.Element`.
 * refs: doc: documents/02-technical/security/auth.md
 */
export default function AccountPerformanceLeaderboardPage() {
  return <PerformanceLeaderboardPage mode="account" />;
}
