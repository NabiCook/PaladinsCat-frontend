/**
 * Render player activity statistics, seeding the client view with server data when available. · refs: none
 * refs: none
 */
import { fetchAccountServerJson } from "@/lib/server-api";
import { Suspense } from "react";
import { LoadingPanel } from "@/components/async-state";
import PageHeader from "@/components/ui/page-header";
import { getServerLocalization } from "@/lib/server-localization";
import PlayerActivityPanel, { type PlayerActivityInitialData } from "@/components/player-activity-panel";

async function ActivityContent() {
  const overview = await fetchAccountServerJson<PlayerActivityInitialData["overview"]>("/matches/overview?view=activity-v3").catch(() => null);
  return <PlayerActivityPanel showStatements={false} initialData={{ overview, presence: null, presenceHourly: null }} />;
}

// Render the data-bearing activity page on the first response. The browser
// retains its minute refreshes, but a cold visitor no longer waits for JS
// hydration before the charts become visible.
/**
 * Selects request-fresh rendering for statistics data.
 * Returns: `Promise<React.JSX.Element>`
 * refs: none
 */
export const dynamic = "force-dynamic";

/**
 * Render player activity statistics, seeding the client view with server data when available. · refs: none
 * I/O types: `none -> Promise<JSX.Element>`.
 */
export default async function PlayerActivityPage() {
  const { t } = await getServerLocalization();
  return (
    <div className="pc-player-activity-page space-y-6">
      <PageHeader parentHref="/stats" parentLabel={t("menu.globalStats")} title={t("menu.playerActivity")} description={t("stats.portal.activityDescription")} />
      <Suspense fallback={<LoadingPanel compact className="min-h-[30rem]" />}>
        <ActivityContent />
      </Suspense>
    </div>
  );
}
