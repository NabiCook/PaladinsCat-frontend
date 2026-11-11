/**
 * Share the admin/developer dashboard without exporting custom page props.
 * Retain mode-specific authorization, telemetry, and administrative controls.
 * refs: ./page.tsx; ../operations/developer/page.tsx
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Bell, Database, Eye, EyeOff, Gamepad2, Gauge, KeyRound, RefreshCw, ScrollText, ShieldCheck, Tag, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { fetchAdminDashboard, searchManagedAccounts, updateManagedAccountRole, type AdminDashboard, type ManagedAccount } from "@/lib/admin-dashboard-api";
import { AnonymousPresenceCard } from "@/components/anonymous-presence-card";
import { ContentFade, ErrorState, LoadingPanel } from "@/components/async-state";
import { RouteSkeleton } from "@/components/route-skeleton";
import { getPercentageColor } from "@/lib/stat-quality";
import { formatLocalDateTime } from "@/lib/time-format";
import { useLocalization } from "@/lib/localization-context";

type AccountRole = "User" | "Moderator" | "Developer" | "Admin";
type PreviewAccount = { id: number; username: string; email: string | null; role: AccountRole };
const PREVIEW_DASHBOARD: AdminDashboard = {
  generatedAt: "2026-08-12T12:00:00Z",
  traffic: { summary: { viewsToday: 1294, views7d: 7420 }, daily: ["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"].map((date, index) => ({ date, pageViews: 688 + index * 81, matches: 920 + index * 33 })), topPages: [{ path: "/players", pageViews: 921 }, { path: "/matches", pageViews: 643 }, { path: "/champions", pageViews: 512 }] },
  maintenance: { consent: { acceptedAccounts: 64, declinedAccounts: 18, unsetAccounts: 39, obsoleteAccounts: 5, decidedAccounts: 82, acceptedShare: 78.05, averageActiveConsentSeconds: 3 * 86400 + 6 * 3600, lastEventAt: "2026-08-12T11:55:00Z" }, hourlyActivity: Array.from({ length: 24 }, (_, index) => ({ hour: new Date(Date.parse("2026-08-11T12:00:00Z") + index * 3600000).toISOString(), estimatedActivePages: 10 + (index % 5) * 5 })) },
  site: { totals: { matches: 248531, rankedMatches: 128650, casualMatches: 119881, directMatches: 234012, recoveredMatches: 14219, incompleteMatches: 300, players: 98234, registeredUsers: 126, verifiedAccounts: 88, communityBuilds: 87, databaseBytes: 1073741824 }, pipeline: { bufferPending: 0, bufferProjectionPending: 0, bufferProcessing: 1, bufferFailed: 0, bufferProcessed: 248531 } },
  hirez: { keys: [{ devId: "preview-key", status: "healthy", used: 120, dailyLimit: 5000, remaining: 4880, callsTotal: 20932, consecutiveFailures: 0, lastUsed: "2026-08-12T11:58:00Z", lastSyncAt: "2026-08-12T11:58:00Z", lastSyncError: null }], hourly: Array.from({ length: 12 }, (_, index) => ({ hour: `${String(index + 8).padStart(2, "0")}:00`, calls: 60 + index * 9 })), endpoints: [{ consumer: "frontend", endpoint: "getplayer", calls: 892, avgResponseMs: 183 }, { consumer: "worker", endpoint: "getmatchdetails", calls: 428, avgResponseMs: 241 }] },
};

/**
 * Render the shared dashboard using the selected admin or developer mode.
 * refs: ./page.tsx; ../operations/developer/page.tsx; @/lib/admin-dashboard-api
 * I/O types: `{ mode = "admin" }: { mode?: "admin" | "developer" } -> JSX.Element | null`.
 */
