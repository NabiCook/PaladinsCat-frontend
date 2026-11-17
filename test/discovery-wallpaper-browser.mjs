/** Exercise the actual wallpaper adapter/model with controlled image responses. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

const source = await readFile(new URL("../public/app/discovery-wallpaper.js", import.meta.url));
const model = await readFile(new URL("../public/app/discovery-community-art.js", import.meta.url));
const stylesheet = await readFile(new URL("../public/app/discovery-dashboard.css", import.meta.url), "utf8");
const layerStyles = stylesheet.split("\n").filter(line => /pc-wallpaper-layer|pc-wallpaper-rotating/.test(line)).join("\n");
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#318582"/></svg>';
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://fixture").pathname;
  if (path.endsWith(".js")) {
    response.setHeader("content-type", "application/javascript");
    return response.end(path.includes("community-art") ? model : source);
  }
  if (path.startsWith("/images/")) { response.setHeader("content-type", "image/svg+xml"); return response.end(image); }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><style>body{background-image:linear-gradient(#101216aa,#101216aa),url('/images/wallpaper-new/Brightmarsh_Loading.avif')}${layerStyles}</style><body><h1>Wallpaper fixture</h1><script src="/app/discovery-wallpaper.js"></script></body>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
const deadline = setTimeout(() => { process.exitCode = 1; void browser?.close(); server.closeAllConnections(); server.close(); }, 120000);
try {
  browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  let failedCustom = 0;
  await context.route("**/images/wallpaper-new/*", async route => {
    await route.fulfill({ contentType: "image/svg+xml", body: image });
  });
  await context.route("https://wallpaper.test/**", route => {
    if (route.request().url().includes("bad")) { failedCustom++; return route.fulfill({ status: 404 }); }
    return route.fulfill({ contentType: "image/svg+xml", body: image });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  const current = () => page.locator(".pc-wallpaper-layer").last().getAttribute("data-wallpaper-source");
  await page.waitForFunction(() => document.querySelector(".pc-wallpaper-layer"));
  const first = await current();
  assert(!first.includes("Brightmarsh_Loading"));
  const seen = new Set([first]);
  for (let i = 0; i < 10; i++) {
    const before = await current();
    await page.clock.fastForward(3600000);
    await page.waitForFunction(previous => [...document.querySelectorAll(".pc-wallpaper-layer")].at(-1)?.dataset.wallpaperSource !== previous, before);
    assert.equal(await page.locator(".pc-wallpaper-layer").count(), 2);
    assert.equal(await page.locator(".pc-wallpaper-layer").last().evaluate(el => getComputedStyle(el).transitionDuration), "2.1s");
    seen.add(await current());
    await page.clock.runFor(2200);
    assert.equal(await page.locator(".pc-wallpaper-layer").count(), 1);
  }
  assert.equal(seen.size, 10);
  console.log("PASS all ten hourly scenes and crossfade cleanup");

  const beforeHidden = await current();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(7200000);
  assert.equal(await current(), beforeHidden);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(100);
  await page.clock.fastForward(3600000);
  await page.waitForFunction(previous => [...document.querySelectorAll(".pc-wallpaper-layer")].at(-1)?.dataset.wallpaperSource !== previous, beforeHidden);
  console.log("PASS hidden pause and visible resume");

  const fallbackContext = await browser.newContext();
  await fallbackContext.route("**/images/wallpaper-new/*", route => route.fulfill(new URL(route.request().url()).pathname.endsWith(".avif") ? { status: 404 } : { contentType: "image/svg+xml", body: image }));
  const fallbackPage = await fallbackContext.newPage(); await fallbackPage.goto(url);
  await fallbackPage.waitForFunction(() => [...document.querySelectorAll(".pc-wallpaper-layer")].at(-1)?.dataset.wallpaperSource.endsWith(".png"));
  await fallbackContext.close();
  console.log("PASS failed AVIF retries PNG");

  const hiddenContext = await browser.newContext(), held = [], hiddenRequests = [];
  let preloadStarted;
  const preload = new Promise(resolve => { preloadStarted = resolve; });
  await hiddenContext.route("**/images/wallpaper-new/*", async route => {
    hiddenRequests.push(route.request().url());
    await new Promise(resolve => { held.push(resolve); if (!route.request().url().includes("Brightmarsh_Loading")) preloadStarted(); });
    await route.fulfill({ status: 404 });
  });
  const hiddenPage = await hiddenContext.newPage();
  await hiddenPage.goto(url, { waitUntil: "domcontentloaded" });
  await preload;
  await hiddenPage.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  const requestsBeforeFailure = hiddenRequests.length;
  held.forEach(resolve => resolve());
  await hiddenPage.waitForTimeout(150);
  assert.equal(hiddenRequests.length, requestsBeforeFailure);
  assert.equal(await hiddenPage.locator(".pc-wallpaper-layer").count(), 0);
  await hiddenContext.close();
  console.log("PASS hidden mid-preload failure cancels fallback requests");

  await page.evaluate(async () => { await window.DiscoveryWallpaper.setCustomWallpaperUrl("https://wallpaper.test/a.png"); });
  await page.waitForFunction(() => [...document.querySelectorAll(".pc-wallpaper-layer")].at(-1)?.dataset.wallpaperSource === "https://wallpaper.test/a.png");
  await page.evaluate(async () => { await window.DiscoveryWallpaper.addCustomWallpaperUrl("https://wallpaper.test/b.png"); });
  await page.clock.fastForward(10000);
  await page.waitForFunction(() => [...document.querySelectorAll(".pc-wallpaper-layer")].at(-1)?.dataset.wallpaperSource === "https://wallpaper.test/b.png");
  console.log("PASS custom priority and ten-second custom interval");
  const valid = await current();
  await page.evaluate(() => window.DiscoveryWallpaper.setCustomWallpaperUrl("https://wallpaper.test/bad.png"));
  await page.waitForFunction(() => window.DiscoveryWallpaper.getCustomWallpapers()[0]?.source.includes("bad"));
  await page.waitForTimeout(100);
  assert.equal(await current(), valid); assert(failedCustom > 0);
  console.log("PASS failed custom image retains valid background");

  await page.evaluate(async () => {
    window.revokedWallpapers = [];
    const revoke = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = source => { window.revokedWallpapers.push(source); revoke(source); };
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 2;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    await window.DiscoveryWallpaper.setCustomWallpaperFile(new File([blob], "wallpaper.png", { type: "image/png" }));
  });
  await page.waitForFunction(() => [...document.querySelectorAll(".pc-wallpaper-layer")].at(-1)?.dataset.wallpaperSource.startsWith("blob:"));
  const upload = await current();
  await page.clock.runFor(2200);
  await page.evaluate(() => window.DiscoveryWallpaper.clearCustomWallpaper());
  await page.waitForFunction(() => [...document.querySelectorAll(".pc-wallpaper-layer")].at(-1)?.dataset.wallpaperSource.startsWith("/images/"));
  assert.equal(await page.evaluate(source => window.revokedWallpapers.includes(source), upload), false);
  await page.clock.runFor(2200);
  assert.equal(await page.evaluate(source => window.revokedWallpapers.filter(value => value === source).length, upload), 1);
  console.log("PASS outgoing upload revoked only after fade");

  await page.evaluate(() => window.DiscoveryWallpaper.setWallpaperEnabled(false));
  await page.waitForFunction(() => document.querySelectorAll(".pc-wallpaper-layer").length === 0);
  const pendingContext = await browser.newContext();
  let release;
  const started = new Promise(resolve => {
    void pendingContext.route("**/images/wallpaper-new/*", async route => {
      await new Promise(unblock => { release = unblock; resolve(); });
      await route.fulfill({ contentType: "image/svg+xml", body: image });
    });
  });
  const pendingPage = await pendingContext.newPage();
  await pendingPage.goto(url, { waitUntil: "domcontentloaded" });
  await pendingPage.waitForFunction(() => window.DiscoveryWallpaper);
  await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(Error("Preload did not start")), 5000))]);
  await pendingPage.evaluate(() => window.DiscoveryWallpaper.setWallpaperEnabled(false));
  release();
  await pendingPage.waitForTimeout(100);
  assert.equal(await pendingPage.locator(".pc-wallpaper-layer").count(), 0);
  await pendingContext.close();
  console.log("PASS disabling during preload rejects stale completion");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.DiscoveryWallpaper.setWallpaperEnabled(true));
  await page.waitForFunction(() => document.querySelector(".pc-wallpaper-layer"));
  await page.clock.fastForward(3600000);
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".pc-wallpaper-layer").count(), 1);
  assert.deepEqual(errors, []);
  console.log("PASS reduced motion and zero JS errors");
  await context.close();
} finally {
  clearTimeout(deadline); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
