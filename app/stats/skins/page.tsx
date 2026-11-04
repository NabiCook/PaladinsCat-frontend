/**
 * Render /stats/skins using `LoadingIndicator`.
 * refs: none
 */
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  fetchBrokenSkinStats,
  fetchChampions,
  fetchSkinStats,
  type BrokenSkinStat,
  type Champion,
  type PublicStatsScope,
  type SkinStat,
} from "@/lib/api-client";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { championSlug } from "@/lib/utils";
import { getPercentageColor } from "@/lib/stat-quality";
import { useLobbyTier } from "@/lib/lobby-tier-context";
import { LoadingIndicator } from "@/components/async-state";
import { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import { useLocalization } from "@/lib/localization-context";
import { useRouteSettledLoading } from "@/lib/route-transition-context";


const ROLES = [
  { value: "Frontline", labelKey: "common.roles.frontline", icon: "/images/icons/Class_Front_Line_Icon.avif" },
  { value: "Damage", labelKey: "common.roles.damage", icon: "/images/icons/Class_Damage_Icon.avif" },
  { value: "Flank", labelKey: "common.roles.flank", icon: "/images/icons/Class_Flank_Icon.avif" },
  { value: "Support", labelKey: "common.roles.support", icon: "/images/icons/Class_Support_Icon.avif" },
] as const;

const STAT_SCOPES = [
  { value: "ranked", labelKey: "stats.scope.ranked" },
  { value: "casual", labelKey: "stats.scope.casual" },
  { value: "team_deathmatch", labelKey: "stats.scope.teamDeathmatch" },
  { value: "arcade", labelKey: "stats.scope.arcade" },
  { value: "wave_defense", labelKey: "stats.scope.waveDefense" },
  { value: "experiment", labelKey: "stats.scope.experiment" },
  { value: "newcomer", labelKey: "stats.scope.newcomer" },
  { value: "bot", labelKey: "stats.scope.bot" },
] as const;

type SkinSort = "class" | "champion" | "plays" | "winRate";
const PAGE_SIZES = [10, 25, 50, 100] as const;

function championRole(champions: Champion[], championId: number): string {
  return champions.find((champion) => champion.id === championId)?.roles?.[0] ?? "";
}

/**
 * Render /stats/skins using `LoadingIndicator`.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function SkinStatsPage() {
  const { t, formatNumber, formatPercent, formatRecord } = useLocalization();
  const searchParams = useSearchParams();
  const initialChampion = Number(searchParams.get("champion") ?? 0) || 0;
  const [champions, setChampions] = useState<Champion[]>([]);
  const [rows, setRows] = useState<SkinStat[]>([]);
  const [brokenRows, setBrokenRows] = useState<BrokenSkinStat[]>([]);
  const [championId, setChampionId] = useState(initialChampion);
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SkinSort>("plays");
  const [search, setSearch] = useState("");
  const [page, setPage] = usePersistentDirectoryPage();
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [statsScope, setStatsScope] = useState<PublicStatsScope>("ranked");
  const [loading, setLoading] = useState(true);
  const displayLoading = useRouteSettledLoading(loading);
  const { definition: lobbyTier, ready: lobbyTierReady } = useLobbyTier();

  useEffect(() => { fetchChampions({ limit: "200" }).then(setChampions).catch(() => setChampions([])); }, []);
  useEffect(() => {
    let cancelled = false;
    if (!lobbyTierReady) return;
    setLoading(true);
    const rankedTier = statsScope === "ranked"
      ? { tierMin: lobbyTier.tierMin, tierMax: lobbyTier.tierMax }
      : {};
    Promise.all([
      fetchSkinStats({ championId: championId || undefined, ...rankedTier, limit: 200, scope: statsScope }),
      fetchBrokenSkinStats({ championId: championId || undefined, ...rankedTier, scope: statsScope }),
    ])
      .then(([skinData, brokenData]) => {
        if (cancelled) return;
        setRows(skinData);
        setBrokenRows(brokenData);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setBrokenRows([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [championId, lobbyTier.tierMin, lobbyTier.tierMax, lobbyTierReady, statsScope]);

  const visibleRows = useMemo(() => rows
    .filter((row) => {
      const value = `${row.skinName} ${row.championName}`.toLowerCase();
      const matchesSearch = value.includes(search.trim().toLowerCase());
      const matchesRole = !filterRole || championRole(champions, row.championId) === filterRole;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      if (sortBy === "plays") return b.totalPlays - a.totalPlays;
      if (sortBy === "winRate") return b.winRate - a.winRate;
      if (sortBy === "champion") return a.championName.localeCompare(b.championName) || a.skinName.localeCompare(b.skinName);
      return championRole(champions, a.championId).localeCompare(championRole(champions, b.championId))
        || a.championName.localeCompare(b.championName)
        || a.skinName.localeCompare(b.skinName);
    }), [champions, filterRole, rows, search, sortBy]);

  const visibleBrokenRows = useMemo(() => brokenRows.filter((row) => (
    !filterRole || championRole(champions, row.championId) === filterRole
  )), [brokenRows, champions, filterRole]);
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = visibleRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, visibleRows.length);
  const pagedRows = useMemo(
    () => visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, visibleRows],
  );

  useEffect(() => {
    setPage(1);
  }, [championId, filterRole, pageSize, search, sortBy, statsScope]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/champions" className="mb-2 inline-block text-xs text-pc-accent hover:underline">{t("generated.champions.champions")}</Link>
          <h1 className="pc-heading pc-heading-lg">{t("generated.stats.skinStats")}</h1>
          <p className="mt-1 text-sm text-pc-text-secondary">{t("menu.skinStatsDescription")}</p>
        </div>
        <select
          value={statsScope}
          onChange={(event) => {
            setLoading(true);
            setStatsScope(event.target.value as PublicStatsScope);
          }}
          className="pc-select w-44 shrink-0"
          aria-label={t("stats.scope.label")}
        >
          {STAT_SCOPES.map((scope) => <option key={scope.value} value={scope.value}>{t(scope.labelKey)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-pc-border bg-pc-bg-elevated p-3 md:grid-cols-3">
        <label className="text-xs text-pc-text-secondary">{t("generated.stats.champion")}<select value={championId} onChange={(event) => setChampionId(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-pc-border bg-pc-bg-secondary px-3 py-2 text-sm text-pc-text"><option value={0}>{t("generated.stats.allChampions")}</option>{champions.map((champion) => <option key={champion.id} value={champion.id}>{champion.name}</option>)}</select></label>
        <label className="text-xs text-pc-text-secondary">{t("generated.stats.searchSkins")}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("generated.stats.skinOrChampion")} className="mt-1.5 w-full rounded-lg border border-pc-border bg-pc-bg-secondary px-3 py-2 text-sm text-pc-text placeholder:text-pc-text-muted" /></label>
        <label className="text-xs text-pc-text-secondary">{t("skins.sortBy")}<select value={sortBy} onChange={(event) => setSortBy(event.target.value as SkinSort)} className="mt-1.5 w-full rounded-lg border border-pc-border bg-pc-bg-secondary px-3 py-2 text-sm text-pc-text"><option value="class">{t("skins.sortClass")}</option><option value="champion">{t("skins.sortChampion")}</option><option value="plays">{t("skins.sortPlays")}</option><option value="winRate">{t("skins.sortWinRate")}</option></select></label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilterRole(null)} className={`pc-touch-target rounded-lg px-3 py-2 text-sm font-medium transition-colors ${filterRole === null ? "bg-pc-accent text-pc-bg" : "pc-surface text-pc-muted hover:text-pc-text"}`}>{t("skins.allClasses")}</button>
        {ROLES.map((role) => <button key={role.value} onClick={() => setFilterRole(filterRole === role.value ? null : role.value)} className={`pc-touch-target flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${filterRole === role.value ? "bg-pc-accent text-pc-bg" : "pc-surface text-pc-muted hover:text-pc-text"}`}><img src={role.icon} alt="" className="h-5 w-5" />{t(role.labelKey)}</button>)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(16rem,0.65fr)_minmax(0,2fr)]">
        <section className="min-w-0 xl:self-start">
          <div className="mb-3 xl:min-h-14"><h2 className="text-sm font-bold text-pc-text">{t("skins.brokenTitle")}</h2><p className="text-xs text-pc-text-muted">{t("skins.brokenDescription")}</p></div>
          <div className="flex overflow-hidden rounded-xl border border-pc-border bg-pc-bg-elevated">
            {displayLoading ? <div className="flex min-h-48 flex-1 items-center justify-center p-8 text-center"><LoadingIndicator /></div> : visibleBrokenRows.length === 0 ? <div className="flex flex-1 items-center p-6 text-sm text-pc-text-muted">{t("generated.stats.noBrokenSkinData")}</div> : <div className="min-w-0 flex-1 divide-y divide-pc-border/50">{visibleBrokenRows.map((skin) => <Link key={`${skin.championId}-${skin.skinId}`} href={`/champions/${championSlug(skin.championName)}?scope=${encodeURIComponent(statsScope)}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-pc-bg-secondary/60"><img src={getChampionIconSafe(skin.championName)} alt="" className="h-8 w-8 rounded object-contain" /><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-pc-text">{skin.skinName}</div><div className="text-xs text-pc-text-muted">{skin.championName} · {formatNumber(skin.totalPlays)} {t("generated.stats.plays.0effba4")}</div></div><div className="text-right"><div className="text-xs font-bold" style={{ color: getPercentageColor(skin.usageShare) }}>{formatPercent(skin.usageShare)}</div><div className="text-xs" style={{ color: getPercentageColor(skin.winRate) }}>{t("generated.stats.wr")} {formatPercent(skin.winRate)}</div></div></Link>)}</div>}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 xl:min-h-14"><h2 className="text-sm font-bold text-pc-text">{t("skins.fullTitle")}</h2><p className="text-xs text-pc-text-muted">{t("skins.fullDescription")}</p></div>
      <div className="space-y-2 md:hidden">
        {pagedRows.map((row) => <Link key={`${row.championId}-${row.skinId}`} href={`/champions/${championSlug(row.championName)}?scope=${encodeURIComponent(statsScope)}`} className="pc-mobile-panel flex min-w-0 items-center gap-3 p-3">
          <img src={getChampionIconSafe(row.championName)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-pc-text">{row.skinName}</div><div className="text-xs text-pc-text-muted">{row.championName} {t("generated.stats.id")}{" "}{row.skinId}</div><div className="mt-1 text-xs text-pc-text-secondary">{formatNumber(row.totalPlays)} {t("generated.stats.plays.25857f6")}{" "}{formatRecord(row.wins, row.losses)}</div></div>
          <span className="shrink-0 font-bold" style={{ color: getPercentageColor(row.winRate) }}>{formatPercent(row.winRate)}</span>
        </Link>)}
        {!displayLoading && visibleRows.length === 0 && <div className="pc-mobile-panel p-6 text-center text-sm text-pc-text-muted">{t("generated.stats.noSkinStatisticsMatchTheseFilters")}</div>}
        {displayLoading && <div className="pc-mobile-panel min-h-48 p-6 text-center"><LoadingIndicator /></div>}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-pc-border bg-pc-bg-elevated md:block">
        <table className="w-full min-w-[680px] text-sm"><thead className="border-b border-pc-border bg-pc-bg-elevated text-left text-xs text-pc-text-muted"><tr><th className="px-3 py-2.5">{t("generated.stats.skin")}</th><th className="px-3 py-2.5">{t("generated.stats.champion")}</th><th className="px-3 py-2.5 text-right">{t("generated.stats.plays")}</th><th className="px-3 py-2.5 text-right">{t("generated.stats.wL")}</th><th className="px-3 py-2.5 text-right">{t("generated.stats.winRate.49a3838")}</th></tr></thead><tbody>
          {pagedRows.map((row) => <tr key={`${row.championId}-${row.skinId}`} className="border-b border-pc-border/50 transition-colors hover:bg-pc-bg-secondary/60"><td className="px-3 py-2"><div className="font-medium text-pc-text">{row.skinName}</div><div className="text-xs text-pc-text-muted">{t("generated.stats.id.89f89c0")}{" "}{row.skinId}</div></td><td className="px-3 py-2"><Link href={`/champions/${championSlug(row.championName)}?scope=${encodeURIComponent(statsScope)}`} className="flex items-center gap-2 text-pc-text-secondary hover:text-pc-accent"><img src={getChampionIconSafe(row.championName)} alt="" className="h-6 w-6 rounded object-contain" />{row.championName}</Link></td><td className="px-3 py-2 text-right text-pc-text">{formatNumber(row.totalPlays)}</td><td className="px-3 py-2 text-right text-pc-text-secondary">{formatNumber(row.wins)} / {formatNumber(row.losses)}</td><td className="px-3 py-2 text-right font-semibold" style={{ color: getPercentageColor(row.winRate) }}>{formatPercent(row.winRate)}</td></tr>)}
          {!displayLoading && visibleRows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-pc-text-muted">{t("generated.stats.noSkinStatisticsMatchTheseFilters")}</td></tr>}
          {displayLoading && <tr><td colSpan={5} className="h-48 px-4 py-10 text-center"><LoadingIndicator /></td></tr>}
        </tbody></table>
      </div>

      {!displayLoading && visibleRows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pc-border bg-pc-bg-elevated px-3 py-2">
          <div className="text-xs text-pc-text-muted">
            {t("skins.showingStatus", { start: pageStart, end: pageEnd, total: formatNumber(visibleRows.length) })}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-pc-text-secondary">
              {t("skins.rowsPerPage")}
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}
                className="rounded-lg border border-pc-border bg-pc-bg-secondary px-2 py-1.5 text-xs text-pc-text"
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <span className="min-w-20 text-center text-xs text-pc-text-muted">
              {t("skins.pageStatus", { page: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-pc-border px-2.5 py-1.5 text-xs text-pc-text-secondary transition-colors hover:border-pc-accent-mid hover:text-pc-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("skins.previous")}
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              className="rounded-lg border border-pc-border px-2.5 py-1.5 text-xs text-pc-text-secondary transition-colors hover:border-pc-accent-mid hover:text-pc-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("skins.next")}
            </button>
          </div>
        </div>
      )}
        </section>
      </div>
    </div>
  );
}
