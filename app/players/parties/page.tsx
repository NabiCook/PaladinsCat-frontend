/**
 * Render the RankedPartiesPage view for the player parties page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { LoadingPanel } from "@/components/async-state";
import PlayerDirectoryPagination, { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import PlayerName from "@/components/player-name";
import {
  fetchPartyPairsDirectory,
  fetchPartyStacksDirectory,
  type PartyPairSummary,
  type PartyStackSummary,
} from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import PlayersPageHeader from "@/components/ui/players-page-header";


const PAGE_SIZE = 24;
type DirectoryMode = "stacks" | "pairs";

function MatchCount({ count, href }: { count: number; href: string }) {
  const { t, formatNumber } = useLocalization();
  return <Link href={href} className="shrink-0 text-xs font-semibold tabular-nums text-pc-accent hover:underline">{formatNumber(count)} {t("generated.players.match")}{count === 1 ? "" : t("generated.players.es")} <ArrowRight aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></Link>;
}

/**
 * Render the RankedPartiesPage view for the player parties page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function RankedPartiesPage() {
  const { t, formatNumber } = useLocalization();
  const [mode, setMode] = useState<DirectoryMode>(() => (
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "pairs"
      ? "pairs"
      : "stacks"
  ));
  const [pairs, setPairs] = useState<PartyPairSummary[]>([]);
  const [stacks, setStacks] = useState<PartyStackSummary[]>([]);
  const [stackSize, setStackSize] = useState<number | null>(null);
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
    const request = mode === "stacks"
      ? fetchPartyStacksDirectory({ page, pageSize: PAGE_SIZE, query: debouncedQuery, size: stackSize })
      : fetchPartyPairsDirectory({ page, pageSize: PAGE_SIZE, query: debouncedQuery });
    request
      .then((result) => {
        if (cancelled) return;
        if (mode === "stacks") setStacks(result.items as PartyStackSummary[]);
        else setPairs(result.items as PartyPairSummary[]);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((cause) => {
        if (!cancelled) setError(formatApiErrorMessage(cause, t, t("generated.players.rankedPartiesCouldNotBeLoaded")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, mode, page, stackSize]);

  const itemsEmpty = mode === "stacks" ? stacks.length === 0 : pairs.length === 0;
  const changeMode = (nextMode: DirectoryMode) => {
    setMode(nextMode);
    setPage(1);
    const url = new URL(window.location.href);
    if (nextMode === "pairs") url.searchParams.set("view", "pairs");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("generated.players.rankedParties")} />

      <div className="flex flex-wrap gap-2 text-xs font-semibold" role="group" aria-label={t("generated.players.rankedParties")}>
        {(["stacks", "pairs"] as DirectoryMode[]).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => changeMode(option)}
            aria-pressed={mode === option}
            className={`rounded-lg px-4 py-2 capitalize transition-colors ${mode === option ? "bg-pc-accent text-pc-bg" : "pc-surface text-pc-text-muted hover:text-pc-text"}`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col items-stretch gap-3 sm:max-w-xl sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-semibold text-pc-text-secondary">{t("generated.players.search")}</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pc-text-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder={mode === "stacks" ? t("generated.players.searchAnyStackMember") : t("generated.players.searchEitherPlayer")}
                className="w-full rounded-xl border border-pc-border bg-pc-bg-elevated py-2.5 pl-9 pr-3 text-sm text-pc-text outline-none transition-colors placeholder:text-pc-text-muted focus:border-pc-accent-mid"
              />
            </span>
          </label>
          {mode === "stacks" && (
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold text-pc-text-secondary">{t("generated.players.stackSize")}</span>
              <select
                value={stackSize ?? ""}
                onChange={(event) => { setStackSize(event.target.value ? Number(event.target.value) : null); setPage(1); }}
                className="w-full rounded-xl border border-pc-border bg-pc-bg-elevated px-3 py-2.5 text-sm text-pc-text outline-none focus:border-pc-accent-mid sm:w-auto"
              >
                <option value="">{t("generated.players.allSizes")}</option>
                {[2, 3, 4, 5].map(size => <option key={size} value={size}>{size}{t("generated.players.stack")}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="text-xs text-pc-text-muted">{loading && itemsEmpty ? t("generated.players.loading") : t(mode === "stacks" ? (total === 1 ? "common.count.knownStackOne" : "common.count.knownStackMany") : (total === 1 ? "common.count.knownPairOne" : "common.count.knownPairMany"), { count: formatNumber(total) })}</div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && itemsEmpty ? (
        <LoadingPanel compact />
      ) : itemsEmpty ? (
        <div className="rounded-xl border border-dashed border-pc-border bg-pc-bg-elevated px-4 py-12 text-center text-sm text-pc-text-muted">{t("generated.players.noRanked")}{" "}{mode} {t("generated.players.matchThisSearch")}</div>
      ) : mode === "stacks" ? (
        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
          {stacks.map(stack => (
            <article key={stack.groupKey} className="pc-card overflow-hidden p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-pc-text-muted">{stack.stackSize}{t("generated.players.stack")}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stack.players.map(player => (
                      <Link key={player.id} href={`/players/${player.id}`} className="py-1 text-sm font-semibold text-pc-text underline-offset-4 transition-colors hover:text-pc-accent hover:underline">
                        <PlayerName playerId={player.id}>{player.name}</PlayerName>
                      </Link>
                    ))}
                  </div>
                </div>
                <MatchCount count={stack.matchCount} href={`/players/parties/stacks/${encodeURIComponent(stack.groupKey)}`} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
          {pairs.map((pair) => (
            <article key={`${pair.sourcePlayerId}-${pair.targetPlayerId}`} className="pc-card overflow-hidden p-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                    <Link href={`/players/${pair.sourcePlayerId}`} className="min-w-0 break-words text-pc-text transition-colors hover:text-pc-accent [overflow-wrap:anywhere]"><PlayerName playerId={pair.sourcePlayerId}>{pair.sourcePlayerName}</PlayerName></Link>
                    <span className="shrink-0 text-pc-text-muted">+</span>
                    <Link href={`/players/${pair.targetPlayerId}`} className="min-w-0 break-words text-pc-text transition-colors hover:text-pc-accent [overflow-wrap:anywhere]"><PlayerName playerId={pair.targetPlayerId}>{pair.targetPlayerName}</PlayerName></Link>
                  </div>
                </div>
                <MatchCount count={pair.matchCount} href={`/players/parties/pairs/${Math.min(pair.sourcePlayerId, pair.targetPlayerId)}-${Math.max(pair.sourcePlayerId, pair.targetPlayerId)}`} />
              </div>
            </article>
          ))}
        </div>
      )}

      <PlayerDirectoryPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
