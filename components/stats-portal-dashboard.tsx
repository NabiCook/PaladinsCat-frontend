/**
 * Live data previews for the global statistics directory.
 *
 * refs: none
 */
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { matchMapImagePath } from "@/lib/map-images";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";
import { type ChampionMatchupPreviews } from "@/lib/champion-matchups-api";
import { fetchStatsPortalPreview } from "@/lib/stats-portal-api";
import { PerformanceOverviewCard } from "@/components/PerformanceOverviewCard";
import {
  type MatchHourlyStats,
  type SkinStat,
  type StatsPageData,
} from "@/lib/api-client";
import { stationaryChartSeries } from "@/lib/chart-colors";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { useAuth } from "@/lib/auth-context";
import { useLobbyTier } from "@/lib/lobby-tier-context";
import { useLocalization } from "@/lib/localization-context";
import { verifiedDestination } from "@/lib/verified-access";
import { getRankIconPath } from "@/lib/tier-utils";
import { getPercentageColor } from "@/lib/stat-quality";
import { ArrowRight } from "lucide-react";

type Accent = "cyan" | "violet" | "amber" | "emerald" | "sky";

function DashboardCard({
  href,
  title,
  accent,
  className = "",
  children,
}: {
  href: string;
  title: string;
  accent: Accent;
  className?: string;
  children: ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const gatedHref = verifiedDestination(href, user, isLoading);

  return (
    <Link
      href={gatedHref ?? href}
      prefetch={false}
      aria-disabled={isLoading}
      onClick={isLoading ? (event) => event.preventDefault() : undefined}
      data-card-accent={accent}
      className={`pc-card pc-home-feature-card group flex min-h-56 min-w-0 flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pc-accent ${className}`}
    >
      <div className="mb-5 flex items-center gap-3">
        <h2 className="min-w-0 flex-1 text-lg font-bold text-pc-text">{title}</h2>
        <span aria-hidden="true" className="text-lg leading-none text-pc-text-muted transition-colors group-hover:text-pc-accent"><ArrowRight aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></span>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </Link>
  );
}

function LoadingPreview() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col justify-end gap-3">
      <span className="pc-skeleton h-8 w-2/5 rounded" />
      <span className="pc-skeleton h-3 w-full rounded" />
      <span className="pc-skeleton h-3 w-4/5 rounded" />
      <span className="pc-skeleton h-3 w-3/5 rounded" />
    </div>
  );
}

function EmptyPreview() {
  const { t } = useLocalization();
  return <div className="flex flex-1 items-center text-sm text-pc-text-muted">{t("stats.portal.previewUnavailable")}</div>;
}

function TrendSparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const gradientId = `stats-trend-${useId().replace(/:/g, "")}`;
  if (values.length < 2) {
    return <div className="mt-3 h-14 rounded-md border border-pc-border/40 bg-pc-bg/25" />;
  }
  const width = 240;
  const height = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => ({
    x: index / (values.length - 1) * width,
    y: height - 4 - ((value - min) / range) * (height - 10),
  }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `M 0 ${height} L ${points.map(({ x, y }) => `${x} ${y}`).join(" L ")} L ${width} ${height} Z`;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mt-3 h-14 w-full overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--pc-border)" strokeOpacity="0.55" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points.at(-1)?.x} cy={points.at(-1)?.y} r="3" fill={color} />
    </svg>
  );
}

/**
 * Render a compact dashboard whose cards preview their destination's live data.
 * I/O: in () -> out `JSX.Element`.
 *
 * refs: none
 */
export default function StatsPortalDashboard() {
  return <StatsPortalContent />;
}

