/**
 * Preserve legacy talent links while loadout statistics live under `/stats`.
 *
 * refs: none
 */
import { redirect } from "next/navigation";
import { championSlug } from "@/lib/utils";

/**
 * Redirect the former champion talent-stat route to its canonical stats owner.
 * I/O: in `(params: Promise<{ name: string; talentId: string }>)` -> out `Promise<never>`.
 *
 * refs: none
 */
export default async function LegacyChampionTalentPage({ params }: { params: Promise<{ name: string; talentId: string }> }) {
  const { name, talentId } = await params;
  const query = new URLSearchParams({ talentId });
  redirect(`/stats/loadouts/${championSlug(name)}?${query.toString()}`);
}
