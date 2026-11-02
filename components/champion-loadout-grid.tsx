/**
 * Render champion loadout grid.
 * refs: none
 */
import Link from "next/link";
import SmartImage from "@/components/SmartImage";
import type { ChampionLoadout } from "@/lib/champion-data";
import type { ChampionCardStat, ChampionCardStatsResponse } from "@/lib/api-client";
import { getPercentageColor, getStatQuality } from "@/lib/stat-quality";
import { useLocalization } from "@/lib/localization-context";
import { formatScalingDescription } from "@/lib/scaling-description";
import { championDescriptionKey } from "@/lib/localization/champion-description-key";

function statNameKey(value: string | null | undefined): string {
  return String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Render champion loadout grid.
 * refs: none
 * I/O types: `{ championSlug: string, loadouts: ChampionLoadout[], cardStats?: ChampionCardStatsResponse, talentId?: number | null, returnTo?: string, detailBasePath?: string } -> JSX.Element`.
 */
export default function ChampionLoadoutGrid({
  championSlug,
  loadouts,
  cardStats,
  talentId,
  returnTo,
  detailBasePath,
}: {
  championSlug: string;
  loadouts: ChampionLoadout[];
  cardStats?: ChampionCardStatsResponse;
  talentId?: number | null;
  returnTo?: string;
  detailBasePath?: string;
}) {
  const { formatNumber, formatPercent, formatRecord, t } = useLocalization();
  const formatPlays = (value: number) => formatNumber(value, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const statsById = new Map((cardStats?.cards ?? []).map((stat) => [stat.cardId, stat]));
  const statsByName = new Map((cardStats?.cards ?? []).map((stat) => [statNameKey(stat.cardName), stat]));
  const maxCardPickRate = Math.max(
    1,
    ...(cardStats?.cards ?? []).map((stat) => (stat.totalPlays / Math.max(1, cardStats?.totalMatches ?? 0)) * 100),
  );
  const byCategory: Record<string, ChampionLoadout[]> = {};
  for (const loadout of loadouts) {
    const category = loadout.category || t("common.fallback.general");
    (byCategory[category] ??= []).push(loadout);
  }

  const categories = Object.entries(byCategory);
  const mid = Math.ceil(categories.length / 2);
  const leftCategories = categories.slice(0, mid);
  const rightCategories = categories.slice(mid);

  const renderCategory = ([category, cards]: [string, ChampionLoadout[]]) => (
    <section key={category} className="mb-6 last:mb-0">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-pc-text-muted">{category}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map((card) => {
              const stat: ChampionCardStat | undefined = statsById.get(card.id)
                ?? statsByName.get(statNameKey(card.name));
              const pickRate = stat ? (stat.totalPlays / Math.max(1, cardStats?.totalMatches ?? 0)) * 100 : 0;
              const quality = stat ? getStatQuality(stat.winRate, pickRate, maxCardPickRate) : null;
              const maxLevelPlays = stat ? Math.max(1, ...stat.levels.map((level) => level.plays)) : 1;
              const maxLevelPickRate = stat
                ? Math.max(1, ...stat.levels.map((level) => (level.plays / Math.max(1, stat.totalPlays)) * 100))
                : 1;
              const params = new URLSearchParams();
              if (talentId) params.set("talentId", String(talentId));
              if (returnTo) params.set("returnTo", returnTo);
              const detailPath = detailBasePath ?? `/stats/loadouts/${championSlug}/cards`;
              const detailCardId = stat?.cardId ?? card.id;
              const href = cardStats ? `${detailPath}/${detailCardId}${params.size > 0 ? `?${params.toString()}` : ""}` : null;
              const className = `pc-surface-light block rounded-lg border p-3 text-left ${href ? "transition-colors hover:border-pc-accent-mid" : ""}`;
              const descriptionKey = championDescriptionKey(championSlug, "loadouts", card.name);
              const content = (
                <div className="flex items-start gap-3">
                  {card.iconUrl ? (
                    <SmartImage src={card.iconUrl} alt={card.name} className="h-10 w-12 flex-shrink-0 rounded border border-pc-border bg-pc-bg/50 object-cover" onError={(event) => { (event.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-pc-border bg-pc-bg-elevated">
                      <span className="text-xs text-pc-accent">?</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-xs font-medium text-pc-accent">{card.name}</div>
                    <p className="text-xs leading-relaxed text-pc-text-secondary">
                      {formatScalingDescription(descriptionKey ? t(descriptionKey) : card.description, 1, formatNumber)}
                    </p>
                    {stat && stat.totalPlays > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="min-w-0 whitespace-nowrap" style={{ color: getPercentageColor(stat.winRate) }}>
                            <span className="mr-1 text-pc-text-muted">{t("generated.champions.wr")}</span>{formatPercent(stat.winRate)}
                          </span>
                          <span className="text-pc-text-muted">|</span>
                          <span className="text-pc-text-muted"><span className="mr-1">{t("generated.champions.pr")}</span><span style={{ color: getPercentageColor(pickRate) }}>{formatPercent(pickRate)}</span></span>
                          <span className="text-pc-text-muted">|</span>
                          <span className="break-words text-pc-text-muted"><span className="mr-1">{t("generated.champions.picks")}</span><span style={quality ? { color: quality.color } : undefined}>{formatPlays(stat.totalPlays)}</span></span>
                          <span className="text-pc-text-muted">|</span>
                          <span className="break-words text-pc-text-muted">{formatRecord(stat.wins, stat.losses)}</span>
                        </div>
                        {stat.levels.length > 0 && (
                          <div className="flex items-center gap-1">
                            {stat.levels.map((level) => {
                              const levelPickRate = (level.plays / Math.max(1, stat.totalPlays)) * 100;
                              const levelQuality = getStatQuality(level.winRate, levelPickRate, maxLevelPickRate);
                              return (
                                <div key={level.level} className="flex flex-1 flex-col items-center">
                                  <div className="text-xs text-pc-text-muted">{t("common.format.levelShort", { level: level.level })}</div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-pc-bg-elevated">
                                    <div className="h-full rounded-full" style={{ width: `${Math.max(level.plays > 0 ? 8 : 0, Math.round((level.plays / maxLevelPlays) * 100))}%`, background: levelQuality.track }} />
                                  </div>
                                  <div className="text-xs text-pc-text-muted">{formatNumber(level.plays)}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );

              return href ? (
                <Link key={card.name} href={href} className={className} style={quality ? { borderColor: quality.borderColor } : undefined}>{content}</Link>
              ) : (
                <div key={card.name} className={className} style={quality ? { borderColor: quality.borderColor } : undefined}>{content}</div>
              );
            })}
      </div>
    </section>
  );

  return (
    <div className="pc-card">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>{leftCategories.map(renderCategory)}</div>
        <div>{rightCategories.map(renderCategory)}</div>
      </div>
    </div>
  );
}