/** Aggregate previews are public; destination links still enforce account access. */
function StatsPortalContent() {
  const { t, formatNumber, formatPercent } = useLocalization();
  const { definition: lobbyTier, ready: lobbyTierReady } = useLobbyTier();
  const [data, setData] = useState<StatsPageData | null>(null);
  const [activity, setActivity] = useState<MatchHourlyStats | null>(null);
  const [presence, setPresence] = useState<{ public_players: number } | null>(null);
  const [presenceHourly, setPresenceHourly] = useState<{ hourly_by_region: Array<{ date: string; hour: number; total: number }> } | null>(null);
  const [matchupData, setMatchupData] = useState<ChampionMatchupPreviews | null>(null);
  const [highestWinRateSkins, setHighestWinRateSkins] = useState<SkinStat[]>([]);
  const [loadoutChampions, setLoadoutChampions] = useState<Array<{ championId: number; championName: string; totalPlays: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lobbyTierReady) return;
    let cancelled = false;
    const controller = new AbortController();
    fetchStatsPortalPreview({ tierMin: lobbyTier.tierMin, tierMax: lobbyTier.tierMax }, controller.signal).then((preview) => {
      if (cancelled) return;
      setData(preview.data);
      setActivity(preview.activity);
      setPresence(preview?.presence ?? null);
      setPresenceHourly(preview?.presenceHourly ?? null);
      setMatchupData(preview?.matchups ?? null);
      setHighestWinRateSkins(preview?.skins ?? []);
      setLoadoutChampions(preview?.loadoutChampions ?? []);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setData(null);
      setActivity(null);
      setPresence(null);
      setPresenceHourly(null);
      setMatchupData(null);
      setHighestWinRateSkins([]);
      setLoadoutChampions([]);
      setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [lobbyTierReady, lobbyTier.tierMax, lobbyTier.tierMin]);

  const skins = data?.skinSort === "plays" ? data.skins.slice(0, 5) : [];
  const skinColumns = [
    { label: t("common.sort.totalPlays"), rows: skins, value: (skin: SkinStat) => formatNumber(skin.totalPlays), winRate: false },
    { label: t("skins.sortWinRate"), rows: highestWinRateSkins, value: (skin: SkinStat) => formatPercent(skin.winRate), winRate: true },
  ].filter((column) => column.rows.length > 0);
  const purchasedItems = useMemo(() => [...(data?.overview.items ?? [])]
    .sort((a, b) => b.totalUsage - a.totalUsage)
    .slice(0, 3), [data]);
  const highestWinRateItems = useMemo(() => [...(data?.overview.items ?? [])]
    .filter((item) => item.totalUsage > 0)
    .sort((a, b) => b.winRate - a.winRate || b.totalUsage - a.totalUsage)
    .slice(0, 3), [data]);
  const matchupRows = useMemo(() => {
    const seen = new Set<string>();
    return (matchupData?.champions ?? []).flatMap(champion => [...champion.strong, ...champion.weak].map(opponent => ({
      ...opponent, championId: champion.championId,
      championName: STATIC_CHAMPIONS.find(row => row.id === champion.championId)?.name ?? "",
    }))).filter(row => row.championName && row.encounters > 0)
      .sort((a,b) => b.encounters-a.encounters)
      .filter(row => { const key=[row.championId,row.opponentChampionId].sort((a,b)=>a-b).join(":"); if(seen.has(key)) return false; seen.add(key); return true; }).slice(0,5);
  }, [matchupData]);
  const metrics = [
    { label: t("common.metrics.dpm"), key: "dpm", color: "text-red-400" },
    { label: t("common.metrics.wpm"), key: "wpm", color: "text-orange-400" },
    { label: t("common.metrics.apm"), key: "apm", color: "text-fuchsia-400" },
    { label: t("common.metrics.hpm"), key: "hpm", color: "text-emerald-400" },
    { label: t("common.metrics.shpm"), key: "shpm", color: "text-teal-400" },
    { label: t("common.metrics.ecpm"), key: "egpm", color: "text-yellow-400" },
    { label: t("common.metrics.spm"), key: "spm", color: "text-blue-400" },
    { label: t("common.metrics.kda"), key: "kda", color: "text-violet-400" },
    { label: t("common.metrics.kpm"), key: "kpm", color: "text-cyan-400" },
    { label: t("common.metrics.deathsPerMinute"), key: "deaths_per_minute", color: "text-rose-400" },
  ].map(metric => ({ ...metric, summary: data?.overview.metrics[metric.key as keyof typeof data.overview.metrics], decimals: ["kda","kpm","deaths_per_minute"].includes(metric.key) ? 2 : 0 }));
  const baselineOrder = ["Global", "Damage", "Flank", "Support", "Frontline"];
  const baselines = [...(data?.baselines ?? [])]
    .filter((row) => row.avgEcpm > 0)
    .sort((a, b) => baselineOrder.indexOf(a.role) - baselineOrder.indexOf(b.role))
    .slice(0, 5);
  const ecpmMetrics = baselines.map((row) => ({
    key: `egpm-${row.role}`,
    label: row.role === "Frontline" ? t("common.roles.frontlineShort")
      : row.role === "Support" ? t("common.roles.supportShort")
      : row.role === "Damage" ? t("common.roles.damageShort")
      : row.role === "Global" ? t("common.roles.global")
      : t("common.roles.flank"),
    color: row.role === "Global" ? "var(--pc-chart-amber)"
      : row.role === "Damage" ? "var(--pc-chart-red)"
      : row.role === "Flank" ? "var(--pc-role-flank)"
      : row.role === "Support" ? "var(--pc-chart-green)"
      : "var(--pc-chart-sky)",
    p10: row.p10Ecpm,
    p25: row.p25Ecpm,
    mean: row.avgEcpm,
    p75: row.p75Ecpm,
    p90: row.p90Ecpm,
  }));
  const tierRows = data?.overview.profileTiers ?? [];
  const tierTotal = tierRows.reduce((sum, tier) => sum + tier.totalPlays, 0);
  const majorTiers = [
    { key: "bronze", label: t("common.tiers.bronze"), min: 1, max: 5, iconTier: 5 },
    { key: "silver", label: t("common.tiers.silver"), min: 6, max: 10, iconTier: 10 },
    { key: "gold", label: t("common.tiers.gold"), min: 11, max: 15, iconTier: 15 },
    { key: "platinum", label: t("common.tiers.platinum"), min: 16, max: 20, iconTier: 20 },
    { key: "diamond", label: t("common.tiers.diamond"), min: 21, max: 25, iconTier: 25 },
    { key: "master", label: t("common.tiers.master"), min: 26, max: 26, iconTier: 26 },
    { key: "grandmaster", label: t("common.tiers.grandmaster"), min: 27, max: 27, iconTier: 27 },
  ].map((rank) => ({
    ...rank,
    totalPlays: tierRows
      .filter((tier) => tier.tierSort >= rank.min && tier.tierSort <= rank.max)
      .reduce((sum, tier) => sum + tier.totalPlays, 0),
  }));
  const activityTotal = activity?.allQueuesTotal24h ?? activity?.totalToday ?? 0;
  const playerTotal = presence?.public_players ?? 0;
  const matchTrend = useMemo(() => {
    if (activity?.queues?.length) {
      const hourly = new Map<string, number>();
      for (const queue of activity.queues) {
        for (const row of queue.hourly) {
          const key = `${row.date}|${String(row.hour).padStart(2, "0")}`;
          hourly.set(key, (hourly.get(key) ?? 0) + row.total);
        }
      }
      return [...hourly.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-24).map(([, total]) => total);
    }
    return (activity?.hourly ?? []).slice(-24).map((row) => row.total);
  }, [activity]);
  const playerTrend = useMemo(() => (presenceHourly?.hourly_by_region ?? [])
    .slice(-24)
    .map((row) => row.total), [presenceHourly]);

  return (
    <div className="space-y-5" aria-busy={loading}>
      <section aria-label={t("stats.portal.gameMetrics")} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <DashboardCard href="/stats/performance" title={t("generated.stats.performanceMetrics")} accent="cyan" className="lg:col-span-7">
          {loading ? <LoadingPreview /> : !data ? <EmptyPreview /> : (
            <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
              {metrics.map(({ label, summary, color, decimals }) => (
                <div key={label} className="flex min-w-0 flex-col justify-center">
                  <span className="text-xs font-semibold text-pc-text-muted">{label}</span>
                  <span className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
                    {summary?.sampleSize ? formatNumber(summary.mean, { maximumFractionDigits: decimals }) : "—"}
                  </span>
                  <span className="mt-2 text-xs tabular-nums text-pc-text-muted">{t("generated.champions.p10")} {summary?.sampleSize ? formatNumber(summary.p10, {maximumFractionDigits: decimals}) : "—"}</span>
                  <span className="text-xs tabular-nums text-pc-text-muted">{t("generated.champions.p90")} {summary?.sampleSize ? formatNumber(summary.p90, {maximumFractionDigits: decimals}) : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard href="/stats/champions" title={t("stats.matchups.title")} accent="violet" className="lg:col-span-5">
          {loading ? <LoadingPreview /> : matchupRows.length === 0 ? <EmptyPreview /> : (
            <div className="space-y-4">
              {matchupRows.map(row => <div key={`${row.championId}:${row.opponentChampionId}`} className="flex min-w-0 items-center gap-2 text-sm">
                <Image src={getChampionIconSafe(row.championName)} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1 truncate">{t("stats.matchups.pair", { champion: row.championName, opponent: row.opponentChampionName })}</span>
                <Image src={getChampionIconSafe(row.opponentChampionName)} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
                <div className="text-right tabular-nums">
                  <div className="font-semibold text-pc-accent">{formatPercent(row.wins / row.encounters * 100)}</div>
                  <div className="text-xs text-pc-text-muted">{formatNumber(row.encounters)}</div>
                </div>
              </div>)}
            </div>
          )}
        </DashboardCard>

      </section>

      <section aria-label={t("nav.game")} className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard href="/stats/items" title={t("menu.items")} accent="amber">
          {loading ? <LoadingPreview /> : purchasedItems.length === 0 ? <EmptyPreview /> : <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold text-pc-text-muted">{t("generated.matches.purchasedItems")}</div>
              <div className="grid grid-cols-3 gap-2">
                {purchasedItems.map(item => <div key={`usage:${item.itemId}`} className="flex min-w-0 items-center gap-2">
                  <Image src={`/images/items/${item.itemName.replace(/\s+/g, "_")}_Icon.avif`} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded object-contain" />
                  <div className="min-w-0"><div className="truncate text-xs font-semibold text-pc-text">{item.itemName}</div><div className="text-xs tabular-nums text-pc-accent">{formatNumber(item.totalUsage)}</div></div>
                </div>)}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-pc-text-muted">{t("skins.sortWinRate")}</div>
              <div className="grid grid-cols-3 gap-2">
                {highestWinRateItems.map(item => <div key={`win-rate:${item.itemId}`} className="flex min-w-0 items-center gap-2">
                  <Image src={`/images/items/${item.itemName.replace(/\s+/g, "_")}_Icon.avif`} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded object-contain" />
                  <div className="min-w-0"><div className="truncate text-xs font-semibold text-pc-text">{item.itemName}</div><div className="text-xs font-semibold tabular-nums" style={{ color: getPercentageColor(item.winRate) }}>{formatPercent(item.winRate)}</div></div>
                </div>)}
              </div>
            </div>
          </div>}
        </DashboardCard>
        <DashboardCard href="/stats/maps" title={t("menu.maps")} accent="sky">
          {loading ? <LoadingPreview /> : !data?.overview.maps.length ? <EmptyPreview /> : <div className="space-y-4">
            {[...data.overview.maps].sort((a,b)=>b.totalMatches-a.totalMatches).slice(0,3).map(map => <div key={map.name} className="flex min-w-0 items-center gap-3">
              <Image src={matchMapImagePath(map.name)} alt="" width={64} height={36} className="h-9 w-16 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{map.name}</span>
              <span className="text-sm tabular-nums text-pc-accent">{formatNumber(map.totalMatches)}</span>
            </div>)}
          </div>}
        </DashboardCard>
        <DashboardCard href="/stats/compositions" title={t("menu.teamCompositions")} accent="emerald">
          {loading ? <LoadingPreview /> : !data?.compositions.length ? <EmptyPreview /> : <div className="space-y-3">
            {[...data.compositions].sort((a,b)=>b.totalMatches-a.totalMatches).slice(0,5).map(comp => <div key={comp.composition} className="flex items-center justify-between gap-3">
              <div className="flex gap-3">{([
                ["frontline", "Class_Front_Line_Icon"], ["damage", "Class_Damage_Icon"], ["flank", "Class_Flank_Icon"], ["support", "Class_Support_Icon"],
              ] as const).map(([role,icon]) => <span key={role} className="inline-flex items-center gap-1 text-sm tabular-nums">
                <Image src={`/images/icons/${icon}.avif`} alt={t(`common.roles.${role}`)} width={20} height={20} className="h-5 w-5 object-contain" />{comp[role]}
              </span>)}</div>
              <span className="text-sm tabular-nums text-pc-accent">{formatNumber(comp.totalMatches)}</span>
            </div>)}
          </div>}
        </DashboardCard>
        <DashboardCard href="/stats/loadouts" title={t("stats.loadouts.title")} accent="violet">
          {loading ? <LoadingPreview /> : loadoutChampions.length === 0 ? <EmptyPreview /> : <div className="space-y-3">
            {loadoutChampions.map((champion) => <div key={champion.championId} className="flex min-w-0 items-center gap-3">
              <Image src={getChampionIconSafe(champion.championName)} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-pc-text">{champion.championName}</span>
              <span className="text-sm tabular-nums text-pc-accent">{formatNumber(champion.totalPlays)}</span>
            </div>)}
          </div>}
        </DashboardCard>
      </section>

      <section aria-label={t("stats.portal.activity")} className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DashboardCard href="/stats/skins" title={t("menu.skinStats")} accent="violet">
          {loading ? <LoadingPreview /> : skinColumns.length === 0 ? <EmptyPreview /> : (
            <div className={`grid flex-1 gap-5 ${skinColumns.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {skinColumns.map((column, columnIndex) => <div key={column.label} className={columnIndex ? "border-t border-pc-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0" : ""}>
                <div className="mb-3 text-xs font-semibold text-pc-text-muted">{column.label}</div>
                <div className="space-y-3">
                  {column.rows.map(skin => <div key={`${column.label}:${skin.championId}:${skin.skinId}`} className="flex min-w-0 items-center gap-2">
                    <Image src={getChampionIconSafe(skin.championName)} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-contain" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-pc-text">{skin.skinName}</div>
                      <div className="truncate text-xs text-pc-text-muted">{skin.championName}</div>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${column.winRate ? "" : "text-pc-accent"}`} style={column.winRate ? { color: getPercentageColor(skin.winRate) } : undefined}>{column.value(skin)}</span>
                  </div>
                  )}
                </div>
              </div>)}
            </div>
          )}
        </DashboardCard>

        <DashboardCard href="/stats/ecpm" title={t("menu.effectiveCredits")} accent="amber">
          {loading ? <LoadingPreview /> : baselines.length === 0 ? <EmptyPreview /> : (
            <PerformanceOverviewCard metrics={ecpmMetrics} />
          )}
        </DashboardCard>

        <DashboardCard href="/stats/tiers" title={t("stats.tiers.title")} accent="emerald" className="md:col-span-2">
          {loading ? <LoadingPreview /> : tierTotal === 0 ? <EmptyPreview /> : (
            <div className="flex flex-1 items-center gap-5 overflow-x-auto pb-2">
              {majorTiers.map(tier => <div key={tier.key} className="flex min-w-24 flex-1 flex-col items-center gap-2 text-center">
                <Image src={getRankIconPath(tier.iconTier, tier.iconTier === 26 ? 101 : tier.iconTier === 27 ? 1 : 0)} alt="" width={48} height={48} className="h-12 w-12 object-contain" />
                <span className="text-xs font-semibold text-pc-text-secondary">{tier.label}</span>
                <span className="text-xl font-bold tabular-nums text-pc-text">{formatNumber(tier.totalPlays)}</span>
                <span className="text-xs text-pc-text-muted">{t("stats.tiers.players")} · {formatPercent(tier.totalPlays / tierTotal * 100)}</span>
              </div>)}
            </div>
          )}
        </DashboardCard>

        <DashboardCard href="/stats/activity" title={t("menu.playerActivity")} accent="sky" className="md:col-span-2">
          {loading ? <LoadingPreview /> : !activity && !presence ? <EmptyPreview /> : (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="min-w-0">
                  <div className="text-2xl font-bold tabular-nums text-pc-text">{activity ? formatNumber(activityTotal) : "—"}</div>
                  <div className="mt-1 text-xs leading-tight text-pc-text-muted">{t("playerActivity.trackedMatches24h")}</div>
                  <TrendSparkline values={matchTrend} color={stationaryChartSeries.sky} label={t("playerActivity.trackedMatches24h")} />
                </div>
                <div className="min-w-0 border-t border-pc-border pt-5 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                  <div className="text-2xl font-bold tabular-nums text-pc-text">{presence ? formatNumber(playerTotal) : "—"}</div>
                  <div className="mt-1 text-xs leading-tight text-pc-text-muted">{t("playerActivity.publicPlayers24h")}</div>
                  <TrendSparkline values={playerTrend} color={stationaryChartSeries.violet} label={t("playerActivity.publicPlayers24h")} />
                </div>
              </div>
            </>
          )}
        </DashboardCard>
      </section>
    </div>
  );
}
