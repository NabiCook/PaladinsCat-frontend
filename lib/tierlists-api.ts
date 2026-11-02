/**
 * Own client adapters for reading and editing player-authored tier lists.
 *
 * This module handles API requests and account headers; it does not render tier-list pages.
 * refs: none
 */
import { accountAuthHeaders } from "./api-client";
import { csrfHeader } from "./csrf";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

/**
 * Define tier name as `"S" | "A" | "B" | "C" | "D" | "F"`.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export type TierName = "S" | "A" | "B" | "C" | "D" | "F";

/** Describe what a tier list ranks.
 *
 * refs: none
 */
export type TierListMode = "champion" | "ultimate" | "map";

/**
 * Describe a champion tier-list entry with championId, championName, tier, position.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface TierListChampionEntry {
  entityType: "champion";
  championId: number;
  championName: string;
  tier: TierName;
  position: number;
}

/** Describe a map placement returned by the tier-list API.
 *
 * refs: none
 */
export interface TierListMapEntry {
  entityType: "map";
  mapName: string;
  tier: TierName;
  position: number;
}

/** A tier-list placement entry (a champion entry or a map entry).
 *
 * refs: none
 */
export type TierListEntry = TierListChampionEntry | TierListMapEntry;

/**
 * Describe tier list summary with id, userId, username, linkedPlayerId, title, description, likes.
 * refs: doc: documents/02-technical/api/paladinscat-api-internal.md
 */
export interface TierListSummary {
  id: number;
  userId: number;
  username: string;
  linkedPlayerId: number | null;
  title: string;
  description: string;
  likes: number;
  viewCount: number;
  commentCount: number;
  createdAt: string;
  mode: TierListMode;
  entries: TierListEntry[];
}

type RawTierList = {
  id: number;
  user_id: number;
  username: string;
  linked_player_id?: number | null;
  title: string;
  content: string;
  likes: number;
  view_count: number;
  comment_count: number;
  created_at: string;
  mode?: string;
  entries?: Array<{
    championId?: unknown;
    championName?: unknown;
    mapName?: unknown;
    tier: TierName;
    position: number;
  }>;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (/^Bearer (null|undefined)$/i.test(headers.get("authorization") || "")) headers.delete("authorization");
  const csrf = typeof document !== "undefined" ? csrfHeader(document.cookie, init?.method ?? "GET") : null;
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function mapTierList(raw: RawTierList): TierListSummary {
  return {
    id: Number(raw.id),
    userId: Number(raw.user_id),
    username: String(raw.username),
    linkedPlayerId: raw.linked_player_id == null ? null : Number(raw.linked_player_id),
    title: String(raw.title),
    description: String(raw.content ?? ""),
    likes: Number(raw.likes ?? 0),
    viewCount: Number(raw.view_count ?? 0),
    commentCount: Number(raw.comment_count ?? 0),
    createdAt: String(raw.created_at),
    mode: raw.mode === "ultimate" || raw.mode === "map" ? raw.mode : "champion",
    entries: Array.isArray(raw.entries) ? raw.entries.flatMap((entry): TierListEntry[] => {
      if (entry.mapName != null) {
        return [{
          entityType: "map" as const,
          mapName: String(entry.mapName),
          tier: entry.tier,
          position: Number(entry.position),
        }];
      }
      const championId = Number(entry.championId);
      return Number.isFinite(championId) ? [{
        entityType: "champion" as const,
        championId,
        championName: String(entry.championName ?? ""),
        tier: entry.tier,
        position: Number(entry.position),
      }] : [];
    }) : [],
  };
}

/**
 * Fetch the newest tier lists for the public listing.
 *
 * Accepts limit; returns tier-list summaries after an API request using account-aware headers.
 * refs: none
 * I/O types: `limit: number -> Promise<TierListSummary[]>`.
 */
export async function fetchTierLists(limit = 30): Promise<TierListSummary[]> {
  const rows = await requestJson<RawTierList[]>(`/tierlists?limit=${Math.max(1, Math.min(limit, 100))}`);
  return rows.map(mapTierList);
}

/**
 * Fetch one tier list and its placements by post ID.
 *
 * Accepts postId; returns a tier-list summary after an authenticated-capable API request.
 * refs: none
 * I/O types: `postId: number -> Promise<TierListSummary>`.
 */
export async function fetchTierList(postId: number): Promise<TierListSummary> {
  return mapTierList(await requestJson<RawTierList>(`/tierlists/${postId}`, { cache: "no-store" }));
}

/**
 * Create a tier list from its title, description, and ordered entries.
 *
 * Accepts input; returns the created summary after an authenticated state-changing API request.
 * refs: none
 * I/O types: `input: { title: string; description: string; mode: TierListMode; entries: Array<{ tier: TierName }>; token: string | null; } -> Promise<{ postId: number }>`.
 */
export async function createTierList(input: {
  title: string;
  description: string;
  mode: TierListMode;
  entries: Array<
    | { championId: number; tier: TierName; position: number }
    | { mapName: string; tier: TierName; position: number }
  >;
  token: string | null;
}): Promise<{ postId: number }> {
  return requestJson<{ postId: number }>("/tierlists", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(input.token) },
    body: JSON.stringify({ title: input.title, description: input.description, mode: input.mode, entries: input.entries }),
  });
}

/**
 * Replace the editable fields, mode, and entries of an existing tier list.
 *
 * Accepts postId and input; returns the updated summary after an authenticated API mutation.
 * refs: none
 * I/O types: `postId: number; input: { title: string; description: string; mode: TierListMode; entries: Array<{ tier: TierName }>; token: string | null; } -> Promise<{ postId: number }>`.
 */
export async function updateTierList(postId: number, input: {
  title: string;
  description: string;
  mode: TierListMode;
  entries: Array<
    | { championId: number; tier: TierName; position: number }
    | { mapName: string; tier: TierName; position: number }
  >;
  token: string | null;
}): Promise<{ postId: number }> {
  return requestJson<{ postId: number }>(`/tierlists/${postId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...accountAuthHeaders(input.token) },
    body: JSON.stringify({ title: input.title, description: input.description, mode: input.mode, entries: input.entries }),
  });
}
