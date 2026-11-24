import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the real request loop with deterministic transport and timers.
const source = readFileSync(new URL("./api-client.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("api-client.ts", source, ts.ScriptTarget.Latest, true);
const requestLoop = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "fetchJson");
const clearTag = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "clearPlayerTag");
const compiled = ts.transpileModule([requestLoop, clearTag].map(node => node.getText(parsed).replace("export ", "")).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(responses, expireDeadline = false) {
  const delays = [];
  let calls = 0;
  class ApiRequestError extends Error {
    constructor(message, status, details) { super(message); this.status = status; Object.assign(this, details); }
  }
  const api = new Function("fetch", "setTimeout", "clearTimeout", "API_BASE", "FETCH_TIMEOUT_MS",
    "withStoredLobbyTier", "csrfHeader", "API_ERROR_KEYS", "ApiRequestError", "getAuthToken", "hasCookieAuthSession", "accountAuthHeaders", "fingerprintHeaders", `${compiled}; return { fetchJson, clearPlayerTag };`)(
    async (_url, init) => {
      const response = responses[Math.min(calls++, responses.length - 1)];
      if (response instanceof Error) throw response;
      return typeof response === "function" ? response(init) : response;
    },
    (callback, delay) => {
      if (delay === 15_000 || delay === 45_000) {
        if (expireDeadline) queueMicrotask(callback);
      } else if (delay <= 30_000) {
        delays.push(delay);
        queueMicrotask(callback);
      }
      return 1;
    },
    () => {}, "/api", 45_000, (path) => path, () => null,
    { genericFailure: "failure" }, ApiRequestError, () => null, () => true, () => ({}), () => ({}),
  );
  return { ...api, delays, calls: () => calls };
}

const busy = (retryAfter) => Response.json({ error: { code: "DATA_BUSY" } }, {
  status: 503, headers: retryAfter === undefined ? {} : { "Retry-After": retryAfter },
});

test("recent matches wait for the advertised busy window before recovering", async () => {
  const expected = [{ match_id: "1282416902" }];
  const client = fixture([busy("2"), busy("2"), Response.json(expected)]);
  assert.deepEqual(await client.fetchJson("/players/736642310/matches?limit=20"), expected);
  assert.deepEqual(client.delays, [2000, 2000]);
  assert.equal(client.calls(), 3);
});

test("persistent busy responses still stop at the existing attempt limit", async () => {
  const client = fixture([busy("120")]);
  await assert.rejects(client.fetchJson("/players/736642310/matches?limit=20"));
  assert.deepEqual(client.delays, [30_000, 30_000]);
  assert.equal(client.calls(), 3);
});

test("missing or invalid GET hints retain the existing backoff", async () => {
  for (const [retryAfter, method] of [[undefined, "GET"], ["invalid", "GET"], ["-1", "GET"]]) {
    const client = fixture([busy(retryAfter), Response.json([])]);
    await client.fetchJson("/players/736642310/matches", { method });
    assert.deepEqual(client.delays, [500]);
  }
});

test("busy write responses preserve the server error without replaying the write", async () => {
  const client = fixture([busy("2"), Response.json([])]);
  await assert.rejects(client.fetchJson("/players/736642310/matches", { method: "POST" }), error => error.code === "DATA_BUSY");
  assert.deepEqual(client.delays, []);
  assert.equal(client.calls(), 1);
});

test("clear-tag preserves specific server errors and never retries a write", async () => {
  for (const [status, code] of [[409, "PLAYER_TAG_BUSY"], [503, "PLAYER_TAG_BUSY"], [504, "PLAYER_TAG_TIMEOUT"], [500, "PLAYER_TAG_CLEAR_FAILED"]]) {
    const message = "Cannot clear the cheater tag; reload the profile before retrying.";
    const client = fixture([Response.json({ error: { code, message, requestId: "clear-test" } }, { status })]);
    await assert.rejects(client.clearPlayerTag(15897375, "cheater"), error => {
      assert.equal(error.message, message);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(error.requestId, "clear-test");
      return true;
    });
    assert.equal(client.calls(), 1);
  }
});

test("clear-tag network failures and stalled responses stop after one bounded attempt", async () => {
  const network = fixture([new TypeError("network unavailable")]);
  await assert.rejects(network.clearPlayerTag(15897375, "cheater"), error => error.kind === "network");
  assert.equal(network.calls(), 1);
  const stalled = fixture([init => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))], true);
  await assert.rejects(stalled.clearPlayerTag(15897375, "cheater"), error => {
    assert.equal(error.kind, "timeout");
    assert.equal(error.timeoutMs, 15_000);
    return true;
  });
  assert.equal(stalled.calls(), 1);
});

test("clear-tag UI always leaves submitting state after a request failure", async () => {
  const profile = ts.createSourceFile("profile.tsx", readFileSync(new URL("../app/players/[id]/player-profile-client.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const find = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(profile) === "clearModerationTag") callback = node.initializer;
    ts.forEachChild(node, find);
  };
  find(profile);
  assert.ok(callback);
  const code = ts.transpileModule(`const clear = ${callback.getText(profile)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const states = [];
  let feedback;
  const handler = new Function("useCallback", "window", "isAdmin", "t", "setClearingTag", "clearPlayerTag", "id", "setActionMenuOpen", "setFetchKey", "setRefreshFeedback", "formatApiErrorMessage", `${code}; return clear;`)(
    fn => fn, { confirm: () => true }, true, (key, values) => {
      const catalog = JSON.parse(readFileSync(new URL('./localization/catalog/ui/moderation.json', import.meta.url), 'utf8'));
      return (catalog[key] ?? key).replace('{tag}', values?.tag ?? '');
    }, value => states.push(value),
    async () => { throw new Error("locked"); }, "15897375", () => {}, () => {}, value => { feedback = value; }, (_error, _t, fallback) => fallback,
  );
  await handler("cheater");
  assert.deepEqual(states, ["cheater", null]);
  assert.equal(feedback.kind, "error");
  assert.match(feedback.message, /cheater/);
});
