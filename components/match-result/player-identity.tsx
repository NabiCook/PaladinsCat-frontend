/**
 * Renders player identity data for match-result views.
 * Keeps the component's interaction and accessibility behavior intact.
 * refs: none
 */
"use client";

import Link from "next/link";
import PlayerName, { PlayerModerationTag } from "@/components/player-name";
import type { MatchPlayerDetail } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import { useAuth } from "@/lib/auth-context";
import { verifiedDestination } from "@/lib/verified-access";

/**
 * Render trackedPrivateId from its declared props and match data.
 * Contract: consumes the declared props, preserves event and accessibility behavior, and returns the corresponding UI element.
 * refs: none
 * I/O types: `player: MatchPlayerDetail -> number | null`.
 */
export function trackedPrivateId(player: MatchPlayerDetail): number | null {
  const privateId = Number(player.private_player_id ?? 0);
  return Number(player.player_id) === 0 && Number.isInteger(privateId) && privateId > 0 ? privateId : null;
}

/**
 * Render matchPlayerKey from its declared props and match data.
 * Contract: consumes the declared props, preserves event and accessibility behavior, and returns the corresponding UI element.
 * refs: none
 * I/O types: `player: MatchPlayerDetail -> string`.
 */
export function matchPlayerKey(player: MatchPlayerDetail): string {
  const privateId = trackedPrivateId(player);
  if (privateId) return `private:${privateId}:${Number(player.private_slot ?? 0)}`;
  return `player:${Number(player.player_id)}:${Number(player.private_slot ?? 0)}`;
}

/**
 * Render matchPlayerHref from its declared props and match data.
 * Contract: consumes the declared props, preserves event and accessibility behavior, and returns the corresponding UI element.
 * refs: none
 * I/O types: `player: MatchPlayerDetail -> string | null`.
 */
export function matchPlayerHref(player: MatchPlayerDetail): string | null {
  const privateId = trackedPrivateId(player);
  if (privateId) return `/players/private-tracking/${privateId}`;
  const playerId = Number(player.player_id);
  return playerId > 0 ? `/players/${playerId}` : null;
}

/**
 * Render privateAccountCode from its declared props and match data.
 * Contract: consumes the declared props, preserves event and accessibility behavior, and returns the corresponding UI element.
 * refs: none
 * I/O types: `player: MatchPlayerDetail -> string | null`.
 */
export function privateAccountCode(player: MatchPlayerDetail): string | null {
  const privateId = trackedPrivateId(player);
  if (!privateId) return null;
  const alias = String(player.private_account_alias ?? "").trim();
  if (alias && !/^private-\d+$/i.test(alias)) return alias;
  return `P-${String(privateId).padStart(6, "0")}`;
}

/**
 * Render MatchPlayerLink from its declared props and match data.
 * Contract: consumes the declared props, preserves event and accessibility behavior, and returns the corresponding UI element.
 * refs: none
 * I/O types: `{ player, className = "" }: { player: MatchPlayerDetail; className?: string } -> JSX.Element`.
 */
export function MatchPlayerLink({ player, className = "" }: { player: MatchPlayerDetail; className?: string }) {
  const { t } = useLocalization();
  const { user, isLoading } = useAuth();
  const privateId = trackedPrivateId(player);
  const href = matchPlayerHref(player);
  const content = privateId ? (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <span>{t("generated.matches.privateAccount")}</span>
      <span className="ml-1 inline-flex rounded border border-violet-400/30 bg-violet-400/10 px-1.5 py-0.5 align-middle text-[0.68em] font-bold uppercase tracking-wide text-violet-200">#{privateId}</span>
      <PlayerModerationTag
        playerId={0}
        cheater={player.profile_snapshot?.cheater === true}
        susCount={player.profile_snapshot?.sus_count ?? 0}
        verified={false}
      />
    </span>
  ) : Number(player.player_id) === 0 ? (
    <span>{t("generated.matches.privateAccount")}</span>
  ) : (
    <PlayerName
      playerId={player.player_id}
      cheater={player.profile_snapshot?.cheater}
      exploiter={player.profile_snapshot?.exploiter}
      susCount={player.profile_snapshot?.sus_count}
      verified={player.profile_snapshot?.verified}
    >
      {player.player_name || t("generated.matches.unknown")}
    </PlayerName>
  );

  const destination = href ? verifiedDestination(href, user, isLoading) : null;
  return href ? <Link href={destination ?? href} aria-disabled={isLoading} onClick={isLoading ? (event) => event.preventDefault() : undefined} className={className} title={privateId ? t("generated.matches.privateAccountValue1", { value1: privateId }) : player.player_name}>{content}</Link> : <span className={className}>{content}</span>;
}

/**
 * Render MatchPlayerReference from its declared props and match data.
 * Contract: consumes the declared props, preserves event and accessibility behavior, and returns the corresponding UI element.
 * refs: none
 * I/O types: `{ player, className = "" }: { player: MatchPlayerDetail; className?: string } -> JSX.Element`.
 */
export function MatchPlayerReference({ player, className = "" }: { player: MatchPlayerDetail; className?: string }) {
  const { t } = useLocalization();
  const { user, isLoading } = useAuth();
  const privateId = trackedPrivateId(player);
  const privateCode = privateAccountCode(player);
  if (privateId) {
    const href = `/players/private-tracking/${privateId}`;
    const destination = verifiedDestination(href, user, isLoading);
    return <Link href={destination ?? href} aria-disabled={isLoading} onClick={isLoading ? (event) => event.preventDefault() : undefined} className={className}>{privateCode}</Link>;
  }
  if (Number(player.player_id) === 0) return <span className={className}>{t("generated.matches.p")}</span>;
  return <span className={className}>{t("generated.matches.pid")}{" "}{player.player_id}</span>;
}
