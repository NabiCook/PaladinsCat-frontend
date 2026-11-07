/**
 * Render the PrivateAccountsPage view: the MCTS-sourced private account DB.
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
import { fetchMctsPrivateAccountsDirectory, type MctsPrivateAccountSummary } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import PlayersPageHeader from "@/components/ui/players-page-header";
import PlayerDirectorySearch from "@/components/player-directory-search";

const PAGE_SIZE = 24;

/**
 * Render the MCTS private account DB: every account a profile probe recovered
 * with PRIVACY_FLAG = 1, newest observation first.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function PrivateAccountsPage() {
  const { t, formatNumber, formatDate } = useLocalization();
  const [accounts, setAccounts] = useState<MctsPrivateAccountSummary[]>([]);
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
    fetchMctsPrivateAccountsDirectory({ page, pageSize: PAGE_SIZE, query: debouncedQuery })
      .then((result) => {
        if (cancelled) return;
        setAccounts(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((cause) => {
        if (!cancelled) setError(formatApiErrorMessage(cause, t, t("generated.players.mctsPrivateAccountsCouldNotBeLoaded")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, page]);

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("generated.players.mctsPrivateAccounts")} description={t("generated.players.mctsPrivateAccountsDescription")} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PlayerDirectorySearch label={t("generated.players.searchMctsPrivate")} value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
        <div className="text-xs text-pc-text-muted">{loading && accounts.length === 0 ? t("generated.players.loading") : t(total === 1 ? "common.count.trackedAccountOne" : "common.count.trackedAccountMany", { count: formatNumber(total) })}</div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && accounts.length === 0 ? (
        <LoadingPanel compact />
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pc-border bg-pc-bg-elevated px-4 py-12 text-center text-sm text-pc-text-muted">{t("generated.players.noMctsPrivateAccountsMatchThisSearch")}</div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
          {accounts.map((account) => (
            <Link href={`/players/${account.playerId}`} key={account.playerId} className="group block overflow-hidden rounded-xl border border-slate-400/20 bg-pc-bg-elevated p-3 transition-colors hover:border-pc-accent-mid">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <h2 className="mr-0.5 truncate text-base font-semibold text-pc-text group-hover:text-pc-accent">{account.name || account.gamerTag || `#${account.playerId}`}</h2>
                  {account.gamerTag && account.gamerTag !== account.name && (
                    <span className="rounded border border-pc-border bg-pc-bg/50 px-1.5 py-0.5 text-xs font-semibold text-pc-text-secondary">{account.gamerTag}</span>
                  )}
                  <span className="rounded border border-pc-border bg-pc-bg/50 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-pc-text-secondary">{t("generated.players.observations")} {formatNumber(account.observations)}</span>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-300">{formatDate(account.lastObservedAt)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-pc-text-muted">
                <span>#{account.playerId}</span>
                <span>portal {account.portalId}</span>
                {account.source && <span>{account.source}</span>}
                {account.lastRunId && <span>{account.lastRunId}</span>}
                <span>{t("generated.players.firstObserved")} {formatDate(account.firstSeenAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <PlayerDirectoryPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
