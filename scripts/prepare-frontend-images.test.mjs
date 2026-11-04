/** Verify pin integrity, path confinement and preservation of owner edits. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareFrontendImages, resourcePath } from "./prepare-frontend-images.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
async function fixture(context) {
  const boundary = process.env.PALADINSCAT_TEST_ROOT || tmpdir();
  await mkdir(boundary, { recursive: true });
  const directory = await mkdtemp(join(boundary, "frontend-images-"));
  context.after(() => rm(directory, { recursive: true, force: true })); // Agent-created fixture only.
  const root = join(directory, "code"), source = join(directory, "resources");
  await mkdir(root); await mkdir(join(source, "frontend/public/images"), { recursive: true });
  await writeFile(join(source, "frontend/public/images/sample.avif"), "preferred bytes");
  await writeFile(join(source, "frontend/public/images/sample.webp"), "original bytes");
  const rows = [{ path: "public/images/sample.avif", sha256: digest("preferred bytes"), bytes: 15 }, { path: "public/images/sample.webp", sha256: digest("original bytes"), bytes: 14 }];
  const manifest = JSON.stringify({ schema: 1, variants: { frontend: rows } });
  await writeFile(join(source, "manifest.json"), manifest);
  await writeFile(join(root, "frontend-images.lock.json"), JSON.stringify({ schema: 1, repository: "NabiCook/paladinscat-frontend-images", commit: "a".repeat(40), manifestSha256: digest(manifest), variant: "frontend" }));
  return { root, source };
}
test("materializes the pinned preferred and original bytes without changing paths", async context => {
  const options = await fixture(context), result = await prepareFrontendImages(options);
  assert.equal(result.files, 2);
  assert.equal(await readFile(join(options.root, "public/images/sample.webp"), "utf8"), "original bytes");
  await prepareFrontendImages({ ...options, check: true });
});
test("rejects changed private inputs and manifest bytes", async context => {
  const options = await fixture(context);
  await writeFile(join(options.source, "frontend/public/images/sample.webp"), "tampered bytes");
  await assert.rejects(prepareFrontendImages(options), /integrity failed/);
  await writeFile(join(options.source, "manifest.json"), "{}");
  await assert.rejects(prepareFrontendImages(options), /pinned digest/);
});
test("preserves locally modified materialized artwork", async context => {
  const options = await fixture(context); await prepareFrontendImages(options);
  const output = join(options.root, "public/images/sample.webp");
  await writeFile(output, "owner edit");
  await assert.rejects(prepareFrontendImages(options), /Preserve locally changed resource/);
  assert.equal(await readFile(output, "utf8"), "owner edit");
});
test("rejects traversal, Windows streams and application-code paths", () => {
  for (const name of ["../image.png", "/image.png", "public/../image.png", "public\\image.png", "C:sample.png", "public/image.png:stream", "app/page.tsx", "public/images/code.js", "local/image.png"]) {
    assert.throws(() => resourcePath(name), /Unsafe resource|application code/);
  }
});
