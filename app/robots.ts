/** Advertise both public sitemaps while preserving existing crawler exclusions.
 * Robots directives never replace account/verified admission or block SPA resources.
 * refs: doc: 06-reference-seo · see: lib/sitemap-data.ts
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Return existing crawl exclusions and both absolute public sitemap URLs.
 * I/O: none -> MetadataRoute.Robots; no access changes or side effects.
 * refs: doc: 06-reference-seo · endpoints: /robots.txt
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/auth/",
          "/search",
          "/stats/player/",
        ],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap-google.xml`],
  };
}