export default function AdminDashboardPage({ mode = "admin" }: { mode?: "admin" | "developer" }) {
  const { t, formatNumber, formatPercent, formatDateTime } = useLocalization();
  const formatBytes = (value: number) => formatNumber(value, { notation: "compact", maximumFractionDigits: 2, style: "unit", unit: "byte", unitDisplay: "short" });
  const formatConsentDuration = (seconds: number | null) => {
    if (seconds == null) return formatNumber(null);
    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    if (totalMinutes < 60) return t("common.format.minutesShort", { minutes: formatNumber(totalMinutes) });
    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return t("common.format.hoursShort", { hours: formatNumber(totalHours) });
    return t("common.format.daysHoursShort", { days: formatNumber(Math.floor(totalHours / 24)), hours: formatNumber(totalHours % 24) });
  };
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const developerMode = mode === "developer";
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showKeyIds, setShowKeyIds] = useState(false);
  const isAdmin = user?.isAdmin === true;
  const canView = developerMode ? user?.isAdmin === true || user?.isProjectDeveloper === true : isAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await fetchAdminDashboard(developerMode ? "developer" : "admin"));
    } catch (reason) {
      setError(formatApiErrorMessage(reason, t, t("generated.app.admin.page.admindashboardunavailable")));
    } finally {
      setLoading(false);
    }
  }, [developerMode, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/auth/login"); return; }
    if (!canView) { router.replace("/"); return; }
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [authLoading, user, canView, load, router]);

  const apiBudget = useMemo(() => {
    const keys = dashboard?.hirez.keys ?? [];
    return keys.reduce((total, key) => ({
      used: total.used + key.used,
      limit: total.limit + key.dailyLimit,
      remaining: total.remaining + key.remaining,
    }), { used: 0, limit: 0, remaining: 0 });
  }, [dashboard]);

  if (authLoading || !user || !canView) return <RouteSkeleton variant="dashboard" />;
  if (!dashboard && loading) return <RouteSkeleton variant="dashboard" />;
  if (!dashboard && error) return <ErrorState title={t("generated.admin.adminDashboardUnavailable")} message={error} onRetry={() => void load()} />;
  if (!dashboard) return null;

  const { summary } = dashboard.traffic;
  const totals = dashboard.site.totals;
  const pipeline = dashboard.site.pipeline;
  const budgetPercent = apiBudget.limit > 0 ? Math.min(100, (apiBudget.used / apiBudget.limit) * 100) : 0;
  const ingestCoverage = totals.matches > 0 ? ((totals.directMatches + totals.recoveredMatches) / totals.matches) * 100 : 0;
  const consent = dashboard.maintenance.consent;

  return (
    <ContentFade className="space-y-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-pc-text-muted">{t("generated.admin.privateOperations")}</div>
          <h1 className="pc-heading pc-heading-lg">{developerMode ? t("generated.operations.developer") : t("generated.admin.adminDashboard")}</h1>
          <p className="mt-1 text-sm text-pc-text-secondary">{t("generated.admin.trafficPlatformHealthIngestionAndHiRezQuotaTelemetry")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/admin/identity" target="_blank" rel="noreferrer" className="pc-btn-secondary inline-flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4" /> {t("generated.admin.identityAdmin")}</a>
          <Link href="/admin/notifications" className="pc-btn-secondary inline-flex items-center gap-2 text-sm"><Bell className="h-4 w-4" /> {t("generated.admin.notifications")}</Link>
          {isAdmin && <Link href="/admin/invitations" className="pc-btn-secondary inline-flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4" /> {t("invitation.adminTitle")}</Link>}
          <Link href="/admin/changelog" className="pc-btn-secondary inline-flex items-center gap-2 text-sm"><ScrollText className="h-4 w-4" /> {t("generated.admin.changelog")}</Link>
          <Link href="/admin/custom-tags" className="pc-btn-secondary inline-flex items-center gap-2 text-sm"><Tag className="h-4 w-4" /> {t("moderation.customTagReviewTitle")}</Link>
          <button type="button" onClick={() => void load()} disabled={loading} className="pc-btn-secondary inline-flex items-center gap-2 text-sm disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("generated.admin.refresh")}</button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">{t("generated.admin.showingThePreviousSnapshotRefreshFailed")}{" "}{error}</div>}

      <p className="text-xs text-pc-text-muted">{t("operations.anonymousTraffic")}</p>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard icon={Eye} label={t("generated.admin.pageViewsToday")} value={formatNumber(summary.viewsToday)} detail={t("generated.admin.valueOverSevenDays", { value: formatNumber(summary.views7d) })} />
        <MetricCard icon={Gamepad2} label={t("generated.admin.trackedMatches")} value={formatNumber(totals.matches)} detail={t("generated.admin.valueRanked", { value: formatNumber(totals.rankedMatches) })} />
        <MetricCard icon={Gauge} label={t("generated.admin.hiRezBudget")} value={formatNumber(apiBudget.remaining)} detail={t("generated.admin.budgetUsed", { used: formatNumber(apiBudget.used), limit: formatNumber(apiBudget.limit) })} />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="pc-card xl:col-span-2">
          <SectionTitle icon={ShieldCheck} title={t("generated.admin.consentMaintenance")} subtitle={t("generated.admin.consentMaintenanceSubtitle")} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SmallStat label={t("generated.admin.consentAccepted")} value={formatNumber(consent.acceptedAccounts)} />
            <SmallStat label={t("generated.admin.consentDeclined")} value={formatNumber(consent.declinedAccounts)} tone={consent.declinedAccounts > 0 ? "warn" : "normal"} />
            <SmallStat label={t("generated.admin.consentUnset")} value={formatNumber(consent.unsetAccounts)} />
            <SmallStat label={t("generated.admin.consentObsolete")} value={formatNumber(consent.obsoleteAccounts)} tone={consent.obsoleteAccounts > 0 ? "warn" : "normal"} />
            <SmallStat label={t("generated.admin.consentDecided")} value={formatNumber(consent.decidedAccounts)} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <SmallStat label={t("generated.admin.averageActiveConsent")} value={formatConsentDuration(consent.averageActiveConsentSeconds)} />
            <SmallStat label={t("generated.admin.acceptanceRate")} value={formatPercent(consent.acceptedShare)} />
          </div>
          <p className="mt-3 text-xs text-pc-text-muted">{t("generated.admin.lastConsentChange")} {consent.lastEventAt ? formatDateTime(consent.lastEventAt) : t("generated.admin.never")}</p>
          <HourlyActivityChart rows={dashboard.maintenance.hourlyActivity} />
        </div>
        <AnonymousPresenceCard />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="pc-card xl:col-span-2">
          <SectionTitle icon={Activity} title={t("generated.admin.traffic14Days")} subtitle={t("generated.admin.trafficSubtitle")} />
          <TrafficChart dashboard={dashboard} />
        </div>
        <div className="pc-card">
          <SectionTitle icon={Eye} title={t("generated.admin.topPages7Days")} subtitle={t("generated.admin.topPagesSubtitle")} />
          <div className="mt-4 space-y-2">
            {dashboard.traffic.topPages.map((page, index) => (
              <div key={page.path} className="flex items-center gap-3 rounded-lg border border-pc-border/50 bg-pc-bg/35 px-3 py-2">
                <span className="w-5 text-xs font-bold text-pc-text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-pc-text" title={page.path}>{page.path}</span>
                <span className="text-xs font-semibold tabular-nums text-pc-accent">{formatNumber(page.pageViews)}</span>
              </div>
            ))}
            {dashboard.traffic.topPages.length === 0 && <div className="py-10 text-center text-xs text-pc-text-muted">{t("generated.admin.trafficCollectionBeginsAfterThisUpdateIsDeployed")}</div>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="pc-card xl:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <SectionTitle icon={KeyRound} title={t("generated.admin.hiRezApiKeys")} subtitle={t("generated.admin.apiKeysSubtitle")} />
            {!developerMode && <button
              type="button"
              onClick={() => setShowKeyIds((prev) => !prev)}
              className="pc-btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap text-xs"
            >
              {showKeyIds ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showKeyIds ? t("generated.admin.hideKeyIds") : t("generated.admin.showKeyIds")}
            </button>}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {dashboard.hirez.keys.map((key, idx) => <ApiKeyCard key={key.devId} apiKey={key} index={idx} showKeyId={showKeyIds} />)}
          </div>
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-xs text-pc-text-muted"><span>{t("generated.admin.combinedDailyBudget")}</span><span style={{ color: getPercentageColor(budgetPercent, "low-is-good") }}>{formatNumber(budgetPercent, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{t("generated.admin.used")}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-pc-bg"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${budgetPercent}%`, background: getPercentageColor(budgetPercent, "low-is-good") }} /></div>
          </div>
        </div>
        <div className="pc-card">
          <SectionTitle icon={Activity} title={t("generated.admin.apiCalls24Hours")} subtitle={t("generated.admin.allKeysCombined")} />
          <HourlyBars rows={dashboard.hirez.hourly} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="pc-card">
          <SectionTitle icon={Database} title={t("generated.operations.adminTrackedData")} subtitle="" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SmallStat label={t("generated.operations.adminMatches")} value={formatNumber(totals.matches)} />
            <SmallStat label={t("generated.operations.adminRanked")} value={formatNumber(totals.rankedMatches)} />
            <SmallStat label={t("generated.operations.adminCasual")} value={formatNumber(totals.casualMatches)} />
            <SmallStat label={t("generated.operations.adminPlayers")} value={formatNumber(totals.players)} />
          </div>
        </div>
        <div className="pc-card">
          <SectionTitle icon={Activity} title={t("generated.operations.adminIngestCoverage")} subtitle="" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SmallStat label={t("generated.operations.adminCoverage")} value={`${formatNumber(ingestCoverage, { maximumFractionDigits: 1 })}%`} valueColor={getPercentageColor(ingestCoverage)} />
            <SmallStat label={t("generated.operations.adminDirect")} value={formatNumber(totals.directMatches)} />
            <SmallStat label={t("generated.operations.adminRecovered")} value={formatNumber(totals.recoveredMatches)} />
            <SmallStat label={t("generated.operations.adminIncomplete")} value={formatNumber(totals.incompleteMatches)} tone={totals.incompleteMatches > 0 ? "warn" : "normal"} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="pc-card">
          <SectionTitle icon={Database} title={t("generated.admin.websiteDatabase")} subtitle={t("generated.admin.databaseSubtitle")} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SmallStat label={t("generated.admin.players")} value={formatNumber(totals.players)} />
            <SmallStat label={t("generated.operations.adminRegistered")} value={formatNumber(totals.registeredUsers)} />
            <SmallStat label={t("generated.operations.adminVerified")} value={formatNumber(totals.verifiedAccounts)} />
            <SmallStat label={t("generated.admin.builds")} value={formatNumber(totals.communityBuilds)} />
            <SmallStat label={t("generated.admin.database")} value={formatBytes(totals.databaseBytes)} />
            <SmallStat label={t("generated.admin.bufferPending")} value={formatNumber(pipeline.bufferPending)} tone={pipeline.bufferPending > 0 ? "warn" : "normal"} />
            <SmallStat label={t("generated.admin.bufferFailed")} value={formatNumber(pipeline.bufferFailed)} tone={pipeline.bufferFailed > 0 ? "bad" : "normal"} />
          </div>
        </div>
        <div className="pc-card">
          <SectionTitle icon={Gauge} title={t("generated.admin.hiRezEndpoints24Hours")} subtitle={t("generated.admin.endpointsSubtitle")} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs"><thead><tr className="border-b border-pc-border text-left text-pc-text-muted"><th className="py-2 pr-3">{t("generated.admin.endpoint")}</th><th className="px-3 py-2">{t("generated.admin.consumer")}</th><th className="px-3 py-2 text-right">{t("generated.admin.calls")}</th><th className="py-2 pl-3 text-right">{t("generated.admin.avgMs")}</th></tr></thead>
              <tbody>{dashboard.hirez.endpoints.map((endpoint) => <tr key={`${endpoint.consumer}:${endpoint.endpoint}`} className="border-b border-pc-border/40"><td className="max-w-64 truncate py-2 pr-3 font-mono text-pc-text">{endpoint.endpoint}</td><td className="max-w-48 truncate px-3 py-2 font-mono text-pc-text-secondary">{endpoint.consumer}</td><td className="px-3 py-2 text-right tabular-nums text-pc-accent">{formatNumber(endpoint.calls)}</td><td className="py-2 pl-3 text-right tabular-nums text-pc-text-secondary">{formatNumber(endpoint.avgResponseMs)}</td></tr>)}</tbody>
            </table>
            {dashboard.hirez.endpoints.length === 0 && <div className="py-8 text-center text-xs text-pc-text-muted">{t("generated.admin.noApiCallsRecordedInTheLast24Hours")}</div>}
          </div>
        </div>
      </section>

      {!developerMode && <AdminRoleManager />}

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-pc-text-muted">
        <span>{developerMode ? (user?.username ?? "Local developer") : <>{t("generated.admin.signedInAs")}{" "}{user?.username ?? "Local admin"}{t("generated.admin.thisRouteAndItsDataEndpointRequireAnAdminSession")}</>}</span>
        <span>{t("generated.admin.snapshot")}{" "}{formatDateTime(dashboard.generatedAt)}</span>
      </footer>
      {loading && <LoadingPanel compact className="fixed bottom-20 right-5 z-50" />}
    </ContentFade>
  );
}

function AdminRoleManager(){const{t}=useLocalization();const[query,setQuery]=useState("");const[accounts,setAccounts]=useState<ManagedAccount[]>([]);const[selected,setSelected]=useState<ManagedAccount|null>(null);async function search(){if(query.trim().length<2)return;const rows=await searchManagedAccounts(query);setAccounts(rows);setSelected(rows[0]??null)}async function save(form:FormData){if(!selected)return;const role=String(form.get("role")) as ManagedAccount["role"];await updateManagedAccountRole(selected.id,role);setSelected({...selected,role});setAccounts(rows=>rows.map(row=>row.id===selected.id?{...row,role}:row))}return <section className="pc-card p-5"><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]"><div><div className="flex gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("generated.operations.adminSearchAccounts")} className="min-w-0 flex-1 rounded-lg border border-pc-border bg-pc-bg px-3 py-2 text-sm text-pc-text"/><button type="button" onClick={()=>void search()} className="pc-btn-secondary text-sm">{t("generated.operations.adminSearch")}</button></div><div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-pc-border">{accounts.map(account=><button key={account.id} type="button" onClick={()=>setSelected(account)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-pc-border px-3 py-2 text-left"><span><span className="block truncate text-sm text-pc-text">{account.username}</span></span><span className="text-xs text-pc-text-muted">{account.role}</span></button>)}</div></div>{selected&&<form action={save} className="space-y-4"><span className="block truncate text-sm text-pc-text">{selected.username}</span><select name="role" defaultValue={selected.role} className="w-full rounded-lg border border-pc-border bg-pc-bg px-3 py-2 text-sm text-pc-text"><option value="user">{t("generated.operations.roleUser")}</option><option value="moderator">{t("generated.operations.roleModerator")}</option><option value="developer">{t("generated.operations.developer")}</option><option value="admin">{t("generated.operations.roleAdmin")}</option></select><button className="pc-btn-primary w-full text-sm">{t("generated.operations.projectsSave")}</button></form>}</div></section>}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return <div className="pc-card p-4"><div className="flex items-center gap-2 text-xs text-pc-text-muted"><Icon className="h-4 w-4 text-pc-accent" />{label}</div><div className="mt-2 text-2xl font-bold tabular-nums text-pc-text">{value}</div><div className="mt-1 text-xs text-pc-text-muted">{detail}</div></div>;
}

// Sanitized key label: sequential letter per key (A, B, C, ...) so keys stay
// distinguishable without exposing the real dev ID. Toggle reveals the ID.
function keyLetter(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letters[index % letters.length] ?? String(index + 1);
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof Activity; title: string; subtitle: string }) {
  return <div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 text-pc-accent" /><div><h2 className="text-sm font-bold text-pc-text">{title}</h2><p className="text-xs text-pc-text-muted">{subtitle}</p></div></div>;
}

function TrafficChart({ dashboard }: { dashboard: AdminDashboard }) {
  const { formatNumber, locale } = useLocalization();
  const max = Math.max(1, ...dashboard.traffic.daily.map((row) => row.pageViews));
  return <div className="mt-5 flex h-52 items-end gap-1.5 overflow-x-auto border-b border-pc-border pb-2">{dashboard.traffic.daily.map((row) => <div key={row.date} className="group flex min-w-9 flex-1 flex-col items-center justify-end gap-1"><div className="text-xs text-pc-text-muted opacity-0 transition-opacity group-hover:opacity-100">{formatNumber(row.pageViews)}</div><div className="relative flex h-36 w-full max-w-9 items-end justify-center"><div className="w-5 rounded-t bg-pc-accent-deep/70" style={{ height: `${Math.max(2, (row.pageViews / max) * 100)}%` }} /></div><span className="text-xs text-pc-text-muted">{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${row.date}T00:00:00Z`))}</span><span className="text-xs tabular-nums text-pc-text-secondary">{formatNumber(row.matches)}</span></div>)}</div>;
}

