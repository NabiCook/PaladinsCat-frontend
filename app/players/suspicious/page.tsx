/**
 * Render the SuspiciousPage view for the player suspicious page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchCheaterPlayers, fetchPrivateAccountsDirectory, type CheaterPlayer, type PrivateAccountSummary } from "@/lib/api-client";
import { LoadingPanel } from "@/components/async-state";
import PlayerName from "@/components/player-name";
import PlayerDirectoryGrid, { PLAYER_DIRECTORY_CARD_CLASS } from "@/components/player-directory-grid";
import { useLocalization } from "@/lib/localization-context";
import { hasSuspiciousTag } from "@/lib/player-tag-threshold";
import PlayersPageHeader from "@/components/ui/players-page-header";
import PlayerDirectorySearch from "@/components/player-directory-search";
import TagCriteriaTip from "@/components/tag-criteria-tip";

const FETCH_PAGE_SIZE = 100;
const DISPLAY_PAGE_SIZE = 32;

async function fetchAllSuspiciousPlayers(name: string): Promise<CheaterPlayer[]> {
  const players: CheaterPlayer[] = [];
  for (let offset = 0; ; offset += FETCH_PAGE_SIZE) {
    const page = await fetchCheaterPlayers({
      name: name || undefined,
      susOnly: true,
      limit: FETCH_PAGE_SIZE,
      offset,
    });
    players.push(...page);
    if (page.length < FETCH_PAGE_SIZE) return players;
  }
}

async function fetchAllSuspiciousPrivateAccounts(name: string): Promise<PrivateAccountSummary[]> {
  const accounts: PrivateAccountSummary[] = [];
  for (let page = 1; ; page += 1) {
    const result = await fetchPrivateAccountsDirectory({
      suspicious: true,
      page,
      pageSize: FETCH_PAGE_SIZE,
      query: name || undefined,
    });
    accounts.push(...result.items);
    if (page >= result.totalPages || result.items.length < FETCH_PAGE_SIZE) return accounts;
  }
}

/**
 * Render the SuspiciousPage view for the player suspicious page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function SuspiciousPage() {
  const { t , formatNumber} = useLocalization();
  const [data, setData] = useState<CheaterPlayer[]>([]);
  const [privateData, setPrivateData] = useState<PrivateAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const normalizedQuery = query.trim();
      Promise.all([
        fetchAllSuspiciousPlayers(normalizedQuery),
        fetchAllSuspiciousPrivateAccounts(normalizedQuery),
      ])
        .then(([players, privateAccounts]) => {
          if (!active) return;
          setData(players);
          setPrivateData(privateAccounts);
        })
        .catch(() => {
          if (!active) return;
          setData([]);
          setPrivateData([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const entries = useMemo(() => [
    ...data.map((player) => ({ kind: "player" as const, id: player.id, player })),
    ...privateData.map((account) => ({ kind: "private" as const, id: account.id, account })),
  ].sort((left, right) => {
    const leftCount = left.kind === "player" ? left.player.susCount : left.account.susCount;
    const rightCount = right.kind === "player" ? right.player.susCount : right.account.susCount;
    return rightCount - leftCount;
  }), [data, privateData]);

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("generated.players.suspiciousPlayers")} description={t("moderation.suspiciousDescription")} />
      <TagCriteriaTip criteriaKey="moderation.suspiciousThresholdNotice" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PlayerDirectorySearch label={t("generated.players.searchByInGameNameOrPlayerId")} value={query} onChange={setQuery} />
        <span className="flex items-center gap-2 text-xs text-pc-text-muted">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          {formatNumber(entries.length)} {t("generated.players.flagged")}
        </span>
      </div>

      {loading && entries.length === 0 ? (
        <LoadingPanel compact />
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-pc-text-secondary text-sm">{t("generated.players.noSuspiciousPlayersFound")}</div>
      ) : (
        <PlayerDirectoryGrid
          items={entries}
          getKey={(entry) => `${entry.kind}:${entry.id}`}
          loading={loading}
          pageSize={DISPLAY_PAGE_SIZE}
          gridClassName="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {(entry) => {
            const isPrivate = entry.kind === "private";
            const susCount = isPrivate ? entry.account.susCount : entry.player.susCount;
            const visibleSusCount = hasSuspiciousTag(susCount) ? susCount : 0;
            const reasons = isPrivate ? entry.account.topReasons : entry.player.topReasons;
            return (
            <Link
              href={isPrivate ? `/players/private-accounts/${entry.account.id}` : `/evidence/${entry.player.id}`}
              className={`${PLAYER_DIRECTORY_CARD_CLASS} flex-col justify-center gap-1 border-amber-500/20 hover:border-amber-400/40 hover:bg-amber-500/[0.04]`}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-semibold text-pc-text">
                  {isPrivate
                    ? <PlayerName playerId={0} cheater={entry.account.cheater} susCount={visibleSusCount} verified={false}>{entry.account.displayName}</PlayerName>
                    : <PlayerName playerId={entry.player.id} cheater={entry.player.cheater} susCount={visibleSusCount}>{entry.player.name}</PlayerName>}
                </div>
                <span className="w-fit shrink-0 text-xs font-semibold tabular-nums text-amber-300">
                  {formatNumber(susCount)} {susCount === 1 ? t("moderation.suspiciousVote") : t("moderation.suspiciousVotes")}
                </span>
              </div>
              <div className="min-w-0">
                {reasons.length > 0 ? (
                  <ul className="flex min-w-0 items-center gap-1.5 overflow-hidden" title={reasons.map((reason) => reason.reason).join(", ")}>
                    {reasons.slice(0, 1).map((reason) => (
                      <li
                        key={reason.reason}
                        className="min-w-0 flex-1 truncate rounded-md border border-pc-border bg-pc-bg px-2 py-0.5 text-xs leading-tight text-pc-text-secondary"
                      >
                        {reason.reason}
                        {reason.count > 1 && <span className="ml-1 text-pc-text-muted">×{reason.count}</span>}
                      </li>
                    ))}
                    {reasons.length > 1 && <li className="shrink-0 text-xs font-semibold text-pc-text-muted">+{formatNumber(reasons.length - 1)}</li>}
                  </ul>
                ) : (
                  <span className="text-xs text-pc-text-muted">{t("generated.players.noReasonRecorded")}</span>
                )}
              </div>
            </Link>
            );
          }}
        </PlayerDirectoryGrid>
      )}
    </div>
  );
}
