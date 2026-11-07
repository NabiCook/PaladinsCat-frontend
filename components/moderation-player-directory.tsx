/** Shared active/inactive moderation directory surface. · refs: none */

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, History, ShieldAlert, type LucideIcon } from "lucide-react";
import { LoadingPanel } from "@/components/async-state";
import { PLAYER_DIRECTORY_CARD_SURFACE_CLASS } from "@/components/player-directory-grid";
import PlayerDirectoryPagination, { usePersistentDirectoryPage } from "@/components/player-directory-pagination";
import PlayerDirectorySearch from "@/components/player-directory-search";
import PlayersPageHeader from "@/components/ui/players-page-header";
import type { CheaterPortalEntry } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";

type DirectoryPage = { items: CheaterPortalEntry[]; total: number };
type DirectoryFetcher = (params: { q?: string; limit?: number; offset?: number }) => Promise<DirectoryPage>;
type Accent = "red" | "orange" | "violet";

const PAGE_SIZE = 24;

const styles: Record<Accent, {
  icon: string;
  border: string;
  hover: string;
  titleClass: string;
  arrow: string;
  Icon: LucideIcon;
}> = {
  red: {
    icon: "text-red-300",
    border: "border-red-400/25",
    hover: "hover:border-red-400/60 hover:bg-red-500/[0.05]",
    titleClass: "group-hover:text-red-100",
    arrow: "group-hover:text-red-200",
    Icon: ShieldAlert,
  },
  orange: {
    icon: "text-orange-300",
    border: "border-orange-400/25",
    hover: "hover:border-orange-400/60 hover:bg-orange-500/[0.05]",
    titleClass: "group-hover:text-orange-100",
    arrow: "group-hover:text-orange-200",
    Icon: ShieldAlert,
  },
  violet: {
    icon: "text-violet-300",
    border: "border-pc-border",
    hover: "hover:border-violet-400/50 hover:bg-violet-500/[0.05]",
    titleClass: "group-hover:text-violet-100",
    arrow: "group-hover:text-violet-200",
    Icon: History,
  },
};

function entryHref(entry: CheaterPortalEntry): string {
  if (entry.kind === "private") return `/players/private-tracking/${encodeURIComponent(entry.subjectId)}`;
  return `/evidence/${encodeURIComponent(String(entry.playerId ?? entry.subjectId))}`;
}

/**
 * Render one database-ordered active or inactive moderation directory. The
 * component deliberately renders the response order as received; sorting is
 * a backend contract and must not be recreated from incomplete client data.
 * I/O: in `{ title: ReactNode, searchLabel: string, countLabel: (total: number) => string, errorLabel: string, emptyLabel: string, fallbackReason: string, fetchPage: DirectoryFetcher, accent: Accent, inactive?: boolean }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function ModerationPlayerDirectory({
  title,
  searchLabel,
  countLabel,
  errorLabel,
  emptyLabel,
  fallbackReason,
  fetchPage,
  accent,
  inactive = false,
}: {
  title: ReactNode;
  searchLabel: string;
  countLabel: (total: number) => string;
  errorLabel: string;
  emptyLabel: string;
  fallbackReason: string;
  fetchPage: DirectoryFetcher;
  accent: Accent;
  inactive?: boolean;
}) {
  const { formatDateTime, t } = useLocalization();
  const [page, setPage] = usePersistentDirectoryPage();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<CheaterPortalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const style = styles[accent];
  const Icon = style.Icon;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPage({ q: debouncedQuery, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
        setError(false);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedQuery, fetchPage, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={title} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PlayerDirectorySearch label={searchLabel} value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
        <span className="text-xs text-pc-text-muted">{countLabel(total)}</span>
      </div>
      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorLabel}</div>}
      {loading && items.length === 0 ? <LoadingPanel compact /> : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pc-border bg-pc-bg-elevated px-4 py-12 text-center text-sm text-pc-text-muted">{emptyLabel}</div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 ${inactive ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"} ${loading ? "opacity-60" : ""}`}>
          {items.map((entry) => (
            <Link key={`${entry.kind}:${entry.subjectId}`} href={entryHref(entry)} className={`group ${PLAYER_DIRECTORY_CARD_SURFACE_CLASS} ${inactive ? "" : "flex min-h-24 items-center justify-between"} gap-3 ${style.border} p-4 duration-[200ms] ${style.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent`}>
              <div className="flex min-w-0 items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.icon}`} aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className={`truncate text-sm font-semibold text-pc-text ${style.titleClass}`}>{entry.name}</h2>
                  <p className="mt-1 truncate text-xs text-pc-text-secondary">{entry.reason || fallbackReason}</p>
                  {inactive && <p className="mt-2 text-xs text-pc-text-muted">{t("moderation.lastObserved", { value1: formatDateTime(entry.lastSeen) })}</p>}
                </div>
              </div>
              {!inactive && <ArrowRight className={`h-4 w-4 shrink-0 text-pc-text-muted transition-[transform,color] duration-[120ms] group-hover:translate-x-1 ${style.arrow}`} aria-hidden="true" />}
            </Link>
          ))}
        </div>
      )}
      <PlayerDirectoryPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
