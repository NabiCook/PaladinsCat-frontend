/** Own the canonical public crawl inventory shared by both sitemap endpoints.
 * Source URLs from current content routes, the checked-in roster and blog owner.
 * Never infer public access from a prefix or manufacture modification dates.
 * refs: doc: 06-reference-seo · see: lib/verified-access.ts · lib/blog.ts
 */
import type { MetadataRoute } from "next";
import { getAllPosts, getPostLink } from "./blog";
import { SITE_URL } from "./seo";
import { STATIC_CHAMPIONS } from "./static-champions";
import { championSlug } from "./utils";
import { isAccountOnlyPath, isVerifiedOnlyPath } from "./verified-access";

const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/champions", changeFrequency: "hourly", priority: 0.95 },
  { path: "/matches", changeFrequency: "hourly", priority: 0.85 },
  { path: "/blog", changeFrequency: "daily", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.45 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  { path: "/localization", changeFrequency: "monthly", priority: 0.45 },
  { path: "/changelog", changeFrequency: "daily", priority: 0.6 },
  { path: "/features", changeFrequency: "daily", priority: 0.7 },
  { path: "/operations/paladinscat-bot", changeFrequency: "monthly", priority: 0.6 },
  { path: "/operations/stats", changeFrequency: "hourly", priority: 0.5 },
];

/** Resolve only inventoried public content to a production canonical URL.
 * I/O: exact encoded pathname -> Promise<string | null>; blog reads use its owner.
 * Unknown content and protected routes fail closed; no caller origin is accepted.
 * refs: doc: 06-reference-seo · see: proxy.ts
 */
export async function publicDocumentCanonical(path: string): Promise<string | null> {
  if (isVerifiedOnlyPath(path) || isAccountOnlyPath(path)) return null;
  if (STATIC_ROUTES.some(route => route.path === path)
    || STATIC_CHAMPIONS.some(champion => path === `/champions/${championSlug(champion.name)}`)) {
    return `${SITE_URL}${path}`;
  }
  if (path.startsWith("/blog/") && (await getAllPosts()).some(post => getPostLink(post.slug) === path)) {
    return `${SITE_URL}${path}`;
  }
  return null;
}

/** Build both sitemap payloads from current public content, without network writes.
 * I/O: none -> Promise<MetadataRoute.Sitemap>; blog owner handles cache/failures.
 * refs: doc: 06-reference-seo · endpoints: /sitemap.xml · /sitemap-google.xml
 */
export async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    ...STATIC_ROUTES.map(({ path, ...metadata }) => ({ url: `${SITE_URL}${path}`, ...metadata })),
    ...STATIC_CHAMPIONS.map(champion => ({
      url: `${SITE_URL}/champions/${championSlug(champion.name)}`,
      changeFrequency: "daily" as const, priority: 0.78,
    })),
    ...(await getAllPosts()).map(post => ({
      url: `${SITE_URL}${getPostLink(post.slug)}`,
      changeFrequency: "monthly" as const, priority: 0.7,
    })),
  ];
  const seen = new Set<string>();
  return entries.filter(entry => {
    const path = new URL(entry.url).pathname;
    if (isVerifiedOnlyPath(path) || isAccountOnlyPath(path) || seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
