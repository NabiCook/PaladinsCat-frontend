import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const player = { id: "700033519", name: "Evidence Subject", platform: "PC" };
const linked = { id: "42", username: "Linked Reporter", linked_player_id: player.id,
  invitation_required: false, invitation_active: false };
let browser, server, origin;

before(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const target = path.resolve(root, "." + (path.extname(pathname) ? pathname : "/app/index.html"));
    if (!target.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(target);
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }[path.extname(target)];
      response.writeHead(200, { "Content-Type": mime || "application/octet-stream" }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.DISCOVERY_TEST_BROWSER_CHANNEL, executablePath: process.env.DISCOVERY_TEST_BROWSER_EXECUTABLE });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function fixture(t, { user = linked, route = `/evidence/submit?playerId=${player.id}`, holdAuth = false, pendingLink = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
  t.after(() => context.close());
  const page = await context.newPage(), writes = [];
  page.setDefaultTimeout(5_000);
  let releaseAuth;
  const authReady = new Promise(resolve => { releaseAuth = resolve; });
  if (!holdAuth) releaseAuth();
  t.after(releaseAuth);
  let invitation = { required: false, active: false, status: "none", expires_at: null };
  await page.route("**/*", async intercepted => {
    const request = intercepted.request(), url = new URL(request.url());
    if (url.origin !== origin) return intercepted.abort();
    if (!url.pathname.startsWith("/api/")) return intercepted.continue();
    const endpoint = url.pathname.replace(/^\/api(?:\/v1)?/, "");
    if (endpoint === "/auth/me") {
      await authReady;
      return intercepted.fulfill(user ? { json: user } : { status: 401, json: { error: { code: "LOGIN_REQUIRED" } } });
    }
    if (request.method() !== "GET") writes.push({ endpoint, method: request.method(), body: request.postData() });
    if (endpoint === "/players/search") return intercepted.fulfill({ json: [player] });
    if (endpoint === "/cheaters/evidence" && request.method() === "POST") return intercepted.fulfill({ status: 201, json: { id: "123", message: "Evidence submitted." } });
    if (endpoint === "/auth/account") return intercepted.fulfill({ json: { user: { ...user, bio: "Original biography" }, linkedPlayer: null } });
    if (endpoint === "/auth/profile") return intercepted.fulfill({ json: { ...user, ...request.postDataJSON() } });
    if (endpoint === "/auth/account/player-link/verification") return intercepted.fulfill({ json: { verification: pendingLink ? { player, code: "123456", expiresAt: "2099-01-01T00:00:00Z" } : null } });
    if (endpoint === "/auth/account/player-link/verification/check") {
      user = { ...user, linked_player_id: player.id };
      return intercepted.fulfill({ json: { message: "Linked", player } });
    }
    if (endpoint === "/auth/account/invitation") {
      if (request.method() === "POST") invitation = { ...invitation, active: true, status: "active" };
      return intercepted.fulfill({ json: invitation });
    }
    if (endpoint === "/auth/account/maintenance-consent") return intercepted.fulfill({ json: { decision: "declined", policy_version: "maintenance-presence-2026-09-16-v3" } });
    return intercepted.fulfill({ status: 404, json: { error: { code: "FIXTURE_NOT_FOUND" } } });
  });
  await page.goto(origin + route, { waitUntil: "domcontentloaded" });
  return { page, writes, releaseAuth };
}

for (const [name, user] of [
  ["optional invitations", linked],
  ["an active required invitation", { ...linked, invitation_required: true, invitation_active: true }],
  ["camelCase session fields", { id: "42", username: "Linked Reporter", linkedPlayerId: player.id, invitationRequired: false, invitationActive: false }],
]) {
  test(`linked users can submit evidence with ${name}`, { timeout: 30_000 }, async t => {
    const { page, writes } = await fixture(t, { user });
    const form = page.locator(".players-evidence-form");
    await expect(form).toBeVisible();
    await expect(form.locator('input').first()).toHaveValue(player.name);
    await expect(page.locator("main:visible .players-note")).toHaveCount(0);
    await form.locator("textarea").fill("A recorded fixture report for review.");
    await form.locator('input[type="url"]').fill("https://example.com/evidence-video");
    await form.getByRole("button", { name: /submit for review/i }).click();
    await expect(form.getByRole("status")).toContainText("Evidence was submitted for review.");
    const submitted = writes.filter(row => row.endpoint === "/cheaters/evidence");
    assert.equal(submitted.length, 1);
    assert.match(submitted[0].body, new RegExp(player.id));
    assert.match(submitted[0].body, /A recorded fixture report for review/);
  });
}

test("unlinked users receive the player-link action", { timeout: 30_000 }, async t => {
  const { page, writes } = await fixture(t, { user: { ...linked, linked_player_id: null } });
  const main = page.locator("main.players-view:visible");
  await expect(main.locator('a[href="/link-account"]')).toBeVisible();
  await expect(main.locator(".players-evidence-form")).toHaveCount(0);
  assert.equal(writes.length, 0);
});

test("linked users who need an invitation receive Settings invitation guidance", { timeout: 30_000 }, async t => {
  const { page } = await fixture(t, { user: { ...linked, invitation_required: true } });
  const main = page.locator("main.players-view:visible");
  await expect(main.locator('a[href="/settings#invitation"]')).toBeVisible();
  await expect(main.locator('a[href="/link-account"]')).toHaveCount(0);
  await expect(main.locator(".players-evidence-form")).toHaveCount(0);
});

test("a pending session avoids premature linking guidance and then opens the form", { timeout: 30_000 }, async t => {
  const { page, releaseAuth } = await fixture(t, { holdAuth: true });
  await expect(page.locator("#players-evidence-submit-page")).toBeVisible();
  await expect(page.locator("main:visible .players-note")).toHaveCount(0);
  await expect(page.locator(".players-evidence-form")).toHaveCount(0);
  releaseAuth();
  await expect(page.locator(".players-evidence-form")).toBeVisible();
});

test("guest evidence submission preserves the sign-in return path", { timeout: 30_000 }, async t => {
  const route = `/evidence/submit?playerId=${player.id}`;
  const { page } = await fixture(t, { user: null, route });
  await expect(page.locator(`main.players-view:visible a[href="/auth/login?redirect=${encodeURIComponent(route)}"]`)).toBeVisible();
  await expect(page.locator(".players-evidence-form")).toHaveCount(0);
});

test("legacy account deep links open Settings with working profile and invitation controls", { timeout: 30_000 }, async t => {
  const { page, writes } = await fixture(t, { route: "/account?source=legacy#invitation" });
  await expect(page).toHaveURL(origin + "/settings?source=legacy#invitation");
  const settings = page.locator("#site-settings-page");
  await expect(settings.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(settings.locator("#invitation")).toBeVisible();
  await expect(settings.locator("#maintenance-privacy")).toBeVisible();
  await expect(settings.locator('a[href="https://auth.paladinscat.com/realms/paladinscat/account/"]')).toBeVisible();
  await expect(page.locator('[id^="site-account"]')).toHaveCount(0);
  const biography = settings.locator(".site-settings-account textarea");
  await expect(biography).toHaveValue("Original biography");
  await biography.fill("Updated through canonical Settings.");
  await settings.getByRole("button", { name: /save profile/i }).click();
  await expect(settings).toContainText("Profile updated");
  assert.deepEqual(JSON.parse(writes.find(row => row.endpoint === "/auth/profile").body), { bio: "Updated through canonical Settings." });
  await settings.locator("#invitation input").fill("fixture-invitation");
  await settings.locator("#invitation").getByRole("button", { name: /activate invitation/i }).click();
  await expect(settings.locator("#invitation")).toContainText("Active");
  assert.deepEqual(JSON.parse(writes.find(row => row.endpoint === "/auth/account/invitation").body), { code: "fixture-invitation" });
});

test("guest account aliases retain the public Settings preferences", { timeout: 30_000 }, async t => {
  const { page } = await fixture(t, { user: null, route: "/account" });
  await expect(page).toHaveURL(origin + "/settings");
  await expect(page.locator("#site-settings-page").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.locator(".site-setting-row").first()).toBeVisible();
  await expect(page.locator(".site-settings-account textarea")).toHaveCount(0);
  await expect(page.locator('#site-settings-page a[href="https://auth.paladinscat.com/realms/paladinscat/account/"]')).toHaveCount(0);
});

test("account aliases publish their query and anchor while Settings is already open", { timeout: 30_000 }, async t => {
  const { page } = await fixture(t, { route: "/settings" });
  await expect(page.locator("#site-settings-page #invitation")).toBeVisible();
  await page.evaluate(() => window.DiscoveryApp.navigate("/account?source=inline#invitation"));
  await expect(page).toHaveURL(origin + "/settings?source=inline#invitation");
  await expect(page.locator("#site-settings-page #invitation")).toBeVisible();
  await expect(page.locator('[id^="site-account"]')).toHaveCount(0);
});

test("successful player linking returns to Settings without recreating the account page", { timeout: 30_000 }, async t => {
  const { page, writes } = await fixture(t, { route: "/link-account", user: { ...linked, linked_player_id: null }, pendingLink: true });
  await page.locator("main:visible").getByRole("button", { name: /verify & link/i }).click();
  await expect(page).toHaveURL(origin + "/settings");
  await expect(page.locator("#site-settings-page .site-settings-account textarea")).toBeVisible();
  assert.equal(writes.filter(row => row.endpoint === "/auth/account/player-link/verification/check").length, 1);
  await expect(page.locator('[id^="site-account"]')).toHaveCount(0);
});
