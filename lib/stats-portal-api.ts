/** Read the bounded, public directory contract; never request protected detail as a fallback.
 *
 * refs: none
 */
import { fetchJson, mapStatsPageData, type MatchHourlyStats } from "@/lib/api-client";
import { mapChampionMatchupPreviews, type RawChampionMatchupPreviews } from "@/lib/champion-matchups-api";

interface RawPortalPreview {
  page: unknown | null;
  skins: unknown[] | null;
  loadoutChampions: Array<{ championId: number; championName: string; totalPlays: number }> | null;
  matchups: RawChampionMatchupPreviews | null;
  presence: { public_players: number } | null;
  presenceHourly: { hourly_by_region: Array<{ date: string; hour: number; total: number }> } | null;
  activity: MatchHourlyStats | null;
}

/** Fetch the bounded public stats-portal preview (directory data, not protected detail).
 *
 * I/O: in (tier: { tierMin?: number; tierMax?: number }, signal: AbortSignal) -> out stats portal preview
 *
 * refs: none
 */
export async function fetchStatsPortalPreview(tier: { tierMin?: number; tierMax?: number }, signal: AbortSignal) {
  const query = new URLSearchParams();
  if (tier.tierMin != null) query.set("tierMin", String(tier.tierMin));
  if (tier.tierMax != null) query.set("tierMax", String(tier.tierMax));
  const raw = await fetchJson<RawPortalPreview>(`/stats/portal-preview?${query}`, { signal, retries: 2, timeoutMs: 35_000, unwrapData: false });
  return {
    data: raw.page == null ? null : mapStatsPageData(raw.page),
    skins: mapStatsPageData({ skins: raw.skins ?? [] }).skins,
    loadoutChampions: raw.loadoutChampions ?? [],
    matchups: raw.matchups == null ? null : mapChampionMatchupPreviews(raw.matchups),
    presence: raw.presence,
    presenceHourly: raw.presenceHourly,
    activity: raw.activity ?? null,
  };
}
