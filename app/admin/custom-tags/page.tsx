/**
 * Admin portal: review and approve/reject player custom tag requests.
 * Approved tags display first, before all other tags, sitewide.
 *
 * refs: migrations: 241
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";
import { useEffect, useState } from "react";
import { fetchAdminCustomTags,
  reviewAdminCustomTag,
  type AdminCustomTagRow,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { LoadingPanel } from "@/components/async-state";
import { useLocalization } from "@/lib/localization-context";

/**
 * Render the admin custom-tag review page (approve/reject requests).
 * I/O: in () -> out `JSX.Element`.
 *
 * refs: migrations: 241
 */
export default function AdminCustomTagsPage() {
  const { t, formatDateTime } = useLocalization();
  const { user, isLoading } = useAuth();
  const [rows, setRows] = useState<AdminCustomTagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const isAdmin = user?.isAdmin ?? false;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminCustomTags();
      setRows(data.items);
    } catch (err) {
      setError(formatApiErrorMessage(err, t, t("moderation.customTagReviewLoadFailed")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAdmin]);

  async function review(id: number, decision: "approved" | "rejected") {
    setBusyId(id);
    setError(null);
    setStatus(null);
    try {
      const note = notes[id]?.trim();
      await reviewAdminCustomTag(id, decision, note || undefined);
      await load();
      setStatus(decision === "approved" ? t("moderation.customTagReviewApproved") : t("moderation.customTagReviewRejected"));
    } catch (err) {
      setError(formatApiErrorMessage(err, t, t("moderation.customTagReviewFailed")));
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <LoadingPanel />;
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="pc-heading pc-heading-lg">{t("moderation.customTagReviewTitle")}</h1>
        <div className="bg-pc-bg-elevated border border-red-500/30 rounded-lg p-6 text-center">
          <div className="text-lg font-bold text-red-400">{t("generated.admin.accessDenied")}</div>
          <div className="text-sm text-pc-text-muted mt-1">{t("moderation.exploitExceptions.adminOnly")}</div>
        </div>
      </div>
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  const reviewed = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="pc-heading pc-heading-lg">{t("moderation.customTagReviewTitle")}</h1>
        <p className="mt-1 text-sm text-pc-text-muted">{t("moderation.customTagReviewDescription")}</p>
      </header>

      {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
      {status && <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{status}</div>}

      <section>
        <h2 className="mb-3 text-base font-semibold text-pc-text">
          {t("moderation.customTagReviewPending")} ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-pc-border/50 px-3 py-4 text-sm text-pc-text-muted">{t("moderation.customTagReviewEmpty")}</div>
        ) : (
          <ul className="space-y-3">
            {pending.map((row) => (
              <li key={row.id} className="pc-card space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-violet-400/50 px-1.5 py-0.5 text-sm font-medium text-violet-300" style={row.tag_color ? { color: row.tag_color, borderColor: `${row.tag_color}80` } : undefined}>{row.tag_text}</span>
                  <span className="text-sm text-pc-text">{row.player_name}</span>
                  <span className="text-xs text-pc-text-muted">{t("moderation.playerId", { value1: row.player_id })}</span>
                  {row.requested_by_username && (
                    <span className="ml-auto text-xs text-pc-text-muted">
                      {t("moderation.customTagReviewRequestedBy", { value1: row.requested_by_username, value2: formatDateTime(row.created_at) })}
                    </span>
                  )}
                </div>
                {row.reason && <p className="text-xs text-pc-text-secondary">“{row.reason}”</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={notes[row.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder={t("moderation.customTagReviewNote")}
                    className="min-w-0 flex-1 rounded-md border border-pc-border/60 bg-pc-bg px-3 py-1.5 text-sm text-pc-text placeholder:text-pc-text-muted focus:border-pc-accent/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void review(row.id, "approved")}
                    className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-pc-bg hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {t("moderation.customTagReviewApprove")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void review(row.id, "rejected")}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:border-red-500/70 disabled:opacity-50"
                  >
                    {t("moderation.customTagReviewReject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-pc-text">{t("moderation.customTagReviewHistory")} ({reviewed.length})</h2>
          <ul className="space-y-2">
            {reviewed.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-pc-border/40 px-3 py-2">
                <span className="rounded border border-pc-border/50 px-1.5 py-0.5 text-xs text-pc-text-secondary" style={row.tag_color ? { color: row.tag_color, borderColor: `${row.tag_color}80` } : undefined}>{row.tag_text}</span>
                <span className="text-sm text-pc-text">{row.player_name}</span>
                <span className={`text-xs ${row.status === "approved" ? "text-emerald-400" : "text-red-400"}`}>{row.status}</span>
                {row.review_note && <span className="text-xs text-pc-text-muted">“{row.review_note}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
