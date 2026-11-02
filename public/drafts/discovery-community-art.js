/* Generated from canonical local artwork resolvers. */
const GENERIC_ICON = "/images/champions/Champion_Generic_Icon.avif";
const ICON_EXCEPTIONS = {
    'bettylabomba': 'BettyLaBomba',
    'bombking': 'BombKing',
    'shalin': 'ShaLin',
    'maldamba': "Mal'Damba",
    'vii': 'VII',
};
function normalizeChampionName(name) {
    return name.toLowerCase().replace(/[^a-z]/g, '');
}
export function getGenericChampionIcon() {
    return GENERIC_ICON;
}
export function getChampionIconSafe(name) {
    if (!name)
        return GENERIC_ICON;
    const trimmed = name.trim();
    const normalized = normalizeChampionName(trimmed);
    const exception = ICON_EXCEPTIONS[normalized];
    if (exception) {
        return `/images/champions/Champion ${exception} Icon.avif`;
    }
    return `/images/champions/Champion ${trimmed} Icon.avif`;
}

const DEFAULT_MAP_ARTWORK = "Test_Maps_Loading";
const DEFAULT_MATCH_MAP_ARTWORK = "Match_Test_Maps";
const MAP_ARTWORK = {
    abyss: "Abyss_Loading",
    "ascension peak": "Ascension_Peak_Overhead_Layout",
    brightmarsh: "Brightmarsh_Overhead_Layout",
    dawnforge: "Dawnforge_Loading",
    "dragon arena": "Dragon_Arena_Overhead_Layout",
    "fish market": "Fish Market Overhead",
    "foremans rise": "Foremans_Rise_Overhead_Layout",
    "frostbite cavern": "Frostbite_Cavern_Loading",
    "frozen guard": "Frozen_Guard_Loading",
    "frog isle": "Frog_Isle_Overhead_Layout",
    "greenwood outpost": "Greenwood_Outpost_Loading",
    "hidden temple": "Hidden_Temple_Loading",
    "jaguar falls": "Jaguar_Falls_Overhead_Layout",
    "magistrates archives": "Magistrates_Archives_Loading",
    "marauders port": "Marauders_Port_Loading",
    "primal court": "Primal_Court_Loading",
    "serpent beach": "Serpent_Beach_Overhead_Layout",
    "shattered desert": "Shattered_Desert_Loading",
    "shooting range": "Shooting_Range_Loading",
    "snowfall junction": "Snowfall_Junction_Overhead_Layout",
    "splitstone quarry": "Splotstone_Quarry_Overhead_Layout",
    "stone keep": "Stone_Keep_Overhead_Layout",
    "stone keep classic": "Stone_Keep_Overhead_Layout",
    "stone keep v2 night": "Stone_Keep_Overhead_Layout",
    "test maps": "Test_Maps_Loading",
    throne: "Throne_Loading",
    "timber mill": "Timber_Mill_Loading",
    "trade district": "Trade_District_Loading",
    tutorial: "Tutorial_Loading",
    "warders gate": "Warders_Gate_Overhead_Layout",
    bazaar: "Ranked_Bazaar",
    "ice mines": "Ranked_Ice_Mines",
};
const MAP_LOADING_ARTWORK = {
    "ascension peak": "Ascension_Peak_Loading",
    brightmarsh: "Brightmarsh_Loading",
    "dragon arena": "Dragon_Arena_Loading",
    "fish market": "Fish_Market_Loading",
    "foremans rise": "Foremans_Rise_Loading",
    "frog isle": "Frog_Isle_Loading",
    "jaguar falls": "Jaguar_Falls_Loading",
    "serpent beach": "Serpent_Beach_Loading",
    "snowfall junction": "Snowfall_Junction_Loading",
    "splitstone quarry": "Splitstone_Quarry_Loading",
    "stone keep": "Stone_Keep_Loading",
    "stone keep classic": "Stone_Keep_Loading",
    "stone keep v2 night": "Stone_Keep_Loading",
    "warders gate": "Warders_Gate_Loading",
    bazaar: "Bazaar_Loading",
    "ice mines": "Ice_Mines_Loading",
};
const MATCH_MAP_ARTWORK = {
    abyss: "Match_Abyss",
    "ascension peak": "Match_Ascension_Peak",
    bazaar: "Match_Bazaar",
    brightmarsh: "Match_Brightmarsh",
    dawnforge: "Match_Dawnforge",
    "dragon arena": "Match_Dragon_Arena",
    "fish market": "Match_Fish_Market",
    "foremans rise": "Match_Foremans_Rise",
    "frostbite cavern": "Match_Frostbite_Cavern",
    "frozen guard": "Match_Frozen_Guard",
    "frog isle": "Match_Frog_Isle",
    "greenwood outpost": "Match_Greenwood_Outpost",
    "hidden temple": "Match_Hidden_Temple",
    "ice mines": "Match_Ice_Mines",
    "jaguar falls": "Match_Jaguar_Falls",
    "magistrates archives": "Match_Magistrates_Archives",
    "marauders port": "Match_Marauders_Port",
    "primal court": "Match_Primal_Court",
    "serpent beach": "Match_Serpent_Beach",
    "shattered desert": "Match_Shattered_Desert",
    "shooting range": "Match_Shooting_Range",
    "snowfall junction": "Match_Snowfall_Junction",
    "splitstone quarry": "Match_Splitstone_Quarry",
    "stone keep": "Match_Stone_Keep",
    "stone keep classic": "Match_Stone_Keep_Classic",
    "stone keep v2 night": "Match_Stone_Keep_V2_Night",
    "test maps": "Match_Test_Maps",
    throne: "Match_Throne",
    "timber mill": "Match_Timber_Mill",
    "trade district": "Match_Trade_District",
    tutorial: "Match_Tutorial",
    "warders gate": "Match_Warders_Gate",
};
function mapLookupKey(value) {
    return value
        .replace(/^(?:live|casual)\s+/i, "")
        .replace(/\s+\((?:onslaught|king of the hill|koth|team deathmatch|tdm|siege|payload)\)\s*$/i, "")
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase();
}
export function mapImagePath(mapName) {
    const lookupKey = mapLookupKey(mapName.trim().replace(/^ranked\s+/i, ""));
    const artwork = MAP_ARTWORK[lookupKey];
    return `/images/maps/${artwork ?? DEFAULT_MAP_ARTWORK}.png`;
}
export function mapLoadingImagePath(mapName) {
    const lookupKey = mapLookupKey(mapName.trim().replace(/^ranked\s+/i, ""));
    const artwork = MAP_LOADING_ARTWORK[lookupKey] ?? MAP_ARTWORK[lookupKey] ?? DEFAULT_MAP_ARTWORK;
    return `/images/maps/${artwork}.png`;
}
export function matchMapImagePath(mapName) {
    const lookupKey = mapLookupKey(mapName.trim().replace(/^ranked\s+/i, ""));
    const artwork = MATCH_MAP_ARTWORK[lookupKey] ?? DEFAULT_MATCH_MAP_ARTWORK;
    return `/images/maps/${artwork}.png`;
}
export function matchMapImageSources(mapName) {
    const png = matchMapImagePath(mapName);
    return { avif: png.replace(/\.png$/, ".avif"), png };
}

