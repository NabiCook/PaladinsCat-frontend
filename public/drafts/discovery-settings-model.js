// Browser export of canonical preference helpers. Regenerate from the named owners.
// Source: lib/lite-mode.ts SHA256 9c40cb7a5f944f2ab42abd66b75c72e82d50334f28021e393ed9b9515d2371f4
export const LITE_MODE_STORAGE_KEY = "paladinscat-lite-mode";
export const LITE_MODE_CHANGE_EVENT = "paladinscat:lite-mode-change";
export function getLiteMode() {
    if (typeof window === "undefined")
        return false;
    try {
        return window.localStorage.getItem(LITE_MODE_STORAGE_KEY) === "1";
    }
    catch {
        return false;
    }
}
export function setLiteMode(enabled) {
    try {
        if (enabled)
            window.localStorage.setItem(LITE_MODE_STORAGE_KEY, "1");
        else
            window.localStorage.removeItem(LITE_MODE_STORAGE_KEY);
    }
    catch {
    }
    window.dispatchEvent(new Event(LITE_MODE_CHANGE_EVENT));
}

// Source: lib/time-zone.ts SHA256 bd16e7061e92ca977e2d19e8f578f7bd17d16a384527f5dfeecd2836bf97c846
"use client";
export const TIME_ZONE_STORAGE_KEY = "pc_time_zone";
const FALLBACK_TIME_ZONE = "UTC";
const FIXED_UTC_OFFSET_MINUTES = [
    -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60,
    0,
    60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570,
    600, 630, 660, 690, 720, 765, 780, 840,
];
export function isValidTimeZone(value) {
    if (!value || value.length > 64)
        return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    }
    catch {
        return false;
    }
}
function browserTimeZone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(detected) ? detected : FALLBACK_TIME_ZONE;
}
export function getPreferredTimeZone() {
    if (typeof window === "undefined")
        return FALLBACK_TIME_ZONE;
    const stored = localStorage.getItem(TIME_ZONE_STORAGE_KEY);
    return isValidTimeZone(stored) ? stored : browserTimeZone();
}
export function savePreferredTimeZone(timeZone) {
    if (typeof window !== "undefined" && isValidTimeZone(timeZone)) {
        localStorage.setItem(TIME_ZONE_STORAGE_KEY, timeZone);
    }
}
export function getSupportedTimeZones() {
    const supported = typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"];
    return Array.from(new Set(["UTC", ...supported])).sort();
}
export function getFixedUtcOffsetOptions() {
    return FIXED_UTC_OFFSET_MINUTES.map((minutes) => ({
        value: String(minutes),
        label: formatUtcOffset(minutes),
    }));
}
export function fixedUtcOffsetToTimeZone(minutes) {
    if (minutes === 0)
        return "UTC";
    const sign = minutes < 0 ? "-" : "+";
    const absolute = Math.abs(minutes);
    return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
function formatUtcOffset(minutes) {
    if (minutes === 0)
        return "UTC±00:00";
    const sign = minutes < 0 ? "−" : "+";
    const absolute = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
export function fixedUtcOffsetFromTimeZone(timeZone) {
    if (timeZone === "UTC")
        return "0";
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(timeZone);
    if (!match)
        return "";
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return String(match[1] === "-" ? -minutes : minutes);
}

// Source: lib/wallpaper-preference.ts (selected wallpaper toggle exports) SHA256 d6f29d4ac2b208f43e29d682d550340507ac1ff3481078453e9a8e79ef509dff
export const WALLPAPER_STORAGE_KEY = "paladinscat-wallpaper-enabled";
export const WALLPAPER_CHANGE_EVENT = "paladinscat:wallpaper-change";
function notifyWallpaperChange() {
    window.dispatchEvent(new Event(WALLPAPER_CHANGE_EVENT));
}
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
export function setWallpaperEnabled(enabled) {
    try {
        window.localStorage.setItem(WALLPAPER_STORAGE_KEY, String(enabled));
    }
    catch {
    }
    notifyWallpaperChange();
}
