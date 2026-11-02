/**
 * Champion changelog renderer — wiki-derived changes grouped by category.
 *
 * Owns the `ChampionChangelog` component. Renders changelog entries from
 * `ChampionChangelogData` (passed in as a prop); no data fetch.
 *
 * refs: public/data/champion-changelogs.json
 */
"use client";

import SmartImage from "@/components/SmartImage";
import type { ChampionChangelog as ChampionChangelogData } from "@/lib/champion-changelog";
import { useLocalization } from "@/lib/localization-context";
import { ArrowUpRight, ChevronRight } from "lucide-react";

const CATEGORY_KEYS = {
  General: "champions.changelog.categories.general",
  Weapon: "champions.changelog.categories.weapon",
  Abilities: "champions.changelog.categories.abilities",
  Talents: "champions.changelog.categories.talents",
  Cards: "champions.changelog.categories.cards",
  Fixes: "champions.changelog.categories.fixes",
} as const;

/**
 * Render wiki-derived changes grouped by category and entity, newest value first.
 * refs: public/data/champion-changelogs.json
 * I/O types: `history: ChampionChangelogData -> JSX.Element | null`.
 */
export default function ChampionChangelog({ history }: { history: ChampionChangelogData }) {
  const { t, formatNumber } = useLocalization();
  if (history.categories.length === 0) return null;

  return <section className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <h2 className="pc-card-title">{t("champions.changelog.title")}</h2>
      <a href={history.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-pc-text-muted transition-colors hover:text-pc-accent">
        {t("champions.changelog.source")} <ArrowUpRight aria-hidden="true" size={16} className="inline shrink-0 align-middle" />
      </a>
    </div>
    <div className="pc-card-flush overflow-hidden">
      {history.categories.map((category) => <details key={category.name} className="group border-b border-pc-border last:border-b-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-pc-text marker:hidden hover:bg-pc-bg-secondary/50">
          <span>{t(CATEGORY_KEYS[category.name as keyof typeof CATEGORY_KEYS] ?? "champions.changelog.categories.general")}</span>
          <span className="flex items-center gap-2 text-xs font-normal text-pc-text-muted">
            {formatNumber(category.entries.length)}
            <span aria-hidden="true" className="transition-transform group-open:rotate-90"><ChevronRight aria-hidden="true" size={12} className="inline shrink-0 align-middle" /></span>
          </span>
        </summary>
        <div className="divide-y divide-pc-border border-t border-pc-border">
          {category.entries.map((entry) => <article key={entry.name} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {entry.iconUrl ? <SmartImage src={entry.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" /> : <span className="h-9 w-9 shrink-0" />}
              <h3 className="min-w-0 text-sm font-medium text-pc-accent">{entry.name}</h3>
            </div>
            <ul className="min-w-0 space-y-1 text-xs leading-relaxed text-pc-text-secondary">
              {entry.trends.map((trend) => <li key={trend}>{trend}</li>)}
            </ul>
          </article>)}
        </div>
      </details>)}
    </div>
  </section>;
}
