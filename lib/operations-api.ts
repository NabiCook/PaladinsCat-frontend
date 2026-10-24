/**
 * Adapt backend operations read models and authenticated ticket/project endpoints.
 * Validate wire shapes only; the backend owns statistics and moderation policy.
 * Failures reject into the existing page error state, never synthetic zero data.
 * refs: endpoints: GET /operations/stats; see: lib/api-client.ts
 */
import { accountAuthHeaders, API_ERROR_KEYS, ApiRequestError, fetchJson } from "./api-client";
/**
 * Carry validated operations statistics without substituting missing measurements.
 * I/O types: backend read model -> PublicOperationsStats (presentation field names).
 * refs: endpoints: GET /operations/stats
 */
export interface PublicOperationsStats { generatedAt:string; release:{version:string;gitCommitShort:string|null;deployedAt:string|null}; traffic:{activeUsers:number;activeWindowSeconds:number;heartbeatSeconds:number;visitorsToday:number;viewsToday:number;visitorDays7d:number;views7d:number}; catalog:{matches:number;rankedMatches:number;casualMatches:number;specialMatches:number;players:number;registeredUsers:number;verifiedUsers:number;communityBuilds:number;tierLists:number;communityPosts:number;recoveredMatches:number;incompleteMatches:number;latestMatchAt:string|null}; ingestCoverage:{totalMatches:number;directMatches:number;recoveredMatches:number;incompleteMatches:number}; }
/**
 * Fetch and validate the backend operations success envelope through shared transport.
 * Preserve finite numeric values (including zero) and explicit null hash/timestamps.
 * Reject missing/wrongly typed fields as invalid-response; do not compute statistics.
 * I/O types: none -> Promise<PublicOperationsStats>; rejection: ApiRequestError.
 * refs: endpoints: GET /operations/stats; see: lib/api-client.ts::fetchJson
 */
export async function fetchPublicOperationsStats(): Promise<PublicOperationsStats> {
  const invalid = (): never => {
    throw new ApiRequestError(API_ERROR_KEYS.genericFailure, undefined, {
      kind: "invalid-response", code: "INVALID_OPERATIONS_STATS",
      endpoint: "/operations/stats", method: "GET",
    });
  };
  const object = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
    return value as Record<string, unknown>;
  };
  const number = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : invalid();
  const string = (value: unknown): string => typeof value === "string" ? value : invalid();
  const nullableString = (value: unknown): string | null => value === null ? null : string(value);
  const raw = object(await fetchJson<unknown>("/operations/stats", { unwrapData: false }));
  const release = object(raw.release);
  const summary = object(object(raw.traffic).summary);
  const catalog = object(raw.catalog);
  const coverage = object(raw.ingest_coverage);
  return {
    generatedAt: string(raw.generated_at),
    release: {
      version: string(release.version),
      gitCommitShort: nullableString(release.git_commit_short),
      deployedAt: nullableString(release.deployed_at),
    },
    traffic: {
      activeUsers: number(summary.active_users),
      activeWindowSeconds: number(summary.active_window_seconds),
      heartbeatSeconds: number(summary.heartbeat_seconds),
      visitorsToday: number(summary.visitors_today),
      viewsToday: number(summary.views_today),
      visitorDays7d: number(summary.visitor_days_7d),
      views7d: number(summary.views_7d),
    },
    catalog: {
      matches: number(catalog.matches),
      rankedMatches: number(catalog.ranked_matches),
      casualMatches: number(catalog.casual_matches),
      specialMatches: number(catalog.special_matches),
      players: number(catalog.players),
      registeredUsers: number(catalog.registered_users),
      verifiedUsers: number(catalog.verified_users),
      communityBuilds: number(catalog.community_builds),
      tierLists: number(catalog.tier_lists),
      communityPosts: number(catalog.community_posts),
      recoveredMatches: number(catalog.recovered_matches),
      incompleteMatches: number(catalog.incomplete_matches),
      latestMatchAt: nullableString(catalog.latest_match_at),
    },
    ingestCoverage: {
      totalMatches: number(coverage.total_matches),
      directMatches: number(coverage.direct_matches),
      recoveredMatches: number(coverage.recovered_matches),
      incompleteMatches: number(coverage.incomplete_matches),
    },
  };
}

/**
 * Defines the  ticket type contract used by this module.
 * refs: none
 */
export type TicketType = "bug" | "feature";
/**
 * Defines the  ticket status contract used by this module.
 * refs: none
 */
export type TicketStatus = "received" | "under_review" | "planned" | "closed";
/**
 * Defines the  ticket contract used by this module.
 * refs: none
 */
