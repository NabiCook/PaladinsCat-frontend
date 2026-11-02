/**
 * Render the AltAccountsPage view for the player alt-accounts page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { LoadingPanel } from "@/components/async-state";
import PlayerDirectoryPagination, { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import PlayerName from "@/components/player-name";
import {
  fetchAltAccountRelationsDirectory,
  type AltAccountDirectoryGroup,
} from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import PlayersPageHeader from "@/components/ui/players-page-header";
import PlayerDirectorySearch from "@/components/player-directory-search";


const PAGE_SIZE = 24;

/**
 * Render the AltAccountsPage view for the player alt-accounts page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function AltAccountsPage() {
  const { t , formatNumber} = useLocalization();
  const [groups, setGroups] = useState<AltAccountDirectoryGroup[]>([]);
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
    let active = true;
    setLoading(true);
    setError(null);
    fetchAltAccountRelationsDirectory({ page, pageSize: PAGE_SIZE, query: debouncedQuery })
      .then((result) => {
        if (!active) return;
        setGroups(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((cause) => {
        if (active) setError(formatApiErrorMessage(cause, t, t("moderation.altDirectoryLoadFailed")));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedQuery, page, t]);

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("moderation.altAccountsTitle")} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PlayerDirectorySearch label={t("moderation.searchMainOrAlt")} value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
        <span className="text-xs text-pc-text-muted">{t("moderation.mainAccountGroups", { value1: formatNumber(total) })}</span>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && groups.length === 0 ? (
        <LoadingPanel compact />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pc-border bg-pc-bg-elevated px-4 py-12 text-center text-sm text-pc-text-muted">{t("moderation.noAltRelationships")}</div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
          {groups.map((group) => (
            <article key={group.main.id} className="min-w-0 overflow-hidden rounded-xl border border-fuchsia-400/20 bg-pc-bg-elevated">
              <div className="flex items-start justify-between gap-3 border-b border-pc-border p-4">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-300">{t("moderation.mainAccount")}</div>
                  <Link href={`/players/${group.main.id}`} className="block truncate text-base font-bold text-pc-text hover:text-pc-accent">
                    <PlayerName playerId={group.main.id} cheater={group.main.cheater} susCount={group.main.susCount} dropper={group.main.dropper} afkWintrade={group.main.afkWintrade} altAccount={group.main.altAccount}>{group.main.name}</PlayerName>
                  </Link>
                  <p className="mt-1 text-xs text-pc-text-muted">{group.main.region} · {group.main.platform}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-fuchsia-200">{t("moderation.relationshipVotes", { value1: formatNumber(group.totalVotes) })}</span>
              </div>

              <div className="p-3">
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-pc-text-muted">
                  <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("moderation.altAccountList", { value1: formatNumber(group.altAccounts.length) })}
                </div>
                <div className="space-y-2">
                  {group.altAccounts.map((alt) => (
                    <Link key={alt.id} href={`/players/${alt.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-pc-border bg-pc-bg/45 px-3 py-2.5 transition-colors hover:border-fuchsia-400/35 hover:bg-fuchsia-400/[0.05]">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-pc-text">
                          <PlayerName playerId={alt.id} cheater={alt.cheater} susCount={alt.susCount} dropper={alt.dropper} afkWintrade={alt.afkWintrade} altAccount={true}>{alt.name}</PlayerName>
                        </div>
                        <div className="mt-0.5 text-xs text-pc-text-muted">{alt.region} · {alt.platform}</div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-fuchsia-200">{t("moderation.relationshipVotes", { value1: formatNumber(alt.voteCount) })}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <PlayerDirectoryPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
