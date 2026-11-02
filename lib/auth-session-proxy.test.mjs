import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const requireNative = createRequire(import.meta.url);
const backend = "http://fixture-backend:3005";
function load() {
  const loaded = { exports: {} }, timeoutBounds = [];
  const output = ts.transpileModule(readFileSync(new URL("./auth-session-proxy.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", "AbortSignal", output)(
    name => name === "./server-api" ? { serverApiBase: () => backend } : requireNative(name),
    loaded, loaded.exports, { timeout: ms => { timeoutBounds.push(ms); return AbortSignal.timeout(ms); } },
  );
  return { ...loaded.exports, timeoutBounds };
}
function request(extra = {}) {
  return new Request("https://pro.paladinscat.com/api/auth/me", {
    headers: { cookie: "__Host-pc_session=fixture-session", ...extra },
  });
}

test("app-owned Pro auth forwards identity, body and cookies while stripping hop and compression headers", async () => {
  let forwarded;
  const fixture = load();
  const cookies = ["first=one; Path=/; HttpOnly", "second=two; Path=/; Secure"];
  const handler = fixture.createAuthSessionProxy({ fetcher: async (url, options) => {
    forwarded = { url, options };
    const headers = new Headers({ "content-type": "text/plain", "cache-control": "public, max-age=3600",
      connection: "keep-alive, x-upstream-hop", "x-upstream-hop": "remove", "keep-alive": "timeout=5",
      "transfer-encoding": "chunked", "content-encoding": "gzip", "content-length": "1234", "x-request-id": "fixture-response" });
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    return new Response("unchanged upstream body", { status: 200, headers });
  } });
  const incoming = request({ authorization: "Bearer fixture-bearer", "cf-connecting-ip": "192.0.2.10", "cf-ray": "fixture-ray",
    "user-agent": "fixture-agent", "x-paladinscat-surface": "pro", connection: "keep-alive, x-request-hop",
    "x-request-hop": "remove", "keep-alive": "timeout=5", "proxy-authorization": "remove", host: "external.invalid", "content-length": "0" });
  const response = await handler(incoming);
  assert.equal(String(forwarded.url), `${backend}/auth/me`);
  assert.equal(forwarded.options.method, "GET");
  assert.equal(forwarded.options.cache, "no-store");
  assert.equal(forwarded.options.redirect, "error");
  assert.deepEqual(fixture.timeoutBounds, [5000]);
  assert.ok(forwarded.options.signal instanceof AbortSignal);
  for (const name of ["authorization", "cookie", "cf-connecting-ip", "cf-ray", "user-agent", "x-paladinscat-surface"]) {
    assert.equal(forwarded.options.headers.get(name), incoming.headers.get(name), name);
  }
  for (const name of ["connection", "x-request-hop", "keep-alive", "proxy-authorization", "host", "content-length"]) {
    assert.equal(forwarded.options.headers.get(name), null, name);
  }
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "unchanged upstream body");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-request-id"), "fixture-response");
  assert.deepEqual(response.headers.getSetCookie(), cookies);
  for (const name of ["connection", "x-upstream-hop", "keep-alive", "transfer-encoding", "content-encoding", "content-length"]) {
    assert.equal(response.headers.get(name), null, name);
  }
});

test("Rust owns all session decisions and retry metadata without a new Pro user limit", async () => {
  const fixture = load();
  for (const status of [200, 401, 403, 429, 503]) {
    const handler = fixture.createAuthSessionProxy({ fetcher: async () => Response.json({ upstreamStatus: status }, {
      status, headers: { "Retry-After": "17" },
    }) });
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { upstreamStatus: status });
    assert.equal(response.headers.get("retry-after"), "17");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  let calls = 0;
  const handler = fixture.createAuthSessionProxy({ fetcher: async () => { calls++; return Response.json({ id: 42 }); } });
  for (let i = 0; i < 35; i++) assert.equal((await handler(request())).status, 200);
  assert.equal(calls, 35);
});

test("connection failures retain the account and report a private, retryable service error", async () => {
  const fixture = load();
  for (const error of [new Error("connection failure"), new DOMException("timeout", "TimeoutError"), new Error("redirect rejected")]) {
    const handler = fixture.createAuthSessionProxy({ fetcher: async () => { throw error; } });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "AUTH_SESSION_UNAVAILABLE");
    assert.equal(response.headers.get("retry-after"), "5");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(response.headers.getSetCookie(), []);
  }
});

test("the backend base follows current runtime configuration and GET is app-owned", async () => {
  let base = "http://first-fixture:3005", calls = [];
  const fixture = load();
  const handler = fixture.createAuthSessionProxy({ apiBase: () => base, fetcher: async url => {
    calls.push(String(url)); return Response.json({ id: 42 });
  } });
  await handler(request());
  base = "http://replacement-fixture:3005/";
  await handler(request());
  assert.deepEqual(calls, ["http://first-fixture:3005/auth/me", "http://replacement-fixture:3005/auth/me"]);
  const source = readFileSync(new URL("../app/api/auth/me/route.ts", import.meta.url), "utf8");
  assert.match(source, /export const GET = proxyAuthSession;/);
  assert.match(source, /export const dynamic = "force-dynamic";/);
});