export type Ticket = { id: number; code: string; kind: TicketType; status: TicketStatus; title: string; details: string; requester: string; created_at: string; updated_at: string };
/**
 * Defines the  ticket comment contract used by this module.
 * refs: none
 */
export type TicketComment = { id: number; body: string; author: string; created_at: string };
/**
 * Defines the  work column contract used by this module.
 * refs: none
 */
export type WorkColumn = "backlog" | "building" | "review" | "done";
/**
 * Defines the  work item contract used by this module.
 * refs: none
 */
export type WorkItem = { id: number; code: string; title: string; component: string; column_name: WorkColumn; priority: "low" | "normal" | "high"; assignee: string | null; details: string };
const auth = () => accountAuthHeaders();
/**
 * Fetch an authenticated ticket page and preserve its data/pagination envelope; API and network errors reject the promise.
 * refs: none
 * I/O types: `page: number; perPage: number -> Promise<{ data: Ticket[]; page: { current: number; total_pages: number; }; }>`.
 */
export async function listTickets(page: number, perPage = 20) { return fetchJson<{ data: Ticket[]; page: { current: number; total_pages: number } }>(`/tickets?page=${page}&per_page=${perPage}`, { headers: auth(), unwrapData: false }); }
/**
 * POST a JSON ticket kind/title/details with current authentication and no retries; return the created ticket or reject request errors.
 * refs: none
 * I/O types: `input: { kind: TicketType; title: string; details: string } -> Promise<Ticket>`.
 */
export async function createTicket(input: { kind: TicketType; title: string; details: string }) { return fetchJson<Ticket>("/tickets", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(input), retries: 0 }); }
/**
 * Fetch a URL-encoded ticket ID with authentication and return its ticket/comments envelope; request errors reject.
 * refs: none
 * I/O types: `id: string -> Promise<{ ticket: Ticket; comments: TicketComment[]; }>`.
 */
export async function getTicket(id: string) { return fetchJson<{ ticket: Ticket; comments: TicketComment[] }>(`/tickets/${encodeURIComponent(id)}`, { headers: auth(), unwrapData: false }); }
/**
 * POST a comment body to the encoded ticket ID with authentication and no retries; preserve the returned ticket/comments envelope and reject request errors.
 * refs: none
 * I/O types: `id: string; body: string -> Promise<{ ticket: Ticket; comments: TicketComment[]; }>`.
 */
export async function commentTicket(id: string, body: string) { return fetchJson<{ ticket: Ticket; comments: TicketComment[] }>(`/tickets/${encodeURIComponent(id)}/comments`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ body }), unwrapData: false, retries: 0 }); }
/**
 * PUT a ticket status to the encoded ID with authentication and no retries; preserve the returned ticket/comments envelope and reject request errors.
 * refs: none
 * I/O types: `id: string; status: TicketStatus -> Promise<{ ticket: Ticket; comments: TicketComment[]; }>`.
 */
export async function updateTicket(id: string, status: TicketStatus) { return fetchJson<{ ticket: Ticket; comments: TicketComment[] }>(`/tickets/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ status }), unwrapData: false, retries: 0 }); }
/**
 * DELETE the encoded ticket ID with authentication and no retries; return the deletion acknowledgment or reject request errors.
 * refs: none
 * I/O types: `id: string -> Promise<{ deleted: true; }>`.
 */
export async function deleteTicket(id: string) { return fetchJson<{ deleted: true }>(`/tickets/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth(), retries: 0 }); }
/**
 * Fetch authenticated project work items; return the array or reject request errors.
 * refs: none
 * I/O types: `none -> Promise<WorkItem[]>`.
 */
export async function listWorkItems() { return fetchJson<WorkItem[]>("/projects", { headers: auth() }); }
/**
 * POST a project title/component with authentication and no retries; return the new numeric ID or reject request errors.
 * refs: none
 * I/O types: `input: { title: string; component: string } -> Promise<{ id: number; }>`.
 */
export async function createWorkItem(input: { title: string; component: string }) { return fetchJson<{ id: number }>("/projects", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(input), retries: 0 }); }
/**
 * PUT editable work-item fields to the project ID, mapping column_name to column and absent assignee to an empty string. Send JSON with authentication and no retries; request errors reject.
 * refs: none
 * I/O types: `id: number; input: Omit<WorkItem, "id" | "code"> -> Promise<unknown>`.
 */
export async function updateWorkItem(id: number, input: Omit<WorkItem, "id" | "code">) { return fetchJson(`/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ title: input.title, component: input.component, column: input.column_name, priority: input.priority, assignee: input.assignee ?? "", details: input.details }), retries: 0 }); }
