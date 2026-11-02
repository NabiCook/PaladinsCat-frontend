/**
 * Submit one player-linked cheater-evidence report for moderation review.
 *
 * The route reuses the database player-search API and never exposes pending
 * evidence in the public feed.
 *
 * refs: endpoints: GET /players/search · endpoints: POST /cheaters/evidence
 */
"use client";
import { formatApiErrorMessage } from "@/lib/api-errors";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Info, Search, Send, X } from "lucide-react";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { fetchPlayerSearch, submitCheaterEvidence, type PlayerSearchResult } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useLocalization } from "@/lib/localization-context";
import SubmissionMediaFields from "@/components/submission-media-fields";

/**
 * Render the authenticated, player-linked evidence submission form.
 *
 * I/O types: input none -> output `JSX.Element`; authenticated submission
 * sends one `FormData` payload after database player selection. Development
 * may render the form without a session for visual inspection, but never
 * sends an unauthenticated request.
 *
 * refs: endpoints: GET /players/search · endpoints: POST /cheaters/evidence
 */
export default function SubmitCheaterEvidencePage() {
  const { isLoggedIn } = useAuth();
  const { t } = useLocalization();
  const canPreview = isLoggedIn || process.env.NODE_ENV === "development";
  const searchParams = useSearchParams();
  const presetPlayerId = searchParams.get("playerId")?.trim() ?? "";
  const loginRedirect = `/evidence/submit${presetPlayerId ? `?playerId=${encodeURIComponent(presetPlayerId)}` : ""}`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [selected, setSelected] = useState<PlayerSearchResult | null>(null);
  const [matchId, setMatchId] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected || !/^\d+$/.test(presetPlayerId)) return;
    let active = true;
    fetchPlayerSearch(presetPlayerId)
      .then((players) => {
        const player = players.find((candidate) => String(candidate.id) === presetPlayerId);
        if (!active || !player) return;
        setSelected(player);
        setQuery(player.name);
        setResults([]);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [presetPlayerId, selected]);

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      fetchPlayerSearch(query.trim()).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoggedIn) {
      setError(t("moderation.signInRequired"));
      return;
    }
    if (!selected) {
      setError(t("moderation.selectPlayerRequired"));
      return;
    }
    if (files.length === 0 && !sourceUrl.trim()) {
      setError(t("moderation.evidenceMediaRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const form = new FormData();
    form.set("player_id", String(selected.id));
    form.set("subject_name", selected.name);
    form.set("description", description);
    if (matchId.trim()) form.set("match_id", matchId.trim());
    if (sourceUrl.trim()) form.set("source_url", sourceUrl.trim());
    files.forEach((file) => form.append("images", file, file.name));
    try {
      await submitCheaterEvidence(form);
      setNotice(t("moderation.evidenceSubmitted"));
      setDescription(""); setMatchId(""); setSourceUrl(""); setFiles([]);
    } catch (submitError) {
      setError(formatApiErrorMessage(submitError, t, t("moderation.evidenceSubmitFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canPreview) {
    return <div className="space-y-6"><PlayersPageHeader title={t("moderation.submitEvidence")} /><div className="pc-card text-sm text-pc-text-secondary">{t("moderation.signInSubmitEvidence")} <Link href={`/auth/login?redirect=${encodeURIComponent(loginRedirect)}`} className="font-semibold text-pc-accent hover:text-pc-accent-secondary">{t("generated.auth.signIn.ada2e9e")}</Link></div></div>;
  }

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t("moderation.submitEvidence")} description={t("moderation.submitEvidenceDescription")} />
      {notice && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      <form onSubmit={submit} className="pc-card space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative space-y-1 text-xs font-semibold text-pc-text-secondary">
            <div className="flex items-center gap-1"><label htmlFor="evidence-player-search">{t("moderation.playerNameOrId")}</label><span className="group relative inline-flex"><button type="button" aria-label={t("moderation.playerSearchHelpLabel")} aria-describedby="evidence-player-search-help" className="inline-flex cursor-help text-pc-text-muted hover:text-pc-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent"><Info className="h-3.5 w-3.5" aria-hidden="true" /></button><span id="evidence-player-search-help" role="tooltip" className="pc-surface pointer-events-none absolute left-0 top-full z-20 mt-2 w-72 rounded-lg border border-pc-border px-3 py-2 text-xs font-normal leading-5 text-pc-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{t("moderation.playerSearchHelp")}</span></span></div>
            <span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pc-text-muted" aria-hidden="true" /><input id="evidence-player-search" value={selected ? selected.name : query} onChange={(event) => { setSelected(null); setQuery(event.target.value); }} placeholder={t("moderation.searchPlayerDatabase")} className="w-full rounded-lg border border-pc-border bg-pc-bg px-3 py-2 pl-9 text-sm font-normal text-pc-text outline-none focus:border-pc-accent-mid" /></span>
            {results.length > 0 && <span className="absolute z-10 mt-1 block w-full overflow-hidden rounded-lg border border-pc-border bg-pc-bg-elevated shadow-lg">{results.slice(0, 8).map((player) => <button key={player.id} type="button" onClick={() => { setSelected(player); setQuery(player.name); setResults([]); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-pc-bg-secondary"><span className="truncate text-pc-text">{player.name}</span><span className="shrink-0 font-mono text-xs text-pc-text-muted">{player.id}</span></button>)}</span>}
          </div>
          <label className="space-y-1 text-xs font-semibold text-pc-text-secondary">{t("moderation.matchId")}
            <input inputMode="numeric" value={matchId} onChange={(event) => setMatchId(event.target.value)} placeholder={t("moderation.optionalSupportingMatch")} className="mt-1 w-full rounded-lg border border-pc-border bg-pc-bg px-3 py-2 text-sm font-normal text-pc-text outline-none focus:border-pc-accent-mid" />
          </label>
        </div>
        {selected && <div className="flex items-center justify-between gap-3 border-l-2 border-pc-accent bg-pc-bg px-3 py-2 text-sm"><span className="min-w-0 truncate text-pc-text"><strong>{selected.name}</strong><span className="ml-2 font-mono text-xs text-pc-text-muted">{t("moderation.playerId", { value1: selected.id })}</span></span><button type="button" onClick={() => { setSelected(null); setQuery(""); }} className="text-pc-text-muted hover:text-pc-text" aria-label={t("moderation.clearSelectedPlayer")}><X className="h-4 w-4" aria-hidden="true" /></button></div>}
        <label className="block space-y-1 text-xs font-semibold text-pc-text-secondary">{t("moderation.explanation")}
          <textarea required value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4_000} rows={6} className="mt-1 w-full rounded-lg border border-pc-border bg-pc-bg px-3 py-2 text-sm font-normal leading-6 text-pc-text outline-none focus:border-pc-accent-mid" />
        </label>
        <SubmissionMediaFields
          files={files}
          sourceUrl={sourceUrl}
          onFilesChange={(next) => { setFiles(next); setError(null); }}
          onSourceUrlChange={setSourceUrl}
          onValidationError={setError}
        />
        <button type="submit" disabled={!isLoggedIn || submitting} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-pc-accent px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true" />{submitting ? t("moderation.submitting") : t("moderation.submitForReview")}</button>
      </form>
    </div>
  );
}
