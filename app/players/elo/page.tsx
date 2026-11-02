/**
 * Render the ChampionEloPage view for the player elo page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";

import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  fetchChampionElo,
  fetchClassLeaderboard,
  type ChampionEloEntry,
  type ClassLeaderboardEntry,
} from "@/lib/api-client";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { LoadingPanel } from "@/components/async-state";
import PlayerName from "@/components/player-name";
import TablePagination, { type TablePageSize } from "@/components/table-pagination";
import { usePersistentDirectoryPage } from "@/components/player-directory-pagination";

import { useSearchParams } from "next/navigation";
import { useLocalization } from "@/lib/localization-context";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { getPercentageColor } from "@/lib/stat-quality";
import { ChevronDown, Medal, X } from "lucide-react";

type ELOMode = "champion" | "account";

const CLASS_ICONS: Record<string, string> = {
  Frontline: "/images/icons/Class_Front_Line_Icon.avif",
  Damage: "/images/icons/Class_Damage_Icon.avif",
  Flank: "/images/icons/Class_Flank_Icon.avif",
  Support: "/images/icons/Class_Support_Icon.avif",
};

const TABS = [
  { key: "global", labelKey: "common.roles.global", role: undefined },
  { key: "Frontline", labelKey: "common.roles.frontline", role: "Frontline" },
  { key: "Damage", labelKey: "common.roles.damage", role: "Damage" },
  { key: "Flank", labelKey: "common.roles.flank", role: "Flank" },
  { key: "Support", labelKey: "common.roles.support", role: "Support" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span role="img" aria-label={String(rank)} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-400 font-bold text-sm"><Medal aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></span>;
  if (rank === 2)
    return <span role="img" aria-label={String(rank)} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-400/20 text-gray-300 font-bold text-sm"><Medal aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></span>;
  if (rank === 3)
    return <span role="img" aria-label={String(rank)} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-600/20 text-amber-600 font-bold text-sm"><Medal aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></span>;
  return <span className="inline-flex items-center justify-center w-7 h-7 text-pc-text-muted text-sm">{rank}</span>;
}

/**
 * Render the ChampionEloPage view for the player elo page route.
 * refs: none
 * I/O types: `{ mode }: { mode?: ELOMode } -> JSX.Element`.
 */
export default function ChampionEloPage({ mode }: { mode?: ELOMode }) {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <ChampionEloContent fixedMode={mode} />
    </Suspense>
  );
}

