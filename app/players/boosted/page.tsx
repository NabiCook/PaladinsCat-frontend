/**
 * Render the BoostedPlayersPage view for the player boosted page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchBoostedPlayerDetail, fetchBoostedPlayers, fetchCheaterPlayers, type BoostedPlayer } from "@/lib/api-client";
import { LoadingPanel } from "@/components/async-state";
import PlayerName from "@/components/player-name";
import PlayerDirectoryGrid, { PLAYER_DIRECTORY_CARD_CLASS } from "@/components/player-directory-grid";
import { useLocalization } from "@/lib/localization-context";
import PlayersPageHeader from "@/components/ui/players-page-header";
import PlayerDirectorySearch from "@/components/player-directory-search";
import TagCriteriaTip from "@/components/tag-criteria-tip";

const FETCH_PAGE_SIZE = 100;

function matchesBoostedQuery(player: BoostedPlayer, query: string): boolean {
  const normalizedQuery = query.trim();
  return /^\d+$/.test(normalizedQuery)
    ? player.id === normalizedQuery
    : player.name.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase());
}

async function fetchBoostedPages(name: string | undefined, initialPage?: BoostedPlayer[]): Promise<BoostedPlayer[]> {
  const players: BoostedPlayer[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += FETCH_PAGE_SIZE) {
    const page = initialPage && offset === 0 ? initialPage : await fetchBoostedPlayers({
      name,
      limit: FETCH_PAGE_SIZE,
      offset,
    });
    const newPlayers = page.filter((player) => !seen.has(player.id));
    newPlayers.forEach((player) => seen.add(player.id));
    players.push(...newPlayers);
    if (page.length < FETCH_PAGE_SIZE || newPlayers.length === 0) return players;
  }
}

async function fetchAllBoostedPlayers(name: string): Promise<BoostedPlayer[]> {
  const normalizedQuery = name.trim();
  const firstPage = await fetchBoostedPlayers({
    name: normalizedQuery || undefined,
    limit: FETCH_PAGE_SIZE,
  });
  if (!normalizedQuery || firstPage.every((player) => matchesBoostedQuery(player, normalizedQuery))) {
    return fetchBoostedPages(normalizedQuery || undefined, firstPage);
  }

  // Keep search usable against an older API while the server-side boosted
  // directory search rolls out. The standard directory already exposes the
  // boosted flag; details restore the boosted-specific evidence for cards.
  const candidates = await fetchCheaterPlayers({ name: normalizedQuery, limit: FETCH_PAGE_SIZE });
  const details = await Promise.allSettled(
    candidates
      .filter((player) => player.boosted)
      .map((player) => fetchBoostedPlayerDetail(player.id)),
  );
  return details.flatMap((detail) => detail.status === "fulfilled" ? [detail.value.player] : []);
}

/**
 * Render the BoostedPlayersPage view for the player boosted page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function BoostedPlayersPage() {
  const { t , formatNumber} = useLocalization();
  const [players, setPlayers] = useState<BoostedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchAllBoostedPlayers(query.trim())
        .then((rows) => {
          if (active) setPlayers(rows);
        })
        .catch(() => {
          if (active) setPlayers([]);
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

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("moderation.boostedPlayers")} description={t("moderation.boostedDescription")} />
      <TagCriteriaTip criteriaKey="moderation.boostedThresholdNotice" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PlayerDirectorySearch label={t("generated.players.searchByInGameNameOrPlayerId")} value={query} onChange={setQuery} />
        <span className="flex items-center gap-2 text-xs text-pc-text-muted">
          <span className="h-2 w-2 rounded-full bg-orange-400" />
          {formatNumber(players.length)} {t("moderation.boosted")}
        </span>
      </div>

      {loading && players.length === 0 ? (
        <LoadingPanel compact />
      ) : players.length === 0 ? (
        <div className="py-12 text-center text-sm text-pc-text-secondary">{t("moderation.noBoostedPlayers")}</div>
      ) : (
        <PlayerDirectoryGrid items={players} getKey={(player) => player.id} loading={loading}>
          {(player) => (
            <Link
              href={`/players/boosted/${player.id}`}
              className={`${PLAYER_DIRECTORY_CARD_CLASS} group flex-col justify-center gap-1 border-orange-400/20 hover:border-orange-400/40 hover:bg-orange-400/[0.04]`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-pc-text transition-colors group-hover:text-pc-accent">
                  <PlayerName playerId={player.id} cheater={player.cheater} susCount={player.susCount} boosted={player.boosted} boostedMatchCount={player.partyMatchCount}>{player.name}</PlayerName>
                </div>
              </div>

              <div className="min-w-0">
                <ul className="flex min-w-0 items-center gap-1.5 overflow-hidden" title={player.cheaters.map((cheater) => `${cheater.name} · ${formatNumber(cheater.matchCount)}`).join(", ")}>
                  {player.cheaters.slice(0, 1).map((cheater) => (
                    <li key={cheater.id} className="min-w-0 flex-1 truncate text-xs leading-tight text-red-200">
                      <span className="font-semibold">{cheater.name}</span>
                      <span className="ml-1 text-red-200/70">· {formatNumber(cheater.matchCount)}</span>
                    </li>
                  ))}
                  {player.cheaters.length > 1 && <li className="shrink-0 text-xs font-semibold text-red-200/70">+{formatNumber(player.cheaters.length - 1)}</li>}
                </ul>
              </div>
            </Link>
          )}
        </PlayerDirectoryGrid>
      )}
    </div>
  );
}
