/** Decode tier-dependent profile data before it reaches rendering.
 * Missing optional data remains unavailable; malformed data is a controlled
 * failure. This boundary supplies no account authority or provider work.
 * refs: endpoints: GET /players/{id}, GET /live/players/{id}
 */
import type { PlayerResponse } from "./player-profile-types";

/** A player profile with the queue/champion rating arrays made non-optional.
 *
 * refs: none
 */
export type NormalizedPlayerProfile = PlayerResponse & {
  queueRatings: NonNullable<PlayerResponse["queueRatings"]>;
  championRatings: NonNullable<PlayerResponse["championRatings"]>;
};
type FailureCode = "INVALID_PLAYER_PROFILE" | "INVALID_PLAYER_LIVE_MATCH";
/** Discriminated result of a profile decode (a value or a coded failure).
 *
 * refs: none
 */
export type PlayerResponseDecodeResult<T> = { ok: true; value: T }
  | { ok: false; error: { code: FailureCode; field: string } };
/** A live-match player response (match detail plus optional roster rows).
 *
 * refs: none
 */
export interface PlayerLiveMatchResponse {
  match: Record<string, unknown> & { match_id: string };
  players?: Array<Record<string, unknown>> | null;
  [field: string]: unknown;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code: FailureCode, field: string): PlayerResponseDecodeResult<never> => ({ ok: false, error: { code, field } });
