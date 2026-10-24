/** Exercise the operations read model through the real shared HTTP loop, offline.
 * Inject only browser context and fetch; execute this checkout's transport and adapter.
 * refs: see: lib/api-client.ts, lib/operations-api.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const transport = ts.createSourceFile("api-client.ts", source("./api-client.ts"), ts.ScriptTarget.Latest, true);
const requestLoop = transport.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "fetchJson");
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const requestCode = compile(requestLoop.getText(transport).replace("export ", ""));
const adapterCode = compile(source("./operations-api.ts"));

function fixture(response) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    return response.clone();
  };
  class ApiRequestError extends Error {
    constructor(message, status, details) { super(message); this.status = status; Object.assign(this, details); }
  }
  const fetchJson = new Function("fetch", "setTimeout", "clearTimeout", "API_BASE", "FETCH_TIMEOUT_MS",
    "withStoredLobbyTier", "csrfHeader", "API_ERROR_KEYS", "ApiRequestError", "getAuthToken",
    "hasCookieAuthSession", "accountAuthHeaders", "fingerprintHeaders", `${requestCode}; return fetchJson;`)(
    fetch, (callback, delay) => delay <= 30_000 ? (queueMicrotask(callback), 1) : 1,
    () => {}, "/api", 45_000, path => path, () => null,
    { genericFailure: "failure" }, ApiRequestError, () => null, () => false, () => ({}), () => ({}),
  );
  const exports = {};
  new Function("require", "exports", "fetch", "process", adapterCode)(
    name => { assert.equal(name, "./api-client"); return { fetchJson, ApiRequestError, API_ERROR_KEYS: { genericFailure: "failure" }, accountAuthHeaders: () => ({}) }; },
    exports, fetch, { env: {} },
  );
  return { ...exports, requests };
}

const numericFields = {
  "traffic.summary": ["active_users", "active_window_seconds", "heartbeat_seconds", "visitors_today", "views_today", "visitor_days_7d", "views_7d"],
  catalog: ["matches", "ranked_matches", "casual_matches", "special_matches", "players", "registered_users", "verified_users", "community_builds", "tier_lists", "community_posts", "recovered_matches", "incomplete_matches"],
  ingest_coverage: ["total_matches", "direct_matches", "recovered_matches", "incomplete_matches"],
};
const at = (value, path) => path.split(".").reduce((object, key) => object[key], value);
function payload(number = 7) {
  const raw = { generated_at: "2026-10-24T00:00:00Z", release: { version: "", git_commit_short: "", deployed_at: null },
    traffic: { summary: {} }, catalog: { latest_match_at: null }, ingest_coverage: {} };
  for (const [path, fields] of Object.entries(numericFields)) {
    for (const field of fields) at(raw, path)[field] = number;
  }
  return raw;
}
const invalidResponse = error => error.kind === "invalid-response";

test("operations rejects absent or malformed required structures", async () => {
  for (const raw of [{}, null, [], false, "unavailable"]) {
    await assert.rejects(fixture(Response.json(raw)).fetchPublicOperationsStats(), invalidResponse);
  }
  for (const path of ["release", "traffic", "traffic.summary", "catalog", "ingest_coverage"]) {
    for (const bad of [undefined, null, [], false, "unavailable"]) {
      const raw = payload();
      const parts = path.split(".");
      if (parts.length === 1) raw[path] = bad;
      else at(raw, parts.slice(0, -1).join("."))[parts.at(-1)] = bad;
      await assert.rejects(fixture(Response.json(raw)).fetchPublicOperationsStats(), invalidResponse, `${path}: ${bad}`);
    }
  }
});

test("operations requires every numeric field without coercing absent or wrong types", async () => {
  for (const [path, fields] of Object.entries(numericFields)) {
    for (const field of fields) {
      for (const bad of [undefined, null, "0", false, [], {}]) {
        const raw = payload(); at(raw, path)[field] = bad;
        await assert.rejects(fixture(Response.json(raw)).fetchPublicOperationsStats(), invalidResponse, `${path}.${field}: ${bad}`);
      }
      const overflow = payload(); at(overflow, path)[field] = "OVERFLOW";
      const body = JSON.stringify(overflow).replace('"OVERFLOW"', '1e400');
      await assert.rejects(fixture(new Response(body)).fetchPublicOperationsStats(), invalidResponse, `${path}.${field}: Infinity`);
    }
  }
});

test("operations validates required strings and explicit nullable hash/timestamps", async () => {
  for (const path of ["generated_at", "release.version", "release.git_commit_short", "release.deployed_at", "catalog.latest_match_at"]) {
    const nullable = path === "release.git_commit_short" || (path.endsWith("_at") && path !== "generated_at");
    for (const bad of [undefined, 0, false, [], {}, ...(nullable ? [] : [null])]) {
      const raw = payload(); const parts = path.split(".");
      if (parts.length === 1) raw[path] = bad;
      else at(raw, parts.slice(0, -1).join("."))[parts.at(-1)] = bad;
      await assert.rejects(fixture(Response.json(raw)).fetchPublicOperationsStats(), invalidResponse, `${path}: ${bad}`);
    }
  }
});

test("operations preserves an explicit null release hash without losing statistics", async () => {
  for (const number of [7, 0]) {
    const raw = payload(number);
    raw.release.git_commit_short = null;
    const result = await fixture(Response.json(raw)).fetchPublicOperationsStats();
    assert.deepEqual(result.release, { version: "", gitCommitShort: null, deployedAt: null });
    assert.equal(result.traffic.activeUsers, number);
    assert.equal(result.catalog.matches, number);
    assert.equal(result.ingestCoverage.totalMatches, number);
  }
});

test("operations preserves measured positive numbers and genuine zero", async () => {
  for (const number of [7, 0]) {
    const raw = payload(number);
    raw.release = { version: "v-test", git_commit_short: "abcd123", deployed_at: "2026-10-24T00:00:00Z" };
    raw.catalog.latest_match_at = "2026-10-23T23:00:00Z";
    raw.data = { catalog: {} }; // Do not unwrap an unrelated data member.
    const result = await fixture(Response.json(raw)).fetchPublicOperationsStats();
    assert.equal(result.generatedAt, raw.generated_at);
    assert.equal(result.release.version, "v-test");
    assert.equal(result.release.gitCommitShort, "abcd123");
    assert.equal(result.release.deployedAt, raw.release.deployed_at);
    assert.equal(result.catalog.latestMatchAt, raw.catalog.latest_match_at);
    for (const [path, fields] of Object.entries(numericFields)) {
      const output = result[path === "traffic.summary" ? "traffic" : path === "ingest_coverage" ? "ingestCoverage" : path];
      for (const field of fields) assert.equal(output[field.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase())], number, field);
    }
  }
  const nullable = await fixture(Response.json(payload(0))).fetchPublicOperationsStats();
  assert.equal(nullable.release.deployedAt, null);
  assert.equal(nullable.catalog.latestMatchAt, null);
});

test("operations propagates non-success HTTP errors instead of decoding stats", async () => {
  for (const status of [401, 403, 429, 503]) {
    const client = fixture(Response.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status }));
    await assert.rejects(client.fetchPublicOperationsStats(), error => error.kind === "http" && error.status === status);
  }
});

test("operations rejects unreadable successful JSON through shared transport", async () => {
  const client = fixture(new Response("{", { status: 200 }));
  await assert.rejects(client.fetchPublicOperationsStats(), error => error.kind === "invalid-response");
  assert.equal(client.requests[0].url, "/api/operations/stats");
  assert.equal(client.requests[0].init.credentials, "same-origin");
  assert.ok(client.requests[0].init.signal instanceof AbortSignal);
});
