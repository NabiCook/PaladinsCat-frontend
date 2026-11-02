/** Tests the decoder for MCTS-captured private-account profiles.
 * The decoder is the only gate between an untrusted capture payload and the
 * private profile page, so every row shape it accepts is pinned here.
 * refs: endpoints: GET /players/{id}/mcts-profile
 */
import assert from "node:assert/strict";
import test from "node:test";

import { decodeMctsProfileResponse } from "./mcts-profile-response.ts";

const contractPayload = () => ({
  player_id: 736832975,
  source: "mcts",
  private: true,
  privacy_flag: 1,
  name: "Hidden",
  gamer_tag: "Private",
  identity_status: "private",
  xp_level: 4538104,
  account_level: 5,
  captured_at: "2026-10-29T18:22:41Z",
  provenance: { run_id: "run-20261029-1822", member: "fleet-02", status: "full" },
  counts: { champions: 2, loadouts: 1, inventory: 2 },
  champions: [
    {
      profile_id: 2560,
      champion_id: 2560,
      champion_name: "Nyx",
      character_id: 12884901888,
      xp: 1618544,
      level: 2,
      ownership_type: 10147,
    },
    { profile_id: 2477, champion_id: null, champion_name: "", character_id: null, xp: 0, level: 0, ownership_type: null },
  ],
  loadouts: [
    { loadout_id: 123, champion_id: 2560, talent_id: 17006, name: "Deck", sort_order: 1, items: [{ item_id: 11302, count: 1 }] },
  ],
  inventory: [
    {
      item_id: 9001,
      character_id: null,
      is_owned: true,
      is_transient: false,
      instance_count: 1,
      item_level: 0,
      remaining_seconds: 0,
    },
    {
      item_id: 9002,
      character_id: 2560,
      is_owned: false,
      is_transient: true,
      instance_count: 0,
      item_level: 3,
      remaining_seconds: 120,
    },
  ],
  currency: [],
  stats_available: false,
  stats_note: "match statistics are unavailable for API-hidden accounts",
});

test("accepts the agreed capture payload and keeps row detail intact", () => {
  const decoded = decodeMctsProfileResponse(contractPayload());
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const value = decoded.value;
  assert.equal(value.player_id, 736832975);
  assert.equal(value.account_level, 5);
  assert.equal(value.xp_level, 4538104);
  assert.equal(value.stats_available, false);
  assert.equal(value.provenance?.member, "fleet-02");
  assert.deepEqual(value.counts, { champions: 2, loadouts: 1, inventory: 2 });
  assert.equal(value.champions[0].champion_name, "Nyx");
  assert.equal(value.loadouts[0].items[0].item_id, 11302);
  assert.equal(value.inventory[1].remaining_seconds, 120);
});

test("keeps an unresolved champion name empty so the page can label it by profile id", () => {
  const decoded = decodeMctsProfileResponse(contractPayload());
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const unresolved = decoded.value.champions[1];
  assert.equal(unresolved.champion_name, "");
  assert.equal(unresolved.profile_id, 2477);
  assert.equal(unresolved.champion_id, null);
});

test("treats a missing account level as absent and numeric strings as numbers", () => {
  const payload = { ...contractPayload(), account_level: null, player_id: "736832975" };
  const decoded = decodeMctsProfileResponse(payload);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.value.account_level, null);
  assert.equal(decoded.value.player_id, 736832975);
});

test("never reports fewer rows than the payload actually carried", () => {
  const payload = { ...contractPayload(), counts: { champions: 0, loadouts: 0, inventory: 0 } };
  const decoded = decodeMctsProfileResponse(payload);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.value.counts, { champions: 2, loadouts: 1, inventory: 2 });
});

test("rejects a champion row with a non-numeric xp and names the failing field", () => {
  const payload = { ...contractPayload(), champions: [{ profile_id: 1, xp: "abc" }] };
  const decoded = decodeMctsProfileResponse(payload);
  assert.equal(decoded.ok, false);
  if (decoded.ok) return;
  assert.equal(decoded.error.code, "INVALID_MCTS_PROFILE");
  assert.equal(decoded.error.field, "champions[0].xp");
});

test("rejects a payload without an inventory array", () => {
  const payload = { ...contractPayload(), inventory: "nope" };
  const decoded = decodeMctsProfileResponse(payload);
  assert.equal(decoded.ok, false);
  if (decoded.ok) return;
  assert.equal(decoded.error.field, "inventory");
});

test("rejects a non-object payload", () => {
  assert.equal(decodeMctsProfileResponse(null).ok, false);
  assert.equal(decodeMctsProfileResponse([1, 2, 3]).ok, false);
  assert.equal(decodeMctsProfileResponse("oops").ok, false);
});
