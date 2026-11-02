/**
 * Render the MasterFeedingPage view for the player master-feeding page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import MasterFeedingDirectory from "@/components/master-feeding-directory";

/**
 * Render the MasterFeedingPage view for the player master-feeding page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function MasterFeedingPage() {
  return <MasterFeedingDirectory />;
}
