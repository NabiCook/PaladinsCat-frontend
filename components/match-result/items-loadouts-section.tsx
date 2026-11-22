/** Render item and talent loadout details for both teams with expandable stat views. · refs: none */
"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  fetchChampionCardStats,
  fetchChampionTalentStats,
  fetchItemDetail,
  fetchItems,
  type ChampionCardStatsResponse,
  type ChampionTalentStatsResponse,
  type ItemStat,
  type MatchFactPlayer,
  type MatchPlayerDetail,
} from "@/lib/api-client";
import { ApiRequestError, formatApiErrorMessage } from "@/lib/api-errors";
import { getChampionIconSafe } from "@/lib/champion-icons";
import {
  itemDescriptionAtLevel,
  loadBuildReferenceData,
  type BuildItemReference,
  type BuildReferenceData,
} from "@/lib/build-reference";
import { championSlug } from "@/lib/utils";
import { canonicalLocalImageUrl } from "@/lib/image-assets";
import { canonicalCardNameKey } from "@/lib/card-name";
import { useLobbyTier } from "@/lib/lobby-tier-context";
import { getPercentageColor, getStatQuality } from "@/lib/stat-quality";
import { readBrowserResult, writeBrowserResult } from "@/lib/browser-result-cache";
import { LoadingIndicator } from "@/components/async-state";
import { MatchPlayerLink, matchPlayerKey } from "./player-identity";
import CanonicalTalentImage from "@/components/canonical-talent-image";
import { useLocalization } from "@/lib/localization-context";
import { formatScalingDescription } from "@/lib/scaling-description";
import { championDescriptionKey } from "@/lib/localization/champion-description-key";

type Props = { team1Players: MatchPlayerDetail[]; team2Players: MatchPlayerDetail[]; team1Wins: boolean; team2Wins: boolean; factMap: Map<string, MatchFactPlayer> };

// Reuse the exact resolver and source data used by champion/build pages.
// Cache per champion so the 10 match rows do not issue duplicate reference requests.
const referenceByChampion = new Map<string, Promise<BuildReferenceData>>();
const itemMetricsByChampionScope = new Map<string, Promise<ItemStat[]>>();
const itemDetailByChampionScope = new Map<string, ReturnType<typeof fetchItemDetail>>();
const loadoutMetricsByChampionTalentScope = new Map<string, Promise<{
  talents: ChampionTalentStatsResponse;
  cards: ChampionCardStatsResponse;
}>>();
const RESULT_CACHE_PREFIX = "paladinscat:match-build:v1";
const REFERENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const METRIC_CACHE_TTL_MS = 5 * 60 * 1000;
const UI_CACHE_TTL_MS = 30 * 60 * 1000;

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    // The live match feed uses the modern "Guerrilla" spelling, while the
    // Strix champion asset and champion-data entry retain "Guerilla".
    .replace(/guerrilla/g, "guerilla")
    .replace(/[^a-z0-9]+/g, "");
}

function getBuildReference(championId: number, championName: string) {
  const slug = championSlug(championName);
  const referenceKey = `${championId}:${slug}`;
  let promise = referenceByChampion.get(referenceKey);
  if (!promise) {
    const cacheKey = `${RESULT_CACHE_PREFIX}:reference:${referenceKey}`;
    const cached = readBrowserResult<BuildReferenceData>(cacheKey);
    promise = cached
      ? Promise.resolve(cached)
      : loadBuildReferenceData(championId, slug)
          .then((value) => writeBrowserResult(cacheKey, value, REFERENCE_CACHE_TTL_MS))
          .catch(() => ({ championId, items: [], cards: [], talents: [] }));
    referenceByChampion.set(referenceKey, promise);
  }
  return promise;
}

