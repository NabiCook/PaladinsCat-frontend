import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const playerId = "700033519";
const ordinaryMatch = { match_id: 1234567890, champion_name: "Androxus", talent_name: "Ordinary talent selection" };
const player = { id: playerId, name: "Evidence Subject", platform: "PC", exploiter: true };
const published = [
  { id: 1, origin: "player_submitted", title: "Published report", description: "Recorded evidence", matchId: 987654321, createdAt: "2026-01-01T12:00:00Z" },
  { id: 2, origin: "automated", title: "System evidence", description: "Confirmed signal", matchId: 987654322 },
  { id: 3, origin: "unknown", title: "Internal unknown record" },
  { id: 4, title: "Unclassified record" },
];
let browser, server, origin;

before(async () => {
  // Serve the committed SPA directly: these checks exercise its real router,
  // renderer and CSS without depending on Next's unrelated API/auth proxy.
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = path.extname(pathname) ? pathname : "/app/index.html";
    const target = path.resolve(root, "." + relative);
    if (!target.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(target);
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }[path.extname(target)];
      response.writeHead(200, { "Content-Type": mime || "application/octet-stream" }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.DISCOVERY_TEST_BROWSER_CHANNEL });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function subject(t, payload, { fallback = false, width = 1440, route = `/evidence/${playerId}` } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route("**/*", async intercepted => {
    const url = new URL(intercepted.request().url());
    if (url.origin !== origin) return intercepted.abort();
    if (!url.pathname.startsWith("/api/")) return intercepted.continue();
    const endpoint = url.pathname.replace(/^\/api(?:\/v1)?/, "");
    if (endpoint === `/players/exploiters/${playerId}`) {
      return intercepted.fulfill({ status: fallback ? 404 : 200, json: fallback ? {} : payload });
    }
    if (endpoint === `/cheaters/${playerId}`) return intercepted.fulfill({ json: payload });
    if (endpoint === `/players/${playerId}`) return intercepted.fulfill({ json: { player, queueRatings: [], championRatings: [] } });
    return intercepted.fulfill({ status: 404, json: { error: { code: "FIXTURE_NOT_FOUND" } } });
  });
  await page.goto(origin + route, { waitUntil: "domcontentloaded" });
  const main = page.locator("main.players-view:visible");
  await expect(main.locator(".players-body")).toHaveAttribute("aria-busy", "false");
  return { page, main };
}

test("evidence subject excludes general history and keeps published evidence and match links", { timeout: 30_000 }, async t => {
  const { page, main } = await subject(t, { player, matches: [ordinaryMatch], flagEvidence: published,
    cosmeticEvidence: [{ kind: "impossible_frame", name: "Impossible frame evidence", reason: "Verified cosmetic observation" }],
    flags: [{ voteType: "exploiter", reason: "Confirmed moderation reason" }] });
  await expect(main.getByRole("link", { name: "Published report", exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { name: "System evidence", exact: true })).toBeVisible();
  await expect(main.getByText("Impossible frame evidence", { exact: true })).toBeVisible();
  await expect(main.getByText("Confirmed moderation reason", { exact: true })).toBeVisible();
  await expect(main.locator('a[href="/matches/987654321"]')).toBeVisible();
  await expect(main.locator('a[href="/matches/987654322"]')).toBeVisible();
  await expect(main.locator('a[href="/matches/1234567890"]')).toHaveCount(0);
  await expect(main.getByText("Ordinary talent selection", { exact: true })).toHaveCount(0);
  await expect(main.getByText("Internal unknown record", { exact: true })).toHaveCount(0);
  await expect(main.getByText("Unclassified record", { exact: true })).toHaveCount(0);

  const title = main.locator("h1"), profileLink = title.getByRole("link", { name: player.name, exact: true });
  await expect(profileLink).toHaveAttribute("href", `/players/${playerId}`);
  const submit = main.locator("header .players-evidence-submit");
  await expect(submit).toHaveAttribute("href", `/evidence/submit?playerId=${playerId}`);
  const titleBox = await title.boundingBox(), submitBox = await submit.boundingBox();
  assert.ok(submitBox.x >= titleBox.x + titleBox.width, "submit is to the right of the title");
  assert.ok(submitBox.y < titleBox.y + titleBox.height, "submit shares the title row on desktop");
  for (const nameLink of await main.getByRole("link", { name: player.name, exact: true }).all()) {
    await expect(nameLink).toHaveAttribute("href", `/players/${playerId}`);
  }
  await profileLink.click();
  await expect(page).toHaveURL(origin + `/players/${playerId}`);
  await expect(page.locator("main:visible h1")).toContainText(player.name);
});

test("history alone yields an empty evidence view and a right-aligned mobile action", { timeout: 30_000 }, async t => {
  const { page, main } = await subject(t, { player: { ...player, name: "A very long evidence subject name that wraps on mobile" },
    matches: [ordinaryMatch], supportingMatches: [ordinaryMatch], flagEvidence: published.slice(2) }, { width: 390 });
  await expect(main.getByText("No evidence reports are available.", { exact: true })).toBeVisible();
  await expect(main.getByRole("table")).toHaveCount(0);
  await expect(main.locator('a[href^="/matches/"]')).toHaveCount(0);
  const header = await main.locator("header").boundingBox(), submit = await main.locator(".players-evidence-submit").boundingBox();
  assert.ok(Math.abs(submit.x + submit.width - header.x - header.width) <= 1, "mobile submit aligns to the header's right edge");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test("cheater fallback keeps evidence links without expanding supporting match history", { timeout: 30_000 }, async t => {
  const { main } = await subject(t, { player, evidence: published, supportingMatches: [ordinaryMatch] }, { fallback: true });
  await expect(main.getByRole("link", { name: "Published report", exact: true })).toBeVisible();
  await expect(main.locator('a[href="/matches/987654321"]')).toBeVisible();
  await expect(main.locator('a[href="/matches/1234567890"]')).toHaveCount(0);
  await expect(main.getByRole("table")).toHaveCount(0);
  await expect(main.getByText("Internal unknown record", { exact: true })).toHaveCount(0);
});

for (const kind of ["exploiters", "cheaters"]) {
  test(`${kind} alias uses the same evidence-only renderer`, { timeout: 30_000 }, async t => {
    const { main } = await subject(t, { player, matches: [ordinaryMatch], flagEvidence: published }, { route: `/players/${kind}/${playerId}` });
    await expect(main.locator("h1 a")).toHaveAttribute("href", `/players/${playerId}`);
    await expect(main.locator("header .players-evidence-submit")).toBeVisible();
    await expect(main.getByRole("link", { name: "Published report", exact: true })).toBeVisible();
    await expect(main.locator('a[href="/matches/1234567890"]')).toHaveCount(0);
  });
}
