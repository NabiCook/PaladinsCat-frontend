/**
 * A player name with its confirmed-cheater or suspicious-player label. · refs: none
 * refs: none
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchPlayerModeration, mergePlayerModeration, type PlayerModeration } from "@/lib/player-moderation";
import { useAuth } from "@/lib/auth-context";
import { useLocalization } from "@/lib/localization-context";
import { hasPlayerTag, hasSuspiciousTag } from "@/lib/player-tag-threshold";
import SmartImage from "@/components/SmartImage";

const EMPTY_MODERATION: PlayerModeration = {
  cheater: false,
  exploiter: false,
  susCount: 0,
  dropper: false,
  dropperVoteCount: 0,
  afkWintrade: false,
  afkWintradeVoteCount: 0,
  boosted: false,
  boostedMatchCount: 0,
  altAccount: false,
  altAccountVoteCount: 0,
  automaticAfk: false,
  automaticAfkCount: 0,
  wallShooterCount: 0,
  masterFeedingCount: 0,
  tankDiffCount: 0,
  supportDiffCount: 0,
  dpsDiffCount: 0,
  flankDiffCount: 0,
  noobCount: 0,
  hypercarryCount: 0,
  verified: false,
  customTag: null,
  customTagColor: null,
};

const PLAYER_TAG_CLASS = "player-status-tag shrink-0 rounded bg-[var(--pc-bg-secondary)] px-1.5 py-0.5 text-xs font-bold leading-none";
export const PLAYER_NAME_UNCLIPPED_CLASS = "max-h-none! overflow-visible! [&>span:last-child]:max-h-none [&>span:last-child]:overflow-visible";
const AUTOMATIC_TAG_ACCENT: Record<NonNullable<PlayerModerationTagProps["automaticTag"]>, string> = {
  TANK: "text-sky-300",
  SUP: "text-emerald-300",
  DPS: "text-orange-300",
  FLANK: "text-violet-300",
  NOOB: "text-amber-300",
  CARRY: "text-cyan-300",
};

/**
 * Render verified player badge.
 * refs: none
 * I/O types: `{ className = "", iconClassName = "h-3.5 w-3.5" }: { className?: string; iconClassName?: string } -> JSX.Element`.
 */
export function VerifiedPlayerBadge({ className = "", iconClassName = "h-3.5 w-3.5" }: { className?: string; iconClassName?: string }) {
  const { t } = useLocalization();
  return (
    <span className={`inline-flex shrink-0 ${className}`} role="img" aria-label={t("generated.players.verifiedPaladinscatPlayer")} title={t("generated.players.verifiedPaladinscatPlayer")}>
      <SmartImage src="/images/icons/Verified_Player_Support_Icon.avif" alt="" className={`verified-player-icon ${iconClassName} object-contain`} />
    </span>
  );
}

/**
 * Define player moderation tag props as `{ playerId: string | number; cheater?: boolean; exploiter?: boolean; susCount?: number; dropper?: boolean; dropperVoteCount?: number; afkWintrade?: boolean; afkWintradeVoteCount?: number; automaticAfk?: boolean; automaticAfkCount?: number; wallShooter?: boolean; wallShooterCount?: number; masterFeeding?: boolean; masterFeedingCount?: number; automaticTag?: "TANK" | "SUP" | "DPS" | "FLANK" | "NOOB" | "CARRY"; boosted?: boolean; boostedMatchCount?: number; altAccount?: boolean; altAccountVoteCount?: number; verified?: boolean; }`.
 * refs: none
 */
export type PlayerModerationTagProps = {
  playerId: string | number;
  cheater?: boolean;
  exploiter?: boolean;
  susCount?: number;
  dropper?: boolean;
  dropperVoteCount?: number;
  afkWintrade?: boolean;
  afkWintradeVoteCount?: number;
  automaticAfk?: boolean;
  automaticAfkCount?: number;
  wallShooter?: boolean;
  wallShooterCount?: number;
  masterFeeding?: boolean;
  masterFeedingCount?: number;
  automaticTag?: "TANK" | "SUP" | "DPS" | "FLANK" | "NOOB" | "CARRY";
  boosted?: boolean;
  boostedMatchCount?: number;
  altAccount?: boolean;
  altAccountVoteCount?: number;
  verified?: boolean;
  customTag?: string | null;
  customTagColor?: string | null;
};

/**
 * Render player moderation tag with `VerifiedPlayerBadge`.
 * refs: none
 * I/O types: `{ playerId, cheater, exploiter, susCount, dropper, dropperVoteCount, afkWintrade, afkWintradeVoteCount, automaticAfk, automaticAfkCount, wallShooter, wallShooterCount, masterFeeding, masterFeedingCount, automaticTag, boosted, boostedMatchCount, altAccount, altAccountVoteCount, verified, }: PlayerModerationTagProps -> JSX.Element`.
 */
