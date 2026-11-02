/**
 * Role-authorized invitation issuance and revocation.
 *
 * refs: none
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, RefreshCw } from "lucide-react";
import { LoadingPanel, LoadingIndicator } from "@/components/async-state";
import { useAuth } from "@/lib/auth-context";
import { expireAdminInvitation, getAdminInvitations, getInvitationPolicy, setInvitationPolicy, issueAdminInvitation, type AdminInvitation, type InvitationPolicy } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";

/**
 * Render the admin invitation issuance/revocation page.
 * I/O: in () -> out `JSX.Element`.
 *
 * refs: none
 */
export default function InvitationsAdminPage() {
  const { t, formatDateTime } = useLocalization();
  const { isLoading, isAdmin, refresh } = useAuth();
  const [items, setItems] = useState<AdminInvitation[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [policy, setPolicy] = useState<InvitationPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [response, policy] = await Promise.all([getAdminInvitations(page), getInvitationPolicy()]);
      setItems(response.items);
      setHasMore(response.has_more);
      setPolicy(policy);
      setError(null);
    } catch { setError(t("invitation.adminLoadFailed")); }
    finally { setLoading(false); }
  }, [isAdmin, page, t]);
  useEffect(() => { if (!isLoading && isAdmin) void load(); }, [isLoading, isAdmin, load]);

  const toggleRequirement = async () => {
    if (!policy) return;
    setBusy(true);
    setError(null);
    try { setPolicy(await setInvitationPolicy(!policy.enabled)); await refresh(); }
    catch { setError(t("invitation.policySaveFailed")); }
    finally { setBusy(false); }
  };

  const issue = async () => {
    setBusy(true);
    setError(null);
    setCode(null);
    try {
      setCode((await issueAdminInvitation()).code);
      if (page === 1) await load(); else setPage(1);
    } catch { setError(t("invitation.issueFailed")); }
    finally { setBusy(false); }
  };
  const expire = async (id: number) => {
    setBusy(true);
    setError(null);
    try { await expireAdminInvitation(id); await load(); }
    catch { setError(t("invitation.expireFailed")); }
    finally { setBusy(false); }
  };

  if (isLoading) return <LoadingPanel />;
  if (!isAdmin) return <div role="alert" className="rounded-xl border border-red-500/30 p-6 text-sm text-red-400">{t("generated.admin.accessDenied")}</div>;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/admin" className="text-sm text-pc-accent">{t("invitation.backToAdmin")}</Link><h1 className="pc-heading pc-heading-lg mt-2 flex items-center gap-2"><KeyRound aria-hidden="true" className="h-6 w-6" />{t("invitation.adminTitle")}</h1><p className="mt-2 text-sm text-pc-text-secondary">{t("invitation.adminDescription")}</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => { setLoading(true); setError(null); void load(); }} disabled={busy || loading} className="pc-btn-secondary disabled:opacity-50"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("invitation.retry")}</button><button type="button" onClick={() => void issue()} disabled={busy} className="pc-btn-primary disabled:opacity-50">{busy ? <LoadingIndicator /> : t("invitation.issue")}</button></div>
      </header>
      <section className="rounded-xl border border-pc-border bg-pc-bg-secondary p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="invitation-policy-label" className="text-base font-semibold text-pc-text">{t("invitation.globalControl")}</h2>
          <button type="button" role="switch" aria-labelledby="invitation-policy-label" aria-describedby="invitation-policy-description" aria-checked={policy?.enabled ?? false} onClick={() => void toggleRequirement()} disabled={busy || loading || !policy} className="pc-btn-secondary disabled:opacity-50">{policy?.enabled ? t("invitation.disableRequirement") : t("invitation.enableRequirement")}</button>
        </div>
        <p id="invitation-policy-description" className="mt-3 text-sm text-pc-text-secondary">{t(policy?.enabled ? "invitation.requirementEnabled" : "invitation.requirementDisabled")}</p>
      </section>
      {code && <section aria-live="polite" className="rounded-xl border border-pc-accent/40 bg-pc-accent/10 p-5"><h2 className="text-base font-semibold text-pc-text">{t("invitation.newCode")}</h2><p className="mt-1 text-sm text-pc-text-secondary">{t("invitation.showOnce")}</p><div className="mt-3 break-all rounded-lg bg-pc-bg p-3 font-mono text-base text-pc-text">{code}</div></section>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {loading ? <LoadingPanel /> : (
        <div className="overflow-x-auto rounded-xl border border-pc-border">
          <table className="w-full text-left text-sm"><thead className="bg-pc-bg-secondary text-pc-text-muted"><tr><th className="p-3">{t("invitation.id")}</th><th className="p-3">{t("invitation.issued")}</th><th className="p-3">{t("invitation.redeemedBy")}</th><th className="p-3">{t("invitation.status")}</th><th className="p-3">{t("invitation.expiry")}</th><th className="p-3">{t("invitation.actions")}</th></tr></thead>
            <tbody>{items.length === 0 && <tr><td colSpan={6} className="p-5 text-pc-text-muted">{t("invitation.empty")}</td></tr>}{items.map((item) => <tr key={item.id} className="border-t border-pc-border text-pc-text"><td className="p-3">{item.id}</td><td className="p-3"><div>{formatDateTime(item.issued_at)}</div><div className="text-pc-text-muted">{item.issued_by_username}</div></td><td className="p-3">{item.redeemed_by_username || t("invitation.notRedeemed")}</td><td className="p-3">{t(`invitation.status.${item.status}`)}</td><td className="p-3">{item.expires_at ? formatDateTime(item.expires_at) : t("invitation.afterRedemption")}</td><td className="p-3">{(item.status === "unused" || item.status === "active") && <button type="button" onClick={() => void expire(item.id)} disabled={busy} className="pc-btn-secondary text-red-400 disabled:opacity-50" aria-label={t("invitation.expireCode", { id: item.id })}>{t("invitation.expire")}</button>}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <nav aria-label={t("invitation.pagination")} className="flex items-center justify-between gap-3"><button type="button" disabled={page === 1 || busy || loading} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="pc-btn-secondary disabled:opacity-50">{t("invitation.previous")}</button><span className="text-sm text-pc-text-muted">{t("invitation.page", { page })}</span><button type="button" disabled={!hasMore || busy || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="pc-btn-secondary disabled:opacity-50">{t("invitation.next")}</button></nav>
    </div>
  );
}
