/** Fetch persisted player friends without creating a separate browser freshness cache.
 * refs: endpoints: GET /players/{id}/friends
 */

import { fetchJson } from "./api-client";
import { API_ERROR_KEYS, ApiRequestError } from "./api-errors";
import { moderationFromRow, type PlayerModeration, type PlayerModerationFields } from "./player-moderation";

/**
 * Describe a friend snapshot and provider freshness. I/O: JSON object -> PlayerFriendsResponse.
 * refs: endpoints: GET /players/{id}/friends
 */
export type PlayerFriendsResponse = {
  friends: Array<{ id: string; name: string; platform: string | null; status: "Friend" | "Blocked"; moderation?: PlayerModeration }>;
  total: number;
  status: "ready" | "private" | "unavailable";
  freshness: { ttl_seconds: number; refreshed_at: string | null; expires_at: string | null; expired: boolean; remaining_seconds: number };
  refreshed: boolean;
  refresh_error: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Reject incomplete snapshots instead of silently filtering unclassified rows away. */
type PlayerFriendsWireResponse = Omit<PlayerFriendsResponse, "friends"> & {
  friends: Array<Omit<PlayerFriendsResponse["friends"][number], "moderation"> & { moderation?: PlayerModerationFields }>;
};

function isPlayerFriendsResponse(value: unknown): value is PlayerFriendsWireResponse {
  if (!isRecord(value) || !Array.isArray(value.friends) || !isRecord(value.freshness)) return false;
  const { friends, freshness } = value;
  return (value.status === "ready" || value.status === "private" || value.status === "unavailable")
    && Number.isSafeInteger(value.total) && value.total === friends.length
    && typeof value.refreshed === "boolean"
    && (value.refresh_error === null || typeof value.refresh_error === "string")
    && typeof freshness.ttl_seconds === "number" && Number.isSafeInteger(freshness.ttl_seconds) && freshness.ttl_seconds >= 0
    && typeof freshness.remaining_seconds === "number" && Number.isSafeInteger(freshness.remaining_seconds) && freshness.remaining_seconds >= 0
    && typeof freshness.expired === "boolean"
    && (freshness.refreshed_at === null || typeof freshness.refreshed_at === "string")
    && (freshness.expires_at === null || typeof freshness.expires_at === "string")
    && friends.every(friend => isRecord(friend)
      && typeof friend.id === "string" && /^[1-9]\d*$/.test(friend.id)
      && typeof friend.name === "string" && friend.name.trim().length > 0
      && (friend.platform === null || typeof friend.platform === "string")
      && (friend.status === "Friend" || friend.status === "Blocked"));
}

/**
 * Load a player's saved friends with server-owned refresh policy.
 * I/O: id: string, signal?: AbortSignal -> Promise<PlayerFriendsResponse>; rejects failed HTTP responses.
 * refs: endpoints: GET /players/{id}/friends
 * I/O types: `id: string; options?: { refresh?: boolean; signal?: AbortSignal } -> Promise<PlayerFriendsResponse>`.
 */
export async function fetchPlayerFriends(id: string, options?: { refresh?: boolean; signal?: AbortSignal }): Promise<PlayerFriendsResponse> {
  const query = options?.refresh ? "?refresh=true" : "";
  const endpoint = `/players/${encodeURIComponent(id)}/friends`;
  const response = await fetchJson<unknown>(`${endpoint}${query}`, { signal: options?.signal, cache: "no-store", retries: 0, timeoutMs: 30_000 });
  if (!isPlayerFriendsResponse(response)) {
    throw new ApiRequestError(API_ERROR_KEYS.genericFailure, undefined, {
      kind: "invalid-response", method: "GET", endpoint,
    });
  }
  return {
    ...response,
    friends: response.friends.map(({ moderation, ...friend }) => ({
      ...friend,
      ...(isRecord(moderation) ? { moderation: moderationFromRow(moderation) } : {}),
    })),
  };
}
