/**
 * Preserve legacy card-stat links while loadout statistics live under `/stats`.
 *
 * refs: none
 */
import { redirect } from "next/navigation";
import { championSlug } from "@/lib/utils";

/**
 * Redirect the former champion card-stat route to its canonical stats owner.
 * I/O: in `(params: Promise<{ name: string; cardId: string }>, searchParams: Promise<{ talentId?: string }>)` -> out `Promise<never>`.
 *
 * refs: none
 */
export default async function LegacyChampionCardPage({ params, searchParams }: {
  params: Promise<{ name: string; cardId: string }>;
  searchParams: Promise<{ talentId?: string }>;
}) {
  const { name, cardId } = await params;
  const queryValues = await searchParams;
  const query = new URLSearchParams();
  if (queryValues.talentId) query.set("talentId", queryValues.talentId);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/stats/loadouts/${championSlug(name)}/cards/${cardId}${suffix}`);
}
