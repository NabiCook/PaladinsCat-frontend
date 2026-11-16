/** Real Postscribe lifecycle regression; provider responses are intercepted. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";

const writerUrl = "https://cdnjs.cloudflare.com/ajax/libs/postscribe/2.0.8/postscribe.min.js";
const writer = process.env.POSTSCRIBE_PATH
  ? await readFile(process.env.POSTSCRIBE_PATH)
  : await (async () => {
      const response = await fetch(writerUrl, { signal: AbortSignal.timeout(15000) });
      assert(response.ok, `Writer download returned ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    })();
assert.equal(createHash("sha384").update(writer).digest("base64"),
  "pojMXilfEgorjtWzSw/Vs8lxOfhlNdEEZDHGECbzEHXolojlD+1JRKLpNSuGMW4C");
const script = await readFile(new URL("../public/app/discovery-ads.js", import.meta.url));
const css = await readFile(new URL("../public/app/discovery-ads.css", import.meta.url));
const desktop = "c6db89b56177a18b90f50d44f08a4010";
const mobile = "5c8b4ed95610f942e89896985dea3fdf";
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://fixture").pathname;
  if (path === "/ads.js" || path === "/ads.css") {
    response.setHeader("content-type", path.endsWith(".js") ? "application/javascript" : "text/css");
    return response.end(path.endsWith(".js") ? script : css);
  }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><html><head><link rel="stylesheet" href="/ads.css">
    <style>html{--pc-page-max-width:1120px}body{margin:0}.workspace{width:100%}</style>
    </head><body><div class="dashboard-shell" data-view="search"><main class="workspace">
    <h1>Ad lifecycle fixture</h1></main></div><script src="/ads.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
const deadline = setTimeout(() => { void browser?.close(); server.closeAllConnections(); }, 160000);
try {
  browser = await chromium.launch({ headless: true,
    ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  for (const mode of ["delayed", "delayed-resize", "late-frame", "http403", "empty", "resize", "timeout", "writer-failure"]) {
    const context = await browser.newContext({ viewport: { width: 1074, height: 1000 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(23000);
      const errors = [];
      let held = false, release;
      page.on("pageerror", error => errors.push(error.message));
      await context.addInitScript(() => {
        window.fixtureOriginalWrite = document.write;
        window.fixtureWriterDone = {};
        window.fixtureCallbacks = [];
      });
      await context.route(writerUrl, route => mode === "writer-failure" ? route.abort()
        : route.fulfill({ contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: writer }));
      await context.route("https://bauval.org/**", async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith("/22/"))
          return route.fulfill({ contentType: "text/html", body: "<!doctype html><body>Creative fixture" });
        const key = url.pathname.split("/").pop();
        if (key === desktop) {
          if (mode === "http403") return route.fulfill({ status: 403, body: "" });
          if (mode === "empty") return route.fulfill({ contentType: "application/javascript", body: "" });
          if (mode === "resize" || mode === "timeout") {
            held = true;
            await new Promise(resolve => { release = resolve; });
          }
        }
        const delay = key === desktop ? (mode === "delayed-resize" ? 1200 : mode === "late-frame" ? 16500 : 450) : 150;
        const body = `(()=>{const target=document.currentScript.parentNode,
          key=atOptions.key,width=atOptions.width,height=atOptions.height;
          window.fixtureWriterDone[key]=true;setTimeout(()=>{
            const frame=document.createElement('iframe');frame.width=width;frame.height=height;
            frame.dataset.fixtureKey=key;frame.src='https://bauval.org/creative/fixture';
            target.append(frame);window.fixtureCallbacks.push({key,connected:target.isConnected});
          },${delay});})();`;
        await route.fulfill({ contentType: "application/javascript", body }).catch(() => {});
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
      const state = () => page.evaluate(() => window.DiscoveryAds.snapshot().find(slot => slot.placement === "bottom"));
      const mobileLoaded = () => page.waitForFunction(() => window.DiscoveryAds.snapshot().some(slot => slot.placement === "bottom" && slot.state === "loaded" && slot.width === 320));
      if (["delayed", "delayed-resize", "late-frame"].includes(mode)) {
        await page.waitForFunction(key => window.fixtureWriterDone[key], desktop);
        await page.waitForTimeout(90);
        assert.equal((await state()).state, "loading", "Completed loader must keep waiting for its asynchronous frame");
        if (mode === "delayed-resize") {
          await page.setViewportSize({ width: 390, height: 844 });
          await mobileLoaded();
          await page.waitForTimeout(1400);
          assert.equal(await page.locator('[data-ad-placement="bottom"] iframe').getAttribute("data-fixture-key"), mobile);
          assert(await page.evaluate(key => window.fixtureCallbacks.some(row => row.key === key && !row.connected), desktop));
        } else if (mode === "late-frame") {
          await page.waitForFunction(() => window.DiscoveryAds.snapshot().find(slot => slot.placement === "bottom").state === "error");
          await page.waitForTimeout(2000);
          assert.equal((await state()).state, "error");
          assert.equal(await page.locator('[data-ad-placement="bottom"] iframe').count(), 0);
          assert(await page.evaluate(key => window.fixtureCallbacks.some(row => row.key === key && !row.connected), desktop));
        } else {
          await page.waitForFunction(() => window.DiscoveryAds.snapshot().find(slot => slot.placement === "bottom").state === "loaded");
        }
      } else if (mode === "resize" || mode === "timeout") {
        await expect.poll(() => held, { timeout: 10000 }).toBe(true);
        if (mode === "resize") await page.setViewportSize({ width: 390, height: 844 });
        else await page.waitForFunction(() => window.DiscoveryAds.snapshot().find(slot => slot.placement === "bottom").state === "error");
        release();
        await page.waitForFunction(() => document.write === window.fixtureOriginalWrite);
        if (mode === "timeout") await page.setViewportSize({ width: 390, height: 844 });
        await mobileLoaded();
      } else {
        await page.waitForFunction(() => window.DiscoveryAds.snapshot().find(slot => slot.placement === "bottom").state === "error");
        assert.equal(await page.locator('[data-ad-placement="bottom"] iframe').count(), 0);
      }
      if ((await state()).state === "loaded") assert.equal(await page.locator('[data-ad-placement="bottom"] iframe').count(), 1);
      await page.waitForFunction(() => document.write === window.fixtureOriginalWrite);
      assert.deepEqual(errors, []);
      assert.equal(await page.locator("h1").textContent(), "Ad lifecycle fixture");
      console.log(`PASS ${mode}`);
    } finally { await context.close(); }
  }
} finally {
  clearTimeout(deadline);
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
