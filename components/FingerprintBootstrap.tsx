/**
 * Client-side fingerprint bootstrap — sets the first-party fingerprint cookie.
 *
 * Owns the `FingerprintBootstrap` component, mounted once on protected client
 * routes to record a coarse device signature. No visual rendering, no fetch.
 *
 * refs: doc: documents/02-technical/security/security-access-capture.md
 */
"use client";

import { useEffect } from "react";
import { setFingerprintCookie } from "@/lib/fingerprint";

/**
 * Sets the first-party browser-fingerprint cookie on first client mount so it
 * is present for subsequent requests, including the OIDC login callback
 * (a top-level navigation that cannot carry custom request headers).
 *
 * Coarse, pseudonymized device characteristics only (screen, timezone,
 * platform) — no pixel-level, geolocation, or storage-derived values. The
 * backend hashes these into a versioned browser signature and never stores
 * the raw values.
 *
 * I/O: in () -> out `null` (renders nothing; sets the fingerprint cookie via effect).
 *
 * refs: doc: documents/02-technical/security/security-access-capture.md
 */
export default function FingerprintBootstrap() {
  useEffect(() => {
    setFingerprintCookie();
  }, []);
  return null;
}
