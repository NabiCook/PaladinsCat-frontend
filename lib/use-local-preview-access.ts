/** Opt-in, loopback-only development access for frontend previews without OIDC.
 *
 * refs: none
 */
"use client";

import { useSyncExternalStore } from "react";
import { localPreviewAccessAllowed } from "./local-preview-access";

const subscribe = () => () => {};
const serverSnapshot = () => false;

/** Read the actual browser host; cookies/query parameters cannot enable the bypass.
 *
 * I/O: in () -> out boolean
 *
 * refs: none
 */
export function localPreviewAccessEnabled(): boolean {
  return typeof window !== "undefined" && localPreviewAccessAllowed(
    process.env.NODE_ENV, process.env.NEXT_PUBLIC_LOCAL_AUTH_BYPASS, window.location.hostname,
  );
}

/** Hydrate the preview gate without pretending the visitor is an authenticated account.
 *
 * I/O: in () -> out boolean
 *
 * refs: none
 */
export function useLocalPreviewAccess(): boolean {
  return useSyncExternalStore(subscribe, localPreviewAccessEnabled, serverSnapshot);
}
