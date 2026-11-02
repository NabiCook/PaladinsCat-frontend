/**
 * Render the TheNoobPage view for the player the-noob page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import PerformanceDiffDirectory from "@/components/performance-diff-directory";

/**
 * Render the TheNoobPage view for the player the-noob page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function TheNoobPage() {
  return <PerformanceDiffDirectory metric="the-noob" />;
}
