import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.env.PLAYER_PROFILE_SOURCE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const require = createRequire(path.join(process.env.PLAYER_PROFILE_DEPENDENCY_ROOT || process.cwd(), "package.json"));
const ts = require("typescript"), loaded = { exports: {} };
const source = process.env.PLAYER_PROFILE_SOURCE_REVISION
  ? execFileSync("git", ["-C", root, "show", `${process.env.PLAYER_PROFILE_SOURCE_REVISION}:lib/player-profile-response.ts`], { encoding: "utf8", timeout: 10_000 })
  : readFileSync(path.join(root, "lib/player-profile-response.ts"), "utf8");
new Function("module", "exports", ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(loaded, loaded.exports);
const { decodePlayerProfileResponse: decode, decodePlayerLiveMatchResponse: live } = loaded.exports;
const profile = () => ({ player: { id: "16706730", name: "Contract player", wins: 123, losses: 45 },
  access: { fullAccess: true, limit: null, remaining: null, resetAtMs: null } });
const queue = () => ({ queue_id: 486, mu: 1234, phi: 50, volatility: 0.06, matches_played: 10, wins: 7, losses: 3 });
const champion = () => ({ champion_id: 2056, champion_name: "Androxus", mu: 2345, phi: 60, matches_played: 10, wins: 6, losses: 4 });
function accepted(value) { const result = decode(value); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
function rejected(value, field) {
  const result = decode(value);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_PLAYER_PROFILE");
  if (field) assert.equal(result.error.field, field);
  assert.equal("value" in result, false, "bad data cannot masquerade as a populated profile");
}

test("profile-decode normal omitted arrays", () => {
  const input = profile(), value = accepted(input);
  assert.deepEqual(value.queueRatings, []); assert.deepEqual(value.championRatings, []);
  assert.equal("presence" in value, false); assert.equal("profileRefresh" in value, false);
  assert.equal(value.player.wins, 123); assert.equal(value.access.fullAccess, true);
});
test("profile-decode null optional arrays and objects", () => {
  const value = accepted({ ...profile(), queueRatings: null, championRatings: null, presence: null,
    profileRefresh: null, refreshQuota: null, globalStats: null });
  assert.deepEqual(value.queueRatings, []); assert.deepEqual(value.championRatings, []);
  assert.equal(value.presence, null); assert.equal(value.refreshQuota, null);
});
test("profile-decode populated rating arrays", () => {
  const value = accepted({ ...profile(), queueRatings: [queue()], championRatings: [champion()] });
  assert.deepEqual(value.queueRatings, [queue()]); assert.deepEqual(value.championRatings, [champion()]);
});
test("profile-decode malformed required envelope", () => {
  for (const value of [null, [], 1, "profile", {}, { player: null }, { player: [] },
    { player: { name: "Missing id" } }, { player: { id: "01", name: "Invalid id" } },
    { player: { id: "16706730", name: {} } }, { player: { id: "16706730", name: "Player", title: {} } },
    { player: { id: "16706730", name: "Player", wins: {} } }]) rejected(value);
});
test("profile-decode malformed rating collections", () => {
  for (const key of ["queueRatings", "championRatings"]) for (const value of ["ratings", {}, 1, true]) {
    rejected({ ...profile(), [key]: value }, key);
  }
});
test("profile-decode malformed rating elements", () => {
  for (const item of [null, [], {}, { ...queue(), mu: {} }, { ...queue(), phi: Infinity },
    { ...queue(), queue_id: "01" }, { ...queue(), wins: -1 }]) rejected({ ...profile(), queueRatings: [item] });
  for (const item of [null, [], {}, { ...champion(), champion_name: {} }, { ...champion(), matches_played: 0.5 }]) {
    rejected({ ...profile(), championRatings: [item] });
  }
});
test("profile-decode malformed optional objects", () => {
  for (const field of ["presence", "statusRefresh", "historyRefresh", "championStatsRefresh", "profileRefresh", "refreshQuota", "access", "globalStats"]) {
    rejected({ ...profile(), [field]: "object" }, field);
  }
  rejected({ ...profile(), presence: { status: 99, status_string: {} } }, "presence.status_string");
  rejected({ ...profile(), presence: {} }, "presence.status");
  rejected({ ...profile(), access: { fullAccess: "true" } }, "access.fullAccess");
  rejected({ ...profile(), profileRefresh: { expired: "false" } }, "profileRefresh.expired");
  rejected({ ...profile(), player: { ...profile().player, derived_rates: [] } }, "player.derived_rates");
});
test("profile-decode preserves limited and private data", () => {
  const input = profile(); input.player.privacy_flag = "y"; input.player.avatar_url = null;
  input.access.fullAccess = false; input.access.limit = 10; input.access.remaining = 3;
  const value = accepted(input);
  assert.equal(value.access.fullAccess, false); assert.equal(value.access.remaining, 3);
  assert.equal(value.player.privacy_flag, "y"); assert.equal(value.player.avatar_url, null);
  assert.equal("derived_rates" in value.player, false); assert.equal("globalStats" in value, false);
});
test("profile-decode never mutates or throws for hostile input", () => {
  const input = profile(); Object.freeze(input.player); Object.freeze(input.access); Object.freeze(input);
  const before = JSON.stringify(input), value = accepted(input);
  assert.equal(JSON.stringify(input), before); assert.notEqual(value, input); assert.notEqual(value.player, input.player);
  const hostile = new Proxy({}, { get() { throw new Error("Hostile property access"); } });
  assert.doesNotThrow(() => rejected(hostile));
});
test("profile-decode SQL numeric strings retain valid ratings", () => {
  const value = accepted({ ...profile(), queueRatings: [{ ...queue(), queue_id: "486", mu: "1234.5", wins: "7" }],
    championRatings: [{ ...champion(), champion_id: "2056", mu: "2345.5", matches_played: "10" }] });
  assert.equal(value.queueRatings[0].queue_id, 486); assert.equal(value.queueRatings[0].mu, 1234.5);
  assert.equal(value.championRatings[0].matches_played, 10);
});
test("profile-decode live match roster unavailable", () => {
  for (const players of [undefined, null]) {
    const input = { match: { match_id: "1281147898", map: "Stone Keep", status: "active" }, ...(players === null ? { players } : {}) };
    const result = live(input); assert.equal(result.ok, true);
    assert.equal(result.value.players, players);
    assert.equal(Object.hasOwn(result.value, "players"), players === null, "unavailable rosters are not invented empty teams");
  }
});
test("profile-decode live match populated roster", () => {
  const result = live({ match: { match_id: 1281147898, status: "active" },
    players: [{ player_id: "16706730", task_force: "1", player_name: "Player", champion_name: "Androxus" }] });
  assert.equal(result.ok, true); assert.equal(result.value.match.match_id, "1281147898");
  assert.equal(result.value.players[0].task_force, 1); assert.equal(result.value.players[0].player_name, "Player");
});
test("live roster preserves native numeric portal codes and nullable enrichment", () => {
  const row = { player_id: "16706730", task_force: 1, platform: 5, profile_platform: null, profile_level: null };
  const result = live({ match: { match_id: "1281147898" }, players: [row] });
  assert.equal(result.ok, true);
  assert.equal(result.value.players[0].platform, 5);
  assert.equal(result.value.players[0].profile_platform, null);
  for (const platform of [false, {}, -1, 1.5, Infinity]) {
    const invalid = live({ match: { match_id: "1281147898" }, players: [{ ...row, platform }] });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.field, "players[0].platform");
  }
});

test("profile-decode live match malformed payload", () => {
  for (const input of [null, {}, { match: [] }, { match: { match_id: {} } },
    { match: { match_id: "1281147898" }, players: "roster" },
    { match: { match_id: "1281147898" }, players: [null] },
    { match: { match_id: "1281147898" }, players: [{ player_id: "16706730", task_force: {}, player_name: "Player" }] },
    { match: { match_id: "1281147898" }, players: [{ player_id: "16706730", task_force: 1, champion_name: {} }] },
    { match: { match_id: "1281147898" }, players: [{ player_id: "16706730", task_force: 1, profile_level: {} }] }]) {
    const result = live(input); assert.equal(result.ok, false); assert.equal(result.error.code, "INVALID_PLAYER_LIVE_MATCH");
    assert.equal("value" in result, false);
  }
});
