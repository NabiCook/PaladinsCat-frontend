/**
 * Current map classification and display order for community map tier lists.
 * The order follows the current Paladins Fandom Maps page; maps that appear
 * in more than one category remain one draggable item with all categories.
 * refs: https://paladins.fandom.com/wiki/Maps
 */

/** The fixed set of community map-tier classifications (display order).
 *
 * refs: none
 */
export const MAP_TIER_CLASSIFICATIONS = [
  "Siege",
  "Onslaught",
  "King of the Hill",
  "Team Deathmatch",
  "Payload",
  "Other",
] as const;

/** A single community map-tier classification name.
 *
 * refs: none
 */
export type MapTierClassification = (typeof MAP_TIER_CLASSIFICATIONS)[number];

/** One draggable map tier-list item (name + classification set).
 *
 * refs: none
 */
export interface MapTierItem {
  name: string;
  primaryClassification: MapTierClassification;
  classifications: readonly MapTierClassification[];
}

/** Keep this list in the same grouped order as the Fandom Maps page.
 *
 * refs: none
 */
export const MAP_TIER_ITEMS = [
  { name: "Frog Isle", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Jaguar Falls", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Serpent Beach", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Frozen Guard", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Ice Mines", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Fish Market", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Timber Mill", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Stone Keep", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Brightmarsh", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Splitstone Quarry", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Ascension Peak", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Warder's Gate", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Shattered Desert", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Bazaar", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Dawnforge", primaryClassification: "Siege", classifications: ["Siege"] },
  { name: "Primal Court", primaryClassification: "Onslaught", classifications: ["Onslaught"] },
  { name: "Foreman's Rise", primaryClassification: "Onslaught", classifications: ["Onslaught"] },
  { name: "Magistrate's Archives", primaryClassification: "Onslaught", classifications: ["Onslaught", "King of the Hill"] },
  { name: "Marauder's Port", primaryClassification: "Onslaught", classifications: ["Onslaught", "King of the Hill"] },
  { name: "Snowfall Junction", primaryClassification: "King of the Hill", classifications: ["King of the Hill", "Team Deathmatch"] },
  { name: "Trade District", primaryClassification: "King of the Hill", classifications: ["King of the Hill", "Team Deathmatch"] },
  { name: "Abyss", primaryClassification: "Team Deathmatch", classifications: ["Team Deathmatch"] },
  { name: "Throne", primaryClassification: "Team Deathmatch", classifications: ["Team Deathmatch"] },
  { name: "Dragon Arena", primaryClassification: "Team Deathmatch", classifications: ["Team Deathmatch"] },
  { name: "Greenwood Outpost", primaryClassification: "Payload", classifications: ["Payload"] },
  { name: "Hidden Temple", primaryClassification: "Payload", classifications: ["Payload"] },
  { name: "Frostbite Cavern", primaryClassification: "Payload", classifications: ["Payload"] },
  { name: "Shooting Range", primaryClassification: "Other", classifications: ["Other"] },
  { name: "Tutorial", primaryClassification: "Other", classifications: ["Other"] },
  { name: "Hole", primaryClassification: "Other", classifications: ["Other"] },
  { name: "Sniper Haven", primaryClassification: "Other", classifications: ["Other"] },
] as const satisfies readonly MapTierItem[];

const MAP_TIER_ITEMS_BY_NAME = new Map<string, MapTierItem>(MAP_TIER_ITEMS.map((item) => [item.name, item]));

/** Return the canonical map-tier item for an API or saved-list name.
 *
 * I/O: in (name: string) -> out MapTierItem | undefined
 *
 * refs: none
 */
export function getMapTierItem(name: string): MapTierItem | undefined {
  return MAP_TIER_ITEMS_BY_NAME.get(name) ?? MAP_TIER_ITEMS.find(
    (item) => item.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0,
  );
}