/* Surgical canonical browser utilities */
// lib/chat-messages.ts SHA256 87e9577e183e3783f6321bd509a0e3e06d12d108da4b8f782ec7dba2d8455f5b
/** Merge replay/history by revision so stale pages cannot resurrect deleted messages.
 * refs: none
 */
/**
 * Compute merge chat messages and return `[...messages.values()].sort((a, b) => a.id - b.id)`.
 * I/O types: `current: T[]; incoming: T[] -> T[]`.
 * refs: none
 */
export function mergeChatMessages(current, incoming) {
    const messages = new Map(current.map((message) => [message.id, message]));
    for (const message of incoming) {
        if ((messages.get(message.id)?.revision ?? -1) <= message.revision)
            messages.set(message.id, message);
    }
    return [...messages.values()].sort((a, b) => a.id - b.id);
}

// lib/community-replies.ts SHA256 14a81bb99c63dd6e4643e0066284117222df6d58f77558c58c2f237294370822
/** Keep each reply next to its parent, preserving sibling order and orphaned comments.
 * refs: none
 */
/**
 * Compute order replies and return `ordered`.
 * I/O types: `comments: T[] -> T[]`.
 * refs: none
 */
export function orderReplies(comments) {
    const ids = new Set(comments.map((comment) => comment.id));
    const children = new Map();
    for (const comment of comments) {
        if (comment.parentId != null && ids.has(comment.parentId)) {
            const siblings = children.get(comment.parentId) ?? [];
            siblings.push(comment);
            children.set(comment.parentId, siblings);
        }
    }
    const roots = comments.filter((comment) => comment.parentId == null || !ids.has(comment.parentId));
    const seen = new Set();
    const ordered = [];
    // Iteration avoids a call-stack limit on long reply chains; cycles remain visible.
    for (const root of [...roots, ...comments]) {
        const pending = [root];
        while (pending.length) {
            const comment = pending.pop();
            if (seen.has(comment.id))
                continue;
            seen.add(comment.id);
            ordered.push(comment);
            pending.push(...[...(children.get(comment.id) ?? [])].reverse());
        }
    }
    return ordered;
}

