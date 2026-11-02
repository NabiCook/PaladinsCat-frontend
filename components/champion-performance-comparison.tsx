/** All champion averages in one ranked comparison; independent of the overview metric.
 * refs: endpoints: GET /stats/performance-metrics/by-champion · migrations: 169
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { fetchChampionPerformanceComparison, fetchStatsChampions, fetchPerformanceMetrics, type StatsChampion, type ChampionPerformanceDistribution, type PerformanceMetricKey, type PerformanceMetricsResponse } from "@/lib/api-client";
import { getPercentageColor } from "@/lib/stat-quality";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { championSlug } from "@/lib/utils";
import { GAME_PERFORMANCE_METRICS } from "@/lib/performance-selection";
import { useLocalization } from "@/lib/localization-context";
import { ErrorState, LoadingIndicator } from "@/components/async-state";
import { SegmentedControl } from "@/components/ui/segmented-control";

import { getRankIconPath, getTierColor, resolveEffectiveTier } from "@/lib/tier-utils";

function ComparisonTooltip({ description, children, className = "" }: { description: string; children: ReactNode; className?: string }) {
  return <Tooltip.Root>
    <Tooltip.Trigger type="button" delay={0} aria-label={description} className={`cursor-help rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent ${className}`}>
      {children}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={8} className="z-50">
        <Tooltip.Popup className="pc-surface max-w-72 rounded-lg border border-pc-border px-3 py-2 text-xs leading-5 text-pc-text shadow-lg">{description}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}

const LABELS = { gpm: "common.metrics.cpm", wpm: "common.metrics.wpm", apm: "common.metrics.apm", winRate: "common.sort.winRate", banRate: "common.metrics.banRate", dpm: "common.metrics.dpm", hpm: "common.metrics.hpm", egpm: "common.metrics.ecpm", shpm: "common.metrics.shpm", spm: "common.metrics.spm", kda: "common.metrics.kda", kpm: "common.metrics.kpm", deaths_per_minute: "common.metrics.deathsPerMinute" } as const;
const COLUMNS = ["winRate", "banRate", ...GAME_PERFORMANCE_METRICS] as const;
const METRIC_COLORS: Partial<Record<PerformanceMetricKey, string>> = { dpm: "text-red-400", wpm: "text-orange-400", apm: "text-fuchsia-400", egpm: "text-yellow-400", shpm: "text-teal-400", hpm: "text-emerald-400", spm: "text-blue-400", kda: "text-violet-400", kpm: "text-cyan-400", deaths_per_minute: "text-rose-400" };
type ComparisonMetric = (typeof COLUMNS)[number];
const CLASSES = [
  { value: "Frontline", labelKey: "common.roles.frontline", icon: "Class_Front_Line_Icon" },
  { value: "Damage", labelKey: "common.roles.damage", icon: "Class_Damage_Icon" },
  { value: "Flank", labelKey: "common.roles.flank", icon: "Class_Flank_Icon" },
  { value: "Support", labelKey: "common.roles.support", icon: "Class_Support_Icon" },
] as const;
type ChampionClass = "all" | (typeof CLASSES)[number]["value"];
type ClassAverages = Partial<Record<Exclude<ChampionClass, "all">, PerformanceMetricsResponse>>;
type ChampionMeasures = Partial<Record<ComparisonMetric, number>> & { matches?: number; bans?: number };
type Averages = Map<number, ChampionMeasures>;
type SortKey = "name" | ComparisonMetric;

/**
 * Server-hydrated initial data for the champion performance comparison table.
 *
 * refs: none
 */
export type ChampionPerformanceInitialData = {
  results: Array<{ metric: PerformanceMetricKey; rows: ChampionPerformanceDistribution[] }>;
  details: StatsChampion[];
  global: PerformanceMetricsResponse;
  classAverages?: ClassAverages;
};

/**
 * Render champion performance comparison with `ErrorState`, `SegmentedControl`, `LoadingIndicator`.
 * I/O types: `{ scope?: "ranked" | "casual", queueId?: number, initialData?: ChampionPerformanceInitialData | null } -> JSX.Element`.
 * refs: none
 */
