/** Serve Google's alternate XML URL from the same public inventory as /sitemap.xml.
 * No user-specific data or access decisions belong in this cached response.
 * refs: doc: 06-reference-seo · see: lib/sitemap-data.ts · app/sitemap.ts
 */
import { getSitemapEntries } from "@/lib/sitemap-data";

/** Refresh XML with the standard sitemap and blog cache cadence.
 * I/O: none -> seconds; no side effects.
 * refs: doc: 06-reference-seo
 */
export const revalidate = 300;

const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
})[character]!);

/** Return UTF-8 sitemap XML with absolute canonical URLs and no invented dates.
 * I/O: GET -> Promise<Response>; reads the shared public content inventory only.
 * refs: doc: 06-reference-seo · endpoints: /sitemap-google.xml
 */
export async function GET(): Promise<Response> {
  const entries = await getSitemapEntries();
  const urls = entries.map(entry => `<url>\n<loc>${escapeXml(entry.url)}</loc>\n`
    + (entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>\n` : "")
    + (typeof entry.priority === "number" ? `<priority>${entry.priority}</priority>\n` : "")
    + "</url>\n").join("");
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n', {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
