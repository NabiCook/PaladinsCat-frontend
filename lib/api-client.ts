/**
 * Centralize browser requests to the PaladinsCat API and map responses for client consumers.
 *
 * This module owns endpoint adapters, authentication headers, and local auth/cache helpers;
 * it does not own route rendering or backend request handlers.
 * refs: none
 */
import { identityCutoverEnabled } from "./identity-cutover";
import { hasPlayerTag } from "./player-tag-threshold";
import { normalizeMatchPerformanceTags, type PerformanceMatchTag } from "./player-match-tags";
import type { GamePerformanceMetric, PerformanceScope } from "./performance-selection";
import { API_ERROR_KEYS, ApiRequestError } from "./api-errors";
export { API_ERROR_KEYS, ApiRequestError };
export { formatApiErrorMessage, isApiErrorKey } from "./api-errors";
export type { ApiErrorKey, ApiRequestFailureKind } from "./api-errors";

// Browser-facing backend URL.
//
// In production the public website is served on port 80, while the direct
// backend debug port can be firewalled. The default is therefore same-origin
// `/api`, with Next rewrites forwarding `/api/*` to the backend service. Set
// NEXT_PUBLIC_API_URL only when the browser should intentionally call a
// different public backend origin.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

// ── Types ──

import type {
  Champion,
  ChampionStats,
  ChampionRating,
  ChampionDetail,
  Player,
  PlayerProfile,
  PlayerSearchResult,
  MatchSummary,
  MatchPlayer,
  MatchDetail,
  UserResponse,
  SessionResponse,
  PostResponse,
  CommentResponse,
  BuildResponse,
} from "./types.gen";
import { championSlug } from "./utils";
import { getChampionIconSafe } from "./champion-icons";
import { getStoredLobbyTierFilter, withStoredLobbyTier } from "./lobby-tier";
import { csrfHeader } from "./csrf";
import { fingerprintHeaders } from "./fingerprint";
import type { MatchAccessTier } from "./match-access";

export type {
  Champion,
  ChampionStats,
  ChampionRating,
  ChampionDetail,
  Player,
  PlayerProfile,
  PlayerSearchResult,
  MatchSummary,
  // MatchPlayer — NOT re-exported. The local MatchPlayer interface (below)
  // has different fields (player_id, player_name, etc.) than the generated type.
  // Re-exporting it causes a type collision when pages import MatchPlayer.
  // MatchDetail — NOT re-exported. The local MatchDetailWithBans includes 'bans'.
  UserResponse,
  SessionResponse,
  PostResponse,
  CommentResponse,
  BuildResponse,
};

/**
 * Pair a champion numeric ID with its display name.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionNameOnly {
  id: number;
  name: string;
}

/**
 * Record weekly champion win rate and play count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PatchTrend {
  trendWeek: string;
  weeklyWinRate: number;
  weeklyPlays: number;
}

/**
 * Group favorable and unfavorable champion matchups with wins, plays, and win rates.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface CounterStats {
  strongAgainst: Array<{ opponentChampionName: string; opponentChampionId: number; wins: number; totalMatches: number; winRate: number }>;
  weakAgainst: Array<{ opponentChampionName: string; opponentChampionId: number; wins: number; totalMatches: number; winRate: number }>;
}

/**
 * Describe a player match result, combat totals, queue/tier, and source authority.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchRecord {
  matchId: string;
  championName: string;
  isWinner: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageDone: number;
  duration: number;
  mapGame: string;
  entryDatetime: string;
  queueId: number | null;
  leagueTier: number | null;
  source: string | null;
  authoritative: boolean;
  performanceTags: PerformanceMatchTag[];
}

/**
 * Rank a champion by nullable win rate and play count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface TopWinrateEntry {
  id: number;
  name: string;
  roles: string;
  winRate: number | null;
  totalPlays: number | null;
}

/**
 * Carry champion leaderboard rank metrics and nullable rating.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface LeaderboardEntry {
  championId: number;
  championName: string;
  winRate: number;
  totalPlays: number;
  rating: number | null;
}

/**
 * Carry ranked placement, tier points, movement, and optional win/leave totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface RankedPlayer {
  rank: number;
  player_id: string;
  name: string;
  tier: number;
  points: number;
  prev_rank?: number | null;
  trend?: number;
  wins?: number;
  losses?: number;
  leaves?: number;
  winRate?: number;
  leaveRate?: number;
}

/**
 * Fetch ranked leaderboard data for client consumers.
 *
 * refs: none
 * Fetch GET /stats/ranked-leaderboard with optional tier/top filters, normalize movement and win/leave fields, and return an empty array if the request fails.
 * I/O types: `params?: { tier?: string; top?: number } -> Promise<RankedPlayer[]>`.
 */
export async function fetchRankedLeaderboard(params?: { tier?: string; top?: number }): Promise<RankedPlayer[]> {
  const query = new URLSearchParams();
  if (params?.tier) query.set('tier', params.tier);
  if (params?.top != null) query.set('top', String(params.top));
  try {
    const raw = await fetchJson<Array<{
      player_id: string; name: string; tier: number; points: number;
      rank: number; prev_rank?: number; trend?: number; tier_change?: number;
      wins?: number; losses?: number; leaves?: number; winrate?: number; leaverate?: number;
    }>>(`/stats/ranked-leaderboard${query.toString() ? `?${query.toString()}` : ''}`);
    return raw.map(r => ({
      rank: r.rank,
      player_id: r.player_id,
      name: r.name,
      tier: r.tier,
      points: r.points,
      prev_rank: r.prev_rank,
      trend: r.trend,
      wins: r.wins,
      losses: r.losses,
      leaves: r.leaves,
      winRate: r.winrate,
      leaveRate: r.leaverate,
    }));
  } catch {
    return [];
  }
}

/**
 * Describe a moderated player with community tags, performance totals, and report reasons.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface CheaterPlayer {
  id: string;
  name: string;
  platform: string;
  region: string;
  kbmTier: string | null;
  cheater: boolean;
  exploiter: boolean;
  susCount: number;
  dropper: boolean;
  dropperVoteCount?: number;
  afkWintrade: boolean;
  afkWintradeVoteCount?: number;
  boosted: boolean;
  altAccount: boolean;
  altAccountVoteCount?: number;
  weirdoCount: number;
  hallOfFameCount: number;
  avgDpm: number | null;
  avgHpm: number | null;
  avgCpm: number | null;
  avgSpm: number | null;
  totalMatches: number;
  winRate: number | null;
  topReasons: Array<{ reason: string; count: number }>;
}

/**
 * Identify a public or private cheater subject with nullable profile and observation data.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface CheaterPortalEntry {
  kind: "player" | "private";
  subjectId: string;
  playerId: number | null;
  name: string;
  platform: string | null;
  lastSeen: string | null;
  markedAt: string | null;
  reason: string | null;
  level: number | null;
  wins: number | null;
  losses: number | null;
  winRate: number | null;
  leaveRate: number | null;
}

/**
 * Summarize active, inactive, and evidence counts with latest cheater records.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface CheaterPortal {
  activeCount: number;
  inactiveCount: number;
  evidenceCount: number;
  latest: CheaterPortalEntry[];
}

/** Distinct flagged-player activity; UTC buckets and match-server regions.
 *
 * refs: none
 */
export interface CheaterActivitySeries {
  total24h: number;
  regions: Array<{ region: string; total24h: number }>;
  hourly: Array<{
    date: string; hour: number; total: number; regions: Record<string, number>;
    playersByRegion?: Record<string, Array<{ playerId: number; name: string }>>;
  }>;
}

/** All-queue and per-queue series from the read-only cheater activity endpoint.
 *
 * refs: none
 */
export interface CheaterActivity {
  windowHours: number;
  observedAt: string;
  matches: CheaterActivitySeries;
  players: CheaterActivitySeries;
  queues: Array<{ queueId: number; queueName: string; matches: CheaterActivitySeries; players: CheaterActivitySeries }>;
  breakdown: PresenceBreakdownStats;
}

/** Shared player breakdown inputs; uncertainty metadata is optional for exact tagged-player counts.
 *
 * refs: none
 */
export type PresenceBreakdownStats = Pick<PresenceStats, "public_players" | "public_by_platform" | "public_by_region"> & {
  public_by_queue: Array<{ queue_id: number; queue_name: string; players: number }>;
  profile_coverage?: Pick<PresenceStats["profile_coverage"], "total" | "platform_known">;
  private_players?: number;
  unresolved_private_observations?: number;
  unresolved_player_slots_upper?: number;
  public_players_lower_bound?: number;
  public_players_upper_bound?: number;
};

/**
 * Page historical cheater records with their total count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface InactiveCheaterPage {
  items: CheaterPortalEntry[];
  total: number;
}

/**
 * Page recently active cheater records with their total count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ActiveCheaterPage {
  items: CheaterPortalEntry[];
  total: number;
}

/**
 * Describe published cheater evidence, its subject, source/embed provider, and image attachments.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface CheaterEvidence {
  id: string;
  origin: EvidenceOrigin;
  playerId: number | null;
  subjectName: string;
  title: string;
  description: string;
  matchId: string | null;
  sourceUrl: string | null;
  provider: "youtube" | "medal" | "twitch" | "discord" | null;
  embedUrl: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  createdAt: string;
}

/**
 * Page published evidence with its total count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface CheaterEvidencePage {
  items: CheaterEvidence[];
  total: number;
}

/** The provenance of a published cheater-evidence item.
 *
 * refs: none
 */
export type EvidenceOrigin = "player_submitted" | "automated" | "unknown";

/**
 * Pending administrator-review evidence metadata. · refs: endpoints: GET /cheaters/evidence/review
 */
export interface CheaterEvidenceReviewItem extends CheaterEvidence {
  imageCount: number;
  submittedBy: string;
}

/**
 * Published cheater detail with evidence posts and supporting match rows. · refs: endpoints: GET /cheaters/{id}
 */
export interface CheaterDetail {
  player: { id: string; name: string; platform: string | null; lastSeen: string | null; markedAt: string | null };
  evidence: CheaterEvidence[];
  supportingMatches: Array<{ matchId: string; map: string | null; region: string | null; durationSeconds: number | null; entryDatetime: string | null }>;
}

/**
 * Extend the moderated player with automatic AFK observation counts and economy-per-minute extrema.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticAfkPlayer extends CheaterPlayer {
  automaticMatchCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  lowestEcpm: number;
  averageEcpm: number;
}

/**
 * Page automatic AFK players with their total count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticAfkPlayerPage {
  players: AutomaticAfkPlayer[];
  totalCount: number;
}

/**
 * Extend the moderated player with wall-shooter observation counts and time bounds.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticWallShooterPlayer extends CheaterPlayer {
  wallShooterCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * Page automatic wall-shooter players with their total count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticWallShooterPlayerPage {
  players: AutomaticWallShooterPlayer[];
  totalCount: number;
}

/**
 * Extend the moderated player with master-feeding observation counts and time bounds.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticMasterFeedingPlayer extends CheaterPlayer {
  masterFeedingCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * Page automatic master-feeding players with their total count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticMasterFeedingPlayerPage {
  players: AutomaticMasterFeedingPlayer[];
  totalCount: number;
}

/**
 * Select the automatic role-difference or noob/hypercarry metric.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type PerformanceDiffMetric = "tank-diff" | "support-diff" | "dps-diff" | "flank-diff" | "the-noob" | "hypercarry";

/**
 * Extend the moderated player with a selected performance-metric count and time bounds.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticPerformanceDiffPlayer extends CheaterPlayer {
  metricCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * Page automatic performance-metric players with their total count.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticPerformanceDiffPlayerPage {
  players: AutomaticPerformanceDiffPlayer[];
  totalCount: number;
}

/**
 * Carry the match context and economy-per-minute evidence behind an automatic AFK observation.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticAfkMatchSummary {
  matchId: number;
  entryDatetime: string | null;
  map: string | null;
  queueId: number;
  region: string | null;
  durationSeconds: number;
  championId: number | null;
  championName: string | null;
  winStatus: string | null;
  kills: number;
  deaths: number;
  assists: number;
  leagueTier: number;
  leaguePoints: number;
  source: string;
  ecpm: number;
}

/**
 * Combine an automatic AFK player summary with supporting matches.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AutomaticAfkPlayerDetail {
  player: {
    id: string;
    name: string;
    platform: string;
    region: string;
    communityMarked: boolean;
    automaticMatchCount: number;
    firstSeen: string | null;
    lastSeen: string | null;
    lowestEcpm: number;
    averageEcpm: number;
  };
  matches: AutomaticAfkMatchSummary[];
}

/**
 * Extend the moderated player with party-match totals and associated cheaters.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface BoostedPlayer extends CheaterPlayer {
  partyMatchCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  cheaters: Array<{
    id: string;
    name: string;
    matchCount: number;
    firstSeen: string | null;
    lastSeen: string | null;
  }>;
}

/**
 * Carry a boosting-evidence match with scores, player performance, and associated cheaters.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface BoostedMatchSummary {
  matchId: number;
  entryDatetime: string | null;
  map: string | null;
  queueId: number;
  region: string | null;
  durationSeconds: number;
  team1Score: number;
  team2Score: number;
  winningTaskForce: number;
  championId: number | null;
  championName: string | null;
  winStatus: string | null;
  kills: number;
  deaths: number;
  assists: number;
  leagueTier: number;
  leaguePoints: number;
  source: string;
  cheaters: Array<{ id: string; name: string }>;
}

/**
 * Combine a boosted player summary with supporting matches.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface BoostedPlayerDetail {
  player: BoostedPlayer;
  matches: BoostedMatchSummary[];
}

/**
 * Describe an exploiter evidence match, including population, scope, and selected talent.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ExploiterEvidenceMatch {
  matchId: number;
  entryDatetime: string | null;
  map: string | null;
  queueId: number;
  queueName: string;
  region: string | null;
  durationSeconds: number;
  population: string;
  statsScope: string;
  championId: number | null;
  championName: string | null;
  winStatus: string | null;
  kills: number;
  deaths: number;
  assists: number;
  talentId: number;
  talentName: string;
}

/**
 * Describe a temporally impossible or exclusive cosmetic observed on an
 * exploiter account (e.g. a ranked frame from a season that ended before the
 * account existed).
 * refs: doc: documents/04-game-data/ranked-seasons.md
 */
export interface CosmeticEvidence {
  kind: string;
  name: string;
  reason: string;
  accountCreatedDate: string | null;
  observedDate: string | null;
}

/**
 * Describe a stored evidence record from the evidence portal or an
 * operator/system flag (e.g. win-trade). Unlike computed cosmetic evidence,
 * these are concrete, match-linked records.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ExploiterFlagEvidence {
  id: number;
  title: string;
  description: string;
  matchId: number | null;
  sourceUrl: string | null;
  origin: EvidenceOrigin;
  createdAt: string;
}

/**
 * Describe a moderation flag (vote) recorded against an exploiter. The reason
 * string is free-form and extensible — new flag types surface without a code
 * change.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ExploiterFlag {
  voteType: string;
  reason: string;
  createdAt: string;
}

/**
 * Combine exploiter identity and moderation flags with supporting matches.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ExploiterEvidenceDetail {
  player: Pick<CheaterPlayer, "id" | "name" | "platform" | "region" | "cheater" | "exploiter">;
  matches: ExploiterEvidenceMatch[];
  cosmeticEvidence: CosmeticEvidence[];
  flagEvidence: ExploiterFlagEvidence[];
  flags: ExploiterFlag[];
}

/**
 * Fetch filtered moderation-directory players from the backend.
 * Accepts typed query filters and returns normalized player summaries.
 * refs: none
 * I/O types: `params?: { name?: string; cheater?: boolean; exploiter?: boolean; susOnly?: boolean; weirdoOnly?: boolean; hallOfFameOnly?: boolean; dropperOnly?: boolean; afkWintradeOnly?: boolean; altAccountOnly?: boolean; limit?: number; offset?: number } -> Promise<CheaterPlayer[]>`.
 */
export async function fetchCheaterPlayers(params?: { name?: string; cheater?: boolean; exploiter?: boolean; susOnly?: boolean; weirdoOnly?: boolean; hallOfFameOnly?: boolean; dropperOnly?: boolean; afkWintradeOnly?: boolean; altAccountOnly?: boolean; limit?: number; offset?: number }): Promise<CheaterPlayer[]> {
  const query = new URLSearchParams();
  if (params?.name?.trim()) query.set('name', params.name.trim());
  if (params?.cheater) query.set('cheater', 'true');
  if (params?.exploiter) query.set('exploiter', 'true');
  if (params?.susOnly) query.set('susOnly', 'true');
  if (params?.weirdoOnly) query.set('weirdoOnly', 'true');
  if (params?.hallOfFameOnly) query.set('hallOfFameOnly', 'true');
  if (params?.dropperOnly) query.set('dropperOnly', 'true');
  if (params?.afkWintradeOnly) query.set('afkWintradeOnly', 'true');
  if (params?.altAccountOnly) query.set('altAccountOnly', 'true');
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  query.set('perPage', String(params?.limit || 100));
  try {
    const raw = await fetchJson<Array<{
      id: string; name: string; platform: string; region: string;
      kbm_tier?: string | null; cheater?: boolean; exploiter?: boolean; sus_count?: number;
      dropper?: boolean; dropper_vote_count?: number; afk_wintrade?: boolean; afk_wintrade_vote_count?: number; boosted?: boolean; alt_account?: boolean; alt_account_vote_count?: number;
      weirdo_count?: number; hall_of_fame_count?: number;
      avg_dpm?: number | null; avg_hpm?: number | null; avg_egpm?: number | null;
      avg_spm?: number | null; total_matches?: number; win_rate?: number | null;
      top_reasons?: Array<{ reason?: string; count?: number }>;
    }>>(`/players/search?${query.toString()}`);
    return raw.map(r => ({
      id: r.id, name: r.name, platform: r.platform, region: r.region,
      kbmTier: r.kbm_tier ?? null, cheater: r.cheater ?? false, exploiter: r.exploiter ?? false,
      susCount: r.sus_count ?? 0,
      dropper: Boolean(r.dropper), dropperVoteCount: Number(r.dropper_vote_count ?? 0),
      afkWintrade: Boolean(r.afk_wintrade), afkWintradeVoteCount: Number(r.afk_wintrade_vote_count ?? 0),
      boosted: Boolean(r.boosted), altAccount: Boolean(r.alt_account), altAccountVoteCount: Number(r.alt_account_vote_count ?? 0),
      weirdoCount: r.weirdo_count ?? 0,
      hallOfFameCount: r.hall_of_fame_count ?? 0,
      avgDpm: r.avg_dpm ?? null, avgHpm: r.avg_hpm ?? null,
      avgCpm: r.avg_egpm ?? null, avgSpm: r.avg_spm ?? null,
      totalMatches: Number(r.total_matches) || 0, winRate: r.win_rate != null ? Number(r.win_rate) : null,
      topReasons: (r.top_reasons ?? []).map((reason) => ({ reason: reason.reason ?? "", count: Number(reason.count ?? 0) })).filter((reason) => reason.reason.length > 0),
    }));
  } catch {
    return [];
  }
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCheaterPortalEntry(row: any): CheaterPortalEntry {
  const wins = normalizeNullableNumber(row.wins ?? row.totalWins ?? row.total_wins ?? row.globalWins ?? row.global_wins);
  const losses = normalizeNullableNumber(row.losses ?? row.totalLosses ?? row.total_losses ?? row.globalLosses ?? row.global_losses);
  const matches = normalizeNullableNumber(row.matches ?? row.totalMatches ?? row.total_matches);
  const leaves = normalizeNullableNumber(row.leaves ?? row.totalLeaves ?? row.total_leaves);
  const totalMatches = matches ?? (wins != null && losses != null ? wins + losses : null);
  const computedWinRate = wins != null && losses != null && wins + losses > 0
    ? (wins / (wins + losses)) * 100
    : null;
  const computedLeaveRate = leaves != null && totalMatches != null && totalMatches > 0
    ? (leaves / totalMatches) * 100
    : null;
  return {
    kind: row.kind === "private" ? "private" : "player",
    subjectId: String(row.subjectId ?? row.subject_id ?? row.playerId ?? row.player_id ?? row.id ?? ""),
    playerId: row.playerId == null && row.player_id == null && row.id == null ? null : Number(row.playerId ?? row.player_id ?? row.id),
    name: String(row.name ?? "Unknown subject"),
    platform: row.platform ?? row.platform_name ?? null,
    lastSeen: row.lastSeen ?? row.last_seen ?? null,
    markedAt: row.markedAt ?? row.marked_at ?? row.cheaterMarkedAt ?? row.cheater_marked_at ?? null,
    reason: row.reason ?? null,
    level: normalizeNullableNumber(row.level ?? row.accountLevel ?? row.account_level ?? row.profileLevel ?? row.profile_level),
    wins,
    losses,
    winRate: normalizeNullableNumber(row.winRate ?? row.win_rate ?? row.winrate) ?? computedWinRate,
    leaveRate: normalizeNullableNumber(row.leaveRate ?? row.leave_rate ?? row.leaverate) ?? computedLeaveRate,
  };
}

/**
 * Fetch the single cached read used by the Cheater Portal landing page.
 * I/O types: `none -> Promise<CheaterPortal>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchCheaterPortal(): Promise<CheaterPortal> {
  const response = await fetchJson<any>("/cheaters/portal");
  const raw = response.portal ?? response;
  return {
    activeCount: Number(raw.activeCount ?? raw.active_count ?? 0),
    inactiveCount: Number(raw.inactiveCount ?? raw.inactive_count ?? 0),
    evidenceCount: Number(raw.evidenceCount ?? raw.evidence_count ?? 0),
    latest: Array.isArray(raw.latest)
      ? raw.latest.map(normalizeCheaterPortalEntry)
      : Array.isArray(raw.active) ? raw.active.map(normalizeCheaterPortalEntry) : [],
  };
}

/** Fetch all queue variants together; switching queues needs no extra request
 * Contract: no inputs -> Promise<CheaterActivity>; network failures reject.
 *
 * I/O: in () -> out Promise<CheaterActivity>
 *
 * refs: endpoints: GET /cheaters/activity
 */
export async function fetchCheaterActivity(): Promise<CheaterActivity> {
  return fetchJson<CheaterActivity>("/cheaters/activity", { retries: 0 });
}

/**
 * Fetch the paginated inactive-cheater directory with optional search, limit, and offset filters. Return the backend items and total; network/API failures reject the promise.
 * Fetch paginated historical cheaters without scanning the legacy directory client-side.
 * I/O types: `params: { q?: string; limit?: number; offset?: number } -> Promise<InactiveCheaterPage>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchInactiveCheaters(params: { q?: string; limit?: number; offset?: number } = {}): Promise<InactiveCheaterPage> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  query.set("limit", String(params.limit ?? 20));
  query.set("offset", String(params.offset ?? 0));
  const raw = await fetchJson<{ items?: any[]; total?: number | string }>(`/cheaters/inactive?${query.toString()}`);
  return {
    items: (raw.items ?? []).map(normalizeCheaterPortalEntry),
    total: Number(raw.total ?? 0),
  };
}

/**
 * Fetch paginated recent cheaters without expanding the landing-page preview.
 * I/O types: `params: { q?: string; limit?: number; offset?: number } -> Promise<ActiveCheaterPage>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchActiveCheaters(params: { q?: string; limit?: number; offset?: number } = {}): Promise<ActiveCheaterPage> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  query.set("limit", String(params.limit ?? 20));
  query.set("offset", String(params.offset ?? 0));
  const raw = await fetchJson<{ items?: any[]; total?: number | string }>(`/cheaters/active?${query.toString()}`);
  return {
    items: (raw.items ?? []).map(normalizeCheaterPortalEntry),
    total: Number(raw.total ?? 0),
  };
}

/**
 * Fetch the paginated recent-exploiter directory. Ordering and the rolling
 * 30-day boundary are owned by the backend directory endpoint.
 *
 * I/O: in (params: { q?: string; limit?: number; offset?: number }) -> out Promise<ActiveCheaterPage>
 *
 * refs: endpoints: GET /players/exploiters/active
 */
export async function fetchActiveExploiters(params: { q?: string; limit?: number; offset?: number } = {}): Promise<ActiveCheaterPage> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  query.set("limit", String(params.limit ?? 20));
  query.set("offset", String(params.offset ?? 0));
  const raw = await fetchJson<{ items?: any[]; total?: number | string }>(`/players/exploiters/active?${query.toString()}`);
  return {
    items: (raw.items ?? []).map(normalizeCheaterPortalEntry),
    total: Number(raw.total ?? 0),
  };
}

/**
 * Fetch the paginated historical-exploiter directory. Ordering and the
 * rolling 30-day boundary are owned by the backend directory endpoint.
 *
 * I/O: in (params: { q?: string; limit?: number; offset?: number }) -> out Promise<InactiveCheaterPage>
 *
 * refs: endpoints: GET /players/exploiters/inactive
 */
export async function fetchInactiveExploiters(params: { q?: string; limit?: number; offset?: number } = {}): Promise<InactiveCheaterPage> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  query.set("limit", String(params.limit ?? 20));
  query.set("offset", String(params.offset ?? 0));
  const raw = await fetchJson<{ items?: any[]; total?: number | string }>(`/players/exploiters/inactive?${query.toString()}`);
  return {
    items: (raw.items ?? []).map(normalizeCheaterPortalEntry),
    total: Number(raw.total ?? 0),
  };
}

function mediaApiUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

function normalizeCheaterEvidence(row: any): CheaterEvidence {
  const origin: EvidenceOrigin = row.origin == null
    ? "player_submitted"
    : row.origin === "player_submitted" || row.origin === "automated" || row.origin === "unknown"
      ? row.origin
      : "unknown";
  const imageUrls = Array.isArray(row.imageUrls)
    ? row.imageUrls.filter((url: unknown): url is string => typeof url === "string").map(mediaApiUrl)
    : Array.isArray(row.images)
      ? row.images.map((image: { url?: unknown }) => image.url).filter((url: unknown): url is string => typeof url === "string").map(mediaApiUrl)
      : typeof row.imageUrl === "string" ? [mediaApiUrl(row.imageUrl)] : [];
  return {
    id: String(row.id),
    origin,
    playerId: row.playerId == null ? null : Number(row.playerId),
    subjectName: String(row.subjectName ?? "Unknown subject"),
    title: String(row.title ?? "Evidence"),
    description: String(row.description ?? ""),
    matchId: row.matchId == null ? null : String(row.matchId),
    sourceUrl: row.sourceUrl ?? null,
    provider: row.provider === "youtube" || row.provider === "medal" || row.provider === "twitch" || row.provider === "discord" ? row.provider : null,
    embedUrl: row.embedUrl ?? null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    createdAt: String(row.createdAt ?? ""),
  };
}

/**
 * Fetch the newest approved evidence records, including provider-safe embed URLs.
 * I/O types: `params: { limit?: number; offset?: number } -> Promise<CheaterEvidencePage>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchCheaterEvidence(params: { limit?: number; offset?: number } = {}): Promise<CheaterEvidencePage> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
    publicOnly: "true",
  });
  const raw = await fetchJson<{ items?: any[]; total?: number | string }>(`/cheaters/evidence?${query.toString()}`);
  return {
    items: (raw.items ?? []).map(normalizeCheaterEvidence).filter((item) => item.origin === "player_submitted"),
    total: Number(raw.total ?? 0),
  };
}

/**
 * Submit an evidence multipart form.
 *
 * Evidence uploads may synchronously generate up to five lossless-quality AVIF
 * derivatives on the external storage host, so this one write receives a
 * request-scoped deadline. Retries remain disabled: a timeout must never
 * create a duplicate moderation report.
 *
 * refs: endpoints: POST /cheaters/evidence · migrations: 166
 * I/O types: `form: FormData -> Promise<{ evidence: { id: string; createdAt: string } }>`.
 */
export async function submitCheaterEvidence(form: FormData): Promise<{ evidence: { id: string; createdAt: string } }> {
  return fetchJson<{ evidence: { id: string; createdAt: string } }>("/cheaters/evidence", {
    method: "POST",
    body: form,
    headers: accountAuthHeaders(),
    retries: 0,
    timeoutMs: 180_000,
  });
}

/**
 * Fetch one approved evidence post for the SNS-style detail view.
 * I/O types: `id: string -> Promise<CheaterEvidence>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchCheaterEvidenceDetail(id: string): Promise<CheaterEvidence> {
  const raw = await fetchJson<{ evidence: any }>(`/cheaters/evidence/${encodeURIComponent(id)}`);
  const evidence = normalizeCheaterEvidence(raw.evidence);
  if (evidence.origin !== "player_submitted") throw new Error("Evidence post was not found");
  return evidence;
}

/**
 * Fetch pending evidence reserved for administrator review.
 * I/O types: `params: { limit?: number; offset?: number } -> Promise<{ items: CheaterEvidenceReviewItem[]; total: number }>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchCheaterEvidenceReview(params: { limit?: number; offset?: number } = {}): Promise<{ items: CheaterEvidenceReviewItem[]; total: number }> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 20), offset: String(params.offset ?? 0) });
  const raw = await fetchJson<{ items?: any[]; total?: number | string }>(`/cheaters/evidence/review?${query.toString()}`, { headers: accountAuthHeaders() });
  return {
    items: (raw.items ?? []).map((row) => ({ ...normalizeCheaterEvidence(row), imageCount: Number(row.imageCount ?? 0), submittedBy: String(row.submittedBy ?? "Unknown") })).filter((item) => item.origin === "player_submitted"),
    total: Number(raw.total ?? 0),
  };
}

/**
 * Fetch one pending image through the authenticated review route as an AVIF
 * object URLs. The caller owns revoking both returned URLs after unmount.
 *
 * refs: migrations: 166 · endpoints: GET /cheaters/evidence/{id}/media/{position}
 * I/O types: `id: string; position: number -> Promise<{ avifUrl: string; originalUrl: string }>`.
 */
export async function fetchCheaterEvidenceReviewImage(id: string, position: number): Promise<{ avifUrl: string; originalUrl: string }> {
  const baseUrl = `${API_BASE}/cheaters/evidence/${encodeURIComponent(id)}/media/${position}`;
  const headers = accountAuthHeaders();
  const [avif, original] = await Promise.all([
    fetch(`${baseUrl}?format=avif`, { headers }),
    fetch(`${baseUrl}?format=original`, { headers }),
  ]);
  if (!avif.ok || !original.ok) throw new Error("Evidence image could not be loaded.");
  return { avifUrl: URL.createObjectURL(await avif.blob()), originalUrl: URL.createObjectURL(await original.blob()) };
}

/**
 * Apply an administrator's evidence review decision without retrying a state transition.
 * I/O types: `id: string; decision: "approve" | "deny"; tag?: "cheater" | "exploit" | "suspicious" -> Promise<void>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function reviewCheaterEvidence(
  id: string,
  decision: "approve" | "deny",
  tag?: "cheater" | "exploit" | "suspicious",
  note = "",
): Promise<void> {
  if (decision === "approve" && !tag) throw new Error("Choose a tag before approving evidence.");
  await fetchJson(`/cheaters/evidence/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: { ...accountAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ decision, note, ...(tag ? { tag } : {}) }),
    retries: 0,
  });
}

/**
 * Fetch the confirmed-cheater detail feed and its evidence-linked match rows.
 * I/O types: `id: string -> Promise<CheaterDetail>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchCheaterDetail(id: string): Promise<CheaterDetail> {
  const raw = await fetchJson<{ player: any; evidence?: any[]; supportingMatches?: any[] }>(`/cheaters/${encodeURIComponent(id)}`);
  return {
    player: {
      id: String(raw.player.id), name: String(raw.player.name ?? "Unknown"), platform: raw.player.platform ?? null,
      lastSeen: raw.player.lastSeen ?? null, markedAt: raw.player.markedAt ?? null,
    },
    evidence: (raw.evidence ?? []).map(normalizeCheaterEvidence),
    supportingMatches: (raw.supportingMatches ?? []).map((match) => ({
      matchId: String(match.matchId), map: match.map ?? null, region: match.region ?? null,
      durationSeconds: match.durationSeconds == null ? null : Number(match.durationSeconds), entryDatetime: match.entryDatetime ?? null,
    })),
  };
}

function mapAutomaticAfkPlayer(row: any): AutomaticAfkPlayer {
  return {
    id: String(row.id),
    name: String(row.name ?? `Player ${row.id}`),
    platform: String(row.platform ?? 'Unknown'),
    region: String(row.region ?? 'Unknown'),
    kbmTier: row.kbm_tier ?? null,
    cheater: Boolean(row.cheater),
    exploiter: Boolean(row.exploiter),
    susCount: Number(row.sus_count ?? 0),
    dropper: Boolean(row.dropper), dropperVoteCount: Number(row.dropper_vote_count ?? 0),
    afkWintrade: Boolean(row.afk_wintrade), afkWintradeVoteCount: Number(row.afk_wintrade_vote_count ?? 0),
    boosted: Boolean(row.boosted),
    altAccount: Boolean(row.alt_account),
    weirdoCount: Number(row.weirdo_count ?? 0),
    hallOfFameCount: Number(row.hall_of_fame_count ?? 0),
    avgDpm: row.avg_dpm == null ? null : Number(row.avg_dpm),
    avgHpm: row.avg_hpm == null ? null : Number(row.avg_hpm),
    avgCpm: row.avg_egpm == null ? null : Number(row.avg_egpm),
    avgSpm: row.avg_spm == null ? null : Number(row.avg_spm),
    totalMatches: Number(row.total_matches ?? 0),
    winRate: row.win_rate == null ? null : Number(row.win_rate),
    topReasons: [],
    automaticMatchCount: Number(row.automatic_match_count ?? 0),
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
    lowestEcpm: Number(row.lowest_ecpm ?? 0),
    averageEcpm: Number(row.average_ecpm ?? 0),
  };
}

/**
 * Fetch automatic afk players data for client consumers.
 *
 * refs: none
 * I/O types: `{ name, limit = 24, offset = 0, }: { name?: string; limit?: number; offset?: number; } -> Promise<AutomaticAfkPlayerPage>`.
 * Request `GET '/players/automatic-afk?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 */
export async function fetchAutomaticAfkPlayers({
  name,
  limit = 24,
  offset = 0,
}: {
  name?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AutomaticAfkPlayerPage> {
  const query = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), 100)),
    offset: String(Math.max(offset, 0)),
  });
  if (name?.trim()) query.set('name', name.trim());
  const rows = await fetchJson<any[]>(`/players/automatic-afk?${query.toString()}`);
  return {
    players: rows.map(mapAutomaticAfkPlayer),
    totalCount: Number(rows[0]?.total_count ?? rows.length),
  };
}

function mapAutomaticWallShooterPlayer(row: any): AutomaticWallShooterPlayer {
  return {
    id: String(row.id),
    name: String(row.name ?? `Player ${row.id}`),
    platform: String(row.platform ?? 'Unknown'),
    region: String(row.region ?? 'Unknown'),
    kbmTier: row.kbm_tier ?? null,
    cheater: Boolean(row.cheater),
    exploiter: Boolean(row.exploiter),
    susCount: Number(row.sus_count ?? 0),
    dropper: Boolean(row.dropper),
    dropperVoteCount: Number(row.dropper_vote_count ?? 0),
    afkWintrade: Boolean(row.afk_wintrade),
    afkWintradeVoteCount: Number(row.afk_wintrade_vote_count ?? 0),
    boosted: Boolean(row.boosted),
    altAccount: Boolean(row.alt_account),
    weirdoCount: Number(row.weirdo_count ?? 0),
    hallOfFameCount: Number(row.hall_of_fame_count ?? 0),
    avgDpm: row.avg_dpm == null ? null : Number(row.avg_dpm),
    avgHpm: row.avg_hpm == null ? null : Number(row.avg_hpm),
    avgCpm: row.avg_egpm == null ? null : Number(row.avg_egpm),
    avgSpm: row.avg_spm == null ? null : Number(row.avg_spm),
    totalMatches: Number(row.total_matches ?? 0),
    winRate: row.win_rate == null ? null : Number(row.win_rate),
    topReasons: [],
    wallShooterCount: Number(row.wall_shooter_count ?? 0),
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
  };
}

/**
 * Fetch wall shooter players data for client consumers.
 *
 * refs: none
 * I/O types: `{ name, limit = 32, offset = 0, }: { name?: string; limit?: number; offset?: number; } -> Promise<AutomaticWallShooterPlayerPage>`.
 * Request `GET '/players/wall-shooters?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 */
