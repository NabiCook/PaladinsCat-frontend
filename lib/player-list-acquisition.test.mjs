/**
 * Exercise the shipped Friends, Relationships and profile acquisition functions.
 * Transport and DOM nodes are local fixtures; no browser or live provider is used.
 * refs: see: public/app/discovery-player-details.js, public/app/discovery-player-name.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/app/discovery-player-details.js", import.meta.url), "utf8");
const nameSource = readFileSync(new URL("../public/app/discovery-player-name.js", import.meta.url), "utf8");

function region(text, start, end) {
  const first = text.indexOf(start);
  const last = text.indexOf(end, first);
  assert.ok(first >= 0 && last > first, "use the shipped function");
  return text.slice(first, last);
}

function node(tag, className = "", textContent = "") {
  return {
    tag, className, textContent, children: [], style: {}, dataset: {}, classList: { add() {}, toggle() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {},
  };
}

function harness(request) {
  const render = [];
  const fetches = [];
  const link = (name, href, className) => Object.assign(node("a", className, name), { href });
  const DiscoveryPlayerName = {
    mount() { assert.fail("a list row initiated a fallback badge lookup"); },
    mountStored(element, name, id, moderation) {
      if (moderation) render.push({ element, name, id, moderation });
    },
  };
  const instance = vm.createContext({
    exports: {}, URL, window: { DiscoveryPlayerName },
    App: { async request(...inputs) { fetches.push(inputs[0]); return request(...inputs); } },
    n: node, link, panel: () => node("section"), button: () => node("button"),
    paragraph: (text) => node("p", "", text), tr: (_, fallback) => fallback, ui: (_, fallback) => fallback,
    active: () => true, num: Number, fmt: String, rate: String, rows: (value) => value,
    positive: (value) => /^[1-9]\d*$/.test(String(value)),
    document: { createTextNode: (text) => node("#text", "", text) },
  });
  vm.runInContext([
    "const profileRequests = new Map();",
    region(source, "  async function profile(id)", "  function tabs("),
    region(source, "  function friendPlatformIcon(", "  function masteryLevel("),
    region(source, "  function relationshipPlayerLink(", "  function evidencePicture("),
    "Object.assign(exports, { profile, friendsView, relationshipsView });",
  ].join("\n"), instance);
  return { ...instance.exports, render, fetches };
}

test("Friends and Blocked render their owning response without per-row fetches", async () => {
  const moderation = { verified: true, custom_tag: "Current", tank_diff_count: 5 };
  const h = harness(async () => ({
    status: "ready",
    friends: [
      { id: "41", name: "Current Friend", status: "Friend", moderation },
      { id: "42", name: "Legacy Friend", status: "Friend" },
      { id: "43", name: "Blocked Match", status: "Blocked", moderation },
    ],
  }));
  for (const [kind, expected] of [["Friend", "41"], ["Blocked", "43"]]) {
    const body = node("div");
    await h.friendsView({ body }, "100", new URL("http://fixture/?relationship=" + kind));
    const shown = h.render.at(-1);
    assert.equal(shown.id, expected);
    assert.equal(shown.moderation, moderation);
    assert.equal(shown.element.textContent, shown.name);
  }
  assert.equal(h.render.length, 2);
  assert.deepEqual(h.fetches, ["/players/100/friends?refresh=true", "/players/100/friends?refresh=true"]);
});

test("Private friend snapshots also suppress stale rows and badges", async () => {
  const h = harness(async () => ({
    status: "private",
    friends: [{ id: "41", name: "Retained Friend", status: "Friend", moderation: { verified: true } }],
  }));
  const body = node("div");
  await h.friendsView({ body }, "100", new URL("http://fixture/"));
  assert.deepEqual(h.fetches, ["/players/100/friends?refresh=true"]);
  assert.equal(h.render.length, 0);
  assert.ok(!JSON.stringify(body).includes("Retained Friend"));
});

test("Relationships renders authorized badges and legacy peer links with one summary request", async () => {
  const h = harness(async () => ({
    scope: "casual",
    teammates: [
      { other_player_id: 51, other_player_name: "Current Peer", match_count: 2, moderation: { cheater: true } },
      { other_player_id: 52, other_player_name: "Legacy Peer", match_count: 1 },
    ],
  }));
  const body = node("div");
  await h.relationshipsView({ body }, "100", new URL("http://fixture/?scope=casual"));
  assert.deepEqual(h.fetches, ["/coplay/summary/100?limit=50&contract=metrics-v3&scope=casual"]);
  assert.equal(h.render.length, 1);
  assert.equal(h.render[0].element.href, "/players/51");
  assert.equal(h.render[0].moderation.cheater, true);
  assert.ok(JSON.stringify(body).includes("Legacy Peer"));
});

test("Native badges mount stored fields in no-lookup mode", () => {
  const calls = [];
  const context = {
    window: { DiscoveryPlayerName: {} },
    ve(...args) { calls.push(args); },
  };
  vm.runInNewContext([
    region(nameSource, "function M(e){", "/* Share only active readers"),
    region(nameSource, "  window.DiscoveryPlayerName.mountStored =", "})();"),
  ].join("\n"), context);
  const element = node("a", "", "Player");
  context.window.DiscoveryPlayerName.mountStored(element, "Player", 51, { tank_diff_count: 5, verified: true });
  context.window.DiscoveryPlayerName.mountStored(element, "Player", 52, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].storedModeration.tankDiffCount, 5);
  assert.equal(calls[0][2].storedModeration.verified, true);
  assert.equal(calls[0][3], true);
});

test("Profile acquisition coalesces in-flight callers and rereads after success or failure", async () => {
  const pending = [];
  const h = harness(() => {
    const request = Promise.withResolvers();
    pending.push(request);
    return request.promise;
  });
  const first = h.profile("100");
  const concurrent = h.profile("100");
  assert.equal(pending.length, 1);
  pending[0].resolve({ player: { id: 100, name: "Stored" } });
  assert.equal((await first).player.name, "Stored");
  assert.equal((await concurrent).player.name, "Stored");

  const second = h.profile("100");
  assert.equal(pending.length, 2);
  pending[1].reject(Object.assign(new Error("Unavailable"), { status: 503 }));
  await assert.rejects(second, /Unavailable/);

  const afterRefresh = h.profile("100");
  assert.equal(pending.length, 3);
  pending[2].resolve({ player: { id: 100, name: "Refreshed" } });
  assert.equal((await afterRefresh).player.name, "Refreshed");
});
