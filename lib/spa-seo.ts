/** Progressively render inventoried public content inside the existing SPA shell.
 * The on-disk/raw document stays noindex. Public documents use source-owned
 * content and metadata before JavaScript; the client keeps its current UI.
 * refs: doc: 06-reference-seo · see: proxy.ts · lib/sitemap-data.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicDocumentCanonical } from "./sitemap-data";
import { escapePublicHtml, getPublicDocument } from "./public-document";

/** Return a public document, or null to retain the excluded fallback.
 * I/O: exact pathname -> Promise<string | null>; no HTML subrequests or user data.
 * Source failure rejects so the proxy can return a temporary 503.
 * refs: doc: 06-reference-seo · see: public/app/index.html
 */
export async function renderPublicSpaHtml(path: string): Promise<string | null> {
  const canonical = await publicDocumentCanonical(path);
  if (!canonical) return null;
  const content = await getPublicDocument(path);
  if (!content) return null;
  const template = readFileSync(join(process.cwd(), "public", "app", "index.html"), "utf8");
  const initial = `<main class="discovery-page public-document" data-public-document aria-label="${escapePublicHtml(content.title)}"><article class="discovery-panel discovery-copy">${content.html}</article></main>`;
  return template.replace(/<title>[^<]*<\/title>/, `<title>${escapePublicHtml(content.title)}</title>`)
    .replace('<meta name="robots" content="noindex, nofollow">',
      `<meta name="robots" content="index, follow">\n  <meta name="description" content="${escapePublicHtml(content.description)}">\n  <link rel="canonical" href="${escapePublicHtml(canonical)}">\n  <link rel="stylesheet" href="/app/discovery-public-document.css?v=1">`)
    .replace('data-view="dashboard"', 'data-view="public-document" data-dynamic-page="true"')
    .replace('<div class="page-view-stack">', `<div class="page-view-stack">${initial}`)
    .replace(/(src="\/app\/discovery-app\.js[^"\s]*)/, "$1&publicDocument=1");
}
