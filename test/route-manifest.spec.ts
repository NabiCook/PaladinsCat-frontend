import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";

const fixtures: Record<string, string> = {
  "/blog/[...slug]": "/blog/beyond-int16-match-recovery",
  "/builds/[id]": "/builds/5",
  "/champions/[name]": "/champions/androxus",
  "/champions/[name]/cards/[cardId]": "/champions/androxus/cards/13319",
  "/champions/[name]/talents/[talentId]": "/champions/androxus/talents/16368",
  "/community/[id]": "/community/38",
  "/game/items/[itemId]": "/game/items/11646",
  "/game/maps/[mapName]": "/game/maps/brightmarsh",
  "/matches/[id]": "/matches/1282006358",
  "/operations/tickets/[id]": "/operations/tickets/1",
  "/players/[id]": "/players/2951457",
  "/players/[id]/champions": "/players/2951457/champions",
  "/players/[id]/friends": "/players/2951457/friends",
  "/players/[id]/loadouts": "/players/2951457/loadouts",
  "/players/[id]/loadouts/[championId]": "/players/2951457/loadouts/2205",
  "/players/[id]/loadouts/[championId]/[loadoutId]": "/players/2951457/loadouts/2205/388154",
  "/players/[id]/relationships": "/players/2951457/relationships",
  "/players/afk-wintrade/[id]": "/players/afk-wintrade/736760714",
  "/players/boosted/[id]": "/players/boosted/727899074",
  "/players/cheaters/[id]": "/players/cheaters/727892157",
  "/players/cheaters/evidence/[id]": "/players/cheaters/evidence/1",
  "/players/class/[role]": "/players/class/damage",
  "/players/exploiters/[id]": "/players/exploiters/736565921",
  "/players/parties/[kind]/[key]": "/players/parties/pairs/736531766-736531767",
  "/players/private-tracking/[id]": "/players/private-tracking/1242",
  "/stats/champions/[name]": "/stats/champions/androxus",
  "/stats/items/[itemId]": "/stats/items/11646",
  "/stats/maps/[mapName]": "/stats/maps/brightmarsh",
  "/stats/player/[id]/charts": "/stats/player/2951457/charts",
  "/tierlists/[id]": "/tierlists/28",
  "/tierlists/[id]/edit": "/tierlists/28/edit",
};

function pageRoutes(directory: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nextPrefix = `${prefix}/${entry.name}`;
    const child = path.join(directory, entry.name);
    if (readdirSync(child, { withFileTypes: true }).some((item) => item.isFile() && item.name === "page.tsx")) routes.push(nextPrefix);
    routes.push(...pageRoutes(child, nextPrefix));
  }
  return routes;
}

const templates = ["/", ...pageRoutes(path.join(process.cwd(), "app"))].sort();
expect(templates).toHaveLength(120);

for (const template of templates) {
  const route = fixtures[template] ?? template;
  test(`route ${template}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
    expect(response, `${route} returned no document response`).not.toBeNull();
    expect(response!.status(), `${route} returned ${response!.status()}`).toBeLessThan(500);
    await expect(page.locator("main")).toBeVisible();
    expect(pageErrors, `${route} raised browser errors`).toEqual([]);
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
  });
}