export async function fetchWallShooterPlayers({
  name,
  limit = 32,
  offset = 0,
}: {
  name?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AutomaticWallShooterPlayerPage> {
  const query = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), 100)),
    offset: String(Math.max(offset, 0)),
  });
  if (name?.trim()) query.set('name', name.trim());
  const rows = await fetchJson<any[]>(`/players/wall-shooters?${query.toString()}`);
  return {
    players: rows.map(mapAutomaticWallShooterPlayer),
    totalCount: Number(rows[0]?.total_count ?? rows.length),
  };
}

function mapAutomaticMasterFeedingPlayer(row: any): AutomaticMasterFeedingPlayer {
  return {
    ...mapAutomaticWallShooterPlayer(row),
    masterFeedingCount: Number(row.master_feeding_count ?? 0),
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
  };
}

/**
 * Fetch master feeding players data for client consumers.
 *
 * refs: none
 * I/O types: `{ name, limit = 32, offset = 0, }: { name?: string; limit?: number; offset?: number; } -> Promise<AutomaticMasterFeedingPlayerPage>`.
 * Request `GET '/players/master-feeding?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 */
export async function fetchMasterFeedingPlayers({
  name,
  limit = 32,
  offset = 0,
}: {
  name?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AutomaticMasterFeedingPlayerPage> {
  const query = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), 100)),
    offset: String(Math.max(offset, 0)),
  });
  if (name?.trim()) query.set('name', name.trim());
  const rows = await fetchJson<any[]>(`/players/master-feeding?${query.toString()}`);
  return {
    players: rows.map(mapAutomaticMasterFeedingPlayer),
    totalCount: Number(rows[0]?.total_count ?? rows.length),
  };
}

function mapAutomaticPerformanceDiffPlayer(row: any): AutomaticPerformanceDiffPlayer {
  return {
    ...mapAutomaticWallShooterPlayer(row),
    metricCount: Number(row.metric_count ?? 0),
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
  };
}

/**
 * Fetch performance diff players data for client consumers.
 *
 * refs: none
 * I/O types: `metric: PerformanceDiffMetric; { name, limit = 32, offset = 0, }: { name?: string; limit?: number; offset?: number; } -> Promise<AutomaticPerformanceDiffPlayerPage>`.
 * Request `GET '/players/performance-diff/${metric}?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 */
export async function fetchPerformanceDiffPlayers(metric: PerformanceDiffMetric, {
  name,
  limit = 32,
  offset = 0,
}: {
  name?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AutomaticPerformanceDiffPlayerPage> {
  const query = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), 100)),
    offset: String(Math.max(offset, 0)),
  });
  if (name?.trim()) query.set('name', name.trim());
  const rows = await fetchJson<any[]>(`/players/performance-diff/${metric}?${query.toString()}`);
  return {
    players: rows.map(mapAutomaticPerformanceDiffPlayer),
    totalCount: Number(rows[0]?.total_count ?? rows.length),
  };
}

/**
 * Fetch automatic afk player detail data for client consumers.
 *
 * refs: none
 * I/O types: `playerId: string -> Promise<AutomaticAfkPlayerDetail>`.
 * Request `GET '/players/automatic-afk/${encodeURIComponent(playerId)}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 */
export async function fetchAutomaticAfkPlayerDetail(playerId: string): Promise<AutomaticAfkPlayerDetail> {
  const raw = await fetchJson<any>(`/players/automatic-afk/${encodeURIComponent(playerId)}`);
  return {
    player: {
      id: String(raw.player.id),
      name: String(raw.player.name ?? `Player ${raw.player.id}`),
      platform: String(raw.player.platform ?? 'Unknown'),
      region: String(raw.player.region ?? 'Unknown'),
      communityMarked: Boolean(raw.player.afk_wintrade),
      automaticMatchCount: Number(raw.player.automatic_match_count ?? 0),
      firstSeen: raw.player.first_seen ?? null,
      lastSeen: raw.player.last_seen ?? null,
      lowestEcpm: Number(raw.player.lowest_ecpm ?? 0),
      averageEcpm: Number(raw.player.average_ecpm ?? 0),
    },
    matches: (raw.matches ?? []).map((row: any) => ({
      matchId: Number(row.match_id),
      entryDatetime: row.entry_datetime ?? null,
      map: row.map == null ? null : String(row.map),
      queueId: Number(row.queue_id ?? 0),
      region: row.region == null ? null : String(row.region),
      durationSeconds: Number(row.duration_seconds ?? 0),
      championId: row.champion_id == null ? null : Number(row.champion_id),
      championName: row.champion_name == null ? null : String(row.champion_name),
      winStatus: row.win_status == null ? null : String(row.win_status),
      kills: Number(row.kills ?? 0),
      deaths: Number(row.deaths ?? 0),
      assists: Number(row.assists ?? 0),
      leagueTier: Number(row.league_tier ?? 0),
      leaguePoints: Number(row.league_points ?? 0),
      source: String(row.source ?? 'direct'),
      ecpm: Number(row.ecpm ?? 0),
    })),
  };
}

/**
 * Carry class ranking, rating uncertainty, and player win/match totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ClassLeaderboardEntry {
  rank: number;
  playerId: number;
  playerName: string;
  championName: string | null;
  championId: number | null;
  elo: number;
  mu: number;
  phi: number;
  winRate: number | null;
  totalMatches: number;
  totalWins: number;
  region: string | null;
}

/**
 * Fetch class leaderboard data for client consumers.
 *
 * refs: none
 * I/O types: `params: { role: string; limit?: number; queueId?: number; mode?: 'account' | 'champion' } -> Promise<ClassLeaderboardEntry[]>`.
 * Request `GET '/players/leaderboard/class?${query.toString()}'` through the shared API transport. Return `[]` on a caught request failure.
 */
export async function fetchClassLeaderboard(params: { role: string; limit?: number; queueId?: number; mode?: 'account' | 'champion' }): Promise<ClassLeaderboardEntry[]> {
  const query = new URLSearchParams();
  query.set('role', params.role);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.queueId != null) query.set('queueId', String(params.queueId));
  if (params.mode) query.set('mode', params.mode);
  try {
    const raw = await fetchJson<Array<{
      rank: number; player_id: number; player_name: string;
      champion_name: string | null; champion_id: number | null;
      elo: number | string; mu: number | string; phi: number | string;
      win_rate: number | string | null; total_matches: number; total_wins: number;
      region: string | null;
    }>>(`/players/leaderboard/class?${query.toString()}`);
    return raw.map((r) => ({
      rank: Number(r.rank),
      playerId: Number(r.player_id),
      playerName: r.player_name,
      championName: r.champion_name ?? null,
      championId: r.champion_id == null ? null : Number(r.champion_id),
      elo: typeof r.elo === 'string' ? Number(r.elo) : r.elo,
      mu: typeof r.mu === 'string' ? Number(r.mu) : r.mu,
      phi: typeof r.phi === 'string' ? Number(r.phi) : r.phi,
      winRate: r.win_rate == null ? null : (typeof r.win_rate === 'string' ? Number(r.win_rate) : r.win_rate),
      totalMatches: Number(r.total_matches ?? 0),
      totalWins: Number(r.total_wins ?? 0),
      region: r.region ?? null,
    }));
  } catch (e) {
    // Propagate: failed fetch must not return empty data (wiki: frontend-async-ui.md L42)
    throw e;
  }
}

/**
 * Carry champion Elo ranking, class, uncertainty, and match totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionEloEntry {
  rank: number;
  player_id: number;
  player_name: string;
  champion_id: number;
  champion_name: string;
  class_name: string;
  elo: number;
  phi: number;
  total_matches: number;
  total_wins: number;
  win_rate: number | null;
  region: string | null;
}

/**
 * Fetch champion elo data for client consumers.
 *
 * refs: none
 * I/O types: `params: { role?: string; championId?: number; limit?: number; queueId?: number; } -> Promise<{ data: ChampionEloEntry[]; total: number }>`.
 * Request `GET '/players/leaderboard/champion-elo?${query.toString()}'` through the shared API transport. Return `{ data: [], total: 0 }` on a caught request failure.
 */
export async function fetchChampionElo(params: {
  role?: string;
  championId?: number;
  limit?: number;
  queueId?: number;
}): Promise<{ data: ChampionEloEntry[]; total: number }> {
  const query = new URLSearchParams();
  if (params.role) query.set('role', params.role);
  if (params.championId) query.set('championId', String(params.championId));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.queueId) query.set('queueId', String(params.queueId));
  try {
    const raw = await fetchJson<{ data: Array<any>; total: number }>(
      `/players/leaderboard/champion-elo?${query.toString()}`,
      { unwrapData: false }
    );
    // Coerce PostgreSQL NUMERIC strings to numbers
    const coerced: ChampionEloEntry[] = (raw.data ?? []).map((r) => ({
      rank: Number(r.rank),
      player_id: Number(r.player_id),
      player_name: String(r.player_name),
      champion_id: Number(r.champion_id),
      champion_name: String(r.champion_name),
      class_name: String(r.class_name),
      elo: Number(r.elo),
      phi: Number(r.phi),
      total_matches: Number(r.total_matches),
      total_wins: Number(r.total_wins),
      win_rate: r.win_rate != null ? Number(r.win_rate) : null,
      region: r.region ?? null,
    }));
    return { data: coerced, total: raw.total ?? 0 };
  } catch (e) {
    // Propagate: failed fetch must not return empty data (wiki: frontend-async-ui.md L42)
    throw e;
  }
}

/**
 * Rank a player performance value with nullable match, champion, and coverage context.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PerformanceLeaderboardEntry {
  rank: number;
  matchId: string | null;
  playerId: number;
  playerName: string;
  championName: string | null;
  championId: number | null;
  className: string | null;
  value: number;
  region: string | null;
  platform: string | null;
  totalMatches: number | null;
}

/**
 * Fetch performance leaderboard data for client consumers.
 *
 * refs: none
 * I/O types: `params: { metric: 'dpm' | 'hpm' | 'gpm' | 'cpm' | 'spm'; limit?: number; role?: string; region?: string; queueId?: number; scope?: 'ranked' | 'casual'; mode?: 'match' | 'account' | 'champion'; } -> Promise<PerformanceLeaderboardEntry[]>`.
 * Request `GET '/players/leaderboard/performance?${query.toString()}'` through the shared API transport. Return `[]` on a caught request failure.
 */
export async function fetchPerformanceLeaderboard(params: {
  metric: 'dpm' | 'hpm' | 'gpm' | 'cpm' | 'spm';
  limit?: number;
  role?: string;
  region?: string;
  queueId?: number;
  scope?: 'ranked' | 'casual';
  mode?: 'match' | 'account' | 'champion';
}): Promise<PerformanceLeaderboardEntry[]> {
  const query = new URLSearchParams();
  query.set('metric', params.metric);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.role) query.set('role', params.role);
  if (params.region) query.set('region', params.region);
  if (params.queueId != null) query.set('queueId', String(params.queueId));
  if (params.scope) query.set('scope', params.scope);
  if (params.mode) query.set('mode', params.mode);
  try {
    const response = await fetchJson<{ mode?: string; data: Array<{
      rank: number; match_id: number | string | null; player_id: number; player_name: string;
      champion_name: string | null; champion_id: number | null; class_name: string | null;
      value: number | string; region: string | null; platform: string | null; total_matches?: number | string | null;
    }>}>(`/players/leaderboard/performance?${query.toString()}`, { unwrapData: false });
    if (params.mode && response.mode !== params.mode) return [];
    return (response.data ?? []).map((r) => ({
      rank: Number(r.rank),
      matchId: r.match_id == null ? null : String(r.match_id),
      playerId: Number(r.player_id),
      playerName: r.player_name,
      championName: r.champion_name ?? null,
      championId: r.champion_id ?? null,
      className: r.class_name ?? null,
      value: typeof r.value === 'string' ? Number(r.value) : r.value,
      region: r.region ?? null,
      platform: r.platform ?? null,
      totalMatches: r.total_matches == null ? null : Number(r.total_matches),
    }));
  } catch (e) {
    // Propagate: failed fetch must not return empty data (wiki: frontend-async-ui.md L42)
    throw e;
  }
}

/**
 * Rank account or champion level and XP with class/champion placements and nullable performance.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerLevelLeaderboardEntry {
  rank: number;
  classRank: number | null;
  championRank: number | null;
  className: string | null;
  playerId: number;
  playerName: string;
  championId: number | null;
  championName: string | null;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  winRate: number | null;
  kda: number | null;
  region: string | null;
  platform: string | null;
}

/**
 * Filter level leaderboards by player, role, or champion.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerLevelLeaderboardFilters {
  playerId?: number;
  role?: 'Frontline' | 'Damage' | 'Flank' | 'Support';
  championId?: number;
}

/**
 * Fetch account-level or champion-mastery-level leaderboard rows. · refs: none
 * I/O types: `mode: 'account' | 'champion'; limit: number; filters: PlayerLevelLeaderboardFilters -> Promise<PlayerLevelLeaderboardEntry[]>`.
 */
export async function fetchPlayerLevelLeaderboard(mode: 'account' | 'champion', limit = 100, filters: PlayerLevelLeaderboardFilters = {}): Promise<PlayerLevelLeaderboardEntry[]> {
  const query = new URLSearchParams({ mode, limit: String(limit) });
  if (filters.playerId != null) query.set('playerId', String(filters.playerId));
  if (filters.role != null) query.set('role', filters.role);
  if (filters.championId != null) query.set('championId', String(filters.championId));
  try {
    const raw = await fetchJson<Array<{
      rank: number; class_rank: number | null; champion_rank: number | null; class_name: string | null;
      player_id: number; player_name: string;
      champion_id: number | null; champion_name: string | null;
      level: number | string; xp: number | string; wins: number | string; losses: number | string;
      win_rate: number | string | null; kda: number | string | null; region: string | null; platform: string | null;
    }>>(`/players/leaderboard/levels?${query.toString()}`);
    return raw.map((row) => ({
      rank: Number(row.rank),
      classRank: row.class_rank == null ? null : Number(row.class_rank),
      championRank: row.champion_rank == null ? null : Number(row.champion_rank),
      className: row.class_name ?? null,
      playerId: Number(row.player_id),
      playerName: String(row.player_name),
      championId: row.champion_id == null ? null : Number(row.champion_id),
      championName: row.champion_name ?? null,
      level: Number(row.level),
      xp: Number(row.xp),
      wins: Number(row.wins),
      losses: Number(row.losses),
      winRate: row.win_rate == null ? null : Number(row.win_rate),
      kda: row.kda == null ? null : Number(row.kda),
      region: row.region ?? null,
      platform: row.platform ?? null,
    }));
  } catch (e) {
    // Propagate: failed fetch must not return empty data (wiki: frontend-async-ui.md L42)
    throw e;
  }
}

/**
 * Summarize a performance metric distribution with extrema and statistical aggregates.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PerformanceMetricSummary {
  min: number;
  max: number;
  mean: number;
  median: number;
  mode: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  sampleSize: number;
}

/**
 * Name a backend-supported performance metric. I/O: string literal -> PerformanceMetricKey.
 * refs: endpoints: GET /stats/performance-metrics
 */
export type PerformanceMetricKey = 'dpm' | 'wpm' | 'apm' | 'hpm' | 'shpm' | 'gpm' | 'cpm' | 'egpm' | 'spm' | 'kda' | 'kpm' | 'deaths_per_minute';

/**
 * Group performance metric summaries returned for the selected population.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type PerformanceMetricsResponse = Partial<Record<PerformanceMetricKey, PerformanceMetricSummary>>;

/** The full performance-page payload (dashboard, comparison, and population scope).
 *
 * refs: none
 */
export type PerformancePageData = {
  scope: PerformanceScope;
  queueId: number;
  metric: GamePerformanceMetric;
  dashboard: { summary: PerformanceMetricSummary; roles: Record<string, PerformanceMetricSummary> };
  comparison: {
    results: Array<{ metric: PerformanceMetricKey; rows: ChampionPerformanceDistribution[] }>;
    details: StatsChampion[];
    global: PerformanceMetricsResponse;
    classAverages?: Record<string, PerformanceMetricsResponse>;
  };
};

/** The performance-dashboard subset of the full performance-page payload.
 *
 * refs: none
 */
export type PerformanceDashboardPageData = Pick<PerformancePageData, "scope" | "queueId" | "metric" | "dashboard">;

function mapMetricSummary(raw: any): PerformanceMetricSummary {
  return {
    min: Number(raw?.min ?? 0),
    max: Number(raw?.max ?? 0),
    mean: Number(raw?.mean ?? 0),
    median: Number(raw?.median ?? 0),
    mode: Number(raw?.mode ?? 0),
    p10: Number(raw?.p10 ?? 0),
    p25: Number(raw?.p25 ?? 0),
    p75: Number(raw?.p75 ?? 0),
    p90: Number(raw?.p90 ?? 0),
    sampleSize: Number(raw?.sample_size ?? raw?.sampleSize ?? 0),
  };
}

/**
 * Fetch performance metrics data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/performance-metrics${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `{}` on a caught request failure.
 * I/O types: `params?: { metric?: PerformanceMetricKey; role?: string; queueId?: number; tierMin?: number; tierMax?: number; scope?: 'ranked' | 'casual'; } -> Promise<PerformanceMetricsResponse>`.
 */
export async function fetchPerformanceMetrics(params?: {
  metric?: PerformanceMetricKey;
  role?: string;
  queueId?: number;
  tierMin?: number;
  tierMax?: number;
  scope?: 'ranked' | 'casual';
}): Promise<PerformanceMetricsResponse> {
  const query = new URLSearchParams();
  if (params?.metric) query.set('metric', params.metric);
  if (params?.role) query.set('role', params.role);
  if (params?.queueId != null) query.set('queueId', String(params.queueId));
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  if (params?.scope) query.set('scope', params.scope);
  try {
    const raw = await fetchJson<Record<string, any>>(`/stats/performance-metrics${query.toString() ? `?${query.toString()}` : ''}`);
    return Object.fromEntries(
      Object.entries(raw).filter(([metric]) => ['dpm', 'wpm', 'apm', 'hpm', 'shpm', 'gpm', 'cpm', 'egpm', 'spm', 'kda', 'kpm', 'deaths_per_minute'].includes(metric))
        .map(([metric, summary]) => [metric, mapMetricSummary(summary)])
    ) as PerformanceMetricsResponse;
  } catch (e) {
    // Propagate: failed fetch must not return empty data (wiki: frontend-async-ui.md L42)
    throw e;
  }
}

/**
 * Fetch the global and each class's summary in one cacheable API response.
 * The metrics page used to make five nearly identical requests per tab.
 * refs: none
 * I/O types: `metric: PerformanceMetricKey; scope: 'ranked' | 'casual'; queueId: number -> Promise<{ summary: PerformanceMetricSummary; roles: Record<string, PerformanceMetricSummary>; }>`.
 */
export async function fetchPerformanceMetricDashboard(metric: PerformanceMetricKey, scope: 'ranked' | 'casual' = 'ranked', queueId: number = scope === 'ranked' ? 486 : 424): Promise<{
  summary: PerformanceMetricSummary;
  roles: Record<string, PerformanceMetricSummary>;
}> {
  const query = new URLSearchParams({ metric, includeRoles: '1', scope, queueId: String(queueId) });
  const raw = await fetchJson<Record<string, any>>(`/stats/performance-metrics?${query.toString()}`, { retries: 1, timeoutMs: 1500 });
  if (!raw[metric] || (raw.scope && raw.scope !== scope) || (scope === 'casual' && (raw.queue_ids?.length !== 1 || raw.queue_ids[0] !== queueId))) throw new Error('Performance population mismatch or missing measure');
  return {
    summary: mapMetricSummary(raw[metric]),
    roles: Object.fromEntries(
      Object.entries(raw.roles ?? {}).map(([role, summary]) => [role, mapMetricSummary(summary)])
    ),
  };
}

/**
 * Describe one champion performance distribution and its sample coverage.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionPerformanceDistribution {
  championId: number;
  championName: string;
  className: string;
  min: number;
  max: number;
  mean: number;
  median: number;
  mode: number;
  p10: number;
  p90: number;
  avgValue: number;
  totalMatches: number;
}

/**
 * Fetch champion performance distributions data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/performance-metrics/by-champion?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params: { metric: PerformanceMetricKey; championId?: number; queueId?: number; } -> Promise<ChampionPerformanceDistribution[]>`.
 */
type ChampionPerformanceRow = {
  champion_id: number; champion_name: string; class: string;
  min: number | string; max: number | string; mean: number | string;
  median: number | string; mode: number | string; p10?: number | string; p90?: number | string; avg_value: number | string;
  total_matches: number;
};

/** Fetch the stats owner's complete comparison in one cached request.
 *
 * I/O: in (params: { queueId: number; scope: string }) -> out Promise<Array<{ metric: PerformanceMetricKey; rows: ChampionPerformanceDistribution[] }>>
 *
 * refs: none
 */
export async function fetchChampionPerformanceComparison(params: {
  queueId: number; scope: 'ranked' | 'casual';
}): Promise<Array<{ metric: PerformanceMetricKey; rows: ChampionPerformanceDistribution[] }>> {
  const query = new URLSearchParams({ scope: params.scope, queueId: String(params.queueId), metric: 'all' });
  const groups = await fetchJson<Array<{ metric: PerformanceMetricKey; rows: ChampionPerformanceRow[] }>>(
    `/stats/performance-metrics/by-champion?${query.toString()}`,
  );
  return groups.map(group => ({ metric: group.metric, rows: mapChampionPerformanceRows(group.rows) }));
}

/** Fetch per-champion performance distributions for a selected metric.
 *
 * I/O: in (params: { metric: PerformanceMetricKey; championId?: number; queueId?: number; scope?: string }) -> out Promise<ChampionPerformanceDistribution[]>
 *
 * refs: none
 */
export async function fetchChampionPerformanceDistributions(params: {
  metric: PerformanceMetricKey;
  championId?: number;
  queueId?: number;
  scope?: 'ranked' | 'casual';
}): Promise<ChampionPerformanceDistribution[]> {
  const query = new URLSearchParams();
  if (params.scope) query.set('scope', params.scope);
  query.set('metric', params.metric);
  if (params.championId != null) query.set('championId', String(params.championId));
  if (params.queueId != null) query.set('queueId', String(params.queueId));
  const raw = await fetchJson<ChampionPerformanceRow[]>(`/stats/performance-metrics/by-champion?${query.toString()}`);
  return mapChampionPerformanceRows(raw);
}

function mapChampionPerformanceRows(raw: ChampionPerformanceRow[]): ChampionPerformanceDistribution[] {
  return raw.map((r) => ({
    championId: r.champion_id,
    championName: r.champion_name,
    className: r.class,
    min: Number(r.min ?? 0),
    max: Number(r.max ?? 0),
    mean: Number(r.mean ?? 0),
    median: Number(r.median ?? 0),
    mode: Number(r.mode ?? 0),
    p10: Number(r.p10 ?? 0),
    p90: Number(r.p90 ?? 0),
    avgValue: Number(r.avg_value ?? 0),
    totalMatches: Number(r.total_matches ?? 0),
  }));
}

/**
 * Associate a baseline value with its population dimensions.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface BaselineEntry {
  role: string;
  queueId: number;
  avgCpm: number;
  avgDpm: number;
  avgHpm: number;
  avgShpm: number | null;
  avgSpm: number | null;
  avgKda: number;
  p10Cpm: number;
  p90Cpm: number;
  p10Dpm: number;
  p90Dpm: number;
  avgEcpm: number;
  p10Ecpm: number;
  p25Ecpm: number;
  p75Ecpm: number;
  p90Ecpm: number;
  maxEcpm: number;
  sampleSize: number;
  updatedAt: string | null;
}

/**
 * Fetch baselines data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/baselines${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { role?: string; queueId?: number; tierMin?: number; tierMax?: number } -> Promise<BaselineEntry[]>`.
 */
export async function fetchBaselines(params?: { role?: string; queueId?: number; tierMin?: number; tierMax?: number }): Promise<BaselineEntry[]> {
  const query = new URLSearchParams();
  if (params?.role) query.set('role', params.role);
  if (params?.queueId) query.set('queueId', String(params.queueId));
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  try {
    const raw = await fetchJson<Array<{
      role: string; queue_id: number;
      avg_gpm: number; avg_dpm: number; avg_hpm: number;
      avg_shpm: number; avg_spm: number; avg_kda: number;
      p10_gpm: number; p90_gpm: number; p10_dpm: number; p90_dpm: number;
      avg_egpm: number; p10_egpm: number; p25_egpm: number; p75_egpm: number; p90_egpm: number; max_egpm: number;
      sample_size: number; updated_at?: string | null;
    }>>(`/stats/baselines${query.toString() ? `?${query.toString()}` : ''}`);
    const mapped = raw.map(r => ({
      role: r.role, queueId: r.queue_id,
      avgCpm: Number(r.avg_gpm ?? 0), avgDpm: Number(r.avg_dpm ?? 0), avgHpm: Number(r.avg_hpm ?? 0),
      avgShpm: r.avg_shpm == null ? null : Number(r.avg_shpm), avgSpm: r.avg_spm == null ? null : Number(r.avg_spm), avgKda: Number(r.avg_kda ?? 0),
      p10Cpm: Number(r.p10_gpm ?? 0), p90Cpm: Number(r.p90_gpm ?? 0), p10Dpm: Number(r.p10_dpm ?? 0), p90Dpm: Number(r.p90_dpm ?? 0),
      avgEcpm: Number(r.avg_egpm ?? 0), p10Ecpm: Number(r.p10_egpm ?? 0), p25Ecpm: Number(r.p25_egpm ?? 0),
      p75Ecpm: Number(r.p75_egpm ?? 0), p90Ecpm: Number(r.p90_egpm ?? 0), maxEcpm: Number(r.max_egpm ?? 0),
      sampleSize: Number(r.sample_size ?? 0),
      updatedAt: r.updated_at ?? null,
    }));
    if (!mapped.some((row) => row.role === 'Global')) {
      const global = (await fetchPerformanceMetrics({
        metric: 'egpm', queueId: params?.queueId, tierMin: params?.tierMin, tierMax: params?.tierMax,
      })).egpm;
      if (global) {
        mapped.unshift({
          role: 'Global', queueId: params?.queueId ?? 486,
          avgCpm: global.mean, avgDpm: 0, avgHpm: 0, avgShpm: null, avgSpm: null, avgKda: 0,
          p10Cpm: global.p10, p90Cpm: global.p90, p10Dpm: 0, p90Dpm: 0,
          avgEcpm: global.mean, p10Ecpm: global.p10, p25Ecpm: global.p25,
          p75Ecpm: global.p75, p90Ecpm: global.p90, maxEcpm: global.max,
          sampleSize: global.sampleSize, updatedAt: null,
        });
      }
    }
    return mapped;
  } catch (e) {
    // Propagate: failed fetch must not return empty data (wiki: frontend-async-ui.md L42)
    throw e;
  }
}

/**
 * Summarize match activity for a region.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface RegionStat {
  regionCode: string;
  regionName: string;
  continent: string;
  avgDuration: number;
  topChampions: Array<{ championName: string; championId: number; wins: number; totalPlays: number; winRate: number }>;
}

/**
 * Summarize observed champion loadout performance.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface LoadoutStat {
  deckHash: string;
  championId: number;
  championName: string;
  totalMatches: number;
  totalUses: number;
  wins: number;
  losses: number;
  winRate: number;
  rankedWins: number;
  rankedWinRate: number;
  highTierWins: number;
  highTierWinRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDpm: number;
  avgHpm: number;
  loadoutItems: Array<{ item_name: string; usage_rate: number }> | null;
  lastRefreshed: string;
}

/**
 * Summarize an item selection and its match performance.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ItemStat {
  itemId: number;
  itemName: string;
  totalUsage: number;
  winRate: number;
  pickRate?: number;
  slots: ItemDimensionStat[];
  levels: ItemDimensionStat[];
  breakdown: ItemDimensionStat[];
}

/**
 * Combine player-directory overview totals and featured player groups.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayersOverview {
  championEloPlayers: ChampionEloEntry[];
  performanceLeaderboards: Record<string, PerformanceLeaderboardEntry[]>;
  rankedPlayers: RankedPlayer[];
  accountEloPlayers: ClassLeaderboardEntry[];
  cheaterPlayers: CheaterPlayer[];
  boostedPlayers: BoostedPlayer[];
  suspiciousPlayers: CheaterPlayer[];
  weirdoPlayers: CheaterPlayer[];
  hallOfFamePlayers: CheaterPlayer[];
  privateAccounts: PrivateAccountSummary[];
  partyPairs: PartyPairSummary[];
  bestDuo: BestDuoSummary | null;
  communityCounts: {
    cheaters: number;
    exploiters: number;
    boosted: number;
    suspicious: number;
    weirdos: number;
    hallOfFame: number;
    droppers: number;
    afkWintrade: number;
    altAccounts: number;
  };
  directoryCounts: {
    privateAccounts: number;
    parties: number;
    wallShooters: number;
    masterFeeding: number;
    tankDiff: number;
    supportDiff: number;
    dpsDiff: number;
    flankDiff: number;
    noob: number;
    hypercarry: number;
  };
}

function mapBoostedPlayer(row: any): BoostedPlayer {
  const partyMatchCount = Number(row.party_match_count ?? 0);
  return {
    id: String(row.id), name: row.name, platform: row.platform, region: row.region,
    kbmTier: row.kbm_tier ?? null, cheater: Boolean(row.cheater), exploiter: Boolean(row.exploiter), susCount: Number(row.sus_count ?? 0),
    dropper: Boolean(row.dropper), afkWintrade: Boolean(row.afk_wintrade),
    // The boosted directory deliberately keeps every observed association, but
    // the visible moderation tag begins at five cumulative matches.
    boosted: hasPlayerTag(partyMatchCount), altAccount: Boolean(row.alt_account),
    weirdoCount: Number(row.weirdo_count ?? 0), hallOfFameCount: Number(row.hall_of_fame_count ?? 0),
    avgDpm: row.avg_dpm ?? null, avgHpm: row.avg_hpm ?? null,
    avgCpm: row.avg_egpm ?? null, avgSpm: row.avg_spm ?? null,
    totalMatches: Number(row.total_matches ?? 0), winRate: row.win_rate == null ? null : Number(row.win_rate),
    topReasons: [],
    partyMatchCount,
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
    cheaters: (row.cheaters ?? []).map((cheater: any) => ({
      id: String(cheater.id ?? ""),
      name: cheater.name ?? "Unknown player",
      matchCount: Number(cheater.match_count ?? 0),
      firstSeen: cheater.first_seen ?? null,
      lastSeen: cheater.last_seen ?? null,
    })).filter((cheater: { id: string }) => cheater.id.length > 0),
  };
}

/**
 * Fetch boosted players data for client consumers.
 *
 * refs: none
 * Request `GET '/players/boosted?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `{ name, limit = 100, offset = 0 }: { name?: string; limit?: number; offset?: number } -> Promise<BoostedPlayer[]>`.
 */
export async function fetchBoostedPlayers({ name, limit = 100, offset = 0 }: { name?: string; limit?: number; offset?: number } = {}): Promise<BoostedPlayer[]> {
  const query = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), 100)),
    offset: String(Math.max(offset, 0)),
  });
  if (name?.trim()) query.set("name", name.trim());
  if (name?.trim()) query.set("name", name.trim());
  const raw = await fetchJson<any[]>(`/players/boosted?${query.toString()}`);
  return raw.map(mapBoostedPlayer);
}

/**
 * Summarize a frequent co-play partner and shared match performance.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface BestDuoSummary {
  sourcePlayerId: string;
  sourcePlayerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  matchCount: number;
  firstSeen: string;
  lastSeen: string;
  observedDays: number;
  matchesPerWeek: number;
}

/**
 * Describe one co-play partner with match coverage, performance, and role/champion counts.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerRelationshipRow {
  otherPlayerId: string;
  otherPlayerName: string;
  matchCount: number;
  metricMatchCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  metricsComplete: boolean;
  playerRoleCounts: Record<string, number>;
  partnerRoleCounts: Record<string, number>;
  playerChampionCounts: Record<string, number>;
  partnerChampionCounts: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
  sameParty: boolean;
}

/**
 * Aggregate a player co-play network and relationship groups.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type RelationshipScope = "ranked" | "casual";

/** A player's aggregate co-play network (teammates, opponents, party partners).
 *
 * refs: none
 */
export interface PlayerRelationshipSummary {
  playerId: string;
  scope?: RelationshipScope;
  queueIds?: number[];
  totals: {
    uniqueTeammates: number;
    uniqueOpponents: number;
    teammateMatches: number;
    opponentMatches: number;
    partyPartners: number;
    partyMatches: number;
    partyMetricMatches: number;
    partyWins: number;
    partyLosses: number;
  };
  teammates: PlayerRelationshipRow[];
  opponents: PlayerRelationshipRow[];
  partyPartners: PlayerRelationshipRow[];
}

type RawRelationshipRow = {
  other_player_id?: string | number;
  other_player_name?: string | null;
  match_count?: string | number | null;
  metric_match_count?: string | number | null;
  wins?: string | number | null;
  losses?: string | number | null;
  win_rate?: string | number | null;
  metrics_complete?: boolean | null;
  player_role_counts?: Record<string, string | number> | null;
  partner_role_counts?: Record<string, string | number> | null;
  player_champion_counts?: Record<string, string | number> | null;
  partner_champion_counts?: Record<string, string | number> | null;
  first_seen?: string | null;
  last_seen?: string | null;
  same_party?: boolean | null;
};

type RawRelationshipSummary = {
  player_id?: string | number;
  scope?: RelationshipScope;
  queue_ids?: number[];
  totals?: Record<string, string | number | null>;
  teammates?: RawRelationshipRow[];
  opponents?: RawRelationshipRow[];
  party_partners?: RawRelationshipRow[];
};

