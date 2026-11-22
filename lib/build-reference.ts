/** Loads build-reference data and resolves champion metadata.
 * This module resolves build references and related champion metadata.
 * refs: none
 */
import { fetchReferenceCards, fetchReferenceItems, fetchReferenceTalents } from "@/lib/api-client";
import { getChampionData, type ChampionData } from "@/lib/champion-data";
import { canonicalCardNameKey } from "@/lib/card-name";
import type { TranslationKey } from "@/lib/localization/messages";
import {
  ACTIVE_ITEMS,
  activeItemTierAtLevel,
  type ActiveItemCategory,
  type ActiveItemTier,
} from "@/lib/active-items";

/**
 * Define build item category as `ActiveItemCategory`.
 * refs: none
 */
export type BuildItemCategory = ActiveItemCategory;

/**
 * Describe build item reference with id, name, category, description (optional), descriptionKey (optional), iconUrl (optional), tiers.
 * refs: none
 */
export interface BuildItemReference {
  id: number;
  name: string;
  category: BuildItemCategory;
  description?: string | null;
  descriptionKey?: TranslationKey | null;
  iconUrl?: string | null;
  tiers: readonly ActiveItemTier[];
  sourceUrl: string;
}

/**
 * Describe an item that may appear in a saved build, including retired catalog entries.
 * refs: none
 */
export interface BuildItemDisplayReference {
  id: number;
  name: string;
  iconUrl?: string | null;
  category?: string;
}

/**
 * Describe build card reference with id, name, category, description (optional), iconUrl (optional).
 * refs: none
 */
export interface BuildCardReference {
  id: number;
  name: string;
  category: string;
  description?: string | null;
  iconUrl?: string | null;
}

/**
 * Describe build talent reference with id, name, category, description (optional), iconUrl (optional).
 * refs: none
 */
export interface BuildTalentReference {
  id: number;
  name: string;
  category: string;
  description?: string | null;
  iconUrl?: string | null;
}

/**
 * Describe build reference data with championId, champion (optional), items, cards, talents.
 * refs: none
 */
export interface BuildReferenceData {
  championId: number;
  champion?: ChampionData;
  /** Current store items available to the build editor. */
  items: BuildItemReference[];
  /** Full ID lookup used to render saved builds created against older item catalogs. */
  itemLookup?: BuildItemDisplayReference[];
  cards: BuildCardReference[];
  talents: BuildTalentReference[];
}

type RawItem = {
  id?: number;
  item_id?: number;
  name?: string;
  item_name?: string;
  description?: string | null;
  itemType?: string | null;
  item_type?: string | null;
  iconUrl?: string | null;
  icon_url?: string | null;
};

type RawCard = {
  id?: number;
  card_id?: number;
  name?: string;
  card_name?: string;
  championId?: number;
  champion_id?: number;
  description?: string | null;
  iconUrl?: string | null;
  icon_url?: string | null;
  category?: string | null;
};

type RawTalent = {
  id?: number;
  talent_id?: number;
  name?: string;
  talent_name?: string;
  championId?: number;
  champion_id?: number;
  description?: string | null;
  iconUrl?: string | null;
  icon_url?: string | null;
  category?: string | null;
};

let localItemPromise: Promise<RawItem[]> | null = null;
let localCardPromise: Promise<RawCard[]> | null = null;
let localTalentPromise: Promise<RawTalent[]> | null = null;

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function itemIconPath(name: string) {
  return `/images/items/${name.replace(/\s+/g, "_")}_Icon.avif`;
}

async function loadLocalItems() {
  if (!localItemPromise) {
    localItemPromise = fetch("/data/paladins-items-reference.json")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
  }
  return localItemPromise;
}

async function loadLocalCards() {
  if (!localCardPromise) {
    localCardPromise = fetch("/data/paladins-card-reference.json")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
  }
  return localCardPromise;
}

async function loadLocalTalents() {
  if (!localTalentPromise) {
    localTalentPromise = fetch("/data/paladins-talent-reference.json")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
  }
  return localTalentPromise;
}

