/**
 * Render the PerformanceLeaderboardPage view for the player performance page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchPerformanceLeaderboard, fetchPerformanceMetrics, type PerformanceLeaderboardEntry, type PerformanceMetricSummary } from "@/lib/api-client";
import { getChampionIconSafe } from "@/lib/champion-icons";
import PlayerName from "@/components/player-name";
import { LoadingPanel } from "@/components/async-state";
import TablePagination, { type TablePageSize } from "@/components/table-pagination";
import { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import PerformanceRangeBellCurve from "@/components/performance-range-bell-curve";
import { useLocalization } from "@/lib/localization-context";
import type { TranslationKey } from "@/lib/localization/messages";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";


const METRICS = [
  { key: "cpm", labelKey: "common.metrics.creditsPerMinute", color: "text-yellow-400", role: undefined },
  { key: "hpm", labelKey: "common.metrics.healingPerMinute", color: "text-emerald-400", role: "Support" },
  { key: "dpm", labelKey: "common.metrics.damagePerMinute", color: "text-red-400", role: "Damage" },
  { key: "spm", labelKey: "common.metrics.shieldingPerMinute", color: "text-blue-400", role: "Frontline" },
] as const satisfies ReadonlyArray<{ key: "cpm" | "hpm" | "dpm" | "spm"; labelKey: TranslationKey; color: string; role?: "Support" | "Damage" | "Frontline" }>;

type PerformanceScope = "ranked" | "casual";
type PerformanceMode = "match" | "account" | "champion";

/**
 * Render the PerformanceLeaderboardPage view for the player performance page route.
 * refs: none
 * I/O types: `{ mode = "match" }: { mode?: PerformanceMode } -> JSX.Element`.
 */
export default function PerformanceLeaderboardPage({ mode = "match" }: { mode?: PerformanceMode }) {
  const { t , formatNumber} = useLocalization();
  const leaderboardTitle = mode === "match"
    ? t("menu.performanceLeaderboard")
    : t("stats.scope.performance", { mode: t(mode === "account" ? "generated.players.account" : "generated.players.champion") });
  const [scope, setScope] = useState<PerformanceScope>("ranked");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("cpm");
  const [result, setResult] = useState<{
    key: string;
    rows: PerformanceLeaderboardEntry[];
    summary: PerformanceMetricSummary | null;
  }>({ key: "", rows: [], summary: null });
  const [page, setPage] = usePersistentDirectoryPage();
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const config = METRICS.find((entry) => entry.key === metric)!;
  const requestKey = `${mode}:${scope}:${metric}:${config.role ?? "Global"}`;
  const loading = result.key !== requestKey;
  const rows = loading ? [] : result.rows;
  const summary = loading ? null : result.summary;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchPerformanceLeaderboard({
        metric,
        limit: 100,
        scope,
        mode,
        queueId: scope === "ranked" ? 486 : undefined,
        role: config.role,
      }),
      fetchPerformanceMetrics({
        metric,
        scope,
        queueId: scope === "ranked" ? 486 : undefined,
        role: config.role,
      }),
    ])
      .then(([data, metrics]) => {
        if (!active) return;
        setResult({
          key: requestKey,
          rows: data,
          summary: metrics[metric] ?? null,
        });
      })
      .catch(() => {
        // Keep last snapshot on failure (wiki: failed fetch must not overwrite
        // existing data with empty). Initial load stays empty (no data yet).
      });
    return () => { active = false; };
  }, [config.role, metric, mode, requestKey, scope]);

  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const scopeLabel = t(scope === "ranked" ? "stats.scope.ranked" : "stats.scope.casual");

  return <div className="space-y-6">
    <PlayersPageHeader title={leaderboardTitle} />

    <SegmentedControl
      label={t("performance.modeLabel")}
      items={(["ranked", "casual"] as const).map((value) => ({ value, label: t(value === "ranked" ? "stats.scope.ranked" : "stats.scope.casual") }))}
      value={scope}
      onChange={(value) => { setScope(value); setPage(1); }}
    />

    {mode === "match" && summary && summary.sampleSize > 0 && <PerformanceRangeBellCurve
      metricLabel={config.role ? t("performance.roleMetric", { role: t(config.role === "Support" ? "common.roles.support" : config.role === "Damage" ? "common.roles.damage" : "common.roles.frontline"), metric: t(config.labelKey) }) : t(config.labelKey)}
      summary={summary}
      formatValue={(value) => formatNumber(Math.round(value))}
      labels={{
        global: t("common.roles.global"),
        range: t("common.metrics.range"),
        mode: t("generated.champions.mode"),
        median: t("performance.median"),
        mean: t("performance.mean"),
        p10: t("generated.champions.p10"),
        p90: t("generated.champions.p90"),
        percentileRange: t("performance.p10p90"),
      }}
    />}

    <SegmentedControl label={t("generated.stats.performanceMetrics")} items={METRICS.map((entry) => ({ value: entry.key, label: t(entry.labelKey) }))} value={metric} onChange={(value) => { setMetric(value); setPage(1); }} />

    {loading ? <LoadingPanel /> : <div className="pc-card-flush overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-pc-border bg-pc-bg-secondary text-left text-xs uppercase text-pc-text-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-3 py-3">{t("generated.players.player")}</th>
              <th className="px-3 py-3">{t("generated.stats.champion")}</th>
              {mode === "match" && <th className="px-3 py-3">{t("generated.matches.matchId")}</th>}
              <th className="px-3 py-3 text-right">{t(config.labelKey)}</th>
              {mode !== "match" && <th className="px-3 py-3 text-right">{t("generated.players.matches")}</th>}
              <th className="px-4 py-3">{t("generated.matches.region")}</th>
            </tr>
          </thead>
          <tbody>{visibleRows.map((row) => <tr key={`${row.matchId}-${row.playerId}-${row.rank}`} className="border-b border-pc-border/50 last:border-b-0 hover:bg-pc-bg-secondary/50">
            <td className="px-4 py-3 font-bold text-pc-text-muted">{row.rank}</td>
            <td className="px-3 py-3"><Link href={`/players/${row.playerId}`} className="font-medium text-pc-text hover:text-pc-accent"><PlayerName playerId={row.playerId}>{row.playerName}</PlayerName></Link></td>
            <td className="px-3 py-3">{row.championName ? <span className="inline-flex items-center gap-2 text-pc-text-secondary"><img src={getChampionIconSafe(row.championName)} alt="" className="h-6 w-6 rounded object-contain" />{row.championName}</span> : <span className="text-pc-text-muted">{row.className ?? "—"}</span>}</td>
            {mode === "match" && row.matchId && <td className="px-3 py-3 font-mono text-pc-text-secondary"><Link href={`/matches/${row.matchId}`} className="hover:text-pc-accent hover:underline">{row.matchId}</Link></td>}
            <td className={`px-3 py-3 text-right font-bold tabular-nums ${config.color}`}>{formatNumber(Math.round(row.value))}</td>
            {mode !== "match" && <td className="px-3 py-3 text-right tabular-nums text-pc-text-secondary">{row.totalMatches == null ? "—" : formatNumber(row.totalMatches)}</td>}
            <td className="px-4 py-3 text-pc-text-muted">{row.region ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="p-10 text-center text-sm text-pc-text-muted">{t("performance.noData", { mode: scopeLabel })}</div> : <TablePagination page={page} pageSize={pageSize} totalItems={rows.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} fixedPageSize />}
    </div>}
  </div>;
}
