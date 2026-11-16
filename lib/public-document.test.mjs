/** Exercise the real SPA core's initial-document handoff without browser access.
 * Source content and access boundaries run in sitemap-current.test.mjs.
 * refs: doc: 06-reference-seo · see: public/app/discovery-app.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

function fixture(path = "/champions/ash") {
  const observers = [], listeners = new Map();
  const classes = { toggle() {}, add() {}, remove() {} };
  const element = (title = "") => ({ dataset: {}, classList: classes, style: {}, isConnected: true,
    setAttribute(name, value) { this[name] = value; }, append() {}, addEventListener() {},
    querySelector(selector) { return selector === "h1" ? { textContent: title, focus() {} } : null; },
    querySelectorAll() { return []; }, remove() { this.isConnected = false; },
  });
  const initial = element("Ash"), shell = element(), stack = element();
  initial.outerHTML = '<main data-public-document><article><h1>Public document</h1><p>Source-owned content</p></article></main>';
  shell.dataset.view = "public-document";
  stack.querySelector = selector => selector === "[data-public-document]" ? initial : null;
  const nodes = [initial];
  const document = { title: "Ash Paladins Abilities, Talents & Cards | PaladinsCat", readyState: "loading",
    getElementById() { return null; },
    querySelector(selector) { return selector === ".dashboard-shell" ? shell : selector === ".page-view-stack" ? stack : null; },
    querySelectorAll(selector) { return selector === "main,.dashboard-grid" ? nodes : []; },
    createElement() { const node = element("Client view"); nodes.push(node); return node; },
    addEventListener() {}, dispatchEvent(event) { if (event.type === "discovery:open-view") shell.dataset.view = event.detail.view; },
  };
  const window = { addEventListener(name, fn) { listeners.set(name, fn); }, scrollTo() {}, dispatchEvent() {} };
  const context = vm.createContext({ document, window, URL, Headers, location: { origin: "https://paladinscat.com", host: "paladinscat.com", pathname: path, search: "", hash: "" },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    requestAnimationFrame: fn => { fn(); return 1; }, setTimeout: fn => fn(), Element: class {}, console,
  });
  const source = readFileSync(new URL("../public/app/discovery-app.js", import.meta.url), "utf8");
  new vm.Script(source, { importModuleDynamically: () => Promise.reject(new Error("Optional color module excluded")) }).runInContext(context);
  return { app: window.DiscoveryApp, document, shell, initial, observers, listeners };
}

test("initial public content stays usable until a client view takes ownership", () => {
  const f = fixture();
  assert.equal(f.initial.isConnected, true);
  const activate = f.observers.at(-1);
  activate();
  assert.equal(f.initial.hidden, false);
  assert.equal(f.initial.inert, false);
  assert.equal(f.shell.dataset.dynamicPage, "true");
  f.app.registerRoute("/champions/ash", () => { f.app.createPage("champion", "Ash", "Champions"); f.app.open("champion"); });
  f.app.navigate("/champions/ash");
  assert.equal(f.initial.isConnected, false);
  assert.equal(f.document.title, "Ash Paladins Abilities, Talents & Cards | PaladinsCat");
  f.app.registerRoute("/blog", () => { f.app.createPage("blog", "Blog", "Blog"); f.app.open("blog"); });
  f.app.navigate("/blog");
  assert.equal(f.document.title, "Client view · PaladinsCat");
});

test("homepage boot also hands off its initial public document", () => {
  const f = fixture("/");
  // The source's home click has no DOM target in this fixture; observe that
  // boot dispatches the actual route, rather than leaving the document stranded.
  f.listeners.get("load")();
  assert.equal(f.shell.dataset.route, "/");
});

test("blog handoff reuses the initial representation and rejects unrelated reads", async () => {
  const f = fixture("/blog");
  const payload = await f.app.readPublicDocument("/blog");
  assert.equal(payload.html, f.initial.outerHTML);
  f.app.createPage("blog", "Blog", "Blog");
  f.app.open("blog");
  assert.equal(f.initial.isConnected, false);
  assert.equal((await f.app.readPublicDocument("/blog")).html, payload.html);
  await assert.rejects(f.app.readPublicDocument("/account"), /Invalid public document/);
  await assert.rejects(f.app.readPublicDocument("https://other.example/blog"), /Invalid public document/);
});

test("feature client uses the served data and preserves the existing expiry policy", async () => {
  const previousWindow = globalThis.window;
  const calls = [];
  globalThis.window = { DiscoveryApp: { readPublicDocument: async (path, options) => {
    calls.push({ path, options });
    return { data: { features: { sourceUrl: "https://github.com/example/public/blob/main/features.md", entries: [
      { id: "current", publishedAt: new Date().toISOString(), title: "Current feature" },
      { id: "expired", publishedAt: new Date(Date.now()-8*86400000).toISOString(), title: "Expired feature" },
    ] } } };
  } } };
  try {
    const source = await import(new URL("../public/app/discovery-feature-document.js?public-document-test", import.meta.url));
    assert.deepEqual((await source.getFeatureDocument()).entries.map(entry => entry.id), ["current"]);
    await source.getFeatureDocument();
    assert.equal(calls.length, 1);
    await source.getFeatureDocument(true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].path, "/features");
    assert.equal(calls[1].options.refresh, true);
  } finally { globalThis.window = previousWindow; }
});

test("the blog owner exposes upstream failure to indexing callers while preserving existing fallback", async () => {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL("./blog.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", source)(name => name === "next/cache" ? { unstable_cache: fn => fn } : require(name), loaded, loaded.exports);
  const previousFetch = globalThis.fetch, previousError = console.error;
  globalThis.fetch = async () => { throw new Error("GitHub source unavailable"); };
  console.error = () => {};
  try {
    await assert.rejects(loaded.exports.getAllPosts({ throwOnError: true }), /GitHub source unavailable/);
    assert.deepEqual(await loaded.exports.getAllPosts(), []);
    globalThis.fetch = async input => String(input).includes("/git/trees/")
      ? Response.json({ tree: [{ type: "blob", path: "docs/blog/guide.md" }] })
      : new Response("Source temporarily unavailable", { status: 503 });
    await assert.rejects(loaded.exports.getAllPosts({ throwOnError: true }), /GitHub article 503/);
    assert.deepEqual(await loaded.exports.getAllPosts(), []);
  } finally { globalThis.fetch = previousFetch; console.error = previousError; }
});
