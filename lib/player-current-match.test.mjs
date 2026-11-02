/** Execute the real profile component's Current Match action and rendered states. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function setup(responses, id = "736586748") {
  const slots = [], requests = [], timeouts = [], modules = new Map();
  let cursor = 0;
  const state = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const text = value => value == null ? "" : String(value);
  const dependencies = {
    react: { useState: state, useCallback: callback => callback, useEffect: () => {},
      useRef: initial => state(() => ({ current: initial }))[0] },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/auth-context": { useAuth: () => ({ user: { linkedPlayerId: 42, invitationActive: true },
      isLoading: false, isLoggedIn: true, isAdmin: false, isApproved: true }) },
    "@/lib/localization-context": { useLocalization: () => ({ t: key => key,
      formatNumber: text, formatPercent: text, formatDuration: text, formatDate: text, formatDateTime: text }) },
    "@/lib/use-local-preview-access": { useLocalPreviewAccess: () => false, localPreviewAccessEnabled: () => false },
    "@/lib/route-transition-context": { useRouteSettledLoading: value => value },
    "@/lib/tier-utils": { resolveEffectiveTier: () => ({ displayTier: 0, displayName: "Unranked", isGrandmaster: false }),
      getTierColor: () => "#fff", getRankIconPath: () => null },
    "@/lib/player-title": { parsePlayerTitle: () => ({ text: "" }), parsePlayerTitleSegments: () => null },
    "@/lib/loading-frame-assets": { displayLoadingFrameName: () => null },
    "@/lib/player-avatar-proxy": { playerAvatarProxyPath: () => null },
    "@/lib/champion-icons": { getChampionIconSafe: () => "/images/champion.png" },
    "@/lib/stat-quality": { getPercentageColor: () => "#fff" },
    "@/lib/time-format": { formatLocalDate: text, formatLocalDateTime: text },
    "@/lib/kda": { formatKda: () => "0" },
    "@/lib/csrf": { csrfHeader: () => ({}) },
    "@/lib/api-client": {},
    "@/lib/player-moderation": {},
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports;
    const loaded = { exports: {} };
    modules.set(relative, loaded);
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    new Function("require", "module", "exports", "fetch", "process", "AbortSignal", code)(name => {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith("@/components/") || name === "lucide-react") {
        return new Proxy({}, { get: (_target, exported) => exported === "__esModule" ? true : String(exported) });
      }
      const actual = { "@/lib/api-errors": "./api-errors.ts", "@/lib/player-profile-response": "./player-profile-response.ts",
        "@/lib/verified-access": "./verified-access.ts" }[name];
      assert.ok(actual, `Unexpected profile dependency: ${name}`);
      return load(actual);
    }, loaded, loaded.exports, async (url, options) => {
      requests.push({ url, options });
      assert.ok(responses.length, "Unexpected extra Current Match acquisition");
      const next = responses.shift();
      return new Response(JSON.stringify(next.body ?? next), { status: next.status ?? 200 });
    }, { env: {} }, { timeout: milliseconds => {
      timeouts.push(milliseconds);
      return AbortSignal.timeout(milliseconds);
    } });
    return loaded.exports;
  }
  const Component = load("../app/players/[id]/player-profile-client.tsx").default;
  function render() {
    cursor = 0;
    return Component({ id, initialResponse: { player: { id: "736586748", name: "Fixture profile", kbm_wins: 0, kbm_losses: 0 } } });
  }
  function find(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, predicate);
      if (found) return found;
    }
  }
  function all(node, predicate) {
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, predicate))];
  }
  function contents(node) {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) return node.map(contents).join(" ");
    return typeof node === "object" ? contents(node.props?.children) : String(node);
  }
  return {
    render, requests, timeouts, contents,
    find: predicate => find(render(), predicate),
    all: (predicate, node = render()) => all(node, predicate),
    open: () => {
      const button = find(render(), node => node.type === "button" && node.props.title === "generated.players.checkCurrentMatch");
      assert.ok(button, "The real profile Current Match button must render");
      return button.props.onClick();
    },
  };
}

const live = (matchId, map, playerId, name, champion) => ({
  match: { match_id: matchId, map, status: "active", queue_id: 486 },
  players: [{ player_id: playerId, task_force: 1, player_name: name, champion_name: champion },
    { player_id: "42", task_force: 2, player_name: "Other team", champion_name: "Ying" }],
});

// Preserve the failing production contract's numeric portal codes, nullable
// enrichment, and two full teams using synthetic identities. An external
// sanitized fixture can also verify its exact response shape without copying
// runtime player data into the repository.
function nativePortalRoster() {
  if (process.env.PALADINSCAT_CURRENT_MATCH_FIXTURE) {
    return JSON.parse(readFileSync(process.env.PALADINSCAT_CURRENT_MATCH_FIXTURE, "utf8"));
  }
  return {
    match: { match_id: "1280000001", map: "Fixture Quarry", queue_id: 486, status: "active" },
    players: Array.from({ length: 10 }, (_unused, index) => ({
      player_id: String(10000001 + index), player_name: `Fixture player ${index + 1}`,
      task_force: index < 5 ? 1 : 2, platform: [5, 28, 1][index % 3],
      profile_platform: index % 2 === 0 ? "Steam" : null,
      champion_name: index % 2 === 0 ? "Ying" : "Koga", has_profile: index % 2 === 0,
      profile_level: index % 2 === 0 ? 100 : null, account_level: 100, mastery_level: 10,
      profile_mastery_level: null, profile_matches: 0, ranked_matches: 0,
      total_matches: 0, total_wins: 0, kbm_tier: 0, kbm_rank: null, queue_elo: null,
    })),
    team_one_win_chance: 50, team_two_win_chance: 50,
  };
}

test("Current Match requests same-origin fresh data with its existing bounds", async () => {
  const ui = setup([{ match: null, players: [] }]);
  await ui.open();
  assert.equal(ui.requests.length, 1);
  const { url, options } = ui.requests[0];
  assert.equal(url, "/api/live/players/736586748?refresh=true");
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.signal.aborted, false);
  assert.deepEqual(ui.timeouts, [60_000]);
  assert.equal(options.credentials, undefined, "Keep the browser's same-origin cookie default");
  assert.match(ui.contents(ui.render()), /generated\.players\.notInALiveMatch/);
});

test("Current Match encodes the player id as one path segment", async () => {
  const ui = setup([{ match: null, players: [] }], "736586748/other?value=1");
  await ui.open();
  assert.equal(ui.requests[0].url, "/api/live/players/736586748%2Fother%3Fvalue%3D1?refresh=true");
});

test("fresh results replace displayed match and roster, then clear them when no longer live", async () => {
  const ui = setup([live(111, "First map", "736586748", "First roster", "Androxus"),
    live(222, "Second map", "736586749", "New roster", "Koga"), { match: null, players: [], player_id: 736586748 }]);
  await ui.open();
  assert.ok(ui.find(node => node.type === "a" && node.props.href === "/matches/111"));
  assert.ok(ui.find(node => node.type === "a" && node.props.href === "/players/736586748"));
  assert.match(ui.contents(ui.render()), /First map/);
  assert.match(ui.contents(ui.render()), /First roster/);
  assert.match(ui.contents(ui.render()), /Androxus/);
  const second = ui.open();
  assert.equal(ui.find(node => node.type === "a" && node.props.href === "/matches/111"), undefined, "Clear stale match while acquiring fresh data");
  await second;
  assert.ok(ui.find(node => node.type === "a" && node.props.href === "/matches/222"));
  assert.ok(ui.find(node => node.type === "a" && node.props.href === "/players/736586749"));
  const changed = ui.contents(ui.render());
  assert.match(changed, /Second map/);
  assert.match(changed, /New roster/);
  assert.match(changed, /Koga/);
  assert.doesNotMatch(changed, /First map|First roster|Androxus/);
  await ui.open();
  assert.equal(ui.find(node => node.type === "a" && node.props.href === "/matches/222"), undefined);
  const idle = ui.contents(ui.render());
  assert.match(idle, /generated\.players\.notInALiveMatch/);
  assert.doesNotMatch(idle, /Second map|New roster|Koga/);
  assert.deepEqual(ui.requests.map(request => request.url), Array(3).fill("/api/live/players/736586748?refresh=true"));
});

test("native numeric portal roster renders ten players in their real teams and retains no-live/error behavior", async () => {
  const fixture = nativePortalRoster();
  assert.equal(fixture.players.length, 10);
  assert.ok(fixture.players.every(player => typeof player.platform === "number"));
  const ui = setup([fixture, { match: null, players: [] }, fixture,
    { status: 503, body: { error: { code: "PROTECTION_UNAVAILABLE", message: "Protection temporarily unavailable." } } }]);
  await ui.open();
  const matchPath = `/matches/${fixture.match.match_id}`;
  assert.ok(ui.find(node => node.type === "a" && node.props.href === matchPath), "Native live response must render its match link");
  const populated = ui.contents(ui.render());
  assert.ok(populated.includes(fixture.match.map), "Native live response must render its map");
  const rosterPaths = new Set(fixture.players.map(player => `/players/${player.player_id}`));
  const teams = ui.all(node => node.type === "section" && ui.all(child => child.type === "a" && rosterPaths.has(child.props.href), node).length > 0);
  assert.equal(teams.length, 2);
  for (const [index, team] of teams.entries()) {
    const members = fixture.players.filter(player => Number(player.task_force) === index + 1);
    assert.equal(members.length, 5);
    assert.deepEqual(ui.all(node => node.type === "a" && rosterPaths.has(node.props.href), team).map(node => node.props.href),
      members.map(player => `/players/${player.player_id}`));
    const rendered = ui.contents(team);
    for (const player of members) {
      assert.ok(rendered.includes(player.player_name), "Team must render its own player name");
      assert.ok(rendered.includes(player.champion_name), "Team must render its player's champion");
    }
  }
  await ui.open();
  assert.equal(ui.find(node => node.type === "a" && node.props.href === matchPath), undefined);
  assert.match(ui.contents(ui.render()), /generated\.players\.notInALiveMatch/);
  assert.equal(ui.all(node => node.type === "a" && rosterPaths.has(node.props.href)).length, 0);
  await ui.open();
  assert.ok(ui.find(node => node.type === "a" && node.props.href === matchPath));
  await ui.open();
  assert.match(ui.contents(ui.render()), /Protection temporarily unavailable\./);
  assert.doesNotMatch(ui.contents(ui.render()), /generated\.players\.notInALiveMatch/);
  assert.equal(ui.find(node => node.type === "a" && node.props.href === matchPath), undefined);
});

test("malformed successful live data and HTTP failures remain errors rather than invented matches", async () => {
  for (const response of [{ match: { match_id: 111 }, players: "invalid" },
    { status: 429, body: { error: { code: "RATE_LIMITED", message: "Try again shortly." } } }]) {
    const ui = setup([response]);
    await ui.open();
    assert.equal(ui.find(node => node.type === "a" && node.props.href === "/matches/111"), undefined);
    const rendered = ui.contents(ui.render());
    assert.match(rendered, response.status ? /Try again shortly\./ : /generated\.players\.failedToFetchLiveMatchData/);
    assert.doesNotMatch(rendered, /generated\.players\.notInALiveMatch/);
  }
});
