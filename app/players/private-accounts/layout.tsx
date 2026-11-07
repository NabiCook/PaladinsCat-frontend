/**
 * Render the layout for the MCTS private account DB route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import { createLocalizedMetadata } from "@/lib/server-localization";

/**
 * Build SEO metadata for the MCTS private account DB route.
 * refs: none
 * I/O types: `none -> Promise<Metadata>`.
 */
export async function generateMetadata() {
  return createLocalizedMetadata("seo.players.mctsPrivate.title", {
    descriptionKey: "seo.players.mctsPrivate.description",
    metadata: { alternates: { canonical: "/players/private-accounts" } },
  });
}

/**
 * Render the MCTS private account DB layout.
 * refs: none
 * I/O types: `{ children }: { children: React.ReactNode } -> ReactNode`.
 */
export default function PrivateAccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
