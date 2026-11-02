/** Render the player's saved friends or blocked players and private, empty and unavailable states.
 * refs: endpoints: GET /players/{id}/friends · see: lib/player-friends-api.ts
 */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState, ErrorState } from "@/components/async-state";
import { DataCardSkeleton } from "@/components/route-skeleton";
import PlatformIcon from "@/components/platform-icon";
import PlayerName, { PLAYER_NAME_UNCLIPPED_CLASS } from "@/components/player-name";
import { useLocalization } from "@/lib/localization-context";
import { fetchPlayerFriends, type PlayerFriendsResponse } from "@/lib/player-friends-api";
import { ApiRequestError } from "@/lib/api-errors";

/**
 * Render friends and profile navigation. I/O: no inputs -> React.JSX.Element.
 * refs: endpoints: GET /players/{id}/friends
 * I/O types: `none -> JSX.Element`.
 */
export default function PlayerFriendsPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocalization();
  const [data, setData] = useState<PlayerFriendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [relationship, setRelationship] = useState<"Friend" | "Blocked">("Friend");
  const entries = data?.friends.filter(entry => entry.status === relationship) ?? [];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailure(null); setData(null);
    fetchPlayerFriends(id, { refresh: true, signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(error => { if (!controller.signal.aborted) setFailure(error instanceof Error ? error : new Error(String(error))); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, attempt]);
  return <div className="space-y-6">
    <PageHeader parentHref={`/players/${id}`} parentLabel={t("playerFriends.profile")} title={t("playerFriends.title")} />
    <SegmentedControl label={t("playerFriends.title")} value={relationship} onChange={setRelationship} items={[
      { value: "Friend", label: t("playerFriends.title") },
      { value: "Blocked", label: t("playerFriends.blocked") },
    ]} />
    <section className="min-h-56" aria-busy={loading}>
      {loading ? <DataCardSkeleton /> : failure || !data || data.status === "unavailable" ? <ErrorState title={t("playerFriends.title")} message={failure ?? new ApiRequestError(
        data?.refresh_error === "FRIENDS_REFRESH_THROTTLED"
          ? `Friends refresh for player ${id} was rate-limited. No saved friends list is available.`
          : data?.refresh_error === "FRIENDS_REFRESH_FAILED"
            ? `Hi-Rez friends refresh for player ${id} failed. No saved friends list is available.`
            : `No friends snapshot has been saved for player ${id}.`,
        undefined, { code: data?.refresh_error ?? "FRIENDS_NOT_FETCHED", method: "GET", endpoint: `/players/${id}/friends` },
      )} onRetry={() => setAttempt(value => value + 1)} /> : data.status === "private" ? <EmptyState title={t("playerFriends.private")} /> : <>
        {data.freshness.expired && <p className="mb-3 text-sm text-pc-text-muted" role="status">{t("playerFriends.stale")}</p>}
        {entries.length === 0 ? <EmptyState title={relationship === "Friend" ? t("playerFriends.empty") : t("playerFriends.blockedEmpty")} /> : <ul className="pc-card grid grid-cols-1 gap-x-6 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map(friend => <li key={friend.id} className="min-w-0 border-b border-pc-border">
            <Link href={`/players/${friend.id}`} className="flex min-h-14 min-w-0 items-center gap-2 py-3 text-pc-text hover:text-pc-accent">
              <PlatformIcon platform={friend.platform} />
              <PlayerName playerId={friend.id} className={PLAYER_NAME_UNCLIPPED_CLASS}>{friend.name}</PlayerName>
            </Link>
          </li>)}
        </ul>}
      </>}
    </section>
  </div>;
}
