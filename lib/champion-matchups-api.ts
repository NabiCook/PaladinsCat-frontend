/** Read ranked champion relationships from the rolling 30-day window.
 * refs: endpoints: GET /stats/champions/{champion_id}/matchups · migrations: 176
 */
import { fetchJson } from "@/lib/api-client";

const RANKED_MATCHUP_WINDOW_DAYS = 30;

/** Ranked opponent relationship aggregate (wins/losses/encounters/win rate).
 *
 * refs: none
 */
export interface ChampionRelationship {
  opponentChampionId: number;
  opponentChampionName: string;
  wins: number;
  losses: number;
  encounters: number;
  winRate: number | null;
}

/** One champion-talent vs opponent ranked matchup row over the rolling window.
 *
 * refs: none
 */
export interface ChampionTalentMatchupRow {
  championTalentId: number;
  opponentChampionId: number;
  opponentChampionName: string;
  opponentTalentId: number;
  opponentTalentName: string;
  wins: number;
  losses: number;
  encounters: number;
  coverageFrom: string;
  coverageTo: string;
}

/** Champion talent matchup result: talent list plus ranked matchup rows.
 *
 * refs: none
 */
export interface ChampionTalentMatchups {
  talents: Array<{ talentId: number; talentName: string }>;
  rows: ChampionTalentMatchupRow[];
}

/** Load opponent relationships from the rolling 30-day ranked window.
 *
 * I/O: in (championId: number, signal: AbortSignal) -> out Promise<ChampionRelationship[]>
 *
 * refs: none
 */
export async function fetchChampionRelationships(
  championId: number,
  signal: AbortSignal,
): Promise<ChampionRelationship[]> {
  const matchup = await fetchChampionTalentMatchups(championId, 0, signal);
  const totals = new Map<number, ChampionRelationship>();
  for (const row of matchup.rows) {
    const current = totals.get(row.opponentChampionId) ?? {
      opponentChampionId: row.opponentChampionId,
      opponentChampionName: row.opponentChampionName,
      wins: 0,
      losses: 0,
      encounters: 0,
      winRate: null,
    };
    current.wins += row.wins;
    current.losses += row.losses;
    current.encounters += row.encounters;
    current.winRate = current.encounters ? (100 * current.wins) / current.encounters : null;
    totals.set(row.opponentChampionId, current);
  }
  return [...totals.values()].sort((left, right) => (right.winRate ?? 0) - (left.winRate ?? 0));
}

interface RawChampionTalentMatchups {
  talents: Array<{ talent_id: number; talent_name: string }>;
  rows: Array<{
    champion_talent_id: number;
    opponent_champion_id: number;
    opponent_champion_name: string;
    opponent_talent_id: number;
    opponent_talent_name: string;
    wins: number | string;
    losses: number | string;
    samples: number | string;
    coverage_from: string;
    coverage_to: string;
  }>;
}

/** Load the selected champion talent's observed ranked matchups from the rolling 30-day window.
 *
 * I/O: in (championId: number, talentId: number, signal: AbortSignal) -> out Promise<ChampionTalentMatchups>
 *
 * refs: none
 */
export async function fetchChampionTalentMatchups(
  championId: number,
  talentId: number,
  signal: AbortSignal,
): Promise<ChampionTalentMatchups> {
  const query = new URLSearchParams({ queueId: "486", days: String(RANKED_MATCHUP_WINDOW_DAYS) });
  if (talentId > 0) query.set("talentId", String(talentId));
  const result = await fetchJson<RawChampionTalentMatchups>(
    `/stats/champions/${championId}/matchups?${query}`,
    { signal, retries: 0 },
  );
  return {
    talents: result.talents.map((talent) => ({
      talentId: Number(talent.talent_id),
      talentName: talent.talent_name,
    })),
    rows: result.rows.map((row) => ({
      championTalentId: Number(row.champion_talent_id),
      opponentChampionId: Number(row.opponent_champion_id),
      opponentChampionName: row.opponent_champion_name,
      opponentTalentId: Number(row.opponent_talent_id),
      opponentTalentName: row.opponent_talent_name,
      wins: Number(row.wins),
      losses: Number(row.losses),
      encounters: Number(row.samples),
      coverageFrom: row.coverage_from,
      coverageTo: row.coverage_to,
    })),
  };
}

/** Per-champion strongest/weakest opponent preview aggregate.
 *
 * refs: none
 */
export interface ChampionMatchupPreviews {
  champions: Array<{
    championId: number;
    strong: ChampionRelationship[];
    weak: ChampionRelationship[];
  }>;
}

/** Wire shape of the matchup-previews payload (snake_case champion ids).
 *
 * refs: none
 */
export interface RawChampionMatchupPreviews {
  champions: Array<{
    champion_id: number;
    strong: ChampionRelationship[];
    weak: ChampionRelationship[];
  }>;
}

/** Load the five strongest and weakest opponents for every reference champion.
 *
 * I/O: in (signal: AbortSignal) -> out Promise<ChampionMatchupPreviews>
 *
 * refs: none
 */
export async function fetchChampionMatchupPreviews(signal: AbortSignal): Promise<ChampionMatchupPreviews> {
  const result = await fetchJson<RawChampionMatchupPreviews>(
    "/stats/champions/matchup-previews?days=all",
    { signal, retries: 0 },
  );
  return mapChampionMatchupPreviews(result);
}

/** Normalize the same aggregate contract for the directory and matchup pages.
 *
 * I/O: in (result: RawChampionMatchupPreviews) -> out ChampionMatchupPreviews
 *
 * refs: none
 */
export function mapChampionMatchupPreviews(result: RawChampionMatchupPreviews): ChampionMatchupPreviews {
  const normalize = (relationship: ChampionRelationship): ChampionRelationship => ({
    ...relationship,
    wins: Number(relationship.wins),
    losses: Number(relationship.losses),
    encounters: Number(relationship.encounters),
    winRate: relationship.winRate == null ? null : Number(relationship.winRate),
  });
  return {
    champions: result.champions.map((row) => ({
      championId: Number(row.champion_id),
      strong: row.strong.map(normalize),
      weak: row.weak.map(normalize),
    })),
  };
}
