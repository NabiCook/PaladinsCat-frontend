/**
 * One skill, talent, card, or champion-level history grouped across revisions.
 * refs: public/data/champion-changelogs.json
 */

/** One changelog entry: a single skill/talent/card/champion-level change.
 *
 * refs: none
 */
export interface ChampionChangelogEntry {
  name: string;
  iconUrl?: string | null;
  trends: string[];
}

/**
 * One stable changelog category containing all related entities.
 * refs: public/data/champion-changelogs.json
 */
export interface ChampionChangelogCategory {
  name: string;
  entries: ChampionChangelogEntry[];
}

/**
 * Checked-in wiki-derived history for one champion.
 * refs: scripts/update-champion-changelogs.py
 */
export interface ChampionChangelog {
  sourceUrl: string;
  categories: ChampionChangelogCategory[];
}
