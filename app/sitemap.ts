/** Serve the standard sitemap from the shared canonical public inventory.
 * Access policy and content discovery stay with their existing owners.
 * refs: doc: 06-reference-seo · see: lib/sitemap-data.ts
 */
import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/sitemap-data";

/** Refresh the generated XML alongside the blog owner's five-minute cache.
 * I/O: none -> seconds; no side effects.
 * refs: doc: 06-reference-seo
 */
export const revalidate = 300;

/** Return public canonical entries for Next's sitemap XML serializer.
 * I/O: none -> Promise<MetadataRoute.Sitemap>; no access or data writes.
 * refs: doc: 06-reference-seo · endpoints: /sitemap.xml
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
