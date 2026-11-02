/** Ranked distributions keep player counts and match participation in separate, readable panels.
 * refs: none
 */
"use client";
import { useEffect, useState } from "react";
import { fetchTierSummary, fetchTiers, type TierStat, type TierSummary } from "@/lib/api-client";
import { getRankIconPath } from "@/lib/tier-utils";
import { getPercentageColor } from "@/lib/stat-quality";
import PageHeader from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { LoadingIndicator } from "@/components/async-state";
import TablePagination from "@/components/table-pagination";
import { useLocalization } from "@/lib/localization-context";
import type { TranslationKey } from "@/lib/localization/messages";

function rankIcon(tier: number) {
  return getRankIconPath(tier, tier === 26 ? 101 : tier === 27 ? 1 : 0);
}

function tierLabel(tier: number, detail: "ranks" | "divisions", t: (key: TranslationKey) => string) {
  const name = tier > 25 ? (tier === 26 ? "master" : "grandmaster") : ["bronze", "silver", "gold", "platinum", "diamond"][Math.floor((tier - 1) / 5)];
  const division = tier <= 25 && detail === "divisions" ? String(5 - (tier - 1) % 5) : "";
  return t(`common.tiers.${name}${division}` as TranslationKey);
}

function AverageRank({ value }: { value: number | undefined }) {
  const { t } = useLocalization();
  const tier = value && Number.isFinite(value) ? Math.max(1, Math.min(27, Math.round(value))) : 0;
  return tier ? <span className="inline-flex items-center gap-2">
    <img src={rankIcon(tier)} alt="" className="h-6 w-6 object-contain" />
    <span>≈ {tierLabel(tier, "divisions", t)}</span>
  </span> : <span>—</span>;
}

function DistributionPanel({ source, rows, loading, onRetry, detail, idPrefix }: {
  source: "profiles" | "matches";
  rows: TierStat[] | null;
  loading: boolean;
  onRetry: () => void;
  detail: "ranks" | "divisions";
  idPrefix: string;
}) {
  const { t, formatNumber, formatPercent } = useLocalization();
  const [pagination, setPagination] = useState({ detail: "", page: 1 });
  // Match facts cannot split the Master/Grandmaster tier. Never invent a tier 27 bucket.
  const count = source === "profiles" ? 27 : 26;
  const normalized = Array.from({ length: count }, (_, index) => {
    const tier = index + 1;
    return { tier, value: rows?.find(row => row.tierSort === tier)?.totalPlays ?? 0 };
  });
  const total = normalized.reduce((sum, row) => sum + row.value, 0);
  const average = total ? normalized.reduce((sum, row) => sum + row.tier * row.value, 0) / total : 0;
  const displayed = detail === "divisions" ? normalized : normalized.reduce<Array<{ tier: number; value: number }>>((groups, row) => {
    const tier = row.tier <= 25 ? Math.floor((row.tier - 1) / 5) * 5 + 1 : row.tier;
    const group = groups.find(candidate => candidate.tier === tier);
    if (group) group.value += row.value;
    else groups.push({ tier, value: row.value });
    return groups;
  }, []);
  const title = t(source === "profiles" ? "stats.tiers.profiles" : "stats.tiers.matches");
  const page = pagination.detail === detail ? Math.min(pagination.page, Math.max(1, Math.ceil(displayed.length / 25))) : 1;
  const visibleRows = displayed.slice((page - 1) * 25, page * 25);
  const unit = t(source === "profiles" ? "stats.tiers.players" : "stats.tiers.participations");

  return <section className="pc-card-flush min-w-0" aria-labelledby={`${idPrefix}-${source}`} aria-busy={loading}>
    <header className="space-y-4 p-4 sm:p-6">
      <h2 id={`${idPrefix}-${source}`} className="pc-heading text-xl">{title}</h2>
      <dl className="grid grid-cols-2 gap-4">
        <div><dt className="text-xs text-pc-text-secondary">{unit}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-pc-text">{rows ? formatNumber(total) : "—"}</dd></div>
        <div><dt className="text-xs text-pc-text-secondary">{t("stats.tiers.average")}</dt><dd className="mt-1 text-sm font-semibold text-pc-text"><AverageRank value={rows ? average : undefined} /></dd></div>
      </dl>
    </header>
    {loading && !rows ? <div className="min-h-96 space-y-4 px-4 pb-6 sm:px-6">
      <LoadingIndicator />
      {Array.from({ length: 7 }, (_, i) => <div key={i} className="pc-skeleton h-8 rounded" />)}
    </div> : !rows ? <div className="min-h-96 space-y-4 px-4 pb-6 sm:px-6" role="alert">
      <p className="text-sm text-pc-text-secondary">{t("stats.tiers.unavailable")}</p>
      <button type="button" onClick={onRetry} className="pc-btn-secondary">{t("stats.tiers.retry")}</button>
    </div> : total === 0 ? <p className="min-h-96 px-4 pb-6 text-sm text-pc-text-secondary sm:px-6" role="status">{t("stats.tiers.empty")}</p> : <><table className="w-full table-fixed text-sm">
      <caption className="sr-only">{title}</caption>
      <thead className="border-y border-pc-border text-xs text-pc-text-secondary">
        <tr><th scope="col" className="w-1/2 px-4 py-3 text-left font-medium sm:px-6">{t("stats.tiers.rank")}</th><th scope="col" className="px-2 py-3 text-right font-medium">{t("stats.tiers.count")}</th><th scope="col" className="px-4 py-3 text-right font-medium sm:px-6">{t("stats.tiers.share")}</th></tr>
      </thead>
      <tbody className="divide-y divide-pc-border/50">
        {visibleRows.map(({ tier, value }) => {
          const share = total ? value / total * 100 : 0;
          const name = source === "matches" && tier === 26 ? t("stats.tiers.masterCombined") : tierLabel(tier, detail, t);
          return <tr key={tier}>
            <th scope="row" className="px-4 py-2 text-left font-medium text-pc-text sm:px-6">
              <div className="flex items-center gap-2"><img src={rankIcon(tier)} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" /><span className="break-words">{name}</span></div>
              <div aria-hidden="true" className="mt-1 h-1 overflow-hidden rounded-full bg-pc-border/50"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: getPercentageColor(share) }} /></div>
            </th>
            <td className="px-2 py-2 text-right tabular-nums text-pc-text">{formatNumber(value)}</td>
            <td className="px-4 py-2 text-right tabular-nums sm:px-6" style={{ color: getPercentageColor(share) }}>{formatPercent(share)}</td>
          </tr>;
        })}
      </tbody>
    </table>{displayed.length > 25 && <TablePagination page={page} pageSize={25} totalItems={displayed.length} onPageChange={next => setPagination({detail,page:next})} onPageSizeChange={() => {}} fixedPageSize />}</>}
  </section>;
}

