import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

// Exercise the dependency owners used by Next image optimization and content parsing.
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const matterRequire = createRequire(require.resolve("gray-matter/package.json"));
const sharp = nextRequire("sharp");
const matter = require("gray-matter");
const semver = require("semver");

test("URI, address and glob consumers use compatible patched overrides", () => {
  for (const owner of ["eslint", "@eslint/eslintrc", "@eslint/config-array"]) {
    const consumer = createRequire(require.resolve(owner));
    assert.ok(semver.satisfies(consumer("minimatch/package.json").version, ">=3.1.4 <4"));
    assert.equal(consumer("minimatch")("src/example.ts", "**/*.ts"), true);
    assert.equal(consumer("minimatch")("src/example.js", "**/*.ts"), false);
  }
  assert.equal(require("fast-uri/package.json").version, "3.1.9");
  assert.equal(require("fast-uri").parse("https://example.test/path").host, "example.test");
  assert.ok(semver.gte(require("ip-address/package.json").version, "10.7.4"));
  assert.equal(new (require("ip-address").Address6)("2001:db8::1").correctForm(), "2001:db8::1");
  for (const owner of ["@typescript-eslint/typescript-estree", "@ts-morph/common"]) {
    const consumer = createRequire(require.resolve(owner));
    assert.ok(semver.gte(consumer("minimatch/package.json").version, "11.0.1"));
    assert.equal(consumer("minimatch").minimatch("src/example.ts", "**/*.ts"), true);
  }
});

test("query parser is absent or every installed consumer enforces its comma-array limit", () => {
  // shadcn 4.23 removed the final qs consumer. Verify the locked graph instead
  // of retaining an otherwise unused parser just to satisfy this regression.
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const nodes = Object.keys(lock.packages).filter(path => path.endsWith("/qs"));
  if (!nodes.length) {
    assert.throws(() => require.resolve("qs"), { code: "MODULE_NOT_FOUND" });
    return;
  }
  for (const path of nodes) {
    const owner = createRequire(new URL(`../${path}/package.json`, import.meta.url));
    const qs = owner("./lib/index.js");
    assert.ok(semver.gte(lock.packages[path].version, "6.16.0"));
    assert.throws(() => qs.parse("a[]=1,2,3,4", {
      comma: true, arrayLimit: 3, throwOnLimitExceeded: true,
    }), RangeError);
  }
});

test("runtime dependencies include the advisory fixes", () => {
  assert.ok(semver.gte(require("next/package.json").version, "16.4.1"));
  assert.ok(semver.gte(sharp.versions.sharp, "0.35.5"));
  assert.ok(semver.gte(sharp.versions.heif, "1.23.2"));
  assert.ok(semver.satisfies(matterRequire("js-yaml/package.json").version, ">=3.15.2 <4"));
});

test("build tools resolve patched YAML 4 and reject excessive empty merges", { timeout: 5000 }, () => {
  // shadcn 4.22 no longer uses cosmiconfig; exercise the remaining YAML 4 consumers.
  for (const owner of ["@eslint/eslintrc", "@redocly/openapi-core"]) {
    const ownerRequire = createRequire(require.resolve(owner));
    const yaml = ownerRequire("js-yaml");
    assert.ok(semver.satisfies(ownerRequire("js-yaml/package.json").version, ">=4.3.2 <5"), owner);
    assert.deepEqual(yaml.load("name: check\nenabled: true\n"), { name: "check", enabled: true });
    const small = "arr: &arr [{}, {}, {}, {}]\ntarget:\n  <<: *arr\n";
    assert.throws(() => yaml.load(small, { maxTotalMergeKeys: 3 }), /maxTotalMergeKeys/, owner);
  }
});

test("gray-matter preserves ordinary frontmatter and rejects excessive empty merges", { timeout: 5000 }, () => {
  const ordinary = matter("---\ntitle: Security update\ntags: [news, fixes]\n---\nArticle body");
  assert.deepEqual(ordinary.data, { title: "Security update", tags: ["news", "fixes"] });
  assert.equal(ordinary.content.trim(), "Article body");

  // A tiny explicit budget reproduces GHSA-2883-xcg3-v3hh without a CPU-heavy payload.
  const small = "---\narr: &arr [{}, {}, {}, {}]\ntarget:\n  <<: *arr\n---\nArticle body";
  assert.throws(() => matter(small, { maxTotalMergeKeys: 3 }), /maxTotalMergeKeys/);
});

test("Next optimizes PNG and AVIF with the patched decoder", { timeout: 10000 }, async () => {
  sharp.concurrency(2);
  const source = { create: { width: 8, height: 8, channels: 3, background: "#336699" } };
  const png = await sharp(source).png().toBuffer();
  const avif = await sharp(source).avif().toBuffer();
  const { getSharp, optimizeImage } = nextRequire("next/dist/server/image-optimizer/transform");
  const optimizerSharp = getSharp(2);
  assert.equal(optimizerSharp, sharp);
  const result = await optimizeImage({
    buffer: png, contentType: "image/webp", quality: 75, width: 4,
    concurrency: 2, timeoutInSeconds: 5,
  });
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 4);
  // Next 16.3.4 intentionally restores AVIF after the libheif fix checked above.
  const avifResult = await optimizeImage({
    buffer: avif, contentType: "image/webp", quality: 75, width: 4,
    concurrency: 2, timeoutInSeconds: 5,
  });
  const avifMetadata = await sharp(avifResult).metadata();
  assert.equal(avifMetadata.format, "webp");
  assert.equal(avifMetadata.width, 4);
  assert.equal(avifMetadata.height, 4);
});
