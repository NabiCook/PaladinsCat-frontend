/** Calls administrative dashboard endpoints and maps their responses.
 * This client reads administrative dashboard summaries from backend endpoints.
 * refs: none
 */
import { accountAuthHeaders, fetchJson } from "./api-client";

/**
 * Define admin daily traffic as `{ date: string; pageViews: number; matches: number }`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type AdminDailyTraffic = { date: string; pageViews: number; matches: number };
/**
 * Define the anonymous consent maintenance report without exposing account identifiers.
 * refs: migrations/tracked/196_maintenance_presence_consent.sql; migrations/tracked/202_maintenance_presence_hourly.sql
 */
export type AdminMaintenance = {
  consent: {
    acceptedAccounts: number;
    declinedAccounts: number;
    unsetAccounts: number;
    obsoleteAccounts: number;
    decidedAccounts: number;
    acceptedShare: number | null;
    averageActiveConsentSeconds: number | null;
    lastEventAt: string | null;
  };
  hourlyActivity: Array<{ hour: string; estimatedActivePages: number }>;
};
/**
 * Define admin api key as `{ devId: string; status: string; used: number; dailyLimit: number; remaining: number; callsTotal: number; consecutiveFailures: number; lastUsed: string | null; lastSyncAt: string | null; lastSyncError: string | null; }`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type AdminApiKey = {
  devId: string;
  status: string;
  used: number;
  dailyLimit: number;
  remaining: number;
  callsTotal: number;
  consecutiveFailures: number;
  lastUsed: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

/**
 * Define admin dashboard as `{ generatedAt: string; traffic: { summary: { viewsToday: number; views7d: number }; daily: AdminDailyTraffic[]; topPages: Array<{ path: string; pageViews: number }>; }; maintenance: AdminMaintenance; site: ...; hirez: ... }`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type AdminDashboard = {
  generatedAt: string;
  traffic: {
    summary: { viewsToday: number; views7d: number };
    daily: AdminDailyTraffic[];
    topPages: Array<{ path: string; pageViews: number }>;
  };
  maintenance: AdminMaintenance;
  site: {
    totals: { matches: number; rankedMatches: number; casualMatches: number; directMatches: number; recoveredMatches: number; incompleteMatches: number; players: number; registeredUsers: number; verifiedAccounts: number; communityBuilds: number; databaseBytes: number };
    pipeline: { bufferPending: number; bufferProjectionPending: number; bufferProcessing: number; bufferFailed: number; bufferProcessed: number };
  };
  hirez: {
    keys: AdminApiKey[];
    hourly: Array<{ hour: string; calls: number }>;
    endpoints: Array<{ consumer: string; endpoint: string; calls: number; avgResponseMs: number }>;
  };
};

const numberValue = (value: unknown) => Number(value ?? 0) || 0;
const nullableNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};


// User-facing error keys — resolved at the UI layer via t()
/**
 * Expose localization keys for administrator dashboard and account-management errors.
 * refs: none
 */
export const ADMIN_ERROR_KEYS = {
  sessionRequired: "generated.admin.sessionRequired",
  dashboardRequestFailed: "generated.admin.dashboardRequestFailed",
} as const;

/**
 * Fetch the admin or developer dashboard without caching and with same-origin account credentials. Unwrap the optional data envelope and normalize traffic, pipeline, and Hi-Rez metrics; reject transport failures and non-success HTTP responses.
 * refs: none
 * I/O types: `mode: "admin" | "developer" -> Promise<AdminDashboard>`.
 */
