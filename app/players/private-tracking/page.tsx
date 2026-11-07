/**
 * Render the PrivateTrackingPage view for the player private-tracking page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoadingPanel } from "@/components/async-state";
import PlayerDirectoryPagination, { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import { fetchPrivateAccountsDirectory, type PrivateAccountSummary } from "@/lib/api-client";
import { TIER_NAMES, getRankIconPath, getTierColor } from "@/lib/tier-utils";
import { useLocalization } from "@/lib/localization-context";
import { PlayerModerationTag } from "@/components/player-name";
import PlayersPageHeader from "@/components/ui/players-page-header";
import PlayerDirectorySearch from "@/components/player-directory-search";


const PAGE_SIZE = 24;

/**
 * Render the PrivateTrackingPage view for the player private-tracking page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function PrivateTrackingPage() {
  const { t, formatNumber } = useLocalization();
  const [accounts, setAccounts] = useState<PrivateAccountSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = usePersistentDirectoryPage();
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPrivateAccountsDirectory({ page, pageSize: PAGE_SIZE, query: debouncedQuery })
      .then((result) => {
        if (cancelled) return;
        setAccounts(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((cause) => {
        if (!cancelled) setError(formatApiErrorMessage(cause, t, t("generated.players.privateAccountsCouldNotBeLoaded")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, page]);

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("generated.players.privateAccounts")} description={t("generated.players.privateAccountsDescription")} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PlayerDirectorySearch label={t("generated.players.searchPrivateAlias")} value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
        <div className="text-xs text-pc-text-muted">{loading && accounts.length === 0 ? t("generated.players.loading") : t(total === 1 ? "common.count.trackedAccountOne" : "common.count.trackedAccountMany", { count: formatNumber(total) })}</div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && accounts.length === 0 ? (
        <LoadingPanel compact />
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pc-border bg-pc-bg-elevated px-4 py-12 text-center text-sm text-pc-text-muted">{t("generated.players.noPrivateAccountsMatchThisSearch")}</div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
          {accounts.map((account) => {
            const tierName = TIER_NAMES[account.leagueTier] || "Unranked";
            return (
              <Link href={`/players/private-tracking/${account.id}`} key={account.id} className="group block overflow-hidden rounded-xl border border-slate-400/20 bg-pc-bg-elevated p-3 transition-colors hover:border-pc-accent-mid">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <h2 className="mr-0.5 truncate text-base font-semibold text-pc-text group-hover:text-pc-accent">{account.alias || account.displayName}</h2>
                    <PlayerModerationTag playerId={0} cheater={account.cheater} susCount={account.susCount} verified={false} />
                    <span className="rounded border border-pc-border bg-pc-bg/50 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-pc-text-secondary">{t("generated.players.level")}{" "}{formatNumber(account.accountLevel)}</span>
                    <span className="rounded border border-pc-border bg-pc-bg/50 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-pc-text-secondary">{t("generated.players.mastery")}{" "}{formatNumber(account.masteryLevel)}</span>
                    <span className={`ml-1 flex min-w-0 items-center gap-1 text-xs font-semibold ${getTierColor(account.leagueTier)}`}>
                      <img src={getRankIconPath(account.leagueTier, 0)} alt="" className="h-5 w-5 shrink-0 object-contain" />
                      <span className="truncate">{tierName}</span>
                      <span className="text-pc-text-muted">·</span>
                      <span className="whitespace-nowrap text-pc-text-secondary">{formatNumber(account.leaguePoints)} {t("generated.players.tp")}</span>
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-300">{formatNumber(account.matchCount)} {t("generated.players.matches.9f3e924")}</span>
                </div>

              </Link>
            );
          })}
        </div>
      )}

      <PlayerDirectoryPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
