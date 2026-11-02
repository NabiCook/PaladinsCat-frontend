/** Game-wide performance summaries keep ranked and casual populations separate.
 * refs: endpoints: GET /stats/performance-metrics · migrations: 169
 */
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ChampionPerformanceComparison from "@/components/champion-performance-comparison";
import PageHeader from "@/components/ui/page-header";
import { SegmentedRouteLinks } from "@/components/ui/segmented-control";
import { BarChartComponent } from "@/components/Chart";
import { EmptyState, ErrorState, LoadingIndicator } from "@/components/async-state";
import { fetchPerformancePageData, type PerformancePageData } from "@/lib/api-client";
import { stationaryChartSeries } from "@/lib/chart-colors";
import { useLocalization } from "@/lib/localization-context";
import { useLobbyTier } from "@/lib/lobby-tier-context";
import { CASUAL_PERFORMANCE_MODES, GAME_PERFORMANCE_METRICS, performanceSelection, performanceMetricName, type GamePerformanceMetric, type PerformanceScope } from "@/lib/performance-selection";

const METRICS = {
  dpm: { labelKey: "common.metrics.dpm", full: "common.metrics.damagePerMinute" },
  hpm: { labelKey: "common.metrics.hpm", full: "common.metrics.healingPerMinute" },
  wpm: { labelKey: "common.metrics.wpm", full: "common.metrics.weaponPerMinute" },
  apm: { labelKey: "common.metrics.apm", full: "common.metrics.abilityPerMinute" },
  shpm: { labelKey: "common.metrics.shpm", full: "common.metrics.selfHealingPerMinute" },
  gpm: { labelKey: "common.metrics.cpm", full: "common.metrics.creditsPerMinute" },
  egpm: { labelKey: "common.metrics.ecpm", full: "common.metrics.effectiveCreditsPerMinute" },
  spm: { labelKey: "common.metrics.spm", full: "common.metrics.shieldingPerMinute" },
  kda: { labelKey: "common.metrics.kda", full: "common.metrics.kdaRatio" },
  kpm: { labelKey: "common.metrics.kpm", full: "common.metrics.killsAssistsPerMinute" },
  deaths_per_minute: { labelKey: "common.metrics.deathsPerMinute", full: "common.metrics.deathsPerMinute" },
} as const;

const ROLES = [
  { name: "Frontline", labelKey: "common.roles.frontline", short: "common.roles.frontlineShort", icon: "Class_Front_Line_Icon", color: stationaryChartSeries.sky },
  { name: "Damage", labelKey: "common.roles.damage", short: "common.roles.damageShort", icon: "Class_Damage_Icon", color: stationaryChartSeries.red },
  { name: "Flank", labelKey: "common.roles.flank", short: "common.roles.flank", icon: "Class_Flank_Icon", color: stationaryChartSeries.violet },
  { name: "Support", labelKey: "common.roles.support", short: "common.roles.supportShort", icon: "Class_Support_Icon", color: stationaryChartSeries.emerald },
] as const;

const COLUMNS = [
  { key: "mean", labelKey: "generated.stats.average" },
  { key: "p10", labelKey: "generated.stats.p10" },
  { key: "p25", labelKey: "generated.stats.p25" },
  { key: "median", labelKey: "stats.performance.median" },
  { key: "p75", labelKey: "generated.stats.p75" },
  { key: "p90", labelKey: "generated.stats.p90" },
  { key: "max", labelKey: "generated.stats.max" },
  { key: "sampleSize", labelKey: "generated.stats.samples" },
] as const;

/**
 * Reuse the complete cached page bundle for the dashboard and comparison.
 *
 * refs: none
 */
export type MetricsInitialData = PerformancePageData;

