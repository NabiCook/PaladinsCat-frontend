/** Verify existing Pro/session rules without coupling them to HTML rendering.
 * Public SEO is separately covered with the real shell and inventory.
 * refs: doc: 06-reference-seo · see: lib/sitemap-current.test.mjs · proxy.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
function load(file, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  // Gate tests isolate HTML rendering; sitemap-current.test.mjs exercises real SEO.
  dependencies["./lib/spa-seo"] ??= { renderPublicSpaHtml: async () => null };
  new Function("require", "module", "exports", output)(name => dependencies[name]
    ?? (["./operator-plane", "./lib/operator-plane"].includes(name) ? load("./operator-plane.ts") : require(name)), loaded, loaded.exports);
  return loaded.exports;
}
const server = { serverApiBase: () => "https://backend.example" };
const surface = load("./pro-surface.ts", { "./server-api": server });
const gate = load("./website-gate.ts");
const { proxy } = load("../proxy.ts", {
  "./lib/server-api": server, "./lib/pro-surface": surface,
  "./lib/website-gate": gate, "./lib/verified-access": load("./verified-access.ts"),
  "./lib/anonymous-presence-gate": load("./anonymous-presence-gate.ts"),
});
const granted = { linked_player_id: "16706730", invitation_active: true, access_restriction_kind: null, regulation_stage: 0 };
// A public document is admitted either by the standalone dashboard shell rewrite
// (public/app/index.html) or by falling through to Next with x-middleware-next.
const admittedDocument = (response) =>
  (response.headers.get("x-middleware-rewrite") ?? "").endsWith("/app/index.html")
  || response.headers.get("x-middleware-next") === "1";

test("every Wolper marker opts into public handling, including future versions and forwarded caller UA", () => {
  for (const agent of ["Wolper", "Wolper Scoreboard/2.0", "WOLPER/3.0", "Mozilla/5.0 Wolper overlay"]) {
    assert.equal(surface.isWolper(new Headers({ "user-agent": agent })), true);
    assert.equal(surface.isWolper(new Headers({ "user-agent": "Mozilla/5.0", "x-client-ua": agent })), true);
  }
  assert.equal(surface.isWolper(new Headers({ "user-agent": "Mozilla/5.0" })), false);
});

test("Pro requires a linked, currently invited unrestricted account, independently of the rollout switch", () => {
  for (const invitation_required of [true, false, undefined]) {
    assert.equal(surface.hasProAccess({ ...granted, invitation_required }), true);
    assert.equal(surface.hasProAccess({ ...granted, invitation_required, invitation_active: false }), false);
  }
  for (const value of [null, [], {}, { ...granted, linked_player_id: null },
    { ...granted, regulation_stage: undefined }, { ...granted, regulation_stage: "0" }, { ...granted, regulation_stage: 1 },
    { ...granted, regulation_stage: 2 }, { ...granted, regulation_stage: 1, is_admin: true },
    { ...granted, linked_player_id: 0 }, { ...granted, linked_player_id: 1.5 }, { ...granted, invitation_active: "true" },
    { ...granted, access_restriction_kind: "blacklist" }, { ...granted, access_restriction: { code: "restricted" } },
    { ...granted, invitation_expires_at: "invalid" }, { ...granted, invitation_expires_at: "2000-01-01T00:00:00Z" }]) {
    assert.equal(surface.hasProAccess(value), false, JSON.stringify(value));
  }
});

test("Pro proof accepts the actual bigint-string DTO and only canonical safe positive IDs", () => {
  const actualAccount = { ...granted, access_restriction: null, invitation_expires_at: "2099-11-09T03:53:20.762047+00:00" };
  assert.equal(surface.hasProAccess(actualAccount), true);
  for (const linked_player_id of [1, 42, 16706730, Number.MAX_SAFE_INTEGER, "1", "42", "16706730", String(Number.MAX_SAFE_INTEGER)]) {
    assert.equal(surface.hasProAccess({ ...actualAccount, linked_player_id }), true, String(linked_player_id));
  }
  for (const linked_player_id of ["", "0", "00", "042", "-1", "-0", "+42", " 42", "42 ", "42\n", "42\r", "42\t",
    "42.0", "42.5", "1e3", "1E3", "0x2a", "Infinity", "NaN", "9007199254740992", "9007199254740993", "99999999999999999",
    NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, true, { value: "42" }]) {
    assert.equal(surface.hasProAccess({ ...actualAccount, linked_player_id }), false, String(linked_player_id));
  }
});

test("session proof fails closed on invalid, unavailable, redirected or malformed responses", async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://backend.example/auth/me");
      assert.equal(init.headers.get("authorization"), "Bearer opaque");
      assert.equal(init.headers.get("x-paladinscat-surface"), null);
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      assert.ok(init.signal instanceof AbortSignal);
      return Response.json(granted);
    };
    assert.equal(await surface.proveProSession("opaque", new Headers({ "x-paladinscat-surface": "pro" })), true);
    assert.equal(await surface.proveProSession(""), false);
    assert.equal(await surface.proveProSession("x".repeat(513)), false);
    assert.equal(calls, 1);
    for (const response of [Response.json(granted, { status: 401 }), Response.json(granted, { status: 429 }),
      Response.json(granted, { status: 503 }), new Response("bad-json"), Response.json([])]) {
      globalThis.fetch = async () => response;
      assert.equal(await surface.proveProSession("opaque"), false);
    }
    globalThis.fetch = async () => { throw new Error("transport"); };
    assert.equal(await surface.proveProSession("opaque"), false);
  } finally { globalThis.fetch = original; }
});

test("public routing uses server proof for documents, RSC and API aliases", async () => {
  const original = globalThis.fetch;
  const old = { ...process.env };
  const directory = mkdtempSync(join(tmpdir(), "pc-surface-"));
  const origin = surface.PUBLIC_ORIGIN;
  const reads = [];
  try {
    process.env.NODE_ENV = "production";
    process.env.PALADINSCAT_PUBLIC_ORIGIN = origin;
    process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = join(directory, "fixture");
    writeFileSync(process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE, "ab".repeat(32));
    const guest = gate.issueGuest("ab".repeat(32), origin);
    const request = (path, token, headers = {}, method = "GET") => new NextRequest(`${origin}${path}`, {
      method, headers: { ...headers, cookie: `${gate.GUEST_COOKIE}=${guest}${token ? `; __Host-pc_session=${token}` : ""}` },
    });
    globalThis.fetch = async (url, init) => {
      reads.push({ url: String(url), headers: new Headers(init.headers) });
      assert.equal(String(url), "https://backend.example/auth/me");
      assert.equal(init.cache, "no-store");
      const token = new Headers(init.headers).get("authorization")?.slice(7);
      if (token === "pro") return Response.json(granted);
      if (token === "normal") return Response.json({ ...granted, invitation_required: false, invitation_active: false });
      if (token === "unlinked") return Response.json({ ...granted, linked_player_id: null });
      if (token === "restricted") return Response.json({ ...granted, access_restriction_kind: "blacklist" });
      if (token === "missing-proof") return Response.json({ linked_player_id: 42, invitation_required: false });
      if (token === "limited") return Response.json({}, { status: 429 });
      if (token === "unavailable") throw new Error("unavailable");
      return Response.json({}, { status: 401 });
    };
    assert.ok(admittedDocument(await proxy(request("/features?view=all", "pro", { accept: "text/html" }))));
    assert.equal((await proxy(request("/features?view=all", "pro", { rsc: "1", "next-router-prefetch": "1" }))).headers.get("x-middleware-next"), "1");
    for (const token of [undefined, "normal", "unlinked", "missing-proof", "forged", "limited", "unavailable"]) {
      assert.ok(admittedDocument(await proxy(request("/features", token, { accept: "text/html" }))), token);
    }
    assert.ok(admittedDocument(await proxy(request("/features?pc_surface=public", "pro", { accept: "text/html" }))));
    for (const path of ["/api/champions", "/_pc/auth/me", "/api/v1/stats/champions"]) {
      assert.equal((await proxy(request(path, "pro", { accept: "text/html" }))).headers.get("x-middleware-next"), "1", path);
    }
    for (const agent of ["Wolper, Scoreboard (@thprinkleth)", "Wolper Scoreboard/1.0", "Wolper Scoreboard/2.0"]) {
      for (const path of ["/", "/features", "/api/auth/me", "/_pc/players/42", "/api/v1/stats/champions"]) {
        const response = await proxy(request(path, "pro", { accept: "text/html", "user-agent": agent }));
        assert.ok(admittedDocument(response), `${agent}:${path}`);
      }
    }
  } finally {
    globalThis.fetch = original;
    for (const key of ["NODE_ENV", "PALADINSCAT_PUBLIC_ORIGIN", "PALADINSCAT_WEBSITE_GATE_SECRET_FILE"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
    rmSync(directory, { recursive: true });
  }
});

test("SSR forwards only the ingress-owned surface and the actual Pro caller session", async () => {
  const original = globalThis.fetch;
  let incoming = new Headers();
  let session = "session";
  const serverApi = load("./server-api.ts", {
    "server-only": {}, "next/headers": {
      headers: async () => incoming, cookies: async () => ({ get: () => session ? { value: session } : undefined }),
    },
  });
  try {
    globalThis.fetch = async (_url, init) => Response.json(Object.fromEntries(init.headers));
    for (const signal of [null, "invalid", "public"]) {
      incoming = new Headers(signal ? { "x-paladinscat-surface": signal } : {});
      const response = await serverApi.fetchServerJson("/champions", { headers: { "x-paladinscat-surface": "pro" } });
      assert.equal(response["x-paladinscat-surface"], "public");
    }
    incoming = new Headers({ "x-paladinscat-surface": "pro", "user-agent": "Mozilla/5.0" });
    const pro = await serverApi.fetchServerJson("/champions", { headers: { authorization: "Bearer injected", "x-paladinscat-surface": "public" } });
    assert.equal(pro["x-paladinscat-surface"], "pro");
    assert.equal(pro.authorization, "Bearer injected");
    assert.equal(pro["x-client-ua"], "Mozilla/5.0");
    session = null;
    assert.equal((await serverApi.fetchServerJson("/champions"))["authorization"], undefined);
  } finally { globalThis.fetch = original; }
});
