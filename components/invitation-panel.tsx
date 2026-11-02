/**
 * Account invitation entry and server-authoritative access status.
 *
 * refs: none
 */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { LoadingIndicator } from "@/components/async-state";
import { useAuth } from "@/lib/auth-context";
import { ApiRequestError, getInvitationStatus, redeemInvitation, type InvitationStatus } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";

/**
 * Render the invitation redemption panel with live status and code entry.
 * I/O: in () -> out `JSX.Element`.
 *
 * refs: none
 */
export function InvitationPanel() {
  const { t, formatDateTime } = useLocalization();
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState<InvitationStatus | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setStatus(await getInvitationStatus()); setError(null); }
    catch { setError(t("invitation.loadFailed")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load, user?.invitationActive]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStatus(await redeemInvitation(code));
      setCode("");
      await refresh();
    } catch (error) {
      setError(t(error instanceof ApiRequestError && error.code === "INVITATION_UNAVAILABLE"
        ? "invitation.unavailable" : error instanceof ApiRequestError && error.code === "INVITATION_ALREADY_ACTIVE"
          ? "invitation.alreadyActive" : "invitation.redeemFailed"));
    } finally { setBusy(false); }
  };

  return (
    <section id="invitation" className="mt-6 scroll-mt-24 rounded-2xl border border-pc-border bg-pc-bg-elevated p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-pc-text"><KeyRound aria-hidden="true" className="h-5 w-5 text-pc-accent" />{t("invitation.title")}</h2>
      <p className="mt-2 text-sm text-pc-text-secondary">{t("invitation.description")}</p>
      {status && <p className="mt-3 text-sm text-pc-text-secondary">{t(status.required ? "invitation.requirementEnabled" : "invitation.requirementDisabled")}</p>}
      {loading ? <div className="mt-4"><LoadingIndicator /></div> : status && (
        <div role="status" className="mt-4 rounded-xl border border-pc-border bg-pc-bg-secondary p-4 text-sm">
          <p className={status.active ? "font-semibold text-emerald-400" : "font-semibold text-pc-text"}>{t(`invitation.status.${status.status}`)}</p>
          {status.expires_at && <p className="mt-1 text-pc-text-secondary">{t("invitation.expires", { date: formatDateTime(status.expires_at) })}</p>}
          {status.active && user?.linkedPlayerId == null && <p className="mt-2 text-pc-text-secondary">{t("invitation.linkRequired")} <Link href="/link-account" className="text-pc-accent underline">{t("invitation.linkAccount")}</Link></p>}
          {status.active && user?.linkedPlayerId != null && <Link href="/stats" className="mt-2 inline-block text-pc-accent underline">{t("invitation.openStats")}</Link>}
        </div>
      )}
      {error && <div role="alert" className="mt-4 text-sm text-red-400">{error} <button type="button" onClick={() => { setLoading(true); setError(null); void load(); }} disabled={busy || loading} className="underline">{t("invitation.retry")}</button></div>}
      {!loading && status && !status.active && (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-pc-text">{t("invitation.code")}
            <input type="text" value={code} onChange={(event) => setCode(event.target.value)} maxLength={80} required autoComplete="off" spellCheck={false} autoCapitalize="characters" disabled={busy} className="mt-2 block w-full rounded-xl border border-pc-border bg-pc-bg-secondary px-3 py-2 text-base text-pc-text focus:outline-none focus:ring-2 focus:ring-pc-accent/50" />
          </label>
          <button type="submit" disabled={busy || !code.trim()} className="pc-btn-primary shrink-0 disabled:opacity-50">{busy ? <LoadingIndicator /> : t("invitation.redeem")}</button>
        </form>
      )}
    </section>
  );
}