function PerformanceData({ scope, metric, dashboard }: {
  scope: PerformanceScope;
  metric: GamePerformanceMetric;
  dashboard: PerformancePageData["dashboard"];
}) {
  const { t, formatNumber } = useLocalization();
  if (!dashboard.summary.sampleSize) return <EmptyState title={t("stats.performance.empty")} />;

  const decimals = metric === "kda" || metric === "kpm" || metric === "deaths_per_minute" ? 2 : 0;
  const format = (value: number | undefined) => formatNumber(value, { maximumFractionDigits: decimals });
  const averageLabel = t("generated.stats.average");
  const rows = [
    { name: t("common.roles.global"), icon: undefined, summary: dashboard.summary },
    ...ROLES.map(role => ({ name: t(role.labelKey), icon: role.icon, summary: dashboard.roles[role.name] })),
  ];
  const chartData = ROLES.map(role => ({ name: t(role.labelKey), [averageLabel]: dashboard.roles[role.name]?.sampleSize ? Number(dashboard.roles[role.name].mean.toFixed(decimals)) : null }));
  return <div className="space-y-6">
    <section className="pc-card space-y-6" aria-labelledby="performance-overview">
      <h2 id="performance-overview" className="pc-heading text-xl">{t(METRICS[metric].full)}</h2>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(["mean", "median", "p90", "sampleSize"] as const).map(key => <div key={key}>
          <dt className="text-xs text-pc-text-secondary">{t(COLUMNS.find(column => column.key === key)!.labelKey)}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-pc-text">{key === "sampleSize" ? formatNumber(dashboard.summary[key]) : format(dashboard.summary[key])}</dd>
        </div>)}
      </dl>
      <div>
        <h3 className="mb-4 text-sm font-semibold text-pc-text">{t("stats.performance.roleAverages")}</h3>
        <div className="h-60 sm:h-[300px]">
          <BarChartComponent data={chartData} xKey="name" yKeys={[averageLabel]} height="100%" showLegend={false} showTooltip={false} xAxisIcons={Object.fromEntries(ROLES.map(role => [t(role.labelKey), `/images/icons/${role.icon}.avif`]))} showValueLabels valueLabelFormatter={value => formatNumber(Number(value), { maximumFractionDigits: decimals })} barColors={{ [averageLabel]: ROLES.map(role => role.color) }} />
        </div>
      </div>
    </section>
    <section className="pc-card-flush min-w-0" aria-labelledby="performance-distribution">
      <header className="space-y-2 p-4 sm:p-6">
        <h2 id="performance-distribution" className="pc-heading text-xl">{t("stats.performance.distribution")}</h2>
      </header>
      <div className="overflow-x-auto" role="region" aria-label={t("stats.performance.distribution")} tabIndex={0}>
        <table className="w-full min-w-[44rem] whitespace-nowrap text-sm">
          <caption className="sr-only">{t(METRICS[metric].full)} · {t(scope === "ranked" ? "stats.performance.ranked" : "stats.performance.casual")}</caption>
          <thead><tr className="border-b border-pc-border text-xs text-pc-text-secondary">
            <th scope="col" className="px-4 py-3 text-left sm:pl-6">{t("stats.performance.role")}</th>
            {COLUMNS.map(column => <th key={column.key} scope="col" className="px-4 py-3 text-right font-medium">{t(column.labelKey)}</th>)}
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.name} className="border-b border-pc-border last:border-0">
            <th scope="row" className="px-4 py-4 text-left font-medium text-pc-text sm:pl-6"><span className="inline-flex items-center gap-2">
              {row.icon && <img src={`/images/icons/${row.icon}.avif`} alt="" className="h-5 w-5 object-contain" />}{row.name}
            </span></th>
            {COLUMNS.map(column => <td key={column.key} className="px-4 py-4 text-right tabular-nums text-pc-text-secondary">
              {column.key === "sampleSize" ? formatNumber(row.summary?.sampleSize) : format(row.summary?.sampleSize ? row.summary[column.key] : undefined)}
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}

function MetricsContent({ initialData }: { initialData?: MetricsInitialData | null }) {
  const { t } = useLocalization();
  const params = useSearchParams();
  const { filter, ready } = useLobbyTier();
  const { scope, metric, queueId } = performanceSelection(params.get("scope"), params.get("metric"), params.get("queueId"));
  const requestKey = `${scope}:${queueId}:${metric}`;
  const [fetchedPageData, setFetchedPageData] = useState<PerformancePageData | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const href = (nextScope: PerformanceScope, nextMetric: GamePerformanceMetric, nextQueue = queueId) => {
    const selection = performanceSelection(nextScope, nextMetric, String(nextQueue));
    return `/stats/performance?scope=${selection.scope}&metric=${performanceMetricName(selection.metric)}&queueId=${selection.queueId}`;
  };
  const selectionReady = scope === "casual" || ready;
  const seed = initialData?.scope === scope && initialData.queueId === queueId && initialData.metric === metric && (scope === "casual" || filter === "all") ? initialData : null;
  const fetchedMatches = fetchedPageData?.scope === scope && fetchedPageData.queueId === queueId && fetchedPageData.metric === metric;
  const pageData = seed ?? (fetchedMatches ? fetchedPageData : null);
  const failed = failedKey === requestKey && !pageData;
  useEffect(() => {
    if (!selectionReady || seed || fetchedMatches) return;
    const controller = new AbortController();
    fetchPerformancePageData(scope, metric, queueId, controller.signal).then(data => {
      setFetchedPageData(data);
      setFailedKey(current => current === requestKey ? null : current);
    }).catch(() => {
      if (!controller.signal.aborted) setFailedKey(requestKey);
    });
    return () => controller.abort();
  }, [attempt, fetchedMatches, metric, queueId, requestKey, scope, seed, selectionReady]);
  return <div className="space-y-6">
    <PageHeader parentHref="/stats" parentLabel={t("stats.portal.title")} title={t(scope === "ranked" ? "stats.performance.rankedTitle" : "stats.performance.casualTitle")} />
    <div className="space-y-4">
      <SegmentedRouteLinks label={t("performance.modeLabel")} value={scope} items={(["ranked", "casual"] as const).map(value => ({ value, label: t(value === "ranked" ? "stats.performance.ranked" : "stats.performance.casual"), href: href(value, metric) }))} />
      {scope === "casual" && <SegmentedRouteLinks label={t("performance.modeLabel")} value={String(queueId)} items={CASUAL_PERFORMANCE_MODES.map(mode => ({ value: String(mode.queueId), label: t(mode.labelKey), href: href(scope, metric, mode.queueId) }))} />}
      <SegmentedRouteLinks label={t("menu.performanceMetrics")} value={metric} items={GAME_PERFORMANCE_METRICS.filter(value => scope === "casual" || value !== "gpm").map(value => ({ value, label: t(METRICS[value].labelKey), href: href(scope, value) }))} />
    </div>
    {!selectionReady || (!pageData && !failed) ? <div className="pc-card min-h-80" role="status"><LoadingIndicator /></div>
      : failed ? <ErrorState message={t("stats.performance.unavailable")} onRetry={() => { setFailedKey(null); setAttempt(value => value + 1); }} />
        : pageData && <>
          <PerformanceData key={`${scope}:${queueId}:${metric}:${filter}`} scope={scope} metric={metric} dashboard={pageData.dashboard} />
          <ChampionPerformanceComparison key={`${scope}:${queueId}:${filter}`} scope={scope} queueId={queueId} initialData={pageData.comparison} />
        </>}
  </div>;
}

/**
 * Render the /stats/metrics route with `Suspense`, `LoadingIndicator`, `MetricsContent`.
 * I/O types: `{ initialData }: { initialData?: MetricsInitialData | null } -> JSX.Element`.
 * refs: none
 */
export default function MetricsPage({ initialData }: { initialData?: MetricsInitialData | null }) {
  return <Suspense fallback={<LoadingIndicator />}><MetricsContent initialData={initialData} /></Suspense>;
}
