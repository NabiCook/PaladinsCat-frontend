import test from "node:test";
import assert from "node:assert/strict";
import { accountDestination, isAccountOnlyPath, hasStatsAccess, isVerifiedOnlyPath, verifiedDestination } from "./verified-access.ts";

test("protects every Community menu route with account access", () => {
  for (const path of ["/community", "/community/42", "/community/diminishing-returns", "/builds", "/builds/create", "/tierlists", "/tierlists/7/edit"]) {
    assert.equal(isAccountOnlyPath(path), true, path);
  }
  assert.equal(isAccountOnlyPath("/community-guidelines"), false);
  assert.equal(accountDestination("/community?sort=new", null, false), "/auth/login?redirect=%2Fcommunity%3Fsort%3Dnew");
  assert.equal(accountDestination("/community", { linkedPlayerId: null }, false), "/link-account");
});

test("protects stats and player directory roots and details", () => {
  for (const path of [
    "/stats", "/stats/", "/players", "/players/",
    "/stats/performance", "/stats/champions", "/stats/items", "/stats/items/1",
    "/stats/maps", "/stats/compositions", "/stats/skins", "/stats/ecpm",
    "/stats/tiers", "/stats/activity", "/players/713736801/loadouts", "/players/cheaters",
    "/game/items", "/game/maps/Bazaar",
    "/game/compositions",
  ]) {
    assert.equal(isVerifiedOnlyPath(path), true, path);
  }
  for (const path of ["/", "/features", "/stats-extra", "/players-extra"]) {
    assert.equal(isVerifiedOnlyPath(path), false, path);
  }
});

test("directory roots wait for authentication and use the subpage access wall", () => {
  for (const path of ["/players", "/stats"]) {
    assert.equal(verifiedDestination(path, null, true), null, path);
    assert.equal(verifiedDestination(path, null, false), `/auth/login?redirect=${encodeURIComponent(path)}`, path);
    assert.equal(verifiedDestination(path, { linkedPlayerId: null }, false), "/link-account", path);
    assert.equal(verifiedDestination(path, { linkedPlayerId: 42, invitationActive: true }, false), path, path);
  }
});

test("base profiles require the same combined entitlement as secondary data", () => {
  for (const path of ["/players/16706730", "/players/16706730/", "/players/16706730?tab=matches"]) {
    assert.equal(isAccountOnlyPath(path), true);
    assert.equal(isVerifiedOnlyPath(path), true);
    assert.equal(verifiedDestination(path, null, false), `/auth/login?redirect=${encodeURIComponent(path)}`);
    assert.equal(verifiedDestination(path, { linkedPlayerId: null }, false), "/link-account");
  }
  for (const path of ["/players/16706730/loadouts", "/players/16706730/friends", "/players/16706730/champions", "/players/private-tracking/1"]) {
    assert.equal(isVerifiedOnlyPath(path), true);
    assert.equal(verifiedDestination(path, { linkedPlayerId: null }, false), "/link-account");
  }
});

test("routes gated access from the canonical linked-player state", () => {
  const path = "/stats/performance?scope=casual&metric=dpm";

  assert.equal(verifiedDestination(path, null, true), null);
  assert.equal(
    verifiedDestination(path, null, false),
    `/auth/login?redirect=${encodeURIComponent(path)}`,
  );
  assert.equal(verifiedDestination(path, { linkedPlayerId: null }, false), "/link-account");
  assert.equal(verifiedDestination(path, { linkedPlayerId: 713736801, invitationActive: true }, false), path);
});

test("verification and a live invitation are both required, with self-service reachable", () => {
  for (const path of ["/stats", "/players", "/players/42", "/community", "/builds", "/tierlists", "/operations/tickets"]) {
    for (const invitationActive of [undefined, false]) {
      assert.equal(verifiedDestination(path, { linkedPlayerId: 42, invitationActive }, false), "/account#invitation", path);
    }
    assert.equal(verifiedDestination(path, { linkedPlayerId: null, invitationActive: true }, false), "/link-account", path);
    assert.equal(verifiedDestination(path, { linkedPlayerId: 42, invitationActive: true, invitationExpiresAt: "2000-01-01T00:00:00Z" }, false), "/account#invitation", path);
  }
  for (const path of ["/account", "/account#invitation", "/link-account"]) {
    assert.equal(verifiedDestination(path, { linkedPlayerId: null }, false), path);
    assert.equal(accountDestination(path, { linkedPlayerId: 42 }, false), path);
  }
  assert.equal(hasStatsAccess({ linkedPlayerId: 42, invitationActive: true, invitationExpiresAt: "invalid" }), false);
});

test("disabled global requirement preserves verified and limited account access", () => {
  for (const path of ["/stats", "/players", "/players/42", "/community", "/builds", "/tierlists", "/operations/tickets"]) {
    for (const invitationActive of [undefined, false, true]) {
      const user = { linkedPlayerId: 42, invitationRequired: false, invitationActive, invitationExpiresAt: "2000-01-01T00:00:00Z" };
      assert.equal(verifiedDestination(path, user, false), path);
      assert.equal(hasStatsAccess(user), true);
    }
    assert.equal(verifiedDestination(path, null, false), `/auth/login?redirect=${encodeURIComponent(path)}`);
  }
  for (const path of ["/players/42", "/community", "/builds", "/tierlists", "/operations/tickets"]) {
    assert.equal(accountDestination(path, { linkedPlayerId: null, invitationRequired: false }, false), path);
  }
  assert.equal(verifiedDestination("/stats", { linkedPlayerId: null, invitationRequired: false }, false), "/link-account");
  assert.equal(hasStatsAccess({ linkedPlayerId: null, invitationRequired: false, invitationActive: true }), false);
});