export default function ChampionPerformanceComparison({ scope = "ranked", queueId = 486, initialData = null }: { scope?: "ranked" | "casual"; queueId?: number; initialData?: ChampionPerformanceInitialData | null }) {
  const columns = COLUMNS.filter(metric => scope === "casual" ? metric !== "winRate" && metric !== "banRate" : metric !== "gpm");
  const { t, formatNumber, formatPercent, locale } = useLocalization();
  const [averages, setAverages] = useState<Averages | null>(null);
  const [details, setDetails] = useState<StatsChampion[]>([]);
  const [distributions, setDistributions] = useState<Map<number, Partial<Record<PerformanceMetricKey, ChampionPerformanceDistribution>>>>(new Map());
  const [classAverages, setClassAverages] = useState<ClassAverages>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [championClass, setChampionClass] = useState<ChampionClass>("all");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "name", ascending: true });
  useEffect(() => {
    let active = true;
    const hydrate = (summary: StatsChampion[], results: Array<{ metric: PerformanceMetricKey; rows: ChampionPerformanceDistribution[] }>, classMetrics: ClassAverages) => {
      const next: Averages = new Map();
      const full = new Map<number, Partial<Record<PerformanceMetricKey, ChampionPerformanceDistribution>>>();
      for (const champion of summary) {
        const rates: ChampionMeasures = {};
        const matches = champion.totalPlays;
        if (matches != null && Number.isFinite(matches)) rates.matches = matches;
        if (champion.totalBans != null && Number.isFinite(champion.totalBans)) rates.bans = champion.totalBans;
        for (const key of ["winRate", "banRate"] as const) {
          const value = champion[key];
          if (value != null && Number.isFinite(value)) rates[key] = value;
        }
        next.set(champion.championId, rates);
      }
      for (const { metric, rows } of results) for (const row of rows) {
        full.set(row.championId, { ...full.get(row.championId), [metric]: row });
        if (!row.totalMatches || !Number.isFinite(row.mean)) continue;
        const champion = next.get(row.championId) ?? {};
        if (COLUMNS.includes(metric as ComparisonMetric)) champion[metric as ComparisonMetric] = row.mean;
        next.set(row.championId, champion);
      }
      if (active) { setAverages(next); setDetails(summary); setDistributions(full); setClassAverages(classMetrics); }
    };
    Promise.all([
      initialData ? Promise.resolve(initialData.details) : scope === "ranked" ? fetchStatsChampions({ scope: "ranked", limit: 100 }) : Promise.resolve([]),
      initialData ? Promise.resolve(initialData.results) : fetchChampionPerformanceComparison({ queueId, scope }),
      initialData?.classAverages ? Promise.resolve(initialData.classAverages)
        : Promise.all(CLASSES.map(async role => [role.value, await fetchPerformanceMetrics({ scope, queueId, role: role.value })] as const)).then(Object.fromEntries),
    ]).then(([summary, results, classMetrics]) => {
      hydrate(summary, results, classMetrics);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, initialData, scope, queueId]);

  const rows = STATIC_CHAMPIONS.filter(champion => championClass === "all" || champion.roles.includes(championClass)).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, locale);
    if (sort.key === "name") return sort.ascending ? byName : -byName;
    const left = averages?.get(a.id)?.[sort.key];
    const right = averages?.get(b.id)?.[sort.key];
    if (left == null) return right == null ? byName : 1;
    if (right == null) return -1;
    return (sort.ascending ? left - right : right - left) || byName;
  });
  const sortHeading = (key: SortKey, label: string) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.ascending ? "ascending" : "descending" : "none"} className={`px-4 py-3 ${key === "name" ? "text-left sm:pl-6" : "text-right"}`}>
    <button type="button" className="inline-flex items-center gap-2 font-medium text-pc-text-secondary hover:text-pc-text" onClick={() => setSort(current => ({ key, ascending: current.key === key ? !current.ascending : key === "name" }))}>
      {label}{sort.key === key ? sort.ascending ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3" aria-hidden="true" />}
    </button>
  </th>;

  if (failed) return <ErrorState title={t("stats.performance.championTitle")} message={t("stats.performance.unavailable")} onRetry={() => { setFailed(false); setAttempt(value => value + 1); }} />;
  return <section className="pc-card-flush min-w-0" aria-labelledby="champion-averages" aria-busy={!averages}>
    <header className="space-y-2 p-4 sm:p-6">
      <h2 id="champion-averages" className="pc-heading scroll-mt-24 text-xl">{t("stats.performance.championTitle")}</h2>
      <div className="pt-2">
        <SegmentedControl<ChampionClass> label={t("generated.players.class")} value={championClass} onChange={setChampionClass} items={[
          { value: "all", label: t("generated.players.all") },
          ...CLASSES.map(role => ({ value: role.value, label: t(role.labelKey), icon: <img src={`/images/icons/${role.icon}.avif`} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" /> })),
        ]} />
      </div>
    </header>
    {!averages && <div className="px-4 pb-4 sm:px-6"><LoadingIndicator /></div>}
    <div className="overflow-x-auto" role="region" aria-label={t("stats.performance.championTitle")} tabIndex={0}>
      <table className="w-full text-sm">
        <caption className="sr-only">{t("stats.performance.championTitle")}</caption>
        <thead><tr className="border-b border-pc-border text-xs">
          {sortHeading("name", t("stats.performance.champion"))}
          {columns.map(metric => sortHeading(metric, t(LABELS[metric])))}
        </tr></thead>
        <tbody>{rows.map(champion => <tr key={champion.id} className="border-b border-pc-border last:border-0">
          <th scope="row" className="px-4 py-3 text-left font-medium sm:pl-6">
            <div className="flex min-w-36 items-center gap-3"><Link href={`/champions/${championSlug(champion.name)}`} className="flex items-center gap-3 text-pc-text hover:text-pc-accent">
              <img src={getChampionIconSafe(champion.name)} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 rounded-md object-cover" />
              <span>{champion.name}</span></Link>
              {(() => {
                const average = details.find(item => item.championId === champion.id)?.avgLeagueTier;
                if (average == null) return null;
                const tier = Math.round(average);
                const rank = resolveEffectiveTier(tier, 0);
                return <ComparisonTooltip className={`ml-auto flex items-center gap-1 whitespace-nowrap text-xs ${getTierColor(rank.displayTier)}`} description={t("stats.performance.tierDetail", {
                  help: t("common.metricHelp.tier"),
                  label: t("generated.champions.avgTier"),
                  tier: rank.displayName,
                  value: formatNumber(average, { maximumFractionDigits: 1 }),
                })}>
                  <img src={getRankIconPath(tier, 0)} alt={rank.displayName} width={24} height={24} className="h-6 w-6 object-contain" />
                  {formatNumber(average, { maximumFractionDigits: 1 })}
                </ComparisonTooltip>;
              })()}
            </div>
          </th>
          {columns.map(metric => {
            const value = averages?.get(champion.id)?.[metric];
            const percentage = metric === "winRate" || metric === "banRate";
            const key = metric as PerformanceMetricKey;
            const role = CLASSES.find(role => champion.roles.includes(role.value));
            const classSummary = role ? classAverages[role.value]?.[key] : undefined;
            const baseline = classSummary?.sampleSize ? classSummary.mean : undefined;
            const baselineLabel = role ? t("performance.roleMetric", { role: t(role.labelKey), metric: t("generated.stats.average") }) : t("generated.players.class");
            const distribution = distributions.get(champion.id)?.[key];
            const delta = value != null && baseline != null && baseline !== 0 ? (value - baseline) / baseline * 100 : null;
            const decimals = ["kda", "kpm", "deaths_per_minute"].includes(metric) ? 2 : 0;
            const range = distribution ? `${t("performance.p10p90")}: ${formatNumber(distribution.p10, { maximumFractionDigits: decimals })}–${formatNumber(distribution.p90, { maximumFractionDigits: decimals })}` : undefined;
            const count = averages?.get(champion.id)?.[metric === "winRate" ? "matches" : "bans"];
            const baseCountDescription = count == null ? t("stats.performance.countUnavailable") : t(metric === "winRate" ? "stats.performance.winCountHelp" : "stats.performance.banCountHelp", { count: formatNumber(count), champion: champion.name });
            const summary = details.find(item => item.championId === champion.id);
            const countDescription = metric === "winRate" && summary?.wins != null
              ? t("stats.performance.winLossDetail", {
                base: baseCountDescription,
                winsLabel: t("generated.players.wins"),
                wins: formatNumber(summary.wins),
                lossesLabel: t("generated.players.losses"),
                losses: formatNumber(Math.max(0, summary.totalPlays - summary.wins)),
              })
              : baseCountDescription;
            return <td key={metric} className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums text-pc-text" style={percentage && value != null ? { color: getPercentageColor(value) } : undefined}>
              {averages ? <ComparisonTooltip className="ml-auto flex flex-col items-end" description={percentage
                ? t("stats.performance.helpWithDetail", { help: t(`common.metricHelp.${metric}`), detail: countDescription })
                : t("stats.performance.metricDetail", {
                  help: t(`common.metricHelp.${metric}`),
                  label: t(LABELS[metric]),
                  value: formatNumber(value, { maximumFractionDigits: decimals }),
                  range: range ?? t("stats.performance.countUnavailable"),
                  globalLabel: baselineLabel,
                  globalValue: formatNumber(baseline, { maximumFractionDigits: decimals }),
                  delta: formatPercent(delta, { signDisplay: "always", maximumFractionDigits: 1 }),
                })}>
                {percentage ? <>
                  <span>{formatPercent(value, { maximumFractionDigits: 2 })}</span>
                  <span className="mt-1 text-xs text-pc-text-secondary">{formatNumber(count)}</span>
                </> : <>
                  <span className={METRIC_COLORS[key]}>{formatNumber(value, { maximumFractionDigits: decimals })}</span>
                  <span className="mt-1 text-xs text-pc-text-muted">{t("performance.classAvg")} {formatNumber(baseline, { maximumFractionDigits: decimals })}</span>
                  <span className={`text-xs ${delta == null ? "text-pc-text-muted" : (metric === "deaths_per_minute" ? delta <= 0 : delta >= 0) ? "text-emerald-400" : "text-rose-400"}`}>{formatPercent(delta, { signDisplay: "always", maximumFractionDigits: 1 })}</span>
                </>}
              </ComparisonTooltip> : <span className="pc-skeleton ml-auto block h-4 w-12 rounded" />}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
