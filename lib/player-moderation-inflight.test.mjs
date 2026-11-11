/**
 * Exercise canonical TypeScript and shipped native moderation loaders under slow reads.
 * Transport and timers are controlled; actual payload mapping and queue code run unchanged.
 * Native coverage is unconditional: TypeScript-only checks cannot verify the public SPA.
 * refs: lib/player-moderation.ts · public/app/discovery-player-name.js · public/app/discovery-scoreboard.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const implementations = [
  { name: "TypeScript", file: "./player-moderation.ts" },
  { name: "player-name browser bundle", file: "../public/app/discovery-player-name.js", start: "const P={cheater:", end: "const j=", single: "I", endpoint: "/api/v1/players/bulk" },
  { name: "scoreboard browser bundle", file: "../public/app/discovery-scoreboard.js", start: "const fn={cheater:", end: "const _n=", single: "Cn", batch: "wn", privateBatch: "xn", endpoint: "/api/players/bulk" },
];

function harness(implementation) {
  let nextTimer = 1;
  const timers = new Map();
  const requests = [];
  const context = vm.createContext({
    exports: {}, process: { env: {} }, console,
    setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    N: () => ({ Authorization: "Bearer fixture-only" }),
    dn: () => ({ Authorization: "Bearer fixture-only" }),
    fetch(url, init) {
      return new Promise((resolve, reject) => requests.push({
        url: String(url), init,
        release(players) { resolve({ ok: true, json: async () => ({ data: { players } }) }); },
        response(value) { resolve(value); },
        reject,
      }));
    },
  });
  const source = readFileSync(new URL(implementation.file, import.meta.url), "utf8");
  if (implementation.start) {
    const start = source.indexOf(implementation.start);
    const end = source.indexOf(implementation.end, start);
    assert.ok(start > 0 && end > start, "execute the shipped moderation source region");
    assert.equal(source.indexOf(implementation.start, start + 1), -1, "source region must be unique");
    vm.runInContext(`${source.slice(start, end)};exports.single=${implementation.single};${implementation.batch ? `exports.batch=${implementation.batch};exports.privateBatch=${implementation.privateBatch};` : ""}`, context);
  } else {
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
    context.exports.single = context.exports.fetchPlayerModeration;
    context.exports.batch = context.exports.fetchPlayerModerationBatch;
    context.exports.invalidate = context.exports.invalidatePlayerModeration;
  }
  return {
    ...context.exports, requests,
    tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
    async settle() {
      for (const request of requests) request.release(new URL(request.url, "http://fixture").searchParams.get("ids").split(",").map((id) => ({ id: Number(id), custom_tag: "Current", verified: true })));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    },
  };
}

test("public shell loads versioned native moderation assets through the existing same-origin chain", () => {
  const shell = readFileSync(new URL("../public/app/index.html", import.meta.url), "utf8");
  const browse = readFileSync(new URL("../public/app/discovery-browse.js", import.meta.url), "utf8");
  assert.match(shell, /src="\/app\/discovery-player-name\.js\?v=8"/);
  assert.match(shell, /src="\/app\/discovery-browse\.js\?[^"\s]*&v=share-link2&/);
  assert.match(browse, /import\('\.\/discovery-scoreboard\.js\?v=12'\)/);
});

for (const implementation of implementations) {
  if (implementation.name === "TypeScript") {
    test("preference invalidation separates old and new in-flight readers", async () => {
      const h = harness(implementation);
      const oldRead = h.single(952001);
      h.tick();
      h.invalidate(952001);
      const newRead = h.single(952001);
      h.tick();
      assert.equal(h.requests.length, 2, "a post-edit caller must not join a pre-edit read");
      h.requests[1].release([{ id: 952001, custom_tag: "After" }]);
      assert.equal((await newRead).customTag, "After");
      const currentRead = h.single(952001);
      h.tick();
      assert.equal(h.requests.length, 3);
      h.requests[0].release([{ id: 952001, custom_tag: "Before" }]);
      assert.equal((await oldRead).customTag, "Before");
      h.requests[2].release([{ id: 952001, custom_tag: "Current" }]);
      assert.equal((await currentRead).customTag, "Current", "old completion cannot delete a newer read");
    });
  }

  test(`${implementation.name}: preserves every moderation field`, async () => {
    const h = harness(implementation);
    const expected = { cheater: true, exploiter: true, susCount: 3, dropper: true, dropperVoteCount: 4, afkWintrade: true, afkWintradeVoteCount: 5, boosted: true, boostedMatchCount: 6, altAccount: true, altAccountVoteCount: 7, automaticAfk: true, automaticAfkCount: 8, wallShooterCount: 9, masterFeedingCount: 10, tankDiffCount: 11, supportDiffCount: 12, dpsDiffCount: 13, flankDiffCount: 14, noobCount: 15, hypercarryCount: 16, verified: true, customTag: "Current", customTagColor: "#ffe595" };
    const row = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value]));
    const result = h.single(952002);
    h.tick();
    h.requests[0].release([{ id: 952002, ...row }]);
    assert.deepEqual(JSON.parse(JSON.stringify(await result)), expected);
  });

  test(`${implementation.name}: invalid IDs never dispatch; valid IDs retain endpoint, auth and both payload shapes`, async () => {
    const h = harness(implementation);
    for (const id of [0, -1, "bad", 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await h.single(id)).customTag, null);
    }
    h.tick();
    assert.equal(h.requests.length, 0);
    const first = h.single("952004");
    h.tick();
    const request = h.requests[0];
    assert.equal(new URL(request.url, "http://fixture").pathname, implementation.endpoint ?? "/api/players/bulk");
    assert.equal(request.init.cache, "no-store");
    if (implementation.start) assert.equal(request.init.headers.Authorization, "Bearer fixture-only");
    request.response({ ok: true, json: async () => ({ players: [{ id: "952004", custom_tag: "Flat" }] }) });
    assert.equal((await first).customTag, "Flat");
  });

  test(`${implementation.name}: rejected, invalid and missing reads release all readers and remain fresh`, async () => {
    for (const failure of ["transport", "HTTP", "JSON", "missing"]) {
      const h = harness(implementation);
      const first = h.single(952003);
      h.tick();
      const joined = h.single(952003);
      if (failure === "transport") h.requests[0].reject(new Error("fixture network failure"));
      else if (failure === "HTTP") h.requests[0].response({ ok: false });
      else if (failure === "JSON") h.requests[0].response({ ok: true, json: async () => { throw new Error("fixture JSON failure"); } });
      else h.requests[0].release([]);
      const results = await Promise.all([first, joined]);
      assert.equal(results[0].customTag, null);
      assert.equal(results[1].customTag, null);
      const retry = h.single(952003);
      h.tick();
      assert.equal(h.requests.length, 2, `${failure} cannot retain a settled fallback`);
      h.requests[1].release([{ id: 952003, custom_tag: "Recovered" }]);
      assert.equal((await retry).customTag, "Recovered");
    }
  });

  test(`${implementation.name}: overflow batches do not wait for unrelated SQL reads`, async () => {
    const h = harness(implementation);
    const ids = Array.from({ length: 51 }, (_, index) => 951000 + index);
    const readers = ids.map((id) => h.single(id));
    h.tick();
    h.tick();
    try {
      assert.equal(h.requests.length, 2, "ID 51 must dispatch before the first 50 rows finish");
      assert.equal(new URL(h.requests[0].url, "http://fixture").searchParams.get("ids").split(",").length, 50);
    } finally {
      for (let step = 0; step < 8; step += 1) {
        h.tick();
        await h.settle();
      }
      await Promise.all(readers);
    }
  });

  test(`${implementation.name}: a settled player read is never reused`, async () => {
    const h = harness(implementation);
    const first = h.single(950101);
    h.tick();
    h.requests[0].release([{ id: 950101, custom_tag: "Before" }]);
    assert.equal((await first).customTag, "Before");
    const second = h.single(950101);
    h.tick();
    assert.equal(h.requests.length, 2, "only running requests may be shared; a new caller must read the database again");
    assert.equal(h.requests[1].init?.cache, "no-store");
    h.requests[1].release([{ id: 950101, custom_tag: "After" }]);
    assert.equal((await second).customTag, "After");
  });

  test(`${implementation.name}: new IDs dispatch while an unrelated read is pending`, async () => {
    const h = harness(implementation);
    const first = h.single(950201);
    h.tick();
    const joined = h.single(950201);
    const other = h.single(950202);
    h.tick();
    assert.equal(h.requests.length, 2);
    assert.equal(new URL(h.requests[1].url, "http://fixture").searchParams.get("ids"), "950202");
    h.requests[1].release([{ id: 950202, custom_tag: "Independent" }]);
    assert.equal((await other).customTag, "Independent");
    h.requests[0].release([{ id: 950201, custom_tag: "Shared" }]);
    assert.equal((await first).customTag, "Shared");
    assert.equal((await joined).customTag, "Shared");
  });

  if (implementation.name === "TypeScript" || implementation.batch) {
    test(`${implementation.name}: explicit bulk reads are fresh and never seed settled single-player results`, async () => {
      const h = harness(implementation);
      const first = h.batch([950301, 950302]);
      h.requests[0].release([{ id: 950301, custom_tag: "Before" }, { id: 950302, verified: true }]);
      assert.equal((await first).get(950301).customTag, "Before");
      const second = h.batch([950301, 950302]);
      assert.equal(h.requests.length, 2);
      assert.equal(h.requests[1].init?.cache, "no-store");
      h.requests[1].release([{ id: 950301, custom_tag: "After" }, { id: 950302, verified: false }]);
      const updated = await second;
      assert.equal(updated.get(950301).customTag, "After");
      assert.equal(updated.get(950302).verified, false);
      const single = h.single(950301);
      h.tick();
      assert.equal(h.requests.length, 3, "explicit batch results cannot satisfy future player reads");
      h.requests[2].release([{ id: 950301, custom_tag: "Latest" }]);
      assert.equal((await single).customTag, "Latest");
    });
  }

  if (implementation.privateBatch) {
    test("scoreboard private bulk keeps its separate identity, auth, payload and throwing error contract", async () => {
      const h = harness(implementation);
      const result = h.privateBatch([0, -1, "952005", 952005]);
      assert.equal(h.requests[0].url, "/api/v1/player-ext/private/bulk?ids=952005");
      assert.equal(h.requests[0].init.cache, "no-store");
      assert.equal(h.requests[0].init.headers.Authorization, "Bearer fixture-only");
      h.requests[0].response({ ok: true, json: async () => ({ accounts: [{ id: 952005, cheater: true, sus_count: 2 }] }) });
      assert.equal((await result).get(952005).cheater, true);
      const failed = h.privateBatch([952005]);
      h.requests[1].response({ ok: false });
      await assert.rejects(failed, /generated\.moderation\.unableToLoadPrivateBadges/);
      const publicFailed = h.batch([952005]);
      h.requests[2].response({ ok: false });
      await assert.rejects(publicFailed, /generated\.moderation\.unableToLoadBadges/);
    });
  }

  test(`${implementation.name}: 42 staggered mounts join the already dispatched ten-player read`, async () => {
    const h = harness(implementation);
    const ids = Array.from({ length: 10 }, (_, index) => 950001 + index);
    const readers = ids.map((id) => h.single(id));
    h.tick();
    assert.equal(h.requests.length, 1);
    try {
      for (let index = 0; index < 41; index += 1) {
        readers.push(...ids.map((id) => h.single(id)));
        h.tick();
      }
      assert.equal(h.requests.length, 1, "in-flight IDs must never be dispatched again by a later mount");
      assert.equal(new URL(h.requests[0].url, "http://fixture").searchParams.get("ids").split(",").length, 10);
    } finally {
      await h.settle();
      await Promise.all(readers);
    }
  });
}
