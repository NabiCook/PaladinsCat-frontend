/** Local UI testing policy; never grants API privileges or production access.
 *
 * refs: none
 */

/** Allow local preview access only on a development localhost host with the flag set.
 *
 * I/O: in (mode: string | undefined, enabled: string | undefined, hostname: string) -> out boolean
 *
 * refs: none
 */
export function localPreviewAccessAllowed(mode: string | undefined, enabled: string | undefined, hostname: string): boolean {
  return mode === "development" && enabled === "1"
    && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}