// lib/wallpaper-preference.ts SHA256 d6f29d4ac2b208f43e29d682d550340507ac1ff3481078453e9a8e79ef509dff
/**
 * Defines wallpaper-preference's shared contracts and runtime helpers.
 * Keep behavior aligned with its callers and browser/server boundary.
 * refs: none
 */
/**
 * Publish the wallpaper storage key configuration as `"paladinscat-wallpaper-enabled"`.
 * refs: none
 */
export const WALLPAPER_STORAGE_KEY = "paladinscat-wallpaper-enabled";
/**
 * Defines the  c u s t o m_ w a l l p a p e r_ s t o r a g e_ k e y contract used by this module.
 * refs: none
 */
export const CUSTOM_WALLPAPER_STORAGE_KEY = "paladinscat-custom-wallpaper";
/**
 * Publish the browser-local custom wallpaper rotation storage key.
 * refs: none
 */
export const CUSTOM_WALLPAPER_ROTATION_STORAGE_KEY = "paladinscat-custom-wallpaper-rotation-ms";
/**
 * Defines the  w a l l p a p e r_ c h a n g e_ e v e n t contract used by this module.
 * refs: none
 */
export const WALLPAPER_CHANGE_EVENT = "paladinscat:wallpaper-change";
const WALLPAPER_DATABASE_NAME = "paladinscat-wallpapers";
const WALLPAPER_OBJECT_STORE = "images";
/**
 * Defines the  m a x_ c u s t o m_ w a l l p a p e r_ b y t e s contract used by this module.
 * refs: none
 */
export const MAX_CUSTOM_WALLPAPER_BYTES = 25 * 1024 * 1024;
/**
 * Publish the supported custom-wallpaper rotation presets and their localization keys.
 * refs: none
 */
export const CUSTOM_WALLPAPER_ROTATION_OPTIONS = [
    { intervalMs: 10_000, labelKey: "generated.account.wallpaperRotation10Seconds" },
    { intervalMs: 30_000, labelKey: "generated.account.wallpaperRotation30Seconds" },
    { intervalMs: 60_000, labelKey: "generated.account.wallpaperRotation1Minute" },
    { intervalMs: 5 * 60_000, labelKey: "generated.account.wallpaperRotation5Minutes" },
    { intervalMs: 15 * 60_000, labelKey: "generated.account.wallpaperRotation15Minutes" },
    { intervalMs: 60 * 60_000, labelKey: "generated.account.wallpaperRotation1Hour" },
];
/**
 * Publish the previous 10-second custom-wallpaper rotation as the default.
 * refs: none
 */
export const DEFAULT_CUSTOM_WALLPAPER_ROTATION_MS = 10_000;
const SUPPORTED_IMAGE_TYPES = new Set([
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
]);
function isSupportedExternalWallpaper(source) {
    try {
        const url = new URL(source);
        return url.protocol === "https:" || url.protocol === "http:";
    }
    catch {
        return false;
    }
}
function notifyWallpaperChange() {
    window.dispatchEvent(new Event(WALLPAPER_CHANGE_EVENT));
}
// User-facing error keys — resolved at the UI layer via t()
/**
 * Defines the  w a l l p a p e r_ e r r o r_ k e y s contract used by this module.
 * refs: none
 */
