/**
 * Render the layout for the player parties layout route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import { createLocalizedMetadata } from "@/lib/server-localization";

/**
 * Build SEO metadata for the player parties layout route.
 * refs: none
 * I/O types: `none -> Promise<Metadata>`.
 */
export async function generateMetadata() {
  return createLocalizedMetadata("seo.players.parties.title", {
    descriptionKey: "seo.players.parties.description",
    metadata: { alternates: { canonical: "/players/parties" } },
  });
}

/**
 * Render the layout for the player parties layout route.
 * refs: none
 * I/O types: `{ children }: { children: React.ReactNode } -> ReactNode`.
 */
export default function RankedPartiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
