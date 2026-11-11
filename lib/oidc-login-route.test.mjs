import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");

test("POST rejects foreign origins and denied admission before reading a form", async () => {
  let admissions = 0;
  const route = load("../app/api/auth/oidc/login/route.ts", {
    "@/lib/oidc-login-admission": { ...load("./oidc-login-admission.ts"), admitLoginStart: () => { admissions++; return null; } },
    "@/lib/oidc-security": load("./oidc-security.ts"),
    "@/lib/oidc-client-secret": {}, "@/lib/oidc-bff-service": {},
  });
  const origin = process.env.PALADINSCAT_PUBLIC_ORIGIN || "http://localhost:3000";
  const request = supplied => ({ headers: new Headers({ origin: supplied }),
    get body() { throw new Error("body access before admission"); } });
  assert.equal((await route.POST(request("https://foreign.example"))).status, 403);
  assert.equal(admissions, 0);
  for (const method of ["POST", "GET"]) {
    const response = await route[method](request(origin));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "5");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("POST rejects actual oversized and malformed input without OIDC work and releases admission", async () => {
  let active = 0, starts = 0;
  const admission = load("./oidc-login-admission.ts");
  const route = load("../app/api/auth/oidc/login/route.ts", {
    "@/lib/oidc-login-admission": { ...admission, admitLoginStart: () => {
      active++; starts++; return () => { active--; };
    } },
    "@/lib/oidc-security": load("./oidc-security.ts"),
    "@/lib/oidc-client-secret": { oidcClientSecret() { throw new Error("unexpected OIDC work"); } },
    "@/lib/oidc-bff-service": {},
  });
  const origin = process.env.PALADINSCAT_PUBLIC_ORIGIN || "http://localhost:3000";
  for (const [body, type, expected] of [
    ["intent=login", "multipart/form-data; boundary=x", 415],
    ["intent=login&intent=create", "application/x-www-form-urlencoded", 400],
    ["intent=login&file=demo", "application/x-www-form-urlencoded", 400],
    ["intent=login&return=" + "x".repeat(2048), "application/x-www-form-urlencoded", 413],
  ]) {
    const response = await route.POST(new NextRequest(`${origin}/api/auth/oidc/login`, {
      method: "POST", headers: { origin, "content-type": type, "content-length": "1" }, body,
    }));
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(active, 0);
  }
  assert.equal(starts, 4);
});

test("service-token deadline covers a stalled response body", async () => {
  const source = ts.createSourceFile("service.ts", readFileSync(new URL("./oidc-bff-service.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && ["fetchToken", "boundedJson"].includes(node.name?.text));
  assert.equal(functions.length, 2);
  const code = ts.transpileModule(functions.map(node => node.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const fetchToken = new Function("required", "validateEndpoints", "clientAssertion", "oidcFetch", "AbortSignal", `let cached; ${code}; return fetchToken;`)(
    () => "test", () => {}, () => "test-assertion",
    async (_url, init) => new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
    } })),
    { timeout: milliseconds => { assert.equal(milliseconds, 10_000); return AbortSignal.timeout(15); } },
  );
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(fetchToken(), { name: "TimeoutError" }); }
  finally { clearTimeout(keepAlive); }
});

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? (["@/lib/operator-plane", "./operator-plane"].includes(name) ? load("./operator-plane.ts") : ["@/lib/operator-transport.mjs", "./operator-transport.mjs"].includes(name) ? { operatorBackendFetch: (...args) => globalThis.fetch(...args) } : name === "@/lib/oidc-transport" || name === "./oidc-transport.ts" ? { oidcFetch: (...args) => globalThis.fetch(...args) } : require(name)), loaded, loaded.exports);
  return loaded.exports;
}

test("login start handles upstream failures and permits a later successful retry", async () => {
  const originalFetch = globalThis.fetch;
  const envKeys = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_INTERNAL_ISSUER", "PALADINSCAT_PUBLIC_ORIGIN"];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  try {
    process.env.OIDC_ISSUER = "https://auth.example/realms/test";
    process.env.OIDC_CLIENT_ID = "test-web";
    delete process.env.OIDC_INTERNAL_ISSUER;
    process.env.PALADINSCAT_PUBLIC_ORIGIN = "https://site.example";
    let failToken = true;
    const route = load("../app/api/auth/oidc/login/route.ts", {
      "@/lib/oidc-login-admission": load("./oidc-login-admission.ts"),
      "@/lib/oidc-security": load("./oidc-security.ts"),
      "@/lib/oidc-client-secret": { oidcClientSecret: () => "test-secret" },
      "@/lib/oidc-bff-service": { oidcBffServiceHeaders: async () => {
        if (failToken) throw new DOMException("private upstream detail", "AbortError");
        return { authorization: "Bearer test-service" };
      } },
    });
    const request = () => new NextRequest("https://site.example/api/auth/oidc/login?return=%2Faccount");
    async function unavailable(response) {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("retry-after"), "5");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("location"), null);
      assert.doesNotMatch(await response.text(), /private upstream|test-secret/);
    }
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
    await unavailable(await route.GET(request()));
    assert.equal(calls, 0, "no transaction or PAR before service authentication");
    failToken = false;
    globalThis.fetch = async (_url, init) => {
      calls++;
      assert.ok(init.signal, "transaction request has a deadline");
      throw new DOMException("private upstream detail", "TimeoutError");
    };
    await unavailable(await route.GET(request()));
    assert.equal(calls, 1, "failed transaction must not submit PAR or retry mutations");
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await unavailable(await route.GET(request()));
    globalThis.fetch = async (url) => String(url).endsWith("/transactions")
      ? new Response(null, { status: 201 }) : new Response(null, { status: 503 });
    await unavailable(await route.GET(request()));
    globalThis.fetch = async (url) => String(url).endsWith("/transactions")
      ? new Response(null, { status: 201 })
      : Response.json({ request_uri: "urn:ietf:params:oauth:request_uri:test", expires_in: 60 }, { status: 201 });
    const success = await route.GET(request());
    assert.equal(success.status, 303);
    for (const attribute of [/__Host-pc_oidc_txn=/, /; HttpOnly/i, /; Secure/i, /; SameSite=lax/i]) {
      assert.match(success.headers.get("set-cookie"), attribute);
    }
    assert.equal(new URL(success.headers.get("location")).hostname, "auth.example");
    for (const body of ["return=%2Faccount", "intent=create&return=%2Faccount"]) {
      const posted = await route.POST(new NextRequest("https://site.example/api/auth/oidc/login", {
        method: "POST", headers: { origin: "https://site.example", "content-type": "application/x-www-form-urlencoded" }, body,
      }));
      assert.equal(posted.status, 303, "bounded forms preserve the successful native POST handoff");
      assert.match(posted.headers.get("set-cookie"), /; HttpOnly.*; Secure|; Secure.*; HttpOnly/i);
      assert.equal(new URL(posted.headers.get("location")).hostname, "auth.example");
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