export const WALLPAPER_ERROR_KEYS = {
    saveSetting: "generated.wallpaper.saveSettingError",
    invalidUrl: "generated.wallpaper.invalidUrlError",
    unsupportedType: "generated.wallpaper.unsupportedTypeError",
    fileTooLarge: "generated.wallpaper.fileTooLargeError",
    operationFailed: "generated.wallpaper.operationFailed",
};
function openWallpaperDatabase() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(WALLPAPER_DATABASE_NAME, 1);
        request.onerror = () => reject(new Error(WALLPAPER_ERROR_KEYS.operationFailed));
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(WALLPAPER_OBJECT_STORE)) {
                request.result.createObjectStore(WALLPAPER_OBJECT_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
    }).catch(() => { throw new Error(WALLPAPER_ERROR_KEYS.operationFailed); });
}
async function getStoredUpload(id) {
    const database = await openWallpaperDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(WALLPAPER_OBJECT_STORE, "readonly");
        const request = transaction.objectStore(WALLPAPER_OBJECT_STORE).get(id);
        request.onerror = () => reject(new Error(WALLPAPER_ERROR_KEYS.operationFailed));
        request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    }).catch(() => { throw new Error(WALLPAPER_ERROR_KEYS.operationFailed); }).finally(() => database.close());
}
async function saveUpload(id, file) {
    const database = await openWallpaperDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(WALLPAPER_OBJECT_STORE, "readwrite");
        transaction.objectStore(WALLPAPER_OBJECT_STORE).put(file, id);
        transaction.onerror = () => reject(new Error(WALLPAPER_ERROR_KEYS.operationFailed));
        transaction.oncomplete = () => resolve();
    }).catch(() => { throw new Error(WALLPAPER_ERROR_KEYS.operationFailed); }).finally(() => database.close());
}
async function removeUpload(id) {
    const database = await openWallpaperDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(WALLPAPER_OBJECT_STORE, "readwrite");
        transaction.objectStore(WALLPAPER_OBJECT_STORE).delete(id);
        transaction.onerror = () => reject(new Error(WALLPAPER_ERROR_KEYS.operationFailed));
        transaction.oncomplete = () => resolve();
    }).catch(() => { throw new Error(WALLPAPER_ERROR_KEYS.operationFailed); }).finally(() => database.close());
}
function saveWallpaperReferences(wallpapers) {
    try {
        if (wallpapers.length > 0) {
            window.localStorage.setItem(CUSTOM_WALLPAPER_STORAGE_KEY, JSON.stringify(wallpapers));
        }
        else {
            window.localStorage.removeItem(CUSTOM_WALLPAPER_STORAGE_KEY);
        }
    }
    catch {
        throw new Error(WALLPAPER_ERROR_KEYS.saveSetting);
    }
}
function parseWallpaperReference(value) {
    if (typeof value === "object"
        && value !== null
        && "type" in value
        && "source" in value
        && value.type === "url"
        && typeof value.source === "string"
        && isSupportedExternalWallpaper(value.source)) {
        return { type: "url", source: value.source };
    }
    if (typeof value === "object"
        && value !== null
        && "type" in value
        && "id" in value
        && value.type === "upload"
        && typeof value.id === "string") {
        return { type: "upload", id: value.id };
    }
    return null;
}
function wallpaperKey(wallpaper) {
    return wallpaper.type === "url" ? `url:${wallpaper.source}` : `upload:${wallpaper.id}`;
}
function createWallpaperId() {
    return window.crypto.randomUUID?.() ?? `wallpaper-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
/**
 * Read the wallpaper localStorage preference; default to enabled during SSR, storage failure, or any value other than false.
 * refs: none
 * I/O types: `none -> boolean`.
 */
export function getWallpaperEnabled() {
    if (typeof window === "undefined")
        return true;
    try {
        return window.localStorage.getItem(WALLPAPER_STORAGE_KEY) !== "false";
    }
    catch {
        return true;
    }
}
/**
 * Updates wallpaper enabled using the module's persistence or validation rules.
 * refs: none
 * I/O types: `enabled: boolean -> void`.
 */
export function setWallpaperEnabled(enabled) {
    try {
        window.localStorage.setItem(WALLPAPER_STORAGE_KEY, String(enabled));
    }
    catch {
        // Keep the preference working for the current page when storage is unavailable.
    }
    notifyWallpaperChange();
}
/**
 * Read the browser-local custom-wallpaper rotation duration, defaulting to 10 seconds.
 * refs: none
 * I/O types: `none -> CustomWallpaperRotationMs`.
 */
export function getCustomWallpaperRotationMs() {
    if (typeof window === "undefined")
        return DEFAULT_CUSTOM_WALLPAPER_ROTATION_MS;
    try {
        const stored = Number(window.localStorage.getItem(CUSTOM_WALLPAPER_ROTATION_STORAGE_KEY));
        return CUSTOM_WALLPAPER_ROTATION_OPTIONS.some(({ intervalMs }) => intervalMs === stored)
            ? stored
            : DEFAULT_CUSTOM_WALLPAPER_ROTATION_MS;
    }
    catch {
        return DEFAULT_CUSTOM_WALLPAPER_ROTATION_MS;
    }
}
/**
 * Save an allowed custom-wallpaper rotation duration and notify active views.
 * refs: none
 * I/O types: `intervalMs: CustomWallpaperRotationMs -> void`.
 */
export function setCustomWallpaperRotationMs(intervalMs) {
    if (!CUSTOM_WALLPAPER_ROTATION_OPTIONS.some((option) => option.intervalMs === intervalMs))
        return;
    try {
        window.localStorage.setItem(CUSTOM_WALLPAPER_ROTATION_STORAGE_KEY, String(intervalMs));
    }
    catch {
        // Storage failure leaves the previous persisted duration unchanged.
    }
    notifyWallpaperChange();
}
/**
 * Returns the small local-storage references for this browser's custom wallpapers.  Returns: `Array`. · refs: none
 * I/O types: `none -> CustomWallpaper[]`.
 */
export function getCustomWallpapers() {
    if (typeof window === "undefined")
        return [];
    try {
        const raw = window.localStorage.getItem(CUSTOM_WALLPAPER_STORAGE_KEY);
        if (!raw)
            return [];
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            // Preserve existing URL-only settings created before the IndexedDB upgrade.
            return isSupportedExternalWallpaper(raw) ? [{ type: "url", source: raw }] : [];
        }
        const values = Array.isArray(parsed) ? parsed : [parsed];
        return values.map(parseWallpaperReference).filter((wallpaper) => wallpaper !== null);
    }
    catch {
        return [];
    }
}
/**
 * Returns the first wallpaper for compatibility with single-wallpaper consumers. · refs: none
 * I/O types: `none -> CustomWallpaper | null`.
 */
export function getCustomWallpaper() {
    return getCustomWallpapers()[0] ?? null;
}
/**
 * Resolves local references into URLs that can be used by CSS backgrounds. · refs: none
 * I/O types: `none -> Promise<ResolvedCustomWallpaper[]>`.
 */
export async function resolveCustomWallpapers() {
    const wallpapers = getCustomWallpapers();
    const resolved = await Promise.all(wallpapers.map(async (wallpaper) => {
        if (wallpaper.type === "url") {
            return { source: wallpaper.source, revoke: false, wallpaper };
        }
        const upload = await getStoredUpload(wallpaper.id);
        return upload ? { source: URL.createObjectURL(upload), revoke: true, wallpaper } : null;
    }));
    return resolved.filter((wallpaper) => wallpaper !== null);
}
/**
 * Resolves the first custom wallpaper for compatibility with single-wallpaper consumers. · refs: none
 * I/O types: `none -> Promise<ResolvedCustomWallpaper | null>`.
 */
export async function resolveCustomWallpaper() {
    return (await resolveCustomWallpapers())[0] ?? null;
}
function validateWallpaperUrl(source) {
    const normalizedSource = source.trim();
    if (!isSupportedExternalWallpaper(normalizedSource)) {
        throw new Error(WALLPAPER_ERROR_KEYS.invalidUrl);
    }
    return normalizedSource;
}
function validateWallpaperFile(file) {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        throw new Error(WALLPAPER_ERROR_KEYS.unsupportedType);
    }
    if (file.size > MAX_CUSTOM_WALLPAPER_BYTES) {
        throw new Error(WALLPAPER_ERROR_KEYS.fileTooLarge);
    }
}
/**
 * Adds an external wallpaper URL to the saved collection. · refs: none
 * I/O types: `source: string -> Promise<void>`.
 */
export async function addCustomWallpaperUrl(source) {
    if (typeof window === "undefined")
        return;
    const normalizedSource = validateWallpaperUrl(source);
    const wallpapers = getCustomWallpapers();
    const nextWallpaper = { type: "url", source: normalizedSource };
    if (!wallpapers.some((wallpaper) => wallpaperKey(wallpaper) === wallpaperKey(nextWallpaper))) {
        saveWallpaperReferences([...wallpapers, nextWallpaper]);
    }
    notifyWallpaperChange();
}
/**
 * Adds uploaded images to IndexedDB and their references to the saved collection. · refs: none
 * I/O types: `files: File[] -> Promise<void>`.
 */
export async function addCustomWallpaperFiles(files) {
    if (typeof window === "undefined" || files.length === 0)
        return;
    files.forEach(validateWallpaperFile);
    const additions = files.map((file) => ({ file, wallpaper: { type: "upload", id: createWallpaperId() } }));
    const savedIds = [];
    try {
        for (const addition of additions) {
            if (addition.wallpaper.type !== "upload")
                continue;
            await saveUpload(addition.wallpaper.id, addition.file);
            savedIds.push(addition.wallpaper.id);
        }
        saveWallpaperReferences([...getCustomWallpapers(), ...additions.map(({ wallpaper }) => wallpaper)]);
    }
    catch (error) {
        await Promise.allSettled(savedIds.map(removeUpload));
        throw error;
    }
    notifyWallpaperChange();
}
/**
 * Replaces the collection with one external wallpaper URL. · refs: none
 * I/O types: `source: string -> Promise<void>`.
 */
export async function setCustomWallpaperUrl(source) {
    if (typeof window === "undefined")
        return;
    const normalizedSource = validateWallpaperUrl(source);
    const previous = getCustomWallpapers();
    saveWallpaperReferences([{ type: "url", source: normalizedSource }]);
    await Promise.allSettled(previous.filter((wallpaper) => wallpaper.type === "upload").map((wallpaper) => removeUpload(wallpaper.id)));
    notifyWallpaperChange();
}
/**
 * Replaces the collection with one uploaded image. · refs: none
 * I/O types: `file: File -> Promise<void>`.
 */
export async function setCustomWallpaperFile(file) {
    if (typeof window === "undefined")
        return;
    validateWallpaperFile(file);
    const id = createWallpaperId();
    const previous = getCustomWallpapers();
    await saveUpload(id, file);
    try {
        saveWallpaperReferences([{ type: "upload", id }]);
    }
    catch (error) {
        void removeUpload(id);
        throw error;
    }
    await Promise.allSettled(previous.filter((wallpaper) => wallpaper.type === "upload").map((wallpaper) => removeUpload(wallpaper.id)));
    notifyWallpaperChange();
}
/**
 * Removes one wallpaper from the saved collection. · refs: none
 * I/O types: `target: CustomWallpaper -> Promise<void>`.
 */
export async function removeCustomWallpaper(target) {
    if (typeof window === "undefined")
        return;
    const targetKey = wallpaperKey(target);
    const wallpapers = getCustomWallpapers();
    const index = wallpapers.findIndex((wallpaper) => wallpaperKey(wallpaper) === targetKey);
    if (index < 0)
        return;
    saveWallpaperReferences(wallpapers.filter((_, wallpaperIndex) => wallpaperIndex !== index));
    if (target.type === "upload")
        await Promise.allSettled([removeUpload(target.id)]);
    notifyWallpaperChange();
}
/**
 * Removes all references and uploaded images from this browser. · refs: none
 * I/O types: `none -> Promise<void>`.
 */
export async function clearCustomWallpaper() {
    if (typeof window === "undefined")
        return;
    const previous = getCustomWallpapers();
    saveWallpaperReferences([]);
    await Promise.allSettled(previous.filter((wallpaper) => wallpaper.type === "upload").map((wallpaper) => removeUpload(wallpaper.id)));
    notifyWallpaperChange();
}
