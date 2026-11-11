/** Verify website admission independently of document presentation.
 * SEO body/headers are exercised by the real-renderer sitemap-current suite.
 * refs: doc: 06-reference-seo · see: lib/sitemap-current.test.mjs · proxy.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relative, dependencies = {}) {
  const file = new URL(relative, import.meta.url);
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  // Gate tests isolate HTML rendering; sitemap-current.test.mjs exercises real SEO.
  dependencies["./lib/spa-seo"] ??= { renderPublicSpaHtml: async () => null };
  new Function("require", "module", "exports", output)((name) => dependencies[name] || (["./operator-plane", "./lib/operator-plane"].includes(name) ? load("./operator-plane.ts") : name === "./operator-transport.mjs" ? { operatorBackendFetch: (...args) => globalThis.fetch(...args) } : require(name)), loaded, loaded.exports);
  return loaded.exports;
}
const gate = load("./website-gate.ts");
const verifiedAccess = load("./verified-access.ts");
const presenceGate = load("./anonymous-presence-gate.ts");
const { proxy, config } = load("../proxy.ts", {
  "./lib/website-gate": gate,
  "./lib/operator-plane": load("./operator-plane.ts"),
  "./lib/verified-access": verifiedAccess,
  "./lib/anonymous-presence-gate": presenceGate,
  "./lib/server-api": { serverApiBase: () => "https://backend.example" },
  "./lib/pro-surface": load("./pro-surface.ts", { "./server-api": { serverApiBase: () => "https://backend.example" } }),
});
const { NextRequest } = require("next/server");

test("proxy matcher bypasses ads.txt only at the exact static path", () => {
  const matcher = new RegExp(config.matcher[0]);
  assert.equal(matcher.test("/ads.txt"), false);
  assert.equal(matcher.test("/ads.txt-extra"), true);
});

test("a genuine account restores expired website admission without weakening anonymous or origin checks", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pc-gate-recovery-test-"));
  const old = { ...process.env };
  const oldFetch = globalThis.fetch;
  const origin = "https://paladinscat.com";
  const secret = "ab".repeat(32);
  try {
    const file = join(directory, "fixture-secret");
    writeFileSync(file, secret); // Disposable fixture, never a runtime credential.
    process.env.NODE_ENV = "production";
    process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = file;
    process.env.PALADINSCAT_PUBLIC_ORIGIN = origin;
    const backendReads = [];
    globalThis.fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      const authorization = headers.get("authorization");
      backendReads.push({ url: String(url), authorization, clientAddress: headers.get("cf-connecting-ip"), cache: init?.cache });
      if (authorization === "Bearer verified-normal") return Response.json({ linked_player_id: "42", invitation_required: false, invitation_active: false, regulation_stage: 0 });
      if (authorization === "Bearer unverified") return Response.json({ linked_player_id: null, invitation_required: false, invitation_active: false });
      if (authorization === "Bearer uninvited") return Response.json({ linked_player_id: 42, invitation_required: true, invitation_active: false });
      if (authorization === "Bearer restricted") return Response.json({ linked_player_id: 42, access_restriction_kind: "blacklist" });
      if (authorization === "Bearer limited") return Response.json({}, { status: 429, headers: { "Retry-After": "17" } });
      if (authorization === "Bearer unavailable") return Response.json({}, { status: 503 });
      if (authorization === "Bearer timeout") throw new Error("Fixture connection timeout");
      return Response.json({}, { status: authorization === "Bearer forbidden" ? 403 : 401 });
    };
    const request = (path, headers = {}, method = "GET") => new NextRequest(`${origin}${path}`, { headers, method });
    const expired = gate.issueGuest(secret, origin, Date.now() - (gate.GUEST_TTL_SECONDS + 1) * 1000);
    for (const path of ["/api/activity-banner", "/api/hirez/status", "/_pc/players/42",
      "/api/search/universal?q=player", "/api/players/search?q=player", "/_pc/search/universal?q=player", "/_pc/players/search?q=player"]) {
      for (const guest of [undefined, expired, "tampered"]) {
        const headers = {
          cookie: `__Host-pc_session=verified-normal${guest ? `; ${gate.GUEST_COOKIE}=${guest}` : ""}`,
          "sec-fetch-site": "same-origin", origin, "cf-connecting-ip": "192.0.2.10",
        };
        const before = backendReads.length;
        const restored = await proxy(request(path, headers));
        assert.equal(restored.headers.get("x-middleware-next"), "1", path);
        assert.equal(restored.headers.get("cache-control"), "private, no-store", path);
        const cookie = restored.cookies.get(gate.GUEST_COOKIE);
        assert.ok(cookie?.value, path);
        assert.equal(gate.validGuest(cookie.value, secret, origin), true, path);
        assert.equal(cookie.maxAge, gate.GUEST_TTL_SECONDS, path);
        assert.equal(cookie.httpOnly, true, path);
        assert.equal(cookie.secure, true, path);
        assert.equal(cookie.sameSite, "lax", path);
        assert.equal(cookie.path, "/", path);
        assert.deepEqual(backendReads.slice(before), [{ url: "https://backend.example/auth/me", authorization: "Bearer verified-normal", clientAddress: "192.0.2.10", cache: "no-store" }], path);
        const beforeWarm = backendReads.length;
        const warm = await proxy(request(path, { ...headers, cookie: `__Host-pc_session=verified-normal; ${gate.GUEST_COOKIE}=${cookie.value}` }));
        assert.equal(warm.headers.get("x-middleware-next"), "1", path);
        assert.equal(warm.headers.get("set-cookie"), null, path);
        assert.equal(backendReads.length, beforeWarm, path);
      }
      for (const token of ["unverified", "uninvited", "restricted"]) {
        // Admission is separate from Rust's existing data entitlement and restrictions.
        const restored = await proxy(request(path, { cookie: `__Host-pc_session=${token}`, "sec-fetch-site": "same-origin" }));
        assert.equal(restored.headers.get("x-middleware-next"), "1", `${path} ${token}`);
        assert.ok(restored.cookies.get(gate.GUEST_COOKIE)?.value, `${path} ${token}`);
      }
      for (const token of [undefined, "forged-session", "forbidden"]) {
        const denied = await proxy(request(path, { cookie: token ? `__Host-pc_session=${token}` : "", "sec-fetch-site": "same-origin" }));
        assert.equal(denied.status, 403, `${path} ${token}`);
        assert.equal((await denied.json()).error.code, "WEBSITE_SESSION_REQUIRED", path);
        assert.equal(denied.headers.get("set-cookie"), null, path);
      }
      for (const foreignHeaders of [{ origin: "https://foreign.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }]) {
        const before = backendReads.length;
        const denied = await proxy(request(path, { cookie: "__Host-pc_session=verified-normal", ...foreignHeaders }));
        assert.equal(denied.status, 403, path);
        assert.equal(backendReads.length, before, path);
        assert.equal(denied.headers.get("set-cookie"), null, path);
      }
      const limited = await proxy(request(path, { cookie: "__Host-pc_session=limited" }));
      assert.equal(limited.status, 429, path);
      assert.equal(limited.headers.get("retry-after"), "17", path);
      assert.equal((await limited.json()).error.code, "AUTHENTICATION_RATE_LIMITED", path);
      assert.equal(limited.headers.get("set-cookie"), null, path);
      for (const token of ["unavailable", "timeout"]) {
        const unavailable = await proxy(request(path, { cookie: `__Host-pc_session=${token}` }));
        assert.equal(unavailable.status, 503, path);
        assert.equal((await unavailable.json()).error.code, "AUTHENTICATION_UNAVAILABLE", path);
        assert.equal(unavailable.headers.get("set-cookie"), null, path);
      }
    }
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["NODE_ENV", "PALADINSCAT_WEBSITE_GATE_SECRET_FILE", "PALADINSCAT_PUBLIC_ORIGIN"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
    rmSync(directory, { recursive: true });
  }
});

test("legacy non-Pro bearer recovery uses the API credential without granting browser-page authority", async () => {
  const old = { ...process.env }, oldFetch = globalThis.fetch;
  const origin = "https://paladinscat.com", secret = "ab".repeat(32);
  const { proxy } = load("../proxy.ts", {
    "node:fs": { readFileSync: () => secret },
    "./lib/website-gate": gate,
  "./lib/operator-plane": load("./operator-plane.ts"),
    "./lib/verified-access": verifiedAccess,
    "./lib/anonymous-presence-gate": presenceGate,
    "./lib/server-api": { serverApiBase: () => "https://backend.example" },
    "./lib/pro-surface": load("./pro-surface.ts", { "./server-api": { serverApiBase: () => "https://backend.example" } }),
  });
  try {
    process.env.NODE_ENV = "production";
    process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = "in-memory-fixture";
    process.env.PALADINSCAT_PUBLIC_ORIGIN = origin;
    const reads = [];
    globalThis.fetch = async (_url, init) => {
      const authorization = new Headers(init.headers).get("authorization");
      reads.push(authorization);
      const normal = { linked_player_id: "42", invitation_required: false, invitation_active: false, regulation_stage: 0 };
      if (authorization === "Bearer legacy-normal") return Response.json(normal);
      if (authorization === "Bearer pro-cookie") return Response.json({ ...normal, invitation_active: true });
      if (authorization === "Bearer restricted") return Response.json({ ...normal, access_restriction_kind: "blacklist" });
      if (authorization === "Bearer limited") return Response.json({}, { status: 429, headers: { "Retry-After": "17" } });
      if (authorization === "Bearer unavailable") return Response.json({}, { status: 503 });
      return Response.json({}, { status: 401 });
    };
    const request = (path, headers = {}) => new NextRequest(`${origin}${path}`, {
      headers: { "sec-fetch-site": "same-origin", origin, ...headers },
    });
    const expired = gate.issueGuest(secret, origin, Date.now() - (gate.GUEST_TTL_SECONDS + 1) * 1000);
    for (const path of ["/api/search/universal?q=fixture", "/api/players/search?q=fixture",
      "/_pc/search/universal?q=fixture", "/_pc/players/search?q=fixture"]) {
      for (const guest of [undefined, expired]) {
        const credentials = { authorization: "Bearer legacy-normal", cookie: guest ? `${gate.GUEST_COOKIE}=${guest}` : "" };
        const before = reads.length;
        const restored = await proxy(request(path, credentials));
        assert.equal(restored.headers.get("x-middleware-next"), "1", path);
        assert.deepEqual(reads.slice(before), ["Bearer legacy-normal"], path);
        const admission = restored.cookies.get(gate.GUEST_COOKIE);
        assert.equal(gate.validGuest(admission?.value, secret, origin), true, path);
        const beforeWarm = reads.length;
        const warm = await proxy(request(path, { ...credentials, cookie: `${gate.GUEST_COOKIE}=${admission.value}` }));
        assert.equal(warm.headers.get("x-middleware-next"), "1", path);
        assert.equal(warm.headers.get("set-cookie"), null, path);
        assert.equal(reads.length, beforeWarm, path);
      }
      const precedence = await proxy(request(path, { authorization: "Bearer legacy-normal", cookie: "__Host-pc_session=pro-cookie" }));
      assert.equal(precedence.headers.get("x-middleware-next"), "1", path);
      assert.equal(reads.at(-1), "Bearer legacy-normal", path);
      for (const authorization of ["Bearer invalid", "Bearer   legacy-normal"]) {
        const denied = await proxy(request(path, { authorization, cookie: "__Host-pc_session=pro-cookie" }));
        assert.equal(denied.status, 403, path);
        assert.equal(reads.at(-1), authorization, path);
        assert.equal(denied.headers.get("set-cookie"), null, path);
      }
      const beforeOversize = reads.length;
      assert.equal((await proxy(request(path, { authorization: `Bearer ${"x".repeat(513)}`, cookie: "__Host-pc_session=pro-cookie" }))).status, 403, path);
      assert.equal(reads.length, beforeOversize, path);
      for (const authorization of ["Bearer", "bearer ignored-scheme"]) {
        assert.equal((await proxy(request(path, { authorization, cookie: "__Host-pc_session=legacy-normal" }))).headers.get("x-middleware-next"), "1", path);
        assert.equal(reads.at(-1), "Bearer legacy-normal", path);
      }
      const restricted = await proxy(request(path, { authorization: "Bearer restricted" }));
      assert.equal(restricted.headers.get("x-middleware-next"), "1", path); // Rust still owns data restrictions.
      const limited = await proxy(request(path, { authorization: "Bearer limited" }));
      assert.equal(limited.status, 429, path);
      assert.equal(limited.headers.get("retry-after"), "17", path);
      assert.equal((await proxy(request(path, { authorization: "Bearer unavailable" }))).status, 503, path);
      const beforeForeign = reads.length;
      assert.equal((await proxy(request(path, { authorization: "Bearer legacy-normal", origin: "https://foreign.invalid" }))).status, 403, path);
      assert.equal(reads.length, beforeForeign, path);
    }
    const beforePage = reads.length;
    const bearerPage = await proxy(request("/stats", { authorization: "Bearer legacy-normal", accept: "text/html" }));
    assert.equal(bearerPage.status, 307);
    assert.equal(new URL(bearerPage.headers.get("location")).pathname, "/auth/login");
    assert.equal(reads.length, beforePage, "Bearer must not authorize a browser document");
    const cookiePromotion = await proxy(request("/features", { authorization: "Bearer invalid", cookie: "__Host-pc_session=pro-cookie", accept: "text/html" }));
    const promotionLocation = cookiePromotion.headers.get("location");
    // A cookie-bearing browser document must never be handed to another host.
    assert.ok(!promotionLocation || new URL(promotionLocation, "https://paladinscat.com").hostname === "paladinscat.com",
      `browser session left the public host: ${promotionLocation}`);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["NODE_ENV", "PALADINSCAT_WEBSITE_GATE_SECRET_FILE", "PALADINSCAT_PUBLIC_ORIGIN"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
  }
});

test("same-origin auth control reaches real rejection after browser expiry without admitting anonymous data", async () => {
  const old = { ...process.env }, oldFetch = globalThis.fetch;
  const origin = "https://paladinscat.com", secret = "ab".repeat(32);
  const { proxy } = load("../proxy.ts", {
    "node:fs": { readFileSync: () => secret },
    "./lib/website-gate": gate,
  "./lib/operator-plane": load("./operator-plane.ts"), "./lib/verified-access": verifiedAccess,
    "./lib/anonymous-presence-gate": presenceGate,
    "./lib/server-api": { serverApiBase: () => "https://backend.example" },
    "./lib/pro-surface": load("./pro-surface.ts", { "./server-api": { serverApiBase: () => "https://backend.example" } }),
  });
  const auth = load("./auth-session-read.ts", { "./server-api": { serverApiBase: () => "https://backend.example" } });
  const owner = auth.createSessionReadHandler({ fetcher: async () => Response.json({ error: "Invalid session" }, { status: 401 }) });
  try {
    process.env.NODE_ENV = "production";
    process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = "in-memory-fixture";
    process.env.PALADINSCAT_PUBLIC_ORIGIN = origin;
    globalThis.fetch = async () => { throw new Error("Auth control must delegate to its handler, without another proof lookup"); };
    const request = (path, headers = {}, method = "GET") => new NextRequest(`${origin}${path}`, { method,
      headers: { "sec-fetch-site": "same-origin", origin, ...headers } });
    const expired = gate.issueGuest(secret, origin, Date.now() - (gate.GUEST_TTL_SECONDS + 1) * 1000);
    for (const path of ["/api/auth/me", "/_pc/auth/me"]) {
      for (const cookie of ["", `${gate.GUEST_COOKIE}=${expired}`, "__Host-pc_session=expired; __Host-pc_guest=tampered"]) {
        const incoming = request(path, { cookie });
        const admission = await proxy(incoming);
        assert.equal(admission.headers.get("x-middleware-next"), "1", path);
        const guest = admission.cookies.get(gate.GUEST_COOKIE);
        assert.equal(gate.validGuest(guest?.value, secret, origin), true, path);
        assert.equal(guest.maxAge, gate.GUEST_TTL_SECONDS, path);
        assert.equal(admission.cookies.get("__Host-pc_session"), undefined, path);
        assert.equal(admission.cookies.get("__Host-pc_csrf"), undefined, path);
        const rejected = await owner(incoming);
        assert.equal(rejected.status, 401, path);
        assert.deepEqual(await rejected.json(), { error: "Invalid session" }, path);
        assert.deepEqual(rejected.headers.getSetCookie(), [], path);
      }
      for (const headers of [{ "sec-fetch-site": "" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "cross-site" }, { origin: "https://foreign.invalid" }]) {
        const denied = await proxy(request(path, headers));
        assert.equal(denied.status, 403, path);
        assert.equal(denied.headers.get("set-cookie"), null, path);
      }
      const unsafe = await proxy(request(path, {}, "POST"));
      assert.equal(unsafe.status, 403, path);
      assert.equal(unsafe.headers.get("set-cookie"), null, path);
    }
    for (const path of ["/api/search/universal", "/api/players/search", "/_pc/players/search", "/api/auth/me-extra", "/_pc/auth/me/extra"]) {
      const denied = await proxy(request(path));
      assert.equal(denied.status, 403, path);
      assert.equal(denied.headers.get("set-cookie"), null, path);
    }
    assert.equal((await proxy(request("/%61pi/auth/me"))).status, 400);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["NODE_ENV", "PALADINSCAT_WEBSITE_GATE_SECRET_FILE", "PALADINSCAT_PUBLIC_ORIGIN"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
  }
});

test("production proxy admits a page-issued guest, rejects direct API access, and gates verified sections through backend auth", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pc-gate-test-"));
  const old = { ...process.env };
  const oldFetch = globalThis.fetch;
  try {
    const file = join(directory, "fixture-secret");
    writeFileSync(file, "ab".repeat(32)); // Disposable fixture, never a runtime credential.
    process.env.NODE_ENV = "production";
    process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = file;
    process.env.PALADINSCAT_PUBLIC_ORIGIN = "https://paladinscat.com";
    let forwardedClientAddress = null;
    const backendReads = [];
    globalThis.fetch = async (_url, init) => {
      backendReads.push(String(_url));
      const headers = new Headers(init?.headers);
      const authorization = headers.get("authorization");
      forwardedClientAddress = headers.get("cf-connecting-ip");
      if (authorization === "Bearer rollout-disabled") return Response.json({ linked_player_id: 42, invitation_required: false, invitation_active: false });
      if (authorization === "Bearer unverified-disabled") return Response.json({ linked_player_id: null, invitation_required: false, invitation_active: false });
      if (authorization === "Bearer verified") return Response.json({ linked_player_id: 42, invitation_active: true });
      if (["Bearer uninvited", "Bearer invitation-expired", "Bearer invitation-revoked"].includes(authorization)) return Response.json({ linked_player_id: 42, invitation_active: false });
      if (authorization === "Bearer old-backend") return Response.json({ linked_player_id: 42 });
      if (authorization === "Bearer invited-unverified") return Response.json({ linked_player_id: null, invitation_active: true });
      if (authorization === "Bearer restricted") return Response.json({ linked_player_id: 42, access_restriction_kind: "blacklist" });
      if (authorization === "Bearer unverified") return Response.json({ linked_player_id: null });
      if (authorization === "Bearer expired") return Response.json({}, { status: 401 });
      if (authorization === "Bearer limited") return Response.json({}, { status: 429, headers: { "Retry-After": "17" } });
      return Response.json({}, { status: 503 });
    };
    const request = (path, headers = {}, method = "GET") => new NextRequest(`https://paladinscat.com${path}`, { headers, method });
    const anonymousPresence = await proxy(request("/api/analytics/presence", { "sec-fetch-site": "same-origin" }));
    assert.equal(anonymousPresence.headers.get("x-middleware-next"), "1");
    assert.equal(anonymousPresence.headers.get("set-cookie"), null);
    assert.equal(anonymousPresence.headers.get("cache-control"), "no-store");
    for (const headers of [{}, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-origin", cookie: "visitor=fixture" }]) {
      assert.equal((await proxy(request("/api/analytics/presence", headers))).status, 400);
    }
    const page = await proxy(request("/features", { accept: "text/html" }));
    const cookie = page.cookies.get(gate.GUEST_COOKIE);
    assert.ok(cookie?.value);
    assert.match(page.headers.get("set-cookie"), /HttpOnly/);
    assert.match(page.headers.get("set-cookie"), /Secure/);
    assert.equal(page.headers.get("cache-control"), "private, no-store");
    for (const path of ["/api/notifications?limit=8", "/api/matches/1", "/_pc/matches/1"]) {
      assert.equal((await proxy(request(path))).status, 403);
      assert.equal((await proxy(request(path, { cookie: `${gate.GUEST_COOKIE}=forged` }))).status, 403);
      const headers = { cookie: `${gate.GUEST_COOKIE}=${cookie.value}`, "sec-fetch-site": "same-origin" };
      const admitted = await proxy(request(path, headers));
      assert.equal(admitted.headers.get("x-middleware-next"), "1");
      assert.equal(admitted.headers.get("cache-control"), "private, no-store");
      assert.equal((await proxy(request(path, { ...headers, origin: "http://127.0.0.1:3100" }))).status, 403);
    }
    assert.equal((await proxy(request("/api/v1/stats/champions"))).headers.get("x-middleware-next"), "1");
    assert.equal((await proxy(request("/api/auth/oidc/callback"))).headers.get("x-middleware-next"), "1");
    assert.equal((await proxy(request("/api/auth/oidc/transactions"))).status, 403);
    assert.equal((await proxy(request("/%61pi/notifications"))).status, 400);

    const guestStats = await proxy(request("/stats/performance?scope=casual"));
    assert.equal(guestStats.status, 307);
    assert.equal(guestStats.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(new URL(guestStats.headers.get("location")).pathname, "/auth/login");
    assert.equal(new URL(guestStats.headers.get("location")).searchParams.get("redirect"), "/stats/performance?scope=casual");
    assert.equal(new URL((await proxy(request("/game/items/1"))).headers.get("location")).pathname, "/auth/login");
    assert.equal(new URL((await proxy(request("/%73tats/maps"))).headers.get("location")).pathname, "/auth/login");
    assert.equal(new URL((await proxy(request("/stats/maps", { cookie: "__Host-pc_session=expired" }))).headers.get("location")).pathname, "/auth/login");
    assert.equal(new URL((await proxy(request("/stats/maps", { cookie: "__Host-pc_session=unverified" }))).headers.get("location")).pathname, "/link-account");
    const verifiedStats = await proxy(request("/stats/maps", { cookie: "__Host-pc_session=verified", "cf-connecting-ip": "192.0.2.10" }));
    assert.equal(verifiedStats.headers.get("x-middleware-next"), "1");
    assert.equal(verifiedStats.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(forwardedClientAddress, "192.0.2.10");
    const restrictedPage = await proxy(request("/players", { accept: "text/html", cookie: "__Host-pc_session=restricted" }));
    assert.equal(restrictedPage.status, 307);
    assert.equal(new URL(restrictedPage.headers.get("location")).pathname, "/prototype/access-policy");
    const accessPolicy = await proxy(request("/prototype/access-policy", { accept: "text/html", cookie: "__Host-pc_session=restricted" }));
    assert.equal(accessPolicy.headers.get("x-middleware-next"), "1");
    const limited = await proxy(request("/stats/maps", { cookie: "__Host-pc_session=limited" }));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "17");
    assert.deepEqual(await limited.json(), { error: { code: "AUTHENTICATION_RATE_LIMITED" } });
    assert.equal((await proxy(request("/stats/maps", { cookie: "__Host-pc_session=backend-down" }))).status, 503);
    const guestPlayer = await proxy(request("/players/713736801?tab=matches"));
    assert.equal(new URL(guestPlayer.headers.get("location")).pathname, "/auth/login");
    assert.equal(new URL(guestPlayer.headers.get("location")).searchParams.get("redirect"), "/players/713736801?tab=matches");
    assert.equal(new URL((await proxy(request("/players/16706730", { cookie: "__Host-pc_session=unverified" }))).headers.get("location")).pathname, "/link-account");
    assert.equal(new URL((await proxy(request("/players/16706730/loadouts", { cookie: "__Host-pc_session=unverified" }))).headers.get("location")).pathname, "/link-account");
    assert.equal(new URL((await proxy(request("/players/leaderboard", { cookie: "__Host-pc_session=unverified" }))).headers.get("location")).pathname, "/link-account");
    for (const path of ["/players", "/stats", "/players/", "/stats/", "/%70layers", "/%73tats"]) {
      const redirectSuffix = path.endsWith("/") ? "/" : "";
      for (const headers of [
        { accept: "text/html" },
        { accept: "text/html", cookie: `${gate.GUEST_COOKIE}=${cookie.value}` },
        { accept: "text/html", cookie: "__Host-pc_session=expired" },
        { rsc: "1", "next-router-prefetch": "1" },
      ]) {
        const before = backendReads.length;
        const denied = await proxy(request(`${path}?scope=casual`, headers));
        assert.equal(denied.status, 307, path);
        assert.equal(denied.headers.get("x-middleware-next"), null, path);
        assert.equal(denied.headers.get("cache-control"), "private, no-store", path);
        assert.equal(denied.headers.get("x-robots-tag"), "noindex, nofollow", path);
        const destination = new URL(denied.headers.get("location"));
        assert.equal(destination.pathname, `/auth/login${redirectSuffix}`, path);
        assert.equal(destination.searchParams.get("redirect"), `${path}?scope=casual`, path);
        assert.equal(await denied.text(), "", path);
        assert.deepEqual(backendReads.slice(before), headers.cookie?.includes("__Host-pc_session=")
          ? ["https://backend.example/auth/me"] : [], path);
      }
      const head = await proxy(request(path, {}, "HEAD"));
      assert.equal(head.status, 307, path);
      assert.equal(new URL(head.headers.get("location")).pathname, `/auth/login${redirectSuffix}`, path);
      const unlinked = await proxy(request(path, { cookie: "__Host-pc_session=unverified" }));
      assert.equal(new URL(unlinked.headers.get("location")).pathname, `/link-account${redirectSuffix}`, path);
      const verified = await proxy(request(path, { cookie: "__Host-pc_session=verified" }));
      assert.equal(verified.headers.get("x-middleware-next"), "1", path);
      assert.equal(verified.headers.get("x-robots-tag"), "noindex, nofollow", path);
      assert.equal((await proxy(request(path, { cookie: "__Host-pc_session=backend-down" }))).status, 503, path);
    }
    const verifiedLeaderboard = await proxy(request("/players/leaderboard", { cookie: "__Host-pc_session=verified" }));
    assert.equal(verifiedLeaderboard.headers.get("x-middleware-next"), "1");
    assert.equal(verifiedLeaderboard.headers.get("x-robots-tag"), "noindex, nofollow");
    for (const path of ["/community", "/community/diminishing-returns", "/builds/1", "/tierlists/create"]) {
      const guest = await proxy(request(path));
      assert.equal(new URL(guest.headers.get("location")).pathname, "/auth/login", path);
      assert.equal(new URL(guest.headers.get("location")).searchParams.get("redirect"), path, path);
      assert.equal(new URL((await proxy(request(path, { cookie: "__Host-pc_session=unverified" }))).headers.get("location")).pathname, "/link-account", path);
      assert.equal((await proxy(request(path, { cookie: "__Host-pc_session=verified" }))).headers.get("x-middleware-next"), "1", path);
      assert.equal((await proxy(request(path, { cookie: "__Host-pc_session=backend-down" }))).status, 503, path);
    }
    assert.equal(new URL((await proxy(request("/%63ommunity"))).headers.get("location")).pathname, "/auth/login");

    for (const path of ["/stats", "/players", "/players/42", "/community", "/builds", "/tierlists", "/operations/tickets"]) {
      for (const token of ["uninvited", "invitation-expired", "invitation-revoked", "old-backend"]) {
        for (const headers of [{ accept: "text/html" }, { rsc: "1", "next-router-prefetch": "1" }]) {
          const denied = await proxy(request(path, { ...headers, cookie: `__Host-pc_session=${token}` }));
          assert.equal(denied.status, 307, path);
          const destination = new URL(denied.headers.get("location"));
          assert.equal(destination.pathname, "/account");
          assert.equal(destination.hash, "#invitation");
          assert.equal(denied.headers.get("x-middleware-next"), null);
          assert.equal(denied.headers.get("cache-control"), "private, no-store");
          assert.equal(await denied.text(), "");
        }
      }
      assert.equal(new URL((await proxy(request(path, { cookie: "__Host-pc_session=invited-unverified" }))).headers.get("location")).pathname, "/link-account");
    }
    // Admission of a public document takes one of two shapes: routes served by
    // the standalone dashboard shell are rewritten to public/app/index.html,
    // while server-rendered routes fall through with x-middleware-next. Either
    // proves admission, so assert that instead of one specific header — and keep
    // proving the page is never redirected and stays marked noindex.
    const admittedDocument = (response) =>
      (response.headers.get("x-middleware-rewrite") ?? "").endsWith("/app/index.html")
      || response.headers.get("x-middleware-next") === "1";
    for (const path of ["/stats", "/players", "/players/42", "/community", "/builds", "/tierlists", "/operations/tickets"]) {
      const html = await proxy(request(path, { accept: "text/html", cookie: "__Host-pc_session=rollout-disabled" }));
      assert.equal(html.status, 200, path);
      assert.equal(html.headers.get("location"), null, path);
      assert.ok(admittedDocument(html), `${path} should be admitted without a redirect`);
      assert.equal(html.headers.get("x-robots-tag"), "noindex, nofollow", path);
      const rsc = await proxy(request(path, { rsc: "1", "next-router-prefetch": "1", cookie: "__Host-pc_session=rollout-disabled" }));
      assert.equal(rsc.headers.get("x-middleware-next"), "1", path);
    }
    for (const path of ["/players/42", "/community", "/builds", "/tierlists", "/operations/tickets"]) {
      assert.equal((await proxy(request(path, { cookie: "__Host-pc_session=unverified-disabled" }))).headers.get("x-middleware-next"), "1", path);
    }
    assert.equal(new URL((await proxy(request("/stats", { cookie: "__Host-pc_session=unverified-disabled" }))).headers.get("location")).pathname, "/link-account");
    for (const path of ["/account", "/link-account"]) {
      for (const token of ["unverified", "uninvited", "verified"]) {
        assert.equal((await proxy(request(path, { cookie: `__Host-pc_session=${token}` }))).headers.get("x-middleware-next"), "1");
      }
    }

    process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = "";
    assert.equal((await proxy(request("/api/notifications"))).status, 503);
    const protectedGateFailure = await proxy(request("/stats/maps", { cookie: "__Host-pc_session=verified" }));
    assert.equal(protectedGateFailure.status, 503);
    assert.equal(protectedGateFailure.headers.get("x-robots-tag"), "noindex, nofollow");
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["NODE_ENV", "PALADINSCAT_WEBSITE_GATE_SECRET_FILE", "PALADINSCAT_PUBLIC_ORIGIN"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
    rmSync(directory, { recursive: true });
  }
});

test("moderated cheater/exploit reads require a verified session while the public submission stays open", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pc-cheater-gate-test-"));
  const old = { ...process.env };
  const oldFetch = globalThis.fetch;
  const origin = "https://paladinscat.com";
  const secret = "cd".repeat(32);
  try {
    const file = join(directory, "fixture-secret");
    writeFileSync(file, secret); // Disposable fixture, never a runtime credential.
    process.env.NODE_ENV = "production";
    process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = file;
    process.env.PALADINSCAT_PUBLIC_ORIGIN = origin;
    const backendReads = [];
    globalThis.fetch = async (url, init) => {
      const authorization = new Headers(init?.headers).get("authorization");
      backendReads.push({ url: String(url), authorization });
      if (authorization === "Bearer verified") return Response.json({ linked_player_id: 42, invitation_required: false, invitation_active: false });
      if (authorization === "Bearer unverified") return Response.json({ linked_player_id: null, invitation_required: false });
      if (authorization === "Bearer uninvited") return Response.json({ linked_player_id: 42, invitation_required: true });
      if (authorization === "Bearer limited") return Response.json({}, { status: 429, headers: { "Retry-After": "9" } });
      if (authorization === "Bearer down") return Response.json({}, { status: 503 });
      if (authorization === "Bearer timeout") throw new Error("Fixture connection timeout");
      return Response.json({}, { status: 401 });
    };
    const request = (path, headers = {}, method = "GET") => new NextRequest(`${origin}${path}`, { headers, method });
    const sameOrigin = { "sec-fetch-site": "same-origin", origin, accept: "application/json" };
    const moderatedReads = [
      "/api/players/exploiters/active", "/api/players/exploiters/inactive",
      "/api/players/exploiters/736745931", "/api/cheaters/active", "/api/cheaters/inactive",
      "/api/cheaters/portal", "/_pc/players/exploiters/active", "/_pc/cheaters/portal",
    ];

    // Guests keep the non-existent 404 and must not reach the auth owner at all.
    for (const path of moderatedReads) {
      const before = backendReads.length;
      const denied = await proxy(request(path, sameOrigin));
      assert.equal(denied.status, 404, path);
      assert.equal((await denied.json()).error.code, "NOT_FOUND", path);
      assert.equal(denied.headers.get("cache-control"), "private, no-store", path);
      assert.equal(backendReads.length, before, path);
    }
    // Unverified, uninvited and forged sessions stay indistinguishable from guests.
    for (const token of ["unverified", "uninvited", "forged"]) {
      for (const path of ["/api/players/exploiters/active", "/api/cheaters/portal"]) {
        const denied = await proxy(request(path, { ...sameOrigin, cookie: `__Host-pc_session=${token}` }));
        assert.equal(denied.status, 404, `${token} ${path}`);
        assert.equal((await denied.json()).error.code, "NOT_FOUND", `${token} ${path}`);
      }
    }
    // A verified session is admitted through the normal website admission path.
    for (const path of moderatedReads) {
      const before = backendReads.length;
      const allowed = await proxy(request(path, { ...sameOrigin, cookie: "__Host-pc_session=verified" }));
      assert.equal(allowed.headers.get("x-middleware-next"), "1", path);
      assert.equal(allowed.headers.get("cache-control"), "private, no-store", path);
      assert.deepEqual(backendReads.slice(before), [{ url: "https://backend.example/auth/me", authorization: "Bearer verified" }], path);
    }
    // Auth-owner degradation surfaces honestly instead of masquerading as absence.
    const limited = await proxy(request("/api/players/exploiters/active", { ...sameOrigin, cookie: "__Host-pc_session=limited" }));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "9");
    assert.equal((await limited.json()).error.code, "AUTHENTICATION_RATE_LIMITED");
    for (const token of ["down", "timeout"]) {
      const unavailable = await proxy(request("/api/players/exploiters/active", { ...sameOrigin, cookie: `__Host-pc_session=${token}` }));
      assert.equal(unavailable.status, 503, token);
      assert.equal((await unavailable.json()).error.code, "AUTHENTICATION_UNAVAILABLE", token);
    }
    // The public report flow is unchanged, and no other moderated write opens up.
    const guest = gate.issueGuest(secret, origin);
    for (const path of ["/api/cheaters/evidence", "/_pc/cheaters/evidence"]) {
      const submitted = await proxy(request(path, { ...sameOrigin, cookie: `${gate.GUEST_COOKIE}=${guest}` }, "POST"));
      assert.equal(submitted.headers.get("x-middleware-next"), "1", path);
    }
    for (const path of ["/api/cheaters/evidence/approve", "/api/players/exploiters/flag"]) {
      for (const method of ["POST", "PUT", "DELETE"]) {
        for (const cookie of [`__Host-pc_session=verified`, `${gate.GUEST_COOKIE}=${guest}`]) {
          const denied = await proxy(request(path, { ...sameOrigin, cookie }, method));
          assert.equal(denied.status, 404, `${method} ${path} ${cookie}`);
        }
      }
    }
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["NODE_ENV", "PALADINSCAT_WEBSITE_GATE_SECRET_FILE", "PALADINSCAT_PUBLIC_ORIGIN"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
    rmSync(directory, { recursive: true });
  }
});