function mapRelationshipRow(row: RawRelationshipRow): PlayerRelationshipRow {
  const countMap = (value: Record<string, string | number> | null | undefined) => Object.fromEntries(
    Object.entries(value ?? {}).map(([key, count]) => [key, Number(count ?? 0)])
  );
  return {
    otherPlayerId: String(row.other_player_id),
    otherPlayerName: String(row.other_player_name ?? `Player ${row.other_player_id}`),
    matchCount: Number(row.match_count ?? 0),
    metricMatchCount: Number(row.metric_match_count ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    winRate: row.win_rate == null ? null : Number(row.win_rate),
    metricsComplete: Boolean(row.metrics_complete),
    playerRoleCounts: countMap(row.player_role_counts),
    partnerRoleCounts: countMap(row.partner_role_counts),
    playerChampionCounts: countMap(row.player_champion_counts),
    partnerChampionCounts: countMap(row.partner_champion_counts),
    firstSeen: String(row.first_seen ?? ""),
    lastSeen: String(row.last_seen ?? ""),
    sameParty: Boolean(row.same_party),
  };
}

/**
 * Fetch player relationship summary data for client consumers.
 *
 * refs: none
 * Ranked remains the default; casual combines queues 424, 452 and 469.
 * I/O types: `playerId: string | number; limit: number; scope: RelationshipScope -> Promise<PlayerRelationshipSummary>`.
 */
export async function fetchPlayerRelationshipSummary(playerId: string | number, limit = 6, scope: RelationshipScope = "ranked"): Promise<PlayerRelationshipSummary> {
  const raw = await fetchJson<RawRelationshipSummary>(`/coplay/summary/${encodeURIComponent(String(playerId))}?limit=${Math.min(Math.max(limit, 1), 50)}&contract=metrics-v3&scope=${scope}`);
  const totals = raw.totals ?? {};
  return {
    playerId: String(raw.player_id ?? playerId),
    scope: raw.scope ?? scope,
    queueIds: raw.queue_ids ?? (scope === "casual" ? [424, 452, 469] : [486]),
    totals: {
      uniqueTeammates: Number(totals.unique_teammates ?? 0),
      uniqueOpponents: Number(totals.unique_opponents ?? 0),
      teammateMatches: Number(totals.teammate_matches ?? 0),
      opponentMatches: Number(totals.opponent_matches ?? 0),
      partyPartners: Number(totals.party_partners ?? 0),
      partyMatches: Number(totals.party_matches ?? 0),
      partyMetricMatches: Number(totals.party_metric_matches ?? 0),
      partyWins: Number(totals.party_wins ?? 0),
      partyLosses: Number(totals.party_losses ?? 0),
    },
    teammates: (raw.teammates ?? []).map(mapRelationshipRow),
    opponents: (raw.opponents ?? []).map(mapRelationshipRow),
    partyPartners: (raw.party_partners ?? []).map(mapRelationshipRow),
  };
}

/**
 * Fetch boosted player detail data for client consumers.
 *
 * refs: none
 * Request `GET '/players/boosted/${encodeURIComponent(playerId)}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string -> Promise<BoostedPlayerDetail>`.
 */
export async function fetchBoostedPlayerDetail(playerId: string): Promise<BoostedPlayerDetail> {
  const raw = await fetchJson<any>(`/players/boosted/${encodeURIComponent(playerId)}`);
  return {
    player: mapBoostedPlayer(raw.player),
    matches: (raw.matches ?? []).map((row: any) => ({
      matchId: Number(row.match_id),
      entryDatetime: row.entry_datetime ?? null,
      map: row.map == null ? null : String(row.map),
      queueId: Number(row.queue_id ?? 0),
      region: row.region == null ? null : String(row.region),
      durationSeconds: Number(row.duration_seconds ?? 0),
      team1Score: Number(row.team1_score ?? 0),
      team2Score: Number(row.team2_score ?? 0),
      winningTaskForce: Number(row.winning_task_force ?? 0),
      championId: row.champion_id == null ? null : Number(row.champion_id),
      championName: row.champion_name == null ? null : String(row.champion_name),
      winStatus: row.win_status == null ? null : String(row.win_status),
      kills: Number(row.kills ?? 0),
      deaths: Number(row.deaths ?? 0),
      assists: Number(row.assists ?? 0),
      leagueTier: Number(row.league_tier ?? 0),
      leaguePoints: Number(row.league_points ?? 0),
      source: String(row.source ?? 'direct'),
      cheaters: (row.cheaters ?? []).map((cheater: any) => ({
        id: String(cheater.id ?? ''),
        name: String(cheater.name ?? 'Unknown player'),
      })).filter((cheater: { id: string }) => cheater.id.length > 0),
    })),
  };
}

/**
 * Normalize the raw evidence-dashboard payload (shared by the pro-only
 * `/players/exploiters/{id}` route and the public `/players/{id}/evidence`
 * route) into the typed `ExploiterEvidenceDetail` shape.
 * I/O types: `raw: any, playerId: string -> ExploiterEvidenceDetail`.
 */
function parseEvidenceDetail(raw: any, playerId: string): ExploiterEvidenceDetail {
  return {
    player: {
      id: String(raw.player?.id ?? playerId),
      name: String(raw.player?.name ?? "Unknown player"),
      platform: String(raw.player?.platform ?? "Unknown"),
      region: String(raw.player?.region ?? "Unknown"),
      cheater: Boolean(raw.player?.cheater),
      exploiter: Boolean(raw.player?.exploiter),
    },
    matches: (raw.matches ?? []).map((row: any) => ({
      matchId: Number(row.match_id),
      entryDatetime: row.entry_datetime ?? null,
      map: row.map == null ? null : String(row.map),
      queueId: Number(row.queue_id ?? 0),
      queueName: String(row.queue_name ?? "Unknown"),
      region: row.region == null ? null : String(row.region),
      durationSeconds: Number(row.duration_seconds ?? 0),
      population: String(row.population ?? "unknown"),
      statsScope: String(row.stats_scope ?? "unknown"),
      championId: row.champion_id == null ? null : Number(row.champion_id),
      championName: row.champion_name == null ? null : String(row.champion_name),
      winStatus: row.win_status == null ? null : String(row.win_status),
      kills: Number(row.kills ?? 0),
      deaths: Number(row.deaths ?? 0),
      assists: Number(row.assists ?? 0),
      talentId: Number(row.talent_id),
      talentName: String(row.talent_name ?? `Talent ${row.talent_id}`),
    })),
    cosmeticEvidence: (raw.cosmeticEvidence ?? []).map((row: any) => ({
      kind: String(row.kind ?? "unknown"),
      name: String(row.name ?? ""),
      reason: String(row.reason ?? ""),
      accountCreatedDate: row.accountCreatedDate ?? null,
      observedDate: row.observedDate ?? null,
    })),
    flagEvidence: (raw.flagEvidence ?? []).map((row: any) => ({
      id: Number(row.id),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      matchId: row.matchId == null ? null : Number(row.matchId),
      sourceUrl: row.sourceUrl == null ? null : String(row.sourceUrl),
      origin: row.origin === "automated" || row.origin === "player_submitted" ? row.origin : "unknown",
      createdAt: String(row.createdAt ?? ""),
    })),
    flags: (raw.flags ?? []).map((row: any) => ({
      voteType: String(row.voteType ?? "unknown"),
      reason: String(row.reason ?? ""),
      createdAt: String(row.createdAt ?? ""),
    })),
  };
}

/**
 * Fetch the stored talent facts supporting an administrator-confirmed exploiter tag. · refs: none
 * I/O types: `playerId: string -> Promise<ExploiterEvidenceDetail>`.
 */
export async function fetchExploiterEvidence(playerId: string): Promise<ExploiterEvidenceDetail> {
  const raw = await fetchJson<any>(`/players/exploiters/${encodeURIComponent(playerId)}`);
  return parseEvidenceDetail(raw, playerId);
}

/**
 * Fetch a player's published evidence for the public profile page. Uses the
 * public `/players/{id}/evidence` route (not blocked by the public proxy,
 * unlike the pro-only `/players/exploiters/{id}` route) so the public player
 * profile can list a player's evidence above the match history table.
 * I/O types: `playerId: string -> Promise<ExploiterEvidenceDetail>`.
 * refs: endpoints: GET /players/{id}/evidence
 */
export async function fetchPlayerEvidence(playerId: string): Promise<ExploiterEvidenceDetail> {
  const raw = await fetchJson<any>(`/players/${encodeURIComponent(playerId)}/evidence`);
  return parseEvidenceDetail(raw, playerId);
}

/**
 * Fetch the shared player evidence dashboard. Exploiters use the rich
 * evidence payload; cheaters fall back to published user and automated
 * evidence while preserving each server-owned source.
 *
 * I/O: in (playerId: string) -> out Promise<ExploiterEvidenceDetail>
 *
 * refs: endpoints: GET /players/exploiters/:id · GET /cheaters/:id
 */
export async function fetchPlayerEvidenceDashboard(playerId: string): Promise<ExploiterEvidenceDetail> {
  try {
    return await fetchExploiterEvidence(playerId);
  } catch {
    const detail = await fetchCheaterDetail(playerId);
    return {
      player: {
        id: detail.player.id,
        name: detail.player.name,
        platform: detail.player.platform ?? "Unknown",
        region: "Unknown",
        cheater: true,
        exploiter: false,
      },
      matches: [],
      cosmeticEvidence: [],
      flagEvidence: detail.evidence.map((item) => ({
        id: Number(item.id),
        title: item.title,
        description: item.description,
        matchId: item.matchId == null ? null : Number(item.matchId),
        sourceUrl: item.sourceUrl,
        origin: item.origin,
        createdAt: item.createdAt,
      })),
      flags: [],
    };
  }
}

/**
 * Describe an anonymized private subject and its observation coverage.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface PrivateAccountSummary {
  id: number;
  alias: string | null;
  verifiedName: string | null;
  displayName: string;
  partyId: number;
  accountLevel: number;
  masteryLevel: number;
  leagueTier: number;
  leaguePoints: number;
  matchCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  identityStatus: string;
  identityConfidence: number;
  trackingVersion: number;
  cheater: boolean;
  cheaterReason: string | null;
  cheaterMarkedAt: string | null;
  susCount: number;
  topReasons: Array<{ reason: string; count: number }>;
}

/**
 * Describe one observed private-account match appearance.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface PrivateAccountObservationSummary {
  matchId: number;
  privateSlot: number;
  entryDatetime: string | null;
  accountLevel: number;
  masteryLevel: number;
  leagueTier: number;
  leaguePoints: number;
  tpDelta: number | null;
  winStatus: string | null;
  championId: number | null;
  championName: string | null;
  taskForce: number;
  platform: string | null;
  source: string;
  resolutionStatus: string;
  resolutionConfidence: number;
  map: string | null;
  queueId: number;
  region: string | null;
  durationSeconds: number;
}

/**
 * Combine a private-account summary with observed match evidence.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface PrivateAccountDetail {
  account: PrivateAccountSummary;
  observations: PrivateAccountObservationSummary[];
}

/**
 * Summarize a recurring pair of players and their shared matches.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PartyPairSummary {
  sourcePlayerId: number;
  sourcePlayerName: string;
  targetPlayerId: number;
  targetPlayerName: string;
  matchCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * Summarize a recurring multi-player stack and its shared matches.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PartyStackSummary {
  groupKey: string;
  stackSize: number;
  players: Array<{ id: number; name: string }>;
  matchCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * Combine a pair/stack identity, optional party summary, and paginated match history.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PartyDetail {
  kind: "pairs" | "stacks";
  key: string;
  party: {
    groupKey: string | null;
    stackSize: number;
    players: Array<{ id: number; name: string }>;
    matchCount: number;
  } | null;
  matches: MatchSearchResult[];
  total: number;
  page: { current: number; size: number; totalPages: number };
}

/**
 * Page player-directory records with pagination totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerDirectoryPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function mapPrivateAccount(row: any): PrivateAccountSummary {
  const id = Number(row.id);
  const storedAlias = row.alias == null ? "" : String(row.alias).trim();
  const alias = !storedAlias || /^private-\d+$/i.test(storedAlias)
    ? `P-${String(id).padStart(6, "0")}`
    : storedAlias;
  const verifiedName = row.verified_name == null ? null : String(row.verified_name);
  return {
    id,
    alias,
    verifiedName,
    displayName: verifiedName ?? alias,
    partyId: Number(row.party_id ?? 0),
    accountLevel: Number(row.account_level ?? 0),
    masteryLevel: Number(row.mastery_level ?? 0),
    leagueTier: Number(row.league_tier ?? 0),
    leaguePoints: Number(row.league_points ?? 0),
    matchCount: Number(row.match_count ?? 0),
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
    identityStatus: String(row.identity_status ?? 'inferred'),
    identityConfidence: Number(row.identity_confidence ?? 0),
    trackingVersion: Number(row.tracking_version ?? 1),
    cheater: Boolean(row.cheater),
    cheaterReason: row.cheater_reason == null ? null : String(row.cheater_reason),
    cheaterMarkedAt: row.cheater_marked_at ?? null,
    susCount: Number(row.sus_count ?? 0),
    topReasons: (Array.isArray(row.top_reasons) ? row.top_reasons : []).map((reason: any) => ({
      reason: String(reason.reason ?? ''),
      count: Number(reason.count ?? 0),
    })).filter((reason: { reason: string }) => reason.reason.length > 0),
  };
}

function mapPartyPair(row: any): PartyPairSummary {
  return {
    sourcePlayerId: Number(row.source_player_id),
    sourcePlayerName: String(row.source_player_name ?? 'Unknown'),
    targetPlayerId: Number(row.target_player_id),
    targetPlayerName: String(row.target_player_name ?? 'Unknown'),
    matchCount: Number(row.match_count ?? 0),
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
  };
}

/**
 * Fetch private accounts directory data for client consumers.
 *
 * refs: none
 * Request `GET '/player-ext/private?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params: { page?: number; pageSize?: number; query?: string; cheater?: boolean; suspicious?: boolean } -> Promise<PlayerDirectoryPage<PrivateAccountSummary>>`.
 */
export async function fetchPrivateAccountsDirectory(params: { page?: number; pageSize?: number; query?: string; cheater?: boolean; suspicious?: boolean } = {}): Promise<PlayerDirectoryPage<PrivateAccountSummary>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 24));
  const query = new URLSearchParams({ page: String(page), perPage: String(pageSize) });
  if (params.query?.trim()) query.set('q', params.query.trim());
  if (params.cheater !== undefined) query.set('cheater', String(params.cheater));
  if (params.suspicious !== undefined) query.set('suspicious', String(params.suspicious));
  const rows = await fetchJson<any[]>(`/player-ext/private?${query.toString()}`);
  const total = Number(rows[0]?.total_count ?? 0);
  return { items: rows.map(mapPrivateAccount), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Fetch private account detail data for client consumers.
 *
 * refs: none
 * Request `GET '/player-ext/private/${privateId}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `privateId: number -> Promise<PrivateAccountDetail>`.
 */
export async function fetchPrivateAccountDetail(privateId: number): Promise<PrivateAccountDetail> {
  const raw = await fetchJson<any>(`/player-ext/private/${privateId}`);
  return {
    account: mapPrivateAccount(raw.account),
    observations: (raw.observations ?? []).map((row: any) => ({
      matchId: Number(row.match_id),
      privateSlot: Number(row.private_slot ?? 0),
      entryDatetime: row.entry_datetime ?? null,
      accountLevel: Number(row.account_level ?? 0),
      masteryLevel: Number(row.mastery_level ?? 0),
      leagueTier: Number(row.league_tier ?? 0),
      leaguePoints: Number(row.league_points ?? 0),
      tpDelta: row.tp_delta == null ? null : Number(row.tp_delta),
      winStatus: row.win_status == null ? null : String(row.win_status),
      championId: row.champion_id == null ? null : Number(row.champion_id),
      championName: row.champion_name == null ? null : String(row.champion_name),
      taskForce: Number(row.task_force ?? 0),
      platform: row.platform == null ? null : String(row.platform),
      source: String(row.source ?? 'direct'),
      resolutionStatus: String(row.resolution_status ?? 'unresolved'),
      resolutionConfidence: Number(row.resolution_confidence ?? 0),
      map: row.map == null ? null : String(row.map),
      queueId: Number(row.queue_id ?? 0),
      region: row.region == null ? null : String(row.region),
      durationSeconds: Number(row.duration_seconds ?? 0),
    })),
  };
}

/**
 * Fetch party pairs directory data for client consumers.
 *
 * refs: none
 * Request `GET '/coplay/parties?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params: { page?: number; pageSize?: number; query?: string } -> Promise<PlayerDirectoryPage<PartyPairSummary>>`.
 */
export async function fetchPartyPairsDirectory(params: { page?: number; pageSize?: number; query?: string } = {}): Promise<PlayerDirectoryPage<PartyPairSummary>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 24));
  const query = new URLSearchParams({ page: String(page), perPage: String(pageSize), kind: 'pairs' });
  if (params.query?.trim()) query.set('q', params.query.trim());
  const rows = await fetchJson<any[]>(`/coplay/parties?${query.toString()}`);
  const total = Number(rows[0]?.total_count ?? 0);
  return { items: rows.map(mapPartyPair), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Fetch party stacks directory data for client consumers.
 *
 * refs: none
 * Request `GET '/coplay/parties?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params: { page?: number; pageSize?: number; query?: string; size?: number | null } -> Promise<PlayerDirectoryPage<PartyStackSummary>>`.
 */
export async function fetchPartyStacksDirectory(params: { page?: number; pageSize?: number; query?: string; size?: number | null } = {}): Promise<PlayerDirectoryPage<PartyStackSummary>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 24));
  const query = new URLSearchParams({ page: String(page), perPage: String(pageSize), kind: 'stacks' });
  if (params.query?.trim()) query.set('q', params.query.trim());
  if (params.size && params.size >= 2 && params.size <= 5) query.set('size', String(params.size));
  const rows = await fetchJson<any[]>(`/coplay/parties?${query.toString()}`);
  const total = Number(rows[0]?.total_count ?? 0);
  const items = rows.map((row): PartyStackSummary => {
    const ids = Array.isArray(row.player_ids) ? row.player_ids.map(Number) : [];
    const names = Array.isArray(row.player_names) ? row.player_names.map(String) : [];
    return {
      groupKey: String(row.group_key),
      stackSize: Number(row.stack_size ?? ids.length),
      players: ids.map((id: number, index: number) => ({ id, name: names[index] ?? `Player ${id}` })),
      matchCount: Number(row.match_count ?? 0),
      firstSeen: row.first_seen ?? null,
      lastSeen: row.last_seen ?? null,
    };
  });
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Fetch pair or stack match history with an encoded party key. Clamp the requested page to at least one and page size to 1-100; normalize response IDs and metrics and return null for an absent party. Network/API failures reject the promise.
 * I/O types: `kind: "pairs" | "stacks"; key: string; params: { page?: number; pageSize?: number } -> Promise<PartyDetail>`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export async function fetchPartyDetail(
  kind: "pairs" | "stacks",
  key: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<PartyDetail> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const query = new URLSearchParams({ page: String(page), perPage: String(pageSize) });
  const raw = await fetchJson<any>(`/coplay/parties/${kind}/${encodeURIComponent(key)}?${query.toString()}`);
  const party = raw.party ? {
    groupKey: raw.party.group_key == null ? null : String(raw.party.group_key),
    stackSize: Number(raw.party.stack_size ?? raw.party.players?.length ?? 2),
    players: (Array.isArray(raw.party.players) ? raw.party.players : []).map((player: any) => ({
      id: Number(player.id),
      name: String(player.name ?? `Player ${player.id}`),
    })),
    matchCount: Number(raw.party.match_count ?? 0),
  } : null;
  return {
    kind,
    key: String(raw.key ?? key),
    party,
    matches: (Array.isArray(raw.matches) ? raw.matches : []).map((match: any) => ({
      match_id: Number(match.match_id ?? 0),
      entry_datetime: String(match.entry_datetime ?? ""),
      map: String(match.map ?? ""),
      queue_id: Number(match.queue_id ?? 0),
      duration_seconds: Number(match.duration_seconds ?? 0),
      region: String(match.region ?? ""),
      champion_id: Number(match.champion_id ?? 0),
      champion_name: String(match.champion_name ?? ""),
      win_status: String(match.win_status ?? ""),
      kills: Number(match.kills ?? 0),
      deaths: Number(match.deaths ?? 0),
      assists: Number(match.assists ?? 0),
      player_count: Number(match.player_count ?? 0),
    })),
    total: Number(raw.total ?? 0),
    page: {
      current: Number(raw.page?.current ?? page),
      size: Number(raw.page?.size ?? pageSize),
      totalPages: Number(raw.page?.totalPages ?? 0),
    },
  };
}

let playersOverviewCache: { value: PlayersOverview; expiresAt: number } | null = null;
let playersOverviewInFlight: Promise<PlayersOverview> | null = null;

/**
 * Normalize the backend overview payload for both server and browser renders. · refs: none
 * I/O types: `raw: any -> PlayersOverview`.
 */
export function mapPlayersOverviewResponse(raw: any): PlayersOverview {
  const mapChampionElo = (row: any): ChampionEloEntry => ({
    rank: Number(row.rank), player_id: Number(row.player_id), player_name: String(row.player_name),
    champion_id: Number(row.champion_id), champion_name: String(row.champion_name), class_name: String(row.class_name),
    elo: Number(row.elo), phi: Number(row.phi), total_matches: Number(row.total_matches),
    total_wins: Number(row.total_wins), win_rate: row.win_rate == null ? null : Number(row.win_rate), region: row.region ?? null,
  });
  const mapPerformance = (row: any): PerformanceLeaderboardEntry => ({
    rank: Number(row.rank), matchId: row.match_id == null ? null : String(row.match_id), playerId: Number(row.player_id), playerName: row.player_name,
    championName: row.champion_name ?? null, championId: row.champion_id == null ? null : Number(row.champion_id),
    className: row.class_name ?? null, value: Number(row.value),
    region: row.region ?? null, platform: row.platform ?? null, totalMatches: row.total_matches == null ? null : Number(row.total_matches),
  });
  const mapRanked = (row: any): RankedPlayer => ({
    rank: Number(row.rank), player_id: String(row.player_id), name: row.name, tier: Number(row.tier), points: Number(row.points),
    prev_rank: row.prev_rank, trend: row.trend, wins: row.wins, losses: row.losses, leaves: row.leaves,
    winRate: row.winrate == null ? undefined : Number(row.winrate), leaveRate: row.leaverate == null ? undefined : Number(row.leaverate),
  });
  const mapAccountElo = (row: any): ClassLeaderboardEntry => ({
    rank: Number(row.rank), playerId: Number(row.player_id), playerName: row.player_name,
    championName: row.champion_name ?? null, championId: row.champion_id == null ? null : Number(row.champion_id),
    elo: Number(row.elo), mu: Number(row.mu), phi: Number(row.phi),
    winRate: row.win_rate == null ? null : Number(row.win_rate), totalMatches: Number(row.total_matches ?? 0),
    totalWins: Number(row.total_wins ?? 0), region: row.region ?? null,
  });
  const mapCommunity = (row: any): CheaterPlayer => ({
    id: String(row.id), name: row.name, platform: row.platform, region: row.region,
    kbmTier: row.kbm_tier ?? null, cheater: row.cheater ?? false, exploiter: row.exploiter ?? false, susCount: Number(row.sus_count ?? 0),
    dropper: Boolean(row.dropper), afkWintrade: Boolean(row.afk_wintrade),
    boosted: Boolean(row.boosted), altAccount: Boolean(row.alt_account),
    weirdoCount: Number(row.weirdo_count ?? 0), hallOfFameCount: Number(row.hall_of_fame_count ?? 0),
    avgDpm: row.avg_dpm == null ? null : Number(row.avg_dpm), avgHpm: row.avg_hpm == null ? null : Number(row.avg_hpm),
    avgCpm: row.avg_egpm == null ? null : Number(row.avg_egpm), avgSpm: row.avg_spm == null ? null : Number(row.avg_spm),
    totalMatches: Number(row.total_matches ?? 0), winRate: row.win_rate == null ? null : Number(row.win_rate),
    topReasons: Array.isArray(row.top_reasons) ? row.top_reasons.map((reason: any) => ({ reason: String(reason?.reason ?? ""), count: Number(reason?.count ?? 0) })).filter((reason: { reason: string }) => reason.reason.length > 0) : [],
  });
  const mapBoosted = (row: any): BoostedPlayer => ({
    ...mapCommunity(row),
    partyMatchCount: Number(row.party_match_count ?? 0),
    firstSeen: row.first_seen ?? null,
    lastSeen: row.last_seen ?? null,
    cheaters: Array.isArray(row.cheaters) ? row.cheaters.map((cheater: any) => ({
      id: String(cheater?.id ?? ""),
      name: String(cheater?.name ?? "Unknown player"),
      matchCount: Number(cheater?.match_count ?? 0),
      firstSeen: cheater?.first_seen ?? null,
      lastSeen: cheater?.last_seen ?? null,
    })).filter((cheater: { id: string }) => cheater.id.length > 0) : [],
  });
  const communityCounts = {
    cheaters: Number(raw.community_counts?.cheaters ?? raw.cheaters?.[0]?.total_count ?? raw.cheaters?.length ?? 0),
    exploiters: Number(raw.community_counts?.exploiters ?? raw.exploiters?.[0]?.total_count ?? raw.exploiters?.length ?? 0),
    boosted: Number(raw.community_counts?.boosted ?? raw.boosted?.[0]?.total_count ?? raw.boosted?.length ?? 0),
    suspicious: Number(raw.community_counts?.suspicious ?? raw.suspicious?.[0]?.total_count ?? raw.suspicious?.length ?? 0),
    weirdos: Number(raw.community_counts?.weirdos ?? raw.weirdos?.[0]?.total_count ?? raw.weirdos?.length ?? 0),
    hallOfFame: Number(raw.community_counts?.hall_of_fame ?? raw.hall_of_fame?.[0]?.total_count ?? raw.hall_of_fame?.length ?? 0),
    droppers: Number(raw.community_counts?.droppers ?? raw.droppers?.[0]?.total_count ?? raw.droppers?.length ?? 0),
    afkWintrade: Number(raw.community_counts?.afk_wintrade ?? raw.afk_wintrade?.[0]?.total_count ?? raw.afk_wintrade?.length ?? 0),
    altAccounts: Number(raw.community_counts?.alt_accounts ?? raw.alt_accounts?.[0]?.total_count ?? raw.alt_accounts?.length ?? 0),
  };
  const privateAccounts: PrivateAccountSummary[] = (raw.private_accounts ?? []).map(mapPrivateAccount);
  const partyPairs: PartyPairSummary[] = (raw.party_pairs ?? []).map(mapPartyPair);
  const bestDuo: BestDuoSummary | null = raw.best_duo ? {
    sourcePlayerId: String(raw.best_duo.source_player_id),
    sourcePlayerName: String(raw.best_duo.source_player_name ?? "Unknown player"),
    targetPlayerId: String(raw.best_duo.target_player_id),
    targetPlayerName: String(raw.best_duo.target_player_name ?? "Unknown player"),
    matchCount: Number(raw.best_duo.match_count ?? 0),
    firstSeen: String(raw.best_duo.first_seen ?? ""),
    lastSeen: String(raw.best_duo.last_seen ?? ""),
    observedDays: Number(raw.best_duo.observed_days ?? 0),
    matchesPerWeek: Number(raw.best_duo.matches_per_week ?? 0),
  } : null;
  const directoryCounts = {
    privateAccounts: Number(raw.directory_counts?.private_accounts ?? raw.private_accounts?.[0]?.total_count ?? privateAccounts.length),
    parties: Number(raw.directory_counts?.parties ?? raw.party_pairs?.[0]?.total_count ?? partyPairs.length),
    wallShooters: Number(raw.directory_counts?.wall_shooters ?? 0),
    masterFeeding: Number(raw.directory_counts?.master_feeding ?? 0),
    tankDiff: Number(raw.directory_counts?.tank_diff ?? 0),
    supportDiff: Number(raw.directory_counts?.support_diff ?? 0),
    dpsDiff: Number(raw.directory_counts?.dps_diff ?? 0),
    flankDiff: Number(raw.directory_counts?.flank_diff ?? 0),
    noob: Number(raw.directory_counts?.noob ?? 0),
    hypercarry: Number(raw.directory_counts?.hypercarry ?? 0),
  };

  return {
    championEloPlayers: (raw.champion_elo?.data ?? []).map(mapChampionElo),
    performanceLeaderboards: Object.fromEntries(
      Object.entries(raw.performance ?? {}).map(([metric, response]) => [metric, ((response as any)?.data ?? []).map(mapPerformance)]),
    ),
    rankedPlayers: (raw.ranked ?? []).map(mapRanked),
    accountEloPlayers: (raw.account_elo?.data ?? []).map(mapAccountElo),
    cheaterPlayers: (raw.cheaters ?? []).map(mapCommunity),
    boostedPlayers: (raw.boosted ?? []).map(mapBoosted),
    suspiciousPlayers: (raw.suspicious ?? []).map(mapCommunity),
    weirdoPlayers: (raw.weirdos ?? []).map(mapCommunity),
    hallOfFamePlayers: (raw.hall_of_fame ?? []).map(mapCommunity),
    privateAccounts,
    partyPairs,
    bestDuo,
    communityCounts,
    directoryCounts,
  };
}

/**
 * Fetch the directory landing-page data in one request. The short module cache
 * prevents navigation between top-level pages from immediately refetching the
 * same mostly-static leaderboard cards.
 * refs: none
 * I/O types: `none -> Promise<PlayersOverview>`.
 */
export async function fetchPlayersOverview(): Promise<PlayersOverview> {
  if (playersOverviewCache && playersOverviewCache.expiresAt > Date.now()) {
    return playersOverviewCache.value;
  }
  if (playersOverviewInFlight) return playersOverviewInFlight;

  playersOverviewInFlight = (async () => {
    const raw = await fetchJson<any>('/players/overview', { unwrapData: false });
    const overview = mapPlayersOverviewResponse(raw);
    playersOverviewCache = { value: overview, expiresAt: Date.now() + 60_000 };
    return overview;
  })();

  try {
    return await playersOverviewInFlight;
  } finally {
    playersOverviewInFlight = null;
  }
}

/**
 * Summarize match counts and performance for a map.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MapStat {
  name: string;
  totalMatches: number;
  distributionRate: number;
  avgDurationSeconds: number;
}

/**
 * Summarize champion performance on a map.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MapChampionStat {
  championId: number;
  championName: string;
  totalPlays: number;
  wins: number;
  losses: number;
  totalBans: number;
  winRate: number;
  pickRate: number;
  banRate: number;
}

/**
 * Summarize a champion performance across maps.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionMapStat {
  name: string;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
  pickRate: number;
}

/**
 * Summarize talent performance on a map.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MapTalentStat {
  talentId: number;
  talentName: string;
  championId: number;
  championName: string;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
  pickRate: number;
}

/**
 * Summarize item performance on a map.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MapItemStat {
  itemId: number;
  itemName: string;
  totalUses: number;
  wins: number;
  losses: number;
  winRate: number;
  pickRate: number;
}

/**
 * Combine map totals with champion, talent, and item breakdowns.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MapDetailStats {
  map: MapStat;
  champions: MapChampionStat[];
  talents: MapTalentStat[];
  items: MapItemStat[];
  compositions: MatchCompositionStat[];
}

/**
 * Describe a player participating in an alternate-account relationship.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface AltAccountRelationPlayer {
  id: string;
  name: string;
  region: string;
  platform: string;
  cheater: boolean;
  susCount: number;
  dropper: boolean;
  afkWintrade: boolean;
  altAccount: boolean;
}

/**
 * Group players linked by alternate-account relationships.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface AltAccountDirectoryGroup {
  main: AltAccountRelationPlayer;
  altAccounts: Array<AltAccountRelationPlayer & { voteCount: number; lastVotedAt: string | null }>;
  totalVotes: number;
  lastVotedAt: string | null;
}

/**
 * Describe an alternate-account relationship owned by the current user.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface MyAltAccountRelation {
  id: number;
  mainPlayerId: string;
  mainPlayerName: string;
  altPlayerId: string;
  altPlayerName: string;
  createdAt: string;
  updatedAt: string;
}

function mapAltRelationPlayer(row: any, prefix = ''): AltAccountRelationPlayer {
  return {
    id: String(row[`${prefix}id`] ?? ''),
    name: String(row[`${prefix}name`] ?? 'Unknown player'),
    region: String(row[`${prefix}region`] ?? '—'),
    platform: String(row[`${prefix}platform`] ?? '—'),
    cheater: Boolean(row[`${prefix}cheater`]),
    susCount: Number(row[`${prefix}sus_count`] ?? 0),
    dropper: Boolean(row[`${prefix}dropper`]),
    afkWintrade: Boolean(row[`${prefix}afk_wintrade`]),
    altAccount: Boolean(row[`${prefix}alt_account`]),
  };
}

/**
 * Fetch alt account relations directory data for client consumers.
 *
 * refs: none
 * Request `GET '/players/alt-account-relations?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params: { page?: number; pageSize?: number; query?: string } -> Promise<PlayerDirectoryPage<AltAccountDirectoryGroup>>`.
 */
export async function fetchAltAccountRelationsDirectory(params: { page?: number; pageSize?: number; query?: string } = {}): Promise<PlayerDirectoryPage<AltAccountDirectoryGroup>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 24));
  const query = new URLSearchParams({ page: String(page), perPage: String(pageSize) });
  if (params.query?.trim()) query.set('q', params.query.trim());
  const rows = await fetchJson<any[]>(`/players/alt-account-relations?${query.toString()}`);
  const total = Number(rows[0]?.total_count ?? 0);
  const items = rows.map((row): AltAccountDirectoryGroup => ({
    main: mapAltRelationPlayer({
      main_player_id: row.main_player_id,
      main_player_name: row.main_player_name,
      main_player_region: row.main_player_region,
      main_player_platform: row.main_player_platform,
      main_player_cheater: row.main_player_cheater,
      main_player_sus_count: row.main_player_sus_count,
      main_player_dropper: row.main_player_dropper,
      main_player_afk_wintrade: row.main_player_afk_wintrade,
      main_player_alt_account: row.main_player_alt_account,
    }, 'main_player_'),
    altAccounts: (Array.isArray(row.alt_accounts) ? row.alt_accounts : []).map((alt: any) => ({
      ...mapAltRelationPlayer(alt),
      voteCount: Number(alt.vote_count ?? 0),
      lastVotedAt: alt.last_voted_at ?? null,
    })),
    totalVotes: Number(row.total_votes ?? 0),
    lastVotedAt: row.last_voted_at ?? null,
  }));
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Fetch my alt account relations data for client consumers.
 *
 * refs: none
 * Request `GET '/players/${playerId}/alt-account-relations/mine'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string | number -> Promise<MyAltAccountRelation[]>`.
 */
