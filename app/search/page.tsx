/**
 * Render the search page and its data composition.
 * Assemble the page content exposed at this location.
 * refs: none
 */
"use client";

import { memo, Suspense, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  fetchUniversalSearch,
  fetchArchivedMatchSearch,
  type UniversalSearchResult,
  type UniversalSearchResponse,
  type UniversalSearchRemoteTarget,
  type UniversalSearchType,
} from "@/lib/api-client";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { AsyncButton, EmptyState, ErrorState, LoadingPanel } from "@/components/async-state";
import { RouteSkeleton } from "@/components/route-skeleton";
import { PlayerSearchSubtitle } from "@/components/player-search-result";
import { useLocalization } from "@/lib/localization-context";
import { loadStaticReferenceIndex, staticReferenceResults } from "@/lib/search-reference";
import {
  createInitialSearchState,
  mergeResults,
  searchReducer,
  typeSort,
} from "@/lib/search-state";
import { ArrowRight, Search, X } from "lucide-react";

const TYPE_LABEL: Record<UniversalSearchType, string> = {
  player: "Player",
  match: "Match",
  champion: "Champion",
  item: "Item",
  card: "Card",
  talent: "Talent",
};

const TYPE_STYLE: Record<UniversalSearchType, string> = {
  player: "border-pc-accent/30 bg-pc-accent/10 text-pc-accent",
  match: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  champion: "border-pc-accent-alt/30 bg-pc-accent-alt/10 text-pc-accent-alt",
  item: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  card: "border-pc-accent-third/30 bg-pc-accent-third/10 text-pc-accent-third",
  talent: "border-rose-400/30 bg-rose-400/10 text-rose-300",
};


function resultInitial(type: UniversalSearchType) {
  return TYPE_LABEL[type].slice(0, 1);
}

function isNumericQuery(value: string) {
  return /^\d{2,}$/.test(value.trim());
}

function isLikelyMatchId(value: string) {
  const q = value.trim();
  return /^\d{10,13}$/.test(q) && Number(q) >= 1_000_000_000;
}

function canRemotePlayerNameLookup(value: string) {
  const q = value.trim();
  if (/^(xbox|xbl|psn|ps|playstation|switch|nintendo)[:/].{2,64}$/i.test(q)) {
    return !/[,%*?]/.test(q);
  }
  return q.length >= 3 && q.length <= 32 && !/^\d+$/.test(q) && !/[,%*?]/.test(q);
}

function ResultIcon({ result }: { result: UniversalSearchResult }) {
  if (result.type === "champion") {
    return (
      <img
        src={getChampionIconSafe(result.title)}
        alt=""
        className="h-10 w-10 rounded-lg object-contain bg-pc-bg border border-pc-border"
        loading="lazy"
      />
    );
  }

  const championName = typeof result.meta?.championName === "string" ? result.meta.championName : null;
  if ((result.type === "card" || result.type === "talent") && championName) {
    return (
      <img
        src={getChampionIconSafe(championName)}
        alt=""
        className="h-10 w-10 rounded-lg object-contain bg-pc-bg border border-pc-border"
        loading="lazy"
      />
    );
  }

  return (
    <div className="h-10 w-10 rounded-lg bg-pc-bg border border-pc-border flex items-center justify-center text-xs font-bold text-pc-accent">
      {resultInitial(result.type)}
    </div>
  );
}

function remoteLookupNotice(target: UniversalSearchRemoteTarget, remote: UniversalSearchResponse["remote"]) {
  if (!remote) return null;
  if (remote.skipped) {
    return null;
  }
  if (remote.status === "hit") {
    if (target === "match-id") {
      return "Match found.";
    }
    return "Result found.";
  }
  if (remote.status === "miss") {
    if (target === "match-id") {
      return "No match found for this ID.";
    }
    return "No result found.";
  }
  if (remote.status === "error") {
    return "Search is temporarily unavailable.";
  }
  return null;
}

