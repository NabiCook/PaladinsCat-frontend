/**
 * Render the layout for the player afk-wintrade layout route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import { createCanonicalMetadata } from "@/lib/canonical-metadata";
/**
 * Build SEO metadata for the player afk-wintrade layout route.
 * Returns: `Metadata`
 * refs: none
 */
export const metadata = createCanonicalMetadata("/players/afk-wintrade");
/**
 * Render the layout for the player afk-wintrade layout route.
 * refs: none
 * I/O types: `{ children }: { children: React.ReactNode } -> ReactNode`.
 */
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