function ChampionEloContent({ fixedMode }: { fixedMode?: ELOMode }) {
  const { t , formatNumber, formatPercent} = useLocalization();
  const searchParams = useSearchParams();
  const initialMode = fixedMode ?? ((searchParams.get("mode") === "account" || searchParams.get("mode") === "champion")
    ? searchParams.get("mode") as ELOMode
    : "champion");
  const [eloMode, setEloMode] = useState<ELOMode>(initialMode);
  const [activeTab, setActiveTab] = useState<TabKey>("global");
  const [players, setPlayers] = useState<ChampionEloEntry[]>([]);
  const [accountPlayers, setAccountPlayers] = useState<ClassLeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistentDirectoryPage();
  const pageResetKey = useRef<string | null>(null);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);

  // Champion dropdown state (only shown within a class tab)
  const [selectedChampionId, setSelectedChampionId] = useState<number | null>(null);
  const [championSearch, setChampionSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeRole = TABS.find((t) => t.key === activeTab)?.role;

  // Build champion name → real ID mapping from ELO data
  const championNameToId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of players) {
      map.set(p.champion_name.toLowerCase(), p.champion_id);
    }
    return map;
  }, [players]);

  // Champions filtered by active class (from STATIC_CHAMPIONS)
  const classChampions = useMemo(() => {
    if (!activeRole) return [];
    return STATIC_CHAMPIONS.filter((c) => {
      const roles = Array.isArray(c.roles) ? c.roles : [c.roles];
      return roles.some((r) => r.toLowerCase() === activeRole.toLowerCase());
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeRole]);

  // Filtered champions for dropdown search
  const filteredChampions = useMemo(() => {
    const q = championSearch.trim().toLowerCase();
    if (!q) return classChampions;
    return classChampions.filter((c) => c.name.toLowerCase().includes(q));
  }, [classChampions, championSearch]);

  const visiblePlayers = useMemo(
    () => players.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, players],
  );
  const visibleAccountPlayers = useMemo(
    () => accountPlayers.slice((page - 1) * pageSize, page * pageSize),
    [accountPlayers, page, pageSize],
  );

  useEffect(() => {
    const nextKey = `${activeTab}:${eloMode}:${selectedChampionId ?? "none"}`;
    if (pageResetKey.current !== null && pageResetKey.current !== nextKey) setPage(1);
    pageResetKey.current = nextKey;
  }, [activeTab, eloMode, selectedChampionId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch data when tab or champion changes
  useEffect(() => {
    if (eloMode !== "champion") return;
    let cancelled = false;
    setLoading(true);

    const params: { role?: string; championId?: number; limit: number; queueId: number } = {
      limit: 100,
      queueId: 486,
    };

    if (selectedChampionId) {
      params.championId = selectedChampionId;
    } else if (activeRole) {
      params.role = activeRole;
    }

    fetchChampionElo(params)
      .then((result) => {
        if (cancelled) return;
        setPlayers(result.data);
        setTotal(result.total);
      })
      .catch(() => {
        // Keep last snapshot on failure (wiki: failed fetch must not overwrite
        // existing data with empty). Initial load stays empty (no data yet).
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, eloMode, selectedChampionId, activeRole]);

  // Fetch account-level ELO when in account mode
  useEffect(() => {
    if (eloMode !== "account") return;
    let cancelled = false;
    setLoading(true);

    // Account ELO is global: the backend /players/leaderboard/class account
    // query ignores the role param (it ranks every account by mu), and account
    // mode renders no class tabs. The role value is therefore a required
    // placeholder, not a filter — changing it would not change the result.
    fetchClassLeaderboard({ role: "Frontline", limit: 100, queueId: 486, mode: "account" })
      .then((result) => {
        if (cancelled) return;
        setAccountPlayers(result);
      })
      .catch(() => {
        // Keep last snapshot on failure (wiki: failed fetch must not overwrite
        // existing data with empty). Initial load stays empty (no data yet).
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [eloMode]);

  // Reset champion selection when switching tabs
  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setSelectedChampionId(null);
    setChampionSearch("");
    setDropdownOpen(false);
  };

  const handleSelectChampion = (championId: number) => {
    // Convert the lightweight STATIC_CHAMPIONS roster ID to the DB champion ID.
    const champ = STATIC_CHAMPIONS.find((c) => c.id === championId);
    if (champ) {
      const realId = championNameToId.get(champ.name.toLowerCase());
      setSelectedChampionId(realId ?? championId);
      setChampionSearch(champ.name);
      setDropdownOpen(false);
    }
  };

  const handleClearChampion = () => {
    setSelectedChampionId(null);
    setChampionSearch("");
  };

  const selectedChampion = selectedChampionId
    ? STATIC_CHAMPIONS.find((c) => championNameToId.get(c.name.toLowerCase()) === selectedChampionId)
    : null;

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={eloMode === "champion" ? t("generated.players.championElo") : t("generated.players.accountElo")} />

      {!fixedMode && <SegmentedControl label={t("generated.players.elo")} items={[
        { value: "champion" as const, label: t("generated.players.championElo") },
        { value: "account" as const, label: t("generated.players.accountElo") },
      ]} value={eloMode} onChange={setEloMode} />}

      {/* Tabs + Champion Dropdown + Search */}
      {eloMode === "champion" && (
      <div className="relative z-20">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Class tabs */}
          <SegmentedControl label={t("generated.players.class")} items={TABS.map((tab) => ({ value: tab.key, label: t(tab.labelKey), icon: tab.role ? <img src={CLASS_ICONS[tab.role]} alt="" className="h-4 w-4" /> : undefined }))} value={activeTab} onChange={handleTabChange} />

          {/* Champion dropdown (only in class tabs) */}
          {activeRole && (
            <div className="ml-auto flex items-end gap-2" ref={dropdownRef}>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-pc-card text-pc-text-muted hover:text-pc-text border border-pc-border transition-colors"
                >
                  {selectedChampion ? (
                    <>
                      <img src={getChampionIconSafe(selectedChampion.name)} alt={selectedChampion.name} className="w-4 h-4 object-contain" />
                      {selectedChampion.name}
                    </>
                  ) : (
                    t("generated.players.allChampions.0654ced")
                  )}
                  <span className="text-xs ml-1"><ChevronDown aria-hidden="true" size={12} className="inline shrink-0 align-middle" /></span>
                </button>

                {dropdownOpen && (
                  <div className="pc-card--opaque absolute top-full left-0 mt-1 z-50 w-56 overflow-hidden rounded-xl border border-pc-border bg-pc-bg-elevated shadow-lg">
                    <div className="max-h-64 overflow-y-auto">
                      {/* "All" option */}
                      <button
                        onClick={() => { setSelectedChampionId(null); setChampionSearch(""); setDropdownOpen(false); }}
                        className={`w-full text-left text-xs px-3 py-2 hover:bg-pc-bg/50 transition-colors flex items-center gap-2 ${
                          !selectedChampionId ? "text-pc-accent bg-pc-accent/10" : "text-pc-text"
                        }`}
                      >
                        {t("generated.players.all")}{" "}{activeRole} {t("generated.players.champions")}</button>
                      {filteredChampions.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectChampion(c.id)}
                          className={`w-full text-left text-xs px-3 py-2 hover:bg-pc-bg/50 transition-colors flex items-center gap-2 ${
                            selectedChampionId === c.id ? "text-pc-accent bg-pc-accent/10" : "text-pc-text"
                          }`}
                        >
                          <img src={getChampionIconSafe(c.name)} alt={c.name} className="w-5 h-5 object-contain rounded" />
                          {c.name}
                        </button>
                      ))}
                      {filteredChampions.length === 0 && (
                        <div className="text-xs text-pc-text-muted px-3 py-2">{t("generated.players.noChampionsFound")}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Champion search bar */}
              <label className="block w-48 space-y-1.5">
                <span className="block text-xs font-semibold text-pc-text-secondary">{t("generated.players.searchChampion")}</span>
                <span className="relative block">
                <input
                  type="text"
                  value={championSearch}
                  onChange={(e) => {
                    setChampionSearch(e.target.value);
                    // If typing matches a champion exactly, auto-select
                    const match = classChampions.find(
                      (c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase()
                    );
                    if (match) {
                      const realId = championNameToId.get(match.name.toLowerCase());
                      setSelectedChampionId(realId ?? match.id);
                      setDropdownOpen(false);
                    }
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const nearestChampion = filteredChampions[0];
                    if (!nearestChampion) return;
                    event.preventDefault();
                    handleSelectChampion(nearestChampion.id);
                  }}
                  placeholder={t("generated.players.searchChampion")}
                  className="pc-input pr-8 w-full text-xs"
                />
                {championSearch && (
                  <button
                    onClick={handleClearChampion}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-pc-text-muted hover:text-pc-text text-xs"
                    aria-label={t("generated.players.clearSearch")}
                  >
                    <X aria-hidden="true" size={16} className="inline shrink-0 align-middle" />
                  </button>
                )}
                </span>
              </label>
            </div>
          )}
        </div>
      </div>)}

      {/* Table */}
      {eloMode === "champion" ? (
        loading ? (
          <LoadingPanel compact />
        ) : players.length === 0 ? (
          <div className="bg-pc-bg-elevated border border-pc-border rounded-xl text-center py-12">
            <p className="text-pc-text-muted">
              {selectedChampion
                ? t("generated.players.noEloDataForValue1Yet", { value1: selectedChampion.name })
                : t("generated.players.noChampionEloDataAvailable")}
            </p>
          </div>
        ) : (
          <div className="bg-pc-bg-elevated border border-pc-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pc-border">
                    <th className="text-left text-pc-text-muted font-medium py-3 px-4 w-14">{t("generated.players.rank")}</th>
                    <th className="text-left text-pc-text-muted font-medium py-3 px-4">{t("generated.players.player")}</th>
                    <th className="text-left text-pc-text-muted font-medium py-3 px-4">{t("generated.players.champion")}</th>
                    <th className="text-left text-pc-text-muted font-medium py-3 px-4 hidden md:table-cell">{t("generated.players.class")}</th>
                    <th className="text-right text-pc-text-muted font-medium py-3 px-4">{t("generated.players.elo")}</th>
                    <th className="text-right text-pc-text-muted font-medium py-3 px-4">{t("generated.players.winRate")}</th>
                    <th className="text-right text-pc-text-muted font-medium py-3 px-4 hidden md:table-cell">{t("generated.players.matches")}</th>
                    <th className="text-center text-pc-text-muted font-medium py-3 px-4 hidden lg:table-cell">{t("generated.players.region")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((p) => (
                    <tr
                      key={`${p.player_id}-${p.champion_id}`}
                      className={`border-b border-pc-border/50 hover:bg-pc-bg/60 transition-colors ${p.rank <= 3 ? "bg-pc-bg/30" : ""}`}
                    >
                      <td className="py-2.5 px-4">
                        <RankBadge rank={p.rank} />
                      </td>
                      <td className="py-2.5 px-4">
                        <Link href={`/players/${p.player_id}`} className="text-pc-text font-medium hover:text-pc-accent transition-colors">
                          <PlayerName playerId={p.player_id}>{p.player_name}</PlayerName>
                        </Link>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <img src={getChampionIconSafe(p.champion_name)} alt={p.champion_name} className="w-6 h-6 object-contain rounded" />
                          <span className="text-pc-text-secondary text-xs">{p.champion_name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          {CLASS_ICONS[p.class_name] && (
                            <img src={CLASS_ICONS[p.class_name]} alt={p.class_name} className="w-4 h-4" />
                          )}
                          <span className="text-pc-text-muted text-xs">{p.class_name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right text-pc-accent font-bold">
                        {Math.round(p.elo)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {p.win_rate != null ? (
                          <span className="font-medium" style={{ color: getPercentageColor(p.win_rate) }}>
                            {formatPercent(p.win_rate)}
                          </span>
                        ) : (
                          <span className="text-pc-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right text-pc-text-secondary hidden md:table-cell">
                        {formatNumber(p.total_matches)}
                      </td>
                      <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                        <span className="text-xs px-2 py-0.5 rounded bg-pc-bg text-pc-text-muted">
                          {p.region ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              fixedPageSize
              totalItems={players.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </div>
        )
      ) : (
        /* Account ELO table */
        loading ? (
          <LoadingPanel compact />
        ) : accountPlayers.length === 0 ? (
          <div className="bg-pc-bg-elevated border border-pc-border rounded-xl text-center py-12">
            <p className="text-pc-text-muted">{t("generated.players.noAccountEloDataAvailable")}</p>
          </div>
        ) : (
          <div className="bg-pc-bg-elevated border border-pc-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pc-border">
                    <th className="text-left text-pc-text-muted font-medium py-3 px-4 w-14">{t("generated.players.rank")}</th>
                    <th className="text-left text-pc-text-muted font-medium py-3 px-4">{t("generated.players.player")}</th>
                    <th className="text-right text-pc-text-muted font-medium py-3 px-4">{t("generated.players.elo")}</th>
                    <th className="text-right text-pc-text-muted font-medium py-3 px-4">{t("generated.players.winRate")}</th>
                    <th className="text-right text-pc-text-muted font-medium py-3 px-4 hidden md:table-cell">{t("generated.players.matches")}</th>
                    <th className="text-right text-pc-text-muted font-medium py-3 px-4 hidden md:table-cell">{t("generated.players.wins")}</th>
                    <th className="text-center text-pc-text-muted font-medium py-3 px-4 hidden lg:table-cell">{t("generated.players.region")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccountPlayers.map((p) => (
                    <tr
                      key={`account-${p.playerId}`}
                      className={`border-b border-pc-border/50 hover:bg-pc-bg/60 transition-colors ${p.rank <= 3 ? "bg-pc-bg/30" : ""}`}
                    >
                      <td className="py-2.5 px-4">
                        <RankBadge rank={p.rank} />
                      </td>
                      <td className="py-2.5 px-4">
                        <Link href={`/players/${p.playerId}`} className="text-pc-text font-medium hover:text-pc-accent transition-colors">
                          <PlayerName playerId={p.playerId}>{p.playerName}</PlayerName>
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-right text-pc-accent font-bold">
                        {formatNumber(p.elo)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {p.winRate != null ? (
                          <span className="font-medium" style={{ color: getPercentageColor(p.winRate) }}>
                            {formatPercent(p.winRate)}
                          </span>
                        ) : (
                          <span className="text-pc-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right text-pc-text-secondary hidden md:table-cell">
                        {formatNumber(p.totalMatches)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-pc-text-secondary hidden md:table-cell">
                        {formatNumber(p.totalWins)}
                      </td>
                      <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                        <span className="text-xs px-2 py-0.5 rounded bg-pc-bg text-pc-text-muted">
                          {p.region ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              fixedPageSize
              totalItems={accountPlayers.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </div>
        )
      )}
    </div>
  );
}
