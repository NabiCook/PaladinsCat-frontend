/**
 * Render the PlayersPage view for the player page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import {
  mapPlayersOverviewResponse,
  type PlayersOverview,
} from "@/lib/api-client";
import PlayersPageClient from "./players-page-client";

/**
 * Build SEO metadata for the player page route.
 * Returns: `Metadata`
 * refs: none
 */
export const metadata: Metadata = {
  alternates: { canonical: "/players" },
};


// User-facing error keys — resolved at the UI layer via t()
/**
 * Define translation keys for failures in the player page view.
 * Returns the stable key map consumed by localized error messages.
 * refs: none
 */
const PLAYERS_ERROR_KEYS = {
  overviewConfigUnavailable: "generated.players.overviewConfigUnavailable",
  overviewUnavailable: "generated.players.overviewUnavailable",
} as const;

const getCachedPlayersOverview = unstable_cache(
  async (): Promise<PlayersOverview> => {
    const apiBase = (
      process.env.NEXT_SERVER_API_URL
      || process.env.NEXT_PUBLIC_API_URL
      || "http://localhost:3304"
    ).replace(/\/+$/, "");

    if (apiBase.startsWith("/")) {
      throw new Error(PLAYERS_ERROR_KEYS.overviewConfigUnavailable);
    }

    const response = await fetch(`${apiBase}/players/overview`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(PLAYERS_ERROR_KEYS.overviewUnavailable);
    }

    return mapPlayersOverviewResponse(await response.json());
  },
  ["players-overview-v2"],
  {
    revalidate: 300,
    tags: ["players-overview"],
  },
);

// Render HTML per request, but resolve the expensive data from Next's shared
// five-minute server cache. This avoids build-time API access and removes the
// client hydration fetch that previously caused the visible loading delay.
/**
 * Select dynamic rendering for the player page route.
 * Returns the framework rendering mode constant used by this route.
 * refs: none
 */
export const dynamic = "force-dynamic";

/**
 * Render the PlayersPage view for the player page route.
 * refs: none
 * I/O types: `none -> Promise<JSX.Element>`.
 */
export default async function PlayersPage() {
  let initialOverview: PlayersOverview | null = null;
  try {
    initialOverview = await getCachedPlayersOverview();
  } catch (error) {
    console.error("[players] Server overview fetch failed; using browser fallback", error);
  }

  return <PlayersPageClient initialOverview={initialOverview} />;
}
