/**
 * Render the PlayerRelationshipsPage view for the player id relationships page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ErrorState, LoadingPanel } from "@/components/async-state";
import PlayerRelationshipsView from "@/components/player-relationships-view";
import { fetchPlayerRelationshipSummary, type PlayerRelationshipSummary, type RelationshipScope } from "@/lib/api-client";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLocalization } from "@/lib/localization-context";

/**
 * Render the PlayerRelationshipsPage view for the player id relationships page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function PlayerRelationshipsPage() {
  const { t } = useLocalization();
  const params = useParams<{ id: string }>();
  const playerId = String(params.id ?? "");
  const searchParams = useSearchParams();
  const router = useRouter();
  const scope: RelationshipScope = searchParams.get("scope") === "casual" ? "casual" : "ranked";
  const [loaded, setLoaded] = useState<PlayerRelationshipSummary | null>(null);
  const summary = loaded?.playerId === playerId && loaded.scope === scope ? loaded : null;
  const [failure, setFailure] = useState<{ playerId: string; scope: RelationshipScope; message: string } | null>(null);
  const error = failure?.playerId === playerId && failure.scope === scope ? failure.message : null;

  useEffect(() => {
    if (!playerId) return;
    let active = true;
    fetchPlayerRelationshipSummary(playerId, 50, scope).then((value) => {
      if (active) { setLoaded(value); setFailure(null); }
    }).catch((cause) => {
      if (active) setFailure({ playerId, scope, message: formatApiErrorMessage(cause, t, t("common.relationships.loadFailed")) });
    });
    return () => { active = false; };
  }, [playerId, scope, t]);

  return <div className="space-y-4">
    <SegmentedControl label={t("common.relationships.title")} items={[{ value: "ranked", label: t("generated.players.ranked") }, { value: "casual", label: t("generated.players.casual") }]} value={scope} onChange={value => { setFailure(null); router.replace(`/players/${playerId}/relationships?scope=${value}`, { scroll: false }); }} />
    {summary ? <PlayerRelationshipsView key={scope} summary={summary} /> : error ? <ErrorState title={t("common.relationships.loadFailed")} message={error} /> : <LoadingPanel />}
  </div>;
}