function getScopedItemMetrics(championId: number, scope: string, tierMin?: number, tierMax?: number) {
  const key = `${championId}:${scope}:${tierMin ?? "all"}:${tierMax ?? "all"}`;
  let promise = itemMetricsByChampionScope.get(key);
  if (!promise) {
    const cacheKey = `${RESULT_CACHE_PREFIX}:items:${key}`;
    const cached = readBrowserResult<ItemStat[]>(cacheKey);
    promise = cached
      ? Promise.resolve(cached)
      : fetchItems({ mode: "ranked", championId, limit: 200, tierMin, tierMax })
          .then((value) => writeBrowserResult(cacheKey, value, METRIC_CACHE_TTL_MS))
          .catch(() => []);
    itemMetricsByChampionScope.set(key, promise);
  }
  return promise;
}

function getScopedItemDetail(itemId: number, championId: number, scope: string, tierMin?: number, tierMax?: number) {
  const key = `${itemId}:${championId}:${scope}:${tierMin ?? "all"}:${tierMax ?? "all"}`;
  let promise = itemDetailByChampionScope.get(key);
  if (!promise) {
    const cacheKey = `${RESULT_CACHE_PREFIX}:item-detail:${key}`;
    const cached = readBrowserResult<Awaited<ReturnType<typeof fetchItemDetail>>>(cacheKey);
    promise = cached !== null
      ? Promise.resolve(cached)
      : fetchItemDetail(itemId, "ranked", { championId, tierMin, tierMax })
          .then((value) => writeBrowserResult(cacheKey, value, METRIC_CACHE_TTL_MS));
    itemDetailByChampionScope.set(key, promise);
  }
  return promise;
}

function getScopedLoadoutMetrics(championId: number, talentId: number | null, scope: string, tierMin?: number, tierMax?: number) {
  const key = `${championId}:${talentId ?? "all"}:${scope}:${tierMin ?? "all"}:${tierMax ?? "all"}`;
  let promise = loadoutMetricsByChampionTalentScope.get(key);
  if (!promise) {
    const tier = { tierMin, tierMax };
    const cacheKey = `${RESULT_CACHE_PREFIX}:loadout:${key}`;
    const cached = readBrowserResult<Awaited<typeof promise>>(cacheKey);
    promise = cached
      ? Promise.resolve(cached)
      : Promise.all([
          fetchChampionTalentStats(championId, "ranked", tier),
          fetchChampionCardStats(championId, "ranked", talentId, tier),
        ]).then(([talents, cards]) => writeBrowserResult(cacheKey, { talents, cards }, METRIC_CACHE_TTL_MS));
    promise = promise.catch((error) => { loadoutMetricsByChampionTalentScope.delete(key); throw error; });
    loadoutMetricsByChampionTalentScope.set(key, promise);
  }
  return promise;
}

function Asset({ sources, alt, level, tone = "border-pc-border", transparent = false }: { sources: Array<string | null | undefined>; alt: string; level?: number | null; tone?: string; transparent?: boolean }) {
  const candidates = [...new Set(sources.filter((source): source is string => Boolean(source)).map(canonicalLocalImageUrl))];
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [alt, candidates.join("|")]);
  const src = candidates[index];
  if (!src) return <div className={transparent ? "h-12 w-12" : "h-9 w-9 rounded border border-pc-border bg-pc-bg-secondary"} title={alt} />;
  return <div className="relative shrink-0" title={alt}>
    <img src={src} alt={alt} className={transparent ? "h-12 w-12 object-contain" : `h-9 w-9 rounded border ${tone} object-cover`} loading="eager" onError={() => setIndex(current => Math.min(current + 1, candidates.length))} />
    {level != null && <span className="absolute -right-1 -top-1 min-w-3 rounded bg-pc-bg px-1 text-center text-xs font-bold text-pc-text ring-1 ring-pc-border">{level}</span>}
  </div>;
}

type DetailMetric = {
  winRate: number;
  pickRate: number;
  plays: number;
};

