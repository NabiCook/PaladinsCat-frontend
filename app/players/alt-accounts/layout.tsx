/**
 * Render the layout for the player alt-accounts layout route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import { createCanonicalMetadata } from "@/lib/canonical-metadata";
/**
 * Build SEO metadata for the player alt-accounts layout route.
 * Returns: `Metadata`
 * refs: none
 */
export const metadata = createCanonicalMetadata("/players/alt-accounts");
/**
 * Render the layout for the player alt-accounts layout route.
 * refs: none
 * I/O types: `{ children }: { children: React.ReactNode } -> ReactNode`.
 */
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
