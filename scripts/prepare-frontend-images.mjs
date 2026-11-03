/** Materialize the exact private resource pin into ignored frontend build inputs. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, copyFile, lstat, realpath, unlink } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function resourcePath(value) {
  if (typeof value !== "string" || !value || /[\\<>:"|?*\x00-\x1f]/.test(value) || isAbsolute(value)
    || value.split("/").some(part => !part || part === "." || part === "..")
    || /(?:^|\/)(?:\.git|local|secrets|env)(?:\/|$)|(?:^|\/)\.env(?:\.|$)/i.test(value)) {
    throw new Error(`Unsafe resource path: ${value}`);
  }
  const media = /\.(?:avif|png|jpe?g|webp|gif|svg|ico|bmp|apng|woff2?|ttf|otf|eot|mp[34]|webm|wav|ogg|flac|aac)$/i.test(value);
  const metadata = /^public\/(?:images|fonts)\//.test(value) && /(?:\.(?:json|txt|md)|\/(?:LICENSE|NOTICE)(?:\.[^/]*)?)$/i.test(value);
  if (!media && !metadata) throw new Error(`Resource path contains application code: ${value}`);
  return value;
}
function inside(root, file) {
  const name = relative(root, file);
  if (name === ".." || name.startsWith(".." + sep) || isAbsolute(name)) throw new Error("Resource escaped its root");
}
export async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function prepareFrontendImages({ root = repository, source, check = false, verifyOnly = false } = {}) {
  root = await realpath(root);
  const lock = JSON.parse(await readFile(resolve(root, "frontend-images.lock.json"), "utf8"));
  if (lock.schema !== 1 || lock.repository !== "NabiCook/paladinscat-frontend-images"
    || !/^[a-f0-9]{40}$/.test(lock.commit) || !/^[a-f0-9]{64}$/.test(lock.manifestSha256)
    || !["frontend", "frontend-pro"].includes(lock.variant)) throw new Error("Invalid frontend resource lock");
  source = await realpath(source || process.env.PALADINSCAT_FRONTEND_IMAGES_ROOT || resolve(root, "../paladinscat-frontend-images"));
  const manifestPath = resolve(source, "manifest.json");
  if (await sha256(manifestPath) !== lock.manifestSha256) throw new Error("Private resource manifest differs from the pinned digest");
  if (await lstat(resolve(source, ".git")).catch(() => null)) {
    const head = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 15000 }).trim();
    if (head !== lock.commit) throw new Error("Private resource checkout differs from the pinned commit");
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const rows = manifest.schema === 1 && manifest.variants?.[lock.variant];
  if (!Array.isArray(rows) || !rows.length) throw new Error("Pinned resource variant is empty or invalid");
  const receiptPath = resolve(root, ".frontend-images-state.json");
  const previous = await readFile(receiptPath, "utf8").then(JSON.parse).catch(() => ({ files: {} }));
  const next = {}, seen = new Set(), variantRoot = await realpath(resolve(source, lock.variant));
  let cursor = 0;
  const deadline = Date.now() + 600000;
  async function worker() {
    while (cursor < rows.length) {
      if (Date.now() > deadline) throw new Error("Private resource preparation exceeded 600 seconds");
      const row = rows[cursor++], name = resourcePath(row.path);
      if (seen.has(name) || !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0) throw new Error(`Invalid resource entry: ${name}`);
      seen.add(name);
      const input = resolve(variantRoot, name), output = resolve(root, name);
      inside(variantRoot, await realpath(input)); inside(root, output);
      const inputStat = await lstat(input);
      if (!inputStat.isFile() || inputStat.isSymbolicLink() || inputStat.size !== row.bytes || await sha256(input) !== row.sha256) throw new Error(`Private resource integrity failed: ${name}`);
      next[name] = row.sha256;
      if (verifyOnly) continue;
      const existing = await lstat(output).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error(`Resource destination requires review: ${name}`);
      if (existing) inside(root, await realpath(output));
      const actual = existing ? await sha256(output) : null;
      if (actual === row.sha256) continue;
      if (check) throw new Error(`Materialized resource differs from its pin: ${name}`);
      if (actual && actual !== previous.files?.[name]) throw new Error(`Preserve locally changed resource before updating: ${name}`);
      await mkdir(dirname(output), { recursive: true }); inside(root, await realpath(dirname(output)));
      await copyFile(input, output);
      if (await sha256(output) !== row.sha256) throw new Error(`Resource copy verification failed: ${name}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  if (!check && !verifyOnly) {
    for (const [name, digest] of Object.entries(previous.files || {})) {
      resourcePath(name); if (seen.has(name)) continue;
      const output = resolve(root, name); inside(root, output);
      if (await lstat(output).catch(() => null)) {
        inside(root, await realpath(output));
        if (await sha256(output) !== digest) throw new Error(`Preserve locally changed retired resource: ${name}`);
        await unlink(output); // Only previously materialized, unchanged build outputs.
      }
    }
    await writeFile(receiptPath, JSON.stringify({ schema: 1, commit: lock.commit, manifestSha256: lock.manifestSha256, files: Object.fromEntries(Object.entries(next).sort()) }, null, 2) + "\n");
  }
  return { commit: lock.commit, variant: lock.variant, files: rows.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const sourceAt = args.indexOf("--source");
    const result = await prepareFrontendImages({ source: sourceAt < 0 ? undefined : args[sourceAt + 1], check: args.includes("--check"), verifyOnly: args.includes("--verify-only") });
    console.log(`Private frontend resources verified: ${result.variant}, ${result.files} files, ${result.commit}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
