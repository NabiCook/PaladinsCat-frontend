/**
 * Render the ClassEloPage view for the player class role page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchClassLeaderboard } from "@/lib/api-client";
import { LoadingPanel } from "@/components/async-state";
import PlayerName from "@/components/player-name";
import { useLocalization } from "@/lib/localization-context";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { SegmentedRouteLinks } from "@/components/ui/segmented-control";
import { getPercentageColor } from "@/lib/stat-quality";
import { Medal } from "lucide-react";


const VALID_ROLES = ["Frontline", "Damage", "Flank", "Support"] as const;
type Role = (typeof VALID_ROLES)[number];

const CLASS_ICONS: Record<Role, string> = {
  Frontline: "/images/icons/Class_Front_Line_Icon.avif",
  Damage: "/images/icons/Class_Damage_Icon.avif",
  Flank: "/images/icons/Class_Flank_Icon.avif",
  Support: "/images/icons/Class_Support_Icon.avif",
};

interface ClassEloEntry {
  rank: number;
  player_id: number;
  name: string;
  champion: string;
  elo: number;
  winRate: number;
  totalMatches: number;
  totalWins: number;
  region: string;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span role="img" aria-label={String(rank)} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-400 font-bold text-sm">
        <Medal aria-hidden="true" size={16} className="inline shrink-0 align-middle" />
      </span>
    );
  if (rank === 2)
    return (
      <span role="img" aria-label={String(rank)} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-400/20 text-gray-300 font-bold text-sm">
        <Medal aria-hidden="true" size={16} className="inline shrink-0 align-middle" />
      </span>
    );
  if (rank === 3)
    return (
      <span role="img" aria-label={String(rank)} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-600/20 text-amber-600 font-bold text-sm">
        <Medal aria-hidden="true" size={16} className="inline shrink-0 align-middle" />
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 text-pc-text-muted text-sm">
      {rank}
    </span>
  );
}

/**
 * Render the ClassEloPage view for the player class role page route.
 * refs: none
 * I/O types: `none -> JSX.Element | null`.
 */
export default function ClassEloPage() {
  const { t , formatNumber, formatPercent} = useLocalization();
  const params = useParams();
  const router = useRouter();
  const rawRole = params?.role as string;

  const normalizedRole =
    VALID_ROLES.find((r) => r.toLowerCase() === rawRole?.toLowerCase()) ||
    VALID_ROLES.find(
      (r) =>
        r.toLowerCase().replace("-", "") ===
        rawRole?.toLowerCase().replace("-", "").replace(" ", "")
    ) ||
    null;

  const [data, setData] = useState<ClassEloEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!normalizedRole) {
      router.replace("/players/class/Frontline");
    }
  }, [normalizedRole, router]);

  useEffect(() => {
    if (!normalizedRole) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        /*
         * This route is strictly the role-specific champion leaderboard.
         * It reads player_champion_ratings through mode=champion so the table
         * stays scoped to player/champion averages for the selected role.
         */
        const leaderboard = await fetchClassLeaderboard({
          role: normalizedRole!,
          limit: 100,
          queueId: 486,
          mode: "champion",
        });
        if (cancelled) return;
        setData(
          leaderboard.map((p) => ({
            rank: p.rank,
            player_id: p.playerId,
            name: p.playerName,
            champion: p.championName ?? "Unknown",
            elo: p.elo,
            winRate: p.winRate ?? 0,
            totalMatches: p.totalMatches,
            totalWins: p.totalWins,
            region: p.region ?? "—",
          }))
        );
      } catch {
        // Keep last snapshot on failure (wiki: failed fetch must not overwrite
        // existing data with empty). Initial load stays empty (no data yet).
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [normalizedRole]);

  if (!normalizedRole) return null;

  const role = normalizedRole as Role;
  const players = data;

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={<>{role} {t("generated.players.championElo")}</>} />

      <SegmentedRouteLinks label={t("generated.players.class")} value={role} items={VALID_ROLES.map((value) => ({ value, href: `/players/class/${value}`, label: value, icon: <img src={CLASS_ICONS[value]} alt="" className="h-4 w-4" /> }))} />

      {loading ? (
        <LoadingPanel compact />
      ) : players.length === 0 ? (
        <div className="text-center py-20 text-pc-text-muted">
          {t("generated.players.noChampionDataAvailableFor")}{" "}{role}.
        </div>
      ) : (
        <div className="bg-pc-bg-elevated border border-pc-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pc-border">
                  <th className="text-left text-pc-text-muted font-medium py-3 px-4 w-14">
                    {t("generated.players.rank")}</th>
                  <th className="text-left text-pc-text-muted font-medium py-3 px-4">
                    {t("generated.players.player")}</th>
                  <th className="text-left text-pc-text-muted font-medium py-3 px-4 hidden sm:table-cell">
                    {t("generated.players.champion")}</th>
                  <th className="text-right text-pc-text-muted font-medium py-3 px-4">
                    {t("generated.players.elo")}</th>
                  <th className="text-right text-pc-text-muted font-medium py-3 px-4">
                    {t("generated.players.winRate")}</th>
                  <th className="text-right text-pc-text-muted font-medium py-3 px-4 hidden md:table-cell">
                    {t("generated.players.matches")}</th>
                  <th className="text-right text-pc-text-muted font-medium py-3 px-4 hidden md:table-cell">
                    {t("generated.players.wins")}</th>
                  <th className="text-center text-pc-text-muted font-medium py-3 px-4 hidden lg:table-cell">
                    {t("generated.players.region")}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const rowBg = i < 3 ? "bg-pc-bg/30" : "";
                  return (
                    <tr
                      key={`${p.player_id}-${p.champion}-${p.rank}`}
                      className={`border-b border-pc-border/50 hover:bg-pc-bg/60 transition-colors ${rowBg}`}
                    >
                      <td className="py-2.5 px-4">
                        <RankBadge rank={p.rank} />
                      </td>
                      <td className="py-2.5 px-4">
                        <Link
                          href={`/players/${p.player_id}`}
                          className="text-pc-text font-medium hover:text-pc-accent transition-colors"
                        >
                          <PlayerName playerId={p.player_id}>{p.name}</PlayerName>
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-pc-text-secondary hidden sm:table-cell">
                        {p.champion}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="font-bold text-pc-accent">
                          {formatNumber(p.elo)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="font-medium" style={{ color: getPercentageColor(p.winRate) }}>
                          {formatPercent(p.winRate)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-pc-text-secondary hidden md:table-cell">
                        {formatNumber(p.totalMatches)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-pc-text-secondary hidden md:table-cell">
                        {formatNumber(p.totalWins)}
                      </td>
                      <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                        <span className="text-xs px-2 py-0.5 rounded bg-pc-bg text-pc-text-muted">
                          {p.region}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-pc-text-muted text-xs text-center">
        {t("generated.players.showing")}{" "}{players.length} {t("generated.players.playerChampionRatings")}</p>
    </div>
  );
}