export async function fetchAdminDashboard(mode: "admin" | "developer" = "admin"): Promise<AdminDashboard> {
  const response = await fetch(mode === "developer" ? "/api/developer/dashboard" : "/api/admin/dashboard", {
    headers: accountAuthHeaders(),
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || body?.error || `Dashboard request failed (${response.status}).`);
  const raw = body?.data && !body?.generated_at ? body.data : body;
  const summary = raw.traffic?.summary ?? {};
  const totals = raw.site?.totals ?? {};
  const pipeline = raw.site?.pipeline ?? {};

  return {
    generatedAt: String(raw.generated_at ?? new Date().toISOString()),
    traffic: {
      summary: {
        viewsToday: numberValue(summary.views_today),
        views7d: numberValue(summary.views_7d),
      },
      daily: (raw.traffic?.daily ?? []).map((row: any) => ({
        date: String(row.date), pageViews: numberValue(row.page_views), matches: numberValue(row.matches),
      })),
      topPages: (raw.traffic?.top_pages ?? []).map((row: any) => ({ path: String(row.path), pageViews: numberValue(row.page_views) })),
    },
    maintenance: {
      consent: {
        acceptedAccounts: numberValue(raw.maintenance?.consent?.accepted_accounts),
        declinedAccounts: numberValue(raw.maintenance?.consent?.declined_accounts),
        unsetAccounts: numberValue(raw.maintenance?.consent?.unset_accounts),
        obsoleteAccounts: numberValue(raw.maintenance?.consent?.obsolete_accounts),
        decidedAccounts: numberValue(raw.maintenance?.consent?.decided_accounts),
        acceptedShare: nullableNumber(raw.maintenance?.consent?.accepted_share),
        averageActiveConsentSeconds: nullableNumber(raw.maintenance?.consent?.average_active_consent_seconds),
        lastEventAt: raw.maintenance?.consent?.last_event_at ? String(raw.maintenance.consent.last_event_at) : null,
      },
      hourlyActivity: (raw.maintenance?.hourly_activity ?? []).map((row: any) => ({
        hour: String(row.hour), estimatedActivePages: numberValue(row.estimated_active_pages),
      })),
    },
    site: {
      totals: {
        matches: numberValue(totals.matches), rankedMatches: numberValue(totals.ranked_matches), casualMatches: numberValue(totals.casual_matches), directMatches: numberValue(totals.direct_matches), recoveredMatches: numberValue(totals.recovered_matches), incompleteMatches: numberValue(totals.incomplete_matches), players: numberValue(totals.players),
        registeredUsers: numberValue(totals.registered_users), verifiedAccounts: numberValue(totals.verified_accounts), communityBuilds: numberValue(totals.community_builds), databaseBytes: numberValue(totals.database_bytes),
      },
      pipeline: {
        bufferPending: numberValue(pipeline.buffer_pending), bufferProcessing: numberValue(pipeline.buffer_processing),
        bufferProjectionPending: numberValue(pipeline.buffer_projection_pending),
        bufferFailed: numberValue(pipeline.buffer_failed), bufferProcessed: numberValue(pipeline.buffer_processed),
      },
    },
    hirez: {
      keys: (raw.hirez?.keys ?? []).map((row: any) => ({
        devId: String(row.label ?? row.dev_id ?? "Key"), status: String(row.status ?? "unknown"), used: numberValue(row.used), dailyLimit: numberValue(row.daily_limit),
        remaining: numberValue(row.remaining), callsTotal: numberValue(row.calls_total), consecutiveFailures: numberValue(row.consecutive_failures),
        lastUsed: row.last_used ? String(row.last_used) : null, lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
        lastSyncError: row.last_sync_error ? String(row.last_sync_error) : null,
      })),
      hourly: (raw.hirez?.hourly ?? []).map((row: any) => ({ hour: String(row.hour), calls: numberValue(row.calls) })),
      endpoints: (raw.hirez?.endpoints ?? []).map((row: any) => ({
        consumer: String(row.consumer ?? "unknown"), endpoint: String(row.endpoint),
        calls: numberValue(row.calls), avgResponseMs: numberValue(row.avg_response_ms),
      })),
    },
  };
}

/**
 * Define managed account as `{ id: number; username: string; email: string | null; role: "user" | "moderator" | "developer" | "admin" }`.
 * refs: doc: documents/02-technical/security/auth.md
 */
export type ManagedAccount = { id: number; username: string; email: string | null; role: "user" | "moderator" | "developer" | "admin" };
/**
 * Fetch administrator account-search results with the URL-encoded query and current account headers; network/API failures reject the promise.
 * refs: none
 * I/O types: `query: string -> Promise<ManagedAccount[]>`.
 */
export async function searchManagedAccounts(query: string): Promise<ManagedAccount[]> { return fetchJson<ManagedAccount[]>(`/admin/accounts?q=${encodeURIComponent(query)}`,{headers:accountAuthHeaders()}); }
/**
 * PUT the requested role to the selected administrator account endpoint with account headers and a JSON body. Disable retries and reject network/API failures.
 * refs: none
 * I/O types: `id: number; role: ManagedAccount["role"] -> Promise<void>`.
 */
export async function updateManagedAccountRole(id:number,role:ManagedAccount["role"]):Promise<void>{await fetchJson(`/admin/accounts/${id}/role`,{method:"PUT",headers:{"Content-Type":"application/json",...accountAuthHeaders()},body:JSON.stringify({role}),retries:0});}