function HourlyActivityChart({ rows }: { rows: Array<{ hour: string; estimatedActivePages: number }> }) {
  const { t, formatNumber, locale } = useLocalization();
  const max = Math.max(1, ...rows.map((row) => row.estimatedActivePages));
  return <div className="mt-5">
    <div className="mb-3 text-xs font-semibold text-pc-text-muted">{t("generated.admin.hourlyActivity24Hours")}</div>
    <div className="flex h-48 items-end gap-1.5 overflow-x-auto border-b border-pc-border pb-2">
      {rows.map((row) => {
        const date = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", timeZone: "UTC" }).format(new Date(row.hour));
        const label = t("generated.admin.hourlyActivityTooltip", { date, value: formatNumber(row.estimatedActivePages) });
        return <div key={row.hour} className="group flex min-w-9 flex-1 flex-col items-center justify-end gap-1" title={label} aria-label={label}>
          <div className="relative flex h-36 w-full max-w-9 items-end justify-center">
            <div className="w-5 rounded-t bg-pc-accent-mid/70" style={{ height: `${row.estimatedActivePages > 0 ? Math.max(4, (row.estimatedActivePages / max) * 100) : 2}%` }} />
          </div>
          <span className="text-xs text-pc-text-muted">{date}</span>
          <span className="text-xs tabular-nums text-pc-text-secondary">{formatNumber(row.estimatedActivePages)}</span>
        </div>;
      })}
    </div>
    <p className="mt-2 text-xs text-pc-text-muted">{t("generated.admin.hourlyActivitySubtitle")}</p>
  </div>;
}

