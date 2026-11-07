/** Dedicated Cheater Portal landing page.
 * refs: none
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileImage, History, ShieldAlert } from "lucide-react";
import { LoadingPanel } from "@/components/async-state";
import CheaterActivityPanel from "@/components/cheater-activity-panel";
import PlatformIcon from "@/components/platform-icon";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { fetchCheaterPortal, fetchPlayersOverview, type CheaterPortal, type CheaterPortalEntry } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import { getPercentageColor } from "@/lib/stat-quality";

const EMPTY_PORTAL: CheaterPortal = { activeCount: 0, inactiveCount: 0, evidenceCount: 0, latest: [] };

function entryHref(entry: CheaterPortalEntry): string {
  return entry.kind === "private"
    ? `/players/private-tracking/${entry.subjectId}`
    : `/evidence/${encodeURIComponent(String(entry.playerId ?? entry.subjectId))}`;
}

type NumberFormatter = (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;

function MetricCell({ label, title, value, style }: { label: string; title: string; value: string; style?: { color: string } }) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap" title={title}>
      <span className="text-xs tracking-[0.04em] text-pc-text-muted">{label}</span>
      <span className="text-xs font-mono font-medium tabular-nums text-pc-text" style={style}>{value}</span>
    </span>
  );
}

function LatestEntry({
  entry,
  formatNumber,
  formatPercent,
  formatDateTime,
  labels,
}: {
  entry: CheaterPortalEntry;
  formatNumber: NumberFormatter;
  formatPercent: NumberFormatter;
  formatDateTime: (value: string | null | undefined) => string;
  labels: { level: string; wins: string; losses: string; winRate: string; winsShort: string; lossesShort: string; winRateShort: string; playerStatistics: string; confirmedCheater: string; playerId: (id: number) => string };
}) {
  return (
    <Link href={entryHref(entry)} className="group flex items-start justify-between gap-3 rounded-lg border border-pc-border bg-pc-bg/45 px-3 py-2.5 transition-colors hover:border-red-400/50 hover:bg-red-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 shrink truncate text-sm font-semibold text-pc-text group-hover:text-red-200">{entry.name}</span>
          {entry.playerId != null && (
            <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-xs" title={labels.playerId(entry.playerId)} aria-label={labels.playerId(entry.playerId)}>
              <span className="text-pc-text-muted">{labels.playerId(entry.playerId).split(":")[0]}</span>
              <span className="font-mono tabular-nums text-pc-text">{entry.playerId}</span>
            </span>
          )}
          <span className="shrink-0 border-l border-pc-border/50 pl-3">
            <MetricCell label={labels.level} title={labels.level} value={formatNumber(entry.level)} />
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-x-3" aria-label={labels.playerStatistics}>
            <PlatformIcon platform={entry.platform} />
            <span className="inline-flex shrink-0 items-center gap-x-2">
              <MetricCell label={labels.winsShort} title={labels.wins} value={formatNumber(entry.wins)} />
              <MetricCell label={labels.lossesShort} title={labels.losses} value={formatNumber(entry.losses)} />
              <MetricCell label={labels.winRateShort} title={labels.winRate} value={formatPercent(entry.winRate, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} style={entry.winRate == null ? undefined : { color: getPercentageColor(entry.winRate) }} />
            </span>
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-pc-text-muted">
          <span className="min-w-0 flex-1 truncate">{entry.reason || labels.confirmedCheater}</span>
          {entry.markedAt && <time className="shrink-0 font-mono tabular-nums" dateTime={entry.markedAt}>{formatDateTime(entry.markedAt)}</time>}
        </span>
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-pc-text-muted transition-[transform,color] duration-[120ms] group-hover:translate-x-1 group-hover:text-red-200" aria-hidden="true" />
    </Link>
  );
}

/**
 * Render cheater portal totals, latest records, and links to active, inactive, and evidence directories. Load live portal data or the enabled local mock fixture and display a request error when loading fails.
 * I/O types: `none -> JSX.Element`.
 * refs: none
 */
