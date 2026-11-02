/**
 * Admin-only pending-evidence review queue.
 *
 * refs: migrations: 166 · endpoints: GET /cheaters/evidence/review,
 *        GET /cheaters/evidence/{id}/media/{position}, POST /cheaters/evidence/{id}/review
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, ShieldCheck, X } from "lucide-react";
import { LoadingPanel } from "@/components/async-state";
import PlayersPageHeader from "@/components/ui/players-page-header";
import {
  fetchCheaterEvidenceReview,
  fetchCheaterEvidenceReviewImage,
  reviewCheaterEvidence,
  type CheaterEvidenceReviewItem,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useLocalization } from "@/lib/localization-context";

/** Render one pending image fetched through the authenticated review endpoint. */
function PendingEvidenceImage({ evidenceId, position }: { evidenceId: string; position: number }) {
  const { formatNumber, t } = useLocalization();
  const [urls, setUrls] = useState<{ avifUrl: string; originalUrl: string } | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrls: { avifUrl: string; originalUrl: string } | null = null;
    fetchCheaterEvidenceReviewImage(evidenceId, position)
      .then((result) => {
        objectUrls = result;
        if (active) setUrls(result);
        else { URL.revokeObjectURL(result.avifUrl); URL.revokeObjectURL(result.originalUrl); }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrls) { URL.revokeObjectURL(objectUrls.avifUrl); URL.revokeObjectURL(objectUrls.originalUrl); }
    };
  }, [evidenceId, position]);

  return urls ? <picture><source srcSet={urls.avifUrl} type="image/avif" /><img src={urls.originalUrl} alt={t("moderation.pendingEvidenceImage", { value1: formatNumber(position + 1) })} className="block aspect-video w-full rounded-lg border border-pc-border object-contain" /></picture> : null;
}

/**
 * Render and transition pending reports as an administrator.
 *
 * refs: migrations: 166 · endpoints: GET /cheaters/evidence/review,
 *        POST /cheaters/evidence/{id}/review
 * I/O types: `none -> JSX.Element`.
 */
export default function CheaterEvidenceReviewPage() {
  const { isAdmin } = useAuth();
  const { formatDateTime, formatNumber, t } = useLocalization();
  const [items, setItems] = useState<CheaterEvidenceReviewItem[]>([]);
  const [reviewTags, setReviewTags] = useState<Record<string, "cheater" | "exploit" | "suspicious">>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetchCheaterEvidenceReview()
      .then(({ items: pending }) => { setItems(pending); setError(null); })
      .catch((cause) => setError(formatApiErrorMessage(cause, t, t("moderation.reviewQueueLoadFailed"))))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  async function review(id: string, decision: "approve" | "deny") {
    setWorkingId(id);
    setError(null);
    try {
      await reviewCheaterEvidence(id, decision, decision === "approve" ? reviewTags[id] ?? "cheater" : undefined);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (reviewError) {
      setError(formatApiErrorMessage(reviewError, t, t("moderation.reviewDecisionFailed")));
    } finally {
      setWorkingId(null);
    }
  }

  if (!isAdmin) {
    return <div className="space-y-6"><PlayersPageHeader title={t("moderation.evidenceReview")} /><div className="pc-card text-sm text-pc-text-secondary">{t("moderation.adminRequired")}</div></div>;
  }

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("moderation.evidenceReview")} actions={<Link href="/evidence" className="text-sm font-semibold text-pc-accent hover:text-pc-accent-secondary">{t("moderation.evidencePortal")}</Link>} />
      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading ? <LoadingPanel compact /> : items.length === 0 ? <div className="pc-card text-sm text-pc-text-muted">{t("moderation.noEvidenceForReview")}</div> : (
        <div className="space-y-4" data-testid="evidence-review-queue">
          {items.map((item) => <article key={item.id} className="pc-card space-y-4" data-testid={`evidence-review-${item.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-base font-semibold text-pc-text">{item.subjectName}</h2><p className="text-xs text-pc-text-muted">{t("moderation.submittedBy", { value1: item.submittedBy, value2: formatDateTime(item.createdAt) })}</p></div>
              <span className="inline-flex items-center gap-1.5 text-xs text-pc-text-muted"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{item.imageCount === 1 ? t("moderation.singleImage") : t("moderation.imageCount", { value1: formatNumber(item.imageCount) })}</span>
            </div>
            {item.description && <p className="text-sm leading-6 text-pc-text-secondary">{item.description}</p>}
            {item.matchId && <p className="text-xs text-pc-text-muted">{t("moderation.supportingMatchNumber", { value1: item.matchId })}</p>}
            {item.imageCount > 0 && <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: item.imageCount }, (_, position) => <PendingEvidenceImage key={position} evidenceId={item.id} position={position} />)}</div>}
            {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-pc-accent hover:text-pc-accent-secondary"><ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("moderation.openSubmittedSource")}</a>}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-pc-border pt-4">
              <label className="mr-auto flex items-center gap-2 text-sm text-pc-text-secondary">
                <span className="sr-only">{t("moderation.evidenceReview")}</span>
                <select
                  aria-label={t("moderation.evidenceReview")}
                  value={reviewTags[item.id] ?? "cheater"}
                  onChange={(event) => setReviewTags((current) => ({ ...current, [item.id]: event.target.value as "cheater" | "exploit" | "suspicious" }))}
                  disabled={workingId === item.id}
                  className="min-h-10 rounded-lg border border-pc-border bg-pc-bg px-3 py-2 text-sm text-pc-text"
                >
                  <option value="cheater">{t("moderation.confirmedCheater")}</option>
                  <option value="exploit">{t("moderation.exploiterShort")}</option>
                  <option value="suspicious">{t("moderation.suspiciousReviewOption")}</option>
                </select>
              </label>
              <button type="button" disabled={workingId === item.id} onClick={() => void review(item.id, "deny")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-400/35 px-3 py-2 text-sm font-semibold text-red-200 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" />{t("moderation.deny")}</button>
              <button type="button" disabled={workingId === item.id} onClick={() => void review(item.id, "approve")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-pc-accent px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true" />{t("moderation.approve")}</button>
            </div>
          </article>)}
        </div>
      )}
    </div>
  );
}