function ApiKeyCard({ apiKey, index, showKeyId }: { apiKey: AdminDashboard["hirez"]["keys"][number]; index: number; showKeyId: boolean }) {
  const { t, formatNumber, formatDateTime } = useLocalization();
  const percent = apiKey.dailyLimit > 0 ? Math.min(100, (apiKey.used / apiKey.dailyLimit) * 100) : 0;
  const color = getPercentageColor(percent, "low-is-good");
  const statusLabel = apiKey.status === "healthy"
    ? t("common.status.healthy")
    : apiKey.status === "limited"
      ? t("common.status.limited")
      : apiKey.status === "unhealthy"
        ? t("common.status.unhealthy")
        : t("common.status.unknown");
  const statusColor = apiKey.status === "healthy"
    ? "bg-emerald-400/15 text-emerald-300"
    : apiKey.status === "unhealthy"
      ? "bg-rose-400/15 text-rose-300"
      : "bg-amber-400/15 text-amber-300";
  return <div className="rounded-xl border border-pc-border bg-pc-bg/35 p-3"><div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-pc-text">{t("generated.admin.key")}{" "}{showKeyId ? apiKey.devId : keyLetter(index)}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor}`}>{statusLabel}</span></div><div className="mt-3 flex items-end justify-between"><div><div className="text-lg font-bold tabular-nums text-pc-text">{formatNumber(apiKey.remaining)}</div><div className="text-xs text-pc-text-muted">{t("generated.admin.remaining")}</div></div><div className="text-right text-xs text-pc-text-secondary">{formatNumber(apiKey.used)} / {formatNumber(apiKey.dailyLimit)}</div></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-pc-bg"><div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} /></div><div className="mt-2 truncate text-xs text-pc-text-muted">{t("generated.admin.synced")}{" "}{apiKey.lastSyncAt ? formatDateTime(apiKey.lastSyncAt) : t("generated.admin.never")}</div></div>;
}

