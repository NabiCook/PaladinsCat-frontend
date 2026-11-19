import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const code = ts.transpileModule(readFileSync(new URL("../app/api/cheaters/evidence/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const handler = { exports: {} };
new Function("require", "module", "exports", code)(require, handler, handler.exports);

test("evidence proxy preserves OIDC security context and streams multipart unchanged", async () => {
  const original = globalThis.fetch;
  try {
    const csrf = "a".repeat(32);
    const form = new FormData();
    form.set("description", "Test fixture only");
    const request = new NextRequest("https://paladinscat.com/api/cheaters/evidence", {
      method: "POST", body: form,
      headers: { cookie: `unrelated=private; __Host-pc_session=test-session; __Host-pc_csrf=${csrf}`,
        origin: "https://paladinscat.com", "x-forwarded-proto": "https", "x-csrf-token": csrf },
    });
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.headers.get("cookie"), `__Host-pc_session=test-session; __Host-pc_csrf=${csrf}`);
      assert.equal(init.headers.get("authorization"), null);
      assert.equal(init.headers.get("origin"), "https://paladinscat.com");
      assert.equal(init.headers.get("x-forwarded-proto"), "https");
      assert.equal(init.headers.get("x-csrf-token"), csrf);
      assert.equal(init.headers.get("content-type"), request.headers.get("content-type"));
      assert.equal(init.body, request.body);
      assert.equal(init.cache, "no-store");
      return new Response("accepted", { status: 201 });
    };
    assert.equal((await handler.exports.POST(request)).status, 201);
  } finally { globalThis.fetch = original; }
});

test("evidence proxy preserves bearer auth and forwards anonymous rejection without inventing credentials", async () => {
  const original = globalThis.fetch;
  try {
    for (const authorization of [null, "Bearer legacy-session"]) {
      globalThis.fetch = async (_url, init) => {
        assert.equal(init.headers.get("authorization"), authorization);
        assert.equal(init.headers.get("cookie"), null);
        assert.equal(init.headers.get("x-forwarded-proto"), null);
        return new Response("Login required", { status: 401 });
      };
      const response = await handler.exports.GET(new NextRequest("https://paladinscat.com/api/cheaters/evidence", {
        headers: authorization ? { authorization } : {},
      }));
      assert.equal(response.status, 401);
      assert.equal(await response.text(), "Login required");
    }
  } finally { globalThis.fetch = original; }
});

test("evidence upload relays the backend retry delay when media processing is busy", async () => {
  const original = globalThis.fetch;
  try {
    const payload = { error: { code: "MEDIA_BUSY", message: "Please retry later." } };
    globalThis.fetch = async () => Response.json(payload, {
      status: 503, headers: { "Retry-After": "5", "Cache-Control": "private, no-store" },
    });
    const response = await handler.exports.POST(new NextRequest("https://paladinscat.com/api/cheaters/evidence", {
      method: "POST", body: new FormData(),
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Retry-After"), "5");
    assert.deepEqual(await response.json(), payload);
  } finally { globalThis.fetch = original; }
});