export function PlayerModerationTag({
  playerId,
  cheater,
  exploiter,
  susCount,
  dropper,
  dropperVoteCount,
  afkWintrade,
  afkWintradeVoteCount,
  automaticAfk,
  automaticAfkCount,
  wallShooter,
  wallShooterCount,
  masterFeeding,
  masterFeedingCount,
  automaticTag,
  boosted,
  boostedMatchCount,
  altAccount,
  altAccountVoteCount,
  verified,
  customTag,
  customTagColor,
}: PlayerModerationTagProps) {
  const { user } = useAuth();
  const canLookup = user?.linkedPlayerId != null;
  const { t } = useLocalization();
  const suppliedModeration = {
    cheater,
    exploiter,
    susCount,
    dropper,
    dropperVoteCount,
    afkWintrade,
    afkWintradeVoteCount,
    automaticAfk,
    automaticAfkCount,
    wallShooterCount,
    masterFeedingCount,
    boosted,
    boostedMatchCount,
    altAccount,
    altAccountVoteCount,
    verified,
  };
  const [moderation, setModeration] = useState<PlayerModeration>(() => (
    mergePlayerModeration(EMPTY_MODERATION, suppliedModeration)
  ));

  useEffect(() => {
    // Preserve every moderation field supplied by the owning data surface.
    // Some callers know the canonical cheater/suspicious values but still need
    // the stored-account verification bit. The older all-or-nothing merge let
    // the secondary bulk request overwrite those supplied values, which made a
    // match row banner and its CHEATER tag disagree while their caches expired.
    setModeration(mergePlayerModeration(EMPTY_MODERATION, suppliedModeration));
    if (!canLookup) return;
    let active = true;
    fetchPlayerModeration(playerId).then((state) => {
      if (active) {
        setModeration(mergePlayerModeration(state, suppliedModeration));
      }
    });
    return () => { active = false; };
  }, [canLookup, afkWintrade, afkWintradeVoteCount, altAccount, altAccountVoteCount, automaticAfk, automaticAfkCount, boosted, boostedMatchCount, cheater, dropper, dropperVoteCount, exploiter, masterFeedingCount, playerId, susCount, verified, wallShooterCount]);

  const communityAfk = moderation.afkWintrade && hasPlayerTag(moderation.afkWintradeVoteCount);
  const automaticAfkTagged = moderation.automaticAfk;
  const automaticTags = ([
    ["TANK", moderation.tankDiffCount],
    ["SUP", moderation.supportDiffCount],
    ["DPS", moderation.dpsDiffCount],
    ["FLANK", moderation.flankDiffCount],
    ["NOOB", moderation.noobCount],
    ["CARRY", moderation.hypercarryCount],
  ] as const).filter(([, count]) => hasPlayerTag(count)).map(([tag]) => tag);
  if (automaticTag && !automaticTags.includes(automaticTag)) automaticTags.push(automaticTag);
  const effectiveCustomTag = customTag ?? moderation.customTag;
  const color = customTagColor ?? moderation.customTagColor;
  const customStyle = color && /^#[0-9a-f]{6}$/i.test(color)
    ? { color, borderColor: `${color}80` }
    : undefined;

  return <span className="inline-flex max-h-10 min-w-0 flex-wrap items-center gap-1 overflow-hidden">
    {effectiveCustomTag && <span className={`${PLAYER_TAG_CLASS} custom-tag border border-violet-400/50 text-violet-300`} style={customStyle} title={t("moderation.customTag")}>{effectiveCustomTag}</span>}
    {moderation.verified && <VerifiedPlayerBadge />}
    {moderation.cheater && <span className={`${PLAYER_TAG_CLASS} cheater text-red-400`} aria-label={t("generated.players.confirmedCheater")}>{t("generated.players.cheater")}</span>}
    {moderation.exploiter && <span className={`${PLAYER_TAG_CLASS} exploiter text-orange-400`} aria-label={t("moderation.exploiterAria")}>{t("moderation.exploiterShort")}</span>}
    {!moderation.cheater && !moderation.exploiter && <>
      {moderation.dropper && hasPlayerTag(moderation.dropperVoteCount) && <span className={`${PLAYER_TAG_CLASS} dropper text-rose-300`}>{t("moderation.dropShort")}</span>}
      {hasSuspiciousTag(moderation.susCount) && <span className={`${PLAYER_TAG_CLASS} suspicious text-amber-400`} aria-label={t("generated.players.suspiciousPlayerWithValue1Flags", { value1: moderation.susCount })}>{t("generated.players.sus")}</span>}
      {(communityAfk || automaticAfkTagged) && <span className={`${PLAYER_TAG_CLASS} afk border ${automaticAfkTagged ? communityAfk ? "border-red-400/50 text-sky-300" : "border-red-400/50 text-red-300" : "border-sky-400/50 text-sky-300"}`}>{t("moderation.afkShort")}</span>}
      {(wallShooter || hasPlayerTag(moderation.wallShooterCount)) && <span className={`${PLAYER_TAG_CLASS} wall-shooter text-cyan-300`}>{t("moderation.wallShort")}</span>}
      {(masterFeeding || hasPlayerTag(moderation.masterFeedingCount)) && <span className={`${PLAYER_TAG_CLASS} master-feeding text-rose-300`}>{t("moderation.feedShort")}</span>}
      {automaticTags.map((tag) => <span key={tag} className={`${PLAYER_TAG_CLASS} performance-diff ${AUTOMATIC_TAG_ACCENT[tag]}`}>{tag}</span>)}
      {moderation.boosted && hasPlayerTag(moderation.boostedMatchCount) && <span className={`${PLAYER_TAG_CLASS} boosted text-orange-300`}>{t("moderation.boostedShort")}</span>}
      {moderation.altAccount && hasPlayerTag(moderation.altAccountVoteCount) && <span className={`${PLAYER_TAG_CLASS} alt text-violet-300`}>{t("moderation.altShort")}</span>}
    </>}
  </span>;
}

/**
 * A player name with its confirmed-cheater or suspicious-player label. · refs: none
 * I/O types: `{ playerId, children, className = "", ...moderation }: PlayerModerationTagProps & { children: ReactNode; className?: string; } -> JSX.Element`.
 */
export default function PlayerName({
  playerId,
  children,
  className = "",
  ...moderation
}: PlayerModerationTagProps & {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex max-h-10 max-w-full min-w-0 flex-wrap items-center gap-1 overflow-hidden align-middle ${className}`}>
      <span className="min-w-0 truncate">{children}</span>
      <PlayerModerationTag playerId={playerId} {...moderation} />
    </span>
  );
}
