/**
 * Render /stats/player/[id]/charts using `RouteSkeleton`, `ContentFade`, `ResponsiveContainer`, `LineChart`.
 * refs: none
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";
import { useEffect, useState, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ContextBackLink from "@/components/context-back-link";
import { fetchPlayerChartHistory, fetchArchivedPlayerChartHistory, type KdaHistoryEntry, type DpmHistoryEntry, type GlickoHistoryEntry } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import { useRouteSettledLoading } from "@/lib/route-transition-context";
import { RouteSkeleton } from "@/components/route-skeleton";
import { ContentFade } from "@/components/async-state";

/**
 * Render /stats/player/[id]/charts using `RouteSkeleton`, `ContentFade`, `ResponsiveContainer`, `LineChart`.
 * refs: none
 * I/O types: `{ params }: { params: Promise<{ id: string }> } -> JSX.Element`.
 */
export default function PlayerChartsPage({ params }: { params: Promise<{ id: string }> }) {
  const { t , formatMonthDay} = useLocalization();
  const [kdaData, setKdaData] = useState<KdaHistoryEntry[]>([]);
  const [dpmData, setDpmData] = useState<DpmHistoryEntry[]>([]);
  const [glickoData, setGlickoData] = useState<GlickoHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [id, setId] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const [offset, setOffset] = useState(0);
  const request = useRef<AbortController | null>(null);
  const displayLoading = useRouteSettledLoading(loading);

  useEffect(() => {
    let cancelled = false;
    params.then((p) => { if (!cancelled) setId(p.id); });
    return () => { cancelled = true; request.current?.abort(); };
  }, [params]);

  const loadData = useCallback(async () => {
    if (!id) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOlder(false);
    setOffset(0); setKdaData([]); setDpmData([]); setGlickoData([]);
    setLoading(true);
    setError(null);
    try {
      const { kda, dpm, glicko } = await fetchPlayerChartHistory(id, days, 50, controller.signal);
      if (controller.signal.aborted) return;
      setKdaData(kda);
      setDpmData(dpm);
      setGlickoData(glicko);
    } catch (cause) {
      if (!controller.signal.aborted) setError(formatApiErrorMessage(cause, t, t("generated.stats.failedToLoadChartData")));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [id, days, t]);

  useEffect(() => {
    void loadData();
    return () => request.current?.abort();
  }, [loadData]);

  async function loadOlder(nextOffset = 0) {
    if (!id) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOlder(true); setOffset(nextOffset); setLoading(true); setError(null);
    setKdaData([]); setDpmData([]); setGlickoData([]);
    try {
      const data = await fetchArchivedPlayerChartHistory(id, 50, nextOffset, controller.signal);
      if (controller.signal.aborted) return;
      setKdaData(data.kda); setDpmData(data.dpm); setGlickoData(data.glicko);
    } catch (cause) {
      if (!controller.signal.aborted) setError(formatApiErrorMessage(cause, t, t("generated.stats.failedToLoadChartData")));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }


  if (displayLoading) return <RouteSkeleton variant="detail" />;

  return (
    <ContentFade className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <ContextBackLink fallbackHref={`/players/${id}`} label={t("generated.stats.backToProfile")} className="pc-touch-target" />
          <h1 className="pc-heading pc-heading-lg">{t("generated.stats.playerCharts")}</h1>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10))}
          className="pc-select w-full sm:w-auto"
        >
          <option value={7}>{t("generated.stats.last7Days")}</option>
          <option value={30}>{t("generated.stats.last30Days")}</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="pc-btn-secondary" aria-pressed={!older} onClick={() => void loadData()}>{t("history.recent")}</button>
        <button type="button" className="pc-btn-secondary" aria-pressed={older} onClick={() => void loadOlder()}>{t("history.loadOlderData")}</button>
        {older && <><button type="button" className="pc-btn-secondary" disabled={offset === 0} onClick={() => void loadOlder(Math.max(0, offset - 50))}>{t("generated.players.previous")}</button><button type="button" className="pc-btn-secondary" disabled={kdaData.length < 50} onClick={() => void loadOlder(offset + 50)}>{t("generated.players.next")}</button></>}
      </div>
      {error && <div role="alert" className="pc-card text-pc-text-muted">{error}<button type="button" className="pc-btn-secondary" onClick={() => older ? void loadOlder(offset) : void loadData()}>{t("async.tryAgain")}</button></div>}
      {older && !error && kdaData.length === 0 && <p className="text-pc-text-muted">{t("history.noOlderData")}</p>}

      {/* KDA Chart */}
      <div className="pc-card min-w-0 p-4 sm:p-6">
        <h2 className="pc-card-title mb-4">{t("generated.stats.kdaHistory")}</h2>
        {kdaData.length === 0 ? (
          <p className="text-pc-text-muted text-center py-8">{t("generated.stats.noKdaDataAvailable")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={kdaData.map((d) => ({ ...d, label: formatMonthDay(d.date) }))} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-bg-elevated)" />
              <XAxis dataKey="label" stroke="var(--pc-text-muted)" fontSize={12} />
              <YAxis stroke="var(--pc-text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--pc-bg-secondary)", border: "1px solid var(--pc-bg-elevated)", borderRadius: "0.5rem", color: "var(--pc-bg-elevated)" }}
                labelStyle={{ color: "var(--pc-text-muted)" }}
              />
              <Legend />
              <Line isAnimationActive={false} type="monotone" dataKey="kills" stroke="var(--pc-chart-green)" strokeWidth={2} dot={{ r: 3 }} />
              <Line isAnimationActive={false} type="monotone" dataKey="deaths" stroke="var(--pc-chart-red)" strokeWidth={2} dot={{ r: 3 }} />
              <Line isAnimationActive={false} type="monotone" dataKey="assists" stroke="var(--pc-chart-sky)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* DPM Chart */}
      <div className="pc-card min-w-0 p-4 sm:p-6">
        <h2 className="pc-card-title mb-4">{t("generated.stats.damagePerMinute")}</h2>
        {dpmData.length === 0 ? (
          <p className="text-pc-text-muted text-center py-8">{t("generated.stats.noDpmDataAvailable")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dpmData.map((d) => ({ ...d, label: formatMonthDay(d.date) }))} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-bg-elevated)" />
              <XAxis dataKey="label" stroke="var(--pc-text-muted)" fontSize={12} />
              <YAxis stroke="var(--pc-text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--pc-bg-secondary)", border: "1px solid var(--pc-bg-elevated)", borderRadius: "0.5rem", color: "var(--pc-bg-elevated)" }}
                labelStyle={{ color: "var(--pc-text-muted)" }}
              />
              <Legend />
              <Line isAnimationActive={false} type="monotone" dataKey="playerDpm" stroke="var(--pc-chart-green)" strokeWidth={2} dot={{ r: 3 }} name={t("generated.stats.player.[id].charts.page.playerdpm")} />
              <Line isAnimationActive={false} type="monotone" dataKey="avgDpm" stroke="var(--pc-chart-amber)" strokeWidth={2} dot={{ r: 3 }} name={t("generated.stats.player.[id].charts.page.serveraverage")} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Glicko-2 Chart */}
      <div className="pc-card min-w-0 p-4 sm:p-6">
        <h2 className="pc-card-title mb-4">{t("generated.stats.glicko2Rating")}</h2>
        {glickoData.length === 0 ? (
          <p className="text-pc-text-muted text-center py-8">{t("generated.stats.noRatingDataAvailable")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={glickoData.map((d) => ({ ...d, label: formatMonthDay(d.date) }))} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-bg-elevated)" />
              <XAxis dataKey="label" stroke="var(--pc-text-muted)" fontSize={12} />
              <YAxis stroke="var(--pc-text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--pc-bg-secondary)", border: "1px solid var(--pc-bg-elevated)", borderRadius: "0.5rem", color: "var(--pc-bg-elevated)" }}
                labelStyle={{ color: "var(--pc-text-muted)" }}
              />
              <Legend />
              <Line isAnimationActive={false} type="monotone" dataKey="rating" stroke="var(--pc-chart-violet)" strokeWidth={2} dot={{ r: 3 }} name={t("generated.stats.player.[id].charts.page.rating")} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </ContentFade>
  );
}