function numeric(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function identifier(value: unknown, allowZero = false): string | undefined {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && (allowZero ? /^(?:0|[1-9]\d{0,12})$/ : /^[1-9]\d{0,12}$/).test(text)
    && Number.isSafeInteger(Number(text)) ? text : undefined;
}
function scalars(source: RecordValue, prefix: string, numbers: readonly string[], strings: readonly string[], booleans: readonly string[] = []): string | null {
  for (const name of numbers) {
    if (source[name] != null && numeric(source[name]) === undefined) return `${prefix}.${name}`;
  }
  for (const name of strings) {
    if (source[name] != null && typeof source[name] !== "string") return `${prefix}.${name}`;
  }
  for (const name of booleans) {
    if (source[name] != null && typeof source[name] !== "boolean") return `${prefix}.${name}`;
  }
  return null;
}
const PLAYER_NUMBERS = ["level", "wins", "losses", "leaves", "hours_played", "minutes_played", "mastery_level",
  "total_achievements", "avatar_id", "kbm_points", "kbm_tier", "kbm_season", "kbm_wins", "kbm_losses",
  "kbm_rank", "kbm_leaves", "kbm_trend", "kbm_prev_rank", "total_matches", "total_wins", "total_losses",
  "avg_egpm", "avg_dpm", "avg_hpm", "avg_shpm", "avg_spm", "sus_count", "weirdo_count", "hall_of_fame_count"];
const PLAYER_STRINGS = ["region", "platform", "platform_name", "avatar_url", "title", "loading_frame", "created_datetime",
  "last_login_datetime", "personal_status_message", "privacy_flag", "kbm_name", "last_seen", "first_seen",
  "hirez_profile_refreshed_at", "custom_tag", "custom_tag_color"];
const PLAYER_BOOLEANS = ["cheater", "exploiter", "dropper", "afk_wintrade", "alt_account", "boosted", "verified"];

function ratings(value: unknown, name: "queueRatings" | "championRatings"): { value: RecordValue[]; error?: never } | { error: string; value?: never } {
  if (value == null) return { value: [] };
  if (!Array.isArray(value)) return { error: name };
  const rows: RecordValue[] = [];
  for (let index = 0; index < value.length; index++) {
    const item: unknown = value[index], prefix = `${name}[${index}]`;
    if (!record(item)) return { error: prefix };
    const idName = name === "queueRatings" ? "queue_id" : "champion_id";
    const id = identifier(item[idName]);
    if (id === undefined) return { error: `${prefix}.${idName}` };
    if (name === "championRatings" && typeof item.champion_name !== "string") return { error: `${prefix}.champion_name` };
    const required = name === "queueRatings" ? ["mu", "phi", "volatility"] : ["mu", "phi", "matches_played", "wins", "losses"];
    const row = { ...item, [idName]: Number(id) };
    for (const field of new Set([...required, "matches_played", "wins", "losses"])) {
      if (!required.includes(field) && item[field] === undefined) continue;
      const number = numeric(item[field]);
      if (number === undefined || (field !== "mu" && number < 0)
        || (["matches_played", "wins", "losses"].includes(field) && !Number.isSafeInteger(number))) return { error: `${prefix}.${field}` };
      row[field] = number;
    }
    rows.push(row);
  }
  return { value: rows };
}

/** Safely decode profile JSON from either SSR or browser acquisition.
 *
 * I/O: in (input: unknown) -> out PlayerResponseDecodeResult<NormalizedPlayerProfile>
 *
 * refs: none
 */
export function decodePlayerProfileResponse(input: unknown): PlayerResponseDecodeResult<NormalizedPlayerProfile> {
  const code = "INVALID_PLAYER_PROFILE";
  try {
    if (!record(input)) return fail(code, "$");
    if (!record(input.player)) return fail(code, "player");
    const id = identifier(input.player.id);
    if (!id || !/^[1-9]\d{0,9}$/.test(id)) return fail(code, "player.id");
    if (typeof input.player.name !== "string") return fail(code, "player.name");
    const invalidPlayer = scalars(input.player, "player", PLAYER_NUMBERS, PLAYER_STRINGS, PLAYER_BOOLEANS);
    if (invalidPlayer) return fail(code, invalidPlayer);
    for (const field of ["total_xp", "total_worshippers"]) {
      if (input.player[field] != null && numeric(input.player[field]) === undefined) return fail(code, `player.${field}`);
    }
    if (input.player.derived_rates != null) {
      if (!record(input.player.derived_rates)) return fail(code, "player.derived_rates");
      const invalid = scalars(input.player.derived_rates, "player.derived_rates", ["kpm", "deaths_per_minute"], []);
      if (invalid) return fail(code, invalid);
    }
    const queue = ratings(input.queueRatings, "queueRatings"), champion = ratings(input.championRatings, "championRatings");
    if (queue.error) return fail(code, queue.error);
    if (champion.error) return fail(code, champion.error);
    for (const field of ["presence", "statusRefresh", "historyRefresh", "championStatsRefresh", "refreshQuota", "access", "profileRefresh", "globalStats"]) {
      const object = input[field];
      if (object == null) continue;
      if (!record(object)) return fail(code, field);
      const invalid = field === "presence"
        ? scalars(object, field, ["status"], ["status_string"])
        : field === "access"
          ? scalars(object, field, ["limit", "remaining", "resetAtMs"], [], ["fullAccess"])
          : field === "refreshQuota"
            ? scalars(object, field, ["limit", "remaining", "remaining_seconds"], ["reset_at"])
            : field === "profileRefresh"
              ? scalars(object, field, ["ttl_seconds", "remaining_seconds"], ["refreshed_at", "expires_at", "next_refresh_at", "source", "error"], ["expired", "was_expired", "attempted", "refreshed", "deferred"])
              : scalars(object, field, [], ["error"], ["refreshed", "cached"]);
      if (invalid) return fail(code, invalid);
      if (field === "presence" && !Number.isSafeInteger(numeric(object.status))) return fail(code, "presence.status");
      if (field === "access" && typeof object.fullAccess !== "boolean") return fail(code, "access.fullAccess");
    }
    const player: RecordValue = { ...input.player, id };
    for (const field of PLAYER_NUMBERS) if (player[field] != null) player[field] = numeric(player[field]);
    const value: RecordValue = { ...input, player, queueRatings: queue.value, championRatings: champion.value };
    if (record(input.presence)) value.presence = { ...input.presence, status: numeric(input.presence.status) };
    return { ok: true, value: value as unknown as NormalizedPlayerProfile };
  } catch {
    return fail(code, "$");
  }
}

/** Decode a populated live-match response; missing rosters stay unavailable.
 *
 * I/O: in (input: unknown) -> out PlayerResponseDecodeResult<PlayerLiveMatchResponse>
 *
 * refs: none
 */
export function decodePlayerLiveMatchResponse(input: unknown): PlayerResponseDecodeResult<PlayerLiveMatchResponse> {
  const code = "INVALID_PLAYER_LIVE_MATCH";
  try {
    if (!record(input) || !record(input.match)) return fail(code, "match");
    const id = identifier(input.match.match_id);
    if (!id) return fail(code, "match.match_id");
    const invalidMatch = scalars(input.match, "match", ["queue_id"], ["map", "status"]);
    if (invalidMatch) return fail(code, invalidMatch);
    const invalidChances = scalars(input, "$", ["team_one_win_chance", "team_two_win_chance"], []);
    if (invalidChances) return fail(code, invalidChances);
    let players = input.players;
    if (players != null) {
      if (!Array.isArray(players)) return fail(code, "players");
      const rows: RecordValue[] = [];
      for (let index = 0; index < players.length; index++) {
        const item: unknown = players[index], prefix = `players[${index}]`;
        if (!record(item)) return fail(code, prefix);
        const playerId = identifier(item.player_id, true), taskForce = numeric(item.task_force);
        if (playerId === undefined) return fail(code, `${prefix}.player_id`);
        if (!Number.isSafeInteger(taskForce) || (taskForce !== 1 && taskForce !== 2)) return fail(code, `${prefix}.task_force`);
        const invalid = scalars(item, prefix, ["mastery_level", "account_level", "win_ratio", "wins", "losses", "mu", "phi", "queue_id",
          "avg_dpm", "kbm_rank", "kbm_tier", "live_tier", "profile_level", "profile_mastery_level", "profile_matches",
          "profile_win_rate", "queue_elo", "ranked_matches", "ranked_win_rate", "total_matches", "total_wins"],
          ["name", "player_name", "champion_name", "platform", "profile_platform", "privacy_flag"], ["has_profile"]);
        if (invalid) return fail(code, invalid);
        rows.push({ ...item, player_id: playerId, task_force: taskForce });
      }
      players = rows;
    }
    return { ok: true, value: { ...input, match: { ...input.match, match_id: id }, ...(Object.hasOwn(input, "players") ? { players } : {}) } as PlayerLiveMatchResponse };
  } catch {
    return fail(code, "$");
  }
}
