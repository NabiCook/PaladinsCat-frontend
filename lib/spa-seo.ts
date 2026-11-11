/** Render SEO-only variants of the existing public SPA shell before JavaScript.
 * The on-disk/raw document stays noindex. Preserve every UI/script byte and
 * never grant indexability to a URL absent from the canonical public inventory.
 * refs: doc: 06-reference-seo · see: proxy.ts · lib/sitemap-data.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicDocumentCanonical } from "./sitemap-data";

/** Return a public SEO shell, or null to retain the default noindex rewrite.
 * I/O: exact pathname -> Promise<string | null>; reads the unchanged shell file.
 * No authentication changes, HTML subrequests or client-side SEO patching occur.
 * refs: doc: 06-reference-seo · see: public/app/index.html
 */
export async function renderPublicSpaHtml(path: string): Promise<string | null> {
  const canonical = await publicDocumentCanonical(path);
  if (!canonical) return null;
  const template = readFileSync(join(process.cwd(), "public", "app", "index.html"), "utf8");
  const escaped = canonical.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return template.replace('<meta name="robots" content="noindex, nofollow">',
    `<meta name="robots" content="index, follow">\n  <link rel="canonical" href="${escaped}">`);
}
