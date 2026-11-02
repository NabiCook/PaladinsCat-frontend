/**
 * Compose one champion's ranked talent and loadout-card statistics.
 *
 * refs: none
 */
import { notFound } from "next/navigation";
import ChampionLoadoutStats from "./champion-loadout-stats";
import { getServerChampionData } from "@/lib/server-champion-data";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";
import { championSlug } from "@/lib/utils";

/**
 * Resolve canonical champion reference data before rendering its statistics.
 * I/O: in `(params: Promise<{ name: string }>)` -> out `Promise<JSX.Element>`.
 *
 * refs: none
 */
export default async function ChampionLoadoutStatsPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const champion = STATIC_CHAMPIONS.find((entry) => championSlug(entry.name) === championSlug(name));
  if (!champion) notFound();
  const championData = await getServerChampionData(championSlug(champion.name));
  if (!championData) notFound();
  return <ChampionLoadoutStats championId={champion.id} championData={championData} />;
}
