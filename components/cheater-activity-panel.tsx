/**
 * Render cheater-only hourly charts and queue/platform/region player breakdowns.
 * Fetches one read-only aggregate; queue changes select existing series locally.
 *
 * refs:
 *   doc: documents/02-technical/api/paladinscat-api-internal.md
 *   endpoints: GET /cheaters/activity
 */
"use client";

import { useEffect, useState } from "react";
import { LoadingPanel } from "@/components/async-state";
import { ActivityBar, HourlyCardHeader, PlayerPresenceBreakdown, REGION_COLORS } from "@/components/player-activity-panel";
import { fetchCheaterActivity, type CheaterActivity } from "@/lib/api-client";
import { stationaryChartSeries } from "@/lib/chart-colors";
import { useLocalization } from "@/lib/localization-context";

const colors: Record<string, string> = { ...REGION_COLORS, SA: stationaryChartSeries.orange, ASIA: stationaryChartSeries.violet };

let pendingActivity: Promise<CheaterActivity> | null = null;

/** Share an unfinished load when account initialization remounts the panel. */
function loadActivity() {
  pendingActivity ??= fetchCheaterActivity().finally(() => { pendingActivity = null; });
  return pendingActivity;
}

/**
 * Reuse the activity-page anatomy for distinct cheater matches and players.
 * I/O: in () -> out `JSX.Element`.
 *
 * refs: endpoints: GET /cheaters/activity
 */
export default function CheaterActivityPanel() {
  const { t, formatNumber, formatHourFromUtcBucket } = useLocalization();
  const [activity, setActivity] = useState<CheaterActivity | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<"all" | number>("all");

  useEffect(() => {
    let active = true;
    loadActivity().then(data => { if (active) setActivity(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const selected = queue === "all" ? activity : activity?.queues.find(item => item.queueId === queue);
  const titles = {
    matches: `${t("generated.players.cheaters")} · ${t("playerActivity.matches24h")}`,
    players: `${t("generated.players.cheaters")} · ${t("playerActivity.players24h")}`,
  };

  return <div className="space-y-6">
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="cheater-activity">
    {(["matches", "players"] as const).map(metric => {
      const series = selected?.[metric];
      const max = Math.max(1, ...(series?.hourly.map(hour => hour.total) ?? []));
      const regionOrder = series?.regions.map(region => region.region) ?? [];
      return <section key={metric} className="pc-card min-w-0 p-3 sm:p-4">
        <HourlyCardHeader
          title={titles[metric]}
          queueLabel={t("playerActivity.queue")}
          allQueuesLabel={t("playerActivity.allQueues")}
          queues={activity?.queues ?? []}
          selectedQueue={queue}
          onQueueChange={setQueue}
          total={series?.total24h ?? null}
          formatNumber={formatNumber}
        />
        {failed ? <p role="status" className="flex min-h-[30rem] items-center justify-center text-center text-sm text-pc-text-muted">{t("async.couldNotLoad")}</p>
          : !series ? <LoadingPanel compact className="min-h-[30rem]" /> : <div>
            <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
              {series.regions.map(({ region, total24h }) => <span key={region} className="inline-flex items-center gap-1.5 text-xs text-pc-text-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[region] ?? colors.Unknown }} />
                {region} · {formatNumber(total24h)}
              </span>)}
              {series.regions.length === 0 && <span className="text-xs text-pc-text-muted">{t(metric === "matches" ? "playerActivity.noMatches" : "playerActivity.noPlayers")}</span>}
            </div>
            <div className="grid grid-cols-[3.5rem_1fr_2.5rem] gap-2 border-b border-pc-border/30 px-1 pb-1 text-center text-xs uppercase text-pc-text-muted">
              <span>{t("generated.matches.localTime")}</span><span>{t("playerActivity.region")}</span><span>Σ</span>
            </div>
            {series.hourly.map((hour, index) => {
              const current = index === series.hourly.length - 1;
              return <div key={`${hour.date}|${hour.hour}`} data-activity-hour={`${hour.date}|${hour.hour}`} className={`grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2 rounded px-1 py-1 ${current ? "bg-pc-accent/8 ring-1 ring-pc-accent/20" : "hover:bg-pc-bg-secondary/50"}`}>
                <span suppressHydrationWarning className={`text-right font-mono text-xs ${current ? "font-semibold text-pc-accent" : "text-pc-text-muted"}`}>{formatHourFromUtcBucket(hour.date, hour.hour)}</span>
                <ActivityBar entry={hour} max={max} formatNumber={formatNumber} colors={colors} seriesOrder={regionOrder}
                  playersByRegion={metric === "players" ? hour.playersByRegion : undefined} />
                <span className={`text-right font-mono text-xs font-semibold ${hour.total > 0 ? "text-pc-text" : "text-pc-text-muted/30"}`}>{hour.total || "-"}</span>
              </div>;
            })}
          </div>}
      </section>;
    })}
  </div>
  {activity?.breakdown && <div data-testid="cheater-presence-breakdown">
    <PlayerPresenceBreakdown
      presence={activity.breakdown}
      exact
      showStatements={false}
      formatNumber={formatNumber}
      title={titles.players}
      queueTitle={t("playerActivity.playersByQueue")}
      platformTitle={t("playerActivity.playersByPlatform")}
      regionTitle={t("playerActivity.playersByRegion")}
      publicLabel={t("playerActivity.publicPlayers24h")}
      privateLabel={t("playerActivity.privatePlayers24h")}
      unresolvedLabel={t("playerActivity.unresolvedPrivate24h")}
      unresolvedRangeLabel={t("playerActivity.unresolvedPlayerRange")}
      possibleTotalLabel={t("playerActivity.possiblePlayerTotal")}
      coverageLabel={t("playerActivity.platformCoverage")}
      overlapNote={t("playerActivity.queueOverlapNote")}
      detailsLabel={t("generated.matches.details")}
    />
  </div>}
  </div>;
}
