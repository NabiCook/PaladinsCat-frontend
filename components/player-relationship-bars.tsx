/** Player relationship rows with role composition and expandable champion detail. · refs: none */
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import PlayerName from "@/components/player-name";
import type { PlayerRelationshipRow } from "@/lib/api-client";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { useLocalization } from "@/lib/localization-context";
import { getPercentageColor } from "@/lib/stat-quality";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";

const CLASS_ORDER = ["Frontline", "Damage", "Flank", "Support", "Unknown"];
const CLASS_TONES: Record<string, string> = { Frontline: "bg-sky-400", Damage: "bg-rose-400", Flank: "bg-violet-400", Support: "bg-emerald-400", Unknown: "bg-slate-400" };
const championClasses = new Map(STATIC_CHAMPIONS.map((champion) => [champion.name.toLowerCase(), champion.roles[0] ?? "Unknown"]));

function orderedCounts(counts: Record<string, number>) {
  return Object.entries(counts).filter(([, count]) => count > 0).sort(([left], [right]) => {
    const leftIndex = CLASS_ORDER.indexOf(left);
    const rightIndex = CLASS_ORDER.indexOf(right);
    return (leftIndex < 0 ? CLASS_ORDER.length : leftIndex) - (rightIndex < 0 ? CLASS_ORDER.length : rightIndex);
  });
}

function championsByClass(counts: Record<string, number>) {
  const groups = new Map<string, Array<[string, number]>>();
  for (const [champion, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const role = championClasses.get(champion.toLowerCase()) ?? "Unknown";
    const group = groups.get(role) ?? [];
    group.push([champion, count]);
    groups.set(role, group);
  }
  return [...groups.entries()].sort(([left], [right]) => CLASS_ORDER.indexOf(left) - CLASS_ORDER.indexOf(right)).map(([role, champions]) => [role, champions.sort(([, left], [, right]) => right - left)] as const);
}

/**
 * Render up to limit co-play partners with match-count bars normalized to the visible maximum, win records, and role distribution. Track the expanded partner locally and reveal champion details only when showDetails is enabled.
 * I/O types: `{ rows, tone = "cyan", limit, showDetails = false, className = "space-y-3" }: { rows: PlayerRelationshipRow[]; tone?: "cyan" | "violet" | "amber"; limit?: number; showDetails?: boolean; className?: string } -> JSX.Element`.
 * refs: none
 */
export default function PlayerRelationshipBars({ rows, tone = "cyan", limit, showDetails = false, className = "space-y-3" }: { rows: PlayerRelationshipRow[]; tone?: "cyan" | "violet" | "amber"; limit?: number; showDetails?: boolean; className?: string }) {
  const { formatNumber, formatPercent, formatRecord, t } = useLocalization();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const visible = limit ? rows.slice(0, limit) : rows;
  const maximum = Math.max(1, ...visible.map((row) => row.matchCount));
  const barClass = tone === "violet" ? "bg-violet-400" : tone === "amber" ? "bg-amber-400" : "bg-cyan-400";

  return <div className={className}>{visible.map((row) => {
    const roles = orderedCounts(row.partnerRoleCounts);
    const roleTotal = roles.reduce((total, [, count]) => total + count, 0);
    const championGroups = championsByClass(row.partnerChampionCounts);
    const canExpand = championGroups.length > 0;
    const expanded = expandedId === row.otherPlayerId;
    const winRateQuality = row.winRate == null ? null : { color: getPercentageColor(row.winRate) };
    return <div key={row.otherPlayerId} className="min-w-0 rounded-lg border border-pc-border/50 bg-pc-bg-secondary/20 p-2.5">
      <div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center justify-between gap-3 text-xs"><Link href={`/players/${row.otherPlayerId}`} className="min-w-0 truncate font-semibold text-pc-text hover:text-pc-accent"><PlayerName playerId={row.otherPlayerId} moderation={row.moderation ?? null}>{row.otherPlayerName}</PlayerName></Link><div className="flex shrink-0 items-center gap-2 font-mono text-pc-text-secondary"><span>{formatNumber(row.matchCount)}</span><span style={winRateQuality ? { color: winRateQuality.color } : undefined}>{formatPercent(row.winRate)}</span></div></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-pc-bg-secondary" aria-label={t("generated.players.matches")}><div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(3, (row.matchCount / maximum) * 100)}%` }} /></div></div>{canExpand && <button type="button" aria-label={t("generated.matches.details")} aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : row.otherPlayerId)} className="shrink-0 rounded-md p-1 text-pc-text-muted transition-colors hover:bg-pc-bg-secondary hover:text-pc-text"><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></button>}</div>
      {roles.length > 0 && <div className="mt-2 border-t border-pc-border/40 pt-2"><div className="h-2 overflow-hidden rounded-full bg-pc-bg" aria-label={t("generated.champions.class")}>{roles.map(([role, count]) => <span key={role} title={formatNumber(count)} className={`inline-block h-full ${CLASS_TONES[role] ?? CLASS_TONES.Unknown}`} style={{ width: `${(count / roleTotal) * 100}%` }} />)}</div></div>}
      <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-pc-text-muted"><span>{t("generated.players.winRate")}: <span style={winRateQuality ? { color: winRateQuality.color } : undefined}>{formatPercent(row.winRate)}</span></span>{row.metricMatchCount > 0 && <span>{formatRecord(row.wins, row.losses)}{row.metricMatchCount !== row.matchCount && <> ({formatNumber(row.metricMatchCount)}/{formatNumber(row.matchCount)} {t("generated.players.matches")})</>}</span>}</div>
      {expanded && showDetails && <div className="mt-3 space-y-3 border-t border-pc-border/40 pt-3">{championGroups.map(([role, champions]) => <section key={role}><div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-pc-text-muted">{role}</div><div className="grid gap-1 sm:grid-cols-2">{champions.map(([champion, count]) => <div key={champion} className="flex min-w-0 items-center gap-2 rounded-md bg-pc-bg/70 px-2 py-1.5 text-xs"><img src={getChampionIconSafe(champion)} alt="" className="h-6 w-6 shrink-0 rounded object-contain" /><span className="min-w-0 flex-1 truncate text-pc-text">{champion}</span><span className="font-mono text-pc-text-secondary">{formatNumber(count)}</span></div>)}</div></section>)}</div>}
    </div>;
  })}</div>;
}
