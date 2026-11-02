/**
 * Render the layout for the player private-accounts layout route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import { createLocalizedMetadata } from "@/lib/server-localization";

/**
 * Build SEO metadata for the player private-accounts layout route.
 * refs: none
 * I/O types: `none -> Promise<Metadata>`.
 */
export async function generateMetadata() {
  return createLocalizedMetadata("seo.players.private.title", {
    descriptionKey: "seo.players.private.description",
    metadata: { alternates: { canonical: "/players/private-accounts" } },
  });
}

/**
 * Render the layout for the player private-accounts layout route.
 * refs: none
 * I/O types: `{ children }: { children: React.ReactNode } -> ReactNode`.
 */
export default function PrivateAccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
