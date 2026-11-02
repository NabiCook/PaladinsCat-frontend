/** Server-side champion changelog snapshot reader (canonical slug resolution).
 *
 * refs: none
 */
import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChampionChangelog } from "@/lib/champion-changelog";
import { championSlug } from "@/lib/utils";

type ChampionChangelogMap = Record<string, ChampionChangelog>;

let changelogPromise: Promise<ChampionChangelogMap> | null = null;

/**
 * Read the generated champion-history snapshot and resolve one canonical slug.
 * refs: public/data/champion-changelogs.json
 * I/O types: `name: string -> Promise<ChampionChangelog | undefined>`.
 */
export async function getServerChampionChangelog(name: string): Promise<ChampionChangelog | undefined> {
  const load = () => readFile(path.join(process.cwd(), "public", "data", "champion-changelogs.json"), "utf8")
    .then((content) => JSON.parse(content) as ChampionChangelogMap);
  if (process.env.NODE_ENV === "development") {
    return (await load())[championSlug(name)];
  }
  changelogPromise ??= load();
  return (await changelogPromise)[championSlug(name)];
}
