/**
 * Published cheater evidence viewer and approved-submitter form.
 *
 * refs: *   doc: documents/05-operations/records/cheater-evidence-portal-test-status.md
 *   endpoints: GET /cheaters/evidence, POST /cheaters/evidence, GET /cheaters/evidence/{id}/file
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileImage, Plus, ShieldCheck } from "lucide-react";
import { LoadingPanel } from "@/components/async-state";
import CheaterEvidencePost from "@/components/cheater-evidence-post";
import PlayerDirectoryPagination, { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { fetchCheaterEvidence, type CheaterEvidence } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useLocalization } from "@/lib/localization-context";

const PAGE_SIZE = 12;

/**
 * Render the published evidence listing and approved-submitter form.
 *
 * Contract: no input → output `JSX.Element`; reads auth/API state and submits
 * approved multipart evidence through the evidence API.
 *
 * refs: endpoints: GET /cheaters/evidence · endpoints: POST /cheaters/evidence
 * I/O types: `none -> JSX.Element`.
 */
export default function CheaterEvidencePage() {
  const { isAdmin } = useAuth();
  const { formatDateTime, formatNumber, t } = useLocalization();
  const [page, setPage] = usePersistentDirectoryPage();
  const [items, setItems] = useState<CheaterEvidence[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvidence = useCallback(
    () => fetchCheaterEvidence({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [page],
  );

  useEffect(() => {
    let active = true;
    loadEvidence()
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((cause) => {
        if (active) setError(formatApiErrorMessage(cause, t, t("moderation.evidencePortalLoadFailed")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadEvidence, t]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("moderation.evidencePortal")} actions={<><Link href="/evidence/submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-pc-accent px-4 py-2 text-sm font-semibold text-black"><Plus className="h-4 w-4" aria-hidden="true" />{t("moderation.submitEvidence")}</Link>{isAdmin && <Link href="/evidence/review" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-pc-border px-4 py-2 text-sm font-semibold text-pc-text"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t("moderation.reviewQueue")}</Link>}</>} />
      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="flex items-center justify-between gap-3 text-xs text-pc-text-muted">
        <span className="inline-flex items-center gap-1.5"><FileImage className="h-4 w-4" aria-hidden="true" />{t("moderation.evidenceCount", { value1: formatNumber(total) })}</span>
      </div>
      {loading && items.length === 0 ? <LoadingPanel compact /> : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pc-border bg-pc-bg-elevated px-4 py-12 text-center text-sm text-pc-text-muted">{t("moderation.noEvidenceYet")}</div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
          {items.map((item) => <CheaterEvidencePost key={item.id} item={item} formatDateTime={formatDateTime} />)}
        </div>
      )}
      <PlayerDirectoryPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
