/**
 * Render the AutomaticAfkPlayerDetailPage view for the player afk-wintrade id page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LoadingPanel } from "@/components/async-state";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { fetchAutomaticAfkPlayerDetail, type AutomaticAfkPlayerDetail } from "@/lib/api-client";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { formatKda } from "@/lib/kda";
import { useLocalization } from "@/lib/localization-context";

function duration(seconds: number) {
  if (!seconds) return "—";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function resultColor(result: string | null) {
  const normalized = result?.toLowerCase();
  if (normalized === "winner" || normalized === "win") return "text-emerald-300";
  if (normalized === "loser" || normalized === "loss") return "text-red-300";
  return "text-pc-text-muted";
}

function displayMatchMap(mapName: string | null, queueId: number) {
  if (!mapName) return null;
  return queueId === 486 ? mapName.replace(/^Ranked\s+/i, "") : mapName;
}

/**
 * Render the AutomaticAfkPlayerDetailPage view for the player afk-wintrade id page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function AutomaticAfkPlayerDetailPage() {
  const { t, formatDateTime, formatNumber } = useLocalization();
  const params = useParams<{ id: string }>();
  const playerId = params.id;
  const [detail, setDetail] = useState<AutomaticAfkPlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchAutomaticAfkPlayerDetail(playerId)
      .then((result) => { if (!cancelled) setDetail(result); })
      .catch((cause) => { if (!cancelled) setError(formatApiErrorMessage(cause, t, "Could not load AFK or win-trade case")); });
    return () => { cancelled = true; };
  }, [playerId]);

  if (error) {
    return <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>;
  }
  if (!detail) return <LoadingPanel />;

  const { player, matches } = detail;
  return (
    <div className="space-y-6">
      <PlayersPageHeader
        meta={<div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-pc-text-muted">
              <span className="rounded border border-red-400/30 bg-red-400/15 px-1.5 py-0.5 text-red-300">{t("moderation.automaticAfkBadge")}</span>
              {player.communityMarked && <span className="rounded border border-sky-400/30 bg-sky-400/15 px-1.5 py-0.5 text-sky-300">{t("moderation.communityMarked")}</span>}
              <span>{player.platform}</span>
              <span>{player.region}</span>
            </div>}
        title={<Link href={`/players/${player.id}`} className="hover:text-pc-accent hover:underline">{player.name}</Link>}
      />

      <section className="grid grid-cols-2 divide-x divide-pc-border overflow-hidden rounded-xl border border-pc-border bg-pc-bg-elevated">
        <div className="p-4"><div className="text-xs text-pc-text-muted">{t("common.playerChampions.sortMatches")}</div><div className="mt-1 text-xl font-semibold text-pc-text">{formatNumber(player.automaticMatchCount)}</div></div>
        <div className="p-4"><div className="text-xs text-pc-text-muted">{t("moderation.lowestEcpm")}</div><div className="mt-1 text-xl font-semibold text-red-300">{formatNumber(player.lowestEcpm, { maximumFractionDigits: 2 })}</div></div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="pc-card-title shadow-sm">{t("generated.players.matches")}</h2>
          <span className="text-xs text-pc-text-muted">{formatNumber(matches.length)} {t("generated.players.matches.9f3e924")}</span>
        </div>
        {matches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pc-border p-8 text-center text-sm text-pc-text-muted">{t("generated.matches.noMatchingGames")}</div>
        ) : (
          <div>
            <div className="space-y-2 lg:hidden">
              {matches.map((match) => (
                <div key={match.matchId} className="pc-mobile-panel flex min-w-0 items-center gap-3 p-3">
                  <img src={getChampionIconSafe(match.championName || "")} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-pc-text">{match.championName || t("generated.players.unknownChampion")}</span><span className={`shrink-0 text-xs font-bold ${resultColor(match.winStatus)}`}>{match.winStatus?.toLowerCase().startsWith("win") ? t("generated.players.win") : t("generated.players.loss")}</span></div>
                    <div className="truncate text-xs text-pc-text-muted">{t("generated.players.ranked")} · {displayMatchMap(match.map, match.queueId) || t("generated.players.unknownMap")}</div>
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-pc-text-muted"><Link href={`/matches/${match.matchId}`} className="shrink-0 font-mono text-pc-accent hover:text-pc-accent-secondary">#{match.matchId}</Link><span className="truncate">{formatDateTime(match.entryDatetime)}</span></div>
                  </div>
                  <div className="shrink-0 text-right"><div className="font-mono text-sm font-bold text-red-300">{formatNumber(match.ecpm, { maximumFractionDigits: 2 })} {t("common.metrics.ecpm")}</div><div className="font-mono text-xs text-pc-text">{match.kills}/{match.deaths}/{match.assists}</div><div className="mt-1 font-mono text-xs text-pc-text-secondary">{duration(match.durationSeconds)}</div></div>
                </div>
              ))}
            </div>
            <div className="pc-card-flush hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pc-border text-left text-xs text-pc-text-muted">
                    <th className="px-3 py-1.5">{t("generated.players.match.0335207")}</th>
                    <th className="px-3 py-1.5">{t("generated.players.champion")}</th>
                    <th className="px-3 py-1.5">{t("generated.players.queue")}</th>
                    <th className="px-3 py-1.5">{t("common.metrics.ecpm")}</th>
                    <th className="px-3 py-1.5">{t("common.playerChampions.killsShort")}</th>
                    <th className="px-3 py-1.5">{t("common.playerChampions.deathsShort")}</th>
                    <th className="px-3 py-1.5">{t("common.playerChampions.assistsShort")}</th>
                    <th className="px-3 py-1.5">{t("generated.players.kda")}</th>
                    <th className="px-3 py-1.5">{t("generated.players.result")}</th>
                    <th className="px-3 py-1.5">{t("generated.players.time")}</th>
                    <th className="px-3 py-1.5">{t("generated.players.played")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match) => (
                    <tr key={match.matchId} className="border-b border-pc-border/30 transition-colors hover:bg-pc-bg-secondary/50">
                      <td className="px-3 py-1.5"><Link href={`/matches/${match.matchId}`} className="font-mono text-xs text-pc-accent hover:text-pc-accent-secondary">#{match.matchId}</Link></td>
                      <td className="px-3 py-1.5"><div className="flex items-center gap-1.5"><img src={getChampionIconSafe(match.championName || "")} alt="" className="h-5 w-5 rounded object-contain" /><span className="text-xs text-pc-text">{match.championName || t("generated.players.unknownChampion")}</span></div></td>
                      <td className="px-3 py-1.5"><div className="text-xs text-pc-text-secondary">{t("generated.players.ranked")}</div><div className="max-w-28 truncate text-xs text-pc-text-muted" title={displayMatchMap(match.map, match.queueId) || undefined}>{displayMatchMap(match.map, match.queueId) || t("generated.players.unknownMap")}</div></td>
                      <td className="px-3 py-1.5 font-mono text-xs font-bold text-red-300">{formatNumber(match.ecpm, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-pc-text">{match.kills}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-pc-text">{match.deaths}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-pc-text">{match.assists}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-pc-text">{formatKda(match.kills, match.deaths, match.assists)}</td>
                      <td className="px-3 py-1.5"><span className={`text-xs font-medium ${resultColor(match.winStatus)}`}>{match.winStatus?.toLowerCase().startsWith("win") ? t("common.result.winShort") : t("common.result.lossShort")}</span></td>
                      <td className="px-3 py-1.5 font-mono text-xs text-pc-text-secondary">{duration(match.durationSeconds)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-pc-text-muted">{formatDateTime(match.entryDatetime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
