/**
 * Render the SupportDiffPage view for the player support-diff page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import PerformanceDiffDirectory from "@/components/performance-diff-directory";

/**
 * Render the SupportDiffPage view for the player support-diff page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function SupportDiffPage() {
  return <PerformanceDiffDirectory metric="support-diff" />;
}
