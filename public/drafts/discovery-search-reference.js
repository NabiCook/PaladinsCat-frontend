// Browser logic from lib/search-reference.ts; dashboard markup remains the owning renderer.
// Source SHA256: 9b109ab129c6de3a63758ee856c4a35ff902675891f3d89378636c82aedcd696
async function fetchReferenceChampions() { const response = await window.DiscoveryApp.request("/reference/champions"); return Array.isArray(response) ? response : response.data || []; }
import { foldSearchTerm, normalize } from "./discovery-search-state.js";
let staticReferencePromise = null;
function slug(name) {
    return String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function rankStaticName(name, q, base) {
    const n = foldSearchTerm(name);
    const query = foldSearchTerm(q);
    if (n === query)
        return base + 30;
    if (n.startsWith(query))
        return base + 18;
    if (n.includes(query))
        return base + 8;
    return base;
}
function uniqueByName(rows) {
    const seen = new Set();
    return rows.filter((row) => {
        const key = `${normalize(row.name)}:${row.championId ?? 0}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
export async function loadStaticReferenceIndex() {
    if (!staticReferencePromise) {
        staticReferencePromise = Promise.all([
            fetch("/data/paladins-items-reference.json").then((res) => res.ok ? res.json() : []),
            fetch("/data/paladins-card-reference.json").then((res) => res.ok ? res.json() : []),
            fetch("/data/paladins-talent-reference.json").then((res) => res.ok ? res.json() : []),
            fetchReferenceChampions().catch(() => []),
        ]).then(([items, cards, talents, champions]) => {
            const championNames = new Map(champions.map((champion) => [Number(champion.id), champion.name]));
            return {
                // The item reference file also carries champion cards/talents from the
                // Hi-Rez item endpoint. Universal item search should keep the vendor
                // item lane focused on buyable match items; card/talent lanes below use
                // their dedicated local reference files.
                items: uniqueByName(items.filter((item) => Number(item.championId ?? 0) === 0)),
                cards: uniqueByName(cards),
                talents: uniqueByName(talents),
                championNames,
            };
        });
    }
    return staticReferencePromise;
}
export function staticReferenceResults(q, index) {
    const query = foldSearchTerm(q);
    if (query.length < 2)
        return [];
    const matches = (row) => foldSearchTerm(row.name).includes(query);
    const championName = (row) => row.championName || index.championNames.get(Number(row.championId ?? 0)) || null;
    const itemResults = index.items
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
    const cardResults = index.cards
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
    const talentResults = index.talents
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
