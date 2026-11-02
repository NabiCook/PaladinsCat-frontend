/**
 * Render tier list board.
 * refs: none
 */
"use client";

import { useEffect, useState, type RefObject } from "react";
import SmartImage from "@/components/SmartImage";
import { getChampionUltimate, type ChampionUltimate } from "@/lib/champion-data";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { mapLoadingImagePath } from "@/lib/map-images";
import { getMapTierItem } from "@/lib/map-tier-list";
import type { TierListEntry, TierListMode, TierName } from "@/lib/tierlists-api";

/**
 * Order tier-list rows from S through A, B, C, D, and F.
 * refs: none
 */
export const TIER_ORDER: TierName[] = ["S", "A", "B", "C", "D", "F"];

const TIER_TONES: Record<TierName, string> = {
  S: "border-rose-400/50 bg-rose-500/15 text-rose-200",
  A: "border-orange-400/50 bg-orange-500/15 text-orange-200",
  B: "border-amber-400/50 bg-amber-500/15 text-amber-200",
  C: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200",
  D: "border-sky-400/50 bg-sky-500/15 text-sky-200",
  F: "border-violet-400/50 bg-violet-500/15 text-violet-200",
};

/**
 * Return the configured CSS class string for the supplied tier from TIER_TONES.
 * refs: none
 * I/O types: `tier: TierName -> string`.
 */
export function tierTone(tier: TierName): string {
  return TIER_TONES[tier];
}

/**
 * Render tier list board.
 * refs: none
 * I/O types: `{ entries: TierListEntry[], compact?: boolean, mode?: TierListMode, boardRef?: RefObject<HTMLDivElement | null> }` -> JSX.Element.
 */
export default function TierListBoard({
  entries,
  compact = false,
  mode = "champion",
  boardRef,
}: {
  entries: TierListEntry[];
  compact?: boolean;
  mode?: TierListMode;
  boardRef?: RefObject<HTMLDivElement | null>;
}) {
  const [ultimates, setUltimates] = useState<Record<number, ChampionUltimate>>({});

  useEffect(() => {
    let active = true;
    if (mode !== "ultimate") {
      return () => { active = false; };
    }
    const championNames = Array.from(new Map(entries.flatMap((entry) => entry.entityType === "champion" ? [[entry.championId, entry.championName] as const] : [])).entries());
    void Promise.all(championNames.map(async ([championId, championName]) => [championId, await getChampionUltimate(championName)] as const))
      .then((resolved) => {
        if (!active) return;
        const next: Record<number, ChampionUltimate> = {};
        for (const [championId, ultimate] of resolved) {
          if (ultimate) next[championId] = ultimate;
        }
        setUltimates(next);
      })
      .catch(() => { if (active) setUltimates({}); });
    return () => { active = false; };
  }, [entries, mode]);

  return <div ref={boardRef} className="overflow-hidden rounded-xl border border-pc-border bg-pc-bg-secondary/50">
    {TIER_ORDER.map((tier) => {
      const champions = entries.filter((entry) => entry.tier === tier).sort((a, b) => a.position - b.position);
      return <div key={tier} className="grid grid-cols-[3.25rem_minmax(0,1fr)] border-b border-pc-border/70 last:border-b-0 sm:grid-cols-[4.25rem_minmax(0,1fr)]">
        <div className={`flex items-center justify-center border-r text-xl font-black sm:text-2xl ${TIER_TONES[tier]}`}>{tier}</div>
        <div className={`flex min-h-14 flex-wrap content-start gap-1.5 p-2 ${compact ? "sm:min-h-16" : "sm:min-h-20 sm:gap-2 sm:p-3"}`}>
          {champions.map((entry) => {
            if (entry.entityType === "map") {
              const map = getMapTierItem(entry.mapName);
              const label = map?.name ?? entry.mapName;
              return <div key={entry.mapName} title={label} className="group relative">
                <SmartImage src={mapLoadingImagePath(label)} alt={label} className={`${compact ? "w-14 sm:w-20" : "w-20 sm:w-24"} aspect-video rounded-lg border border-pc-border bg-pc-bg object-cover`} />
                {!compact && <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/75 px-1 py-0.5 text-center text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">{label}{map && <span className="block text-xs text-white/75">{map.classifications.join(" · ")}</span>}</span>}
              </div>;
            }
            const ultimate = mode === "ultimate" ? ultimates[entry.championId] : undefined;
            const label = ultimate?.name ?? entry.championName;
            const image = ultimate?.iconUrl ?? getChampionIconSafe(entry.championName);
            return <div key={entry.championId} title={label} className="group relative">
              <img src={image} alt={label} className={`${compact ? "h-9 w-9 sm:h-11 sm:w-11" : "h-11 w-11 sm:h-14 sm:w-14"} rounded-lg border border-pc-border bg-pc-bg object-contain`} />
              {!compact && <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/75 px-1 py-0.5 text-center text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">{label}{ultimate && <span className="block text-xs text-white/75">{entry.championName}</span>}</span>}
            </div>;
          })}
        </div>
      </div>;
    })}
  </div>;
}
