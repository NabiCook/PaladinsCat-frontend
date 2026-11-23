/** Provide the homepage search control and lightweight result overlay. · refs: none */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/lib/reduced-motion";
import { LoaderCircle, Search, X } from "lucide-react";
import { fetchUniversalSearch, type UniversalSearchResult, type UniversalSearchType } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import PlayerName from "@/components/player-name";
import { PlayerSearchSubtitle } from "@/components/player-search-result";
import { loadStaticReferenceIndex, staticReferenceResults } from "@/lib/search-reference";
import { mergeResults } from "@/lib/search-state";

const RESULT_TYPE_LABEL: Record<UniversalSearchType, string> = {
  player: "Player",
  match: "Match",
  champion: "Champion",
  item: "Item",
  card: "Card",
  talent: "Talent",
};

type HomeSearchProps = {
  onSearchActiveChange?: (active: boolean) => void;
  variant?: "home" | "header";
  active?: boolean;
  onNavigate?: () => void;
};

/**
 * Search across public entities and route submitted blank queries to the search page.  Returns: `React.JSX.Element`. · refs: none
 * I/O types: `{ onSearchActiveChange }: HomeSearchProps -> JSX.Element`.
 */
export default function HomeSearch({ onSearchActiveChange, variant = "home", active = true, onNavigate }: HomeSearchProps) {
  const { t } = useLocalization();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isHeader = variant === "header";
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | undefined>(undefined);
  const animateHome = typeof window !== "undefined"
    && !reduceMotion
    && typeof window.requestAnimationFrame === "function";
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState("");
  const [results, setResults] = useState<UniversalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  useEffect(() => {
    if (isHeader && active && inputRef.current?.getClientRects().length) inputRef.current.focus();
  }, [active, isHeader]);

  useEffect(() => {
    const query = value.trim();
    if (!active || query.length < 2 || (isHeader && !inputRef.current?.getClientRects().length)) {
      return;
    }

    let acceptingResults = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setResults([]);
      let apiResults: UniversalSearchResult[] = [], references: UniversalSearchResult[] = [];
      const publish = () => {
        if (acceptingResults) setResults(mergeResults([...apiResults, ...references]).slice(0, 6));
      };
      await Promise.allSettled([
        fetchUniversalSearch(query, 6, { signal: controller.signal }).then(response => { apiResults = response.data; publish(); }),
        loadStaticReferenceIndex().then(index => { references = staticReferenceResults(query, index); publish(); }),
      ]);
      if (acceptingResults) setLoading(false);
    }, 200);

    return () => {
      acceptingResults = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [active, isHeader, value]);

  const showRelatedResults = active && focused && value.trim().length >= 2;

  useEffect(() => {
    onSearchActiveChange?.(focused && value.trim().length > 0);
  }, [focused, onSearchActiveChange, value]);

  const relatedDropdown = (
    <AnimatePresence>
      {showRelatedResults && (
        <motion.div
          initial={isHeader ? { opacity: 0 } : animateHome ? { opacity: 0, y: -8, scale: 0.985 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={isHeader || reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.99 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={`${isHeader ? "pc-header-search-dropdown " : ""}absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 origin-top overflow-hidden rounded-lg border border-pc-border bg-pc-bg-elevated shadow-md`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {loading && results.length === 0 ? (
              <motion.div
                key="loading"
                initial={animateHome ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2.5 px-3 py-3 text-sm text-pc-text-muted"
                role="status"
                aria-live="polite"
              >
                <LoaderCircle className="h-4 w-4 animate-spin text-pc-accent" aria-hidden="true" />
                <span>{t("generated.search.searching")}</span>
                <span className="pc-skeleton ml-auto h-2 w-16 rounded-full" aria-hidden="true" />
              </motion.div>
            ) : results.length > 0 ? (
              <motion.div
                key="results"
                initial={animateHome ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="home-search-results max-h-80 overflow-y-auto py-1"
              >
                {results.map((result, index) => (
                  <motion.div
                    key={`${result.type}-${result.id}-${result.href}`}
                    initial={!isHeader && animateHome ? { opacity: 0, x: -8 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.035, 0.15) }}
                  >
                    <Link
                      href={result.href}
                      onClick={onNavigate}
                      className="group/result flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-pc-bg"
                    >
                      <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-pc-accent transition-transform duration-200 group-hover/result:translate-x-0.5">
                        {RESULT_TYPE_LABEL[result.type]}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate text-sm font-medium text-pc-text">
                          {result.type === "player" ? <PlayerName playerId={result.id}>{result.title}</PlayerName> : result.title}
                        </span>
                        <span className="block truncate text-xs text-pc-text-muted">
                          <PlayerSearchSubtitle result={result} />
                        </span>
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={animateHome ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="px-3 py-3 text-sm text-pc-text-muted"
              >
                {t("generated.search.noRelatedResults")}
              </motion.div>
            )}
          </AnimatePresence>
          <a
            href={`/search?q=${encodeURIComponent(value.trim())}`}
            onClick={onNavigate}
            className="block border-t border-pc-border px-3 py-2 text-sm font-medium text-pc-accent transition-colors hover:bg-pc-bg"
          >
            {t("generated.search.viewAllResults")}
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <motion.div
      initial={!isHeader && animateHome ? { opacity: 0, y: 15, scale: 0.985 } : false}
      animate={isHeader ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: reduceMotion ? 0 : 0.3, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={isHeader ? "pc-header-search" : "pc-search-width mx-auto mb-16"}
      data-open={isHeader ? active : undefined}
      inert={isHeader && !active}
      aria-hidden={isHeader && !active ? true : undefined}
    >
      <form
        action="/search"
        method="GET"
        role="search"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          if (String(formData.get("q") ?? "").trim() === "") {
            event.preventDefault();
            onNavigate?.();
            router.push("/search");
          }
        }}
        className={`group flex items-center gap-2 ${isHeader ? "h-11 min-w-0" : ""}`}
      >
        <div
          data-active={hovered || focused ? "true" : undefined}
          className={isHeader ? "pc-header-search-input-shell relative min-w-0 flex-1 rounded-lg border border-pc-border bg-pc-bg-secondary focus-within:border-pc-accent focus-within:ring-1 focus-within:ring-pc-accent" : `pc-glass pc-home-search-shell relative flex-1 rounded-lg border transition-all duration-200 ease-out hover:scale-[1.02] hover:border-pc-accent-mid focus-within:scale-[1.02] focus-within:border-pc-accent-mid focus-within:ring-1 focus-within:ring-pc-accent/30 ${hovered || focused ? "scale-[1.02] border-pc-accent-mid" : "border-white/5"}`}
        >
          <input
            ref={inputRef}
            type="text"
            name="q"
            value={value}
            disabled={!active}
            onChange={(event) => {
              const nextValue = event.target.value;
              setValue(nextValue);
              if (nextValue.trim().length < 2) {
                setResults([]);
                setLoading(false);
              }
            }}
            onFocus={() => {
              window.clearTimeout(blurTimer.current);
              setFocused(true);
            }}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => setFocused(false), 150);
            }}
            aria-label={t("search.homeInputLabel")}
            className={`w-full rounded-lg bg-transparent px-4 pr-10 text-sm text-pc-text outline-none transition-colors placeholder:text-pc-text-muted ${isHeader ? "h-11" : "py-2"}`}
          />
          <AnimatePresence>
            {value.length > 0 && (
              <motion.button
                type="button"
                aria-label={t("search.clear")}
                title={t("search.clear")}
                onClick={() => {
                  setValue("");
                  setResults([]);
                  setLoading(false);
                  inputRef.current?.focus();
                }}
                initial={isHeader ? { opacity: 0 } : animateHome ? { opacity: 0, scale: 0.65, rotate: -45 } : false}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={isHeader || reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, rotate: 30 }}
                whileTap={isHeader || reduceMotion ? undefined : { scale: 0.82 }}
                className="absolute inset-y-0 right-3 flex cursor-pointer items-center text-pc-text-muted transition-colors hover:text-pc-accent"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </motion.button>
            )}
          </AnimatePresence>
          {!isHeader && relatedDropdown}
        </div>
        {isHeader && relatedDropdown}
        <motion.button
          type="submit"
          aria-label={t("search.submit")}
          whileHover={isHeader || reduceMotion ? undefined : { scale: 1.08, rotate: -3 }}
          whileTap={isHeader || reduceMotion ? undefined : { scale: 0.9 }}
          transition={{ type: "spring", stiffness: 350, damping: 18 }}
          className="pc-glass pc-accent-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/5 text-pc-text-muted transition-colors hover:border-pc-accent-mid hover:text-pc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent"
        >
          <Search className={`h-4 w-4 transition-colors ${hovered || focused ? "text-pc-accent" : "text-pc-text-muted group-hover:text-pc-accent group-focus-within:text-pc-accent"}`} aria-hidden="true" />
        </motion.button>
      </form>
    </motion.div>
  );
}