function HourlyBars({ rows }: { rows: Array<{ hour: string; calls: number }> }) {
  const { t , formatDateTime} = useLocalization();
  const max = Math.max(1, ...rows.map((row) => row.calls));
  return <div className="mt-5 flex h-40 items-end gap-1">{rows.map((row, index) => <div key={row.hour} className="group flex h-full min-w-0 flex-1 items-end"><div className="relative w-full rounded-t bg-pc-accent-mid/70 transition-colors group-hover:bg-pc-accent" style={{ height: `${Math.max(2, (row.calls / max) * 100)}%` }} title={t("generated.admin.value1Value2Calls", { value1: formatDateTime(row.hour), value2: row.calls })}><span className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-pc-text-muted opacity-0 group-hover:opacity-100">{row.calls}</span></div>{index % 6 === 0 && <span className="absolute text-xs text-pc-text-muted" />}</div>)}</div>;
}

function SmallStat({ label, value, tone = "normal", valueColor }: { label: string; value: string; tone?: "normal" | "warn" | "bad"; valueColor?: string }) {
 const color = tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-300" : "text-pc-text";
  return <div className="rounded-lg border border-pc-border/60 bg-pc-bg/35 p-3"><div className="text-xs text-pc-text-muted">{label}</div><div className={`mt-1 text-lg font-bold tabular-nums ${color}`} style={valueColor ? { color: valueColor } : undefined}>{value}</div></div>;
}
