/**
 * Local-only relationships mockup; never reads or changes player records.
 *
 * refs: none
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PlayerRelationshipsView from "@/components/player-relationships-view";
import type { PlayerRelationshipRow, PlayerRelationshipSummary } from "@/lib/api-client";
import { getServerLocalization } from "@/lib/server-localization";

/** Next.js route data mode: always resolve fresh per request. refs: none */
export const dynamic = "force-dynamic";

function partner(index: number, name: string, matches: number, wins: number): PlayerRelationshipRow {
  return {
    otherPlayerId: String(index), otherPlayerName: name, matchCount: matches,
    metricMatchCount: matches, wins, losses: matches - wins, winRate: wins / matches * 100,
    metricsComplete: true, playerRoleCounts: { Damage: matches },
    partnerRoleCounts: { Frontline: Math.round(matches * 0.4), Support: matches - Math.round(matches * 0.4) },
    playerChampionCounts: { Viktor: matches },
    partnerChampionCounts: { Ash: Math.round(matches * 0.4), Ying: matches - Math.round(matches * 0.4) },
    firstSeen: "2026-09-25T12:00:00Z", lastSeen: "2026-10-01T12:00:00Z", sameParty: true,
  };
}

const teammates = [partner(1, "Preview Frontline", 84, 56), partner(2, "Preview Support", 62, 38), partner(3, "Preview Flank", 43, 20), partner(4, "Preview Damage", 28, 18)];
const opponents = [partner(5, "Preview Opponent A", 47, 25), partner(6, "Preview Opponent B", 31, 12)];
const summary: PlayerRelationshipSummary = {
  playerId: "preview", teammates, opponents, partyPartners: teammates.slice(0, 2),
  totals: { uniqueTeammates: 4, uniqueOpponents: 2, teammateMatches: 217, opponentMatches: 78,
    partyPartners: 2, partyMatches: 146, partyMetricMatches: 146, partyWins: 94, partyLosses: 52 },
};

/**
 * Render the local-only relationships mockup view.
 * I/O: in () -> out `Promise<JSX.Element>`.
 *
 * refs: none
 */
export default async function RelationshipsMockup() {
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  let hostname = "";
  try { hostname = new URL(`http://${host}`).hostname; } catch { notFound(); }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) notFound();
  const { t } = await getServerLocalization();
  return <div className="space-y-4"><p className="text-sm text-pc-text-muted">{t("generated.stats.samples")}</p><PlayerRelationshipsView summary={summary} /></div>;
}
