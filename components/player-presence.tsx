/**
 * Player presence indicator — display-only Hi-Rez Activity status.
 *
 * Owns the `PlayerPresence` component. Renders a status chip from
 * `PlayerStatus`; the profile endpoint owns all fetching.
 *
 * refs: none
 */
"use client";

import { CircleHelp, CircleUserRound, Monitor, RefreshCw, Swords, Wifi, WifiOff } from "lucide-react";
import { useLocalization } from "@/lib/localization-context";
import type { PlayerStatus } from "@/lib/player-profile-types";

// Hi-Rez Activity values. Display only: the profile endpoint owns all fetching.
const statuses = [
  { key: "common.playerPresence.offline", icon: WifiOff, color: "text-pc-text-muted" },
  { key: "common.playerPresence.lobby", icon: Monitor, color: "text-sky-300" },
  { key: "common.playerPresence.selection", icon: CircleUserRound, color: "text-amber-300" },
  { key: "common.playerPresence.match", icon: Swords, color: "text-pc-accent" },
  { key: "common.playerPresence.online", icon: Wifi, color: "text-emerald-300" },
  { key: "common.playerPresence.unknown", icon: CircleHelp, color: "text-pc-text-muted" },
] as const;

/**
 * Render a display-only presence chip from a Hi-Rez activity status.
 * I/O: in `{ status?: PlayerStatus | null, error?: string | null, loading: boolean }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function PlayerPresence({ status, error, loading }: {
  status?: PlayerStatus | null; error?: string | null; loading: boolean;
}) {
  const { t } = useLocalization();
  const details = status && Number.isInteger(status.status) ? statuses[status.status] : undefined;
  const Icon = details?.icon ?? CircleHelp;
  // A failed refresh keeps the last known status; the warning stays in its title.
  const label = !status ? t("common.playerPresence.unavailable")
    : details ? t(details.key) : status.status_string?.trim() || t("common.playerPresence.unknown");
  return (
    <div data-testid="player-presence" role="status" aria-live="polite" aria-busy={loading}
      className="flex min-h-5 w-full items-center justify-end gap-1.5 text-xs font-medium">
      <span title={error || undefined} className={`inline-flex items-center gap-1.5 ${error ? "text-pc-text-muted" : details?.color ?? "text-pc-text-muted"}`}>
        {loading ? <RefreshCw aria-hidden="true" size={15} className="animate-spin motion-reduce:animate-none" /> : <Icon aria-hidden="true" size={15} />}
        <span className="break-words">{label}</span>
      </span>
    </div>
  );
}
