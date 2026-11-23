/**
 * Manage interactive state for the matches id match-detail-client client view.
 * Coordinate local events and consume the declared component inputs.
 * refs: none
 */
"use client";

/**
 * Match Detail Page — /matches/[id]
 *
 * Data orchestration layer only. All rendering delegated to components in
 * `components/match-result/`. The Rust match endpoint returns one complete
 * payload (match, players, bans, loadouts, and rating snapshots), which this
 * page wires together without request-time fanout.
 *
 * Data sources:
 *   GET /matches/{id}            → complete match payload + storage status
 *   The match response embeds the stored canonical profile, with an ingest
 *   snapshot fallback when no canonical player row exists.
 *
 * refs: endpoints: GET /matches/{id} · doc: documents/06-reference/routes/frontend-match-detail.md
 */
"use client";

import { formatApiErrorMessage } from "@/lib/api-errors";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchMatchDetail,
  fetchArchivedMatchDetail,
  type MatchDetailWithBans,
  type MatchFact,
  type MatchFactPlayer,
  type MatchPlayerDetail,
  type RatingSnapshot,
} from "@/lib/api-client";
import {
  MatchResultPlayer,
  type PlayerProfileData,
} from "@/components/match-result/types";
import MatchupSection from "@/components/match-result/matchup-section";
import MatchStatsSection from "@/components/match-result/match-stats-section";
import ItemsLoadoutsSection from "@/components/match-result/items-loadouts-section";
import RatingSnapshots from "@/components/match-result/rating-snapshots";
import BrowserScoreboard from "@/components/match-result/browser-scoreboard";
import { ErrorState } from "@/components/async-state";
import { RouteSkeleton } from "@/components/route-skeleton";
import { readBrowserResult, removeBrowserResult, writeBrowserResult } from "@/lib/browser-result-cache";
import { getQueueLabel } from "@/lib/queue-labels";
import { useLocalization } from "@/lib/localization-context";
import ContextBackLink from "@/components/context-back-link";
import { useAuth } from "@/lib/auth-context";
import { matchDetailSections } from "@/lib/match-access";

import {
  fetchPlayerModerationBatch,
  fetchPrivateAccountModerationBatch,
} from "@/lib/player-moderation";

const MATCH_RESULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MATCH_UI_CACHE_TTL_MS = 30 * 60 * 1000;

type CachedMatchResult = {
  match: MatchDetailWithBans | null;
/** Legacy cache fields are accepted while old tabs/session entries expire. · refs: none */
  fact?: MatchFact | null;
  snapshots?: RatingSnapshot[];
};

function embeddedFact(detail: MatchDetailWithBans | null, legacy?: MatchFact | null): MatchFact | null {
  if (legacy) return legacy;
  if (!detail) return null;
  if (detail.fact) return detail.fact;
  if (detail.loadouts && !Array.isArray(detail.loadouts)) return detail.loadouts;
  if (Array.isArray(detail.loadouts)) {
    return { match_id: detail.match.match_id, players: detail.loadouts };
  }
  return Array.isArray(detail.facts)
    ? { match_id: detail.match.match_id, players: detail.facts }
    : null;
}

function embeddedSnapshots(detail: MatchDetailWithBans | null, legacy?: RatingSnapshot[]): RatingSnapshot[] {
  if (legacy) return legacy;
  return detail?.snapshots ?? detail?.rating_snapshots ?? detail?.ratingSnapshots ?? [];
}

