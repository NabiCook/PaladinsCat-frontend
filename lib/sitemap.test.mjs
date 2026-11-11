/** Verify the standard metadata route delegates to the shared inventory.
 * Membership, XML parity and document SEO run in sitemap-current.test.mjs.
 * refs: doc: 06-reference-seo · see: app/sitemap.ts · lib/sitemap-data.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const entries = [{ url: "https://paladinscat.com/champions/ash", changeFrequency: "daily", priority: 0.78 }];
const source = ts.transpileModule(readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", source)((name) => {
  assert.equal(name, "@/lib/sitemap-data");
  return { getSitemapEntries: async () => entries };
}, loaded, loaded.exports);

test("standard sitemap delegates without diverging from the shared entries or cache cadence", async () => {
  assert.equal(await loaded.exports.default(), entries);
  assert.equal(loaded.exports.revalidate, 300);
});
