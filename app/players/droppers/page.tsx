/**
 * Render the DroppersPage view for the player droppers page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import PlayerModerationDirectory from "@/components/player-moderation-directory";

/**
 * Render the DroppersPage view for the player droppers page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function DroppersPage() {
  return <PlayerModerationDirectory titleKey="moderation.droppersTitle" descriptionKey="moderation.droppersDescription" criteriaKey="moderation.dropperThresholdNotice" emptyKey="moderation.noDroppers" filter="dropperOnly" accentClass="bg-rose-400" borderClass="border-rose-400/20" voteClass="text-rose-200" />;
}
