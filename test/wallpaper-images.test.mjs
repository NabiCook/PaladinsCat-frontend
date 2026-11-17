import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { BUILT_IN_WALLPAPER_INTERVAL_MS, WALLPAPER_TRANSITION_MS, DEFAULT_WALLPAPERS, randomizeWallpaperOrder } from "../lib/wallpaper-images.ts";

const publicRoot = path.resolve(import.meta.dirname, "../public");

test("default wallpaper rotation uses only full-scene wallpaper assets", async () => {
  assert.equal(DEFAULT_WALLPAPERS.length, 10);

  for (const wallpaper of DEFAULT_WALLPAPERS) {
    assert.match(wallpaper.avif, /^\/images\/wallpaper-new\/[A-Za-z_]+\.avif$/);
    assert.match(wallpaper.png, /^\/images\/wallpaper-new\/[A-Za-z_]+\.png$/);
    assert.doesNotMatch(wallpaper.avif, /overhead/i);
    await Promise.all([
      access(path.join(publicRoot, wallpaper.avif)),
      access(path.join(publicRoot, wallpaper.png)),
    ]);
  }
});

test("built-in wallpaper order starts on a randomized wallpaper after hydration", () => {
  const order = randomizeWallpaperOrder(DEFAULT_WALLPAPERS, () => 0);

  assert.notEqual(order[0], DEFAULT_WALLPAPERS[0]);
  assert.deepEqual(
    order.map((wallpaper) => wallpaper.avif).sort(),
    DEFAULT_WALLPAPERS.map((wallpaper) => wallpaper.avif).sort(),
  );
});

test("standalone wallpaper catalog matches its canonical TypeScript owner", async () => {
  const browser = await import("../public/app/discovery-community-art.js");
  const source = (await readFile(new URL("../lib/wallpaper-images.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const generated = await readFile(new URL("../public/app/discovery-community-art.js", import.meta.url), "utf8");
  assert(generated.includes(`// lib/wallpaper-images.ts SHA256 ${createHash("sha256").update(source).digest("hex")}`));
  assert.deepEqual(browser.DEFAULT_WALLPAPERS, DEFAULT_WALLPAPERS);
  assert.equal(browser.BUILT_IN_WALLPAPER_INTERVAL_MS, BUILT_IN_WALLPAPER_INTERVAL_MS);
  assert.equal(browser.WALLPAPER_TRANSITION_MS, WALLPAPER_TRANSITION_MS);
  assert.deepEqual(browser.randomizeWallpaperOrder(browser.DEFAULT_WALLPAPERS, () => 0), randomizeWallpaperOrder(DEFAULT_WALLPAPERS, () => 0));
});
