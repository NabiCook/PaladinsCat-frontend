import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load() {
  const output = ts.transpileModule(readFileSync(new URL("./oidc-login-admission.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function("module", "exports", output)(fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const fixture = load();
const request = (body, headers = {}) => new Request("https://site.example/api/auth/oidc/login", {
  method: "POST", duplex: "half", body, headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
});

test("admission has constant memory, caps concurrent starts and refills a shared GET/POST budget", () => {
  let now = 0;
  const gate = fixture.createLoginStartAdmission(() => now, { burst: 3, perSecond: 1, concurrency: 2 });
  const a = gate(), b = gate();
  assert.equal(typeof a, "function"); assert.equal(typeof b, "function");
  assert.equal(gate(), null);
  a(); a(); // idempotent release cannot manufacture slots
  const c = gate(); assert.equal(typeof c, "function");
  b(); c();
  assert.equal(gate(), null, "completed starts still spend rate tokens");
  now = 1000;
  assert.equal(typeof gate(), "function");
});

test("login form allows at most one intent=create and one bounded return field", async () => {
  assert.deepEqual(await fixture.readLoginForm(request("intent=create&return=%2Faccount")), { intent: "create", returnPath: "/account" });
  assert.deepEqual(await fixture.readLoginForm(request("")), { intent: "login", returnPath: "/" });
  for (const body of ["intent=login", "intent=", "other=x", "return=a&return=b", "intent=create&intent=create", "intent=create&return=/&third=x", "return=%ZZ", "return=%FF", "return=" + "x".repeat(1025)]) {
    await assert.rejects(fixture.readLoginForm(request(body)), error => error.status === 400, body.slice(0, 80));
  }
  for (const type of ["multipart/form-data; boundary=test", "application/json", "text/plain", "application/x-www-form-urlencoded; charset=iso-8859-1"]) {
    await assert.rejects(fixture.readLoginForm(request("intent=create", { "content-type": type })), error => error.status === 415);
  }
});

test("actual stream bytes, not Content-Length, bound the parser and cancellation is not awaited", async () => {
  let cancelled = 0;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2049)); }, cancel() { cancelled++; return new Promise(() => {}); } });
  await assert.rejects(fixture.readLoginForm(request(body, { "content-length": "1" })), error => error.status === 413);
  assert.equal(cancelled, 1);
  await assert.rejects(fixture.readLoginForm(request("return=/", { "content-length": "2049" })), error => error.status === 413);
  // Multi-byte UTF-8 must not bypass the byte ceiling.
  await assert.rejects(fixture.readLoginForm(request("return=" + "한".repeat(700))), error => error.status === 413);
});

test("stalled body and drip-fed body share one absolute deadline and release the reader", async () => {
  for (const drip of [false, true]) {
    let cancelled = 0, timer;
    const stream = new ReadableStream({ start(controller) {
      if (drip) timer = setInterval(() => controller.enqueue(new Uint8Array([65])), 2);
    }, cancel() { cancelled++; clearInterval(timer); return new Promise(() => {}); } });
    const before = Date.now();
    await assert.rejects(fixture.readLoginForm(request(stream), 20), error => error.status === 408);
    assert.equal(cancelled, 1); assert.ok(Date.now() - before < 1000);
  }
});

test("read errors and aborted input fail closed without leaving an active admission slot", async () => {
  const stream = new ReadableStream({ start(controller) { controller.error(new Error("private fixture detail")); } });
  await assert.rejects(fixture.readLoginForm(request(stream)), error => error.status === 400 && !error.message.includes("private fixture"));
});
