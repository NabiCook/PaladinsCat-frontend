/**
 * Render the AfkWintradePage view for the player afk-wintrade page route.
 * This file owns the page, layout, loading state, or route handler named by its path.
 * It does not own unrelated player sections or shared library policy.
 * refs: none
 */
import PlayerModerationDirectory from "@/components/player-moderation-directory";

/**
 * Render the AfkWintradePage view for the player afk-wintrade page route.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function AfkWintradePage() {
  return <PlayerModerationDirectory titleKey="moderation.afkWintradeTitle" descriptionKey="moderation.afkWintradeDescription" criteriaKey="moderation.afkWintradeThresholdNotice" emptyKey="moderation.noAfkWintrade" filter="afkWintradeOnly" accentClass="bg-sky-400" borderClass="border-sky-400/30" voteClass="text-sky-200" />;
}
