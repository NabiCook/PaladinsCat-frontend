/**
 * Render player activity panel with `ActivityStatementContext.Provider`, `HourlyCardHeader`, `LoadingPanel`, `ActivityChartStatement`, `PlayerHourlyRegionCard`.
 * refs: none
 */
"use client";

import { createContext, Fragment, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { fetchMatchesOverview, fetchPresenceHourlyStats, fetchPresenceStats, type MatchHourlyStats, type MatchQueueActivity, type MatchesOverview, type PresenceHourlyStats, type PresenceStats, type PresenceBreakdownStats } from "@/lib/api-client";
import { LoadingPanel } from "@/components/async-state";
import { LineChartComponent } from "@/components/Chart";
import DetailLink from "@/components/detail-link";
import { stationaryChartSeries } from "@/lib/chart-colors";
import { useLocalization } from "@/lib/localization-context";
import { getPercentageColor } from "@/lib/stat-quality";

/**
 * Region -> chart series color map shared by activity charts and breakdowns.
 *
 * refs: none
 */
export const REGION_COLORS: Record<string, string> = {
  NA: stationaryChartSeries.emerald,
  EU: stationaryChartSeries.sky,
  SEA: stationaryChartSeries.violet,
  JPN: stationaryChartSeries.fuchsia,
  RUS: stationaryChartSeries.indigo,
  BR: stationaryChartSeries.amber,
  OCE: stationaryChartSeries.cyan,
  LATAM: stationaryChartSeries.orange,
  Unknown: stationaryChartSeries.slate,
};

const PLATFORM_COLORS: Record<string, string> = {
  Steam: stationaryChartSeries.sky,
  PSN: stationaryChartSeries.indigo,
  "Epic Games": stationaryChartSeries.violet,
  XboxLive: stationaryChartSeries.emerald,
  Hirez: stationaryChartSeries.amber,
  Nintendo: stationaryChartSeries.red,
  Unknown: stationaryChartSeries.slate,
};

const PALADINS_2_STATEMENT = "PaladinsCat does not support Paladins 2 Project";
const ActivityStatementContext = createContext(true);

type DisplayActivity = {
  total24h: number;
  regions: Array<{ region: string; total24h: number; matchesPerHour: number }>;
  hourly: Array<{ hour: number; date: string; total: number; regions: Record<string, number> }>;
};

/**
 * Define player activity initial data as `{ overview: MatchesOverview | null; presence: PresenceStats | null; presenceHourly: PresenceHourlyStats | null; }`.
 * refs: none
 */
export type PlayerActivityInitialData = {
  overview: MatchesOverview | null;
  presence: PresenceStats | null;
  presenceHourly: PresenceHourlyStats | null;
};

function rankedFallback(stats: MatchHourlyStats | null): MatchQueueActivity[] {
  if (!stats) return [];
  return [{
    queueId: 486,
    queueName: "Ranked Siege",
    ranked: true,
    total24h: stats.rankedToday ?? 0,
    regions: stats.regions.map(region => ({
      region: region.region,
      total24h: region.totalToday,
      matchesPerHour: region.matchesPerHour,
    })),
    hourly: (stats.hourly ?? []).map(entry => ({
      date: entry.date ?? "",
      hour: entry.hour,
      total: entry.total,
      regions: {
        NA: entry.NA,
        EU: entry.EU,
        SEA: entry.Asia,
        BR: entry.BR,
        OCE: entry.OCE,
        LATAM: entry.LATAM,
      },
    })),
  }];
}

function aggregateQueues(queues: MatchQueueActivity[]): DisplayActivity {
  const totals: Record<string, number> = {};
  const hourly = Array.from({ length: 24 }, (_, index) => {
    const template = queues.find(queue => queue.hourly[index])?.hourly[index];
    const regions: Record<string, number> = {};
    let total = 0;
    for (const queue of queues) {
      const entry = queue.hourly[index];
      if (!entry) continue;
      total += entry.total;
      for (const [region, value] of Object.entries(entry.regions)) {
        regions[region] = (regions[region] ?? 0) + value;
      }
    }
    for (const [region, value] of Object.entries(regions)) totals[region] = (totals[region] ?? 0) + value;
    return { date: template?.date ?? "", hour: template?.hour ?? index, total, regions };
  });
  return {
    total24h: queues.reduce((sum, queue) => sum + queue.total24h, 0),
    regions: Object.entries(totals).map(([region, total24h]) => ({
      region,
      total24h,
      matchesPerHour: Math.round(total24h / 24),
    })),
    hourly,
  };
}

/**
 * Render player activity panel with `ActivityStatementContext.Provider`, `HourlyCardHeader`, `LoadingPanel`, `ActivityChartStatement`, `PlayerHourlyRegionCard`.
 * refs: none
 * I/O types: `{ showStatements = true, initialData = null, }: { showStatements?: boolean; initialData?: PlayerActivityInitialData | null; } -> JSX.Element`.
 */
export default function PlayerActivityPanel({
  showStatements = true,
  initialData = null,
}: {
  showStatements?: boolean;
  initialData?: PlayerActivityInitialData | null;
}) {
  const { t, formatNumber, formatHourFromUtcBucket } = useLocalization();
  // Keep the server payload stable for this mounted page. Starting with it
  // avoids a blank client-only render and the duplicate hydration fetch.
  const [serverData] = useState<PlayerActivityInitialData | null>(initialData);
  const [hourlyStats, setHourlyStats] = useState<MatchHourlyStats | null>(() => serverData?.overview?.hourly ?? null);
  const [droppedIdsByHour, setDroppedIdsByHour] = useState<Record<string, string[]>>(() => serverData?.overview?.droppedIdsByHour ?? {});
  const [presence, setPresence] = useState<PresenceStats | null>(() => serverData?.presence ?? null);
  const [presenceHourly, setPresenceHourly] = useState<PresenceHourlyStats | null>(() => serverData?.presenceHourly ?? null);
  const [presenceHourlyLoading, setPresenceHourlyLoading] = useState(() => serverData?.presenceHourly == null);
  const [activityUnavailable, setActivityUnavailable] = useState(() => serverData?.overview != null && !serverData.overview.hourly);
  const [selectedQueue, setSelectedQueue] = useState<"all" | number>("all");
  const [selectedPlayerQueue, setSelectedPlayerQueue] = useState<"all" | number>("all");
  const [playerBreakdown, setPlayerBreakdown] = useState<"region" | "platform">("region");
  const [loading, setLoading] = useState(() => serverData?.overview == null);
  // The data request is the only loading authority here. A missed route
  // transition timer must not keep this high-traffic page blank indefinitely.
  const displayLoading = loading;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        // Activity is a global match-count surface. Lobby tier preferences are
        // intentionally not sent because ID-only casual discovery has no
        // player-detail/tier data and must remain comparable with ranked.
        const [overview, presenceResult] = await Promise.all([
          fetchMatchesOverview({ view: "activity-v3" }),
          fetchPresenceStats().catch(() => null),
        ]);
        if (!active) return;
        if (!overview.hourly) {
          setActivityUnavailable(true);
          return;
        }
        setHourlyStats(overview.hourly);
        setDroppedIdsByHour(overview.droppedIdsByHour);
        if (presenceResult) setPresence(presenceResult);
        setActivityUnavailable(false);
      } catch {
        // Keep the last confirmed activity visible during a transient API
        // outage. On the first load, make the failure explicit instead of
        // rendering an empty chart as if no matches were played.
        if (active) setActivityUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    // The server already obtained the first payload. Refresh it on the normal
    // cadence instead of reissuing the same requests during hydration.
    if (!serverData?.overview?.hourly || !serverData?.presence) void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [serverData]);

  useEffect(() => {
    let active = true;
    // A queue change must not retain another queue's chart. Background
    // refreshes keep this queue's last successful response visible.
    let hasData = selectedPlayerQueue === "all" && serverData?.presenceHourly != null;
    const load = async () => {
      if (!hasData) setPresenceHourlyLoading(true);
      const result = await fetchPresenceHourlyStats(selectedPlayerQueue === "all" ? undefined : selectedPlayerQueue).catch(() => null);
      if (active) {
        if (result) {
          setPresenceHourly(result);
          hasData = true;
        }
        setPresenceHourlyLoading(false);
      }
    };
    if (!hasData) void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [selectedPlayerQueue, serverData]);

  const queues = hourlyStats?.queues ?? rankedFallback(hourlyStats);
  const display = useMemo(() => {
    if (selectedQueue === "all") return aggregateQueues(queues);
    return queues.find(queue => queue.queueId === selectedQueue) ?? aggregateQueues(queues);
  }, [queues, selectedQueue]);
  const activeRegions = display.regions
    .filter(region => region.total24h > 0)
    .sort((left, right) => right.total24h - left.total24h);
  const matchRegionStackOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const entry of display.hourly) {
      for (const [region, value] of Object.entries(entry.regions)) {
        if (value > 0 && !seen.has(region)) {
          seen.add(region);
          order.push(region);
        }
      }
    }
    return order;
  }, [display.hourly]);
  const maxHourly = Math.max(...display.hourly.map(entry => entry.total), 1);
  const playerHourly = useMemo(() => {
    const rows = new Map<string, DisplayActivity["hourly"][number]>(playerBreakdown === "region"
      ? (presenceHourly?.hourly_by_region ?? []).map(entry => [`${entry.date}|${entry.hour}`, entry])
      : (presenceHourly?.hourly_by_platform ?? []).map(entry => [`${entry.date}|${entry.hour}`, {
        date: entry.date,
        hour: entry.hour,
        total: entry.total,
        regions: entry.platforms,
      }]));
    return display.hourly.map(slot => rows.get(`${slot.date}|${slot.hour}`) ?? {
      date: slot.date,
      hour: slot.hour,
      total: 0,
      regions: {},
    });
  }, [display.hourly, playerBreakdown, presenceHourly?.hourly_by_platform, presenceHourly?.hourly_by_region]);
  const weekly = useMemo(() => (hourlyStats?.weekly ?? []).map(day => ({
    ...day,
    displayTotal: selectedQueue === "all"
      ? day.total
      : Number(day.queues[String(selectedQueue)] ?? 0),
    displayPlayers: selectedQueue === "all"
      ? Number(day.players ?? 0)
      : Number(day.playerQueues?.[String(selectedQueue)] ?? 0),
  })), [hourlyStats?.weekly, selectedQueue]);
  const rankedHourly = hourlyStats?.hourly ?? [];
  const droppedRows = useMemo(() => rankedHourly
    .map((entry: any) => ({ ...entry, droppedIds: droppedIdsByHour[`${entry.date}|${entry.hour}`] ?? [] }))
    .filter((entry: any) => entry.droppedIds.length > 0), [droppedIdsByHour, rankedHourly]);
  const showRankedHealth = selectedQueue === 486;

  return (
    <ActivityStatementContext.Provider value={showStatements}>
    <div className="w-full min-w-0 space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="pc-card min-w-0 p-3 sm:p-4">
        <HourlyCardHeader
          title={t("playerActivity.matches24h")}
          helpText={<>
            <p>{t("playerActivity.queueAndRegion")}</p>
            <p className="mt-2"><span className="font-medium text-pc-text">{t("generated.matches.discoveryRunsHourlyAtHh30")}</span> {t("playerActivity.discoveryDescription")}</p>
          </>}
          queueLabel={t("playerActivity.queue")}
          allQueuesLabel={t("playerActivity.allQueues")}
          queues={queues}
          selectedQueue={selectedQueue}
          onQueueChange={setSelectedQueue}
          total={displayLoading ? null : display.total24h}
          formatNumber={formatNumber}
        />

        {displayLoading ? <LoadingPanel compact className="min-h-[30rem]" /> : activityUnavailable && !hourlyStats ? <div role="status" className="flex min-h-[30rem] items-center justify-center text-center text-sm text-pc-text-muted">{t("playerActivity.retrying")}</div> : <div>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
            {activeRegions.map(region => <span key={region.region} className="inline-flex items-center gap-1.5 text-xs text-pc-text-muted"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: REGION_COLORS[region.region] ?? REGION_COLORS.Unknown }} />{region.region} · {formatNumber(region.total24h)}</span>)}
            {activeRegions.length === 0 && !activityUnavailable && <span className="text-xs text-pc-text-muted">{t("playerActivity.noMatches")}</span>}
            {activityUnavailable && hourlyStats && <span role="status" className="text-xs text-amber-300">{t("playerActivity.showingConfirmedWhileRetrying")}</span>}
          </div>
          <ActivityChartStatement className="mb-3 text-center" />
          <div className="grid grid-cols-[3.5rem_1fr_2.5rem] gap-2 border-b border-pc-border/30 px-1 pb-1 text-center text-xs uppercase text-pc-text-muted">
            <span>{t("generated.matches.localTime")}</span><span>{t("playerActivity.region")}</span><span>Σ</span>
          </div>
          {display.hourly.map((entry, index) => {
            const current = index === display.hourly.length - 1;
            return <Fragment key={`${entry.date}|${entry.hour}`}>
              <div className={`grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2 rounded px-1 py-1 ${current ? "bg-pc-accent/8 ring-1 ring-pc-accent/20" : "hover:bg-pc-bg-secondary/50"}`}>
                <span suppressHydrationWarning className={`text-right font-mono text-xs ${current ? "font-semibold text-pc-accent" : "text-pc-text-muted"}`}>{formatHourFromUtcBucket(entry.date, entry.hour)}</span>
                <ActivityBar entry={entry} max={maxHourly} formatNumber={formatNumber} />
                <span className={`text-right font-mono text-xs font-semibold ${entry.total > 0 ? "text-pc-text" : "text-pc-text-muted/30"}`}>{entry.total || "-"}</span>
              </div>
              {index < display.hourly.length - 1 && <ActivityChartStatement className="px-1 py-0.5 text-center" />}
            </Fragment>;
          })}
          <ActivityChartStatement className="px-1 py-0.5 text-center" />
        </div>}
      </section>

      <PlayerHourlyRegionCard
        loading={displayLoading || presenceHourlyLoading}
        stats={presenceHourly}
        hourly={playerHourly}
        queues={queues}
        selectedQueue={selectedPlayerQueue}
        onQueueChange={(queue) => {
          if (queue === selectedPlayerQueue) return;
          const seed = queue === "all" ? serverData?.presenceHourly ?? null : null;
          setPresenceHourly(seed);
          setPresenceHourlyLoading(seed == null);
          setSelectedPlayerQueue(queue);
        }}
        breakdown={playerBreakdown}
        onBreakdownChange={setPlayerBreakdown}
        regionOrder={activeRegions.map(region => region.region)}
        regionStackOrder={matchRegionStackOrder}
        title={t("playerActivity.players24h")}
        helpText={t("seo.stats.activity.description")}
        regionModeLabel={t("playerActivity.playersByRegion")}
        platformModeLabel={t("playerActivity.playersByPlatform")}
        queueLabel={t("playerActivity.queue")}
        allQueuesLabel={t("playerActivity.allQueues")}
        timeLabel={t("generated.matches.localTime")}
        regionLabel={t("playerActivity.region")}
        formatNumber={formatNumber}
        formatHour={formatHourFromUtcBucket}
      />
      </div>

      <WeeklyTrend
        loading={displayLoading}
        days={weekly}
        title={t("playerActivity.weeklyTrend")}
        subtitle={selectedQueue === "all"
          ? t("playerActivity.allQueues")
          : queues.find(queue => queue.queueId === selectedQueue)?.queueName ?? ""}
        matchesLabel={t("playerActivity.weeklyMatches")}
        playersLabel={t("playerActivity.weeklyPlayers")}
        formatNumber={formatNumber}
      />

      {showRankedHealth && droppedRows.length > 0 && <section className="pc-card p-3 sm:p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-wider text-amber-300">{t("generated.matches.trueDropped")}</h2><span className="text-xs text-pc-text-muted">{droppedRows.reduce((sum: number, row: any) => sum + row.droppedIds.length, 0)} {t("generated.matches.ids")}</span></div><div className="space-y-2">{droppedRows.map((row: any) => <div key={`${row.date}|${row.hour}`} className="flex gap-2 text-xs"><span suppressHydrationWarning className="w-10 shrink-0 text-right font-mono text-pc-text-muted">{formatHourFromUtcBucket(row.date, row.hour)}</span><div className="flex flex-wrap gap-1">{row.droppedIds.map((id: string) => <Link key={id} href={`/matches/${id}`} className="font-mono text-amber-200 hover:text-pc-accent">#{id}</Link>)}</div></div>)}</div></section>}

      {!displayLoading && presence && <PlayerPresenceBreakdown
        presence={presence}
        formatNumber={formatNumber}
        title={t("playerActivity.players24h")}
        queueTitle={t("playerActivity.playersByQueue")}
        platformTitle={t("playerActivity.playersByPlatform")}
        regionTitle={t("playerActivity.playersByRegion")}
        publicLabel={t("playerActivity.publicPlayers24h")}
        privateLabel={t("playerActivity.privatePlayers24h")}
        unresolvedLabel={t("playerActivity.unresolvedPrivate24h")}
        unresolvedRangeLabel={t("playerActivity.unresolvedPlayerRange")}
        possibleTotalLabel={t("playerActivity.possiblePlayerTotal")}
        coverageLabel={t("playerActivity.platformCoverage")}
        overlapNote={t("playerActivity.queueOverlapNote")}
        detailsLabel={t("generated.matches.details")}
      />}
    </div>
    </ActivityStatementContext.Provider>
  );
}

/**
 * Render a proportional stacked activity bar from a bucket and its series colors.
 * I/O: in `{ entry: DisplayActivity["hourly"][number], max: number, formatNumber: (value: number) => string, colors?: Record<string, string>, seriesOrder?: string[], playersByRegion?: Record<string, Array<{ playerId: number; name: string }>> }` -> out `JSX.Element`.
 *
 * refs: none
 */
export function ActivityBar({
  entry,
  max,
  formatNumber,
  colors = REGION_COLORS,
  seriesOrder,
  playersByRegion,
}: {
  entry: DisplayActivity["hourly"][number];
  max: number;
  formatNumber: (value: number) => string;
  colors?: Record<string, string>;
  seriesOrder?: string[];
  playersByRegion?: Record<string, Array<{ playerId: number; name: string }>>;
}) {
  const tooltipId = useId();
  const seriesRank = new Map((seriesOrder ?? []).map((series, index) => [series, index]));
  const parts = Object.entries(entry.regions)
    .filter(([, value]) => value > 0)
    .sort((left, right) => (seriesRank.get(left[0]) ?? seriesRank.size)
      - (seriesRank.get(right[0]) ?? seriesRank.size));
  return <div className="relative h-3 min-w-0 rounded-full bg-pc-bg">
    <div className="flex h-full rounded-full" style={{ width: `${(entry.total / max) * 100}%` }}>
      {parts.map(([region, value], index) => <div
        key={region}
        data-activity-region={region}
        tabIndex={playersByRegion ? 0 : undefined}
        aria-describedby={`${tooltipId}-${region}`}
        className={`group h-full focus-visible:outline-2 focus-visible:outline-pc-accent ${playersByRegion ? "" : "relative"} ${
          index === 0 ? "rounded-l-full" : ""
        } ${index === parts.length - 1 ? "rounded-r-full" : ""}`}
        style={{ width: `${(value / entry.total) * 100}%`, backgroundColor: colors[region] ?? colors.Unknown ?? REGION_COLORS.Unknown }}
      >
        <div id={`${tooltipId}-${region}`} role="tooltip" className={`invisible absolute bottom-full z-30 rounded-md border border-pc-border bg-pc-bg-secondary px-2 py-1 font-mono text-xs font-semibold text-pc-text opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 motion-reduce:transition-none ${playersByRegion ? "left-0 w-[min(18rem,60vw)]" : "pointer-events-none left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap group-hover:-translate-y-0.5"}`}>
          {region} · {formatNumber(value)}
          {playersByRegion?.[region] && <ul tabIndex={0} className="mt-1 max-h-48 space-y-1 overflow-y-auto overscroll-contain border-t border-pc-border pt-1 font-sans font-normal">
            {playersByRegion[region].map(player => <li key={player.playerId} className="break-words">{player.name}</li>)}
          </ul>}
        </div>
      </div>)}
    </div>
  </div>;
}

function ChartHelp({ title, text }: { title: string; text: ReactNode }) {
  const { t } = useLocalization();
  const tooltipId = useId();
  return <span className="group relative inline-flex shrink-0">
    <button type="button" aria-label={t("common.about", { title })} aria-describedby={tooltipId} className="inline-flex cursor-help text-pc-text-muted hover:text-pc-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">
      <Info aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
    <span id={tooltipId} role="tooltip" className="pc-surface pointer-events-none absolute left-0 top-full z-20 mt-2 w-72 translate-y-1 rounded-lg border border-pc-border px-3 py-2 text-xs font-normal leading-5 text-pc-text opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none">{text}</span>
  </span>;
}

/**
 * Render activity title, queue selector and total; queue changes invoke the caller.
 * I/O: in `{ title: string, subtitle?: ReactNode, helpText?: ReactNode, queueLabel: string, allQueuesLabel: string, queues: Pick<MatchQueueActivity, "queueId" | "queueName">[], selectedQueue: "all" | number, onQueueChange: (queue: "all" | number) => void, total: number | null, formatNumber: (value: number) => string }` -> out `JSX.Element`.
 *
 * refs: none
 */
export function HourlyCardHeader({
  title,
  subtitle,
  helpText,
  queueLabel,
  allQueuesLabel,
  queues,
  selectedQueue,
  onQueueChange,
  total,
  formatNumber,
}: {
  title: string;
  subtitle?: ReactNode;
  helpText?: ReactNode;
  queueLabel: string;
  allQueuesLabel: string;
  queues: Pick<MatchQueueActivity, "queueId" | "queueName">[];
  selectedQueue: "all" | number;
  onQueueChange: (queue: "all" | number) => void;
  total: number | null;
  formatNumber: (value: number) => string;
}) {
  return <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-pc-border/50 pb-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
    <div className="col-span-2 min-w-0 sm:col-span-1">
      <div className="flex items-center gap-1">
        <h2 className="truncate text-sm font-bold text-pc-text">{title}</h2>
        {helpText && <ChartHelp title={title} text={helpText} />}
      </div>
      {subtitle && <div className="mt-0.5 truncate text-xs text-pc-text-muted">{subtitle}</div>}
    </div>
    <label className="flex shrink-0 items-center gap-2 text-xs text-pc-text-secondary">
      {queueLabel}
      <select value={selectedQueue} onChange={event => onQueueChange(event.target.value === "all" ? "all" : Number(event.target.value))} className="w-40 rounded-lg border border-pc-border bg-pc-bg px-2.5 py-1.5 text-xs text-pc-text">
        <option value="all">{allQueuesLabel}</option>
        {queues.map(queue => <option key={queue.queueId} value={queue.queueId}>{queue.queueName} ({queue.queueId})</option>)}
      </select>
    </label>
    {total !== null && <span className="text-right font-mono text-sm font-bold text-pc-accent">{formatNumber(total)}</span>}
  </div>;
}

function PlayerHourlyRegionCard({
  loading,
  stats,
  hourly,
  queues,
  selectedQueue,
  onQueueChange,
  breakdown,
  onBreakdownChange,
  regionOrder,
  regionStackOrder,
  title,
  helpText,
  regionModeLabel,
  platformModeLabel,
  queueLabel,
  allQueuesLabel,
  timeLabel,
  regionLabel,
  formatNumber,
  formatHour,
}: {
  loading: boolean;
  stats: PresenceHourlyStats | null;
  hourly: DisplayActivity["hourly"];
  queues: MatchQueueActivity[];
  selectedQueue: "all" | number;
  onQueueChange: (queue: "all" | number) => void;
  breakdown: "region" | "platform";
  onBreakdownChange: (breakdown: "region" | "platform") => void;
  regionOrder: string[];
  regionStackOrder: string[];
  title: string;
  helpText: string;
  regionModeLabel: string;
  platformModeLabel: string;
  queueLabel: string;
  allQueuesLabel: string;
  timeLabel: string;
  regionLabel: string;
  formatNumber: (value: number) => string;
  formatHour: (date: string, hour: number) => string;
}) {
  const regionRank = new Map(regionOrder.map((region, index) => [region, index]));
  const regions = [...(stats?.public_by_region ?? [])]
    .filter(row => row.players > 0)
    .sort((left, right) => (regionRank.get(left.region) ?? regionOrder.length)
      - (regionRank.get(right.region) ?? regionOrder.length)
      || right.players - left.players
      || left.region.localeCompare(right.region));
  const platforms = [...(stats?.public_by_platform ?? [])].filter(row => row.players > 0);
  const colors = breakdown === "region" ? REGION_COLORS : PLATFORM_COLORS;
  const seriesOrder = breakdown === "region"
    ? regionStackOrder
    : platforms.map(row => row.platform);
  const maxHourly = Math.max(...hourly.map(entry => entry.total), 1);
  return <section className="pc-card min-w-0 p-3 sm:p-4">
    <HourlyCardHeader
      title={title}
      helpText={helpText}
      subtitle={<span role="group" aria-label={title} className="inline-flex items-center gap-1 whitespace-nowrap tracking-tight">
        <button type="button" aria-pressed={breakdown === "region"} onClick={() => onBreakdownChange("region")} className={breakdown === "region" ? "font-semibold text-pc-accent" : "hover:text-pc-text"}>{regionModeLabel}</button>
        <span aria-hidden="true" className="text-pc-border">·</span>
        <button type="button" aria-pressed={breakdown === "platform"} onClick={() => onBreakdownChange("platform")} className={breakdown === "platform" ? "font-semibold text-pc-accent" : "hover:text-pc-text"}>{platformModeLabel}</button>
      </span>}
      queueLabel={queueLabel}
      allQueuesLabel={allQueuesLabel}
      queues={queues}
      selectedQueue={selectedQueue}
      onQueueChange={onQueueChange}
      total={!loading && stats ? stats.public_players : null}
      formatNumber={formatNumber}
    />
    {loading ? <LoadingPanel compact className="min-h-[30rem]" /> : !stats ? <div role="status" className="flex min-h-[30rem] items-center justify-center text-center text-sm text-pc-text-muted">—</div> : <div>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {breakdown === "region"
          ? regions.map(row => <span key={row.region} className="inline-flex items-center gap-1.5 text-xs text-pc-text-muted"><span className={`h-2 w-2 rounded-full ${colors[row.region] ?? colors.Unknown}`} />{row.region} · {formatNumber(row.players)}</span>)
          : platforms.map(row => <span key={row.platform} className="inline-flex items-center gap-1.5 text-xs text-pc-text-muted"><span className={`h-2 w-2 rounded-full ${colors[row.platform] ?? colors.Unknown}`} />{row.platform} · {formatNumber(row.players)}</span>)}
      </div>
      <ActivityChartStatement className="mb-3 text-center" />
      <div className="grid grid-cols-[3.5rem_1fr_2.5rem] gap-2 border-b border-pc-border/30 px-1 pb-1 text-center text-xs uppercase text-pc-text-muted">
        <span>{timeLabel}</span><span>{breakdown === "region" ? regionLabel : platformModeLabel}</span><span>Σ</span>
      </div>
      {hourly.map((entry, index) => {
        const current = index === hourly.length - 1;
        return <Fragment key={`${entry.date}|${entry.hour}`}>
          <div className={`grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2 rounded px-1 py-1 ${current ? "bg-pc-accent/8 ring-1 ring-pc-accent/20" : "hover:bg-pc-bg-secondary/50"}`}>
            <span suppressHydrationWarning className={`text-right font-mono text-xs ${current ? "font-semibold text-pc-accent" : "text-pc-text-muted"}`}>{formatHour(entry.date, entry.hour)}</span>
            <ActivityBar entry={entry} max={maxHourly} formatNumber={formatNumber} colors={colors} seriesOrder={seriesOrder} />
            <span className={`text-right font-mono text-xs font-semibold ${entry.total > 0 ? "text-pc-text" : "text-pc-text-muted/30"}`}>{entry.total || "-"}</span>
          </div>
          {index < hourly.length - 1 && <ActivityChartStatement className="px-1 py-0.5 text-center" />}
        </Fragment>;
      })}
      <ActivityChartStatement className="px-1 py-0.5 text-center" />
    </div>}
  </section>;
}

function WeeklyTrend({
  loading,
  days,
  title,
  subtitle,
  matchesLabel,
  playersLabel,
  formatNumber,
}: {
  loading: boolean;
  days: Array<{ date: string; displayTotal: number; displayPlayers: number }>;
  title: string;
  subtitle: string;
  matchesLabel: string;
  playersLabel: string;
  formatNumber: (value: number) => string;
}) {
  return <section className="pc-card min-w-0 p-3 sm:p-4">
    <div className="border-b border-pc-border/50 pb-3">
      <h2 className="text-sm font-bold text-pc-text">{title}</h2>
      <p className="mt-0.5 text-xs text-pc-text-muted">{subtitle}</p>
    </div>
    {loading ? <LoadingPanel compact className="min-h-[30rem]" /> : <div className="flex min-h-[30rem] flex-col lg:min-h-0 lg:flex-row lg:gap-6">
      {days.length > 0 ? <>
        <WeeklySeriesChart
          days={days}
          label={matchesLabel}
          getValue={day => day.displayTotal}
          formatNumber={formatNumber}
          tone="matches"
        />
        <div className="my-4 border-t border-pc-border/60 lg:my-0 lg:border-l lg:border-t-0" />
        <WeeklySeriesChart
          days={days}
          label={playersLabel}
          getValue={day => day.displayPlayers}
          formatNumber={formatNumber}
          tone="players"
        />
      </> : <div className="flex flex-1 items-center justify-center text-sm text-pc-text-muted">—</div>}
    </div>}
  </section>;
}

function WeeklySeriesChart({
  days,
  label,
  getValue,
  formatNumber,
  tone,
}: {
  days: Array<{ date: string; displayTotal: number; displayPlayers: number }>;
  label: string;
  getValue: (day: { date: string; displayTotal: number; displayPlayers: number }) => number;
  formatNumber: (value: number) => string;
  tone: "matches" | "players";
}) {
  const isPlayers = tone === "players";
  return <div className="flex min-h-0 flex-1 flex-col pt-4">
    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pc-text-muted">
      <span className={`h-2 w-2 rounded-full ${isPlayers ? "bg-violet-400" : "bg-pc-accent"}`} />
      {label}
    </div>
    <LineChartComponent
      data={days.map(day => ({
        day: new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
        [label]: getValue(day),
      }))}
      xKey="day"
      yKeys={[label]}
      height={190}
      colors={[isPlayers ? stationaryChartSeries.violet : stationaryChartSeries.sky]}
      showLegend={false}
      showTooltip={false}
      showValueLabels
      valueLabelFormatter={value => formatNumber(Number(value))}
    />
  </div>;
}

/**
 * Render the shared queue/platform/region layout; exact populations omit uncertainty controls.
 * I/O: in `{ presence: PresenceBreakdownStats, formatNumber: (value: number) => string, title: string, queueTitle: string, platformTitle: string, regionTitle: string, publicLabel: string, privateLabel: string, unresolvedLabel: string, unresolvedRangeLabel: string, possibleTotalLabel: string, coverageLabel: string, overlapNote: string, detailsLabel: string, exact?: boolean, showStatements?: boolean }` -> out `JSX.Element`.
 *
 * refs: none
 */
export function PlayerPresenceBreakdown({
  presence,
  formatNumber,
  title,
  queueTitle,
  platformTitle,
  regionTitle,
  publicLabel,
  privateLabel,
  unresolvedLabel,
  unresolvedRangeLabel,
  possibleTotalLabel,
  coverageLabel,
  overlapNote,
  detailsLabel,
  exact = false,
  showStatements: statementsOverride,
}: {
  presence: PresenceBreakdownStats;
  formatNumber: (value: number) => string;
  title: string;
  queueTitle: string;
  platformTitle: string;
  regionTitle: string;
  publicLabel: string;
  privateLabel: string;
  unresolvedLabel: string;
  unresolvedRangeLabel: string;
  possibleTotalLabel: string;
  coverageLabel: string;
  overlapNote: string;
  detailsLabel: string;
  exact?: boolean;
  showStatements?: boolean;
}) {
  const contextStatements = useContext(ActivityStatementContext);
  const showStatements = statementsOverride ?? contextStatements;
  const queues = presence.public_by_queue ?? [];
  const platforms = presence.public_by_platform ?? [];
  const regions = [...(presence.public_by_region ?? [])]
    .sort((left, right) => Number(right.players) - Number(left.players));
  const coverage = presence.profile_coverage;
  const maxQueue = Math.max(...queues.map(queue => Number(queue.players)), 1);
  const maxPlatform = Math.max(...platforms.map(platform => Number(platform.players)), 1);
  const maxRegion = Math.max(...regions.map(region => Number(region.players)), 1);
  const known = coverage?.platform_known ?? platforms
    .filter(row => row.platform !== "Unknown")
    .reduce((sum, row) => sum + Number(row.players), 0);
  const coverageTotal = coverage?.total ?? presence.public_players;
  const coveragePercent = coverageTotal > 0 ? Math.round((known / coverageTotal) * 100) : 0;
  // Frontend and backend containers roll independently during deployment.
  // Preserve the confirmed count while an older cached/API response briefly
  // lacks the new uncertainty fields.
  const unresolvedUpper = Number(presence.unresolved_player_slots_upper ?? 0);
  const playerLowerBound = Number(
    presence.public_players_lower_bound ?? presence.public_players,
  );
  const playerUpperBound = Number(
    presence.public_players_upper_bound ?? playerLowerBound + unresolvedUpper,
  );

  return <ActivityStatementContext.Provider value={showStatements}><section className="pc-card overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pc-border/50 p-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-pc-text-muted">{title}</div>
        <ActivityChartStatement className="mt-1" />
        <div className="mt-1 font-mono text-3xl font-bold text-pc-accent">{formatNumber(presence.public_players)}</div>
        <ActivityChartStatement className="mt-1" />
        <div className="text-xs text-pc-text-muted">{publicLabel}</div>
        {!exact && <div className="mt-2 text-xs text-pc-text-secondary">
          {possibleTotalLabel}:{" "}
          <span className="font-mono text-pc-text">
            {formatNumber(playerLowerBound)}
            {"–"}
            {formatNumber(playerUpperBound)}
          </span>
        </div>}
      </div>
      {!exact && <div className="flex flex-col items-end gap-3">
        <DetailLink href="/stats/activity/details" label={detailsLabel} />
        <div className="flex flex-wrap justify-end gap-2 text-xs">
          <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-violet-200">
            {privateLabel}: {formatNumber(presence.private_players ?? 0)}
          </span>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-amber-200">
            {unresolvedLabel}: {formatNumber(presence.unresolved_private_observations ?? 0)}
          </span>
          <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-rose-200">
            {unresolvedRangeLabel}: +0–{formatNumber(unresolvedUpper)}
          </span>
        </div>
      </div>}
    </div>
    <div className="grid grid-cols-1 divide-y divide-pc-border/50 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
      <div className="p-4">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-bold text-pc-text">{queueTitle}</h2>
          <ChartHelp title={queueTitle} text={overlapNote} />
        </div>
        <div className={`mt-3 ${showStatements ? "space-y-1" : "space-y-3"}`}>
          {queues.length > 0 && <ActivityChartStatement className="text-right" />}
          {queues.map((queue, index) => <Fragment key={queue.queue_id}>
            <MetricBar
              label={queue.queue_name}
              value={Number(queue.players)}
              max={maxQueue}
              detail={String(queue.queue_id)}
              formatNumber={formatNumber}
            />
            {index < queues.length - 1 && <ActivityChartStatement className="text-right" />}
          </Fragment>)}
          {queues.length > 0 && <ActivityChartStatement className="text-right" />}
          {queues.length === 0 && <span className="text-xs text-pc-text-muted">—</span>}
        </div>
      </div>
      <div id="platforms" className="scroll-mt-24 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-bold text-pc-text">{platformTitle}</h2>
          <span className="font-mono text-xs" style={{ color: getPercentageColor(coveragePercent) }}>{coverageLabel}: {coveragePercent}%</span>
        </div>
        <div className={`mt-4 ${showStatements ? "space-y-1" : "space-y-3"}`}>
          {platforms.length > 0 && <ActivityChartStatement className="text-right" />}
          {platforms.map((platform, index) => <Fragment key={platform.platform}>
            <MetricBar
              label={platform.platform}
              value={Number(platform.players)}
              max={maxPlatform}
              formatNumber={formatNumber}
              muted={platform.platform === "Unknown"}
            />
            {index < platforms.length - 1 && <ActivityChartStatement className="text-right" />}
          </Fragment>)}
          {platforms.length > 0 && <ActivityChartStatement className="text-right" />}
          {platforms.length === 0 && <span className="text-xs text-pc-text-muted">—</span>}
        </div>
        <div id="regions" className="mt-6 scroll-mt-24 border-t border-pc-border/50 pt-4">
          <h2 className="text-sm font-bold text-pc-text">{regionTitle}</h2>
          <div className={`mt-4 ${showStatements ? "space-y-1" : "space-y-3"}`}>
            {regions.length > 0 && <ActivityChartStatement className="text-right" />}
            {regions.map((region, index) => <Fragment key={region.region}>
              <MetricBar
                label={region.region}
                value={Number(region.players)}
                max={maxRegion}
                formatNumber={formatNumber}
                muted={region.region === "Unknown"}
              />
              {index < regions.length - 1 && <ActivityChartStatement className="text-right" />}
            </Fragment>)}
            {regions.length > 0 && <ActivityChartStatement className="text-right" />}
            {regions.length === 0 && <span className="text-xs text-pc-text-muted">—</span>}
          </div>
        </div>
      </div>
    </div>
  </section></ActivityStatementContext.Provider>;
}

function ActivityChartStatement({ className = "" }: { className?: string }) {
  const showStatements = useContext(ActivityStatementContext);
  if (!showStatements) return null;
  return <p className={`overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold leading-none text-[var(--pc-status-live)] ${className}`}>
    {PALADINS_2_STATEMENT}
  </p>;
}

function MetricBar({
  label,
  value,
  max,
  detail,
  formatNumber,
  muted = false,
}: {
  label: string;
  value: number;
  max: number;
  detail?: string;
  formatNumber: (value: number) => string;
  muted?: boolean;
}) {
  return <div>
    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
      <span className="truncate font-medium text-pc-text">{label}</span>
      <span className="shrink-0 font-mono text-pc-text-secondary">{formatNumber(value)} {detail && <span className="text-pc-text-muted">#{detail}</span>}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-pc-bg">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${muted ? "bg-slate-500" : "bg-pc-accent"}`}
        style={{ width: `${Math.max(value > 0 ? 2 : 0, (value / max) * 100)}%` }}
      />
    </div>
  </div>;
}
