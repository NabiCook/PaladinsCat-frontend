/**
 * Render player activity details with `LoadingPanel`.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingPanel } from "@/components/async-state";
import { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import {
  fetchPresenceMatchIds,
  fetchPresencePlayers,
  type PresenceMatchIdsResponse,
  type PresencePlayerSort,
  type PresencePlayersResponse,
} from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import { useRouteSettledLoading } from "@/lib/route-transition-context";

const METHODOLOGY_URL =
  "https://github.com/NabiCook/PaladinsCat/blob/main/docs/blog/public-release/how-paladinscat-counts-active-players.md";

type EvidenceTab = "matches" | "players";

/**
 * Render player activity details with `LoadingPanel`.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function PlayerActivityDetails() {
  const { t, formatNumber } = useLocalization();
  const [activeTab, setActiveTab] = useState<EvidenceTab>("matches");
  const [selectedQueue, setSelectedQueue] = useState<"all" | number>("all");
  const [page, setPage] = usePersistentDirectoryPage("activityPage");
  const [playerSort, setPlayerSort] = useState<PresencePlayerSort>("matches");
  const [matchResponse, setMatchResponse] = useState<PresenceMatchIdsResponse | null>(null);
  const [playerResponse, setPlayerResponse] = useState<PresencePlayersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const displayLoading = useRouteSettledLoading(loading);

  useEffect(() => {
    let active = true;
    const queueId = selectedQueue === "all" ? undefined : selectedQueue;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === "matches") {
          const next = await fetchPresenceMatchIds({ queueId, page });
          if (!active) return;
          if (next.page.total_pages > 0 && page > next.page.total_pages) {
            setPage(next.page.total_pages);
            return;
          }
          setMatchResponse(next);
        } else {
          const next = await fetchPresencePlayers({ queueId, page, sort: playerSort });
          if (!active) return;
          if (next.page.total_pages > 0 && page > next.page.total_pages) {
            setPage(next.page.total_pages);
            return;
          }
          setPlayerResponse(next);
        }
      } catch (cause) {
        if (active) setError(formatApiErrorMessage(cause, t, t("playerActivity.detailsLoadError")));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [activeTab, page, playerSort, selectedQueue, t]);

  const queues = matchResponse?.queues ?? [];
  const matchIds = matchResponse?.match_ids ?? [];
  const players = playerResponse?.players ?? [];
  const total = activeTab === "matches"
    ? matchResponse?.total_matches
    : playerResponse?.total_players;
  const pageInfo = activeTab === "matches"
    ? matchResponse?.page
    : playerResponse?.page;
  const totalPages = pageInfo?.total_pages ?? 0;
  const unresolvedUpper = Number(playerResponse?.unresolved_player_slots_upper ?? 0);
  const playerLowerBound = Number(
    playerResponse?.public_players_lower_bound ?? playerResponse?.total_players ?? 0,
  );
  const playerUpperBound = Number(
    playerResponse?.public_players_upper_bound ?? playerLowerBound + unresolvedUpper,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="pc-heading pc-heading-lg text-pc-accent">
            {t("playerActivity.detailsTitle")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-pc-text-secondary">
            {t("playerActivity.detailsDescription")}
          </p>
        </div>
        <a
          href={METHODOLOGY_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-pc-accent transition-colors hover:text-pc-accent-light"
        >
          {t("playerActivity.readMethodology")}
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
      </header>

      <section className="pc-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="mr-auto">
            <div className="text-xs font-semibold uppercase tracking-wider text-pc-text-muted">
              {activeTab === "matches"
                ? t("playerActivity.trackedMatches24h")
                : t("playerActivity.trackedPlayers24h")}
            </div>
            <div className="mt-1 font-mono text-3xl font-bold text-pc-accent">
              {total == null ? "—" : formatNumber(total)}
            </div>
            {activeTab === "players"
              && playerResponse?.represented_matches != null
              && playerResponse.total_matches != null
              && playerResponse.total_participations != null && (
              <div className="mt-1 space-y-0.5 text-xs text-pc-text-muted">
                <div>
                  {t("playerActivity.matchEvidenceCoverage", {
                    represented: formatNumber(playerResponse.represented_matches),
                    total: formatNumber(playerResponse.total_matches),
                  })}
                </div>
                <div>
                  {t("playerActivity.playerParticipations", {
                    total: formatNumber(playerResponse.total_participations),
                  })}
                </div>
                <div className="text-rose-200">
                  {t("playerActivity.unresolvedPlayerRange")}: +0–
                  {formatNumber(unresolvedUpper)}
                  {" · "}
                  {t("playerActivity.possiblePlayerTotal")}:{" "}
                  {formatNumber(playerLowerBound)}
                  {"–"}
                  {formatNumber(playerUpperBound)}
                </div>
              </div>
            )}
          </div>
          <label className="flex w-full flex-col items-start gap-1 text-xs text-pc-text-secondary sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            {t("playerActivity.queue")}
            <select
              value={selectedQueue}
              onChange={event => {
                setSelectedQueue(event.target.value === "all" ? "all" : Number(event.target.value));
                setPage(1);
              }}
              className="pc-select min-h-11"
            >
              <option value="all">{t("playerActivity.allQueues")}</option>
              {queues.map(queue => (
                <option key={queue.queue_id} value={queue.queue_id}>
                  {queue.queue_name} ({formatNumber(queue.matches)})
                </option>
              ))}
            </select>
          </label>
          {activeTab === "players" && (
            <label className="flex w-full flex-col items-start gap-1 text-xs text-pc-text-secondary sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              {t("playerActivity.sort")}
              <select
                value={playerSort}
                onChange={event => {
                  setPlayerSort(event.target.value as PresencePlayerSort);
                  setPage(1);
                }}
                className="pc-select min-h-11"
              >
                <option value="matches">{t("playerActivity.sortMostMatches")}</option>
                <option value="alphabetical">{t("playerActivity.sortAlphabetical")}</option>
              </select>
            </label>
          )}
        </div>
      </section>

      <div
        role="tablist"
        aria-label={t("playerActivity.evidenceTabs")}
        className="flex border-b border-pc-border"
      >
        {(["matches", "players"] as const).map(tab => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => {
              setActiveTab(tab);
              setPage(1);
            }}
            className={`pc-touch-target border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "border-pc-accent text-pc-accent"
                : "border-transparent text-pc-text-muted hover:text-pc-text"
            }`}
          >
            {tab === "matches"
              ? t("playerActivity.matchesTab")
              : t("playerActivity.playersTab")}
          </button>
        ))}
      </div>

      {displayLoading ? (
        <LoadingPanel className="min-h-[24rem]" />
      ) : (
        <div className="space-y-5">
          {activeTab === "matches" ? (
            <ul className="pc-card flex flex-wrap gap-x-5 gap-y-2 font-mono text-sm">
              {matchIds.map(match => (
                <li key={`${match.match_id}:${match.queue_id}`}>
                  <Link
                    href={`/matches/${match.match_id}`}
                    className="text-pc-text-secondary transition-colors hover:text-pc-accent"
                  >
                    {match.match_id}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="pc-card flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {players.map(player => (
                <Link
                  key={player.player_id}
                  href={`/players/${player.player_id}`}
                  className="text-pc-text-secondary transition-colors hover:text-pc-accent"
                >
                  {player.player_name}
                  <span className="text-pc-text-muted">
                    {" · "}{formatNumber(player.matches_played)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {activeTab === "matches" && matchIds.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-pc-text-muted">
              {t("playerActivity.noMatches")}
            </p>
          )}
          {activeTab === "players" && players.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-pc-text-muted">
              {t("playerActivity.noPlayers")}
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {totalPages > 1 && (
            <nav
              aria-label={t("playerActivity.pagination")}
              className="flex flex-wrap items-center justify-center gap-2"
            >
              <button
                type="button"
                onClick={() => setPage(current => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="pc-btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("playerActivity.previousPage")}
              </button>
              <label className="flex items-center gap-2 text-xs text-pc-text-secondary">
                {t("playerActivity.page")}
                <select
                  value={page}
                  onChange={event => setPage(Number(event.target.value))}
                  className="rounded-lg border border-pc-border bg-pc-bg px-2.5 py-1.5 text-xs text-pc-text"
                >
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map(option => (
                    <option key={option} value={option}>
                      {formatNumber(option)}
                    </option>
                  ))}
                </select>
                <span className="text-pc-text-muted">
                  {t("playerActivity.ofPages", { total: formatNumber(totalPages) })}
                </span>
              </label>
              <button
                type="button"
                onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="pc-btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("playerActivity.nextPage")}
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
