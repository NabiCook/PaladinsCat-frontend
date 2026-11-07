/**
 * Render the layout for the player private-tracking layout route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import { createLocalizedMetadata } from "@/lib/server-localization";

/**
 * Build SEO metadata for the player private-tracking layout route.
 * refs: none
 * I/O types: `none -> Promise<Metadata>`.
 */
export async function generateMetadata() {
  return createLocalizedMetadata("seo.players.private.title", {
    descriptionKey: "seo.players.private.description",
    metadata: { alternates: { canonical: "/players/private-tracking" } },
  });
}

/**
 * Render the layout for the player private-tracking layout route.
 * refs: none
 * I/O types: `{ children }: { children: React.ReactNode } -> ReactNode`.
 */
export default function PrivateTrackingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
