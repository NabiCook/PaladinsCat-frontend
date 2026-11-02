/** Party evidence detail route for exact stacks and canonical pairs. · refs: none */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import MatchDirectoryList from "@/components/match-directory-list";
import PlayerDirectoryPagination, { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import { EmptyState, ErrorState, LoadingPanel } from "@/components/async-state";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { fetchPartyDetail, type PartyDetail } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";

const PAGE_SIZE = 20;

/**
 * Render the /players/parties/[kind]/[key] route with `ErrorState`, `LoadingPanel`, `EmptyState`, `PlayersPageHeader`, `MatchDirectoryList`.
 * I/O types: `none -> JSX.Element`.
 * refs: none
 */
export default function PartyDetailPage() {
  const { t, formatNumber } = useLocalization();
  const params = useParams<{ kind: string; key: string }>();
  const kind = params.kind === "pairs" ? "pairs" : params.kind === "stacks" ? "stacks" : null;
  const key = decodeURIComponent(String(params.key ?? ""));
  const [page, setPage] = usePersistentDirectoryPage();
  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!kind || !key) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchPartyDetail(kind, key, { page, pageSize: PAGE_SIZE }));
    } catch (cause) {
      setError(formatApiErrorMessage(cause, t, t("generated.players.rankedPartiesCouldNotBeLoaded")));
    } finally {
      setLoading(false);
    }
  }, [key, kind, page, t]);

  useEffect(() => { void load(); }, [load]);

  if (!kind) return <ErrorState message={t("generated.players.rankedPartiesCouldNotBeLoaded")} />;
  if (loading && !detail) return <LoadingPanel />;
  if (error && !detail) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!detail?.party) return <EmptyState title={t("generated.matches.noMatchingGames")} />;

  return <div className="space-y-6">
    <PlayersPageHeader
      title={kind === "stacks" ? <>{detail.party.stackSize}{t("generated.players.stack")}</> : <span className="flex flex-wrap items-center gap-x-2">
        {detail.party.players.map((player, index) => <span key={player.id} className="contents">
          {index > 0 && <span className="text-pc-text-muted">+</span>}
          <Link href={`/players/${player.id}`} className="hover:text-pc-accent hover:underline">{player.name}</Link>
        </span>)}
      </span>}
      meta={kind === "stacks" ? <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              {detail.party.players.map((player, index) => <span key={player.id} className="contents">
                {index > 0 && <span className="text-pc-text-muted">+</span>}
                <Link href={`/players/${player.id}`} className="text-pc-text hover:text-pc-accent hover:underline">{player.name}</Link>
              </span>)}
            </div> : undefined}
    />

    <section className="space-y-3">
      <div className="pc-section-heading px-1">
        <h2 className="text-sm font-semibold text-pc-text">{t("generated.players.matches")}</h2>
        <span className="text-xs tabular-nums text-pc-text-muted">{formatNumber(detail.total)}</span>
      </div>
      {detail.matches.length === 0
        ? <EmptyState title={t("generated.matches.noMatchingGames")} />
        : <MatchDirectoryList
            matches={detail.matches}
            mobileFooter={detail.page.totalPages > 1
              ? <PlayerDirectoryPagination page={page} totalPages={detail.page.totalPages} onPageChange={setPage} className="flex sm:hidden" />
              : null}
            desktopFooter={detail.page.totalPages > 1
              ? <PlayerDirectoryPagination page={page} totalPages={detail.page.totalPages} onPageChange={setPage} embedded className="hidden sm:flex" />
              : null}
          />}
    </section>
  </div>;
}
