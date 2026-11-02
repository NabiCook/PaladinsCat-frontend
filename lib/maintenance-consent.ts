/** Account API contract. No consent state is inferred from login or browser storage.
 *
 * refs: none
 */
import { accountAuthHeaders, fetchJson } from "@/lib/api-client";

/** Current maintenance-presence policy version pin (the consent contract gate).
 *
 * refs: none
 */
export const MAINTENANCE_POLICY_VERSION = "maintenance-presence-2026-09-16-v3";
/** Account maintenance-presence consent record (decision + policy version).
 *
 * refs: none
 */
export type MaintenanceConsent = {
  decision: "unset" | "accepted" | "declined";
  policy_version: string;
  updated_at: string | null;
};
/** Where a maintenance-presence consent decision originated.
 *
 * refs: none
 */
export type ConsentSource = "login_banner" | "account_settings";
const path = "/auth/account/maintenance-consent";

/** Report whether a stored consent choice currently allows presence pulses.
 *
 * I/O: in (choice: MaintenanceConsent | null) -> out boolean
 *
 * refs: none
 */
export function consentAllowsPresence(choice: MaintenanceConsent | null): boolean {
  return choice?.decision === "accepted" && choice.policy_version === MAINTENANCE_POLICY_VERSION;
}

/** Fetch the account's current maintenance-presence consent record.
 *
 * I/O: in (signal?: AbortSignal) -> out Promise<MaintenanceConsent>
 *
 * refs: none
 */
export function getMaintenanceConsent(signal?: AbortSignal): Promise<MaintenanceConsent> {
  return fetchJson(path, { headers: accountAuthHeaders(), cache: "no-store", retries: 0, timeoutMs: 5000, signal });
}

/** Persist a maintenance-presence consent decision for the account.
 *
 * I/O: in (enabled: boolean, source: ConsentSource) -> out Promise<MaintenanceConsent>
 *
 * refs: none
 */
export function saveMaintenanceConsent(enabled: boolean, source: ConsentSource): Promise<MaintenanceConsent> {
  return fetchJson(path, {
    method: "PUT", headers: { ...accountAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, source, policy_version: MAINTENANCE_POLICY_VERSION }),
    cache: "no-store", retries: 0, timeoutMs: 5000,
  });
}

/** Send one empty maintenance-presence pulse to the account endpoint.
 *
 * I/O: in (signal: AbortSignal) -> out Promise<unknown>
 *
 * refs: none
 */
export function sendMaintenancePresence(signal: AbortSignal): Promise<unknown> {
  return fetchJson("/auth/account/maintenance-presence", {
    method: "POST", headers: accountAuthHeaders(), cache: "no-store", referrerPolicy: "no-referrer",
    retries: 0, timeoutMs: 5000, signal,
  });
}
