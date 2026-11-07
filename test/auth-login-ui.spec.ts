/** auth-login-ui.spec component/module.
 * Owns the UI behavior implemented in this file; data and side effects remain within its existing boundaries.
 * refs: documents/05-operations/runbooks/frontend-ci-gates.md, paladinscat-public-surface (rule 13)
 */
import { expect, test, type Page } from "@playwright/test";

/**
 * The public surface is the dashboard shell (`/app/index.html`), not the retired Next homepage:
 * its chrome is the left rail, so the sign-in entry point lives in the notifications popover
 * ("Log in to track what you've read.") rather than a header link with a Language button.
 */
async function stubLoginHandoff(page: Page) {
  await page.route("**/api/auth/oidc/login*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>OIDC handoff</title><h1>OIDC handoff reached</h1>",
    });
  });
}

async function openGuestLoginControl(page: Page) {
  await page.goto("/");
  await expect(page.locator(".dashboard-shell")).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).first().click();
  const login = page.getByRole("button", { name: "Log in", exact: true });
  await expect(login).toBeVisible();
  return login;
}

test("desktop shell sign-in control performs a browser-native OIDC handoff", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubLoginHandoff(page);

  const login = await openGuestLoginControl(page);
  await login.click();

  await expect(page).toHaveURL(/\/api\/auth\/oidc\/login(\?return=[^&]+)?$/);
  await expect(page.getByRole("heading", { name: "OIDC handoff reached" })).toBeVisible();
});

test("compact-width shell sign-in control performs a browser-native OIDC handoff", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await stubLoginHandoff(page);

  const login = await openGuestLoginControl(page);
  await login.click();

  await expect(page).toHaveURL(/\/api\/auth\/oidc\/login(\?return=[^&]+)?$/);
  await expect(page.getByRole("heading", { name: "OIDC handoff reached" })).toBeVisible();
});
