/**
 * Maintenance privacy consent — non-modal banner and settings panel.
 *
 * Owns `MaintenanceConsentPanel` (configurable) and `MaintenanceConsentBanner`
 * (login-page overlay). Reads consent choice from context; no data fetch.
 *
 * refs: none
 */
"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { useMaintenanceConsent } from "@/lib/maintenance-consent-context";
import { useLocalization } from "@/lib/localization-context";

const button = "min-h-11 flex-1 rounded-lg border border-pc-border bg-pc-bg-elevated px-4 py-2 text-sm font-medium text-pc-text hover:bg-pc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pc-accent disabled:opacity-50";

/**
 * Non-modal, equally weighted choices. Dismissal/navigation never grants consent.
 * I/O: in `{ settings?: boolean }` -> out `JSX.Element | null`.
 *
 * refs: none
 */
export function MaintenanceConsentPanel({ settings = false }: { settings?: boolean }) {
  const { t } = useLocalization();
  const { choice, ready, saving, error, choose, reload } = useMaintenanceConsent();
  if (!settings && (!ready || choice?.decision !== "unset")) return null;
  return <section id={settings ? "maintenance-privacy" : undefined} aria-labelledby={settings ? "maintenance-setting-title" : "maintenance-banner-title"}
    className={settings ? "pc-card p-5 space-y-3" : "pc-card mx-auto max-w-5xl p-4 shadow-xl sm:p-5"}>
    <div className="flex items-start gap-3">
      <Clock3 size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-pc-text-muted" />
      <div className="min-w-0 flex-1 space-y-3">
        <h2 id={settings ? "maintenance-setting-title" : "maintenance-banner-title"} className="font-semibold text-pc-text">{t("maintenanceConsent.title")}</h2>
        <p className="text-sm text-pc-text-secondary">{t("maintenanceConsent.description")}</p>
        <p className="text-xs text-pc-text-secondary">{t("maintenanceConsent.scope")}</p>
        <p className="text-xs text-pc-text-secondary">{t("maintenanceConsent.security")}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/privacy#maintenance-presence" className="text-pc-accent underline underline-offset-4">{t("maintenanceConsent.details")}</Link>
          {!settings && <Link href="/account#maintenance-privacy" className="text-pc-accent underline underline-offset-4">{t("maintenanceConsent.settings")}</Link>}
        </div>
        {settings && <p role="status" className="text-sm text-pc-text">{t(!ready ? "maintenanceConsent.loading" : choice?.decision === "accepted" ? "maintenanceConsent.enabled" : choice?.decision === "declined" ? "maintenanceConsent.disabled" : "maintenanceConsent.unset")}</p>}
        {error && <p role="alert" className="text-sm text-red-400">{t("maintenanceConsent.error")}</p>}
        {!ready && settings ? <button type="button" className={button} onClick={reload}>{t("maintenanceConsent.retry")}</button> :
          <div className="flex flex-col gap-2 sm:flex-row" aria-busy={saving}>
            <button type="button" className={button} disabled={saving} onClick={() => void choose(false, settings ? "account_settings" : "login_banner")}>{t("maintenanceConsent.decline")}</button>
            <button type="button" className={button} disabled={saving} onClick={() => void choose(true, settings ? "account_settings" : "login_banner")}>{t("maintenanceConsent.allow")}</button>
          </div>}
        {saving && <p role="status" className="text-xs text-pc-text-secondary">{t("maintenanceConsent.saving")}</p>}
      </div>
    </div>
  </section>;
}

/**
 * Render the fixed login-page consent banner; hidden once a choice is recorded.
 * I/O: in () -> out `JSX.Element | null`.
 *
 * refs: none
 */
export function MaintenanceConsentBanner() {
  const { choice, ready } = useMaintenanceConsent();
  if (!ready || choice?.decision !== "unset") return null;
  return <div className="fixed inset-x-0 bottom-20 z-40 max-h-[calc(100svh-7rem)] overflow-y-auto px-3 lg:bottom-4" data-maintenance-consent-banner><MaintenanceConsentPanel /></div>;
}
