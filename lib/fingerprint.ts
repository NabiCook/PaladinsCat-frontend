/**
 * Pseudonymized browser-fingerprint inputs for security access capture. The
 * backend hashes these (never stores them raw) into a versioned browser
 * signature for cross-account correlation. Coarse, non-identifying device
 * characteristics only: no pixel, geolocation, or storage-derived values.
 *
 * refs: doc: documents/02-technical/security/security-access-capture.md
 */

/** Request header carrying the screen fingerprint field.
 *
 * refs: none
 */
export const FP_SCREEN_HEADER = "x-paladinscat-fp-screen";
/** Request header carrying the timezone fingerprint field.
 *
 * refs: none
 */
export const FP_TIMEZONE_HEADER = "x-paladinscat-fp-timezone";
/** Request header carrying the platform fingerprint field.
 *
 * refs: none
 */
export const FP_PLATFORM_HEADER = "x-paladinscat-fp-platform";

/**
 * First-party cookie carrying the fingerprint for top-level navigations
 * (e.g. the OIDC login callback), where custom request headers are not sent.
 * Non-httpOnly so client JS can set it; the value is coarse device data, not a
 * credential. Fields are URL-encoded then joined with "+" — a valid cookie
 * octet that encodeURIComponent never emits (it escapes "+" to "%2B"), so the
 * split stays unambiguous and timezone values containing "/" round-trip cleanly.
 *
 * refs: none
 */
export const FP_COOKIE = "pc_fp";

const MAX_LEN = 128;
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // align with 30-day retention

/** Trim + cap a value; return empty string when unavailable. */
function bound(value: string | undefined | null): string {
  if (!value) return "";
  return value.trim().slice(0, MAX_LEN);
}

/** Compute the three non-header fingerprint fields from the live browser.
 *
 * I/O: in () -> out { screen: string; timezone: string; platform: string }
 *
 * refs: none
 */
export function fingerprintFields(): {
  screen: string;
  timezone: string;
  platform: string;
} {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { screen: "", timezone: "", platform: "" };
  }
  let screen = "";
  try {
    if (window.screen && window.screen.width > 0 && window.screen.height > 0) {
      screen = `${window.screen.width}x${window.screen.height}`;
    }
  } catch {
    screen = "";
  }
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    timezone = "";
  }
  const platform = navigator.platform || "";
  return {
    screen: bound(screen),
    timezone: bound(timezone),
    platform: bound(platform),
  };
}

/** Build the fingerprint headers to attach to a security-relevant request.
 *
 * I/O: in () -> out Record<string, string>
 *
 * refs: none
 */
export function fingerprintHeaders(): Record<string, string> {
  const { screen, timezone, platform } = fingerprintFields();
  const headers: Record<string, string> = {};
  if (screen) headers[FP_SCREEN_HEADER] = screen;
  if (timezone) headers[FP_TIMEZONE_HEADER] = timezone;
  if (platform) headers[FP_PLATFORM_HEADER] = platform;
  return headers;
}

/** Serialize the fingerprint fields into the cookie value.
 *
 * I/O: in (fields: { screen, timezone, platform: string }) -> out string
 *
 * refs: none
 */
export function fingerprintCookieValue(
  fields: { screen: string; timezone: string; platform: string },
): string {
  return [
    encodeURIComponent(fields.screen),
    encodeURIComponent(fields.timezone),
    encodeURIComponent(fields.platform),
  ].join("+");
}

/**
 * Set the first-party fingerprint cookie from the live browser. Safe to call
 * repeatedly; no-op on the server. Returns false when nothing could be set.
 *
 * I/O: in () -> out boolean
 *
 * refs: none
 */
export function setFingerprintCookie(): boolean {
  if (typeof document === "undefined") return false;
  const { screen, timezone, platform } = fingerprintFields();
  if (!screen && !timezone && !platform) return false;
  document.cookie = [
    `${FP_COOKIE}=${fingerprintCookieValue({ screen, timezone, platform })}`,
    "path=/",
    "max-age=" + COOKIE_MAX_AGE_SECONDS,
    "samesite=lax",
    "secure",
  ].join("; ");
  return true;
}

/**
 * Parse a fingerprint cookie value back into its three fields.
 *
 * I/O: in (raw: string | undefined | null) -> out { screen: string; timezone: string; platform: string }
 *
 * refs: none
 */
export function parseFingerprintCookie(
  raw: string | undefined | null,
): { screen: string; timezone: string; platform: string } {
  if (!raw) return { screen: "", timezone: "", platform: "" };
  const parts = raw.split("+");
  const decode = (value: string | undefined) => {
    if (!value) return "";
    try {
      return decodeURIComponent(value).slice(0, MAX_LEN);
    } catch {
      return "";
    }
  };
  return {
    screen: decode(parts[0]),
    timezone: decode(parts[1]),
    platform: decode(parts[2]),
  };
}
