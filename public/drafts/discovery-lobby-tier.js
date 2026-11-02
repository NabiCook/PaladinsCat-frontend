// Canonical browser logic: lib/lobby-tier.ts SHA256 59228cac46ddc48842e8aae4747036358bb0ba111b1618d260555e942ddee54f
(() => {
/**
 * Defines the  l o b b y_ t i e r_ f i l t e r s contract used by this module.
 * Returns: `Record<LobbyTierFilter, LobbyTierDefinition>`
 * refs: none
 */
const LOBBY_TIER_FILTERS = {
    all: {
        value: "all",
        labelKey: "account.lobbyTier.all.label",
        descriptionKey: "account.lobbyTier.all.description",
    },
    "bronze-gold": {
        value: "bronze-gold",
        labelKey: "account.lobbyTier.bronzeGold.label",
        descriptionKey: "account.lobbyTier.bronzeGold.description",
        tierMin: 1,
        tierMax: 15,
    },
    "platinum-plus": {
        value: "platinum-plus",
        labelKey: "account.lobbyTier.platinumPlus.label",
        descriptionKey: "account.lobbyTier.platinumPlus.description",
        tierMin: 16,
        tierMax: 26,
    },
    "diamond-plus": {
        value: "diamond-plus",
        labelKey: "account.lobbyTier.diamondPlus.label",
        descriptionKey: "account.lobbyTier.diamondPlus.description",
        tierMin: 21,
        tierMax: 26,
    },
};
/**
 * Defines the  l o b b y_ t i e r_ o p t i o n s contract used by this module.
 * refs: none
 */
const LOBBY_TIER_OPTIONS = Object.values(LOBBY_TIER_FILTERS);
/**
 * Defines the  l o b b y_ t i e r_ s t o r a g e_ k e y contract used by this module.
 * refs: none
 */
const LOBBY_TIER_STORAGE_KEY = "pc_lobby_tier_filter";
/**
 * Narrow the value to a lobby-tier filter only when it is a string key present in LOBBY_TIER_FILTERS.
 * refs: none
 * I/O types: `value: unknown -> value is LobbyTierFilter`.
 */
function isLobbyTierFilter(value) {
    return typeof value === "string" && value in LOBBY_TIER_FILTERS;
}
/**
 * Read a valid lobby-tier filter from localStorage; return all during SSR or for an unrecognized stored value. Browser storage access errors propagate.
 * refs: none
 * I/O types: `none -> LobbyTierFilter`.
 */
function getStoredLobbyTierFilter() {
    if (typeof window === "undefined")
        return "all";
    const stored = window.localStorage.getItem(LOBBY_TIER_STORAGE_KEY);
    return isLobbyTierFilter(stored) ? stored : "all";
}
const GLOBAL_STAT_PATHS = [
    "/stats/",
    "/champions/overview",
    "/champions/top-winrate",
    "/champions/",
    "/matches/compositions",
];
const UNSCOPED_STAT_PATHS = [
    "/stats/tiers",
    "/stats/leagues",
    "/stats/tier-population",
    "/stats/ranked-leaderboard",
    "/stats/leaderboard-log",
    "/stats/champion-leaderboard",
    "/stats/champions/",
    "/stats/player/",
    "/champions/tiers",
];
/**
 * Append stored tier bounds only to eligible global-stat paths lacking explicit tier bounds. Preserve SSR paths, casual scope, excluded paths, and all-tier preferences unchanged; reading browser storage can throw.
 * refs: none
 * I/O types: `path: string -> string`.
 */
function withStoredLobbyTier(path) {
    if (typeof window === "undefined")
        return path;
    const existing = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?") + 1) : "");
    if (existing.get("scope") === "casual")
        return path;
    const pathname = path.split("?", 1)[0];
    if (!GLOBAL_STAT_PATHS.some((prefix) => pathname.startsWith(prefix)))
        return path;
    if (UNSCOPED_STAT_PATHS.some((prefix) => pathname.startsWith(prefix)))
        return path;
    const definition = LOBBY_TIER_FILTERS[getStoredLobbyTierFilter()];
    if (definition.tierMin == null && definition.tierMax == null)
        return path;
    if (existing.has("tierMin") || existing.has("tierMax"))
        return path;
    const separator = path.includes("?") ? "&" : "?";
    const params = new URLSearchParams();
    if (definition.tierMin != null)
        params.set("tierMin", String(definition.tierMin));
    if (definition.tierMax != null)
        params.set("tierMax", String(definition.tierMax));
    return `${path}${separator}${params.toString()}`;
}

window.DiscoveryLobbyTier = { LOBBY_TIER_FILTERS, LOBBY_TIER_OPTIONS, LOBBY_TIER_STORAGE_KEY, isLobbyTierFilter, getStoredLobbyTierFilter, withStoredLobbyTier };
})();
