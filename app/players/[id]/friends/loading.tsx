/** Preserve the friends route layout while navigation resolves.
 * refs: doc: documents/06-reference/design/frontend-async-ui.md
 */
import { RouteSkeleton } from "@/components/route-skeleton";

/** Render initial route skeleton. I/O: no inputs -> React.JSX.Element.
 * refs: see: components/route-skeleton.tsx
 */
export default function Loading() { return <RouteSkeleton variant="list" />; }