/**
 * Render the /stats/tiers route with `PageHeader`, `SegmentedControl`, `DistributionPanel`, `AverageRank`.
 * I/O types: `none -> JSX.Element`.
 * refs: none
 */
export default function TierDistribution({ embedded = false }: { embedded?: boolean }) {
  const { t, formatNumber } = useLocalization();
  const [profiles, setProfiles] = useState<TierStat[] | null>(null);
  const [matches, setMatches] = useState<TierStat[] | null>(null);
  const [summary, setSummary] = useState<TierSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<"ranks" | "divisions">("ranks");
  const retry = () => setAttempt(value => value + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([fetchTiers({ source: "profiles" }), fetchTiers({ source: "matches" }), fetchTierSummary()])
      .then(([profileResult, matchResult, summaryResult]) => {
        if (cancelled) return;
        setProfiles(profileResult.status === "fulfilled" ? profileResult.value : null);
        setMatches(matchResult.status === "fulfilled" ? matchResult.value : null);
        setSummary(summaryResult.status === "fulfilled" ? summaryResult.value : null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [attempt]);

  return <div className="space-y-6">
    {embedded ? <h2 className="leaderboard-tier-title">{t("stats.tiers.title")}</h2> : <PageHeader parentHref="/stats" parentLabel={t("menu.globalStats")} title={t("stats.tiers.title")} description={t("stats.tiers.description")} />}
    <SegmentedControl label={t("stats.tiers.detail")} items={[{ value: "ranks", label: t("stats.tiers.ranks") }, { value: "divisions", label: t("stats.tiers.divisions") }]} value={detail} onChange={setDetail} />
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <DistributionPanel source="profiles" rows={profiles} loading={loading} onRetry={retry} detail={detail} idPrefix={embedded ? "leaderboard-tier" : "tier"} />
      <DistributionPanel source="matches" rows={matches} loading={loading} onRetry={retry} detail={detail} idPrefix={embedded ? "leaderboard-tier" : "tier"} />
    </div>
    <section className="pc-card" aria-label={t("stats.tiers.matches")}>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div><dt className="text-xs text-pc-text-secondary">{t("generated.stats.activePlayers")}</dt><dd className="mt-2 text-lg font-semibold tabular-nums text-pc-text">{summary ? formatNumber(summary.activePlayers) : "—"}</dd></div>
        <div><dt className="text-xs text-pc-text-secondary">{t("generated.stats.rankedMatches.0b47f50")}</dt><dd className="mt-2 text-lg font-semibold tabular-nums text-pc-text">{summary ? formatNumber(summary.rankedMatches) : "—"}</dd></div>
        <div><dt className="text-xs text-pc-text-secondary">{t("generated.stats.avgMatchTier")}</dt><dd className="mt-2 text-sm font-semibold text-pc-text"><AverageRank value={summary?.avgMatchTier} /></dd></div>
        <div><dt className="text-xs text-pc-text-secondary">{t("generated.stats.medianMatchTier")}</dt><dd className="mt-2 text-sm font-semibold text-pc-text"><AverageRank value={summary?.medianMatchTier} /></dd></div>
      </dl>
      {!loading && !summary && <div className="mt-4 flex flex-wrap items-center gap-3" role="status"><span className="text-sm text-pc-text-secondary">{t("stats.tiers.unavailable")}</span><button type="button" onClick={retry} className="pc-btn-secondary">{t("stats.tiers.retry")}</button></div>}
    </section>
  </div>;
}
