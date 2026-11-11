/** Verify current crawl URLs against real route and roster owners.
 * Replace GitHub transport only; production inventory code runs unchanged.
 * refs: doc: 06-reference-seo · see: app/sitemap.ts · lib/sitemap-data.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const posts = [
  { slug: "guide", title: "Guide", excerpt: "A guide", publishedAt: "2026-01-01" },
  { slug: "research/nested & report", title: "Research", excerpt: "Research guide", publishedAt: "N/A" },
];
const modules = new Map();
function load(relative) {
  const url = relative instanceof URL ? relative : new URL(relative, import.meta.url);
  if (modules.has(url.href)) return modules.get(url.href);
  const output = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  modules.set(url.href, loaded.exports);
  new Function("require", "module", "exports", output)((name) => {
    if (name === "next/cache") return { unstable_cache: fn => fn };
    if (name.endsWith("server-api")) return { serverApiBase: () => "https://backend.example" };
    if (name === "node:fs") return { ...require(name), readFileSync: (path, ...args) => path === "seo-fixture" ? "ab".repeat(32) : readFileSync(path, ...args) };
    if (name === "@/lib/blog" || name === "./blog") return {
      getAllPosts: async () => posts,
      getPostLink: slug => `/blog/${slug.split("/").map(encodeURIComponent).join("/")}`,
    };
    if (name.startsWith("@/")) return load(new URL(`../${name.slice(2)}.ts`, import.meta.url));
    if (name.startsWith(".")) return load(new URL(`${name}.ts`, url));
    return require(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const access = load("./verified-access.ts");
const { STATIC_CHAMPIONS } = load("./static-champions.ts");
const { championSlug } = load("./utils.ts");
const sitemap = load("../app/sitemap.ts").default;
const expectedStatic = ["/", "/champions", "/matches", "/blog", "/about", "/contact", "/privacy", "/terms", "/localization", "/changelog", "/features", "/operations/paladinscat-bot", "/operations/stats"];

test("sitemap uses current public content routes and every roster champion, never protected or aliases", async () => {
  const entries = await sitemap();
  const paths = entries.map(entry => new URL(entry.url).pathname);
  assert.deepEqual(paths.filter(path => !path.startsWith("/champions/") && !path.startsWith("/blog/")), expectedStatic);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of expectedStatic) {
    if (path !== "/") assert.ok(existsSync(new URL(`../app${path}/page.tsx`, import.meta.url)), path);
  }
  assert.deepEqual(paths.filter(path => path.startsWith("/champions/")), STATIC_CHAMPIONS.map(champion => `/champions/${championSlug(champion.name)}`));
  for (const path of paths) {
    assert.equal(access.isVerifiedOnlyPath(path), false, path);
    assert.equal(access.isAccountOnlyPath(path), false, path);
    assert.ok(!/[?#]/.test(path), path);
  }
  for (const excluded of ["/players", "/stats", "/community", "/builds", "/tierlists", "/game/maps", "/search", "/settings", "/notifications", "/account", "/auth/login", "/analyze", "/site"]) assert.ok(!paths.includes(excluded), excluded);
  assert.equal(entries.find(entry => entry.url.endsWith("/blog/guide")).lastModified, undefined, "Publication is not a verified last modification");
});

test("both XML endpoints share entries and robots advertises both absolute URLs", async () => {
  const { GET } = load("../app/sitemap-google.xml/route.ts");
  const { resolveSitemap } = require("next/dist/build/webpack/loaders/metadata/resolve-route-data");
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  const xml = await response.text();
  assert.equal(xml, resolveSitemap(await sitemap()));
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml, /research\/nested%20%26%20report/);
  assert.ok(!xml.includes("<lastmod>"));
  assert.deepEqual(load("../app/robots.ts").default().sitemap, ["https://paladinscat.com/sitemap.xml", "https://paladinscat.com/sitemap-google.xml"]);
});

test("proxy bypasses only exact sitemap XML paths, including HTML Accept and missing gate secret", async () => {
  const { proxy, config } = load("../proxy.ts");
  const { NextRequest } = require("next/server");
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const matcher = new RegExp(config.matcher[0]);
    for (const path of ["/sitemap.xml", "/sitemap-google.xml"]) {
      assert.equal(matcher.test(path), false, path);
      const response = await proxy(new NextRequest(`https://paladinscat.com${path}`, { headers: { accept: "text/html" } }));
      assert.equal(response.headers.get("x-middleware-next"), "1", path);
      assert.equal(response.headers.get("x-middleware-rewrite"), null, path);
      assert.equal(response.headers.get("set-cookie"), null, path);
    }
    for (const path of ["/sitemap.xml-extra", "/sitemap.xml/extra", "/sitemap-google.xml-extra", "/sitemap-google.xml/extra"]) assert.equal(matcher.test(path), true, path);
  } finally {
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old;
  }
});

test("public initial HTML is indexable with its own canonical; protected, raw and unknown stay excluded", async () => {
  const { proxy } = load("../proxy.ts");
  const { NextRequest } = require("next/server");
  const old = { ...process.env }, oldFetch = globalThis.fetch;
  process.env.NODE_ENV = "production";
  process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE = "seo-fixture";
  let account = { linked_player_id: 42, invitation_active: true, regulation_stage: 0 };
  globalThis.fetch = async () => Response.json(account);
  const request = (path, headers = {}, method = "GET") => new NextRequest(`https://paladinscat.com${path}`, { method, headers: { accept: "text/html", ...headers } });
  try {
    const template = readFileSync(new URL("../public/app/index.html", import.meta.url), "utf8");
    for (const path of ["/", "/champions", "/champions/ash", "/blog", "/blog/guide", "/blog/research/nested%20%26%20report", "/features", "/about", "/contact", "/privacy", "/terms", "/localization", "/changelog"]) {
      const response = await proxy(request(`${path}?utm_source=test`));
      const html = await response.text();
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type"), /text\/html/, path);
      assert.equal(response.headers.get("x-robots-tag"), "index, follow", path);
      assert.ok(html.includes('<meta name="robots" content="index, follow">'), path);
      assert.ok(html.includes(`<link rel="canonical" href="https://paladinscat.com${path}">`), path);
      assert.ok(!html.includes("noindex"), path);
      assert.equal(html.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, nofollow">').replace(`\n  <link rel="canonical" href="https://paladinscat.com${path}">`, ""), template, "Only SEO tags may differ from the shared shell");
      assert.ok(response.headers.get("content-security-policy").includes("script-src 'self'"), path);
      assert.ok(response.cookies.get("__Host-pc_guest"), path);
    }
    const head = await proxy(request("/champions/ash", {}, "HEAD"));
    assert.equal(await head.text(), "");
    assert.equal(head.headers.get("x-robots-tag"), "index, follow");
    for (const path of ["/not-a-route", "/champions/not-a-champion", "/blog/missing", "/auth/login", "/search", "/settings", "/notifications", "/analyze", "/app/index.html"]) {
      const response = await proxy(request(path));
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", path);
      assert.ok(!(await response.text()).includes('rel="canonical"'), path);
    }
    assert.ok(template.includes('<meta name="robots" content="noindex, nofollow">'), "Raw shell remains noindex");
    for (const path of ["/players", "/stats", "/community", "/builds", "/tierlists", "/account", "/game/maps"]) {
      const denied = await proxy(request(path));
      assert.equal(denied.status, 307, path);
      assert.equal(new URL(denied.headers.get("location")).pathname, "/auth/login", path);
      assert.equal(denied.headers.get("x-robots-tag"), "noindex, nofollow", path);
      const allowed = await proxy(request(path, { cookie: "__Host-pc_session=fixture" }));
      assert.equal(allowed.status, 200, path);
      assert.equal(allowed.headers.get("x-robots-tag"), "noindex, nofollow", path);
    }
    account = { ...account, access_restriction_kind: "blacklist" };
    assert.equal(new URL((await proxy(request("/about", { cookie: "__Host-pc_session=fixture" }))).headers.get("location")).pathname, "/prototype/access-policy", "Restricted public navigation still follows the existing gate");
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["NODE_ENV", "PALADINSCAT_WEBSITE_GATE_SECRET_FILE"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
  }
});
