import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTypeScript(url) {
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => require(name), loaded, loaded.exports);
  return loaded.exports;
}
const verifiedAccess = loadTypeScript(new URL("./verified-access.ts", import.meta.url));
const source = ts.transpileModule(readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let cacheMetadata;
const loaded = { exports: {} };
new Function("require", "module", "exports", source)((name) => ({
  "next/cache": { unstable_cache: (fn, keys, options) => { cacheMetadata = { keys, options }; return fn; } },
  "@/lib/seo": { SITE_URL: "https://paladinscat.com" },
  "@/lib/static-champions": { STATIC_CHAMPIONS: [{ name: "Ash" }] },
  "@/lib/utils": { championSlug: (name) => name.toLowerCase() },
  "@/lib/blog": { getAllPosts: async () => [{ slug: "guide", publishedAt: "2026-01-01" }], getPostLink: (slug) => `/blog/${slug}` },
  "@/lib/verified-access": verifiedAccess,
}[name] || require(name)), loaded, loaded.exports);

test("sitemap omits protected directory roots and details while retaining public content", async () => {
  const urls = (await loaded.exports.default()).map((entry) => new URL(entry.url).pathname);
  assert.ok(!urls.includes("/features"));
  assert.ok(!urls.includes("/players"));
  assert.ok(!urls.includes("/stats"));
  assert.ok(urls.includes("/matches"));
  assert.ok(urls.includes("/champions/ash"));
  assert.ok(urls.includes("/blog/guide"));
  assert.ok(!urls.some((path) => path.startsWith("/players/")));
  assert.ok(!urls.some((path) => path.startsWith("/stats/")));
  assert.ok(!urls.some((path) => path.startsWith("/game/")));
  assert.ok(!urls.includes("/community"));
  assert.ok(!urls.includes("/builds"));
  assert.ok(!urls.includes("/tierlists"));
  for (const path of urls) {
    assert.equal(verifiedAccess.isVerifiedOnlyPath(path), false, path);
    assert.equal(verifiedAccess.isAccountOnlyPath(path), false, path);
  }
});

test("sitemap retains public URL metadata and the blog cache contract", async () => {
  assert.deepEqual(await loaded.exports.default(), [
    { url: "https://paladinscat.com/", changeFrequency: "hourly", priority: 1 },
    { url: "https://paladinscat.com/champions", changeFrequency: "hourly", priority: 0.95 },
    { url: "https://paladinscat.com/matches", changeFrequency: "hourly", priority: 0.85 },
    { url: "https://paladinscat.com/blog", changeFrequency: "daily", priority: 0.8 },
    { url: "https://paladinscat.com/about", changeFrequency: "monthly", priority: 0.45 },
    { url: "https://paladinscat.com/champions/ash", changeFrequency: "daily", priority: 0.78 },
    { url: "https://paladinscat.com/blog/guide", lastModified: "2026-01-01", changeFrequency: "monthly", priority: 0.7 },
  ]);
  assert.deepEqual(cacheMetadata, { keys: ["sitemap-blog-posts"], options: { revalidate: 3600 } });
});
