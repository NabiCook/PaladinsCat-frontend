/**
 * Render the WeirdosPage view for the player weirdos page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import CommunityVoteLeaderboard from "@/components/CommunityVoteLeaderboard";

/**
 * Render the WeirdosPage view for the player weirdos page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function WeirdosPage() {
  return <CommunityVoteLeaderboard kind="weirdo" />;
}
