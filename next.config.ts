/** next.config component/module.
 * Owns the UI behavior implemented in this file; data and side effects remain within its existing boundaries.
 * refs: none
 */
import type { NextConfig } from "next";

const apiDestination =
  process.env.NEXT_SERVER_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://paladinscat.com/api";

const nextConfig: NextConfig = {
  output: undefined,
  // A local proxy instance can run beside another Next dev server without
  // contending for its .next/dev lock. Production keeps the normal .next path.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Production builds on the local desktop can fan out to many workers, but
    // the VPS runs the whole Docker stack in a 2GB budget. Keep static
    // generation conservative by default; raise NEXT_BUILD_CPUS locally when
    // intentionally benchmarking or building on a larger machine.
    cpus: Number(process.env.NEXT_BUILD_CPUS || 2),
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      // The dashboard bundle moved from /drafts to /app. The old draft URL is
      // retired; inbound links land on the dashboard shell instead.
      { source: "/drafts", destination: "/", permanent: false },
      { source: "/drafts/:path*", destination: "/", permanent: false },
      { source: "/stats/platforms", destination: "/stats/activity#platforms", permanent: true },
      { source: "/stats/regions", destination: "/stats/activity#regions", permanent: true },
      { source: "/stats/metrics", destination: "/stats/performance", permanent: true },
      { source: "/stats/winrate", destination: "/stats/performance#champion-averages", permanent: true },
      { source: "/stats/banrate", destination: "/stats/performance#champion-averages", permanent: true },
      { source: "/stats/egpm", destination: "/stats/ecpm", permanent: true },
      { source: "/stats/items/:path*", destination: "/game/items/:path*", permanent: true },
      { source: "/stats/maps/:path*", destination: "/game/maps/:path*", permanent: true },
      { source: "/stats/compositions", destination: "/game/compositions", permanent: true },
      { source: "/players/stats/:metric", destination: "/players/performance", permanent: true },
      // The id-based activity tracker was renamed to /players/private-tracking so the
      // MCTS-backed Private Account DB can own /players/private-accounts. Kept
      // temporary: the new database page publishes its own routes and drops these.
      { source: "/players/private-accounts", destination: "/players/private-tracking", permanent: false },
      { source: "/players/private-accounts/:id(\\d+)", destination: "/players/private-tracking/:id", permanent: false },
    ];
  },
  async rewrites() {
    // Frontend page routes — must come BEFORE the catch-all
    const pages = [
      "/players/elo",
      "/players/leaderboard",
      "/players/weirdos",
      "/players/hall-of-fame",
      "/players/class/:role",
    ];
    return {
      beforeFiles: pages.map((src) => ({ source: src, destination: src })),
      // App-owned API handlers, including dynamic review routes, must match
      // before unmatched API paths fall through to the backend.
      fallback: [
        { source: "/api/:path*", destination: `${apiDestination}/:path*` },
        // Champion page bundles use a neutral route because some embedded
        // browsers block navigations/fetches under /api.
        { source: "/_pc/:path*", destination: `${apiDestination}/:path*` },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=14400, s-maxage=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      {
        source: "/_pc/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },
};

/** Provide this exported item.
 * Contract: accepts the parameters shown in the signature and returns the declared value; side effects follow the implementation.
 * refs: none
 */
export default nextConfig;