function idOf(row: RawItem | RawCard | RawTalent, key: "item" | "card" | "talent") {
  if (key === "item") return Number((row as RawItem).item_id ?? row.id ?? 0);
  if (key === "card") return Number((row as RawCard).card_id ?? row.id ?? 0);
  return Number((row as RawTalent).talent_id ?? row.id ?? 0);
}

function nameOf(row: RawItem | RawCard | RawTalent, key: "item" | "card" | "talent") {
  if (key === "item") return String((row as RawItem).item_name ?? row.name ?? "");
  if (key === "card") return String((row as RawCard).card_name ?? row.name ?? "");
  return String((row as RawTalent).talent_name ?? row.name ?? "");
}

function championIdOf(row: RawCard | RawTalent) {
  return Number(row.champion_id ?? row.championId ?? 0);
}

async function buildItemData(): Promise<Pick<BuildReferenceData, "items" | "itemLookup">> {
  const [dbItems, localItems] = await Promise.all([
    fetchReferenceItems().catch(() => [] as RawItem[]),
    loadLocalItems(),
  ]);
  const dbByName = new Map<string, RawItem>();
  const localByName = new Map<string, RawItem>();
  for (const row of localItems) {
    localByName.set(normalizeName(nameOf(row, "item")), row);
  }
  for (const row of dbItems as RawItem[]) {
    dbByName.set(normalizeName(nameOf(row, "item")), row);
  }

  const items = ACTIVE_ITEMS.map((item) => {
    const key = normalizeName(item.name);
    const dbRow = dbByName.get(key);
    // The bundled file contains historical item IDs. Use it for descriptions
    // and images only; current IDs come from the database or the maintained
    // fallback roster so removed/reused store entries cannot collide.
    const id = dbRow ? idOf(dbRow, "item") : item.fallbackId;
    return {
      id: Number.isFinite(id) && id > 0 ? id : item.fallbackId,
      name: item.name,
      category: item.category,
      description: item.tiers[0].description,
      descriptionKey: null,
      // The active roster has owned artwork. Legacy reference URLs can point
      // at the retired web2.hirez.com host even when metadata is available.
      iconUrl: itemIconPath(item.name),
      tiers: item.tiers.map((tier) => ({ ...tier })),
      sourceUrl: `https://paladins.fandom.com/wiki/${item.wikiSlug}`,
    };
  });

  // Saved builds can retain IDs for items that have since left the active
  // store. Keep the editor's options restricted to ACTIVE_ITEMS, while giving
  // the detail page the complete server catalog for exact ID-based rendering.
  const itemLookupById = new Map<number, BuildItemDisplayReference>();
  for (const item of items) {
    itemLookupById.set(item.id, {
      id: item.id,
      name: item.name,
      iconUrl: item.iconUrl,
      category: item.category,
    });
  }
  for (const row of dbItems as RawItem[]) {
    const id = idOf(row, "item");
    const name = nameOf(row, "item").trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
    const localRow = localByName.get(normalizeName(name));
    const activeItem = itemLookupById.get(id);
    itemLookupById.set(id, {
      id,
      name,
      iconUrl: activeItem?.iconUrl ?? row.icon_url ?? row.iconUrl ?? localRow?.icon_url ?? localRow?.iconUrl ?? itemIconPath(name),
      category: activeItem && normalizeName(activeItem.name) === normalizeName(name) ? activeItem.category : undefined,
    });
  }

  return { items, itemLookup: Array.from(itemLookupById.values()) };
}

/**
 * Return the normalized item-tier description, falling back to the base item description or null when neither is available.
 * refs: none
 * I/O types: `item: Pick<BuildItemReference, "description" | "tiers"> | null | undefined; level: number -> string | null`.
 */
export function itemDescriptionAtLevel(
  item: Pick<BuildItemReference, "description" | "tiers"> | null | undefined,
  level: number,
): string | null {
  return activeItemTierAtLevel(item?.tiers, level)?.description ?? item?.description ?? null;
}