async function withCurrentStoredModeration(detail: MatchDetailWithBans): Promise<MatchDetailWithBans> {
  const [publicModeration, privateModeration] = await Promise.all([
    fetchPlayerModerationBatch(detail.players.map((player) => player.player_id)),
    fetchPrivateAccountModerationBatch(detail.players
      .filter((player) => Number(player.player_id) === 0)
      .map((player) => player.private_player_id ?? 0)),
  ]);
  return {
    ...detail,
    players: detail.players.map((player) => {
      const playerId = Number(player.player_id);
      const current = playerId > 0
        ? publicModeration.get(playerId)
        : privateModeration.get(Number(player.private_player_id));
      if (!current || !player.profile_snapshot) return player;
      return {
        ...player,
        profile_snapshot: {
          ...player.profile_snapshot,
          cheater: current.cheater,
          exploiter: current.exploiter,
          sus_count: current.susCount,
        },
      };
    }),
  };
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function storedProfileForMatch(player: MatchPlayerDetail): PlayerProfileData | null {
  const playerId = Number(player.player_id);
  const privateId = Number(player.private_player_id ?? 0);
  if (playerId <= 0 && privateId <= 0) return null;
  const snapshot = player.profile_snapshot;
  if (!snapshot) return null;

  const globalWins = finiteNumber(snapshot.global_wins);
  const globalLosses = finiteNumber(snapshot.global_losses);
  const globalMatches = globalWins != null && globalLosses != null
    ? globalWins + globalLosses
    : 0;
  const championWins = finiteNumber(snapshot.champion_wins);
  const championLosses = finiteNumber(snapshot.champion_losses);
  const championMatches = championWins != null && championLosses != null
    ? championWins + championLosses
    : null;

  return {
    id: playerId > 0 ? String(playerId) : `private:${privateId}`,
    name: playerId > 0
      ? player.player_name
      : player.private_account_display_name || player.private_account_alias || `P-${String(privateId).padStart(6, "0")}`,
    level: finiteNumber(snapshot.level),
    platform: snapshot.platform ?? player.platform ?? "",
    region: snapshot.region ?? player.region ?? "",
    kbmTier: finiteNumber(snapshot.kbm_tier),
    kbmPoints: finiteNumber(snapshot.kbm_points),
    kbmRank: finiteNumber(snapshot.kbm_rank),
    queueElo: finiteNumber(snapshot.queue_elo),
    championElo: finiteNumber(snapshot.champion_elo),
    globalWins,
    globalLosses,
    globalWinRate: globalMatches > 0 && globalWins != null
      ? (globalWins / globalMatches) * 100
      : null,
    rankedWins: finiteNumber(snapshot.kbm_wins),
    rankedLosses: finiteNumber(snapshot.kbm_losses),
    capturedAt: snapshot.captured_at,
    snapshotSource: snapshot.source,
    cheater: snapshot.cheater === true,
    exploiter: snapshot.exploiter === true,
    susCount: finiteNumber(snapshot.sus_count) ?? 0,
    verified: snapshot.verified === true,
    totalMatches: globalMatches,
    totalWins: globalWins ?? 0,
    winRate: globalMatches > 0 && globalWins != null
      ? (globalWins / globalMatches) * 100
      : null,
    totalPlays: globalMatches,
    topChampions: championMatches != null ? [{
      championName: player.champion_name,
      championId: player.champion_id,
      wins: championWins ?? 0,
      totalPlays: championMatches,
      winRate: championMatches > 0 && championWins != null
        ? (championWins / championMatches) * 100
        : 0,
    }] : [],
  };
}

/* ── Page component ── */

/**
 * Render /matches/[id]/match-detail-client.tsx using `RouteSkeleton`, `ErrorState`, `LocalizedText`, `BrowserScoreboard`.
 * Render the MatchDetailPage view for matches id match-detail-client.
 * refs: none
 * I/O types: `{ initialMatch = null }: { initialMatch?: MatchDetailWithBans | null } -> JSX.Element | null`.
 */
export default function MatchDetailPage({ initialMatch = null }: { initialMatch?: MatchDetailWithBans | null }) {
  const { t } = useLocalization();
  const { user, isLoading: authLoading } = useAuth();
  const params = useParams();
  const matchId = String(params.id || "");

  const [match, setMatch] = useState<MatchDetailWithBans | null>(initialMatch);
  const [fact, setFact] = useState<MatchFact | null>(() => embeddedFact(initialMatch));
  const [snapshots, setSnapshots] = useState<RatingSnapshot[]>(() => embeddedSnapshots(initialMatch));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [olderMatch, setOlderMatch] = useState(false);
  const archiveRequest = useRef<AbortController | null>(null);
  const accessScope = user?.linkedPlayerId != null ? "verified" : user ? "account" : "guest";

  async function loadOlderMatch() {
    archiveRequest.current?.abort();
    const controller = new AbortController();
    archiveRequest.current = controller;
    setOlderMatch(true);
    setLoading(true);
    setError(null);
    setMatch(null);
    try {
      const detail = await fetchArchivedMatchDetail(Number(matchId), controller.signal);
      if (controller.signal.aborted) return;
      if (!detail) { setError(t("history.noOlderMatches")); return; }
      const currentMatch = await withCurrentStoredModeration(detail).catch(() => detail);
      if (controller.signal.aborted) return;
      setMatch(currentMatch);
      setFact(embeddedFact(detail));
      setSnapshots(embeddedSnapshots(detail));
    } catch (cause) {
      if (!controller.signal.aborted) setError(formatApiErrorMessage(cause, t, t("generated.matches.matchDetailsUnavailable")));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    archiveRequest.current?.abort();
    setOlderMatch(false);

    const numericMatchId = parseInt(matchId, 10);
    async function load() {
      if (authLoading) return;
      // Direct navigations receive the complete public payload in the RSC
      // response. Do not immediately issue the same browser request again.
      if (reloadKey === 0 && initialMatch?.access?.tier === accessScope) {
        // Resolve current moderation before the scoreboard's first paint/export.
        const currentMatch = await withCurrentStoredModeration(initialMatch).catch(() => initialMatch);
        if (cancelled) return;
        setMatch(currentMatch);
        setFact(embeddedFact(initialMatch));
        setSnapshots(embeddedSnapshots(initialMatch));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      // v11 invalidates cached rows from the pre-complete-payload fanout path.
      const cacheKey = `paladinscat:match-result:v13-recent:${accessScope}:${numericMatchId}`;
      try {
        const cached = reloadKey === 0 ? readBrowserResult<CachedMatchResult>(cacheKey) : null;
        if (cached) {
          if (cancelled) return;
          const currentMatch = cached.match
            ? await withCurrentStoredModeration(cached.match).catch(() => cached.match)
            : null;
          if (cancelled) return;
          setMatch(currentMatch);
          setFact(embeddedFact(cached.match, cached.fact));
          setSnapshots(embeddedSnapshots(cached.match, cached.snapshots));
          return;
        }

        // One Rust request supplies the complete render payload. Do not add
        // request-time /matches/fact or /ratings/snapshots fanout here.
        const detailResult = await fetchMatchDetail(numericMatchId);
        if (cancelled) return;
        if (!detailResult) {
          setError(t("generated.matches.matchDetailsUnavailable"));
          return;
        }
        const currentMatch = await withCurrentStoredModeration(detailResult).catch(() => detailResult);
        if (cancelled) return;
        setMatch(currentMatch);
        const factResult = embeddedFact(detailResult);
        const snapResult = embeddedSnapshots(detailResult);
        setFact(factResult);
        setSnapshots(snapResult);

        writeBrowserResult(cacheKey, {
          match: currentMatch,
          fact: factResult,
          snapshots: snapResult,
        }, MATCH_RESULT_CACHE_TTL_MS);

      } catch (err: unknown) {
        if (!cancelled) setError(formatApiErrorMessage(err, t, t("generated.app.matches.[id].page.failedtoloadmatch")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; archiveRequest.current?.abort(); };
  }, [accessScope, authLoading, initialMatch, matchId, reloadKey, t]);

  useEffect(() => {
    if (loading || !match) return;
    const cacheKey = `paladinscat:match-scroll:v1:${matchId}`;
    const navigationLockKey = `${cacheKey}:navigating`;
    const cached = readBrowserResult<{ scrollY: number }>(cacheKey);
    removeBrowserResult(navigationLockKey);
    let frame = 0;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    if (cached && Number.isFinite(cached.scrollY)) {
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        window.scrollTo({ top: cached.scrollY, behavior: "auto" });
        // Expanded build rows restore in their own mount effect. Reapply once
        // their additional height has entered layout so the offset is exact.
        restoreTimer = setTimeout(() => window.scrollTo({ top: cached.scrollY, behavior: "auto" }), 150);
      });
    }

    const persistScroll = () => {
      if (readBrowserResult<boolean>(navigationLockKey)) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        writeBrowserResult(cacheKey, { scrollY: window.scrollY }, MATCH_UI_CACHE_TTL_MS);
      });
    };
    window.addEventListener("scroll", persistScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", persistScroll);
      if (frame) window.cancelAnimationFrame(frame);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, [loading, match, matchId]);

  /* ── Derived data ── */

  const queueLabel = match ? getQueueLabel(match.match.queue_id, match.match.queue_name) : "";

  // Keep task-force ordering stable throughout the header, matchup, metrics, and builds.
  // The winner flags provide the visual emphasis without swapping the score columns.
  const team1: MatchPlayerDetail[] = match
    ? match.players.filter((p) => p.task_force === 1)
    : [];
  const team2: MatchPlayerDetail[] = match
    ? match.players.filter((p) => p.task_force === 2)
    : [];

  const winnerTF = match?.match.winning_task_force ?? 0;
  const team1Wins = winnerTF === 1;
  const team2Wins = winnerTF === 2;

  // Fact map by player_id (string keys — API returns string IDs at runtime)
  const factMap = new Map<string, MatchFactPlayer>();
  if (fact) {
    for (const fp of fact.players) {
      factMap.set(String(fp.player_id), fp);
    }
  }

  // Enriched players for matchup cards
  const team1Players: MatchResultPlayer[] = team1.map((p) => ({
    matchData: p,
    factData: factMap.get(String(p.player_id)),
    profileData: storedProfileForMatch(p),
  }));
  const team2Players: MatchResultPlayer[] = team2.map((p) => ({
    matchData: p,
    factData: factMap.get(String(p.player_id)),
    profileData: storedProfileForMatch(p),
  }));

  /* ── Skeleton ── */
  if (loading) {
    return <RouteSkeleton variant="match" />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorState title={t("generated.matches.matchDetailsUnavailable")} message={error} onRetry={() => olderMatch ? void loadOlderMatch() : setReloadKey((key) => key + 1)} />
        <button type="button" className="pc-btn-secondary" onClick={() => void loadOlderMatch()}>{t("history.loadOlderMatch")}</button>
        <ContextBackLink
          fallbackHref="/matches"
          label={t("generated.matches.backToMatches")}
          className="mt-4 text-pc-accent hover:underline"
        />
      </div>
    );
  }

  if (!match) return null;

  const accessTier = match.access?.tier ?? accessScope;
  const { loadouts: showLoadouts, fullDetails: showFullDetails } = matchDetailSections(accessTier);

  return (
    <div className="max-w-7xl mx-auto py-8 space-y-6">
      <BrowserScoreboard
        match={match.match}
        queueLabel={queueLabel}
        team1={team1Players}
        team2={team2Players}
        bans={match.bans}
      />

      {/* Loadouts — talent, cards, and purchased items */}
      {showLoadouts && <ItemsLoadoutsSection
        team1Players={team1}
        team2Players={team2}
        team1Wins={team1Wins}
        team2Wins={team2Wins}
        factMap={factMap}
      />}

      {/* Match Stats — in-match performance */}
      {showFullDetails && <MatchStatsSection
        team1Players={team1}
        team2Players={team2}
        team1Wins={team1Wins}
        team2Wins={team2Wins}
        team1Label={t("generated.matches.[id].page.team1")}
        team2Label={t("generated.matches.[id].page.team2")}
        factMap={factMap}
      />}

      {/* Player Matchup — pre-match view */}
      {showFullDetails && <MatchupSection
        team1={team1Players}
        team2={team2Players}
        team1Wins={team1Wins}
        team2Wins={team2Wins}
        team1Label={t("generated.matches.team1")}
        team2Label={t("generated.matches.team2")}
      />}

      {/* Rating Snapshots */}
      {showFullDetails && snapshots.length > 0 && <RatingSnapshots snapshots={snapshots} />}

      {match.access?.remaining != null && (
        <p className="text-center text-sm text-pc-text-secondary" role="status">
          {t("matches.freeLookupsRemaining", { count: match.access.remaining })}
        </p>
      )}

    </div>
  );
}