function DetailEntry({
  name,
  description,
  sources,
  level,
  tone,
  label,
  metric,
  showMetrics = false,
  metricsLoaded = false,
  metricsErrorLabel,
  maxPickRate = 1,
  playsLabel,
  loadingLabel: _loadingLabel,
  href,
  onNavigate,
  transparentIcon = false,
  canonicalTalent,
}: {
  name: string;
  description: ReactNode;
  sources: Array<string | null | undefined>;
  level?: number | null;
  tone?: string;
  label: string;
  metric?: DetailMetric;
  showMetrics?: boolean;
  metricsLoaded?: boolean;
  metricsErrorLabel?: string;
  maxPickRate?: number;
  playsLabel?: string;
  loadingLabel?: string;
  href?: string;
  onNavigate?: () => void;
  transparentIcon?: boolean;
  canonicalTalent?: { talentId: number; talentName: string | null | undefined };
}) {
  const { t , formatPercent, formatNumber} = useLocalization();
  const quality = metric ? getStatQuality(metric.winRate, metric.pickRate, maxPickRate) : null;
  return <article className="flex min-w-0 items-start gap-3 rounded-lg border border-pc-border/70 bg-pc-bg-secondary/45 p-3">
    {canonicalTalent ? (
      <CanonicalTalentImage
        talentId={canonicalTalent.talentId}
        talentName={canonicalTalent.talentName}
        alt={name}
        className={transparentIcon ? "h-12 w-12 shrink-0 object-contain" : "h-9 w-9 shrink-0 rounded border border-pc-border object-contain"}
        fallbackClassName={transparentIcon ? "h-12 w-12 shrink-0" : "h-9 w-9 shrink-0 rounded border border-pc-border bg-pc-bg-secondary"}
      />
    ) : <Asset sources={sources} alt={name} level={level} tone={tone} transparent={transparentIcon} />}
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {href ? <Link href={href} onClick={onNavigate} className="text-xs font-semibold text-pc-text transition-colors hover:text-pc-accent hover:underline">{name}</Link> : <h4 className="text-xs font-semibold text-pc-text">{name}</h4>}
        <span className="text-xs font-semibold uppercase tracking-wider text-pc-text-muted">{label}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-pc-text-secondary">{description}</p>
      {showMetrics && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
        {metric ? <>
          <span className="rounded-md border px-1.5 py-0.5 font-semibold" style={{ color: getPercentageColor(metric.winRate), borderColor: quality?.borderColor, background: quality?.background }}>{t("generated.matches.wr")}{" "}{formatPercent(metric.winRate)}</span>
          <span className="rounded-md border border-pc-border bg-pc-bg px-1.5 py-0.5" style={{ color: getPercentageColor(metric.pickRate) }}>{t("generated.matches.pr")}{" "}{formatPercent(metric.pickRate)}</span>
          <span className="text-pc-text-muted">{formatNumber(metric.plays)} {playsLabel ?? t("generated.stats.plays.0effba4")}</span>
        </> : metricsErrorLabel ? <span className="text-amber-300">{metricsErrorLabel}</span> : metricsLoaded ? <span className="text-pc-text-muted">{t("generated.matches.noRankedSampleInThisLobbyScope")}</span> : <LoadingIndicator className="gap-1.5 text-xs" />}
      </div>}
    </div>
  </article>;
}

