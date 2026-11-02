/** Decode a captured private-account profile before it reaches rendering.
 * Absent optional fields stay absent; a malformed row is a controlled failure
 * rather than a silently blank card.
 * refs: endpoints: GET /players/{id}/mcts-profile
 */
import type {
  MctsChampionRow,
  MctsCounts,
  MctsInventoryRow,
  MctsLoadout,
  MctsLoadoutItem,
  MctsProfileResponse,
  MctsProvenance,
} from "./mcts-profile-types";

/** Discriminated result of a private-profile decode. */
export type MctsProfileDecodeResult =
  | { ok: true; value: MctsProfileResponse }
  | { ok: false; error: { code: "INVALID_MCTS_PROFILE"; field: string } };

type RecordValue = Record<string, unknown>;

const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (field: string): MctsProfileDecodeResult => ({
  ok: false,
  error: { code: "INVALID_MCTS_PROFILE", field },
});

/** Coerce a backend number or numeric string; anything else is unavailable. */
function number(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Read an integer field; `null` stays null when the field is nullable and absent. */
function integer(source: RecordValue, name: string, absent: number | null = null): number | null | undefined {
  if (source[name] == null) return absent;
  const parsed = number(source[name]);
  return parsed !== undefined && Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Read a string field; absent values become the supplied fallback. */
function text(source: RecordValue, name: string, fallback = ""): string | undefined {
  if (source[name] == null) return fallback;
  return typeof source[name] === "string" ? source[name] : undefined;
}

/** Read a boolean field; absent values become false. */
function flag(source: RecordValue, name: string): boolean | undefined {
  if (source[name] == null) return false;
  return typeof source[name] === "boolean" ? source[name] : undefined;
}

/** Read an array of objects, returning a field path string on a shape error. */
function rows(value: unknown, name: string): RecordValue[] | string {
  if (value == null) return [];
  if (!Array.isArray(value)) return name;
  const collected: RecordValue[] = [];
  for (let index = 0; index < value.length; index++) {
    const item: unknown = value[index];
    if (!record(item)) return `${name}[${index}]`;
    collected.push(item);
  }
  return collected;
}

function champions(value: unknown): MctsChampionRow[] | string {
  const collected = rows(value, "champions");
  if (typeof collected === "string") return collected;
  const parsed: MctsChampionRow[] = [];
  for (let index = 0; index < collected.length; index++) {
    const row = collected[index];
    const prefix = `champions[${index}]`;
    const profileId = integer(row, "profile_id");
    const xp = integer(row, "xp", 0);
    const level = integer(row, "level", 0);
    const championName = text(row, "champion_name");
    const championId = integer(row, "champion_id");
    const characterId = integer(row, "character_id");
    const ownershipType = integer(row, "ownership_type");
    if (profileId == null) return `${prefix}.profile_id`;
    if (xp == null || xp < 0) return `${prefix}.xp`;
    if (level == null || level < 0) return `${prefix}.level`;
    if (championName === undefined) return `${prefix}.champion_name`;
    if (championId === undefined) return `${prefix}.champion_id`;
    if (characterId === undefined) return `${prefix}.character_id`;
    if (ownershipType === undefined) return `${prefix}.ownership_type`;
    parsed.push({
      profile_id: profileId,
      champion_id: championId,
      champion_name: championName,
      character_id: characterId,
      xp,
      level,
      ownership_type: ownershipType,
    });
  }
  return parsed;
}

function loadoutItems(value: unknown, prefix: string): MctsLoadoutItem[] | string {
  const collected = rows(value, `${prefix}.items`);
  if (typeof collected === "string") return collected;
  const parsed: MctsLoadoutItem[] = [];
  for (let index = 0; index < collected.length; index++) {
    const row = collected[index];
    const path = `${prefix}.items[${index}]`;
    const itemId = integer(row, "item_id");
    const count = integer(row, "count", 0);
    if (itemId == null) return `${path}.item_id`;
    if (count == null || count < 0) return `${path}.count`;
    parsed.push({ item_id: itemId, count });
  }
  return parsed;
}

function loadouts(value: unknown): MctsLoadout[] | string {
  const collected = rows(value, "loadouts");
  if (typeof collected === "string") return collected;
  const parsed: MctsLoadout[] = [];
  for (let index = 0; index < collected.length; index++) {
    const row = collected[index];
    const prefix = `loadouts[${index}]`;
    const loadoutId = integer(row, "loadout_id");
    const name = text(row, "name");
    const sortOrder = integer(row, "sort_order", 0);
    const championId = integer(row, "champion_id");
    const talentId = integer(row, "talent_id");
    if (loadoutId == null) return `${prefix}.loadout_id`;
    if (name === undefined) return `${prefix}.name`;
    if (sortOrder == null) return `${prefix}.sort_order`;
    if (championId === undefined) return `${prefix}.champion_id`;
    if (talentId === undefined) return `${prefix}.talent_id`;
    const items = loadoutItems(row.items, prefix);
    if (typeof items === "string") return items;
    parsed.push({ loadout_id: loadoutId, champion_id: championId, talent_id: talentId, name, sort_order: sortOrder, items });
  }
  return parsed;
}

function inventory(value: unknown): MctsInventoryRow[] | string {
  const collected = rows(value, "inventory");
  if (typeof collected === "string") return collected;
  const parsed: MctsInventoryRow[] = [];
  for (let index = 0; index < collected.length; index++) {
    const row = collected[index];
    const prefix = `inventory[${index}]`;
    const itemId = integer(row, "item_id");
    const owned = flag(row, "is_owned");
    const transient = flag(row, "is_transient");
    const instanceCount = integer(row, "instance_count", 0);
    const itemLevel = integer(row, "item_level", 0);
    const remainingSeconds = integer(row, "remaining_seconds", 0);
    const characterId = integer(row, "character_id");
    if (itemId == null) return `${prefix}.item_id`;
    if (owned === undefined) return `${prefix}.is_owned`;
    if (transient === undefined) return `${prefix}.is_transient`;
    if (instanceCount == null || instanceCount < 0) return `${prefix}.instance_count`;
    if (itemLevel == null || itemLevel < 0) return `${prefix}.item_level`;
    if (remainingSeconds == null || remainingSeconds < 0) return `${prefix}.remaining_seconds`;
    if (characterId === undefined) return `${prefix}.character_id`;
    parsed.push({
      item_id: itemId,
      character_id: characterId,
      is_owned: owned,
      is_transient: transient,
      instance_count: instanceCount,
      item_level: itemLevel,
      remaining_seconds: remainingSeconds,
    });
  }
  return parsed;
}

function provenance(value: unknown): MctsProvenance | null | undefined {
  if (value == null) return null;
  if (!record(value)) return undefined;
  const runId = text(value, "run_id");
  const member = text(value, "member");
  const status = text(value, "status");
  if (runId === undefined || member === undefined || status === undefined) return undefined;
  return { run_id: runId, member, status };
}

function counts(value: unknown): MctsCounts | undefined {
  if (value == null) return { champions: 0, loadouts: 0, inventory: 0 };
  if (!record(value)) return undefined;
  const championCount = integer(value, "champions", 0);
  const loadoutCount = integer(value, "loadouts", 0);
  const inventoryCount = integer(value, "inventory", 0);
  if (championCount == null || championCount < 0) return undefined;
  if (loadoutCount == null || loadoutCount < 0) return undefined;
  if (inventoryCount == null || inventoryCount < 0) return undefined;
  return { champions: championCount, loadouts: loadoutCount, inventory: inventoryCount };
}

/**
 * Decode an untrusted private-profile payload into typed capture rows.
 * A declared count never under-reports the rows that were actually captured.
 * refs: endpoints: GET /players/{id}/mcts-profile
 * I/O types: `raw: unknown -> MctsProfileDecodeResult`.
 */
export function decodeMctsProfileResponse(raw: unknown): MctsProfileDecodeResult {
  if (!record(raw)) return fail("response");
  const playerId = integer(raw, "player_id");
  const xpLevel = integer(raw, "xp_level", 0);
  const accountLevel = integer(raw, "account_level");
  const privacyFlag = integer(raw, "privacy_flag", 0);
  const name = text(raw, "name");
  const gamerTag = text(raw, "gamer_tag");
  const identityStatus = text(raw, "identity_status", "unknown");
  const source = text(raw, "source", "mcts");
  const statsNote = text(raw, "stats_note");
  const isPrivate = flag(raw, "private");
  const statsAvailable = flag(raw, "stats_available");
  const capturedAt = raw.captured_at == null ? null : text(raw, "captured_at");
  if (playerId == null) return fail("player_id");
  if (xpLevel == null) return fail("xp_level");
  if (accountLevel === undefined) return fail("account_level");
  if (privacyFlag == null) return fail("privacy_flag");
  if (name === undefined) return fail("name");
  if (gamerTag === undefined) return fail("gamer_tag");
  if (identityStatus === undefined) return fail("identity_status");
  if (source === undefined) return fail("source");
  if (statsNote === undefined) return fail("stats_note");
  if (isPrivate === undefined) return fail("private");
  if (statsAvailable === undefined) return fail("stats_available");
  if (capturedAt === undefined) return fail("captured_at");

  const championRows = champions(raw.champions);
  if (typeof championRows === "string") return fail(championRows);
  const loadoutRows = loadouts(raw.loadouts);
  if (typeof loadoutRows === "string") return fail(loadoutRows);
  const inventoryRows = inventory(raw.inventory);
  if (typeof inventoryRows === "string") return fail(inventoryRows);
  const provenanceRow = provenance(raw.provenance);
  if (provenanceRow === undefined) return fail("provenance");
  const countRow = counts(raw.counts);
  if (countRow === undefined) return fail("counts");

  return {
    ok: true,
    value: {
      player_id: playerId,
      source,
      private: isPrivate,
      privacy_flag: privacyFlag,
      name,
      gamer_tag: gamerTag,
      identity_status: identityStatus,
      xp_level: xpLevel,
      account_level: accountLevel,
      captured_at: capturedAt,
      provenance: provenanceRow,
      counts: {
        champions: Math.max(countRow.champions, championRows.length),
        loadouts: Math.max(countRow.loadouts, loadoutRows.length),
        inventory: Math.max(countRow.inventory, inventoryRows.length),
      },
      champions: championRows,
      loadouts: loadoutRows,
      inventory: inventoryRows,
      currency: Array.isArray(raw.currency) ? raw.currency : [],
      stats_available: statsAvailable,
      stats_note: statsNote,
    },
  };
}
