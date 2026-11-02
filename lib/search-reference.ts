/** Shared bundled catalog fallback for universal search.
 *
 * refs: none
 */
import { fetchReferenceChampions, type UniversalSearchResult } from "@/lib/api-client";
import { normalize } from "@/lib/search-state";

type StaticReferenceRow = {
  id: number;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  championId?: number | null;
  championName?: string | null;
  itemType?: string | null;
};

type StaticReferenceIndex = {
  items: StaticReferenceRow[];
  cards: StaticReferenceRow[];
  talents: StaticReferenceRow[];
  championNames: Map<number, string>;
};

let staticReferencePromise: Promise<StaticReferenceIndex> | null = null;

function slug(name: string | null | undefined) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rankStaticName(name: string, q: string, base: number) {
  const n = normalize(name);
  const query = normalize(q);
  if (n === query) return base + 30;
  if (n.startsWith(query)) return base + 18;
  if (n.includes(query)) return base + 8;
  return base;
}

function uniqueByName(rows: StaticReferenceRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${normalize(row.name)}:${row.championId ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Load (and memoize) the bundled static search reference index.
 *
 * I/O: in () -> out Promise<StaticReferenceIndex>
 *
 * refs: none
 */
export async function loadStaticReferenceIndex(): Promise<StaticReferenceIndex> {
  if (!staticReferencePromise) {
    staticReferencePromise = Promise.all([
      fetch("/data/paladins-items-reference.json").then((res) => res.ok ? res.json() : []),
      fetch("/data/paladins-card-reference.json").then((res) => res.ok ? res.json() : []),
      fetch("/data/paladins-talent-reference.json").then((res) => res.ok ? res.json() : []),
      fetchReferenceChampions().catch(() => []),
    ]).then(([items, cards, talents, champions]) => {
      const championNames = new Map<number, string>(
        champions.map((champion) => [Number(champion.id), champion.name])
      );
      return {
        // The item reference file also carries champion cards/talents from the
        // Hi-Rez item endpoint. Universal item search should keep the vendor
        // item lane focused on buyable match items; card/talent lanes below use
        // their dedicated local reference files.
        items: uniqueByName((items as StaticReferenceRow[]).filter((item) => Number(item.championId ?? 0) === 0)),
        cards: uniqueByName(cards as StaticReferenceRow[]),
        talents: uniqueByName(talents as StaticReferenceRow[]),
        championNames,
      };
    });
  }
  return staticReferencePromise;
}

/** Rank a query against the static reference index into universal search results.
 *
 * I/O: in (q: string, index: StaticReferenceIndex) -> out UniversalSearchResult[]
 *
 * refs: none
 */
export function staticReferenceResults(q: string, index: StaticReferenceIndex): UniversalSearchResult[] {
  const query = normalize(q);
  if (query.length < 2) return [];

  const matches = (row: StaticReferenceRow) => normalize(row.name).includes(query);
  const championName = (row: StaticReferenceRow) => row.championName || index.championNames.get(Number(row.championId ?? 0)) || null;

  const itemResults: UniversalSearchResult[] = index.items
    .filter(matches)
    .slice(0, 8)
    .map((row) => ({
      type: "item",
      id: String(row.id),
      title: row.name,
      subtitle: row.itemType || "Item",
      href: `/game/items/${row.id}`,
      score: rankStaticName(row.name, q, 74),
      meta: { itemType: row.itemType },
    }));

  const cardResults: UniversalSearchResult[] = index.cards
    .filter(matches)
    .slice(0, 10)
    .map((row) => {
      const champ = championName(row);
      return {
        type: "card",
        id: String(row.id),
        title: row.name,
        subtitle: champ ? `${champ} loadout card` : "Loadout card",
        href: champ ? `/stats/loadouts/${slug(champ)}/cards/${row.id}` : "/stats/loadouts",
        score: rankStaticName(row.name, q, 78),
        meta: { championId: row.championId, championName: champ },
      };
    });

  const talentResults: UniversalSearchResult[] = index.talents
    .filter(matches)
    .slice(0, 10)
    .map((row) => {
      const champ = championName(row);
      return {
        type: "talent",
        id: String(row.id),
        title: row.name,
        subtitle: champ ? `${champ} talent` : "Champion talent",
        href: champ ? `/stats/loadouts/${slug(champ)}?talentId=${row.id}` : "/stats/loadouts",
        score: rankStaticName(row.name, q, 80),
        meta: { championId: row.championId, championName: champ },
      };
    });

  return [...talentResults, ...cardResults, ...itemResults];
}
