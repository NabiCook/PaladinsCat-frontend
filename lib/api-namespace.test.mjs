/** Verify API namespace admission independently of public HTML rendering.
 * Keep alias/access behavior unchanged when document SEO changes.
 * refs: doc: 06-reference-seo · see: lib/sitemap-current.test.mjs · proxy.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relative) {
  const file = new URL(relative, import.meta.url);
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    // Namespace tests do not own document rendering; real SEO has its own suite.
    if (name === "./lib/spa-seo") return { renderPublicSpaHtml: async () => null };
    if (name.endsWith("server-api")) return { serverApiBase: () => "https://backend.example" };
    if (name.startsWith("./lib/")) return load(`${name.replace("./lib/", "./")}.ts`);
    return require(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const { proxy } = load("../proxy.ts");
const gate = load("./website-gate.ts");
const { NextRequest } = require("next/server");

test("case and encoded API namespaces cannot reach case-insensitive fallback rewrites", async () => {
  const oldEnv = process.env.NODE_ENV;
  const oldFetch = globalThis.fetch;
  const oldOrigin = process.env.PALADINSCAT_PUBLIC_ORIGIN;
  const oldSecret = process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE;
  process.env.NODE_ENV = "production";
  // The public proxy only reaches its API branches with a page-issued guest
  // admission, so stand up the same gate fixture the website-proxy suite uses;
  // without it every API probe is answered by WEBSITE_GATE_UNAVAILABLE.
  const origin = "https://paladinscat.com";
  const secret = "ab".repeat(32);
  const directory = mkdtempSync(join(tmpdir(), "pc-api-namespace-"));
  writeFileSync(join(directory, "fixture"), secret);
  process.env.PALADINSCAT_PUBLIC_ORIGIN = origin;
  process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = join(directory, "fixture");
  const guest = `${gate.GUEST_COOKIE}=${gate.issueGuest(secret, origin)}`;
  // Exercise the public proxy directly with a synthetic admitted account.
  globalThis.fetch = async () => Response.json({ linked_player_id: "42", invitation_active: true, regulation_stage: 0 });
  try {
    for (const namespace of ["API", "Api", "aPi", "_PC", "_Pc", "%61pi", "%41PI", "%5fPC", "api%2f"]) {
      for (const operation of ["cheaters/active", "cheaters/inactive", "auth/me"]) {
        const request = new NextRequest(`https://paladinscat.com/${namespace}/${operation}`, {
          headers: { accept: "application/json", cookie: `${guest}; __Host-pc_session=fixture-pro-session` },
        });
        const response = await proxy(request);
        assert.equal(response.status, 400, request.url);
        assert.equal((await response.json()).error.code, "NON_CANONICAL_API_PATH");
        assert.equal(response.headers.get("x-middleware-next"), null);
      }
    }
    // The moderated feeds must stay invisible to a public visitor, so model one:
    // an unlinked account can never satisfy the verified-only read gate.
    const verifiedStub = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ linked_player_id: null, invitation_required: false });
    try {
      for (const feed of ["active", "inactive"]) {
        const blocked = await proxy(new NextRequest("https://paladinscat.com/api/cheaters/" + feed, {
          headers: { accept: "application/json", cookie: `${guest}; __Host-pc_session=fixture-public-session` },
        }));
        assert.equal(blocked.status, 404, "Canonical public moderation feeds remain unavailable");
      }
    } finally {
      globalThis.fetch = verifiedStub;
    }
    // Bootstrap and scoped machine APIs retain their canonical route behavior.
    for (const path of ["/api/auth/oidc/callback", "/api/v1/health"]) {
      const response = await proxy(new NextRequest(`https://paladinscat.com${path}`, {
        headers: { accept: "application/json", cookie: "__Host-pc_session=fixture-pro-session" },
      }));
      assert.equal(response.headers.get("x-middleware-next"), "1", path);
    }
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    if (oldOrigin === undefined) delete process.env.PALADINSCAT_PUBLIC_ORIGIN; else process.env.PALADINSCAT_PUBLIC_ORIGIN = oldOrigin;
    if (oldSecret === undefined) delete process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE; else process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = oldSecret;
    globalThis.fetch = oldFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
