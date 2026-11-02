/**
 * Build the crawlable sitemap from canonical static and content routes.  Returns: `Promise<React.JSX.Element>`. · refs: none
 * refs: none
 */
import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { SITE_URL } from "@/lib/seo";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";
import { championSlug } from "@/lib/utils";
import { getAllPosts, getPostLink } from "@/lib/blog";
import { isAccountOnlyPath, isVerifiedOnlyPath } from "@/lib/verified-access";

const PLAYER_ROLES = ["frontline", "damage", "flank", "support"] as const;
// These URLs remain useful after a map leaves rotation because their historic
// ranked data remains available. Keep this curated list small and canonical.
const RANKED_MAPS = [
  "Ranked Ascension Peak",
  "Ranked Bazaar",
  "Ranked Brightmarsh",
  "Ranked Frog Isle",
  "Ranked Ice Mines",
  "Ranked Jaguar Falls",
  "Ranked Serpent Beach",
  "Ranked Splitstone Quarry",
  "Ranked Stone Keep (Classic)",
  "Ranked Stone Keep V2 Night",
  "Ranked Warder's Gate",
] as const;

const staticRoutes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/champions", changeFrequency: "hourly", priority: 0.95 },
  { path: "/players", changeFrequency: "hourly", priority: 0.9 },
  { path: "/matches", changeFrequency: "hourly", priority: 0.85 },
  { path: "/game/items", changeFrequency: "daily", priority: 0.9 },
  { path: "/game/maps", changeFrequency: "daily", priority: 0.9 },
  { path: "/game/compositions", changeFrequency: "hourly", priority: 0.9 },
  { path: "/players/leaderboard", changeFrequency: "hourly", priority: 0.85 },
  { path: "/players/elo", changeFrequency: "hourly", priority: 0.85 },
  { path: "/players/performance", changeFrequency: "hourly", priority: 0.85 },
  { path: "/stats", changeFrequency: "weekly", priority: 0.9 },
  { path: "/stats/skins", changeFrequency: "daily", priority: 0.8 },
  { path: "/stats/performance", changeFrequency: "hourly", priority: 0.9 },
  { path: "/stats/ecpm", changeFrequency: "hourly", priority: 0.85 },
  { path: "/stats/activity", changeFrequency: "hourly", priority: 0.8 },
  { path: "/stats/activity/details", changeFrequency: "hourly", priority: 0.7 },
  { path: "/stats/tiers", changeFrequency: "hourly", priority: 0.8 },
  { path: "/stats/loadouts", changeFrequency: "daily", priority: 0.75 },
  { path: "/builds", changeFrequency: "daily", priority: 0.8 },
  { path: "/community", changeFrequency: "daily", priority: 0.8 },
  { path: "/community/diminishing-returns", changeFrequency: "weekly", priority: 0.8 },
  { path: "/tierlists", changeFrequency: "daily", priority: 0.8 },
  { path: "/blog", changeFrequency: "daily", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.45 },
];

const getCachedBlogPosts = unstable_cache(getAllPosts, ["sitemap-blog-posts"], {
  revalidate: 3600,
});

/**
 * Build the crawlable sitemap from canonical static and content routes.  Returns: `Promise<React.JSX.Element>`. · refs: none
 * I/O types: `none -> Promise<MetadataRoute.Sitemap>`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = staticRoutes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const championEntries = STATIC_CHAMPIONS.map((champion) => ({
    url: `${SITE_URL}/champions/${championSlug(champion.name)}`,
    changeFrequency: "daily" as const,
    priority: 0.78,
  }));

  const roleEntries = PLAYER_ROLES.map((role) => ({
    url: `${SITE_URL}/players/class/${role}`,
    changeFrequency: "daily" as const,
    priority: 0.72,
  }));

  const mapEntries = RANKED_MAPS.map((mapName) => ({
    url: `${SITE_URL}/game/maps/${encodeURIComponent(mapName)}`,
    changeFrequency: "weekly" as const,
    priority: 0.68,
  }));

  const blogEntries = (await getCachedBlogPosts()).map((post) => ({
    url: `${SITE_URL}${getPostLink(post.slug)}`,
    lastModified: post.publishedAt,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const entries = [...staticEntries, ...championEntries, ...roleEntries, ...mapEntries, ...blogEntries];
  return entries.filter((entry) => {
    const path = new URL(entry.url).pathname;
    return !isVerifiedOnlyPath(path) && !isAccountOnlyPath(path);
  });
}