export async function fetchMyAltAccountRelations(playerId: string | number): Promise<MyAltAccountRelation[]> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  const rows = await fetchJson<any[]>(`/players/${playerId}/alt-account-relations/mine`, {
    headers: accountAuthHeaders(token),
    cache: 'no-store',
  });
  return rows.map((row) => ({
    id: Number(row.id),
    mainPlayerId: String(row.main_player_id),
    mainPlayerName: String(row.main_player_name ?? 'Unknown player'),
    altPlayerId: String(row.alt_player_id),
    altPlayerName: String(row.alt_player_name ?? 'Unknown player'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Record the alt account relation choice for the player relation.
 *
 * Accepts playerId, otherPlayerId, otherRole; returns voteAltAccountRelation data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `playerId: string | number; otherPlayerId: string | number; otherRole: 'main' | 'alt' -> Promise<{ success: boolean; replaced: boolean }>`.
 */
export async function voteAltAccountRelation(playerId: string | number, otherPlayerId: string | number, otherRole: 'main' | 'alt'): Promise<{ success: boolean; replaced: boolean }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson(`/players/${playerId}/alt-account-relations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...accountAuthHeaders(token) },
    body: JSON.stringify({ otherPlayerId, otherRole }),
  });
}

/**
 * Clear my alt account relation from the account state.
 *
 * Accepts playerId, otherPlayerId; returns clearMyAltAccountRelation data while reading or changing local auth state without a backend request.
 * refs: none
 * I/O types: `playerId: string | number; otherPlayerId: string | number -> Promise<{ success: boolean; removed: boolean }>`.
 */
export async function clearMyAltAccountRelation(playerId: string | number, otherPlayerId: string | number): Promise<{ success: boolean; removed: boolean }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson(`/players/${playerId}/alt-account-relations/${otherPlayerId}`, {
    method: 'DELETE',
    headers: accountAuthHeaders(token),
  });
}

/**
 * Select the map comparison dimension.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type MapComparisonSection = 'champions' | 'talents' | 'items' | 'compositions';

/**
 * Compare map performance within a selected category.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MapCategoryComparisonStat {
  entityKey: string;
  mapName: string;
  totalCount: number;
  wins: number;
  losses: number;
  totalBans: number;
  winRate: number;
  pickRate: number;
  banRate: number;
}

/**
 * Count observed matches in one hourly bucket.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface HourlyMatchCount {
  date: string;
  hour: number;
  queueId: number;
  matches: {
    NA: number;
    EU: number;
    Asia: number;
    BR: number;
    OCE: number;
    SA: number;
    Unknown: number;
  };
  totalMatches: number;
  fetchedAt: string | null;
}

/**
 * Describe backend database and stored-record totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface DatabaseStats {
  tables: Array<{ name: string; rowCount: number }>;
  timestamp: string;
}

/**
 * Describe service status reported by the backend.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface SystemStatus {
  matches: number;
  players: number;
  pendingPulls: number;
  lastMatch: string | null;
  timestamp: string;
}

/**
 * Describe one upstream Hi-Rez outage observation.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface HirezOutageItem {
  serviceKey: string;
  status: string;
  title: string;
  severity: "critical" | "warning";
  message: string;
  reason: string | null;
  firstDetectedAt: string | null;
  lastDetectedAt: string | null;
  nextProbeAt: string | null;
  probeDue: boolean;
  probeCount: number;
  updatedAt: string | null;
}

/**
 * Summarize the current upstream outage signal.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface HirezOutageSignal {
  source: string;
  message: string;
  observedAt: string | null;
  code: string;
  serviceKey: string;
  title: string;
  severity: "critical" | "warning";
  publicMessage: string;
}

/**
 * Describe Hi-Rez service availability and outage context.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface HirezServiceStatus {
  status: "ok" | "degraded" | "outage";
  outage: boolean;
  degraded: boolean;
  message: string;
  activeOutages: HirezOutageItem[];
  recentSignals: HirezOutageSignal[];
  pendingVendorDebt: number;
  dueVendorDebt: number;
  affectedHours: number;
  nextDebtRetryAt: string | null;
  signalLookbackMinutes: number;
  timestamp: string;
}

/**
 * Describe a site notification with its display and lifecycle fields.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface Notification {
  id: number;
  timestamp: string;
  importance: number;
  message: string;
  readAt?: string | null;
  preview?: string | null;
  href?: string | null;
}

/**
 * Supply editable site-notification fields.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface NotificationInput {
  timestamp?: string;
  importance?: number;
  message: string;
}

/**
 * Describe the site activity banner payload.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ActivityBanner {
  enabled: boolean;
  message: string;
}

// ── Changelog ──

/**
 * Describe a published changelog entry and its display metadata.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChangelogEntry {
  id: number;
  component: string;
  version: string;
  componentVersion: string;
  totalVersion: string | null;
  gitCommit: string;
  gitCommitShort: string;
  gitBranch: string | null;
  deployedAt: string | null;
  source: string | null;
  changelog: string;
  changeCount: number;
  releaseType: "major" | "minor" | "patch";
}

/**
 * Page changelog entries with pagination metadata.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChangelogPage {
  data: ChangelogEntry[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Supply editable fields for an administrator changelog operation.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface AdminChangelogInput {
  changelog: string;
}

/**
 * Identify a component in the site-version payload.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface SiteVersionComponent {
  id: number;
  component: string;
  environment: string;
  version: string;
  gitCommit: string;
  gitCommitShort: string;
  gitBranch: string;
  gitDirty: boolean;
  buildTimestamp: string | null;
  deployedAt: string | null;
  dbSchemaVersion: string;
  source: string;
  metadata: Record<string, unknown>;
}

/**
 * Describe the current frontend-visible site version and components.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface SiteVersion extends SiteVersionComponent {
  timestamp: string | null;
  notes?: string;
  components: SiteVersionComponent[];
}

/**
 * Summarize players or activity within one ranked tier.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface TierStat {
  tier: string;
  tierSort: number;
  totalPlays: number;
  avgWinRate: number;
  percentage: number;
}

/**
 * Combine ranked-tier distribution summaries.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface TierSummary {
  profilePlayers: number;
  avgProfileTier: number;
  matchPlayerRows: number;
  activePlayers: number;
  rankedMatches: number;
  avgParticipationTier: number;
  avgMatchTier: number;
  medianMatchTier: number;
}

// ── Fetch helpers ──

/**
 * Default fetch timeout (ms). Without it, a stalled backend connection causes the
 * frontend to wait indefinitely — especially bad on mobile/slow networks.
 * Most reads use 10 seconds; operations that intentionally wait for durable
 * pipeline completion can opt into a longer request-scoped timeout.
 * refs: none
 */
const FETCH_TIMEOUT_MS = 10000;


/**
 * Fetch json data for client consumers.
 *
 * refs: none
 * Request `GET '${API_BASE}${scopedPath}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `path: string; options?: RequestInit & { retries?: number; unwrapData?: boolean; timeoutMs?: number } -> Promise<T>`.
 */
export async function fetchJson<T>(path: string, options?: RequestInit & { retries?: number; unwrapData?: boolean; timeoutMs?: number }): Promise<T> {
  const endpointForDiagnostics = (candidate: string) => {
    try {
      return new URL(candidate, "https://paladinscat.invalid").pathname.replace(/\/\d+(?=\/|$)/g, "/:id");
    } catch {
      return candidate.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:id");
    }
  };
  const safeErrorCode = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined;
  const safeRequestId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9:_-]{1,100}$/.test(value) ? value : undefined;
  const retries = options?.retries ?? 2;
  const unwrapData = options?.unwrapData ?? true;
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const fetchOptions: RequestInit = { ...options };
  delete (fetchOptions as any).retries;
  delete (fetchOptions as any).unwrapData;
  delete (fetchOptions as any).timeoutMs;
  const headers = new Headers(fetchOptions.headers);
  // Search and general reads share the identity confirmed by getMe. Keep a
  // legacy browser token on same-origin requests when no explicit credential
  // was selected; OIDC accountAuthHeaders continues to prefer its cookie.
  if (!headers.has("authorization") && !headers.has("x-api-key") && typeof window !== "undefined") {
    try {
      if (new URL(API_BASE, window.location.href).origin === window.location.origin) {
        for (const [name, value] of Object.entries(accountAuthHeaders())) headers.set(name, value);
      }
    } catch {
      // An invalid API origin cannot receive an implicit browser credential.
    }
  }
  // Legacy calls may interpolate a missing token. Let same-origin cookie auth
  // proceed instead of sending a malformed bearer credential that takes precedence.
  if (/^Bearer (null|undefined)$/i.test(headers.get("authorization") || "")) headers.delete("authorization");
  // OIDC replaces the host cookie without rewriting an older tab's local
  // token. App-generated legacy headers must not mask that fresh session.
  if (hasCookieAuthSession() && headers.get("authorization") === `Bearer ${getAuthToken()}`) headers.delete("authorization");
  const method = (fetchOptions.method || "GET").toUpperCase();
  const csrf = typeof document !== "undefined" ? csrfHeader(document.cookie, method) : null;
  if (csrf) headers.set("X-CSRF-Token", csrf);
  // Pseudonymized browser fingerprint for security access capture (profile_view
  // / report). Coarse device characteristics only; the backend hashes them.
  for (const [name, value] of Object.entries(fingerprintHeaders())) headers.set(name, value);
  fetchOptions.headers = headers;
  fetchOptions.credentials = "same-origin";

  for (let attempt = 0; attempt <= retries; attempt++) {
    options?.signal?.throwIfAborted();
    // CRITICAL: Add timeout to prevent indefinite hang on stalled backend.
    // AbortSignal.timeout() cancels the fetch if it exceeds the limit.
    // Source: Fault #1 — "No timeout on fetch()"
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const scopedPath = withStoredLobbyTier(path);
    let res: Response;
    try {
      const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
      res = await fetch(`${API_BASE}${scopedPath}`, { ...fetchOptions, signal });
    } catch {
      // A network failure or a timeout abort is transient: retry it with the
      // same backoff as 5xx responses instead of surfacing it immediately.
      clearTimeout(timeoutId);
      options?.signal?.throwIfAborted();
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      const kind = controller.signal.aborted ? "timeout" : "network";
      const requestError = new ApiRequestError(API_ERROR_KEYS.genericFailure, undefined, {
        kind,
        endpoint: endpointForDiagnostics(scopedPath),
        method,
        timeoutMs,
      });
      if (kind === "timeout") requestError.name = "AbortError";
      throw requestError;
    }
    // Cloudflare challenges describe edge admission, not the account session.
    // Do not let their 403 clear cached auth or retry an interactive challenge.
    if (res.headers.get("cf-mitigated") === "challenge") {
      clearTimeout(timeoutId);
      throw new ApiRequestError(API_ERROR_KEYS.genericFailure, res.status, {
        kind: "edge-challenge",
        endpoint: endpointForDiagnostics(scopedPath),
        method,
        code: "CF_CHALLENGE",
      });
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < retries) {
        clearTimeout(timeoutId);
        const backoffMs = 500 * (attempt + 1);
        const retryAfterSeconds = Number(res.headers.get("retry-after"));
        // Busy reads advertise when cache preparation can be retried. Keep the
        // existing attempt limit and bound the server-directed wait to 30s.
        const delayMs = method === "GET" && res.status === 503 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.max(backoffMs, Math.min(retryAfterSeconds * 1000, 30_000))
          : backoffMs;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      const errBody = await res.json().catch(() => null).finally(() => clearTimeout(timeoutId));
      options?.signal?.throwIfAborted();
      if (errBody?.error?.code === "WEBSITE_SESSION_REQUIRED") {
        throw new ApiRequestError(API_ERROR_KEYS.genericFailure, res.status, {
          kind: "session-required",
          endpoint: endpointForDiagnostics(scopedPath),
          method,
          code: "WEBSITE_SESSION_REQUIRED",
        });
      }
      const message = typeof errBody?.error === "string" ? errBody.error : errBody?.error?.message;
      const code = safeErrorCode(errBody?.error?.code);
      const requestId = safeRequestId(errBody?.error?.requestId);
      // Expected client errors are intentionally written by the backend for the
      // person making the request (validation, conflicts, rate limits, and so on).
      // Preserve them instead of collapsing every response into a generic key.
      const isTagClearError = method === "POST" && endpointForDiagnostics(scopedPath) === "/players/:id/clear-tag"
        && ["PLAYER_TAG_BUSY", "PLAYER_TAG_TIMEOUT", "PLAYER_TAG_CLEAR_FAILED"].includes(code || "");
      if ((res.status < 500 || isTagClearError) && typeof message === "string" && message.trim()) {
        throw new ApiRequestError(message.trim(), res.status, {
          kind: "http",
          endpoint: endpointForDiagnostics(scopedPath),
          method,
          code,
          requestId,
        });
      }
      throw new ApiRequestError(API_ERROR_KEYS.genericFailure, res.status, {
        kind: "http",
        endpoint: endpointForDiagnostics(scopedPath),
        method,
        code,
        requestId,
      });
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (error) {
      options?.signal?.throwIfAborted();
      const kind = error instanceof Error && error.name === "AbortError" ? "timeout" : "invalid-response";
      const requestError = new ApiRequestError(API_ERROR_KEYS.genericFailure, res.status, {
        kind,
        endpoint: endpointForDiagnostics(scopedPath),
        method,
        timeoutMs,
      });
      if (kind === "timeout") requestError.name = "AbortError";
      throw requestError;
    } finally {
      clearTimeout(timeoutId);
    }
    options?.signal?.throwIfAborted();
    // Handle normalized list envelopes when callers only need the rows.
    if (unwrapData && json && typeof json === "object" && "data" in json && json.data !== undefined) {
      return json.data as T;
    }
    return json as T;
  }
  throw new ApiRequestError(API_ERROR_KEYS.unexpectedFetchFailure, undefined, {
    kind: "retry-exhausted",
    endpoint: endpointForDiagnostics(path),
    method,
  });
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

function toDisplayPercent(value: number | string | null | undefined): number | null {
  const parsed = numberOrNull(value);
  if (parsed == null) return null;
  return Math.abs(parsed) <= 1 ? Number((parsed * 100).toFixed(2)) : parsed;
}

function splitRoles(roles: unknown): string[] | null {
  if (Array.isArray(roles)) return roles.map(String).filter(Boolean);
  if (typeof roles === 'string') return roles.split(',').map((s) => s.trim()).filter(Boolean);
  return null;
}

// ── System ──

/**
 * Fetch database stats data for client consumers.
 *
 * refs: none
 * Request `GET '/database'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `none -> Promise<DatabaseStats | null>`.
 */
export async function fetchDatabaseStats(): Promise<DatabaseStats | null> {
  try {
    const raw = await fetchJson<{
      tables: Array<{ name: string; row_count: number | string }>;
      timestamp: string;
    }>(`/database`);
    return {
      tables: raw.tables.map((table) => ({
        name: table.name,
        rowCount: Number(table.row_count ?? 0),
      })),
      timestamp: raw.timestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch system status data for client consumers.
 *
 * refs: none
 * Request `GET '/status'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `none -> Promise<SystemStatus | null>`.
 */
export async function fetchSystemStatus(): Promise<SystemStatus | null> {
  try {
    const raw = await fetchJson<{
      matches: number | string;
      players: number | string;
      pendingPulls?: number | string;
      lastMatch?: string | null;
      timestamp: string;
    }>(`/status`);
    return {
      matches: Number(raw.matches ?? 0),
      players: Number(raw.players ?? 0),
      pendingPulls: Number(raw.pendingPulls ?? 0),
      lastMatch: raw.lastMatch ?? null,
      timestamp: raw.timestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch hirez service status data for client consumers.
 *
 * refs: none
 * Request `GET '/system/hirez-status'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `none -> Promise<HirezServiceStatus | null>`.
 */
export async function fetchHirezServiceStatus(): Promise<HirezServiceStatus | null> {
  try {
    const raw = await fetchJson<HirezServiceStatus>(`/system/hirez-status`, { retries: 0, unwrapData: false });
    return {
      ...raw,
      activeOutages: Array.isArray(raw.activeOutages) ? raw.activeOutages : [],
      recentSignals: Array.isArray(raw.recentSignals) ? raw.recentSignals : [],
      pendingVendorDebt: Number(raw.pendingVendorDebt || 0),
      dueVendorDebt: Number(raw.dueVendorDebt || 0),
      affectedHours: Number(raw.affectedHours || 0),
      signalLookbackMinutes: Number(raw.signalLookbackMinutes || 0),
    };
  } catch {
    return null;
  }
}

function mapNotification(raw: {
  id: number;
  timestamp?: string;
  importance?: number | string;
  message: string;
  read_at?: string | null;
  preview?: string | null;
  href?: string | null;
}): Notification {
  return {
    id: raw.id,
    timestamp: raw.timestamp ?? "",
    importance: Number(raw.importance ?? 0),
    message: raw.message,
    readAt: raw.read_at,
    preview: raw.preview,
    href: raw.href,
  };
}

/**
 * IsAuthenticationRejection for the API-client data path.
 *
 * Accepts error; returns isAuthenticationRejection data from local computation without network, authentication, cache, or persistence effects.
 * refs: none
 * I/O types: `error: unknown -> boolean`.
 */
export function isAuthenticationRejection(error: unknown): boolean {
  return error instanceof ApiRequestError
    && error.kind !== "edge-challenge"
    && error.kind !== "session-required"
    && (error.status === 401 || error.status === 403);
}

// ── Notifications ──

/**
 * Fetch notifications data for client consumers.
 *
 * refs: none
 * Request `GET '/notifications${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { limit?: number } -> Promise<Notification[]>`.
 */
export async function fetchNotifications(params?: { limit?: number }): Promise<Notification[]> {
  const query = new URLSearchParams();
  if (params?.limit != null) query.set('limit', String(params.limit));
  try {
    const raw = await fetchJson<any[]>(`/notifications${query.toString() ? `?${query.toString()}` : ''}`);
    return raw.map(mapNotification);
  } catch {
    return [];
  }
}

/**
 * Fetch activity banner data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/activity-banner'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `none -> Promise<ActivityBanner | null>`.
 */
export async function fetchActivityBanner(): Promise<ActivityBanner | null> {
  try {
    const raw = await fetchJson<any>(`/stats/activity-banner`, { retries: 1, unwrapData: false });
    return { enabled: Boolean(raw.enabled), message: String(raw.message ?? "") };
  } catch {
    return null;
  }
}

/**
 * Fetch account site notifications data for client consumers.
 *
 * refs: none
 * Request `GET '/auth/account/site-notifications?limit=${limit}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { limit?: number } -> Promise<Notification[]>`.
 */
export async function fetchAccountSiteNotifications(params?: { limit?: number }): Promise<Notification[]> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const limit = params?.limit ?? 8;
  const rows = await fetchJson<Array<{
    id: number; timestamp?: string; importance?: number | string; message: string; read_at?: string | null;
    preview?: string | null; href?: string | null;
  }>>(`/auth/account/site-notifications?limit=${limit}`, {
    headers: accountAuthHeaders(token),
  });
  return rows.map(mapNotification);
}

/**
 * Mark site notification read in the notification API.
 *
 * Accepts notificationId; returns markSiteNotificationRead data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `notificationId: number -> Promise<void>`.
 */
export async function markSiteNotificationRead(notificationId: number): Promise<void> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  await fetchJson(`/auth/account/site-notifications/${notificationId}/read`, {
    method: "POST",
    headers: accountAuthHeaders(token),
  });
}

/**
 * Dismiss one site notification for the authenticated account.
 *
 * Accepts notificationId; returns dismissSiteNotification data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `notificationId: number -> Promise<void>`.
 */
export async function dismissSiteNotification(notificationId: number): Promise<void> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  await fetchJson(`/auth/account/site-notifications/${notificationId}/dismiss`, {
    method: "POST",
    headers: accountAuthHeaders(token),
  });
}

/**
 * Mark all site notifications read in the notification API.
 *
 * Accepts no arguments; returns markAllSiteNotificationsRead data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `none -> Promise<void>`.
 */
export async function markAllSiteNotificationsRead(): Promise<void> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  await fetchJson(`/auth/account/site-notifications/read-all`, {
    method: "POST",
    headers: accountAuthHeaders(token),
  });
}

/**
 * Fetch admin notifications data for client consumers.
 *
 * refs: none
 * Request `GET '/admin/notifications'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Notification[]>`.
 */
export async function fetchAdminNotifications(): Promise<Notification[]> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<any[]>(
    `/admin/notifications`,
    { headers: accountAuthHeaders(token) }
  );
  return raw.map(mapNotification);
}

/**
 * Create admin notification through the community API.
 *
 * Accepts input; returns createAdminNotification data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `input: NotificationInput -> Promise<Notification>`.
 */
export async function createAdminNotification(input: NotificationInput): Promise<Notification> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<any>(`/admin/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify(input),
  });
  return mapNotification(raw);
}

/**
 * Update admin notification through the account or community API.
 *
 * Accepts id, input; returns updateAdminNotification data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `id: number; input: Partial<NotificationInput> -> Promise<Notification>`.
 */
export async function updateAdminNotification(id: number, input: Partial<NotificationInput>): Promise<Notification> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<any>(`/admin/notifications/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify(input),
  });
  return mapNotification(raw);
}

/**
 * Delete admin notification through the account or community API.
 *
 * Accepts id; returns deleteAdminNotification data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `id: number -> Promise<void>`.
 */
export async function deleteAdminNotification(id: number): Promise<void> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  await fetchJson<{ deleted: boolean; id: number }>(`/admin/notifications/${id}`, {
    method: "DELETE",
    headers: accountAuthHeaders(token),
  });
}

/** One admin-mailbox email message (metadata + optional body).
 *
 * refs: none
 */
export interface AdminEmailMessage {
  id: number;
  address: string;
  direction: "in" | "out";
  imap_uid: number;
  subject: string;
  sender: string;
  recipient: string;
  received_at: string | null;
  read_at: string | null;
  created_at: string;
  body?: string;
}

/** Result of an IMAP mailbox poll (configured flag + inserted count).
 *
 * refs: none
 */
export interface AdminEmailPollResult {
  configured: boolean;
  inserted: number;
  address?: string;
  message?: string;
}

/**
 * Fetch admin email messages for the email UI (inbox/sent).
 *
 * refs: none
 * Request `GET '/admin/email'` with optional `address`/`direction` filters.
 * I/O types: `address?: string; direction?: "in" | "out" -> Promise<AdminEmailMessage[]>`.
 */
export async function fetchAdminEmails(
  address?: string,
  direction?: "in" | "out"
): Promise<AdminEmailMessage[]> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const params = new URLSearchParams();
  if (address) params.set("address", address);
  if (direction) params.set("direction", direction);
  const qs = params.toString();
  const raw = await fetchJson<any[]>(`/admin/email${qs ? `?${qs}` : ""}`, {
    headers: accountAuthHeaders(token),
  });
  return raw;
}

/**
 * Read one admin email message by id (includes body).
 *
 * refs: none
 * I/O types: `id: number -> Promise<AdminEmailMessage>`.
 */
export async function fetchAdminEmail(id: number): Promise<AdminEmailMessage> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  return await fetchJson<AdminEmailMessage>(`/admin/email/${id}`, {
    headers: accountAuthHeaders(token),
  });
}

/**
 * Mark an admin email message read (idempotent).
 *
 * refs: none
 * I/O types: `id: number -> Promise<{ id: number; read_at: string }>`.
 */
export async function markAdminEmailRead(id: number): Promise<{ id: number; read_at: string }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  return await fetchJson<{ id: number; read_at: string }>(`/admin/email/${id}/read`, {
    method: "POST",
    headers: accountAuthHeaders(token),
  });
}

/**
 * Trigger an IMAP poll for the configured mailbox. Returns the number of
 * newly inserted rows; `configured: false` is a friendly no-op state.
 *
 * refs: none
 * I/O types: `none -> Promise<AdminEmailPollResult>`.
 */
export async function pollAdminEmail(): Promise<AdminEmailPollResult> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  return await fetchJson<AdminEmailPollResult>(`/admin/email/poll`, {
    method: "POST",
    headers: accountAuthHeaders(token),
  });
}

/** One exploit-exception record (grant, expiry, and revocation audit fields).
 *
 * refs: none
 */
export interface ExploitExceptionRow {
  playerId: string;
  playerName: string | null;
  reason: string;
  appealRef: string | null;
  grantedAt: string;
  expiresAt: string | null;
  grantedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

/**
 * Fetch all active exploit exceptions for the admin portal.
 * refs: none
 * I/O types: `none -> Promise<ExploitExceptionRow[]>`.
 */
export async function fetchExploitExceptions(): Promise<ExploitExceptionRow[]> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<{ exceptions: any[] }>(`/admin/players/exploiters/exceptioned`, {
    headers: accountAuthHeaders(token),
  });
  return (raw.exceptions ?? []).map((r: any) => ({
    playerId: String(r.player_id),
    playerName: r.player_name ?? null,
    reason: r.reason ?? "",
    appealRef: r.appeal_ref ?? null,
    grantedAt: r.granted_at ?? "",
    expiresAt: r.expires_at ?? null,
    grantedBy: r.granted_by ?? null,
    revokedAt: r.revoked_at ?? null,
    revokedBy: r.revoked_by ?? null,
    revokeReason: r.revoke_reason ?? null,
  }));
}

/**
 * Grant or clear the exploit exception for a Paladins player.
 * refs: none
 * I/O types: `playerId: string; body: { granted: boolean; reason?: string; appealRef?: string; expiresAt?: string } -> Promise<void>`.
 */
export async function setExploitException(
  playerId: string,
  body: { granted: boolean; reason?: string; appealRef?: string; expiresAt?: string },
): Promise<void> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  await fetchJson<{ player: { id: number; name: string | null }; granted: boolean }>(
    `/admin/players/${encodeURIComponent(playerId)}/exploit-exception`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
      body: JSON.stringify(body),
    },
  );
}

/**
 * Fetch admin activity banner data for client consumers.
 *
 * refs: none
 * Request `GET '/admin/activity-banner'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<ActivityBanner>`.
 */
export async function fetchAdminActivityBanner(): Promise<ActivityBanner> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<any>(`/admin/activity-banner`, {
    headers: accountAuthHeaders(token),
    unwrapData: false,
  });
  return { enabled: Boolean(raw.enabled), message: String(raw.message ?? "") };
}

/**
 * Update admin activity banner through the account or community API.
 *
 * Accepts input; returns updateAdminActivityBanner data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `input: ActivityBanner -> Promise<ActivityBanner>`.
 */
export async function updateAdminActivityBanner(input: ActivityBanner): Promise<ActivityBanner> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<any>(`/admin/activity-banner`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify(input),
    unwrapData: false,
  });
  return { enabled: Boolean(raw.enabled), message: String(raw.message ?? "") };
}

// ── Changelog ──

/**
 * Fetch changelog preview data for client consumers.
 *
 * refs: none
 * Request `GET '/meta/changelog?preview=true'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `none -> Promise<ChangelogEntry | null>`.
 */
export async function fetchChangelogPreview(): Promise<ChangelogEntry | null> {
  try {
    const raw = await fetchJson<any>('/meta/changelog?preview=true', { unwrapData: false });
    return raw ? mapChangelogEntry(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch changelog data for client consumers.
 *
 * refs: none
 * Request `GET '/meta/changelog${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `{ data: [], total: 0, page: 1, perPage: 10, totalPages: 1 }` on a caught request failure.
 * I/O types: `params?: { page?: number; perPage?: number } -> Promise<ChangelogPage>`.
 */
export async function fetchChangelog(params?: { page?: number; perPage?: number }): Promise<ChangelogPage> {
  const query = new URLSearchParams();
  if (params?.page != null) query.set('page', String(params.page));
  if (params?.perPage != null) query.set('perPage', String(params.perPage));
  try {
    const raw = await fetchJson<any>(`/meta/changelog${query.toString() ? `?${query.toString()}` : ''}`, { unwrapData: false });
    return {
      data: (raw.data ?? []).map(mapChangelogEntry),
      total: raw.total ?? 0,
      page: raw.page ?? 1,
      perPage: raw.perPage ?? 10,
      totalPages: raw.totalPages ?? 1,
    };
  } catch {
    return { data: [], total: 0, page: 1, perPage: 10, totalPages: 1 };
  }
}

/**
 * Fetch admin changelog data for client consumers.
 *
 * refs: none
 * Request `GET '/admin/changelog'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<ChangelogEntry[]>`.
 */
export async function fetchAdminChangelog(): Promise<ChangelogEntry[]> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<any[]>('/admin/changelog', {
    headers: accountAuthHeaders(token),
  });
  return raw.map(mapChangelogEntry);
}

/**
 * Update admin changelog through the account or community API.
 *
 * Accepts id, input; returns updateAdminChangelog data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `id: number; input: AdminChangelogInput -> Promise<ChangelogEntry>`.
 */
export async function updateAdminChangelog(id: number, input: AdminChangelogInput): Promise<ChangelogEntry> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.notAuthenticated);
  const raw = await fetchJson<any>(`/admin/changelog/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...accountAuthHeaders(token) },
    body: JSON.stringify(input),
  });
  return mapChangelogEntry(raw);
}

function mapChangelogEntry(raw: any): ChangelogEntry {
  const changelog = String(raw?.changelog ?? '');
  const lines = changelog.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const commitLines = lines.filter((line) => /^[0-9a-f]{7,40}\s+\S/i.test(line));
  const fallbackCount = commitLines.length > 0
    ? commitLines.length
    : lines.filter((line) => !/^[-*]?\s*\*\*(added|changed|fixed|removed|refactored|improved|security)\*\*/i.test(line)).length;
  const suppliedCount = raw?.changeCount == null ? Number.NaN : Number(raw.changeCount);
  const changeCount = Number.isInteger(suppliedCount) && suppliedCount >= 0 ? suppliedCount : fallbackCount;
  const releaseType = changeCount >= 10 ? 'major' : changeCount >= 5 ? 'minor' : 'patch';
  return {
    id: Number(raw?.id ?? 0),
    component: String(raw?.component ?? 'legacy-monorepo'),
    version: String(raw?.componentVersion ?? raw?.version ?? ''),
    componentVersion: String(raw?.componentVersion ?? raw?.version ?? ''),
    totalVersion: raw?.totalVersion == null ? null : String(raw.totalVersion),
    gitCommit: String(raw?.gitCommit ?? ''),
    gitCommitShort: String(raw?.gitCommitShort ?? ''),
    gitBranch: raw?.gitBranch ?? null,
    deployedAt: raw?.deployedAt ?? null,
    source: raw?.source ?? null,
    changelog,
    changeCount,
    releaseType,
  };
}

// ── Site Metadata ──

function mapSiteVersionComponent(raw: any): SiteVersionComponent {
  return {
    id: Number(raw?.id ?? 0),
    component: String(raw?.component ?? "stack"),
    environment: String(raw?.environment ?? "unknown"),
    version: String(raw?.version ?? ""),
    gitCommit: String(raw?.gitCommit ?? ""),
    gitCommitShort: String(raw?.gitCommitShort ?? ""),
    gitBranch: String(raw?.gitBranch ?? ""),
    gitDirty: Boolean(raw?.gitDirty),
    buildTimestamp: raw?.buildTimestamp ?? null,
    deployedAt: raw?.deployedAt ?? raw?.timestamp ?? null,
    dbSchemaVersion: String(raw?.dbSchemaVersion ?? ""),
    source: String(raw?.source ?? ""),
    metadata: raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
  };
}

/**
 * Fetch site version data for client consumers.
 *
 * refs: none
 * Request `GET '/meta/version'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `none -> Promise<SiteVersion | null>`.
 */
export async function fetchSiteVersion(): Promise<SiteVersion | null> {
  try {
    const raw = await fetchJson<any>(`/meta/version`, { retries: 0, cache: "no-store" });
    const mapped = mapSiteVersionComponent(raw);
    return {
      ...mapped,
      timestamp: raw?.timestamp ?? mapped.deployedAt,
      notes: raw?.notes ? String(raw.notes) : undefined,
      components: Array.isArray(raw?.components) ? raw.components.map(mapSiteVersionComponent) : [],
    };
  } catch {
    return null;
  }
}

// ── Champions ──

/**
 * Represent raw champion-overview data before client normalization.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type ChampionOverviewRaw = {
  champions?: Array<{
    id: number; name: string; roles?: string; title?: string; health?: number; speed?: number; image_path?: string | null;
  }>;
  stats?: any[];
};

let championsOverviewCache: { key: string; value: Champion[]; expiresAt: number } | null = null;
let championsOverviewInFlight: { key: string; promise: Promise<Champion[]> } | null = null;

/**
 * MapChampionsOverview for the API-client data path.
 *
 * Accepts raw; returns mapChampionsOverview data from local computation without network, authentication, cache, or persistence effects.
 * refs: none
 * I/O types: `raw: ChampionOverviewRaw -> Champion[]`.
 */
export function mapChampionsOverview(raw: ChampionOverviewRaw): Champion[] {
  const catalog = raw.champions ?? [];
  const stats = mapStatsChampionRows(raw.stats ?? []);
  const statsById = new Map(stats.map((stat) => [stat.championId, stat]));
  const statsByName = new Map(stats.map((stat) => [stat.championName.toLowerCase(), stat]));
  const statsBySlug = new Map(stats.map((stat) => [championSlug(stat.championName), stat]));

  return catalog.map((r): Champion => {
    const stat =
      statsById.get(r.id) ??
      statsByName.get(r.name.toLowerCase()) ??
      statsBySlug.get(championSlug(r.name));

    return {
      id: r.id,
      name: r.name,
      roles: splitRoles(r.roles),
      winRate: stat?.winRate ?? null,
      pickRate: stat?.pickRate ?? null,
      banRate: stat?.banRate ?? null,
      totalBans: stat?.totalBans ?? null,
      rating: stat?.avgLeagueTier ?? null,
      ratingDeviation: null,
      volatility: null,
      totalMatches: stat?.totalPlays ?? null,
      totalPlays: stat?.totalPlays ?? null,
      wins: null,
      imagePath: getChampionIconSafe(r.name),
    };
  });
}

/**
 * Select the public match population scope.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type PublicStatsScope =
  | 'ranked'
  | 'casual'
  | 'bot'
  | 'team_deathmatch'
  | 'arcade'
  | 'wave_defense'
  | 'experiment'
  | 'newcomer';

/**
 * Fetch champions data for client consumers.
 *
 * refs: none
 * Request `GET '/champions/overview?scope=${encodeURIComponent(statsScope)}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { limit?: string; offset?: string; tier?: string; region?: string; patch?: string; scope?: PublicStatsScope; } -> Promise<Champion[]>`.
 */
export async function fetchChampions(params?: {
  limit?: string;
  offset?: string;
  tier?: string;
  region?: string;
  patch?: string;
  scope?: PublicStatsScope;
}): Promise<Champion[]> {
  const statsScope = params?.scope ?? 'ranked';
  const cacheKey = `${statsScope}|${statsScope === 'ranked' ? getStoredLobbyTierFilter() : ''}`;
  if (championsOverviewCache?.key === cacheKey && championsOverviewCache.expiresAt > Date.now()) return championsOverviewCache.value;
  if (championsOverviewInFlight?.key === cacheKey) return championsOverviewInFlight.promise;
  const promise = fetchJson<ChampionOverviewRaw>(`/champions/overview?scope=${encodeURIComponent(statsScope)}`, { unwrapData: false })
    .then((raw) => {
      const value = mapChampionsOverview(raw);
      championsOverviewCache = { key: cacheKey, value, expiresAt: Date.now() + 300_000 };
      return value;
    });
  championsOverviewInFlight = { key: cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (championsOverviewInFlight?.promise === promise) championsOverviewInFlight = null;
  }
}

/**
 * Fetch top winrate data for client consumers.
 *
 * refs: none
 * Request `GET '${API_BASE}${withStoredLobbyTier('/champions/top-winrate')}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<TopWinrateEntry[]>`.
 */
export async function fetchTopWinrate(): Promise<TopWinrateEntry[]> {
  const res = await fetch(`${API_BASE}${withStoredLobbyTier('/champions/top-winrate')}`);
  if (!res.ok) return [];
  // Backend returns a bare array, not wrapped in { value: [...] }
  return (await res.json()) as TopWinrateEntry[];
}

/**
 * Fetch champion counters data for client consumers.
 *
 * refs: none
 * Request `GET '/champions/${id}/counters'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `id: number -> Promise<CounterStats>`.
 */
export async function fetchChampionCounters(id: number): Promise<CounterStats> {
  const raw = await fetchJson<{
    strong_against: Array<{ opponent_champion_name: string; opponent_champion_id: number; wins: number; total_matches: number; win_rate: number }>;
    weak_against: Array<{ opponent_champion_name: string; opponent_champion_id: number; wins: number; total_matches: number; win_rate: number }>;
  }>(`/champions/${id}/counters`);

  return {
    strongAgainst: raw.strong_against.map((c) => ({
      opponentChampionName: c.opponent_champion_name,
      opponentChampionId: c.opponent_champion_id,
      wins: c.wins,
      totalMatches: c.total_matches,
      winRate: c.win_rate,
    })),
    weakAgainst: raw.weak_against.map((c) => ({
      opponentChampionName: c.opponent_champion_name,
      opponentChampionId: c.opponent_champion_id,
      wins: c.wins,
      totalMatches: c.total_matches,
      winRate: c.win_rate,
    })),
  };
}

// ── Players ──

/**
 * Fetch a player profile with optional queue and champion rating context.
 * Accepts string and numeric identifiers and returns normalized profile data.
 * refs: none
 * I/O types: `id: string; queueId?: number; championId?: number -> Promise<PlayerProfile & { level?: number | null; kbmRank?: number | null; queueElo?: number | null; championElo?: number | null; globalWins?: number | null; globalLosses?: number | null; globalWinRate?: number | null; cheater?: boolean; exploiter?: boolean; susCount?: number }>`.
 */
export async function fetchPlayerProfile(id: string, queueId?: number, championId?: number): Promise<PlayerProfile & { level?: number | null; kbmRank?: number | null; queueElo?: number | null; championElo?: number | null; globalWins?: number | null; globalLosses?: number | null; globalWinRate?: number | null; cheater?: boolean; exploiter?: boolean; susCount?: number }> {
  type RawChampion = { champion_name: string; champion_id: number; wins: number; total_plays?: number; matches_played?: number; losses?: number; win_rate?: number | null; mu?: number | string | null };
  type RawPlayer = {
    id: string | number; name: string; level?: number | string | null; platform?: string | null; region?: string | null;
    kbm_tier?: string | number | null; kbm_points?: number | string | null; kbm_rank?: number | string | null;
    total_matches?: number | string | null; total_wins?: number | string | null;
    wins?: number | string | null; losses?: number | string | null;
    cheater?: boolean | null; exploiter?: boolean | null; sus_count?: number | string | null;
    win_rate?: number | string | null; total_plays?: number | string | null;
    top_champions?: RawChampion[] | null;
    derived_rates?: { kpm?: number | string | null; deaths_per_minute?: number | string | null } | null;
  };
  type QueueRating = { queue_id?: number | string; mu?: number | string | null };
  type ProfileResponse = RawPlayer | { player: RawPlayer; championRatings?: RawChampion[] | null; queueRatings?: QueueRating[] | null };
  const raw = await fetchJson<ProfileResponse>(`/players/${id}`);
  // The current backend wraps profile data in { player, championRatings }.
  // Accept the legacy flat shape too, so cached/older deployments remain usable.
  const response = "player" in raw ? raw : null;
  const player = response?.player ?? raw as RawPlayer;
  const champions = response?.championRatings ?? player.top_champions ?? [];
  const numberOrNull = (value: number | string | null | undefined) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const totalMatches = numberOrNull(player.total_matches) ?? numberOrNull(player.total_plays) ?? ((numberOrNull(player.wins) ?? 0) + (numberOrNull(player.losses) ?? 0));
  const totalWins = numberOrNull(player.total_wins) ?? numberOrNull(player.wins) ?? 0;
  const reportedWinRate = numberOrNull(player.win_rate);
  const queueRatings = response?.queueRatings ?? [];
  const requestedQueueRating = queueRatings.find((rating) => Number(rating.queue_id) === queueId)
    ?? queueRatings.find((rating) => Number(rating.queue_id) === 486)
    ?? queueRatings[0];
  const selectedChampionRating = champions.find((rating) => Number(rating.champion_id) === championId);
  const globalWins = numberOrNull(player.wins);
  const globalLosses = numberOrNull(player.losses);

  return {
    id: String(player.id),
    name: player.name,
    level: numberOrNull(player.level),
    platform: player.platform ?? null,
    region: player.region ?? null,
    kbmTier: player.kbm_tier == null ? null : String(player.kbm_tier),
    kbmPoints: numberOrNull(player.kbm_points),
    kbmRank: numberOrNull(player.kbm_rank),
    queueElo: numberOrNull(requestedQueueRating?.mu),
    championElo: numberOrNull(selectedChampionRating?.mu),
    globalWins,
    globalLosses,
    globalWinRate: globalWins != null && globalLosses != null && globalWins + globalLosses > 0
      ? (globalWins / (globalWins + globalLosses)) * 100
      : null,
    cheater: Boolean(player.cheater),
    exploiter: Boolean(player.exploiter),
    susCount: numberOrNull(player.sus_count) ?? 0,
    totalMatches,
    totalWins,
    winRate: reportedWinRate ?? (totalMatches > 0 ? (totalWins / totalMatches) * 100 : null),
    totalPlays: numberOrNull(player.total_plays) ?? totalMatches,
    derivedRates: {
      kpm: numberOrNull(player.derived_rates?.kpm),
      deathsPerMinute: numberOrNull(player.derived_rates?.deaths_per_minute),
    },
    topChampions: champions.map((c) => {
      const plays = numberOrNull(c.total_plays) ?? numberOrNull(c.matches_played) ?? 0;
      const wins = numberOrNull(c.wins) ?? 0;
      return {
      championName: c.champion_name,
      championId: c.champion_id,
      wins,
      totalPlays: plays,
      winRate: numberOrNull(c.win_rate) ?? (plays > 0 ? (wins / plays) * 100 : 0),
    };
    }),
  };
}