function PlayerBuildRow({
  player,
  fact,
  wins,
  lobbyScope,
  lobbyScopeLabel,
  lobbyTierMin,
  lobbyTierMax,
  lobbyTierReady,
  returnTo,
}: {
  player: MatchPlayerDetail;
  fact?: MatchFactPlayer;
  wins: boolean;
  lobbyScope: string;
  lobbyScopeLabel: string;
  lobbyTierMin?: number;
  lobbyTierMax?: number;
  lobbyTierReady: boolean;
  returnTo: string;
}) {
  const { formatNumber, t } = useLocalization();
  const champion = player.champion_name || t("common.entity.championNumber", { number: player.champion_id });
  const talents = fact?.talents ?? [];
  const cards = fact?.cards ?? [];
  const items = fact?.items ?? [];
  const itemIdsKey = items.map((item) => item.item_id).join(",");
  const selectedTalent = talents[0] ?? null;
  const championPath = `/stats/loadouts/${championSlug(player.champion_name || "")}`;
  const returnToQuery = encodeURIComponent(returnTo);
  const matchId = returnTo.match(/^\/matches\/(\d+)/)?.[1];
  const preserveMatchPosition = () => {
    if (!matchId) return;
    const cacheKey = `paladinscat:match-scroll:v1:${matchId}`;
    writeBrowserResult(cacheKey, { scrollY: window.scrollY }, UI_CACHE_TTL_MS);
    // Next resets scroll during client navigation. Ignore that synthetic
    // scroll event until the match page mounts again and clears this lock.
    writeBrowserResult(`${cacheKey}:navigating`, true, 10_000);
  };
  const [reference, setReference] = useState<BuildReferenceData | null>(null);
  const [itemMetrics, setItemMetrics] = useState<ItemStat[] | null>(null);
  const [loadoutMetrics, setLoadoutMetrics] = useState<{
    talents: ChampionTalentStatsResponse;
    cards: ChampionCardStatsResponse;
  } | null>(null);
  const [loadoutMetricsError, setLoadoutMetricsError] = useState<string | null>(null);
  const [loadoutMetricsErrorTitle, setLoadoutMetricsErrorTitle] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const disclosureId = useId();
  const expandedCacheKey = `${RESULT_CACHE_PREFIX}:expanded:${returnTo}:${player.player_id}`;
  useEffect(() => {
    setExpanded(readBrowserResult<boolean>(expandedCacheKey) ?? false);
  }, [expandedCacheKey]);
  useEffect(() => {
    let cancelled = false;
    getBuildReference(player.champion_id, player.champion_name || "").then((data) => { if (!cancelled) setReference(data); });
    return () => { cancelled = true; };
  }, [player.champion_id, player.champion_name]);
  useEffect(() => {
    if (!expanded || !lobbyTierReady) return;
    let cancelled = false;
    setItemMetrics(null);
    getScopedItemMetrics(player.champion_id, lobbyScope, lobbyTierMin, lobbyTierMax)
      .then(async (rows) => {
        const missingBreakdowns = [...new Set(items.map((item) => item.item_id))]
          .filter((itemId) => !rows.find((row) => row.itemId === itemId)?.breakdown.length);
        if (missingBreakdowns.length === 0) return rows;
        const details = await Promise.all(missingBreakdowns.map((itemId) => (
          getScopedItemDetail(itemId, player.champion_id, lobbyScope, lobbyTierMin, lobbyTierMax)
        )));
        const detailByItem = new Map(details.filter((detail) => detail != null).map((detail) => [detail.itemId, detail]));
        return rows.map((row) => {
          const detail = detailByItem.get(row.itemId);
          return detail ? {
            ...row,
            breakdown: detail.breakdown.map((entry) => ({
              ...entry,
              pickRate: detail.totalUses > 0 ? (row.pickRate ?? 0) * entry.totalUses / detail.totalUses : 0,
            })),
          } : row;
        });
      })
      .then((rows) => { if (!cancelled) setItemMetrics(rows); });
    return () => { cancelled = true; };
  }, [expanded, itemIdsKey, lobbyScope, lobbyTierMax, lobbyTierMin, lobbyTierReady, player.champion_id]);
  useEffect(() => {
    if (!expanded || !lobbyTierReady) return;
    let cancelled = false;
    setLoadoutMetrics(null);
    setLoadoutMetricsError(null);
    setLoadoutMetricsErrorTitle(null);
    getScopedLoadoutMetrics(player.champion_id, selectedTalent?.talent_id ?? null, lobbyScope, lobbyTierMin, lobbyTierMax)
      .then((metrics) => { if (!cancelled) setLoadoutMetrics(metrics); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadoutMetrics(null);
        const isTalentError = error instanceof ApiRequestError && error.endpoint?.startsWith("/stats/talents/");
        setLoadoutMetricsError(formatApiErrorMessage(error, t, isTalentError
          ? t("generated.champions.talentStatisticsUnavailable")
          : t("generated.champions.cardStatisticsUnavailable")));
        setLoadoutMetricsErrorTitle(isTalentError
          ? t("generated.champions.talentStatisticsUnavailable")
          : t("generated.champions.cardStatisticsUnavailable"));
      });
    return () => { cancelled = true; };
  }, [expanded, lobbyScope, lobbyTierMax, lobbyTierMin, lobbyTierReady, player.champion_id, selectedTalent?.talent_id, t]);
  const findReference = (kind: "items" | "cards" | "talents", id: number, name: string | null | undefined) => (
    reference?.[kind].find((entry) => entry.id === id)
    ?? reference?.[kind].find((entry) => (
      kind === "cards"
        ? canonicalCardNameKey(entry.name) === canonicalCardNameKey(name)
        : normalizeName(entry.name) === normalizeName(name)
    ))
  );
  const playerName = player.player_name || "PRIVATE";
  const findItemMetric = (itemId: number, itemName: string | null | undefined) => (
    itemMetrics?.find((metric) => metric.itemId === itemId)
    ?? itemMetrics?.find((metric) => normalizeName(metric.itemName) === normalizeName(itemName))
  );
  const selectedTalentMetric = selectedTalent ? (
    loadoutMetrics?.talents.talents.find((metric) => metric.talentId === selectedTalent.talent_id)
    ?? loadoutMetrics?.talents.talents.find((metric) => normalizeName(metric.talentName) === normalizeName(selectedTalent.talent_name))
  ) : undefined;
  const talentMetric: DetailMetric | undefined = selectedTalentMetric ? {
    winRate: selectedTalentMetric.winRate,
    pickRate: (selectedTalentMetric.totalPlays / Math.max(1, loadoutMetrics?.talents.totalMatches ?? 0)) * 100,
    plays: selectedTalentMetric.totalPlays,
  } : undefined;
  const maxLoadoutLevelPickRate = Math.max(1, ...(loadoutMetrics?.cards.cards.flatMap((card) => (
    card.levels.map((level) => (level.plays / Math.max(1, loadoutMetrics.cards.totalMatches)) * 100)
  )) ?? []));
  const cardMetricAtRecordedLevel = (cardId: number, cardName: string | null | undefined, level: number): DetailMetric | undefined => {
    const cardMetric = loadoutMetrics?.cards.cards.find((metric) => metric.cardId === cardId)
      ?? loadoutMetrics?.cards.cards.find((metric) => canonicalCardNameKey(metric.cardName) === canonicalCardNameKey(cardName));
    const levelMetric = cardMetric?.levels.find((metric) => metric.level === level);
    if (!levelMetric) return undefined;
    return {
      winRate: levelMetric.winRate,
      pickRate: (levelMetric.plays / Math.max(1, loadoutMetrics?.cards.totalMatches ?? 0)) * 100,
      plays: levelMetric.plays,
    };
  };
  const itemMetricAtRecordedSlotAndLevel = (itemId: number, itemName: string | null | undefined, slot: number, level: number): DetailMetric | undefined => {
    const itemMetric = findItemMetric(itemId, itemName);
    const breakdown = itemMetric?.breakdown.find((metric) => metric.slot === slot && metric.level === level);
    if (!itemMetric || !breakdown) return undefined;
    return {
      winRate: breakdown.winRate,
      pickRate: breakdown.pickRate ?? (itemMetric.totalUsage > 0 ? (itemMetric.pickRate ?? 0) * breakdown.totalUses / itemMetric.totalUsage : 0),
      plays: breakdown.totalUses,
    };
  };
  const maxItemPickRate = Math.max(1, ...items.map((item) => (
    itemMetricAtRecordedSlotAndLevel(item.item_id, item.item_name, item.slot, item.item_level ?? 0)?.pickRate ?? 0
  )));

  return <div className={`border-b border-pc-border/60 last:border-b-0 ${wins ? "bg-emerald-400/[0.025]" : ""}`}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3 lg:min-w-[780px] lg:grid-cols-[240px_1fr_1fr_36px] lg:items-center lg:gap-4 lg:px-4">
      <div className="flex min-w-0 items-center gap-3 pr-2 lg:pr-0">
        <img src={getChampionIconSafe(player.champion_name)} alt={champion} className="h-11 w-11 rounded-lg border border-pc-border object-cover" onError={(event) => { event.currentTarget.src = "/images/champions/Champion_Generic_Icon.avif"; }} />
        <div className="min-w-0"><MatchPlayerLink player={player} className="block truncate text-sm font-semibold text-pc-text hover:text-pc-accent" />{player.champion_name && <Link href={`/champions/${championSlug(player.champion_name)}`} className="text-xs text-pc-text-secondary hover:text-pc-accent">{champion}</Link>}</div>
      </div>
      <div className="col-span-2 lg:col-span-1">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-pc-text-muted lg:hidden">{t("generated.matches.talentCards")}</div>
        <div className="flex flex-wrap items-center gap-1.5">{talents.map(talent => <CanonicalTalentImage key={`talent-${talent.talent_id}`} talentId={talent.talent_id} talentName={talent.talent_name} alt={talent.talent_name ?? t("generated.matches.talent")} className="h-12 w-12 shrink-0 object-contain" fallbackClassName="h-12 w-12 shrink-0" />)}{cards.map(c => { const entry = findReference("cards", c.card_id, c.card_name); return <Asset key={`card-${c.card_id}`} sources={[entry?.iconUrl, c.icon_url, c.fallback_icon_url]} alt={c.card_name ?? t("generated.matches.loadoutCard")} level={c.card_level ?? undefined} tone="border-pc-accent/30" />; })}</div>
      </div>
      <div className="col-span-2 lg:col-span-1">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-pc-text-muted lg:hidden">{t("generated.matches.purchasedItems")}</div>
        <div className="flex flex-wrap items-center gap-1.5">{items.map(i => { const entry = findReference("items", i.item_id, i.item_name); return <Asset key={`item-${i.slot}-${i.item_id}`} sources={[entry?.iconUrl, i.icon_url, i.fallback_icon_url]} alt={i.item_name ?? t("generated.matches.item")} level={i.item_level == null ? undefined : i.item_level + 1} />; })}</div>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={disclosureId}
        aria-label={t("generated.matches.value1ItemsAndLoadoutDetailsForValue2", { value1: expanded ? t("generated.matches.collapse") : t("generated.matches.expand"), value2: playerName })}
        title={t("generated.matches.value1Details", { value1: expanded ? t("generated.matches.collapse") : t("generated.matches.expand") })}
        onClick={() => setExpanded((current) => {
          const next = !current;
          writeBrowserResult(expandedCacheKey, next, UI_CACHE_TTL_MS);
          return next;
        })}
        className="col-start-2 row-start-1 flex h-9 w-9 items-center justify-center rounded-lg border border-pc-border bg-pc-bg-secondary text-pc-text-muted transition-colors hover:border-pc-accent-mid hover:text-pc-accent lg:col-start-4"
      >
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
    </div>

    {expanded && <div id={disclosureId} className="border-t border-pc-border/60 bg-pc-bg/25 px-3 py-4 lg:px-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-pc-border/50 pb-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-pc-text-muted">{t("generated.matches.rankedPerformance")}</span>
        {lobbyTierReady ? <span className="text-xs font-semibold text-pc-accent">{lobbyScopeLabel}</span> : <LoadingIndicator className="gap-1.5 text-xs" />}
      </div>
      {loadoutMetricsError && <p role="alert" className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">{loadoutMetricsErrorTitle ?? t("generated.champions.cardStatisticsUnavailable")}: {loadoutMetricsError}</p>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="space-y-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-pc-text-muted">{t("generated.matches.talentLoadoutCards")}</h3>
            <p className="mt-1 text-xs text-pc-text-muted">{selectedTalent ? <>{t("generated.matches.cardMetricsAreFilteredBy")}{" "}<span className="font-semibold text-pc-accent">{selectedTalent.talent_name ?? t("generated.matches.theSelectedTalent")}</span> {t("generated.matches.andUseEachRecordedCardLevel")}</> : t("generated.matches.noSelectedTalentWasRecordedCardMetricsIncludeAllTalents")}</p>
          </div>
          {talents.map((talent) => {
            const entry = findReference("talents", talent.talent_id, talent.talent_name);
            const name = talent.talent_name ?? entry?.name ?? t("common.entity.talentNumber", { number: talent.talent_id });
            const descriptionKey = championDescriptionKey(player.champion_name || "", "talents", entry?.name ?? name);
            return <DetailEntry key={`talent-detail-${talent.talent_id}`} name={name} href={`${championPath}?talentId=${talent.talent_id}&returnTo=${returnToQuery}`} onNavigate={preserveMatchPosition} label={t("generated.matches.talent")} description={formatScalingDescription(descriptionKey ? t(descriptionKey) : entry?.description, 1, formatNumber) ?? (reference ? t("common.fallback.descriptionUnavailable") : <LoadingIndicator className="gap-1.5 text-xs" />)} sources={[]} canonicalTalent={{ talentId: talent.talent_id, talentName: talent.talent_name }} transparentIcon metric={talentMetric} showMetrics metricsLoaded={loadoutMetrics !== null} metricsErrorLabel={loadoutMetricsError ? loadoutMetricsErrorTitle ?? t("generated.champions.cardStatisticsUnavailable") : undefined} maxPickRate={100} />;
          })}
          {cards.map((card) => {
            const entry = findReference("cards", card.card_id, card.card_name);
            const level = Math.max(1, card.card_level ?? 1);
            const name = card.card_name ?? entry?.name ?? t("common.entity.cardNumber", { number: card.card_id });
            const query = new URLSearchParams({ returnTo });
            if (selectedTalent) query.set("talentId", String(selectedTalent.talent_id));
            const descriptionKey = championDescriptionKey(player.champion_name || "", "loadouts", entry?.name ?? name);
            return <DetailEntry key={`card-detail-${card.card_id}`} name={name} href={`${championPath}/cards/${card.card_id}?${query.toString()}`} onNavigate={preserveMatchPosition} label={t("common.match.cardLevel", { level })} description={formatScalingDescription(descriptionKey ? t(descriptionKey) : entry?.description, level, formatNumber) ?? (reference ? t("common.fallback.descriptionUnavailable") : <LoadingIndicator className="gap-1.5 text-xs" />)} sources={[entry?.iconUrl, card.icon_url, card.fallback_icon_url]} level={level} tone="border-pc-accent/30" metric={cardMetricAtRecordedLevel(card.card_id, card.card_name, level)} showMetrics metricsLoaded={loadoutMetrics !== null} metricsErrorLabel={loadoutMetricsError ? loadoutMetricsErrorTitle ?? t("generated.champions.cardStatisticsUnavailable") : undefined} maxPickRate={maxLoadoutLevelPickRate} playsLabel={t("common.count.picks")} />;
          })}
          {talents.length === 0 && cards.length === 0 && <p className="text-xs text-pc-text-muted">{t("generated.matches.noTalentOrLoadoutCardsWereRecorded")}</p>}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-pc-text-muted">{t("generated.matches.purchasedItems")}</h3>
          {items.map((item) => {
            const entry = findReference("items", item.item_id, item.item_name) as BuildItemReference | undefined;
            const level = Math.max(1, (item.item_level ?? 0) + 1);
            const name = item.item_name ?? entry?.name ?? t("common.entity.itemNumber", { number: item.item_id });
            const tierDescription = itemDescriptionAtLevel(entry, level);
            const description = tierDescription
              ?? (entry?.descriptionKey ? t(entry.descriptionKey) : null)
              ?? item.description;
            const itemMetric = itemMetricAtRecordedSlotAndLevel(item.item_id, item.item_name, item.slot, item.item_level ?? 0);
            return <DetailEntry key={`item-detail-${item.slot}-${item.item_id}`} name={name} href={`/game/items/${item.item_id}?returnTo=${returnToQuery}`} onNavigate={preserveMatchPosition} label={t("common.match.itemSlotLevel", { slot: item.slot, level })} description={formatScalingDescription(description, tierDescription ? 1 : level, formatNumber) ?? (reference ? t("common.fallback.descriptionUnavailable") : <LoadingIndicator className="gap-1.5 text-xs" />)} sources={[entry?.iconUrl, item.icon_url, item.fallback_icon_url]} level={level} metric={itemMetric} showMetrics metricsLoaded={itemMetrics !== null} maxPickRate={maxItemPickRate} playsLabel={t("common.count.uses")} />;
          })}
          {items.length === 0 && <p className="text-xs text-pc-text-muted">{t("generated.matches.noPurchasedItemsWereRecorded")}</p>}
        </section>
      </div>
    </div>}
  </div>;
}

/**
 * Group player loadouts by team, loading item details and honoring lobby-tier filters.  Returns: `React.JSX.Element`. · refs: none
 * I/O types: `{ team1Players, team2Players, team1Wins, team2Wins, factMap }: Props -> JSX.Element`.
 */
export default function ItemsLoadoutsSection({ team1Players, team2Players, team1Wins, team2Wins, factMap }: Props) {
  const { t } = useLocalization();
  const { filter: lobbyScope, definition: lobbyTier, ready: lobbyTierReady } = useLobbyTier();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
  const rows = (players: MatchPlayerDetail[], wins: boolean) => players.map(p => <PlayerBuildRow key={matchPlayerKey(p)} player={p} fact={factMap.get(String(p.player_id))} wins={wins} lobbyScope={lobbyScope} lobbyScopeLabel={t(lobbyTier.labelKey)} lobbyTierMin={lobbyTier.tierMin} lobbyTierMax={lobbyTier.tierMax} lobbyTierReady={lobbyTierReady} returnTo={returnTo} />);
  return <section className="overflow-hidden rounded-xl border border-pc-border bg-pc-bg-elevated"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-pc-border px-4 py-3"><div><h2 className="text-lg font-bold uppercase tracking-wide text-pc-text">{t("generated.matches.itemsLoadouts")}</h2><p className="mt-0.5 text-xs text-pc-text-muted">{t("generated.matches.talentAndCardsPurchasedItemsExpandARowForDescriptions")}</p></div></div><div className="overflow-x-hidden lg:overflow-x-auto"><div className="hidden min-w-[780px] grid-cols-[240px_1fr_1fr_36px] gap-4 border-b border-pc-border bg-pc-bg-secondary/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-pc-text-muted lg:grid"><span>{t("generated.matches.championPlayer")}</span><span>{t("generated.matches.loadout")}</span><span>{t("generated.matches.items")}</span><span className="sr-only">{t("generated.matches.details")}</span></div>{rows(team1Players, team1Wins)}<div className="flex items-center gap-3 bg-pc-bg-secondary/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-pc-text-muted"><span className={`h-1.5 w-1.5 rounded-full ${team2Wins ? "bg-emerald-400" : "bg-red-400"}`} />{t("generated.matches.opposingTeam")}</div>{rows(team2Players, team2Wins)}</div></section>;
}
