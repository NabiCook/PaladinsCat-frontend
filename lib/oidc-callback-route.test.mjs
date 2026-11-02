import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? (["@/lib/operator-plane", "./operator-plane"].includes(name) ? load("./operator-plane.ts") : ["@/lib/operator-transport.mjs", "./operator-transport.mjs"].includes(name) ? { operatorBackendFetch: (...args) => globalThis.fetch(...args) } : name === "@/lib/oidc-transport" || name === "./oidc-transport.ts" ? { oidcFetch: (...args) => globalThis.fetch(...args) } : require(name)), loaded, loaded.exports);
  return loaded.exports;
}
const surface = load("./pro-surface.ts", {
  "./server-api": { serverApiBase: () => process.env.NEXT_SERVER_API_URL || "http://localhost:3005" },
});

// Drive the full callback GET so the token exchange reaches the backend and record
// exactly which headers the BFF placed on the exchange request.
// invitation: "active" | "inactive" | "error" (default) controls the server-side
// /auth/me response used for the Pro hand-off decision.
// origin overrides PALADINSCAT_PUBLIC_ORIGIN (default https://site.example).
async function runCallback({ cfHeaders = {}, invitation = "error", account, returnPath = "/", origin = "https://site.example", stateValid = true, claimsValid = true, consumeStatus = 200, exchangeStatus = 200, operator = false, operatorClaims } = {}) {
  const envKeys = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_INTERNAL_ISSUER", "PALADINSCAT_PUBLIC_ORIGIN", "NEXT_SERVER_API_URL", "PALADINSCAT_OPERATOR_BFF", "PALADINSCAT_OPERATOR_ORIGIN", "PALADINSCAT_SERVICE_OIDC_CLIENT_ID", "PALADINSCAT_OPERATOR_REQUIRED_ACR"];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const bffCalls = [];
  const fetchCalls = [];
  let exchangeInit;
  let invitationUrl;
  const route = load("../app/api/auth/oidc/callback/route.ts", {
    "@/lib/pro-surface": surface,
    "@/lib/oidc-security": {
      newCsrfToken: () => "csrf-value",
      normalizedHttpsIssuer: value => value,
      safeReturnPath: value => value || "/",
      parseTransaction: () => ({ state: "s", nonce: "n", verifier: "v", returnPath, issuedAt: 0 }),
      resolveInternalIssuer: issuer => issuer,
      stateMatches: () => stateValid,
      validateIdToken: async () => claimsValid ? ({ iss: "https://auth.example/realms/test", aud: "test-web", exp: 9_999_999_999, iat: 1, nonce: "n", pc_keep_signed_in: false, ...(operator ? { acr: "2", auth_time: Math.floor(Date.now() / 1000), ...operatorClaims } : {}) }) : null,
    },
    "@/lib/oidc-bff-service": {
      oidcBffServiceHeaders: async (cf) => {
        bffCalls.push(cf);
        // Faithful to the real BFF: merge only the two CF headers when present.
        const headers = { authorization: "Bearer test-service" };
        if (cf?.["cf-connecting-ip"]) headers["cf-connecting-ip"] = cf["cf-connecting-ip"];
        if (cf?.["cf-ray"]) headers["cf-ray"] = cf["cf-ray"];
        return headers;
      },
    },
    "@/lib/oidc-client-secret": { oidcClientSecret: () => "test-secret" },
    "@/lib/fingerprint": {
      FP_COOKIE: "pc_fp",
      parseFingerprintCookie: (raw) => {
        if (!raw) return { screen: "", timezone: "", platform: "" };
        const parts = raw.split("+");
        const dec = (v) => { try { return v ? decodeURIComponent(v) : ""; } catch { return ""; } };
        return { screen: dec(parts[0]), timezone: dec(parts[1]), platform: dec(parts[2]) };
      },
    },
  });
  process.env.OIDC_ISSUER = "https://auth.example/realms/test";
  process.env.OIDC_CLIENT_ID = operator ? "paladinscat-operator" : "test-web";
  process.env.OIDC_CLIENT_SECRET = "test-secret";
  delete process.env.OIDC_INTERNAL_ISSUER;
  process.env.PALADINSCAT_PUBLIC_ORIGIN = origin;
  process.env.NEXT_SERVER_API_URL = operator ? "https://backend-rust-operator:3006/v1" : "http://localhost:3005";
  if (operator) {
    process.env.PALADINSCAT_OPERATOR_BFF = "1";
    process.env.PALADINSCAT_OPERATOR_ORIGIN = origin;
    process.env.PALADINSCAT_SERVICE_OIDC_CLIENT_ID = "paladinscat-operator-bff";
    process.env.PALADINSCAT_OPERATOR_REQUIRED_ACR = "2";
  } else { delete process.env.PALADINSCAT_OPERATOR_BFF; }
  const request = new NextRequest(`${origin}/api/auth/oidc/callback?state=abc&code=xyz`, { headers: cfHeaders });
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    fetchCalls.push(u);
    if (u.includes("/auth/oidc/transactions/consume")) return Response.json({ state: "s", nonce: "n", verifier: "v", return_path: "/" }, { status: consumeStatus });
    if (u.includes("/protocol/openid-connect/token")) return Response.json({ access_token: "a", id_token: "i", refresh_token: "r" });
    if (u.includes("/auth/oidc/exchange")) {
      exchangeInit = init;
      return Response.json({ token: "session-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: exchangeStatus });
    }
    if (u.endsWith("/auth/me")) {
      invitationUrl = u;
      if (invitation === "active") return Response.json(account ?? { linked_player_id: 42, invitation_active: true, invitation_expires_at: new Date(Date.now() + 86_400_000).toISOString(), access_restriction_kind: null, regulation_stage: 0 });
      if (invitation === "inactive") return Response.json({ linked_player_id: 42, invitation_active: false, invitation_required: false, access_restriction_kind: null });
      throw new Error("invitation endpoint unavailable");
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const response = await route.GET(request);
    return { response, bffCalls, exchangeInit, invitationUrl, fetchCalls };
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

// Native v3.0.0's URL validator admits only these HTTPS hosts on port 443,
// without URL credentials. Its session read remains on paladinscat.com.
test("operator callback creates only its short private cookie and never promotes to Pro", async () => {
  const { response, exchangeInit, invitationUrl } = await runCallback({ operator: true, origin: "https://operator.example:8444", returnPath: "/admin", invitation: "active" });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://operator.example:8444/admin");
  assert.equal(response.cookies.get("__Host-pc_session"), undefined);
  assert.equal(response.cookies.get("__Host-pc_admin_session")?.httpOnly, true);
  assert.equal(response.cookies.get("__Host-pc_admin_session")?.secure, true);
  assert.equal(response.cookies.get("__Host-pc_admin_session")?.maxAge, 900);
  assert.equal(response.cookies.get("__Host-pc_admin_oidc_txn")?.maxAge, 0);
  assert.equal(invitationUrl, undefined);
  assert.equal(JSON.parse(exchangeInit.body).nonce, "n");
  assert.equal(JSON.parse(exchangeInit.body).session_ttl_hours, undefined);
});

test("operator callback rejects absent, stale and insufficient step-up before creating a session", async () => {
  for (const operatorClaims of [{ acr: "1" }, { auth_time: undefined }, { auth_time: Math.floor(Date.now() / 1000) - 301 }]) {
    const { response, exchangeInit } = await runCallback({ operator: true, origin: "https://operator.example:8444", operatorClaims });
    assert.equal(response.headers.get("location"), "https://operator.example:8444/auth/login?oidc_error=1");
    assert.equal(response.cookies.get("__Host-pc_admin_session"), undefined);
    assert.equal(exchangeInit, undefined);
  }
});

function nativeApprovedRedirect(location) {
  const url = new URL(location);
  if (url.protocol !== "https:" || !["paladinscat.com", "auth.paladinscat.com"].includes(url.hostname)
      || (url.port && url.port !== "443") || url.username || url.password) {
    throw new Error("The authentication redirect left the approved HTTPS hosts.");
  }
  return url;
}

function assertPublicSession(response) {
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://paladinscat.com/");
  const session = response.cookies.get("__Host-pc_session");
  assert.equal(session?.value, "session-token");
  assert.equal(session.httpOnly, true);
  assert.equal(session.secure, true);
  assert.equal(session.sameSite, "lax");
  assert.equal(session.path, "/");
  assert.ok(session.maxAge > 0 && session.maxAge <= 3_600);
  const csrf = response.cookies.get("__Host-pc_csrf");
  assert.equal(csrf?.value, "csrf-value");
  assert.equal(csrf.httpOnly, false);
  assert.equal(csrf.secure, true);
  assert.equal(csrf.sameSite, "strict");
  assert.equal(csrf.path, "/");
  assert.equal(csrf.maxAge, session.maxAge);
  const transaction = response.cookies.get("__Host-pc_oidc_txn");
  assert.equal(transaction?.value, "");
  assert.equal(transaction.maxAge, 0);
  assert.equal(transaction.httpOnly, true);
  assert.equal(transaction.secure, true);
  assert.equal(transaction.path, "/");
  assert.ok(!response.headers.get("location").includes("session-token"));
}

test("callback forwards cf-connecting-ip and cf-ray to the backend exchange when present", async () => {
  const { response, bffCalls, exchangeInit } = await runCallback({ cfHeaders: { "cf-connecting-ip": "203.0.113.7", "cf-ray": "abc123" } });
  assert.equal(response.status, 307);
  // The exchange is the second BFF call (consume first, exchange second).
  assert.equal(bffCalls.length, 2);
  assert.deepEqual(bffCalls[1], { "cf-connecting-ip": "203.0.113.7", "cf-ray": "abc123" });
  assert.equal(exchangeInit.headers["cf-connecting-ip"], "203.0.113.7");
  assert.equal(exchangeInit.headers["cf-ray"], "abc123");
  assert.equal(exchangeInit.headers.authorization, "Bearer test-service");
});

test("callback omits the CF headers (no error) when they are absent", async () => {
  const { response, bffCalls, exchangeInit } = await runCallback({});
  assert.equal(response.status, 307);
  assert.equal(bffCalls.length, 2);
  assert.deepEqual(bffCalls[1], {});
  assert.equal(exchangeInit.headers["cf-connecting-ip"], undefined);
  assert.equal(exchangeInit.headers["cf-ray"], undefined);
  assert.equal(exchangeInit.headers.authorization, "Bearer test-service");
});

test("callback forwards the pc_fp cookie fingerprint to the backend exchange", async () => {
  // The cookie value is NUL-delimited, per-field URL-encoded (timezone has a "/").
  const cookieValue = [
    encodeURIComponent("1920x1080"),
    encodeURIComponent("America/New_York"),
    encodeURIComponent("Win32"),
  ].join("+");
  const { bffCalls } = await runCallback({
    cfHeaders: { cookie: `pc_fp=${cookieValue}` },
  });
  assert.equal(bffCalls.length, 2);
  const fp = bffCalls[1];
  assert.equal(fp["x-paladinscat-fp-screen"], "1920x1080");
  assert.equal(fp["x-paladinscat-fp-timezone"], "America/New_York");
  assert.equal(fp["x-paladinscat-fp-platform"], "Win32");
});

test("BFF service passes the bounded browser inputs through to the returned headers", async () => {
  const source = ts.createSourceFile("bff.ts", readFileSync(new URL("./oidc-bff-service.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const boundedFn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "bounded");
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "oidcBffServiceHeaders");
  assert.ok(boundedFn, "bounded is declared in the BFF service");
  assert.ok(fn, "oidcBffServiceHeaders is declared in the BFF service");
  const code = ts.transpileModule(`${boundedFn.getText(source)}\n${fn.getText(source)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const oidcBffServiceHeaders = new Function("serviceToken", "exports", `${code}; return oidcBffServiceHeaders;`)(async () => "test-service-token", {});

  // All four bounded inputs are forwarded when present.
  const withAll = await oidcBffServiceHeaders({ "cf-connecting-ip": "203.0.113.7", "cf-ray": "ray-1", "user-agent": "Mozilla/5.0", "accept-language": "en-US,en;q=0.9" });
  assert.equal(withAll.authorization, "Bearer test-service-token");
  assert.equal(withAll["cf-connecting-ip"], "203.0.113.7");
  assert.equal(withAll["cf-ray"], "ray-1");
  assert.equal(withAll["user-agent"], "Mozilla/5.0");
  assert.equal(withAll["accept-language"], "en-US,en;q=0.9");

  // Only the bearer token when no inputs are provided.
  const noHeaders = await oidcBffServiceHeaders();
  assert.equal(noHeaders.authorization, "Bearer test-service-token");
  assert.equal(noHeaders["cf-connecting-ip"], undefined);
  assert.equal(noHeaders["cf-ray"], undefined);
  assert.equal(noHeaders["user-agent"], undefined);
  assert.equal(noHeaders["accept-language"], undefined);

  // Partial inputs: only the provided keys are forwarded.
  const partial = await oidcBffServiceHeaders({ "cf-connecting-ip": "203.0.113.7" });
  assert.equal(partial["cf-connecting-ip"], "203.0.113.7");
  assert.equal(partial["cf-ray"], undefined);
  assert.equal(partial["user-agent"], undefined);
  assert.equal(partial["accept-language"], undefined);

  // Bounded: each input is trimmed and capped at 512 characters; empty/whitespace is omitted.
  const long = "a".repeat(600);
  const boundedInput = await oidcBffServiceHeaders({ "user-agent": `  ${long}  `, "accept-language": "   " });
  assert.equal(boundedInput["user-agent"], "a".repeat(512));
  assert.equal(boundedInput["accept-language"], undefined);
});

test("invitation-active account completes login on the public surface", async () => {
  const { response, invitationUrl } = await runCallback({ invitation: "active" });
  assert.equal(response.status, 307);
  // No cross-host hand-off: the consolidated public app lands the session in the
  // same origin that set the host-scoped cookie.
  assert.equal(response.headers.get("location"), "https://site.example/");
  assert.equal(response.cookies.get("__Host-pc_session")?.value, "session-token");
  assert.equal(response.cookies.get("__Host-pc_oidc_txn")?.maxAge, 0);
  // The callback never re-proves the session against another host.
  assert.equal(invitationUrl, undefined, "callback must not call /auth/me for a hand-off");
});

test("an active invitation does not promote an unlinked, restricted or regulated identity", async () => {
  for (const account of [
    { linked_player_id: null, invitation_active: true, regulation_stage: 0 },
    { linked_player_id: 42, invitation_active: true, regulation_stage: 1, is_admin: true },
    { linked_player_id: 42, invitation_active: true, regulation_stage: 0, access_restriction_kind: "blacklist" },
  ]) {
    const { response } = await runCallback({ invitation: "active", account, origin: "https://paladinscat.com" });
    assertPublicSession(response);
  }
});

test("Pro failure return hint completes public login without immediately retrying the failed Pro bootstrap", async () => {
  const { response, invitationUrl } = await runCallback({ invitation: "active", origin: "https://paladinscat.com", returnPath: "/stats?pc_surface=public" });
  assert.equal(response.headers.get("location"), "https://paladinscat.com/stats?pc_surface=public");
  assert.equal(response.cookies.get("__Host-pc_session")?.value, "session-token");
  assert.equal(invitationUrl, undefined);
});

for (const userAgent of ["Wolper, Scoreboard (@thprinkleth)", "Wolper Scoreboard/1.0", "Wolper Scoreboard/2.0", "WOLPER/3.0"]) {
  test(`invitation-active ${userAgent} completes the public session accepted by the native client`, async () => {
    const { response, exchangeInit, fetchCalls } = await runCallback({
      invitation: "active", origin: "https://paladinscat.com", cfHeaders: { "user-agent": userAgent },
    });
    assertPublicSession(response);
    assert.equal(nativeApprovedRedirect(response.headers.get("location")).origin, "https://paladinscat.com");
    // Navigation compatibility does not replace the successful server token exchange.
    assert.deepEqual(JSON.parse(exchangeInit.body), { access_token: "a", id_token: "i", refresh_token: "r" });
    assert.equal(fetchCalls.filter(url => url.includes("/auth/oidc/transactions/consume")).length, 1);
    assert.equal(fetchCalls.filter(url => url.includes("/protocol/openid-connect/token")).length, 1);
    assert.equal(fetchCalls.filter(url => url.includes("/auth/oidc/exchange")).length, 1);

    // Replay the native client's fixed public-origin session read through the actual
    // session forwarding handler, with the newly issued HttpOnly cookie in its jar.
    const { createSessionReadHandler } = load("./auth-session-read.ts", {
      "./server-api": { serverApiBase: () => "http://backend-rust-operator:3005" },
    });
    let reads = 0;
    const readSession = createSessionReadHandler({
      apiBase: () => "http://backend-rust-operator:3005",
      fetcher: async (url, init) => {
        reads++;
        assert.equal(String(url), "http://backend-rust-operator:3005/auth/me");
        assert.equal(init.headers.get("cookie"), "__Host-pc_session=session-token; __Host-pc_csrf=csrf-value");
        assert.equal(init.headers.get("user-agent"), userAgent);
        assert.equal(init.cache, "no-store");
        assert.equal(init.redirect, "error");
        return Response.json({ id: 42, linked_player_id: 16706730 });
      },
    });
    const me = await readSession(new Request("https://paladinscat.com/api/auth/me", {
      headers: { "user-agent": userAgent, cookie: "__Host-pc_session=session-token; __Host-pc_csrf=csrf-value" },
    }));
    assert.equal(me.status, 200);
    assert.equal(reads, 1);
    assert.deepEqual(await me.json(), { id: 42, linked_player_id: 16706730 });
    assert.equal(me.headers.get("cache-control"), "private, no-store");
  });
}

test("ordinary browser agents land on the configured public origin", async () => {
  for (const userAgent of [
    "Mozilla/5.0", "Chrome/154.0", "Firefox/149.0",
  ]) {
    const { response, invitationUrl } = await runCallback({
      invitation: "active", origin: "https://paladinscat.com", cfHeaders: { "user-agent": userAgent },
    });
    assert.equal(response.status, 307, userAgent);
    assert.equal(response.headers.get("location"), "https://paladinscat.com/", userAgent);
    assert.equal(response.cookies.get("__Host-pc_session")?.value, "session-token", userAgent);
    assert.equal(invitationUrl, undefined, `no cross-host session proof for ${userAgent}`);
  }
  // The retired Pro host stays outside the approved redirect set for native clients.
  assert.throws(() => nativeApprovedRedirect("https://pro.paladinscat.com/api/auth/oidc/login?return=%2F"),
    /The authentication redirect left the approved HTTPS hosts/);
});

test("Wolper user agent does not bypass state, consumed transaction, ID token or backend session checks", async () => {
  const cases = [
    { failure: { stateValid: false }, calls: 0, exchange: false },
    { failure: { consumeStatus: 401 }, calls: 1, exchange: false },
    { failure: { claimsValid: false }, calls: 2, exchange: false },
    { failure: { exchangeStatus: 403 }, calls: 3, exchange: true },
  ];
  for (const { failure, calls, exchange } of cases) {
    const { response, fetchCalls, exchangeInit } = await runCallback({
      ...failure, invitation: "active", origin: "https://paladinscat.com",
      cfHeaders: { "user-agent": "Wolper, Scoreboard (@thprinkleth)" },
    });
    assert.equal(response.headers.get("location"), "https://paladinscat.com/auth/login?oidc_error=1");
    assert.equal(response.cookies.get("__Host-pc_session"), undefined);
    assert.equal(response.cookies.get("__Host-pc_csrf"), undefined);
    assert.equal(response.cookies.get("__Host-pc_oidc_txn")?.maxAge, 0);
    assert.equal(fetchCalls.length, calls, JSON.stringify(failure));
    assert.equal(Boolean(exchangeInit), exchange, JSON.stringify(failure));
  }
});

test("invitation-inactive account stays on the base surface", async () => {
  const { response } = await runCallback({ invitation: "inactive" });
  assert.equal(response.status, 307);
  const location = response.headers.get("location");
  assert.equal(location, "https://site.example/");
  assert.ok(response.cookies.get("__Host-pc_session"), "base session cookie must be set");
});

test("invitation-check failure fails open to the base surface (no Pro hand-off)", async () => {
  const { response } = await runCallback({ invitation: "error" });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://site.example/");
  assert.ok(response.cookies.get("__Host-pc_session"), "base session cookie must be set");
});

test("callback keeps a validated return path on the configured public origin", async () => {
  // The transaction's return path is validated by safeReturnPath and never becomes a
  // cross-host ?return= hand-off.
  const route = load("../app/api/auth/oidc/callback/route.ts", {
    "@/lib/pro-surface": surface,
    "@/lib/oidc-security": {
      newCsrfToken: () => "csrf-value",
      normalizedHttpsIssuer: value => value,
      safeReturnPath: value => value || "/",
      parseTransaction: () => ({ state: "s", nonce: "n", verifier: "v", returnPath: "/stats", issuedAt: 0 }),
      resolveInternalIssuer: issuer => issuer,
      stateMatches: () => true,
      validateIdToken: async () => ({ iss: "https://auth.example/realms/test", aud: "test-web", exp: 9_999_999_999, iat: 1, nonce: "n", pc_keep_signed_in: false }),
    },
    "@/lib/oidc-bff-service": { oidcBffServiceHeaders: async () => ({ authorization: "Bearer test-service" }) },
    "@/lib/oidc-client-secret": { oidcClientSecret: () => "test-secret" },
    "@/lib/fingerprint": { FP_COOKIE: "pc_fp", parseFingerprintCookie: () => ({ screen: "", timezone: "", platform: "" }) },
  });
  process.env.OIDC_ISSUER = "https://auth.example/realms/test";
  process.env.OIDC_CLIENT_ID = "test-web";
  process.env.OIDC_CLIENT_SECRET = "test-secret";
  delete process.env.OIDC_INTERNAL_ISSUER;
  process.env.PALADINSCAT_PUBLIC_ORIGIN = "https://site.example";
  process.env.NEXT_SERVER_API_URL = "http://localhost:3005";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/auth/oidc/transactions/consume")) return Response.json({ state: "s", nonce: "n", verifier: "v", return_path: "/stats" });
    if (u.includes("/protocol/openid-connect/token")) return Response.json({ access_token: "a", id_token: "i", refresh_token: "r" });
    if (u.includes("/auth/oidc/exchange")) return Response.json({ token: "session-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    if (u.endsWith("/auth/me")) return Response.json({ linked_player_id: 42, invitation_active: true, access_restriction_kind: null, regulation_stage: 0 });
    throw new Error(`unexpected fetch ${u}`);
  };
  const request = new NextRequest("https://site.example/api/auth/oidc/callback?state=abc&code=xyz");
  const response = await route.GET(request);
  globalThis.fetch = originalFetch;
  delete process.env.OIDC_ISSUER; delete process.env.OIDC_CLIENT_ID; delete process.env.OIDC_CLIENT_SECRET; delete process.env.PALADINSCAT_PUBLIC_ORIGIN; delete process.env.NEXT_SERVER_API_URL;
  assert.equal(response.status, 307);
  const parsed = new URL(response.headers.get("location"));
  assert.equal(parsed.origin, "https://site.example");
  assert.equal(parsed.pathname, "/stats");
  assert.equal(parsed.searchParams.get("return"), null);
});