/**
 * Describe nullable observed performance averages. I/O: metric object -> PlayerChampionCumulativeMetrics.
 * refs: endpoints: GET /players/{id}/champions
 */
export interface PlayerChampionCumulativeMetrics {
  kpm: number | null;
  deaths_per_minute: number | null;
  dpm: number | null;
  wpm: number | null;
  apm: number | null;
  hpm: number | null;
  shpm: number | null;
  spm: number | null;
  gpm: number | null;
  egpm: number | null;
}

/**
 * Summarize a player champion experience and performance.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerChampionStat {
  championId: number;
  championName: string;
  role: string;
  xp: number;
  ownershipType: string;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  minutesPlayed: number;
  gold: number;
  lastPlayed: string | null;
  matchesPlayed: number;
  winRate: number | null;
  rankedWins: number;
  rankedLosses: number;
  rankedMatchesPlayed: number;
  rankedWinRate: number | null;
  cumulativeMetrics: PlayerChampionCumulativeMetrics;
  globalMetrics: PlayerChampionCumulativeMetrics;
  rating: number | null;
  ratingDeviation: number | null;
  volatility: number | null;
  ratingMatches: number;
  lastUpdated: string | null;
}

/** The population scope for player champion stats (ranked vs casual).
 *
 * refs: none
 */
export type PlayerChampionScope = "ranked" | "casual";

/**
 * Fetch player champion stats data for client consumers.
 *
 * refs: none
 * Request `GET '/players/${playerId}/champions?scope=ranked|casual'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string | number, scope: PlayerChampionScope -> Promise<PlayerChampionStat[]>`.
 */
export async function fetchPlayerChampionStats(playerId: string | number, scope: PlayerChampionScope = "ranked"): Promise<PlayerChampionStat[]> {
  type RawCumulativeMetrics = {
    kpm?: number | string | null;
    deaths_per_minute?: number | string | null;
    dpm?: number | string | null;
    wpm?: number | string | null;
    apm?: number | string | null;
    hpm?: number | string | null;
    shpm?: number | string | null;
    spm?: number | string | null;
    gpm?: number | string | null;
    egpm?: number | string | null;
  };
  type RawStat = {
    champion_id: number | string;
    champion_name: string;
    role: string;
    xp?: number | string | null;
    ownership_type?: string | null;
    wins?: number | string | null;
    losses?: number | string | null;
    kills?: number | string | null;
    deaths?: number | string | null;
    assists?: number | string | null;
    minutes_played?: number | string | null;
    gold?: number | string | null;
    last_played?: string | null;
    matches_played?: number | string | null;
    win_rate?: number | string | null;
    ranked_wins?: number | string | null;
    ranked_losses?: number | string | null;
    ranked_matches_played?: number | string | null;
    ranked_win_rate?: number | string | null;
    cumulative_metrics?: RawCumulativeMetrics | null;
    global_metrics?: RawCumulativeMetrics | null;
    avg_dpm?: number | string | null;
    avg_wpm?: number | string | null;
    avg_apm?: number | string | null;
    avg_hpm?: number | string | null;
    avg_shpm?: number | string | null;
    avg_spm?: number | string | null;
    avg_gpm?: number | string | null;
    avg_egpm?: number | string | null;
    rating?: number | string | null;
    rating_deviation?: number | string | null;
    volatility?: number | string | null;
    rating_matches?: number | string | null;
    last_updated?: string | null;
  };
  const raw = await fetchJson<RawStat[]>(`/players/${playerId}/champions?scope=${scope}`);
  const numberOrZero = (value: number | string | null | undefined) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const numberOrNull = (value: number | string | null | undefined) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return raw.map((stat) => {
    const metrics = stat.cumulative_metrics ?? {};
    const globalMetrics = stat.global_metrics ?? {};
    return {
      championId: numberOrZero(stat.champion_id),
      championName: stat.champion_name,
      role: stat.role,
      xp: numberOrZero(stat.xp),
      ownershipType: stat.ownership_type ?? "",
      wins: numberOrZero(stat.wins),
      losses: numberOrZero(stat.losses),
      kills: numberOrZero(stat.kills),
      deaths: numberOrZero(stat.deaths),
      assists: numberOrZero(stat.assists),
      minutesPlayed: numberOrZero(stat.minutes_played),
      gold: numberOrZero(stat.gold),
      lastPlayed: stat.last_played ?? null,
      matchesPlayed: numberOrZero(stat.matches_played),
      winRate: numberOrNull(stat.win_rate),
      rankedWins: numberOrZero(stat.ranked_wins),
      rankedLosses: numberOrZero(stat.ranked_losses),
      rankedMatchesPlayed: numberOrZero(stat.ranked_matches_played),
      rankedWinRate: numberOrNull(stat.ranked_win_rate),
      cumulativeMetrics: {
        kpm: numberOrNull(metrics.kpm),
        deaths_per_minute: numberOrNull(metrics.deaths_per_minute),
        dpm: numberOrNull(metrics.dpm ?? stat.avg_dpm),
        wpm: numberOrNull(metrics.wpm ?? stat.avg_wpm),
        apm: numberOrNull(metrics.apm ?? stat.avg_apm),
        hpm: numberOrNull(metrics.hpm ?? stat.avg_hpm),
        shpm: numberOrNull(metrics.shpm ?? stat.avg_shpm),
        spm: numberOrNull(metrics.spm ?? stat.avg_spm),
        gpm: numberOrNull(metrics.gpm ?? stat.avg_gpm),
        egpm: numberOrNull(metrics.egpm ?? stat.avg_egpm),
      },
      globalMetrics: {
        kpm: numberOrNull(globalMetrics.kpm),
        deaths_per_minute: numberOrNull(globalMetrics.deaths_per_minute),
        dpm: numberOrNull(globalMetrics.dpm),
        wpm: numberOrNull(globalMetrics.wpm),
        apm: numberOrNull(globalMetrics.apm),
        hpm: numberOrNull(globalMetrics.hpm),
        shpm: numberOrNull(globalMetrics.shpm),
        spm: numberOrNull(globalMetrics.spm),
        gpm: numberOrNull(globalMetrics.gpm),
        egpm: numberOrNull(globalMetrics.egpm),
      },
      rating: numberOrNull(stat.rating),
      ratingDeviation: numberOrNull(stat.rating_deviation),
      volatility: numberOrNull(stat.volatility),
      ratingMatches: numberOrZero(stat.rating_matches),
      lastUpdated: stat.last_updated ?? null,
    };
  });
}

/**
 * Describe the outcome of requesting player champion-stat refresh.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerChampionStatsRefreshResponse {
  refreshed: boolean;
  freshness: {
    remaining_seconds: number;
  };
}

/**
 * Refresh player champion stats from the backend.
 *
 * Accepts playerId; returns refreshPlayerChampionStats data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `playerId: string | number -> Promise<PlayerChampionStatsRefreshResponse>`.
 */
export async function refreshPlayerChampionStats(playerId: string | number): Promise<PlayerChampionStatsRefreshResponse> {
  return fetchJson<PlayerChampionStatsRefreshResponse>(`/players/${playerId}/champions/refresh`, { method: "POST" });
}

/**
 * Summarize item performance for a breakdown dimension.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ItemDimensionStat {
  slot?: number;
  level?: number;
  totalUses: number;
  wins: number;
  losses: number;
  winRate: number;
  pickRate?: number;
}

/**
 * Combine item totals with dimension breakdowns.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ItemDetailStats {
  itemId: number;
  itemName: string;
  mode: 'ranked';
  totalUses: number;
  wins: number;
  losses: number;
  winRate: number;
  slots: ItemDimensionStat[];
  levels: ItemDimensionStat[];
  breakdown: ItemDimensionStat[];
}

/**
 * Fetch player search data for client consumers.
 *
 * refs: none
 * Request `GET '/players/search?q=${encodeURIComponent(query)}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `query: string -> Promise<PlayerSearchResult[]>`.
 */
export async function fetchPlayerSearch(query: string): Promise<PlayerSearchResult[]> {
  const raw = await fetchJson<Array<{
    id: string;
    name: string;
    platform: string;
    region: string;
    kbm_tier: string | null;
  }>>(`/players/search?q=${encodeURIComponent(query)}`);

  return raw.map((r) => ({
    id: r.id,
    name: r.name,
    platform: r.platform,
    region: r.region,
    kbmTier: r.kbm_tier,
  }));
}

/**
 * Select a universal-search entity category.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type UniversalSearchType = "player" | "match" | "champion" | "item" | "card" | "talent";
/**
 * Describe a remote target eligible for universal search.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type UniversalSearchRemoteTarget = "player-id" | "player-name" | "match-id";

/**
 * Describe a navigable universal-search result.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface UniversalSearchResult {
  type: UniversalSearchType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
  meta?: Record<string, unknown>;
}

/**
 * Group universal-search results and response metadata.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface UniversalSearchResponse {
  query: string;
  total: number;
  data: UniversalSearchResult[];
  remote?: {
    attempted: boolean;
    target?: UniversalSearchRemoteTarget;
    cacheHit?: boolean;
    skipped?: boolean;
    reason?: string;
    status?: "hit" | "miss" | "error";
    error?: string;
  };
}

/**
 * Fetch universal search data for client consumers.
 *
 * refs: none
 * Request `GET '/search/universal?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `queryText: string; limit: number; options?: { remote?: boolean; remoteTarget?: UniversalSearchRemoteTarget; refresh?: boolean } -> Promise<UniversalSearchResponse>`.
 */
export async function fetchUniversalSearch(
  queryText: string,
  limit = 30,
  options?: { remote?: boolean; remoteTarget?: UniversalSearchRemoteTarget; refresh?: boolean },
): Promise<UniversalSearchResponse> {
  const query = new URLSearchParams({
    q: queryText,
    limit: String(limit),
  });
  if (options?.remote) query.set("remote", "true");
  if (options?.remoteTarget) query.set("remoteTarget", options.remoteTarget);
  if (options?.refresh) query.set("refresh", "true");
  return fetchJson<UniversalSearchResponse>(`/search/universal?${query.toString()}`, { unwrapData: false });
}

/**
 * Fetch player matches data for client consumers.
 *
 * refs: none
 * Request `GET '/players/${id}/matches${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `id: string; params?: { limit?: string; offset?: string } -> Promise<MatchRecord[]>`.
 */
export async function fetchPlayerMatches(id: string, params?: { limit?: string; offset?: string }): Promise<MatchRecord[]> {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }
  }
  const raw = await fetchJson<Array<{
    match_id: string;
    champion_name: string;
    win_status: string;
    kills: number;
    deaths: number;
    assists: number;
    damage_done?: number | string;
    damage_per_minute?: number | string | null;
    duration_seconds?: number | string;
    time_in_match?: number | string;
    map?: string;
    queue_id?: number | string | null;
    league_tier?: number | string | null;
    source?: string | null;
    authoritative?: boolean;
    performance_tags?: unknown;
    entry_datetime: string;
  }>>(`/players/${id}/matches${query.toString() ? `?${query.toString()}` : ''}`);

  // Transitional storage can expose the same match through more than one
  // authoritative table. Preserve the newest API ordering and render it once.
  const uniqueMatches = [...new Map(raw.map((match) => [String(match.match_id), match])).values()];

  return uniqueMatches.map((m) => ({
    matchId: m.match_id,
    championName: m.champion_name,
    isWinner: ['winner', 'win'].includes(String(m.win_status ?? '').toLowerCase()),
    kills: Number(m.kills ?? 0),
    deaths: Number(m.deaths ?? 0),
    assists: Number(m.assists ?? 0),
    damageDone: Number(m.damage_done ?? 0),
    duration: Number(m.duration_seconds ?? m.time_in_match ?? 0),
    mapGame: String(m.map ?? 'Unknown'),
    entryDatetime: m.entry_datetime,
    queueId: m.queue_id == null ? null : Number(m.queue_id),
    leagueTier: m.league_tier == null ? null : Number(m.league_tier),
    source: m.source ?? null,
    authoritative: m.authoritative === true,
    performanceTags: normalizeMatchPerformanceTags(m.performance_tags),
  }));
}

/**
 * Describe the freshness and refresh state of player loadout data.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerLoadoutFreshness {
  ttlSeconds: number;
  refreshedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
  expired: boolean;
  manualRefreshAvailableAt: string | null;
  manualRefreshRemainingSeconds: number;
}

/**
 * Describe a named player champion loadout and its card selections.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerLoadout {
  id: number;
  deckId: number | null;
  deckKey: string;
  championId: number;
  championName: string;
  loadoutName: string;
  cardIds: number[];
  cardLevels: number[];
  talentId: number | null;
  fetchedAt: string;
  updatedAt: string;
}

/**
 * Combine player loadouts with their freshness state.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PlayerLoadoutsResponse {
  loadouts: PlayerLoadout[];
  freshness: PlayerLoadoutFreshness;
  refreshed: boolean;
  refreshError: string | null;
}

function mapPlayerLoadoutFreshness(raw: any): PlayerLoadoutFreshness {
  return {
    ttlSeconds: Number(raw?.ttl_seconds ?? 180),
    refreshedAt: raw?.refreshed_at ?? null,
    expiresAt: raw?.expires_at ?? null,
    remainingSeconds: Number(raw?.remaining_seconds ?? 0),
    expired: raw?.expired !== false,
    manualRefreshAvailableAt: raw?.manual_refresh_available_at ?? null,
    manualRefreshRemainingSeconds: Number(raw?.manual_refresh_remaining_seconds ?? 0),
  };
}

function mapPlayerLoadout(raw: any): PlayerLoadout {
  return {
    id: Number(raw.id),
    deckId: raw.deck_id == null ? null : Number(raw.deck_id),
    deckKey: String(raw.deck_key ?? ""),
    championId: Number(raw.champion_id),
    championName: String(raw.champion_name ?? `Champion ${raw.champion_id}`),
    loadoutName: String(raw.loadout_name ?? ""),
    cardIds: Array.isArray(raw.card_ids) ? raw.card_ids.map(Number) : [],
    cardLevels: Array.isArray(raw.card_levels) ? raw.card_levels.map(Number) : [],
    talentId: raw.talent_id == null ? null : Number(raw.talent_id),
    fetchedAt: String(raw.fetched_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}

/**
 * Fetch player loadouts data for client consumers.
 *
 * refs: none
 * Request `GET '/players/${playerId}/loadouts'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string | number -> Promise<PlayerLoadoutsResponse>`.
 */
export async function fetchPlayerLoadouts(playerId: string | number): Promise<PlayerLoadoutsResponse> {
  const raw = await fetchJson<any>(`/players/${playerId}/loadouts`);
  return {
    loadouts: Array.isArray(raw.loadouts) ? raw.loadouts.map(mapPlayerLoadout) : [],
    freshness: mapPlayerLoadoutFreshness(raw.freshness),
    refreshed: raw.refreshed === true,
    refreshError: raw.refresh_error ?? null,
  };
}

/**
 * Refresh player loadouts from the backend.
 *
 * Accepts playerId; returns refreshPlayerLoadouts data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `playerId: string | number -> Promise<PlayerLoadoutsResponse>`.
 */
export async function refreshPlayerLoadouts(playerId: string | number): Promise<PlayerLoadoutsResponse> {
  const raw = await fetchJson<any>(`/players/${playerId}/loadouts/refresh`, { method: "POST" });
  return {
    loadouts: Array.isArray(raw.loadouts) ? raw.loadouts.map(mapPlayerLoadout) : [],
    freshness: mapPlayerLoadoutFreshness(raw.freshness),
    refreshed: raw.refreshed === true,
    refreshError: raw.refresh_error ?? null,
  };
}

/**
 * Fetch player loadout deck data for client consumers.
 *
 * refs: none
 * Request `GET '/players/${playerId}/loadouts/decks/${loadoutId}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string | number; loadoutId: string | number -> Promise<{ loadout: PlayerLoadout; freshness: PlayerLoadoutFreshness }>`.
 */
export async function fetchPlayerLoadoutDeck(playerId: string | number, loadoutId: string | number): Promise<{ loadout: PlayerLoadout; freshness: PlayerLoadoutFreshness }> {
  const raw = await fetchJson<any>(`/players/${playerId}/loadouts/decks/${loadoutId}`);
  return { loadout: mapPlayerLoadout(raw.loadout), freshness: mapPlayerLoadoutFreshness(raw.freshness) };
}

// ── Stats ──

/**
 * Fetch leaderboard data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/leaderboard${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { tier?: string; region?: string } -> Promise<LeaderboardEntry[]>`.
 */
export async function fetchLeaderboard(params?: { tier?: string; region?: string }): Promise<LeaderboardEntry[]> {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }
  }
  const raw = await fetchJson<Array<{
    rank: number;
    championId: number;
    championName: string;
    winRate: number;
    totalPlays: number | string;
  }>>(`/stats/leaderboard${query.toString() ? `?${query.toString()}` : ''}`);

  return raw.map((r) => ({
    championId: r.championId,
    championName: r.championName,
    winRate: r.winRate,
    totalPlays: typeof r.totalPlays === 'string' ? Number(r.totalPlays) : (r.totalPlays ?? 0),
    rating: null,
  }));
}

/**
 * Describe a champion row used by aggregate statistics.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface StatsChampion {
  wins?: number;
  championId: number;
  championName: string;
  winRate: number;
  totalPlays: number;
  banRate?: number;
  totalBans?: number;
  pickRate?: number;
  kda?: number;
  avgDamage?: number;
  avgCredits?: number;
  avgHeal?: number;
  avgShielding?: number;
  avgLeagueTier?: number;
}

function mapStatsChampionRows(raw: Array<{
  wins?: number | string;
  champion_id: number; champion_name: string;
  win_rate: number | string; total_matches?: number | string; total_plays?: number | string;
  ban_rate?: number | string; ban_total?: number | string; pick_rate?: number | string; kda?: number | string;
  avg_damage?: number | string; avg_gold?: number | string;
  avg_heal?: number | string; avg_mitigation?: number | string;
  avg_league_tier?: number | string;
}>): StatsChampion[] {
  const num = (v: number | string | undefined) => v != null ? (typeof v === 'string' ? Number(v) : v) : undefined;
  return raw.map((r) => ({
    championId: r.champion_id,
    wins: num(r.wins),
    championName: r.champion_name,
    winRate: toDisplayPercent(r.win_rate) ?? 0,
    totalPlays: num(r.total_matches) ?? num(r.total_plays) ?? 0,
    banRate: toDisplayPercent(r.ban_rate) ?? undefined,
    totalBans: num(r.ban_total) ?? 0,
    pickRate: toDisplayPercent(r.pick_rate) ?? undefined,
    kda: num(r.kda),
    avgDamage: num(r.avg_damage),
    avgCredits: num(r.avg_gold),
    avgHeal: num(r.avg_heal),
    avgShielding: num(r.avg_mitigation),
    avgLeagueTier: num(r.avg_league_tier),
  }));
}

const PERFORMANCE_PAGE_METRICS = [
  "kpm", "deaths_per_minute", "dpm", "wpm", "apm", "hpm", "shpm", "gpm", "egpm", "spm", "kda",
] as const satisfies readonly PerformanceMetricKey[];

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unwrapPerformanceRecord(value: unknown): Record<string, any> | null {
  if (!isRecord(value)) return null;
  return isRecord(value.data) ? value.data : value;
}

function isPerformanceSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["min", "max", "mean", "median", "mode", "p10", "p25", "p75", "p90"]
    .every(key => value[key] != null && Number.isFinite(Number(value[key])))
    && (value.sample_size ?? value.sampleSize) != null
    && Number.isFinite(Number(value.sample_size ?? value.sampleSize));
}

/** Validate and map the complete page bundle; partial 200 responses must be retried, not rendered as empty charts.
 *
 * I/O: in (raw: unknown, scope: PerformanceScope, metric: GamePerformanceMetric, queueId: number) -> out PerformanceDashboardPageData
 *
 * refs: none
 */
export function mapPerformanceDashboardPageData(raw: unknown, scope: PerformanceScope, metric: GamePerformanceMetric, queueId: number): PerformanceDashboardPageData {
  const dashboard = unwrapPerformanceRecord(raw);
  const roles = dashboard && isRecord(dashboard.roles) ? dashboard.roles : null;
  const selectedSummary = dashboard?.[metric];
  if (!dashboard || dashboard.scope !== scope || !isPerformanceSummary(selectedSummary) || !roles
    || !["Frontline", "Damage", "Flank", "Support"].every(role => isPerformanceSummary(roles[role]))) {
    throw new Error("Incomplete performance dashboard data");
  }
  if (scope === "casual" && (!Array.isArray(dashboard.queue_ids) || dashboard.queue_ids.length !== 1 || Number(dashboard.queue_ids[0]) !== queueId)) {
    throw new Error("Performance population mismatch");
  }
  return {
    scope,
    queueId,
    metric,
    dashboard: {
      summary: mapMetricSummary(selectedSummary),
      roles: Object.fromEntries(Object.entries(roles).map(([role, summary]) => [role, mapMetricSummary(summary)])),
    },
  };
}

/** Validate and map the complete performance-page bundle into a renderable payload.
 *
 * I/O: in (raw: unknown, scope: PerformanceScope, metric: GamePerformanceMetric, queueId: number) -> out PerformancePageData
 *
 * refs: none
 */
export function mapPerformancePageData(raw: unknown, scope: PerformanceScope, metric: GamePerformanceMetric, queueId: number): PerformancePageData {
  if (!isRecord(raw)) throw new Error("Invalid performance page data");
  const dashboard = unwrapPerformanceRecord(raw.dashboard);
  const roles = dashboard && isRecord(dashboard.roles) ? dashboard.roles : null;
  const selectedSummary = dashboard?.[metric];
  if (!dashboard || dashboard.scope !== scope || !isPerformanceSummary(selectedSummary) || !roles
    || !["Frontline", "Damage", "Flank", "Support"].every(role => isPerformanceSummary(roles[role]))) {
    throw new Error("Incomplete performance dashboard data");
  }
  if (scope === "casual" && (!Array.isArray(dashboard.queue_ids) || dashboard.queue_ids.length !== 1 || Number(dashboard.queue_ids[0]) !== queueId)) {
    throw new Error("Performance population mismatch");
  }

  const rawGroups = raw.comparison;
  if (!Array.isArray(rawGroups) || rawGroups.length !== PERFORMANCE_PAGE_METRICS.length) {
    throw new Error("Incomplete champion performance data");
  }
  const seen = new Set<string>();
  const results = rawGroups.map(group => {
    if (!isRecord(group) || typeof group.metric !== "string" || !PERFORMANCE_PAGE_METRICS.includes(group.metric as typeof PERFORMANCE_PAGE_METRICS[number])
      || seen.has(group.metric) || !Array.isArray(group.rows)) {
      throw new Error("Incomplete champion performance data");
    }
    seen.add(group.metric);
    if (group.rows.some((row: unknown) => !isRecord(row) || row.champion_id == null || !Number.isFinite(Number(row.champion_id))
      || !Number.isFinite(Number(row.mean)) || !Number.isFinite(Number(row.total_matches)))) {
      throw new Error("Invalid champion performance rows");
    }
    return { metric: group.metric as PerformanceMetricKey, rows: mapChampionPerformanceRows(group.rows as ChampionPerformanceRow[]) };
  });
  if (PERFORMANCE_PAGE_METRICS.some(key => !seen.has(key))) throw new Error("Incomplete champion performance data");

  const globalSource = unwrapPerformanceRecord(raw.globalMetrics);
  if (!globalSource || PERFORMANCE_PAGE_METRICS.some(key => !isPerformanceSummary(globalSource[key]))) {
    throw new Error("Incomplete global performance data");
  }
  const global = Object.fromEntries(PERFORMANCE_PAGE_METRICS.map(key => [key, mapMetricSummary(globalSource[key])])) as PerformanceMetricsResponse;
  const classAverages: Record<string, PerformanceMetricsResponse> = {};
  if (raw.classMetrics != null) {
    for (const role of ["Frontline", "Damage", "Flank", "Support"]) {
      const source = isRecord(raw.classMetrics) ? unwrapPerformanceRecord(raw.classMetrics[role]) : null;
      if (!source || PERFORMANCE_PAGE_METRICS.some(key => !isPerformanceSummary(source[key]))) {
        throw new Error(`Incomplete ${role} performance data`);
      }
      classAverages[role] = Object.fromEntries(PERFORMANCE_PAGE_METRICS.map(key => [key, mapMetricSummary(source[key])])) as PerformanceMetricsResponse;
    }
  }
  if (!Array.isArray(raw.champions)) throw new Error("Invalid champion summary data");

  return {
    scope,
    queueId,
    metric,
    dashboard: {
      summary: mapMetricSummary(selectedSummary),
      roles: Object.fromEntries(Object.entries(roles).map(([role, summary]) => [role, mapMetricSummary(summary)])),
    },
    comparison: {
      results,
      details: mapStatsChampionRows(raw.champions as Parameters<typeof mapStatsChampionRows>[0]),
      global,
      classAverages: raw.classMetrics != null ? classAverages : undefined,
    },
  };
}

/** Make one bounded retry for a transient or incomplete page-data response.
 *
 * I/O: in (scope: PerformanceScope, metric: GamePerformanceMetric, queueId: number, signal?: AbortSignal) -> out Promise<PerformancePageData>
 *
 * refs: none
 */
export async function fetchPerformancePageData(
  scope: PerformanceScope,
  metric: GamePerformanceMetric,
  queueId: number,
  signal?: AbortSignal,
): Promise<PerformancePageData> {
  const query = new URLSearchParams({ metric, scope, queueId: String(queueId) });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    try {
      const raw = await fetchJson<Record<string, unknown>>(`/stats/performance-page-data?${query.toString()}`, {
        cache: "no-store", retries: 0, timeoutMs: 1500, unwrapData: false, signal,
      });
      return mapPerformancePageData(raw, scope, metric, queueId);
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
      if (attempt === 1 || (error instanceof ApiRequestError && error.status != null && error.status < 500)
        || (error instanceof Error && error.message === API_ERROR_KEYS.genericFailure)) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

/**
 * Fetch stats champions data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/champions${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { sort?: string; limit?: number; scope?: PublicStatsScope; queueId?: number } -> Promise<StatsChampion[]>`.
 */
export async function fetchStatsChampions(params?: { sort?: string; limit?: number; scope?: PublicStatsScope; queueId?: number }): Promise<StatsChampion[]> {
  const query = new URLSearchParams();
  if (params?.sort) query.set('sort', params.sort);
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.scope) query.set('scope', params.scope);
  if (params?.queueId != null) query.set('queueId', String(params.queueId));
  try {
    const raw = await fetchJson<Array<{
      champion_id: number; champion_name: string;
      win_rate: number | string; total_matches?: number | string; total_plays?: number | string;
      ban_rate?: number | string; ban_total?: number | string; pick_rate?: number | string; kda?: number | string;
      avg_damage?: number | string; avg_gold?: number | string;
      avg_heal?: number | string; avg_mitigation?: number | string;
      avg_league_tier?: number | string;
    }>>(`/stats/champions${query.toString() ? `?${query.toString()}` : ''}`);
    return mapStatsChampionRows(raw);
  } catch {
    return [];
  }
}

/**
 * Fetch regions data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/regions'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<RegionStat[]>`.
 */
export async function fetchRegions(): Promise<RegionStat[]> {
  const raw = await fetchJson<Array<{
    region_code: string;
    region_name: string;
    continent: string;
    avg_duration: number;
    top_champions: Array<{ champion_name: string; champion_id: number; wins: number; total_plays: number; win_rate: number }>;
  }>>(`/stats/regions`);

  return raw.map((r) => ({
    regionCode: r.region_code,
    regionName: r.region_name,
    continent: r.continent,
    avgDuration: r.avg_duration,
    topChampions: r.top_champions.map((c) => ({
      championName: c.champion_name,
      championId: c.champion_id,
      wins: c.wins,
      totalPlays: c.total_plays,
      winRate: c.win_rate,
    })),
  }));
}

/**
 * Fetch platforms data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/platforms'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `options?: { timeoutMs?: number } -> Promise<Array<{ platform: string; championId: number; championName: string; totalMatches: number; winRate: number; avgDpm: number; avgHpm: number; }>>`.
 */
export async function fetchPlatforms(options?: { timeoutMs?: number }): Promise<Array<{
  platform: string;
  championId: number;
  championName: string;
  totalMatches: number;
  winRate: number;
  avgDpm: number;
  avgHpm: number;
}>> {
  const raw = await fetchJson<Array<{
    platform: string;
    champion_id: number | string;
    champion_name: string;
    total_matches: number | string;
    win_rate: number | string;
    avg_dpm: number | string;
    avg_hpm: number | string;
  }>>(`/stats/platforms`, { timeoutMs: options?.timeoutMs, retries: 0 });

  return raw.map((r) => ({
    platform: r.platform,
    championId: numberOrNull(r.champion_id) ?? 0,
    championName: r.champion_name,
    totalMatches: numberOrNull(r.total_matches) ?? 0,
    winRate: toDisplayPercent(r.win_rate) ?? 0,
    avgDpm: numberOrNull(r.avg_dpm) ?? 0,
    avgHpm: numberOrNull(r.avg_hpm) ?? 0,
  }));
}

/**
 * Fetch loadouts data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/loadouts${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { championId?: string; minPlays?: string; limit?: string; offset?: string; } -> Promise<LoadoutStat[]>`.
 */
export async function fetchLoadouts(params?: {
  championId?: string;
  minPlays?: string;
  limit?: string;
  offset?: string;
}): Promise<LoadoutStat[]> {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }
  }
  const raw = await fetchJson<Array<{
    deck_hash: string;
    champion_id: number | string;
    champion_name: string;
    total_matches: number | string;
    total_uses: number | string;
    wins: number | string;
    losses: number | string;
    win_rate: number | string;
    ranked_wins: number | string;
    ranked_win_rate: number | string;
    high_tier_wins: number | string;
    high_tier_win_rate: number | string;
    avg_kills: number | string;
    avg_deaths: number | string;
    avg_assists: number | string;
    avg_dpm: number | string;
    avg_hpm: number | string;
    loadout_items: Array<{ item_name: string; usage_rate: number | string }> | null;
    last_refreshed: string;
  }>>(`/stats/loadouts${query.toString() ? `?${query.toString()}` : ''}`);

  return raw.map((r) => ({
    deckHash: r.deck_hash,
    championId: numberOrNull(r.champion_id) ?? 0,
    championName: r.champion_name,
    totalMatches: numberOrNull(r.total_matches) ?? 0,
    totalUses: numberOrNull(r.total_uses) ?? 0,
    wins: numberOrNull(r.wins) ?? 0,
    losses: numberOrNull(r.losses) ?? 0,
    winRate: toDisplayPercent(r.win_rate) ?? 0,
    rankedWins: numberOrNull(r.ranked_wins) ?? 0,
    rankedWinRate: toDisplayPercent(r.ranked_win_rate) ?? 0,
    highTierWins: numberOrNull(r.high_tier_wins) ?? 0,
    highTierWinRate: toDisplayPercent(r.high_tier_win_rate) ?? 0,
    avgKills: numberOrNull(r.avg_kills) ?? 0,
    avgDeaths: numberOrNull(r.avg_deaths) ?? 0,
    avgAssists: numberOrNull(r.avg_assists) ?? 0,
    avgDpm: numberOrNull(r.avg_dpm) ?? 0,
    avgHpm: numberOrNull(r.avg_hpm) ?? 0,
    loadoutItems: r.loadout_items?.map((item) => ({
      item_name: item.item_name,
      usage_rate: numberOrNull(item.usage_rate) ?? 0,
    })) ?? null,
    lastRefreshed: r.last_refreshed,
  }));
}

/**
 * Fetch items data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/items${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { mode?: 'ranked' | 'casual'; limit?: number; championId?: number; role?: 'Frontline' | 'Damage' | 'Flank' | 'Support'; summary?: boolean; tierMin?: number; tierMax?: number; scope?: string; queueId?: number } -> Promise<ItemStat[]>`.
 */