export default function CheatersPage() {
  const { formatDateTime, formatNumber, formatPercent, t } = useLocalization();
  const statLabels = {
    level: t("generated.players.level"),
    wins: t("generated.players.wins"),
    losses: t("generated.players.losses"),
    winRate: t("generated.players.winRate"),
    winsShort: t("moderation.winsShort"),
    lossesShort: t("moderation.lossesShort"),
    winRateShort: t("moderation.winRateShort"),
    playerStatistics: t("moderation.playerStatistics"),
    confirmedCheater: t("moderation.confirmedCheater"),
    playerId: (id: number) => t("moderation.playerId", { value1: formatNumber(id) }),
  };
  const [portal, setPortal] = useState<CheaterPortal>(EMPTY_PORTAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exploiterCount, setExploiterCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetchCheaterPortal().then((value) => { if (active) setPortal(value); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    fetchPlayersOverview().then((value) => { if (active) setExploiterCount(value.communityCounts.exploiters); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("moderation.cheaterPortalTitle")} description={t("moderation.cheaterPortalDescription")} />
      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{t("moderation.cheaterPortalLoadFailed")}</div>}

      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/players/exploiters" data-card-accent="orange" className="pc-glass pc-home-feature-card group relative flex h-full min-h-64 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/5 p-6 text-center shadow-lg transition-[transform,border-color] duration-[280ms] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">
          <ArrowRight className="pc-home-card-arrow absolute right-5 top-5 h-4 w-4 text-pc-text-muted" aria-hidden="true" />
          <span className="pc-card-icon flex h-12 w-12 items-center justify-center">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-bold tracking-tight text-pc-text">{t("moderation.exploiterTitle")}</h2>
          <p className="mt-6 text-2xl font-bold tabular-nums text-pc-text">{exploiterCount === null ? "—" : formatNumber(exploiterCount)}</p>
          <p className="text-xs text-pc-text-muted">{t("moderation.recordsLabel")}</p>
        </Link>
        <Link href="/players/cheaters/active" data-card-accent="red" aria-label={t("moderation.activeDirectoryAria")} className="pc-glass pc-home-feature-card group relative flex h-full min-h-64 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/5 p-6 text-center shadow-lg transition-[transform,border-color] duration-[280ms] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">
            <ArrowRight className="pc-home-card-arrow absolute right-5 top-5 h-4 w-4 text-pc-text-muted transition-[transform,color] duration-[120ms] group-hover:translate-x-1 group-hover:text-red-200" aria-hidden="true" />
            <span className="pc-card-icon flex h-12 w-12 items-center justify-center">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="relative mt-5">
              <h2 className="text-xl font-bold tracking-tight text-pc-text group-hover:text-red-100">{t("moderation.activeCheaters")}</h2>
              <p className="mt-6 text-2xl font-bold tabular-nums text-pc-text">{loading || error ? "—" : formatNumber(portal.activeCount)}</p>
              <p className="text-xs text-pc-text-muted">{t("moderation.recordsLabel")}</p>
            </div>
        </Link>

        <Link href="/players/cheaters/inactive" data-card-accent="secondary" className="pc-glass pc-home-feature-card group relative flex h-full min-h-64 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/5 p-6 text-center shadow-lg transition-[transform,border-color] duration-[280ms] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">
          <ArrowRight className="pc-home-card-arrow absolute right-5 top-5 h-4 w-4 text-pc-text-muted transition-[transform,color] duration-[120ms] group-hover:translate-x-1 group-hover:text-violet-200" aria-hidden="true" />
          <span className="pc-card-icon flex h-12 w-12 items-center justify-center">
            <History className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="relative mt-5">
            <h2 className="text-xl font-bold tracking-tight text-pc-text group-hover:text-violet-100">{t("moderation.inactiveCheaterDatabase")}</h2>
            <p className="mt-6 text-2xl font-bold tabular-nums text-pc-text">{loading || error ? "—" : formatNumber(portal.inactiveCount)}</p>
            <p className="text-xs text-pc-text-muted">{t("moderation.recordsLabel")}</p>
          </div>
        </Link>

        <Link href="/evidence" data-card-accent="tertiary" title={t("moderation.viewOrSubmitEvidence")} aria-label={t("moderation.viewOrSubmitEvidence")} className="pc-glass pc-home-feature-card group relative flex h-full min-h-64 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/5 p-6 text-center shadow-lg transition-[transform,border-color] duration-[280ms] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">
          <ArrowRight className="pc-home-card-arrow absolute right-5 top-5 h-4 w-4 text-pc-text-muted transition-[transform,color] duration-[120ms] group-hover:translate-x-1 group-hover:text-amber-200" aria-hidden="true" />
          <span className="pc-card-icon flex h-12 w-12 items-center justify-center">
            <FileImage className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="relative mt-5">
            <h2 className="text-xl font-bold tracking-tight text-pc-text group-hover:text-amber-100">{t("moderation.evidencePortal")}</h2>
            <p className="mt-6 text-2xl font-bold tabular-nums text-pc-text">{loading || error ? "—" : formatNumber(portal.evidenceCount)}</p>
            <p className="text-xs text-pc-text-muted">{t("moderation.evidence")}</p>
          </div>
        </Link>
      </div>

      <section className="pc-card" aria-labelledby="latest-cheaters-preview-title">
        <h2 id="latest-cheaters-preview-title" className="text-lg font-semibold text-pc-text">{t("moderation.latestCheaters")}</h2>
        {loading ? <LoadingPanel compact className="py-8" /> : portal.latest.length === 0 ? (
          <p className="py-8 text-center text-sm text-pc-text-muted">{t("moderation.noConfirmedCheaters")}</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-4">
            <div className="space-y-2">{portal.latest.slice(0, 10).map((entry) => <LatestEntry key={`${entry.kind}:${entry.subjectId}`} entry={entry} formatNumber={formatNumber} formatPercent={formatPercent} formatDateTime={formatDateTime} labels={statLabels} />)}</div>
            <div className="space-y-2">{portal.latest.slice(10, 20).map((entry) => <LatestEntry key={`${entry.kind}:${entry.subjectId}`} entry={entry} formatNumber={formatNumber} formatPercent={formatPercent} formatDateTime={formatDateTime} labels={statLabels} />)}</div>
          </div>
        )}
      </section>
      <CheaterActivityPanel />
    </div>
  );
}
