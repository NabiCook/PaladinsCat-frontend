/** Regenerate shared skin resolvers from the materialized private resource index. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(await readFile(resolve(root, "public/images/skins/index.json"), "utf8"));
if (index.schema !== 1 || index.image_formats?.preferred !== "avif" || index.image_formats?.fallback !== "png" || !Array.isArray(index.champions)) throw Error("Invalid skin portrait index");
const seen = new Set();
const records = index.champions.map(champion => {
  if (!Number.isSafeInteger(champion.champion_id) || champion.champion_id <= 0 || !/^[a-z0-9-]+$/.test(champion.slug) || !Array.isArray(champion.skin_ids)) throw Error("Invalid skin champion mapping");
  for (const id of champion.skin_ids) {
    const key = `${champion.champion_id}:${id}`;
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(key)) throw Error("Invalid or duplicate skin ID");
    seen.add(key);
  }
  return { championId: champion.champion_id, slug: champion.slug, skinIds: champion.skin_ids };
});
const file = resolve(root, "lib/skin-portraits.ts");
const previous = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
const region = /\/\/ BEGIN pinned skin index[\s\S]*?\/\/ END pinned skin index/;
if (!region.test(previous)) throw Error("Skin resolver generation markers are missing");
const source = previous.replace(region, `// BEGIN pinned skin index\nconst champions = ${JSON.stringify(records)} as const;\n// END pinned skin index`);
const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020, newLine: ts.NewLineKind.LineFeed } });
if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw Error("Skin resolver failed TypeScript generation");
const target = resolve(root, "public/app/discovery-skin-portraits.js");
if (process.argv.includes("--check")) {
  if (previous !== source || (await readFile(target, "utf8")).replaceAll("\r\n", "\n") !== result.outputText) throw Error("Skin portrait resolver differs from its pinned index; regenerate it");
} else {
  await writeFile(file, source);
  await writeFile(target, result.outputText);
}
console.log(`Skin resolver verified: ${records.length} champions, ${seen.size} IDs, AVIF and PNG only`);