export async function fetchItems(params?: { mode?: 'ranked' | 'casual'; limit?: number; championId?: number; role?: 'Frontline' | 'Damage' | 'Flank' | 'Support'; summary?: boolean; tierMin?: number; tierMax?: number; scope?: string; queueId?: number }): Promise<ItemStat[]> {
  const query = new URLSearchParams();
  if (params?.mode) query.set('mode', params.mode);
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.championId != null) query.set('championId', String(params.championId));
  if (params?.role) query.set('role', params.role);
  if (params?.summary) query.set('summary', 'true');
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  if (params?.scope) query.set('scope', params.scope);
  if (params?.queueId != null) query.set('queueId', String(params.queueId));
  try {
    const raw = await fetchJson<Array<{
      item_id: number; item_name: string;
      total_uses?: number | string; total_usage?: number | string;
      win_rate: number | string;
      pick_rate?: number | string;
      slots?: Array<{ slot: number | string; total_uses: number | string; win_rate: number | string }>;
      levels?: Array<{ item_level: number | string; total_uses: number | string; win_rate: number | string }>;
      breakdown?: Array<{ slot: number | string; item_level: number | string; total_uses: number | string; win_rate: number | string; pick_rate?: number | string }>;
    }>>(`/stats/items${query.toString() ? `?${query.toString()}` : ''}`);
    const num = (v: number | string | undefined) => v != null ? (typeof v === 'string' ? Number(v) : v) : 0;
    return raw.map((r) => ({
      itemId: r.item_id,
      itemName: r.item_name,
      totalUsage: num(r.total_uses) || num(r.total_usage),
      winRate: num(r.win_rate),
      pickRate: r.pick_rate == null ? undefined : num(r.pick_rate),
      slots: (r.slots ?? []).map((slot) => ({
        slot: num(slot.slot), totalUses: num(slot.total_uses), wins: 0, losses: 0, winRate: num(slot.win_rate),
      })),
      levels: (r.levels ?? []).map((level) => ({
        level: num(level.item_level), totalUses: num(level.total_uses), wins: 0, losses: 0, winRate: num(level.win_rate),
      })),
      breakdown: (r.breakdown ?? []).map((row) => ({
        slot: num(row.slot), level: num(row.item_level), totalUses: num(row.total_uses), wins: 0, losses: 0, winRate: num(row.win_rate),
        pickRate: row.pick_rate == null ? undefined : num(row.pick_rate),
      })),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch item detail data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/items/${itemId}?${query.toString()}'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `itemId: number; mode: 'ranked'; params?: { championId?: number; role?: 'Frontline' | 'Damage' | 'Flank' | 'Support'; tierMin?: number; tierMax?: number } -> Promise<ItemDetailStats | null>`.
 */
export async function fetchItemDetail(itemId: number, mode: 'ranked' = 'ranked', params?: { championId?: number; role?: 'Frontline' | 'Damage' | 'Flank' | 'Support'; tierMin?: number; tierMax?: number }): Promise<ItemDetailStats | null> {
  try {
    const query = new URLSearchParams({ mode });
    if (params?.championId != null) query.set('championId', String(params.championId));
    if (params?.role) query.set('role', params.role);
    if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
    if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
    const raw = await fetchJson<any>(`/stats/items/${itemId}?${query.toString()}`);
    const number = (value: unknown) => Number(value ?? 0);
    const dimension = (row: any): ItemDimensionStat => ({
      slot: row.slot == null ? undefined : number(row.slot),
      level: row.item_level == null ? undefined : number(row.item_level),
      totalUses: number(row.total_uses),
      wins: number(row.wins),
      losses: number(row.losses),
      winRate: number(row.win_rate),
    });
    return {
      itemId: number(raw.item_id),
      itemName: raw.item_name ?? 'Unknown item',
      mode: 'ranked',
      totalUses: number(raw.total_uses),
      wins: number(raw.wins),
      losses: number(raw.losses),
      winRate: number(raw.win_rate),
      slots: (raw.slots ?? []).map(dimension),
      levels: (raw.levels ?? []).map(dimension),
      breakdown: (raw.breakdown ?? []).map(dimension),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch map stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/maps${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { queueId?: number; limit?: number; scope?: PublicStatsScope } -> Promise<MapStat[]>`.
 */
export async function fetchMapStats(params?: { queueId?: number; limit?: number; scope?: PublicStatsScope }): Promise<MapStat[]> {
  const query = new URLSearchParams();
  if (params?.queueId != null) query.set('queueId', String(params.queueId));
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.scope) query.set('scope', params.scope);
  try {
    const raw = await fetchJson<Array<{
      map: string;
      total_matches: number | string;
      distribution_rate: number | string;
      avg_duration_seconds: number | string;
    }>>(`/stats/maps${query.toString() ? `?${query.toString()}` : ''}`);
    return raw.map((r) => ({
      name: r.map,
      totalMatches: Number(r.total_matches ?? 0),
      distributionRate: Number(r.distribution_rate ?? 0),
      avgDurationSeconds: Number(r.avg_duration_seconds ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch champion map stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/champions/${championId}/maps${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `championId: number; params?: { scope?: PublicStatsScope; queueId?: number } -> Promise<ChampionMapStat[]>`.
 */
export async function fetchChampionMapStats(championId: number, params?: { scope?: PublicStatsScope; queueId?: number }): Promise<ChampionMapStat[]> {
  try {
    const query = new URLSearchParams();
    if (params?.scope) query.set('scope', params.scope);
    if (params?.queueId != null) query.set('queueId', String(params.queueId));
    const raw = await fetchJson<Array<{
      map: string;
      total_plays: number | string;
      wins: number | string;
      losses: number | string;
      win_rate: number | string;
      pick_rate: number | string;
    }>>(`/stats/champions/${championId}/maps${query.toString() ? `?${query.toString()}` : ''}`);
    return raw.map((row) => ({
      name: row.map,
      totalPlays: Number(row.total_plays ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      winRate: Number(row.win_rate ?? 0),
      pickRate: Number(row.pick_rate ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch map detail data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/maps/${encodeURIComponent(mapName)}${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `null` on a caught request failure.
 * I/O types: `mapName: string; params?: { scope?: PublicStatsScope } -> Promise<MapDetailStats | null>`.
 */
export async function fetchMapDetail(mapName: string, params?: { scope?: PublicStatsScope }): Promise<MapDetailStats | null> {
  try {
    const query = new URLSearchParams();
    if (params?.scope) query.set('scope', params.scope);
    const raw = await fetchJson<any>(`/stats/maps/${encodeURIComponent(mapName)}${query.toString() ? `?${query.toString()}` : ''}`);
    const number = (value: unknown) => Number(value ?? 0);
    const map = raw.map;
    return {
      map: { name: map.map, totalMatches: number(map.total_matches), distributionRate: number(map.distribution_rate), avgDurationSeconds: number(map.avg_duration_seconds) },
      champions: (raw.champions ?? []).map((row: any) => ({ championId: number(row.champion_id), championName: row.champion_name, totalPlays: number(row.total_plays), wins: number(row.wins), losses: number(row.losses), totalBans: row.total_bans == null ? Math.round(number(row.ban_rate) * number(map.total_matches) / 100) : number(row.total_bans), winRate: number(row.win_rate), pickRate: number(row.pick_rate), banRate: number(row.ban_rate) })),
      talents: (raw.talents ?? []).map((row: any) => ({ talentId: number(row.talent_id), talentName: row.talent_name, championId: number(row.champion_id), championName: row.champion_name, totalPlays: number(row.total_plays), wins: number(row.wins), losses: number(row.losses), winRate: number(row.win_rate), pickRate: number(row.pick_rate) })),
      items: (raw.items ?? []).map((row: any) => ({ itemId: number(row.item_id), itemName: row.item_name, totalUses: number(row.total_uses), wins: number(row.wins), losses: number(row.losses), winRate: number(row.win_rate), pickRate: number(row.pick_rate) })),
      compositions: (raw.compositions ?? []).map((row: any) => ({ composition: String(row.comp_id), frontline: number(row.frontline), damage: number(row.damage), flank: number(row.flank), support: number(row.support), totalMatches: number(row.count), wins: number(row.wins), losses: number(row.losses), winRate: number(row.winrate) })),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch map category comparison data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/maps/${encodeURIComponent(mapName)}/comparison?section=${encodeURIComponent(section)}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `mapName: string; section: MapComparisonSection -> Promise<MapCategoryComparisonStat[]>`.
 */
export async function fetchMapCategoryComparison(
  mapName: string,
  section: MapComparisonSection,
): Promise<MapCategoryComparisonStat[]> {
  const raw = await fetchJson<any>(`/stats/maps/${encodeURIComponent(mapName)}/comparison?section=${encodeURIComponent(section)}`);
  return (raw.rows ?? []).map((row: any) => ({
    entityKey: String(row.entity_key),
    mapName: String(row.map_name),
    totalCount: Number(row.total_count ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    totalBans: Number(row.total_bans ?? 0),
    winRate: Number(row.win_rate ?? 0),
    pickRate: Number(row.pick_rate ?? 0),
    banRate: Number(row.ban_rate ?? 0),
  }));
}

/**
 * Summarize observed skin selection and match performance.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface SkinStat {
  skinId: number;
  skinName: string;
  championId: number;
  championName: string;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
}

/**
 * Fetch skin stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/skins${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { championId?: number; tierMin?: number; tierMax?: number; limit?: number; scope?: PublicStatsScope; queueId?: number; sort?: 'plays' | 'winRate' } -> Promise<SkinStat[]>`.
 */
export async function fetchSkinStats(params?: { championId?: number; tierMin?: number; tierMax?: number; limit?: number; scope?: PublicStatsScope; queueId?: number; sort?: 'plays' | 'winRate' }): Promise<SkinStat[]> {
  const query = new URLSearchParams();
  if (params?.championId != null) query.set('championId', String(params.championId));
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.scope) query.set('scope', params.scope);
  if (params?.queueId != null) query.set('queueId', String(params.queueId));
  if (params?.sort) query.set('sort', params.sort);
  try {
    const raw = await fetchJson<any[]>(`/stats/skins${query.toString() ? `?${query.toString()}` : ''}`);
    return raw.map((row) => ({
      skinId: Number(row.skin_id),
      skinName: String(row.skin_name ?? 'Unknown Skin'),
      championId: Number(row.champion_id),
      championName: String(row.champion_name ?? 'Unknown Champion'),
      totalPlays: Number(row.total_plays ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      winRate: Number(row.win_rate ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * Describe a skin reference requiring repair or missing authoritative detail.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface BrokenSkinStat {
  skinId: number;
  skinName: string;
  championId: number;
  championName: string;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
  usageShare: number;
}

/**
 * Fetch broken skin stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/broken-skins${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { championId?: number; tierMin?: number; tierMax?: number; scope?: PublicStatsScope; queueId?: number } -> Promise<BrokenSkinStat[]>`.
 */
export async function fetchBrokenSkinStats(params?: { championId?: number; tierMin?: number; tierMax?: number; scope?: PublicStatsScope; queueId?: number }): Promise<BrokenSkinStat[]> {
  const query = new URLSearchParams();
  if (params?.championId != null) query.set('championId', String(params.championId));
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  if (params?.scope) query.set('scope', params.scope);
  if (params?.queueId != null) query.set('queueId', String(params.queueId));
  try {
    const raw = await fetchJson<any[]>(`/stats/broken-skins${query.toString() ? `?${query.toString()}` : ''}`);
    return raw.map((row) => ({
      skinId: Number(row.skin_id),
      skinName: String(row.skin_name ?? 'Unknown Skin'),
      championId: Number(row.champion_id),
      championName: String(row.champion_name ?? 'Unknown Champion'),
      totalPlays: Number(row.total_plays ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      winRate: Number(row.win_rate ?? 0),
      usageShare: Number(row.usage_share ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * Summarize team role composition and win/loss totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchCompositionStat {
  composition: string;
  frontline: number;
  damage: number;
  flank: number;
  support: number;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
}

/**
 * Fetch match compositions data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/compositions${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { tierMin?: number; tierMax?: number; limit?: number; sortBy?: 'count' | 'winrate' | 'wins' | 'frontline' | 'damage' | 'flank' | 'support'; order?: 'asc' | 'desc' } -> Promise<MatchCompositionStat[]>`.
 */
export async function fetchMatchCompositions(params?: { tierMin?: number; tierMax?: number; limit?: number; sortBy?: 'count' | 'winrate' | 'wins' | 'frontline' | 'damage' | 'flank' | 'support'; order?: 'asc' | 'desc' }): Promise<MatchCompositionStat[]> {
  const query = new URLSearchParams();
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.sortBy) query.set('sortBy', params.sortBy);
  if (params?.order) query.set('order', params.order);
  try {
    const raw = await fetchJson<any[]>(`/matches/compositions${query.toString() ? `?${query.toString()}` : ''}`);
    return raw.map((row) => ({
      composition: String(row.comp_id),
      frontline: Number(row.frontline ?? 0),
      damage: Number(row.damage ?? 0),
      flank: Number(row.flank ?? 0),
      support: Number(row.support ?? 0),
      totalMatches: Number(row.count ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      winRate: Number(row.winrate ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * Rank players for one champion using rating and match totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionLeaderboardEntry {
  rank: number;
  playerId: number;
  playerName: string;
  mu: number;
  phi: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
}

/**
 * Fetch champion leaderboard data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/champion-leaderboard?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `championId: number; limit: number -> Promise<ChampionLeaderboardEntry[]>`.
 */
export async function fetchChampionLeaderboard(championId: number, limit = 25): Promise<ChampionLeaderboardEntry[]> {
  const query = new URLSearchParams({ championId: String(championId), limit: String(limit) });
  const raw = await fetchJson<Array<{
    rank: number; playerId: number; playerName: string;
    mu: number; phi: number; matchesPlayed: number; wins: number; losses: number;
  }>>(`/stats/champion-leaderboard?${query.toString()}`);
  return raw.map((r) => ({
    rank: r.rank, playerId: r.playerId, playerName: r.playerName,
    mu: r.mu, phi: r.phi, matchesPlayed: r.matchesPlayed, wins: r.wins, losses: r.losses,
  }));
}

// ── Champion Talent Stats ──

/**
 * Summarize one champion talent play count and win/loss record.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionTalentStat {
  talentId: number;
  talentName: string;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
}

/**
 * Combine talent statistics with coverage and disconnected-player counts.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionTalentStatsResponse {
  totalMatches: number;
  talentCoveredMatches: number;
  disconnectedPlayers: number;
  disconnectedWins: number;
  disconnectedLosses: number;
  disconnectedWinRate: number | null;
  talentCoverageRate: number | null;
  talents: ChampionTalentStat[];
}

/**
 * NormalizeChampionTalentStatsResponse for the API-client data path.
 *
 * Accepts raw; returns normalizeChampionTalentStatsResponse data from local computation without network, authentication, cache, or persistence effects.
 * refs: none
 * I/O types: `raw: any -> ChampionTalentStatsResponse`.
 */
export function normalizeChampionTalentStatsResponse(raw: any): ChampionTalentStatsResponse {
  return {
    totalMatches: numberOrNull(raw?.totalMatches) ?? 0,
    talentCoveredMatches: numberOrNull(raw?.talentCoveredMatches) ?? 0,
    disconnectedPlayers: numberOrNull(raw?.disconnectedPlayers) ?? 0,
    disconnectedWins: numberOrNull(raw?.disconnectedWins) ?? 0,
    disconnectedLosses: numberOrNull(raw?.disconnectedLosses) ?? 0,
    disconnectedWinRate: toDisplayPercent(raw?.disconnectedWinRate),
    talentCoverageRate: toDisplayPercent(raw?.talentCoverageRate),
    talents: (Array.isArray(raw?.talents) ? raw.talents : []).map((talent: any) => ({
      talentId: numberOrNull(talent?.talentId) ?? 0,
      talentName: String(talent?.talentName ?? 'Unknown'),
      totalPlays: numberOrNull(talent?.totalPlays) ?? 0,
      wins: numberOrNull(talent?.wins) ?? 0,
      losses: numberOrNull(talent?.losses) ?? 0,
      winRate: toDisplayPercent(talent?.winRate) ?? 0,
    })),
  };
}

/**
 * Fetch champion talent stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/talents/${championId}?${query.toString()}'` through the shared API transport. Propagate transport/provider failures; an unavailable response is never fabricated as zero samples.
 * I/O types: `championId: number; mode: 'ranked'; tier?: { tierMin?: number; tierMax?: number } -> Promise<ChampionTalentStatsResponse>`.
 */
export async function fetchChampionTalentStats(
  championId: number,
  mode: 'ranked' = 'ranked',
  tier?: { tierMin?: number; tierMax?: number }
): Promise<ChampionTalentStatsResponse> {
  const query = new URLSearchParams({ mode });
  if (tier?.tierMin != null) query.set('tierMin', String(tier.tierMin));
  if (tier?.tierMax != null) query.set('tierMax', String(tier.tierMax));
  const raw = await fetchJson<{
    totalMatches: number | string;
    talentCoveredMatches?: number | string;
    disconnectedPlayers?: number | string;
    disconnectedWins?: number | string;
    disconnectedLosses?: number | string;
    disconnectedWinRate?: number | string | null;
    talentCoverageRate?: number | string | null;
    talents: Array<{
      talentId: number | string;
      talentName: string;
      totalPlays: number | string;
      wins: number | string;
      losses: number | string;
      winRate: number | string;
    }>;
  }>(`/stats/talents/${championId}?${query.toString()}`);

  return normalizeChampionTalentStatsResponse(raw);
}

// ── Champion Card Stats ──

/**
 * Summarize card selections and win rate at one card level.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionCardLevelStat {
  level: number;
  plays: number;
  winRate: number;
}

/**
 * Summarize card performance with level breakdowns.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionCardStat {
  cardId: number;
  cardName: string;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
  levels: ChampionCardLevelStat[];
}

/**
 * Combine champion card statistics with total match coverage.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionCardStatsResponse {
  totalMatches: number;
  cards: ChampionCardStat[];
}

function statNameKeyForCards(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * NormalizeChampionCardStatsResponse for the API-client data path.
 *
 * Accepts raw; returns normalizeChampionCardStatsResponse data from local computation without network, authentication, cache, or persistence effects.
 * refs: none
 * I/O types: `raw: any -> ChampionCardStatsResponse`.
 */
export function normalizeChampionCardStatsResponse(raw: any): ChampionCardStatsResponse {
  const mappedCards = (Array.isArray(raw?.cards) ? raw.cards : []).map((card: any) => ({
    cardId: numberOrNull(card?.cardId) ?? 0,
    cardName: String(card?.cardName ?? 'Unknown'),
    totalPlays: numberOrNull(card?.totalPlays) ?? 0,
    wins: numberOrNull(card?.wins) ?? 0,
    losses: numberOrNull(card?.losses) ?? 0,
    winRate: toDisplayPercent(card?.winRate) ?? 0,
    levels: (Array.isArray(card?.levels) ? card.levels : []).map((level: any) => ({
      level: numberOrNull(level?.level) ?? 0,
      plays: numberOrNull(level?.plays) ?? 0,
      winRate: toDisplayPercent(level?.winRate) ?? 0,
    })),
  }));
  const dedupedByName = new Map<string, ChampionCardStat>();
  for (const card of mappedCards) {
    const key = statNameKeyForCards(card.cardName);
    const existing = dedupedByName.get(key);
    if (!existing || card.totalPlays > existing.totalPlays) dedupedByName.set(key, card);
  }

  return {
    totalMatches: numberOrNull(raw?.totalMatches) ?? 0,
    cards: Array.from(dedupedByName.values()).sort((a, b) => {
      const playsDelta = b.totalPlays - a.totalPlays;
      return playsDelta !== 0 ? playsDelta : a.cardName.localeCompare(b.cardName);
    }),
  };
}
/**
 * Summarize card performance for one selected talent.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionCardTalentStat {
  talentId: number;
  talentName: string;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
}

/**
 * Describe ranked card detail with champion, optional talent filter, and level/talent breakdowns.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ChampionCardDetailResponse {
  cardId: number;
  cardName: string;
  championId: number;
  championName: string;
  mode: 'ranked';
  talentId: number | null;
  totalPlays: number;
  wins: number;
  losses: number;
  winRate: number;
  levels: ChampionCardLevelStat[];
  talents: ChampionCardTalentStat[];
}


/**
 * Fetch champion card detail data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/cards/${championId}/${cardId}?mode=${mode}${talentId ? '&talentId=${talentId}' : ''}'` through the shared API transport. Propagate request failures so the caller can report the actual cause.
 * I/O types: `championId: number; cardId: number; mode?: string; talentId?: number | null; tier?: { tierMin?: number; tierMax?: number } -> Promise<ChampionCardDetailResponse>`.
 */
export async function fetchChampionCardDetail(
  championId: number,
  cardId: number,
  mode: 'ranked' = 'ranked',
  talentId?: number | null,
  tier?: { tierMin?: number; tierMax?: number },
): Promise<ChampionCardDetailResponse> {
  const query = new URLSearchParams({ mode });
  if (talentId) query.set('talentId', String(talentId));
  if (tier?.tierMin != null) query.set('tierMin', String(tier.tierMin));
  if (tier?.tierMax != null) query.set('tierMax', String(tier.tierMax));
  const raw = await fetchJson<ChampionCardDetailResponse>(
    `/stats/cards/${championId}/${cardId}?${query.toString()}`
  );

  return {
    ...raw,
    cardId: Number(raw.cardId) || cardId,
    championId: Number(raw.championId) || championId,
    talentId: raw.talentId == null ? null : Number(raw.talentId),
    totalPlays: Number(raw.totalPlays) || 0,
    wins: Number(raw.wins) || 0,
    losses: Number(raw.losses) || 0,
    winRate: toDisplayPercent(raw.winRate) ?? 0,
    levels: (raw.levels ?? []).map((level) => ({
      level: Number(level.level) || 0,
      plays: Number(level.plays) || 0,
      winRate: toDisplayPercent(level.winRate) ?? 0,
    })),
    talents: (raw.talents ?? []).map((talent) => ({
      talentId: Number(talent.talentId) || 0,
      talentName: talent.talentName ?? 'Unknown',
      totalPlays: Number(talent.totalPlays) || 0,
      wins: Number(talent.wins) || 0,
      losses: Number(talent.losses) || 0,
      winRate: toDisplayPercent(talent.winRate) ?? 0,
    })),
  };
}
/**
 * Fetch champion card stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/cards/${championId}?${query.toString()}'` through the shared API transport. Propagate request failures so unavailable data is not presented as an empty result.
 * I/O types: `championId: number; mode: 'ranked'; talentId?: number | null; tier?: { tierMin?: number; tierMax?: number } -> Promise<ChampionCardStatsResponse>`.
 */
export async function fetchChampionCardStats(
  championId: number,
  mode: 'ranked' = 'ranked',
  talentId?: number | null,
  tier?: { tierMin?: number; tierMax?: number }
): Promise<ChampionCardStatsResponse> {
  const query = new URLSearchParams({ mode });
  if (talentId) query.set('talentId', String(talentId));
  if (tier?.tierMin != null) query.set('tierMin', String(tier.tierMin));
  if (tier?.tierMax != null) query.set('tierMax', String(tier.tierMax));
  const raw = await fetchJson<{
      totalMatches: number | string;
      cards: Array<{
        cardId: number | string;
        cardName: string;
        totalPlays: number | string;
        wins: number | string;
        losses: number | string;
        winRate: number | string;
        levels: Array<{
          level: number | string;
          plays: number | string;
          winRate: number | string;
        }>;
      }>;
  }>(`/stats/cards/${championId}?${query.toString()}`);

  return normalizeChampionCardStatsResponse(raw);
}

/**
 * Fetch hourly match counts data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/hourly-match-counts${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Return `[]` on a caught request failure.
 * I/O types: `params?: { date?: string; hour?: number; queueId?: number } -> Promise<HourlyMatchCount[]>`.
 */
export async function fetchHourlyMatchCounts(params?: { date?: string; hour?: number; queueId?: number }): Promise<HourlyMatchCount[]> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.hour != null) query.set('hour', String(params.hour));
  if (params?.queueId != null) query.set('queueId', String(params.queueId));
  try {
    const raw = await fetchJson<Array<{
      date: string;
      hour: number | string;
      queue_id: number | string;
      matches_na?: number | string;
      matches_eu?: number | string;
      matches_asia?: number | string;
      matches_br?: number | string;
      matches_oce?: number | string;
      matches_sa?: number | string;
      matches_unknown?: number | string;
      total_matches?: number | string;
      fetched_at?: string | null;
    }>>(`/stats/hourly-match-counts${query.toString() ? `?${query.toString()}` : ''}`);
    const n = (value: number | string | undefined) => Number(value ?? 0);
    return raw.map((r) => ({
      date: r.date,
      hour: Number(r.hour),
      queueId: Number(r.queue_id),
      matches: {
        NA: n(r.matches_na),
        EU: n(r.matches_eu),
        Asia: n(r.matches_asia),
        BR: n(r.matches_br),
        OCE: n(r.matches_oce),
        SA: n(r.matches_sa),
        Unknown: n(r.matches_unknown),
      },
      totalMatches: n(r.total_matches),
      fetchedAt: r.fetched_at ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch tiers data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/tiers${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { source?: 'profiles' | 'matches' } -> Promise<TierStat[]>`.
 */
export async function fetchTiers(params?: { source?: 'profiles' | 'matches' }): Promise<TierStat[]> {
  const query = new URLSearchParams();
  if (params?.source) query.set('source', params.source);
  const raw = await fetchJson<Array<{
    tier: string;
    tier_sort: number | string;
    total_plays: number | string;
    avg_win_rate: number | string | null;
    percentage?: number | string | null;
  }>>(`/stats/tiers${query.toString() ? `?${query.toString()}` : ''}`);

  return raw.map((r) => ({
    tier: r.tier,
    tierSort: numberOrNull(r.tier_sort) ?? 0,
    totalPlays: numberOrNull(r.total_plays) ?? 0,
    avgWinRate: toDisplayPercent(r.avg_win_rate) ?? 0,
    percentage: numberOrNull(r.percentage) ?? 0,
  }));
}

/**
 * Combine performance metrics with champion, item, map, and tier statistics.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface StatsOverview {
  metrics: PerformanceMetricsResponse;
  champions: Champion[];
  items: ItemStat[];
  maps: MapStat[];
  profileTiers: TierStat[];
  activeTiers: TierStat[];
}

let statsOverviewCache: { key: string; value: StatsOverview; expiresAt: number } | null = null;
let statsOverviewInFlight: { key: string; promise: Promise<StatsOverview> } | null = null;

function mapStatsOverview(raw: any): StatsOverview {
  const number = (value: unknown) => Number(value ?? 0);
  const mapItems = (rows: any[]): ItemStat[] => rows.map((row) => ({
    itemId: number(row.item_id), itemName: String(row.item_name ?? ''),
    totalUsage: number(row.total_uses ?? row.total_usage), winRate: number(row.win_rate),
    pickRate: row.pick_rate == null ? undefined : number(row.pick_rate),
    slots: (row.slots ?? []).map((slot: any) => ({ slot: number(slot.slot), totalUses: number(slot.total_uses), wins: 0, losses: 0, winRate: number(slot.win_rate) })),
    levels: (row.levels ?? []).map((level: any) => ({ level: number(level.item_level), totalUses: number(level.total_uses), wins: 0, losses: 0, winRate: number(level.win_rate) })),
    breakdown: (row.breakdown ?? []).map((entry: any) => ({ slot: number(entry.slot), level: number(entry.item_level), totalUses: number(entry.total_uses), wins: 0, losses: 0, winRate: number(entry.win_rate), pickRate: entry.pick_rate == null ? undefined : number(entry.pick_rate) })),
  }));
  const mapMaps = (rows: any[]): MapStat[] => rows.map((row) => ({
    name: String(row.map ?? ''), totalMatches: number(row.total_matches),
    distributionRate: number(row.distribution_rate), avgDurationSeconds: number(row.avg_duration_seconds),
  }));
  const mapTiers = (rows: any[]): TierStat[] => rows.map((row) => ({
    tier: String(row.tier ?? ''), tierSort: number(row.tier_sort), totalPlays: number(row.total_plays),
    avgWinRate: toDisplayPercent(row.avg_win_rate) ?? 0, percentage: number(row.percentage),
  }));
  return {
    metrics: Object.fromEntries(Object.entries(raw.metrics ?? {}).map(([metric, summary]) => [metric, mapMetricSummary(summary)])),
    champions: mapChampionsOverview(raw.champions ?? {}),
    items: mapItems(raw.items ?? []),
    maps: mapMaps(raw.maps ?? []),
    profileTiers: mapTiers(raw.profile_tiers ?? []),
    activeTiers: mapTiers(raw.active_tiers ?? []),
  };
}

function mapBaselineRows(rows: any[]): BaselineEntry[] {
  return rows.map((row) => ({
    role: String(row.role ?? ''), queueId: Number(row.queue_id ?? 486),
    avgCpm: Number(row.avg_gpm ?? 0), avgDpm: Number(row.avg_dpm ?? 0), avgHpm: Number(row.avg_hpm ?? 0),
    avgShpm: row.avg_shpm == null ? null : Number(row.avg_shpm), avgSpm: row.avg_spm == null ? null : Number(row.avg_spm), avgKda: Number(row.avg_kda ?? 0),
    p10Cpm: Number(row.p10_gpm ?? 0), p90Cpm: Number(row.p90_gpm ?? 0), p10Dpm: Number(row.p10_dpm ?? 0), p90Dpm: Number(row.p90_dpm ?? 0),
    avgEcpm: Number(row.avg_egpm ?? 0), p10Ecpm: Number(row.p10_egpm ?? 0), p25Ecpm: Number(row.p25_egpm ?? 0),
    p75Ecpm: Number(row.p75_egpm ?? 0), p90Ecpm: Number(row.p90_egpm ?? 0), maxEcpm: Number(row.max_egpm ?? 0),
    sampleSize: Number(row.sample_size ?? 0), updatedAt: row.updated_at ?? null,
  }));
}

/**
 * Combine the statistics overview with baselines, skins, compositions, and broken-skin records.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface StatsPageData {
  overview: StatsOverview;
  baselines: BaselineEntry[];
  skins: SkinStat[];
  skinSort?: string;
  compositions: MatchCompositionStat[];
  brokenSkins: BrokenSkinStat[];
}

/**
 * Fetch stats page data data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/page-data${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { tierMin?: number; tierMax?: number } -> Promise<StatsPageData>`.
 */
export async function fetchStatsPageData(params?: { tierMin?: number; tierMax?: number }): Promise<StatsPageData> {
  const query = new URLSearchParams({ view: 'portal-v2' });
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  const raw = await fetchJson<any>(`/stats/page-data${query.toString() ? `?${query.toString()}` : ''}`, { unwrapData: false });
  return mapStatsPageData(raw);
}

/** Shared normalization for the full stats bundle and its public preview subset.
 *
 * I/O: in (raw: any) -> out StatsPageData
 *
 * refs: none
 */
export function mapStatsPageData(raw: any): StatsPageData {
  const skinRows = (rows: any[]): SkinStat[] => rows.map((row) => ({
    skinId: Number(row.skin_id), skinName: String(row.skin_name ?? 'Unknown Skin'), championId: Number(row.champion_id), championName: String(row.champion_name ?? 'Unknown Champion'),
    totalPlays: Number(row.total_plays ?? 0), wins: Number(row.wins ?? 0), losses: Number(row.losses ?? 0), winRate: Number(row.win_rate ?? 0),
  }));
  const compositions = (rows: any[]): MatchCompositionStat[] => rows.map((row) => ({
    composition: String(row.comp_id ?? `${row.frontline_count}-${row.damage_count}-${row.flank_count}-${row.support_count}`), frontline: Number(row.frontline ?? row.frontline_count ?? 0), damage: Number(row.damage ?? row.damage_count ?? 0), flank: Number(row.flank ?? row.flank_count ?? 0), support: Number(row.support ?? row.support_count ?? 0),
    totalMatches: Number(row.count ?? row.total_matches ?? 0), wins: Number(row.wins ?? 0), losses: Number(row.losses ?? 0), winRate: Number(row.winrate ?? row.win_rate ?? 0),
  }));
  return {
    overview: mapStatsOverview(raw.overview ?? {}),
    baselines: mapBaselineRows(raw.baselines ?? []),
    skins: skinRows(raw.skins ?? []),
    skinSort: raw.skin_sort,
    compositions: compositions(raw.compositions ?? []),
    brokenSkins: (raw.broken_skins ?? []).map((row: any) => ({ ...skinRows([row])[0], usageShare: Number(row.usage_share ?? 0) })),
  };
}

/**
 * Fetch stats overview data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/overview'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<StatsOverview>`.
 */
export async function fetchStatsOverview(): Promise<StatsOverview> {
  const cacheKey = getStoredLobbyTierFilter();
  if (statsOverviewCache?.key === cacheKey && statsOverviewCache.expiresAt > Date.now()) return statsOverviewCache.value;
  if (statsOverviewInFlight?.key === cacheKey) return statsOverviewInFlight.promise;
  const promise = (async () => {
    const raw = await fetchJson<any>('/stats/overview', { unwrapData: false });
    const number = (value: unknown) => Number(value ?? 0);
    const mapItems = (rows: any[]): ItemStat[] => rows.map((row) => ({
      itemId: number(row.item_id), itemName: String(row.item_name ?? ''),
      totalUsage: number(row.total_uses ?? row.total_usage), winRate: number(row.win_rate),
      pickRate: row.pick_rate == null ? undefined : number(row.pick_rate),
      slots: (row.slots ?? []).map((slot: any) => ({ slot: number(slot.slot), totalUses: number(slot.total_uses), wins: 0, losses: 0, winRate: number(slot.win_rate) })),
      levels: (row.levels ?? []).map((level: any) => ({ level: number(level.item_level), totalUses: number(level.total_uses), wins: 0, losses: 0, winRate: number(level.win_rate) })),
      breakdown: (row.breakdown ?? []).map((entry: any) => ({ slot: number(entry.slot), level: number(entry.item_level), totalUses: number(entry.total_uses), wins: 0, losses: 0, winRate: number(entry.win_rate), pickRate: entry.pick_rate == null ? undefined : number(entry.pick_rate) })),
    }));
    const mapMaps = (rows: any[]): MapStat[] => rows.map((row) => ({
      name: String(row.map ?? ''), totalMatches: number(row.total_matches),
      distributionRate: number(row.distribution_rate), avgDurationSeconds: number(row.avg_duration_seconds),
    }));
    const mapTiers = (rows: any[]): TierStat[] => rows.map((row) => ({
      tier: String(row.tier ?? ''), tierSort: number(row.tier_sort), totalPlays: number(row.total_plays),
      avgWinRate: toDisplayPercent(row.avg_win_rate) ?? 0, percentage: number(row.percentage),
    }));
    const overview: StatsOverview = {
      metrics: Object.fromEntries(Object.entries(raw.metrics ?? {}).map(([metric, summary]) => [metric, mapMetricSummary(summary)])),
      champions: mapChampionsOverview(raw.champions ?? {}),
      items: mapItems(raw.items ?? []),
      maps: mapMaps(raw.maps ?? []),
      profileTiers: mapTiers(raw.profile_tiers ?? []),
      activeTiers: mapTiers(raw.active_tiers ?? []),
    };
    statsOverviewCache = { key: cacheKey, value: overview, expiresAt: Date.now() + 300_000 };
    return overview;
  })();
  statsOverviewInFlight = { key: cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (statsOverviewInFlight?.promise === promise) statsOverviewInFlight = null;
  }
}

/**
 * Fetch tier summary data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/tiers/summary'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<TierSummary>`.
 */
export async function fetchTierSummary(): Promise<TierSummary> {
  const raw = await fetchJson<{
    profile_players: number | string | null;
    avg_profile_tier: number | string | null;
    match_player_rows: number | string | null;
    active_players: number | string | null;
    ranked_matches: number | string | null;
    avg_participation_tier: number | string | null;
    avg_match_tier: number | string | null;
    median_match_tier: number | string | null;
  }>('/stats/tiers/summary');

  return {
    profilePlayers: numberOrNull(raw.profile_players) ?? 0,
    avgProfileTier: numberOrNull(raw.avg_profile_tier) ?? 0,
    matchPlayerRows: numberOrNull(raw.match_player_rows) ?? 0,
    activePlayers: numberOrNull(raw.active_players) ?? 0,
    rankedMatches: numberOrNull(raw.ranked_matches) ?? 0,
    avgParticipationTier: numberOrNull(raw.avg_participation_tier) ?? 0,
    avgMatchTier: numberOrNull(raw.avg_match_tier) ?? 0,
    medianMatchTier: numberOrNull(raw.median_match_tier) ?? 0,
  };
}

/**
 * Fetch talents data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/talents'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `tier?: { tierMin?: number; tierMax?: number } -> Promise<Array<{ talentId: number; talentName: string }>>`.
 */
export async function fetchTalents(tier?: { tierMin?: number; tierMax?: number }): Promise<Array<{
  talentId: number;
  talentName: string;
  championId: number;
  championName: string;
  totalPlays: number;
  winRate: number;
}>> {
  const query = new URLSearchParams({ mode: "ranked", limit: "200" });
  if (tier?.tierMin != null) query.set("tierMin", String(tier.tierMin));
  if (tier?.tierMax != null) query.set("tierMax", String(tier.tierMax));
  const raw = await fetchJson<Array<{
    talent_id: number | string;
    name?: string;
    talent_name?: string;
    champion_id?: number | string | null;
    champion_name?: string | null;
    total_plays?: number | string;
    total_uses?: number | string;
    win_rate: number | string;
  }>>(`/stats/talents?${query.toString()}`);

  return raw.map((r) => ({
    talentId: numberOrNull(r.talent_id) ?? 0,
    talentName: r.talent_name ?? r.name ?? `Talent ${r.talent_id}`,
    championId: numberOrNull(r.champion_id) ?? 0,
    championName: r.champion_name ?? 'Unknown',
    totalPlays: numberOrNull(r.total_plays ?? r.total_uses) ?? 0,
    winRate: toDisplayPercent(r.win_rate) ?? 0,
  }));
}

// ── Auth Types ──

/** A backend account access restriction (code + optional localized label/detail).
 *
 * refs: none
 */
export interface AccessRestriction {
  code: string;
  label?: string;
  detail?: string;
}

function parseAccessRestriction(value: unknown, fallbackCode?: unknown): AccessRestriction | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const detail = typeof record.detail === "string" ? record.detail.trim() : "";
    if (code && label && detail) return { code, label, detail };
  }

  // The backend sends only the restriction kind (a code); label/detail are
  // backend-provided when present. The UI localizes its own surface, so no
  // hardcoded English copy is carried here.
  const code = typeof fallbackCode === "string" ? fallbackCode.trim() : "";
  return code ? { code } : null;
}

/**
 * Describe the signed-in account, access flags, profile, and linked player.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isAdmin: boolean;
  isApproved: boolean;
  isProjectDeveloper?: boolean;
  createdAt: string;
  lastLogin: string | null;
  timeZone: string | null;
  linkedPlayerId: number | null;
  linkedPlayerName: string | null;
  invitationActive?: boolean;
  invitationRequired?: boolean;
  invitationExpiresAt?: string | null;
  accessRestriction: AccessRestriction | null;
}

/**
 * Pair the signed-in user with its session token and expiry.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

// ── Auth Helpers ──

const TOKEN_KEY = "pc_auth_token";
const USER_KEY = "pc_auth_user";

/**
 * Read or change the local auth token state.
 *
 * refs: none
 * Compute get auth token.
 * I/O types: `none -> string | null`.
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// OIDC keeps the opaque backend session in an HttpOnly cookie, so browser code
// cannot read its value. Its paired readable CSRF cookie is the signal that a
// same-origin API request can use that session instead of a legacy bearer token.
/**
 * Read or change the local has cookie auth session state.
 *
 * Accepts no arguments; returns hasCookieAuthSession data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `none -> boolean`.
 */
export function hasCookieAuthSession(): boolean {
  return typeof document !== "undefined"
    && document.cookie.split(";").some((part) => part.trim().startsWith("__Host-pc_csrf="));
}

/**
 * Read or change the local auth user state.
 *
 * refs: none
 * Compute get auth user.
 * I/O types: `none -> AuthUser | null`.
 */
export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  // CRITICAL: Wrap JSON.parse in try-catch. If localStorage data is corrupted
  // (partial write, browser crash, manual tampering), JSON.parse throws and
  // crashes the calling component. This happens on every page render (nav.tsx).
  // Source: Fault #2 — "JSON.parse unguarded on corrupted localStorage"
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * CacheAuthUser for the client authentication state.
 *
 * Accepts user; returns cacheAuthUser data while reading or changing local auth state without a backend request.
 * refs: none
 * I/O types: `user: AuthUser -> void`.
 */
export function cacheAuthUser(user: AuthUser): void {
  if (typeof window !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function setAuthSession(session: AuthSession) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  }
}

/**
 * Read or change the local auth state.
 *
 * Accepts no arguments; returns clearAuth data while reading or changing local auth state without a backend request.
 * refs: none
 * I/O types: `none -> void`.
 */
export function clearAuth() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

// Retained only during the explicit legacy-compatible transition build. The
// Keycloak-only build renders no controls that can call these endpoints.
/**
 * Register a new account with the identity service.
 *
 * Accepts username, email, password; returns register data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `username: string; email: string | null; password: string -> Promise<AuthSession>`.
 */
export async function register(username: string, email: string, password: string): Promise<AuthSession> {
  const raw = await fetchJson<{ user: { id: number; username: string; email?: string | null; avatar_url?: string | null; bio?: string | null; is_admin?: boolean; is_approved?: boolean; created_at?: string; last_login?: string | null; time_zone?: string | null }; token: string; expires_at?: string }>("/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password }),
  });
  const session: AuthSession = { user: {
    id: raw.user.id, username: raw.user.username, email: raw.user.email ?? email,
    avatarUrl: raw.user.avatar_url ?? null, bio: raw.user.bio ?? null,
    isAdmin: raw.user.is_admin ?? false, isApproved: raw.user.is_approved ?? false,
    createdAt: raw.user.created_at ?? new Date().toISOString(), lastLogin: raw.user.last_login ?? null,
    timeZone: raw.user.time_zone ?? null, linkedPlayerId: null, linkedPlayerName: null,
    accessRestriction: null,
  }, token: raw.token, expiresAt: raw.expires_at ?? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() };
  setAuthSession(session);
  return session;
}

/**
 * Authenticate account credentials and establish a client session.
 *
 * Accepts username, password; returns login data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `username: string; password: string -> Promise<AuthSession>`.
 */
export async function login(username: string, password: string): Promise<AuthSession> {
  const raw = await fetchJson<{ user: { id: number; username: string; email?: string | null; avatar_url?: string | null; bio?: string | null; is_admin?: boolean; is_approved?: boolean; created_at?: string; last_login?: string | null; time_zone?: string | null; linked_player_id?: number | null; linked_player_name?: string | null; access_restriction?: unknown; access_restriction_kind?: string | null }; token: string; expires_at?: string }>("/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
  });
  const session: AuthSession = { user: {
    id: raw.user.id, username: raw.user.username, email: raw.user.email ?? "",
    avatarUrl: raw.user.avatar_url ?? null, bio: raw.user.bio ?? null,
    isAdmin: raw.user.is_admin ?? false, isApproved: raw.user.is_approved ?? false,
    createdAt: raw.user.created_at ?? new Date().toISOString(), lastLogin: raw.user.last_login ?? null,
    timeZone: raw.user.time_zone ?? null, linkedPlayerId: raw.user.linked_player_id ?? null,
    linkedPlayerName: raw.user.linked_player_name ?? null,
    accessRestriction: parseAccessRestriction(raw.user.access_restriction, raw.user.access_restriction_kind),
  }, token: raw.token, expiresAt: raw.expires_at ?? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() };
  setAuthSession(session);
  return session;
}

function submitOidcLogout(): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/oidc/logout";
  document.body.appendChild(form);
  form.submit();
}

/**
 * End the current account session with the identity service.
 *
 * Accepts no arguments; returns logout data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `none -> Promise<void>`.
 */
export async function logout(): Promise<void> {
  const hasOidcCookieSession = typeof document !== "undefined"
    && document.cookie.split(";").some((part) => part.trim().startsWith("__Host-pc_csrf="));
  if ((identityCutoverEnabled || hasOidcCookieSession) && typeof document !== "undefined") {
    // Keep the RP logout navigation on the original user gesture. Waiting for a
    // stale transition token first can prevent Keycloak SSO termination.
    clearAuth();
    submitOidcLogout();
    return;
  }
  const token = getAuthToken();
  try {
    if (token) {
      // Logout must be local-first from the user's perspective. The server call
      // invalidates the remote session when reachable, but a stale token,
      // offline backend, or dev proxy failure must not trap the browser in a
      // zombie logged-in state. Local storage is cleared in finally below.
      await fetchJson<unknown>(`/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
        retries: 0,
      });
    }
  } catch (err) {
    console.warn("Server logout failed; clearing local session anyway.", err);
  } finally {
    clearAuth();
  }
}

/**
 * Fetch me data for client consumers.
 *
 * refs: none
 * Request `GET '/auth/me'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `_userId?: number -> Promise<AuthUser>`.
 */
export async function getMe(_userId?: number): Promise<AuthUser> {
  const token = getAuthToken();
  const raw = await fetchJson<{
    user_id?: number;
    id?: number;
    username: string;
    email: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_admin?: boolean;
    is_approved?: boolean;
    is_project_developer?: boolean;
    created_at?: string;
    last_login?: string | null;
    time_zone?: string | null;
    linked_player_id?: number | null;
    linked_player_name?: string | null;
    invitation_active?: boolean;
    invitation_required?: boolean;
    invitation_expires_at?: string | null;
    access_restriction?: unknown;
    access_restriction_kind?: string | null;
  }>(`/auth/me`, {
    headers: accountAuthHeaders(token),
  });

  return {
    id: raw.id ?? raw.user_id ?? 0,
    username: raw.username,
    email: raw.email,
    avatarUrl: raw.avatar_url,
    bio: raw.bio,
    isAdmin: raw.is_admin ?? false,
    isApproved: raw.is_approved ?? false,
    isProjectDeveloper: raw.is_project_developer ?? false,
    createdAt: raw.created_at ?? "",
    lastLogin: raw.last_login ?? null,
    timeZone: raw.time_zone ?? null,
    linkedPlayerId: raw.linked_player_id ?? null,
    linkedPlayerName: raw.linked_player_name ?? null,
    invitationActive: raw.invitation_active === true,
    invitationRequired: raw.invitation_required !== false,
    invitationExpiresAt: raw.invitation_expires_at ?? null,
    accessRestriction: parseAccessRestriction(raw.access_restriction, raw.access_restriction_kind),
  };
}

/**
 * Fetch user profile data for client consumers.
 *
 * refs: none
 * Request `GET '/players/${userId}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `userId: number -> Promise<AuthUser>`.
 */
export async function getUserProfile(userId: number): Promise<AuthUser> {
  const raw = await fetchJson<{
    id: number;
    username: string;
    email: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_admin?: boolean;
    is_approved?: boolean;
    created_at: string;
    last_login: string | null;
  }>(`/players/${userId}`);

  return {
    id: raw.id,
    username: raw.username,
    email: raw.email,
    avatarUrl: raw.avatar_url,
    bio: raw.bio,
    isAdmin: raw.is_admin ?? false,
    isApproved: raw.is_approved ?? false,
    createdAt: raw.created_at,
    lastLogin: raw.last_login,
    timeZone: null,
    linkedPlayerId: null,
    linkedPlayerName: null,
    accessRestriction: null,
  };
}

// ── Account Management ──

/**
 * Read or change the local account auth headers state.
 *
 * Accepts token; returns accountAuthHeaders data while reading or changing local auth state without a backend request.
 * refs: none
 * I/O types: `token: string | null -> Record<string, string>`.
 */
export function accountAuthHeaders(token: string | null = getAuthToken()): Record<string, string> {
  if (hasCookieAuthSession() && token === getAuthToken()) return {};
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Combine account profile data with an optional linked-player summary.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface AccountDetails {
  user: AuthUser & { linked_player_id: number | null };
  linkedPlayer: {
    id: number;
    name: string;
    platform_name: string | null;
    level: number | null;
    wins: number | null;
    losses: number | null;
    kbm_tier: string | null;
    kbm_points: number | null;
  } | null;
}

/**
 * Describe a community-comment notification and its read timestamp.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface AccountNotification {
  id: number;
  type: "community_comment";
  postId: number | null;
  commentId: number | null;
  actorUsername: string;
  postTitle: string | null;
  commentContent: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Fetch account notifications data for client consumers.
 *
 * refs: none
 * Request `GET '/auth/account/notifications?limit=${limit}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `limit: number -> Promise<AccountNotification[]>`.
 */
export async function getAccountNotifications(limit = 25): Promise<AccountNotification[]> {
  const rows = await fetchJson<Array<{
    id: number; type: "community_comment"; post_id: number | null; comment_id: number | null;
    actor_username: string; post_title: string | null; comment_content: string | null;
    read_at: string | null; created_at: string;
  }>>(`/auth/account/notifications?limit=${limit}`, { headers: accountAuthHeaders() });
  return rows.map((notification) => ({
    id: notification.id,
    type: notification.type,
    postId: notification.post_id,
    commentId: notification.comment_id,
    actorUsername: notification.actor_username,
    postTitle: notification.post_title,
    commentContent: notification.comment_content,
    readAt: notification.read_at,
    createdAt: notification.created_at,
  }));
}

/**
 * Mark account notification read in the notification API.
 *
 * Accepts notificationId; returns markAccountNotificationRead data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `notificationId: number -> Promise<void>`.
 */
export async function markAccountNotificationRead(notificationId: number): Promise<void> {
  await fetchJson(`/auth/account/notifications/${notificationId}/read`, {
    method: "POST",
    headers: accountAuthHeaders(),
  });
}

/**
 * Fetch account details data for client consumers.
 *
 * refs: none
 * Request `GET "/auth/account"` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<AccountDetails>`.
 */
export async function getAccountDetails(): Promise<AccountDetails> {
  const raw = await fetchJson<{
    user: { id: number; username: string; email: string | null; avatar_url: string | null; bio: string | null; is_admin?: boolean; is_approved?: boolean; linked_player_id: number | null; created_at: string; last_login: string | null; time_zone?: string | null; access_restriction?: unknown; access_restriction_kind?: string | null };
    linkedPlayer: AccountDetails["linkedPlayer"];
  }>("/auth/account", {
    headers: accountAuthHeaders(),
  });
  return {
    user: {
      id: raw.user.id,
      username: raw.user.username,
      email: raw.user.email,
      avatarUrl: raw.user.avatar_url,
      bio: raw.user.bio,
      isAdmin: raw.user.is_admin ?? false,
      isApproved: raw.user.is_approved ?? false,
      createdAt: raw.user.created_at,
      lastLogin: raw.user.last_login,
      timeZone: raw.user.time_zone ?? null,
      linkedPlayerId: raw.user.linked_player_id ?? null,
      linkedPlayerName: raw.linkedPlayer?.name ?? null,
      accessRestriction: parseAccessRestriction(raw.user.access_restriction, raw.user.access_restriction_kind),
      linked_player_id: raw.user.linked_player_id,
    },
    linkedPlayer: raw.linkedPlayer,
  };
}

/** Only identity candidates needed to link an account are exposed here.
 *
 * I/O: in (query: string) -> out Promise<PlayerSearchResult[]>
 *
 * refs: none
 */
export async function fetchLinkPlayerSearch(query: string): Promise<PlayerSearchResult[]> {
  return fetchJson(`/auth/account/player-search?q=${encodeURIComponent(query)}`, { headers: accountAuthHeaders() });
}

/** The global invitation rollout policy (enabled flag).
 *
 * refs: none
 */
export interface InvitationPolicy { enabled: boolean }
/** Fetch the global invitation rollout policy.
 *
 * I/O: in () -> out Promise<InvitationPolicy>
 *
 * refs: none
 */
export async function getInvitationPolicy(): Promise<InvitationPolicy> {
  return fetchJson("/admin/invitations/policy", { headers: accountAuthHeaders() });
}
/** Set the global invitation rollout policy (enable or disable).
 *
 * I/O: in (enabled: boolean) -> out Promise<InvitationPolicy>
 *
 * refs: none
 */
export async function setInvitationPolicy(enabled: boolean): Promise<InvitationPolicy> {
  return fetchJson("/admin/invitations/policy", { method: "PUT", headers: accountAuthHeaders(), body: JSON.stringify({ enabled }) });
}
/** The invitation status for an account (required/active/state/expiry).
 *
 * refs: none
 */
export interface InvitationStatus {
  required: boolean;
  active: boolean;
  status: "none" | "active" | "expired" | "revoked";
  expires_at: string | null;
}
/** One administrator-issued invitation record (issuance and redemption audit).
 *
 * refs: none
 */
export interface AdminInvitation {
  id: number;
  issued_at: string;
  issued_by_username: string | null;
  redeemed_by_username: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  status: "unused" | "active" | "expired" | "revoked";
}
/** Fetch the invitation status for the authenticated account.
 *
 * I/O: in () -> out Promise<InvitationStatus>
 *
 * refs: none
 */
export async function getInvitationStatus(): Promise<InvitationStatus> {
  return fetchJson("/auth/account/invitation", { headers: accountAuthHeaders() });
}
/** Redeem an invitation code for the authenticated account.
 *
 * I/O: in (code: string) -> out Promise<InvitationStatus>
 *
 * refs: none
 */
export async function redeemInvitation(code: string): Promise<InvitationStatus> {
  return fetchJson("/auth/account/invitation", { method: "POST", headers: { "Content-Type": "application/json", ...accountAuthHeaders() }, body: JSON.stringify({ code }) });
}
/** Fetch a page of administrator-issued invitations.
 *
 * I/O: in (page: number) -> out Promise<{ items: AdminInvitation[]; has_more: boolean }>
 *
 * refs: none
 */
export async function getAdminInvitations(page: number): Promise<{ items: AdminInvitation[]; has_more: boolean }> {
  return fetchJson(`/admin/invitations?page=${page}`, { headers: accountAuthHeaders() });
}
/** Issue a new administrator invitation code.
 *
 * I/O: in () -> out Promise<{ code: string }>
 *
 * refs: none
 */
export async function issueAdminInvitation(): Promise<{ code: string }> {
  return fetchJson("/admin/invitations", { method: "POST", headers: accountAuthHeaders() });
}
/** Expire an administrator invitation by id.
 *
 * I/O: in (id: number) -> out Promise<void>
 *
 * refs: none
 */
export async function expireAdminInvitation(id: number): Promise<void> {
  await fetchJson(`/admin/invitations/${id}/expire`, { method: "POST", headers: accountAuthHeaders() });
}

/**
 * Link player id to the authenticated account.
 *
 * Accepts playerId; returns linkPlayerId data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `playerId: number -> Promise<{ message: string; player: { id: number; name: string } }>`.
 */
export async function linkPlayerId(playerId: number): Promise<{ message: string; player: { id: number; name: string } }> {
  return fetchJson<{ message: string; player: { id: number; name: string } }>("/auth/account/player-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ action: "link", playerId }),
  });
}

/**
 * Carry the selected player, verification code, and expiry.
 * refs: doc: documents/02-technical/security/auth.md
 */
export interface PlayerLinkVerification {
  player: { id: number; name: string };
  code: string;
  expiresAt: string;
}

/**
 * Fetch player link verification data for client consumers.
 *
 * refs: none
 * Request `GET "/auth/account/player-link/verification"` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<PlayerLinkVerification | null>`.
 */
export async function getPlayerLinkVerification(): Promise<PlayerLinkVerification | null> {
  const raw = await fetchJson<{ verification: PlayerLinkVerification | null }>("/auth/account/player-link/verification", {
    headers: accountAuthHeaders(),
  });
  return raw.verification;
}

/**
 * Start player link verification verification for the authenticated account.
 *
 * Accepts playerId; returns startPlayerLinkVerification data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `playerId: number -> Promise<PlayerLinkVerification>`.
 */
export async function startPlayerLinkVerification(playerId: number): Promise<PlayerLinkVerification> {
  const raw = await fetchJson<{ verification: PlayerLinkVerification }>("/auth/account/player-link/verification", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ playerId }),
  });
  return raw.verification;
}

/**
 * Verify player link for the authenticated account.
 *
 * Accepts no arguments; returns verifyPlayerLink data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `none -> Promise<{ message: string; player: { id: number; name: string } }>`.
 */
export async function verifyPlayerLink(): Promise<{ message: string; player: { id: number; name: string } }> {
  return fetchJson<{ message: string; player: { id: number; name: string } }>("/auth/account/player-link/verification/check", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({}),
  });
}

/**
 * Cancel player link verification verification for the authenticated account.
 *
 * Accepts no arguments; returns cancelPlayerLinkVerification data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `none -> Promise<void>`.
 */
export async function cancelPlayerLinkVerification(): Promise<void> {
  await fetchJson<{ message: string }>("/auth/account/player-link/verification", {
    method: "DELETE",
    headers: accountAuthHeaders(),
  });
}

/**
 * Unlink player from the authenticated account.
 *
 * Accepts no arguments; returns unlinkPlayer data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `none -> Promise<{ message: string }>`.
 */
export async function unlinkPlayer(): Promise<{ message: string }> {
  return fetchJson<{ message: string }>("/auth/account/player-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ action: "unlink" }),
  });
}

/**
 * Update profile through the account or community API.
 *
 * Accepts data; returns updateProfile data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `data: { avatar_url?: string | null; bio?: string | null; time_zone?: string } -> Promise<{ message: string }>`.
 */
export async function updateProfile(data: { avatar_url?: string | null; bio?: string | null; time_zone?: string }): Promise<{ message: string }> {
  return fetchJson<{ message: string }>("/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify(data),
  });
}

// ── Player Report ──

/**
 * Select the supported community player-report action.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type ReportType = 'suspicious' | 'cheater' | 'exploiter' | 'approve' | 'weirdo' | 'hall_of_fame' | 'dropper' | 'afk_wintrade';

/**
 * Supply a player-report action and optional reason.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface ReportOptions {
  type: ReportType;
  reason?: string;
}

/**
 * Report player to the moderation API.
 *
 * Accepts playerId, opts; returns reportPlayer data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `playerId: string | number; opts: ReportOptions -> Promise<{ success: boolean; message: string }>`.
 */
export async function reportPlayer(playerId: string | number, opts: ReportOptions): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  const body: Record<string, string> = { type: opts.type };
  if (opts.reason?.trim()) body.reason = opts.reason.trim();
  const raw = await fetchJson<{ success: boolean; message: string }>(`/players/${playerId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify(body),
  });
  return raw;
}

/**
 * Report private account to the moderation API.
 *
 * Accepts privateId, opts; returns reportPrivateAccount data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `privateId: string | number; opts: ReportOptions -> Promise<{ success: boolean; message: string }>`.
 */
export async function reportPrivateAccount(privateId: string | number, opts: ReportOptions): Promise<{ success: boolean; message: string }> {
  if (opts.type !== 'suspicious' && opts.type !== 'cheater') {
    throw new Error("Private account reports must use Suspicious or Cheater as the report type.");
  }
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  const body: Record<string, string> = { type: opts.type };
  if (opts.reason?.trim()) body.reason = opts.reason.trim();
  return fetchJson<{ success: boolean; message: string }>(`/player-ext/private/${privateId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...accountAuthHeaders() },
    body: JSON.stringify(body),
  });
}

/**
 * Select a moderation tag that can be cleared.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type ClearablePlayerTag = 'cheater' | 'exploiter' | 'suspicious' | 'dropper' | 'afk_wintrade' | 'alt_account';

/**
 * Clear a player moderation tag through the authenticated backend transaction.
 *
 * One bounded POST attempt: writes are never automatically replayed after a timeout.
 * refs: endpoints: POST /players/:id/clear-tag
 * I/O types: `playerId: string | number; tag: ClearablePlayerTag -> Promise<{ success: boolean; message: string; cleared: boolean }>`.
 */
export async function clearPlayerTag(playerId: string | number, tag: ClearablePlayerTag): Promise<{ success: boolean; message: string; cleared: boolean }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ success: boolean; message: string; cleared: boolean }>(`/players/${playerId}/clear-tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ tag }),
    retries: 0,
    timeoutMs: 15_000,
  });
}

// ── Tag visibility (self-service) ──

/**
 * The 8 automatic cosmetic performance tags a verified player may hide.
 * These are the `automatic_player_metric_flags` metrics. `automatic_afk` is
 * intentionally excluded (not self-toggleable).
 * refs: none
 */
export type CosmeticTagKey =
  | "wall_shooter"
  | "master_feeding"
  | "tank_diff"
  | "support_diff"
  | "dps_diff"
  | "flank_diff"
  | "noob"
  | "hypercarry";

/**
 * A single owned tag with its current public visibility.
 * refs: none
 */
export interface PlayerTagVisibility {
  tag: CosmeticTagKey;
  count: number | null;
  visible: boolean;
}

/**
 * The custom-tag request lifecycle for a player.
 * refs: none
 */
export interface PlayerCustomTag {
  status: "pending" | "approved" | "rejected";
  tagText: string | null;
  tagColor: string;
  reviewNote: string | null;
  visible: boolean;
}

/**
 * Read the self-service tag-visibility state for a player.
 *
 * Returns only the cosmetic tags the player currently owns, each with its
 * `hidden` flag, plus the player's custom-tag request (if any).
 *
 * I/O: in (playerId: string | number) -> out Promise<{ tags: PlayerTagVisibility[]; customTag: PlayerCustomTag | null }>
 *
 * refs: endpoints: GET /players/:id/tag-visibility
 */
export async function fetchTagVisibility(playerId: string | number): Promise<{
  tags: PlayerTagVisibility[];
  customTag: PlayerCustomTag | null;
}> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ tags: PlayerTagVisibility[]; customTag: PlayerCustomTag | null }>(`/players/${playerId}/tag-visibility`, {
    method: "GET",
    headers: { ...accountAuthHeaders() },
    retries: 0,
    timeoutMs: 15_000,
  });
}

/**
 * Set the visibility of an owned cosmetic tag or approved custom tag.
 *
 * I/O: in (playerId: string | number, tag: CosmeticTagKey, hidden: boolean) -> out Promise<{ success: boolean; message: string }>
 *
 * refs: endpoints: POST /players/:id/tag-visibility
 */
export async function setTagVisibility(playerId: string | number, tag: CosmeticTagKey | "custom", hidden: boolean): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ success: boolean; message: string }>(`/players/${playerId}/tag-visibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ tag, hidden }),
    retries: 0,
    timeoutMs: 15_000,
  });
}

/**
 * Submit a custom-tag request for admin approval (max one per player).
 *
 * I/O: in (playerId: string | number, tagText: string, reason: string, tagColor: string) -> out Promise<{ success: boolean; message: string; status: string }>
 *
 * refs: endpoints: POST /players/:id/custom-tag
 */
export async function submitCustomTag(playerId: string | number, tagText: string, reason?: string, tagColor?: string): Promise<{ success: boolean; message: string; status: string }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ success: boolean; message: string; status: string }>(`/players/${playerId}/custom-tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ tagText: tagText, reason: reason ?? null, tagColor }),
    retries: 0,
    timeoutMs: 15_000,
  });
}

/**
 * Save the verified owner's active tag color without changing approval.
 *
 * I/O: in (playerId: string | number, tagColor: string) -> out Promise<{ tagColor: string }>
 *
 * refs: endpoints: PUT /players/:id/custom-tag
 */
export async function setCustomTagColor(playerId: string | number, tagColor: string): Promise<{ tagColor: string }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ tagColor: string }>(`/players/${playerId}/custom-tag`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ tagColor }),
    retries: 0,
    timeoutMs: 15_000,
  });
}

/**
 * Remove the player's own approved custom tag or cancel a pending request.
 *
 * I/O: in (playerId: string | number) -> out Promise<{ success: boolean; message: string }>
 *
 * refs: endpoints: DELETE /players/:id/custom-tag
 */
export async function cancelCustomTag(playerId: string | number): Promise<{ success: boolean; message: string }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ success: boolean; message: string }>(`/players/${playerId}/custom-tag`, {
    method: "DELETE",
    headers: { ...accountAuthHeaders() },
    retries: 0,
    timeoutMs: 15_000,
  });
}

/**
 * An admin-facing custom-tag request row.
 * refs: none
 */
export interface AdminCustomTagRow {
  id: number;
  player_id: number;
  tag_text: string;
  tag_color: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "removed";
  requested_by: number | null;
  requested_by_username: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  player_name: string;
}

/**
 * List custom-tag requests for the admin portal.
 *
 * I/O: in () -> out Promise<{ items: AdminCustomTagRow[]; count: number }>
 *
 * refs: endpoints: GET /admin/custom-tags
 */
export async function fetchAdminCustomTags(): Promise<{ items: AdminCustomTagRow[]; count: number }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ items: AdminCustomTagRow[]; count: number }>(`/admin/custom-tags`, {
    method: "GET",
    headers: { ...accountAuthHeaders() },
    retries: 0,
    timeoutMs: 15_000,
  });
}

/**
 * Approve or reject a custom-tag request.
 *
 * I/O: in (id: number, status: string, reviewNote: string) -> out Promise<{ id: number; status: string }>
 *
 * refs: endpoints: POST /admin/custom-tags/:id/review
 */
export async function reviewAdminCustomTag(
  id: number,
  status: "approved" | "rejected",
  reviewNote?: string
): Promise<{ id: number; status: string }> {
  const token = getAuthToken();
  if (!token && !hasCookieAuthSession()) throw new Error(API_ERROR_KEYS.authenticationRequired);
  return fetchJson<{ id: number; status: string }>(`/admin/custom-tags/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
    body: JSON.stringify({ status, ...(reviewNote ? { reviewNote } : {}) }),
    retries: 0,
    timeoutMs: 15_000,
  });
}

// ── Community Types ──

/**
 * Describe a community post, author, linked build/tier list, and engagement totals.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface Post {
  id: number;
  userId: number;
  username: string;
  linkedPlayerId: number | null;
  title: string;
  content: string;
  buildId: number | null;
  tierListId: number | null;
  sourceUrl: string | null;
  provider: "youtube" | "medal" | "twitch" | "discord" | null;
  embedUrl: string | null;
  imageUrls: string[];
  likes: number;
  viewCount: number;
  createdAt: string;
}

/**
 * Describe a community reply with its author, parent, and creation time.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface Comment {
  id: number;
  postId: number;
  userId: number;
  username: string;
  linkedPlayerId: number | null;
  parentId: number | null;
  content: string;
  createdAt: string;
}

/**
 * Combine a community post with its comments.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PostDetail {
  post: Post;
  comments: Comment[];
}

/**
 * Describe a live Twitch channel, viewer count, language, tags, and links.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface TwitchStream {
  userLogin: string;
  userName: string;
  title: string;
  viewerCount: number;
  language: string;
  thumbnailUrl: string;
  tags: string[];
  url: string;
}

/**
 * Pair Twitch configuration availability with live stream results.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface TwitchStreamsResponse {
  configured: boolean;
  streams: TwitchStream[];
}

type RawPost = {
  id: number;
  user_id: number;
  username: string;
  linked_player_id?: number | null;
  title: string;
  content: string;
  build_id: number | null;
  tier_list_id?: number | null;
  source_url?: string | null;
  provider?: string | null;
  embed_url?: string | null;
  image_urls?: unknown;
  likes: number;
  view_count: number;
  created_at: string;
};

type RawComment = {
  id: number;
  post_id: number;
  user_id: number;
  username: string;
  linked_player_id?: number | null;
  parent_id: number | null;
  content: string;
  created_at: string;
};

function mapPost(raw: RawPost): Post {
  return {
    id: raw.id,
    userId: raw.user_id,
    username: raw.username,
    linkedPlayerId: raw.linked_player_id ?? null,
    title: raw.title,
    content: raw.content,
    buildId: raw.build_id,
    tierListId: raw.tier_list_id ?? null,
    sourceUrl: raw.source_url ?? null,
    provider: raw.provider === "youtube" || raw.provider === "medal" || raw.provider === "twitch" || raw.provider === "discord" ? raw.provider : null,
    embedUrl: raw.embed_url ?? null,
    imageUrls: Array.isArray(raw.image_urls) ? raw.image_urls.filter((url): url is string => typeof url === "string").map(mediaApiUrl) : [],
    likes: raw.likes,
    viewCount: raw.view_count,
    createdAt: raw.created_at,
  };
}

function mapComment(raw: RawComment): Comment {
  return {
    id: raw.id,
    postId: raw.post_id,
    userId: raw.user_id,
    username: raw.username,
    linkedPlayerId: raw.linked_player_id ?? null,
    parentId: raw.parent_id,
    content: raw.content,
    createdAt: raw.created_at,
  };
}

// ── Community ──

/**
 * Fetch posts data for client consumers.
 *
 * refs: none
 * Request `GET '/community/posts${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { userId?: string; buildId?: string; limit?: string; offset?: string } -> Promise<Post[]>`.
 */
export async function fetchPosts(params?: { userId?: string; buildId?: string; limit?: string; offset?: string }): Promise<Post[]> {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }
  }
  const raw = await fetchJson<RawPost[]>(`/community/posts${query.toString() ? `?${query.toString()}` : ''}`);
  return raw.map(mapPost);
}

/**
 * Fetch twitch streams data for client consumers.
 *
 * refs: none
 * Request `GET '/community/streams'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<TwitchStreamsResponse>`.
 */
export async function fetchTwitchStreams(): Promise<TwitchStreamsResponse> {
  const raw = await fetchJson<{
    configured?: boolean;
    streams?: Array<{
      userLogin: string;
      userName: string;
      title: string;
      viewerCount: number | string;
      language: string;
      thumbnailUrl: string;
      tags?: string[];
      url: string;
    }>;
  }>('/community/streams');
  return {
    configured: raw.configured === true,
    streams: (raw.streams ?? []).map((stream) => ({
      ...stream,
      viewerCount: Number(stream.viewerCount) || 0,
      tags: stream.tags ?? [],
    })),
  };
}

/**
 * Create post through the community API.
 *
 * Accepts a multipart post form and token; returns createPost data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `form: FormData; token: string | null -> Promise<Post>`.
 */
export async function createPost(form: FormData, token: string | null): Promise<Post> {
  const raw = await fetchJson<RawPost>(`/community/posts`, {
    method: "POST",
    headers: accountAuthHeaders(token),
    body: form,
    retries: 0,
    timeoutMs: 180_000,
  });

  return mapPost(raw);
}

/**
 * Fetch post detail data for client consumers.
 *
 * refs: none
 * Request `GET '/community/posts/${postId}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `postId: number -> Promise<PostDetail>`.
 */
export async function getPostDetail(postId: number): Promise<PostDetail> {
  const raw = await fetchJson<{
    post: RawPost;
    comments: RawComment[];
  }>(`/community/posts/${postId}`);

  return {
    post: mapPost(raw.post),
    comments: raw.comments.map(mapComment),
  };
}

/**
 * Update post through the account or community API.
 *
 * Accepts postId, title, content, token; returns updatePost data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `postId: number; title: string; content: string; token: string | null -> Promise<Post>`.
 */
export async function updatePost(postId: number, title: string, content: string, token: string | null): Promise<Post> {
  const raw = await fetchJson<RawPost>(`/community/posts/${postId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify({ title, content }),
  });

  return mapPost(raw);
}

/**
 * Delete post through the account or community API.
 *
 * Accepts postId, token; returns deletePost data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `postId: number; token: string | null -> Promise<void>`.
 */
export async function deletePost(postId: number, token: string | null): Promise<void> {
  await fetchJson<{ deleted: boolean; id: number }>(`/community/posts/${postId}`, {
    method: "DELETE",
    headers: accountAuthHeaders(token),
  });
}

/**
 * Add a reply to a community post.
 *
 * Accepts postId, userId, content, parentId, token; returns addComment data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `postId: number; userId: number; content: string; parentId: number | null; token: string | null -> Promise<Comment>`.
 */
export async function addComment(postId: number, userId: number, content: string, parentId: number | null, token: string | null): Promise<Comment> {
  const raw = await fetchJson<RawComment>(`/community/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify({ content, parent_id: parentId }),
  });

  return mapComment(raw);
}

/**
 * Update comment through the account or community API.
 *
 * Accepts commentId, content, token; returns updateComment data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `commentId: number; content: string; token: string | null -> Promise<Comment>`.
 */
export async function updateComment(commentId: number, content: string, token: string | null): Promise<Comment> {
  const raw = await fetchJson<RawComment>(`/community/comments/${commentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify({ content }),
  });

  return mapComment(raw);
}

/**
 * Delete comment through the account or community API.
 *
 * Accepts commentId, token; returns deleteComment data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `commentId: number; token: string | null -> Promise<void>`.
 */
export async function deleteComment(commentId: number, token: string | null): Promise<void> {
  await fetchJson<{ deleted: boolean; id: number }>(`/community/comments/${commentId}`, {
    method: "DELETE",
    headers: accountAuthHeaders(token),
  });
}

/**
 * Toggle post like for the selected content item.
 *
 * Accepts postId, userId, token; returns togglePostLike data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `postId: number; userId: number; token: string | null -> Promise<number>`.
 */
export async function togglePostLike(postId: number, userId: number, token: string | null): Promise<number> {
  const raw = await fetchJson<{ likes: number }>(`/community/posts/${postId}/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify({}),
  });

  return raw.likes;
}
// ── Build Types ──

/**
 * Pair a selected loadout card ID with its level.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface BuildCardSelection {
  cardId: number;
  level: number;
}

/**
 * Describe a community champion build with item/card/talent choices and publication metadata.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface Build {
  id: number;
  userId: number;
  username: string;
  championId: number;
  championName: string;
  name: string;
  items: number[];
  cards: BuildCardSelection[];
  actives: number[];
  talents: number[];
  notes: string | null;
  visibility: string;
  likes: number;
  viewCount: number;
  createdAt: string;
}

type RawBuild = {
  id: number;
  user_id: number;
  username?: string;
  champion_id: number;
  champion_name?: string;
  name: string;
  items?: unknown;
  cards?: unknown;
  actives?: number[] | null;
  talents?: number[] | null;
  notes: string | null;
  visibility: string;
  likes: number;
  view_count: number;
  created_at: string;
};

function mapBuildCards(cards: unknown): BuildCardSelection[] {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card) => {
      if (typeof card === "number") return { cardId: card, level: 1 };
      if (!card || typeof card !== "object") return null;
      const row = card as { cardId?: unknown; card_id?: unknown; level?: unknown; card_level?: unknown };
      const cardId = Number(row.cardId ?? row.card_id);
      const level = Number(row.level ?? row.card_level ?? 1);
      if (!Number.isFinite(cardId) || cardId === 0) return null;
      return {
        cardId,
        level: Number.isFinite(level) ? Math.min(5, Math.max(1, Math.round(level))) : 1,
      };
    })
    .filter((card): card is BuildCardSelection => card !== null);
}

function mapBuildItemIds(items: unknown): number[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => typeof item === "number" || (typeof item === "string" && item.trim() !== "") ? Number(item) : Number.NaN)
    .filter((itemId) => Number.isSafeInteger(itemId) && itemId > 0);
}

function mapBuild(raw: RawBuild): Build {
  return {
    id: raw.id,
    userId: raw.user_id,
    username: raw.username ?? "Unknown",
    championId: raw.champion_id,
    championName: raw.champion_name ?? `Champion ${raw.champion_id}`,
    name: raw.name,
    items: mapBuildItemIds(raw.items),
    cards: mapBuildCards(raw.cards),
    actives: raw.actives ?? [],
    talents: raw.talents ?? [],
    notes: raw.notes,
    visibility: raw.visibility,
    likes: raw.likes,
    viewCount: raw.view_count,
    createdAt: raw.created_at,
  };
}

// ── Builds ──

/**
 * Fetch builds data for client consumers.
 *
 * refs: none
 * Request `GET '/builds${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { championId?: string; visibility?: string; limit?: string; offset?: string } -> Promise<Build[]>`.
 */
export async function fetchBuilds(params?: { championId?: string; visibility?: string; limit?: string; offset?: string }): Promise<Build[]> {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }
  }
  const raw = await fetchJson<RawBuild[]>(`/builds${query.toString() ? `?${query.toString()}` : ''}`);
  return raw.map(mapBuild);
}

/**
 * Create build through the community API.
 *
 * Accepts userId, championId, name, items, cards, talents, notes, visibility; returns createBuild data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `userId: number; championId: number; name: string; items: number[]; cards: BuildCardSelection[]; talents: number[]; notes: string | null; visibility: string; token: string | null -> Promise<Build>`.
 */
export async function createBuild(
  userId: number,
  championId: number,
  name: string,
  items: number[],
  cards: BuildCardSelection[],
  talents: number[],
  notes: string | null,
  visibility: string,
  token: string | null,
): Promise<Build> {
  void userId;
  const raw = await fetchJson<RawBuild>(`/builds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
    body: JSON.stringify({
      champion_id: championId,
      name,
      items,
      cards: cards.map((card) => ({ card_id: card.cardId, level: card.level })),
      actives: [],
      talents,
      notes,
      visibility,
    }),
  });

  return mapBuild(raw);
}

/**
 * Fetch build detail data for client consumers.
 *
 * refs: none
 * Request `GET '/builds/${buildId}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `buildId: number -> Promise<Build>`.
 */
export async function getBuildDetail(buildId: number): Promise<Build> {
  const raw = await fetchJson<RawBuild>(`/builds/${buildId}`);
  return mapBuild(raw);
}

/**
 * Toggle build like for the selected content item.
 *
 * Accepts buildId, userId, token; returns toggleBuildLike data through a backend request, carrying authentication headers and applying the operation server-side.
 * refs: none
 * I/O types: `buildId: number; userId: number; token: string | null -> Promise<number>`.
 */
export async function toggleBuildLike(buildId: number, userId: number, token: string | null): Promise<number> {
  void userId;
  const raw = await fetchJson<{ likes: number }>(`/builds/${buildId}/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(token) },
  });

  return raw.likes;
}
// ── Chart Types ──

/**
 * Record daily kills, deaths, and assists.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface KdaHistoryEntry {
  date: string;
  kills: number;
  deaths: number;
  assists: number;
}

/**
 * Compare a player daily damage-per-minute with the population average.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface DpmHistoryEntry {
  date: string;
  playerDpm: number;
  avgDpm: number;
}

/**
 * Record a dated rating value.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface GlickoHistoryEntry {
  date: string;
  rating: number;
}

// ── Charts ──

type PlayerChartRow = {
  entry_datetime: string;
  kills?: number | string | null;
  deaths?: number | string | null;
  assists?: number | string | null;
  damage_per_minute?: number | string | null;
  rating?: number | string | null;
};

function playerChartPath(playerId: string, days: number, limit: number) {
  const to = new Date();
  // Completed-match charts tolerate minute granularity. Millisecond bounds
  // created a distinct backend cache key on every render and for each series.
  to.setUTCSeconds(0, 0);
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    limit: String(limit),
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return `/players/${encodeURIComponent(playerId)}/charts?${query.toString()}`;
}

/**
 * Fetch kda history data for client consumers.
 *
 * refs: none
 * Request `GET playerChartPath(playerId, days, limit)` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string; days: number; limit: number -> Promise<KdaHistoryEntry[]>`.
 */
export async function fetchKdaHistory(playerId: string, days: number = 30, limit: number = 50): Promise<KdaHistoryEntry[]> {
  const raw = await fetchJson<PlayerChartRow[]>(playerChartPath(playerId, days, limit));
  return mapKdaHistory(raw);
}

function mapKdaHistory(raw: PlayerChartRow[]): KdaHistoryEntry[] {
  return raw.map((r) => ({
    date: r.entry_datetime,
    kills: Number(r.kills ?? 0),
    deaths: Number(r.deaths ?? 0),
    assists: Number(r.assists ?? 0),
  }));
}

/**
 * Fetch dpm history data for client consumers.
 *
 * refs: none
 * Request `GET playerChartPath(playerId, days, limit)` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string; days: number; limit: number -> Promise<DpmHistoryEntry[]>`.
 */
export async function fetchDpmHistory(playerId: string, days: number = 30, limit: number = 50): Promise<DpmHistoryEntry[]> {
  const raw = await fetchJson<PlayerChartRow[]>(playerChartPath(playerId, days, limit));
  return mapDpmHistory(raw);
}

function mapDpmHistory(raw: PlayerChartRow[]): DpmHistoryEntry[] {
  const values = raw.map((r) => Number(r.damage_per_minute ?? 0)).filter((value) => Number.isFinite(value));
  const avgDpm = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return raw.map((r) => ({
    date: r.entry_datetime,
    playerDpm: Number(r.damage_per_minute ?? 0),
    avgDpm,
  }));
}

/**
 * Fetch glicko history data for client consumers.
 *
 * refs: none
 * Request `GET playerChartPath(playerId, days, limit)` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `playerId: string; days: number; limit: number -> Promise<GlickoHistoryEntry[]>`.
 */
export async function fetchGlickoHistory(playerId: string, days: number = 30, limit: number = 50): Promise<GlickoHistoryEntry[]> {
  const raw = await fetchJson<PlayerChartRow[]>(playerChartPath(playerId, days, limit));
  return mapGlickoHistory(raw);
}

function mapGlickoHistory(raw: PlayerChartRow[]): GlickoHistoryEntry[] {
  return raw
    .filter((r) => r.rating != null)
    .map((r) => ({
      date: r.entry_datetime,
      rating: Number(r.rating),
    }));
}

// ── Match Types ──

/**
 * Load all player chart series from the same response and time window.
 *
 * I/O: in (playerId: string, days: number, limit: number) -> out Promise<{ kda, dpm, glicko }>
 *
 * refs: none
 */
export async function fetchPlayerChartHistory(playerId: string, days: number = 30, limit: number = 50) {
  const raw = await fetchJson<PlayerChartRow[]>(playerChartPath(playerId, days, limit));
  return { kda: mapKdaHistory(raw), dpm: mapDpmHistory(raw), glicko: mapGlickoHistory(raw) };
}

/**
 * MatchPlayerDetail — local type for match player data from the API.
 * Renamed from MatchPlayer to avoid collision with the imported MatchPlayer
 * from types.gen.ts, which has a different shape (id, name vs player_id, player_name).
 * refs: none
 */
export interface MatchPlayerDetail {
  player_id: number;
  player_name: string;
  private_slot?: number | null;
  private_player_id?: number | null;
  private_account_alias?: string | null;
  private_account_verified_name?: string | null;
  private_account_display_name?: string | null;
  champion_id: number;
  champion_name: string;
  skin_id: number;
  skin_name: string;
  kills: number;
  deaths: number;
  assists: number;
  damage_done_physical: number;
  damage_done_magical: number;
  damage_done_in_hand?: number;
  damage_breakdown_available?: boolean;
  damage_taken?: number;
  damage_mitigated?: number;
  mitigation_per_minute?: number;
  healing?: number;
  healing_self?: number;
  healing_bot?: number;
  healing_player_self?: number;
  gold_earned: number;
  gold_per_minute?: number;
  egpm?: number | null;
  objective_assists?: number;
  camps_cleared?: number;
  structure_damage?: number;
  wards_placed?: number;
  towers_destroyed?: number;
  distance_traveled?: number;
  multi_kill_max?: number;
  killing_spree?: number;
  kills_first_blood?: number;
  kills_double?: number;
  kills_triple?: number;
  kills_quadra?: number;
  kills_penta?: number;
  win_status: string;
  task_force: number;
  league_tier: string | null;
  league_points?: number | null;
  league_wins?: number | null;
  league_losses?: number | null;
  account_level?: number | null;
  mastery_level?: number | null;
  platform?: string | null;
  region?: string | null;
  tier?: number | null;
  source?: string | null;
  party_id?: number | null;
  party?: number | null;
/** Legacy alias retained for older API payloads. · refs: none */
  party_number?: number | null;
  final_match_level?: number | null;
  kda: number;
  damage_per_minute: number;
  healing_per_minute: number;
  healing_self_per_minute: number;
  time_in_match: number;
  afk_rate: number;
  profile_snapshot?: MatchPlayerProfileSnapshot | null;
}

/**
 * Preserve nullable profile/rating fields and moderation flags captured for a match participant.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchPlayerProfileSnapshot {
  captured_at: string | null;
  source: 'post_match_ingest' | 'match_player' | string;
  level: number | null;
  platform: string | null;
  region: string | null;
  global_wins: number | null;
  global_losses: number | null;
  kbm_tier: number | null;
  kbm_points: number | null;
  kbm_rank: number | null;
  kbm_wins: number | null;
  kbm_losses: number | null;
  champion_wins: number | null;
  champion_losses: number | null;
  queue_elo: number | null;
  champion_elo: number | null;
  cheater: boolean;
  exploiter: boolean;
  sus_count: number;
  verified: boolean;
}

/**
 * Identify a banned champion and optional ban slot/display name.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchBan {
  ban_slot?: number;
  champion_id: number;
  champion_name?: string;
}

/**
 * Describe match identity, queue, scores, storage provenance, and visibility/quality flags.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchData {
  match_id: number;
  entry_datetime: string;
  map: string;
  queue_id: number;
  queue_name?: string | null;
  stats_scope?: string | null;
  participant_model?: string | null;
  is_custom?: boolean;
  duration_seconds: number;
  region: string;
  team1_score: number | null;
  team2_score: number | null;
  winning_task_force: number;
  is_ranked: boolean;
  recovered: boolean;
  broken: boolean;
  private: boolean;
  limited: boolean;
  limited_reason?: string | null;
}

/**
 * MatchDetail with bans — local type that includes the bans array.
 * The imported MatchDetail from types.gen.ts lacks 'bans', so we use
 * this local type for match detail pages that need ban data.
 * refs: none
 */
export interface MatchDetailWithBans {
  match: MatchData;
  players: MatchPlayerDetail[];
  bans: MatchBan[];
  /**
   * Complete match reads carry player loadouts in the same response as the
   * normalized match rows. These remain optional for compatibility with
   * older cached responses and limited historical matches.
   * refs: none
   */
  fact?: MatchFact | null;
  facts?: MatchFactPlayer[];
  snapshots?: RatingSnapshot[];
  rating_snapshots?: RatingSnapshot[];
  ratingSnapshots?: RatingSnapshot[];
  loadouts?: MatchFact | MatchFactPlayer[];
/** Storage tier selected by the Rust API for this read. · refs: none */
  storageStatus?: MatchStorageStatus;
  storage_status?: MatchStorageStatus;
  dataStatus?: MatchDataStatus;
  dataHash?: string;
  projectionVersion?: number;
  access?: MatchDetailAccess;
}

/**
 * Describe the server-enforced match-detail tier and remaining daily quota.
 * refs: none
 */
export interface MatchDetailAccess {
  tier: MatchAccessTier;
  limit: number | null;
  remaining: number | null;
  resetAtMs: number | null;
}

/**
 * Select hot or cold match storage.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type MatchStorageStatus = "hot" | "cold";

/**
 * Describe match storage tier, source, historical state, and optional retrieval time.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchDataStatus {
  tier: MatchStorageStatus;
  source: string;
  historical: boolean;
  status: string;
  retrievalMs?: number;
}

/**
 * DeriveMissingMatchCreditRates for the API-client data path.
 *
 * Accepts detail; returns deriveMissingMatchCreditRates data from local computation without network, authentication, cache, or persistence effects.
 * refs: none
 * I/O types: `detail: MatchDetailWithBans -> MatchDetailWithBans`.
 */
export function deriveMissingMatchCreditRates(detail: MatchDetailWithBans): MatchDetailWithBans {
  return {
    ...detail,
    players: detail.players.map((player) => {
      const credits = Number(player.gold_earned ?? 0);
      const seconds = Number(detail.match.duration_seconds ?? 0);
      const storedCpm = Number(player.gold_per_minute ?? 0);
      const storedEcpm = Number(player.egpm ?? 0);
      if ((storedCpm > 0 && storedEcpm > 0) || credits <= 0 || seconds <= 0) return player;
      return {
        ...player,
        gold_per_minute: storedCpm > 0
          ? player.gold_per_minute
          : Math.round((credits * 60 / seconds) * 100) / 100,
        egpm: storedEcpm > 0
          ? player.egpm
          : Math.round(((credits - 500) * 60 / seconds) * 100) / 100,
      };
    }),
  };
}

/**
 * Describe a participant factual item, card, and talent selections with reference assets.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchFactPlayer {
  player_id: number;
  player_name: string;
  champion_id?: number;
  champion_name?: string;
  items: Array<{
    item_id: number;
    slot: number;
    item_level?: number | null;
    item_name?: string | null;
    description?: string | null;
    item_type?: string | null;
    cost?: number | null;
    icon_url?: string | null;
    fallback_icon_url?: string | null;
  }>;
  cards: Array<{
    card_id: number;
    card_level?: number | null;
    card_name?: string | null;
    champion_id?: number | null;
    icon_url?: string | null;
    fallback_icon_url?: string | null;
  }>;
  talents: Array<{
    talent_id: number;
    talent_name?: string | null;
    champion_id?: number | null;
    champion_name?: string | null;
    icon_url?: string | null;
    fallback_icon_url?: string | null;
  }>;
}

/**
 * Group factual participant selections under one match ID.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchFact {
  match_id: number;
  players: MatchFactPlayer[];
}

/**
 * Record player rating and uncertainty before and after one match.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface RatingSnapshot {
  player_id: number;
  player_name: string;
  match_id: number;
  queue_id: number;
  mu_before: number | null;
  phi_before: number | null;
  mu_after: number | null;
  phi_after: number | null;
  mu_change: number | null;
}

/**
 * Describe a match-directory result with player combat and queue context.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchSearchResult {
  match_id: number;
  entry_datetime: string;
  map: string;
  queue_id: number;
  duration_seconds: number;
  region: string;
  champion_id: number;
  champion_name: string;
  win_status: string;
  kills: number;
  deaths: number;
  assists: number;
  player_count: number;
}

// ── Matches ──

/**
 * Summarize daily/hourly match activity and optional queue/weekly coverage.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchHourlyStats {
  totalToday: number;
  rankedToday: number;
  regions: Array<{ region: string; matchesPerHour: number; totalToday: number }>;
  hourly?: Array<{ hour: number; date?: string; NA: number; EU: number; Asia: number; BR: number; OCE: number; LATAM: number; total: number }>;
  currentHour?: number;
  allQueuesTotal24h?: number;
  queues?: MatchQueueActivity[];
  weekly?: Array<{
    date: string;
    total: number;
    ranked: number;
    queues: Record<string, number>;
    players: number;
    playerQueues: Record<string, number>;
  }>;
}

/**
 * Summarize 24-hour queue activity with regional and hourly breakdowns.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchQueueActivity {
  queueId: number;
  queueName: string;
  ranked: boolean;
  total24h: number;
  regions: Array<{ region: string; total24h: number; matchesPerHour: number }>;
  hourly: Array<{ hour: number; date: string; total: number; regions: Record<string, number> }>;
}

/**
 * Fetch match hourly stats data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/hourly-stats'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<MatchHourlyStats>`.
 */
export async function fetchMatchHourlyStats(): Promise<MatchHourlyStats> {
  return fetchJson<MatchHourlyStats>('/matches/hourly-stats');
}

/**
 * Bound observed public/private player counts and unresolved coverage within a time window.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PresenceStats {
  window_hours: number;
  observed_at: string;
  public_players: number;
  unresolved_player_slots_lower: number;
  unresolved_player_slots_upper: number;
  unresolved_matches: number;
  public_players_lower_bound: number;
  public_players_upper_bound: number;
  private_players: number;
  unresolved_private_observations: number;
  public_by_scope: Array<{ stats_scope: PublicStatsScope; players: number }>;
  private_by_scope: Array<{ stats_scope: PublicStatsScope; players: number }>;
  unresolved_by_scope: Array<{ stats_scope: PublicStatsScope; observations: number }>;
  public_by_queue: Array<{
    queue_id: number;
    queue_name: string;
    stats_scope: PublicStatsScope;
    players: number;
  }>;
  public_by_platform: Array<{ platform: string; players: number }>;
  public_by_region: Array<{ region: string; players: number }>;
  profile_coverage: {
    total: number;
    fresh: number;
    platform_known: number;
    platform_unknown: number;
    last_enrichment_at: string | null;
  };
}

/**
 * Summarize hourly observed players by region and platform for an optional queue.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PresenceHourlyStats {
  window_hours: number;
  observed_at: string;
  selected_queue_id: number | null;
  public_players: number;
  public_by_region: Array<{ region: string; players: number }>;
  public_by_platform: Array<{ platform: string; players: number }>;
  hourly_by_region: Array<{
    date: string;
    hour: number;
    total: number;
    regions: Record<string, number>;
  }>;
  hourly_by_platform: Array<{
    date: string;
    hour: number;
    total: number;
    platforms: Record<string, number>;
  }>;
}

/**
 * Fetch presence stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/presence?view=activity-v4'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<PresenceStats>`.
 */
export async function fetchPresenceStats(): Promise<PresenceStats> {
  // Version the activity view so a deployment cannot briefly receive the
  // previous cached response shape from the shared stats route cache.
  return fetchJson<PresenceStats>('/stats/presence?view=activity-v4', { timeoutMs: 35_000, retries: 0 });
}

/**
 * Fetch presence hourly stats data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/presence/hourly?${query}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `queueId?: number -> Promise<PresenceHourlyStats>`.
 */
export async function fetchPresenceHourlyStats(queueId?: number): Promise<PresenceHourlyStats> {
  const query = new URLSearchParams({ view: 'activity-v3' });
  if (queueId != null) query.set('queue_id', String(queueId));
  return fetchJson<PresenceHourlyStats>(`/stats/presence/hourly?${query}`, { timeoutMs: 35_000, retries: 0 });
}

/**
 * Page match identifiers supporting observed player presence.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PresenceMatchIdsResponse {
  window_hours: number;
  observed_at: string;
  total_matches: number;
  selected_queue_id: number | null;
  queues: Array<{
    queue_id: number;
    queue_name: string;
    matches: number;
  }>;
  match_ids: Array<{
    match_id: string;
    queue_id: number;
  }>;
  page: {
    current: number;
    size: number;
    total_pages: number;
  };
}

/**
 * Fetch presence match ids data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/presence/match-ids?${params.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `options: { queueId?: number; page?: number; perPage?: number; } -> Promise<PresenceMatchIdsResponse>`.
 */
export async function fetchPresenceMatchIds(options: {
  queueId?: number;
  page?: number;
  perPage?: number;
} = {}): Promise<PresenceMatchIdsResponse> {
  const params = new URLSearchParams({
    view: 'facts-v2',
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 250),
  });
  if (options.queueId != null) params.set('queue_id', String(options.queueId));
  return fetchJson<PresenceMatchIdsResponse>(`/stats/presence/match-ids?${params.toString()}`);
}

/**
 * Select presence-player ordering by matches or name.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type PresencePlayerSort = 'matches' | 'alphabetical';

/**
 * Page observed players with participation coverage and unresolved-player bounds.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PresencePlayersResponse {
  window_hours: number;
  observed_at: string;
  total_players: number;
  unresolved_player_slots_lower: number;
  unresolved_player_slots_upper: number;
  unresolved_matches: number;
  public_players_lower_bound: number;
  public_players_upper_bound: number;
  total_matches?: number;
  represented_matches?: number;
  unrepresented_matches?: number;
  total_participations?: number;
  selected_queue_id: number | null;
  players: Array<{
    player_id: string;
    player_name: string;
    matches_played: number;
  }>;
  sort: PresencePlayerSort;
  page: {
    current: number;
    size: number;
    total_pages: number;
  };
}

/**
 * Fetch presence players data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/presence/players?${params.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `options: { queueId?: number; page?: number; perPage?: number; sort?: PresencePlayerSort; } -> Promise<PresencePlayersResponse>`.
 */
export async function fetchPresencePlayers(options: {
  queueId?: number;
  page?: number;
  perPage?: number;
  sort?: PresencePlayerSort;
} = {}): Promise<PresencePlayersResponse> {
  const params = new URLSearchParams({
    view: 'facts-v3',
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 250),
    sort: options.sort ?? 'matches',
  });
  if (options.queueId != null) params.set('queue_id', String(options.queueId));
  return fetchJson<PresencePlayersResponse>(`/stats/presence/players?${params.toString()}`);
}

/**
 * Describe an observed participant identity, platform, kind, and evidence source.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PresenceDetailPlayer {
  player_id: string;
  player_name: string;
  platform: string;
  participant_kind: string;
  source: string;
}

/**
 * Describe one presence-supporting match with lifecycle quality and observed participants.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PresenceDetailMatch {
  match_id: string;
  queue_id: number;
  queue_name: string;
  stats_scope: PublicStatsScope;
  entry_datetime: string;
  region: string;
  map: string;
  status: string;
  quality: string;
  terminal_reason: string | null;
  players: PresenceDetailPlayer[];
}

/**
 * Page presence-supporting match details using an optional next cursor.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface PresenceDetailsResponse {
  window_hours: number;
  observed_at: string;
  total_matches: number;
  selected_queue_id: number | null;
  queues: Array<{
    queue_id: number;
    queue_name: string;
    stats_scope: PublicStatsScope;
    matches: number;
  }>;
  matches: PresenceDetailMatch[];
  next_cursor: string | null;
}

/**
 * Fetch presence details data for client consumers.
 *
 * refs: none
 * Request `GET '/stats/presence/details?${params.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `options: { queueId?: number; cursor?: string; limit?: number; } -> Promise<PresenceDetailsResponse>`.
 */
export async function fetchPresenceDetails(options: {
  queueId?: number;
  cursor?: string;
  limit?: number;
} = {}): Promise<PresenceDetailsResponse> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 25) });
  if (options.queueId != null) params.set('queue_id', String(options.queueId));
  if (options.cursor) params.set('cursor', options.cursor);
  return fetchJson<PresenceDetailsResponse>(`/stats/presence/details?${params.toString()}`);
}

/**
 * Summarize dropped-match lifecycle counts and failure categories for one hour.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface DroppedMatchHourlySummary {
  hour: number;
  tracked: number;
  open: number;
  pending: number;
  staged: number;
  resolved: number;
  dropped: number;
  broken_recovery_pending: number;
  no_authoritative_payload: number;
  no_history_anchor: number;
  partial_history_anchor: number;
  local_ingest_failed: number;
  invalid_payload: number;
  next_retry_at: string | null;
}

/**
 * Group hourly dropped-match summaries for a requested date and queue.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface DroppedMatchSummaryResponse {
  date: string;
  queue_id: number;
  refreshed: number;
  summary: DroppedMatchHourlySummary[];
}

/**
 * Fetch dropped match summary data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/dropped/summary?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params: { date: string; queueId?: number; refresh?: boolean } -> Promise<DroppedMatchSummaryResponse>`.
 */
export async function fetchDroppedMatchSummary(params: { date: string; queueId?: number; refresh?: boolean }): Promise<DroppedMatchSummaryResponse> {
  const query = new URLSearchParams({
    date: params.date,
    queueId: String(params.queueId ?? 486),
  });
  if (params.refresh === false) query.set('refresh', 'false');
  return fetchJson<DroppedMatchSummaryResponse>(`/matches/dropped/summary?${query.toString()}`);
}

/**
 * Describe a dropped match lifecycle status, category, retry count, and observations.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface DroppedMatchRecord {
  match_id: string;
  date: string;
  hour: number;
  queue_id: number;
  status: string;
  drop_category: string;
  reason: string | null;
  attempts: number;
  observed_players: number;
  updated_at: string | null;
}

/**
 * Combine filtered dropped-match records and hourly summaries.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface DroppedMatchListResponse {
  date: string;
  queue_id: number;
  status: string;
  category: string | null;
  hour: number | null;
  refreshed: number;
  count: number;
  summary: DroppedMatchHourlySummary[];
  matches: DroppedMatchRecord[];
}

/**
 * Fetch dropped matches data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/dropped?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params: { date: string; queueId?: number; status?: 'dropped' | 'open' | 'all' | 'pending' | 'staged' | 'complete' | 'resolved' | 'unrecoverable'; hour?: number; limit?: number; refresh?: boolean; } -> Promise<DroppedMatchListResponse>`.
 */
export async function fetchDroppedMatches(params: {
  date: string;
  queueId?: number;
  status?: 'dropped' | 'open' | 'all' | 'pending' | 'staged' | 'complete' | 'resolved' | 'unrecoverable';
  hour?: number;
  limit?: number;
  refresh?: boolean;
}): Promise<DroppedMatchListResponse> {
  const query = new URLSearchParams({
    date: params.date,
    queueId: String(params.queueId ?? 486),
    status: params.status ?? 'dropped',
    limit: String(params.limit ?? 500),
  });
  if (params.hour !== undefined) query.set('hour', String(params.hour));
  if (params.refresh === false) query.set('refresh', 'false');
  return fetchJson<DroppedMatchListResponse>(`/matches/dropped?${query.toString()}`);
}

/**
 * Describe a nonranked dropped-match terminal outcome and recovery coverage.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface NonrankedDroppedMatchRecord {
  match_id: string;
  date: string;
  hour: number;
  queue_id: number;
  queue_name: string;
  stats_scope: PublicStatsScope;
  region: string;
  quality: string;
  direct_player_count: number;
  roster_player_count: number;
  detail_attempts: number;
  roster_attempts: number;
  terminal_reason: string;
  completed_at: string;
}

/**
 * Group filtered nonranked dropped matches with hourly scope summaries.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface NonrankedDroppedMatchResponse {
  date: string | null;
  scope: PublicStatsScope | null;
  hour: number | null;
  count: number;
  summary: Array<{
    date: string;
    hour: number;
    stats_scope: PublicStatsScope;
    queue_id: number;
    queue_name: string;
    dropped: number;
  }>;
  matches: NonrankedDroppedMatchRecord[];
}

/**
 * Fetch nonranked dropped matches data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/dropped/nonranked?${query.toString()}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { date?: string; scope?: PublicStatsScope; hour?: number; limit?: number; offset?: number; } -> Promise<NonrankedDroppedMatchResponse>`.
 */
export async function fetchNonrankedDroppedMatches(params?: {
  date?: string;
  scope?: PublicStatsScope;
  hour?: number;
  limit?: number;
  offset?: number;
}): Promise<NonrankedDroppedMatchResponse> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.scope) query.set('scope', params.scope);
  if (params?.hour != null) query.set('hour', String(params.hour));
  query.set('limit', String(params?.limit ?? 500));
  if (params?.offset != null) query.set('offset', String(params.offset));
  return fetchJson<NonrankedDroppedMatchResponse>(`/matches/dropped/nonranked?${query.toString()}`);
}

/**
 * Fetch match detail data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/${matchId}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `matchId: number -> Promise<MatchDetailWithBans | null>`.
 */
export async function fetchMatchDetail(matchId: number): Promise<MatchDetailWithBans | null> {
  const raw = await fetchJson<{
    matches: MatchDetailWithBans[];
    count: number;
    notFound?: number[];
    storageStatus?: MatchStorageStatus;
    storage_status?: MatchStorageStatus;
    dataStatus?: MatchDataStatus;
    dataHash?: string;
    access?: MatchDetailAccess;
  }>(
    `/matches/${matchId}`,
    { timeoutMs: 130_000, retries: 0 },
  );
  if (raw.matches.length === 0) return null;
  const detail = raw.matches[0];
  return deriveMissingMatchCreditRates({
    ...detail,
    storageStatus: detail.storageStatus ?? raw.storageStatus ?? raw.storage_status,
    dataStatus: detail.dataStatus ?? raw.dataStatus,
    dataHash: detail.dataHash ?? raw.dataHash,
    access: detail.access ?? raw.access,
  });
}

/**
 * Request `GET '/matches/fact/${matchId}'` through the shared API transport. Return `null` on a caught request failure.
 * @deprecated Complete match reads include facts; retained for non-page callers. · refs: none
 * I/O types: `matchId: number -> Promise<MatchFact | null>`.
 */
export async function fetchMatchFact(matchId: number): Promise<MatchFact | null> {
  try {
    return await fetchJson<MatchFact>(`/matches/fact/${matchId}`);
  } catch {
    return null;
  }
}

/**
 * Request `GET '/ratings/snapshots/${matchId}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * @deprecated Complete match reads include rating snapshots; retained for non-page callers. · refs: none
 * I/O types: `matchId: number -> Promise<RatingSnapshot[]>`.
 */
export async function fetchMatchSnapshots(matchId: number): Promise<RatingSnapshot[]> {
  const raw = await fetchJson<Array<{
    player_id: number | string;
    player_name: string | null;
    match_id: number | string;
    queue_id?: number | string | null;
    mu_before?: number | string | null;
    phi_before?: number | string | null;
    mu_after?: number | string | null;
    phi_after?: number | string | null;
    mu_change?: number | string | null;
    queue_mu_pre?: number | string | null;
    queue_mu_post?: number | string | null;
    queue_phi_pre?: number | string | null;
    queue_phi_post?: number | string | null;
  }>>(`/ratings/snapshots/${matchId}`);

  return raw.map((r) => {
    // The current backend returns the persisted match_rating_snapshots column
    // names (`queue_mu_pre`, `queue_mu_post`, `queue_phi_pre`, `queue_phi_post`).
    // Older frontend code expected the display names below. Normalize here so
    // the match page remains a pure renderer and so future DB column additions
    // do not make rating rows silently display as blank.
    const muBefore = numberOrNull(r.mu_before) ?? numberOrNull(r.queue_mu_pre);
    const muAfter = numberOrNull(r.mu_after) ?? numberOrNull(r.queue_mu_post);
    const explicitChange = numberOrNull(r.mu_change);
    const muChange = explicitChange ?? (
      muBefore != null && muAfter != null
        ? Math.round((muAfter - muBefore) * 100) / 100
        : null
    );

    return {
      player_id: numberOrNull(r.player_id) ?? 0,
      player_name: r.player_name ?? 'Unknown',
      match_id: numberOrNull(r.match_id) ?? matchId,
      queue_id: numberOrNull(r.queue_id) ?? 0,
      mu_before: muBefore,
      phi_before: numberOrNull(r.phi_before) ?? numberOrNull(r.queue_phi_pre),
      mu_after: muAfter,
      phi_after: numberOrNull(r.phi_after) ?? numberOrNull(r.queue_phi_post),
      mu_change: muChange,
    };
  });
}

/**
 * Fetch recent matches data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/recent${limit ? '?limit=${limit}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `limit?: number -> Promise<MatchData[]>`.
 */
export async function fetchRecentMatches(limit?: number): Promise<MatchData[]> {
  const raw = await fetchJson<MatchData[]>(`/matches/recent${limit ? `?limit=${limit}` : ''}`);
  return raw;
}

/**
 * Combine hourly match activity, recent matches, and dropped-match counts/IDs.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface MatchesOverview {
  hourly: MatchHourlyStats | null;
  recent: MatchData[];
  droppedByHour: Record<string, number>;
  droppedIdsByHour: Record<string, string[]>;
}

const matchesOverviewCache = new Map<string, { value: MatchesOverview; expiresAt: number }>();
const matchesOverviewInFlight = new Map<string, Promise<MatchesOverview>>();

/**
 * Fetch matches overview data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/overview${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { tierMin?: number; tierMax?: number; view?: 'activity-v2' | 'activity-v3'; } -> Promise<MatchesOverview>`.
 */
export async function fetchMatchesOverview(params?: {
  tierMin?: number;
  tierMax?: number;
  view?: 'activity-v2' | 'activity-v3';
}): Promise<MatchesOverview> {
  const query = new URLSearchParams();
  if (params?.tierMin != null) query.set('tierMin', String(params.tierMin));
  if (params?.tierMax != null) query.set('tierMax', String(params.tierMax));
  if (params?.view) query.set('view', params.view);
  const cacheKey = query.toString() || 'all';
  const cached = matchesOverviewCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const activeRequest = matchesOverviewInFlight.get(cacheKey);
  if (activeRequest) return activeRequest;
  const request = fetchJson<any>(`/matches/overview${query.toString() ? `?${query.toString()}` : ''}`, { unwrapData: false, timeoutMs: 35_000, retries: 0 }).then((raw) => {
    const value: MatchesOverview = {
      hourly: raw.hourly ?? null,
      recent: Array.isArray(raw.recent) ? raw.recent : [],
      droppedByHour: raw.dropped_by_hour ?? {},
      droppedIdsByHour: raw.dropped_ids_by_hour ?? {},
    };
    matchesOverviewCache.set(cacheKey, { value, expiresAt: Date.now() + 60_000 });
    return value;
  });
  matchesOverviewInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    matchesOverviewInFlight.delete(cacheKey);
  }
}

/**
 * Fetch match search data for client consumers.
 *
 * refs: none
 * Request `GET '/matches/search${query.toString() ? '?${query.toString()}' : ''}'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `params?: { championId?: string; queueId?: string; region?: string; date?: string; hour?: string; timeZone?: string; from?: string; to?: string; page?: string; perPage?: string; } -> Promise<{ data: MatchSearchResult[]; total: number; page: { current: number; size: number; totalPages: number } }>`.
 */
export async function fetchMatchSearch(params?: {
  championId?: string;
  queueId?: string;
  region?: string;
  date?: string;
  hour?: string;
  timeZone?: string;
  from?: string;
  to?: string;
  page?: string;
  perPage?: string;
}): Promise<{ data: MatchSearchResult[]; total: number; page: { current: number; size: number; totalPages: number } }> {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }
  }
  const raw = await fetchJson<{ data: MatchSearchResult[]; total: number; page: { current: number; size: number; totalPages: number } }>(
    `/matches/search${query.toString() ? `?${query.toString()}` : ''}`,
    { unwrapData: false }
  );
  return {
    ...raw,
    data: raw.data.map((match) => ({
      ...match,
      match_id: numberOrNull(match.match_id) ?? 0,
      queue_id: numberOrNull(match.queue_id) ?? 0,
      duration_seconds: numberOrNull(match.duration_seconds) ?? 0,
      champion_id: numberOrNull(match.champion_id) ?? 0,
      kills: numberOrNull(match.kills) ?? 0,
      deaths: numberOrNull(match.deaths) ?? 0,
      assists: numberOrNull(match.assists) ?? 0,
      player_count: numberOrNull(match.player_count) ?? 0,
    })),
  };
}

// ── Reference Data ──

/**
 * Fetch reference items data for client consumers.
 *
 * refs: none
 * Request `GET '/reference/items'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Array<{ item_id: number; name: string; description?: string }>>`.
 */
export async function fetchReferenceItems(): Promise<Array<{ item_id: number; name: string; description?: string }>> {
  const raw = await fetchJson<any[]>(`/reference/items`);
  return raw;
}

/**
 * Fetch reference talents data for client consumers.
 *
 * refs: none
 * Request `GET '/reference/talents'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Array<{ talent_id: number; name: string; champion_id: number }>>`.
 */
export async function fetchReferenceTalents(): Promise<Array<{ talent_id: number; name: string; champion_id: number }>> {
  const raw = await fetchJson<any[]>(`/reference/talents`);
  return raw;
}

/**
 * Fetch reference cards data for client consumers.
 *
 * refs: none
 * Request `GET '/reference/cards'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Array<{ card_id: number; name: string }>>`.
 */
export async function fetchReferenceCards(): Promise<Array<{ card_id: number; name: string }>> {
  const raw = await fetchJson<any[]>(`/reference/cards`);
  return raw;
}

/**
 * Fetch reference queues data for client consumers.
 *
 * refs: none
 * Request `GET '/reference/queues'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Array<{ queue_id: number; name: string }>>`.
 */
export async function fetchReferenceQueues(): Promise<Array<{ queue_id: number; name: string }>> {
  const raw = await fetchJson<any[]>(`/reference/queues`);
  return raw;
}

/**
 * Fetch reference regions data for client consumers.
 *
 * refs: none
 * Request `GET '/reference/regions'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Array<{ region?: string; region_code?: string; name?: string; region_name?: string }>>`.
 */
export async function fetchReferenceRegions(): Promise<Array<{ region?: string; region_code?: string; name?: string; region_name?: string }>> {
  const raw = await fetchJson<any[]>(`/reference/regions`);
  return raw;
}

/**
 * Fetch reference maps data for client consumers.
 *
 * refs: none
 * Request `GET '/reference/maps'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Array<{ map_id: number; name: string }>>`.
 */
export async function fetchReferenceMaps(): Promise<Array<{ map_id: number; name: string }>> {
  const raw = await fetchJson<any[]>(`/reference/maps`);
  return raw;
}

/**
 * Fetch reference champions data for client consumers.
 *
 * refs: none
 * Request `GET '/reference/champions'` through the shared API transport. Uncaught network/API errors reject the returned promise.
 * I/O types: `none -> Promise<Array<{ id: number; name: string }>>`.
 */
export async function fetchReferenceChampions(): Promise<Array<{ id: number; name: string }>> {
  const raw = await fetchJson<any[]>(`/reference/champions`);
  return raw;
}