const SearchResultGroups = memo(function SearchResultGroups({
  grouped,
}: {
  grouped: Array<[UniversalSearchType, UniversalSearchResult[]]>;
}) {
  const { t } = useLocalization();
  if (grouped.length === 0) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      {grouped.map(([type, rows]) => (
        <section key={type} className="space-y-2.5">
          <div className="flex items-center gap-2 px-1.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-pc-text-secondary">{TYPE_LABEL[type]}</h2>
            <span className="rounded-full border border-pc-border/70 bg-pc-bg-elevated/80 px-2 py-0.5 text-xs tabular-nums text-pc-text-muted">{rows.length}</span>
          </div>
          <div className="space-y-2.5">
            {rows.map((result) => (
              <Link
                key={`${result.type}-${result.id}-${result.href}`}
                href={result.href}
                className="pc-search-result group relative flex items-center gap-3 overflow-hidden rounded-xl border border-pc-border bg-pc-bg-elevated/90 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-pc-accent-mid"
              >
                <ResultIcon result={result} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-pc-text group-hover:text-pc-accent transition-colors">
                      {result.title}
                    </span>
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full border ${TYPE_STYLE[result.type]}`}>
                      {result.type === "match" && result.meta?.isCustom === true
                        ? t("generated.operations.projectsCustom")
                        : TYPE_LABEL[result.type]}
                    </span>
                  </div>
                  <p className="truncate text-xs text-pc-text-muted mt-1">
                    <PlayerSearchSubtitle result={result} />
                  </p>
                </div>
                <span className="shrink-0 text-lg text-pc-text-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-pc-accent" aria-hidden="true"><ArrowRight aria-hidden="true" size={16} className="inline shrink-0 align-middle" /></span>
                <span className="sr-only">{t("generated.search.view")}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});

function SearchPageBody() {
  const { t } = useLocalization();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [state, dispatch] = useReducer(searchReducer, initialQuery, createInitialSearchState);
  const deferredQuery = useDeferredValue(state.query);
  // Mirror the reducer's generation into a ref so the debounced effect can read
  // the latest generation without re-running on every keystroke.
  const generationRef = useRef(0);
  const archiveRequest = useRef<AbortController | null>(null);
  const [archiveLookup, setArchiveLookup] = useState<{ query: string; loading: boolean; error: string | null }>({ query: "", loading: false, error: null });

  useEffect(() => {
    archiveRequest.current?.abort();
    setArchiveLookup({ query: "", loading: false, error: null });
    return () => archiveRequest.current?.abort();
  }, [state.query]);

  async function searchOlderMatch() {
    const query = state.query.trim(), generation = state.generation;
    if (!isLikelyMatchId(query)) return;
    archiveRequest.current?.abort();
    const controller = new AbortController();
    archiveRequest.current = controller;
    setArchiveLookup({ query, loading: true, error: null });
    try {
      const response = await fetchArchivedMatchSearch(query, controller.signal);
      if (controller.signal.aborted || generationRef.current !== generation) return;
      dispatch({ type: "search-append", generation, results: response.data });
      setArchiveLookup({ query, loading: false, error: response.data.length ? null : t("history.noOlderMatches") });
    } catch (cause) {
      if (!controller.signal.aborted && generationRef.current === generation) setArchiveLookup({ query, loading: false, error: cause instanceof Error ? cause.message : t("generated.search.searchUnavailable") });
    }
  }

  useEffect(() => {
    generationRef.current = state.generation;
  }, [state.generation]);

  // Initialize the input from ?q= exactly once. useSearchParams can be empty on
  // the first render and populate after hydration, so wait for a non-empty
  // value — but never re-sync the URL back into the input afterwards.
  // A query already available on the first render initialized the reducer;
  // do not dispatch the same query again and invalidate its in-flight result.
  const initializedRef = useRef(Boolean(initialQuery));
  useEffect(() => {
    if (initializedRef.current) return;
    if (!initialQuery) return;
    initializedRef.current = true;
    dispatch({ type: "set-query", query: initialQuery });
  }, [initialQuery]);

  useEffect(() => {
    const q = deferredQuery.trim();
    const generation = generationRef.current;
    if (q.length < 2 && !/^\d+$/.test(q)) {
      dispatch({ type: "search-empty" });
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "search-start", generation });
      const staticResultsPromise = loadStaticReferenceIndex()
        .then((index) => staticReferenceResults(q, index))
        .catch(() => [] as UniversalSearchResult[]);
      fetchUniversalSearch(q, 36).catch((): UniversalSearchResponse => ({
        query: q,
        total: 0,
        data: [],
      }))
        .then((response) => {
          dispatch({
            type: "search-result",
            generation,
            results: mergeResults(response.data).slice(0, 48),
            remoteNotice: isLikelyMatchId(q) ? remoteLookupNotice("match-id", response.remote) : null,
          });
          return staticResultsPromise.then((staticResults) => {
            dispatch({ type: "search-append", generation, results: staticResults });
          });
        })
        .catch(() => {
          dispatch({ type: "search-error", generation, error: t("generated.search.searchUnavailable") });
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [deferredQuery]);

  const grouped = useMemo(() => {
    const byType = new Map<UniversalSearchType, UniversalSearchResult[]>();
    for (const result of state.results) {
      const list = byType.get(result.type) ?? [];
      list.push(result);
      byType.set(result.type, list);
    }
    return Array.from(byType.entries()).sort(([a], [b]) => typeSort(a) - typeSort(b));
  }, [state.results]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = state.query.trim();
    if (!q) return;
    window.history.replaceState(null, "", `/search?q=${encodeURIComponent(q)}`);
  };

  const runRemoteLookup = async (target: UniversalSearchRemoteTarget) => {
    const q = state.query.trim();
    if (!q || state.loading || state.remoteLoadingTarget) return;

    dispatch({ type: "remote-start", target });
    try {
      const response = await fetchUniversalSearch(q, 36, {
        remote: true,
        remoteTarget: target,
        refresh: target === "match-id",
      });
      dispatch({
        type: "remote-result",
        results: response.data,
        remoteNotice: remoteLookupNotice(target, response.remote),
      });
    } catch {
      dispatch({ type: "remote-error", error: t("generated.search.remoteLookupUnavailable") });
    }
  };

  const q = state.query.trim();
  // Keep explicit Hi-Rez fallback actions visible even after local search finds
  // nearby results. A fuzzy/local player hit is not proof that the desired
  // account exists locally. Match-ID shaped numeric queries are handled
  // automatically by the backend through the same DB-first `fetchMatches`
  // path as the match detail page. The manual match button stays available for
  // match-shaped IDs so a user can retry a recent miss; that click bypasses
  // only the short miss cache and still cannot spend a call for an existing DB
  // row because the backend preflight wins first.
  const remoteActions: Array<{ target: UniversalSearchRemoteTarget; label: string; show: boolean }> = [
    { target: "player-id", label: t("generated.search.lookUpPlayerId"), show: isNumericQuery(q) && !isLikelyMatchId(q) },
    { target: "match-id", label: t("generated.search.lookUpMatchId"), show: isLikelyMatchId(q) },
    { target: "player-name", label: t("generated.search.searchHiRezExactPlayerName"), show: canRemotePlayerNameLookup(q) },
  ];
  const visibleRemoteActions = remoteActions.filter((action) => action.show);
  const remoteLookupPrompt = isLikelyMatchId(q)
    ? t("generated.search.matchNotFound")
    : t("generated.search.exactLookupLocalDbIsCheckedFirst");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 py-2 sm:py-6">
      <section className="px-4 py-6 text-center sm:px-8 sm:py-8">
        <h1 className="pc-heading pc-heading-lg drop-shadow-[0_3px_10px_rgba(0,0,0,0.9)]">
          {t("generated.search.search")}
        </h1>
        <form onSubmit={submit} className="mx-auto mt-6 flex max-w-2xl gap-2">
          <div className="relative flex-1">
            <input
              type="search"
              name="q"
              value={state.query}
              onChange={(event) => dispatch({ type: "set-query", query: event.target.value })}
              aria-label={t("generated.search.searchPlayersMatchesChampionsItemsCardsTalents")}
              placeholder={t("generated.search.searchPlayersMatchesChampionsItemsCardsTalents")}
              autoFocus
              className="pc-input pc-search-page-input h-11 w-full rounded-lg pr-10 text-sm"
            />
            {state.query && (
              <button
                type="button"
                aria-label={t("generated.search.clearSearch")}
                title={t("generated.search.clearSearch")}
                onClick={() => {
                  dispatch({ type: "clear" });
                }}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-pc-text-muted transition-colors hover:bg-pc-bg hover:text-pc-accent"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            aria-label={t("generated.search.search")}
            title={t("generated.search.search")}
            className="pc-glass pc-accent-icon-button flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-pc-border text-pc-text-muted transition-colors hover:border-pc-accent-mid hover:text-pc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>
      </section>

      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
        {(["player", "match", "champion", "talent", "card", "item"] as UniversalSearchType[]).map((type) => {
          const count = state.results.filter((result) => result.type === type).length;
          return (
            <span key={type} className={`text-xs px-2 py-1 rounded-full border ${TYPE_STYLE[type]}`}>
              {TYPE_LABEL[type]} {count}
            </span>
          );
        })}
      </div>

      {state.searched && visibleRemoteActions.length > 0 && (
        <div className="pc-glass mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-pc-border px-4 py-2.5">
          <span className="text-xs text-pc-text-muted">{remoteLookupPrompt}</span>
          {visibleRemoteActions.map((action) => (
            <AsyncButton
              key={action.target}
              type="button"
              onClick={() => runRemoteLookup(action.target)}
              disabled={state.loading || state.remoteLoadingTarget !== null}
              loading={state.remoteLoadingTarget === action.target}
              className="px-3 py-1.5 rounded-md border border-pc-accent/30 bg-pc-accent/10 text-xs font-semibold text-pc-accent hover:bg-pc-accent/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {action.label}
            </AsyncButton>
          ))}
          {isLikelyMatchId(q) && <AsyncButton type="button" className="pc-btn-secondary" loading={archiveLookup.loading} disabled={state.loading || archiveLookup.loading} onClick={() => void searchOlderMatch()}>{t("history.searchOlderMatch")}</AsyncButton>}
        </div>
      )}

      {archiveLookup.query === q && archiveLookup.error && <div role="status" className="pc-card mx-auto max-w-3xl text-xs text-pc-text-muted">{archiveLookup.error}</div>}

      {state.remoteNotice && (
        <div className="pc-card mx-auto max-w-3xl text-xs text-pc-text-muted">{state.remoteNotice}</div>
      )}

      {state.loading && state.results.length === 0 && (
        <div className="mx-auto max-w-3xl"><LoadingPanel /></div>
      )}

      {state.error && (
        <div className="mx-auto max-w-3xl"><ErrorState title={t("generated.search.searchUnavailable")} message={state.error} /></div>
      )}

      {!state.loading && state.searched && state.results.length === 0 && !state.error && (
        <div className="mx-auto max-w-3xl"><EmptyState title={t("generated.search.noResultsFound")} description={t("generated.search.tryABroaderNamePlayerIdMatchIdChampionItem")} /></div>
      )}

      <SearchResultGroups grouped={grouped} />
    </div>
  );
}

/**
 * Render /search using `Suspense`, `RouteSkeleton`, `SearchPageBody`.
 * Render the SearchPage view for search page.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={<RouteSkeleton variant="list" />}>
      <SearchPageBody />
    </Suspense>
  );
}
