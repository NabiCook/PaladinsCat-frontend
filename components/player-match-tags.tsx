/**
 * Player match tags — render every contribution earned by a match.
 *
 * Owns the `PlayerMatchTags` component. Maps performance match tags to
 * moderation badges; no player lookup, no aggregate threshold.
 *
 * refs: none
 */
"use client";

import { PlayerModerationTag } from "@/components/player-name";
import type { PerformanceMatchTag } from "@/lib/player-match-tags";

const AUTOMATIC_TAG: Partial<Record<PerformanceMatchTag, "TANK" | "SUP" | "DPS" | "FLANK" | "NOOB" | "CARRY">> = {
  tank_diff: "TANK", support_diff: "SUP", dps_diff: "DPS",
  flank_diff: "FLANK", noob: "NOOB", hypercarry: "CARRY",
};

/**
 * Show every contribution earned by this match; no badge-count threshold.
 * I/O: in `{ tags: readonly PerformanceMatchTag[] }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function PlayerMatchTags({ tags }: { tags: readonly PerformanceMatchTag[] }) {
  return <span className="inline-flex flex-wrap items-center gap-1">
    {tags.map((tag) => <span key={tag} data-performance-tag={tag}>
      {/* A supplied evidence badge with no player lookup or aggregate threshold. */}
      <PlayerModerationTag playerId={0} automaticTag={AUTOMATIC_TAG[tag]}
        wallShooter={tag === "wall_shooter"} masterFeeding={tag === "master_feeding"}
        automaticAfk={tag === "automatic_afk"} />
    </span>)}
  </span>;
}