async function buildCards(championId: number, champion?: ChampionData): Promise<BuildCardReference[]> {
  if (!champion?.loadouts?.length) return [];
  const [dbCards, localCards] = await Promise.all([
    fetchReferenceCards().catch(() => [] as RawCard[]),
    loadLocalCards(),
  ]);
  const byNameAndChampion = new Map<string, RawCard>();
  const byId = new Map<number, RawCard>();
  const byName = new Map<string, RawCard>();
  const byCanonicalNameAndChampion = new Map<string, RawCard>();
  const byCanonicalName = new Map<string, RawCard>();
  for (const row of [...localCards, ...(dbCards as RawCard[])]) {
    const rowId = idOf(row, "card");
    if (rowId > 0) byId.set(rowId, row);
    const key = normalizeName(nameOf(row, "card"));
    if (!key) continue;
    byName.set(key, row);
    const rowChampionId = championIdOf(row as RawCard);
    if (rowChampionId > 0) byNameAndChampion.set(`${rowChampionId}:${key}`, row as RawCard);
    const canonicalKey = canonicalCardNameKey(nameOf(row, "card"));
    if (canonicalKey) {
      byCanonicalName.set(canonicalKey, row);
      if (rowChampionId > 0) byCanonicalNameAndChampion.set(`${rowChampionId}:${canonicalKey}`, row as RawCard);
    }
  }

  return champion.loadouts.map((card, index) => {
    const key = normalizeName(card.name);
    const canonicalKey = canonicalCardNameKey(card.name);
    const row = byId.get(card.id)
      ?? byNameAndChampion.get(`${championId}:${key}`)
      ?? byCanonicalNameAndChampion.get(`${championId}:${canonicalKey}`)
      ?? byName.get(key)
      ?? byCanonicalName.get(canonicalKey);
    return {
      id: card.id > 0 ? card.id : (row ? idOf(row, "card") : -(index + 1)),
      name: card.name,
      category: card.category || "General",
      description: card.description ?? row?.description ?? null,
      iconUrl: card.iconUrl ?? row?.icon_url ?? row?.iconUrl ?? null,
    };
  });
}

async function buildTalents(championId: number, champion?: ChampionData): Promise<BuildTalentReference[]> {
  if (!champion?.talents?.length) return [];
  const [dbTalents, localTalents] = await Promise.all([
    fetchReferenceTalents().catch(() => [] as RawTalent[]),
    loadLocalTalents(),
  ]);
  const byId = new Map<number, RawTalent>();
  for (const row of [...localTalents, ...(dbTalents as RawTalent[])]) {
    const id = idOf(row, "talent");
    if (id > 0) byId.set(id, row);
  }

  return champion.talents.map((talent) => {
    const row = byId.get(talent.id);
    return {
      id: talent.id,
      name: talent.name,
      category: talent.category || "Talent",
      description: talent.description ?? row?.description ?? null,
      iconUrl: talent.iconUrl ?? row?.icon_url ?? row?.iconUrl ?? null,
    };
  });
}

/**
 * Load optional champion data and the item/card/talent references concurrently. Suppress champion-data loading failure, retain the requested champion ID, and propagate uncaught reference-loader failures.
 * refs: none
 * I/O types: `championId: number; championSlug: string -> Promise<BuildReferenceData>`.
 */
export async function loadBuildReferenceData(championId: number, championSlug: string): Promise<BuildReferenceData> {
  const champion = championSlug ? await getChampionData(championSlug).catch(() => undefined) : undefined;
  const [itemData, cards, talents] = await Promise.all([
    buildItemData(),
    buildCards(championId, champion),
    buildTalents(championId, champion),
  ]);
  return { championId, champion, ...itemData, cards, talents };
}

/**
 * Load only the card data needed by saved-deck views. This avoids fetching
 * refs: none
 * item and talent references on a route that never renders either dataset.
 * I/O types: `championId: number; championSlug: string -> Promise<BuildCardReference[]>`.
 */
export async function loadBuildCardReferences(championId: number, championSlug: string): Promise<BuildCardReference[]> {
  const champion = championSlug ? await getChampionData(championSlug).catch(() => undefined) : undefined;
  return buildCards(championId, champion);
}

/**
 * Group rows by category in first-seen order, using General for an empty category. Allocate new grouping arrays without altering the input rows.
 * refs: none
 * I/O types: `rows: T[] -> Array<[string, T[]]>`.
 */
export function groupByCategory<T extends { category: string }>(rows: T[]): Array<[string, T[]]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.category || "General";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return Array.from(grouped.entries());
}
