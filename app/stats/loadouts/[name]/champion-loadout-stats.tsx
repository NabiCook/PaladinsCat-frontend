/**
 * Own one champion's ranked talent and loadout-card analysis UI.
 *
 * refs: none
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CanonicalTalentImage from "@/components/canonical-talent-image";
import ChampionLoadoutGrid from "@/components/champion-loadout-grid";
import ContextBackLink from "@/components/context-back-link";
import { EmptyState, ErrorState } from "@/components/async-state";
import { RouteSkeleton } from "@/components/route-skeleton";
import type { ChampionData, ChampionTalent } from "@/lib/champion-data";
import {
  fetchChampionCardStats,
  fetchChampionTalentStats,
  type ChampionCardStatsResponse,
  type ChampionTalentStat,
  type ChampionTalentStatsResponse,
} from "@/lib/api-client";
import { formatApiErrorMessage } from "@/lib/api-errors";
import { useLobbyTier } from "@/lib/lobby-tier-context";
import { useLocalization } from "@/lib/localization-context";
import { getPercentageColor, getStatQuality } from "@/lib/stat-quality";
import { championSlug } from "@/lib/utils";
import { championDescriptionKey } from "@/lib/localization/champion-description-key";

function positiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

class ChampionStatsRequestFailure {
  constructor(readonly request: "talent" | "card", readonly cause: unknown) {}
}

function identifyStatsRequest<T>(request: "talent" | "card", promise: Promise<T>): Promise<T> {
  return promise.catch((cause: unknown) => { throw new ChampionStatsRequestFailure(request, cause); });
}

/**
 * Load and render ranked card statistics, optionally filtered by one talent.
 * I/O: in `{ championId: number, championData: ChampionData }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function ChampionLoadoutStats({ championId, championData }: { championId: number; championData: ChampionData }) {
  const { t } = useLocalization();
  const { definition: lobbyTier, ready: lobbyTierReady } = useLobbyTier();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTalentId = positiveInteger(searchParams.get("talentId"));
  const requestKey = `${championId}:${selectedTalentId ?? "all"}:${lobbyTier.tierMin ?? "all"}:${lobbyTier.tierMax ?? "all"}`;
  const [result, setResult] = useState<{
    key: string;
    talents: ChampionTalentStatsResponse | null;
    cards: ChampionCardStatsResponse | null;
    errorTitle: string | null;
    error: string | null;
  }>({ key: "", talents: null, cards: null, errorTitle: null, error: null });

  useEffect(() => {
    if (!lobbyTierReady) return;
    let cancelled = false;
    void Promise.all([
      identifyStatsRequest("talent", fetchChampionTalentStats(championId, "ranked", { tierMin: lobbyTier.tierMin, tierMax: lobbyTier.tierMax })),
      identifyStatsRequest("card", fetchChampionCardStats(championId, "ranked", selectedTalentId, { tierMin: lobbyTier.tierMin, tierMax: lobbyTier.tierMax })),
    ]).then(([talents, cards]) => {
      if (cancelled) return;
      setResult({ key: requestKey, talents, cards, errorTitle: null, error: null });
    }).catch((reason: unknown) => {
      if (cancelled) return;
      const failure = reason instanceof ChampionStatsRequestFailure ? reason : null;
      const title = failure?.request === "talent"
        ? t("generated.champions.talentStatisticsUnavailable")
        : t("generated.champions.cardStatisticsUnavailable");
      setResult({
        key: requestKey,
        talents: null,
        cards: null,
        errorTitle: title,
        error: formatApiErrorMessage(failure?.cause ?? reason, t, title),
      });
    });
    return () => { cancelled = true; };
  }, [championId, lobbyTier.tierMax, lobbyTier.tierMin, lobbyTierReady, requestKey, selectedTalentId, t]);

  const statsByTalent = useMemo(() => new Map((result.talents?.talents ?? []).map((talent) => [talent.talentId, talent])), [result.talents]);
  const maxTalentPlays = Math.max(1, ...(result.talents?.talents ?? []).map((talent) => talent.totalPlays));
  const currentLocation = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;

  function selectTalent(talentId: number) {
    const query = new URLSearchParams(searchParams.toString());
    if (selectedTalentId === talentId) query.delete("talentId");
    else query.set("talentId", String(talentId));
    router.replace(query.size > 0 ? `${pathname}?${query.toString()}` : pathname, { scroll: false });
  }

  if (!lobbyTierReady || result.key !== requestKey) return <RouteSkeleton variant="detail" />;
  if (result.error) return <ErrorState title={result.errorTitle ?? t("generated.champions.cardStatisticsUnavailable")} message={result.error} />;
  if (!result.talents || !result.cards) return <ErrorState title={!result.talents ? t("generated.champions.talentStatisticsUnavailable") : t("generated.champions.cardStatisticsUnavailable")} message={t("generated.champions.noCardDataForQueue")} />;
  const talentStats = result.talents;
  const cardStats = result.cards;

  return <div className="space-y-6">
    <header>
      <ContextBackLink fallbackHref="/stats/loadouts" label={t("stats.loadouts.title")} />
      <h1 className="mt-2 pc-heading pc-heading-lg">{championData.name} {t("generated.champions.loadoutCards")}</h1>
    </header>

    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {championData.talents.slice(0, 3).map((talent) => <TalentStatCard
        key={talent.id}
        championName={championData.name}
        talent={talent}
        stat={statsByTalent.get(talent.id)}
        totalMatches={talentStats.totalMatches}
        maxTalentPlays={maxTalentPlays}
        selected={selectedTalentId === talent.id}
        onSelect={() => selectTalent(talent.id)}
      />)}
    </section>

    <section className="space-y-2">
      <h2 className="pc-card-title">{t("generated.champions.loadoutCards")}</h2>
      {championData.loadouts?.length ? <ChampionLoadoutGrid
        championSlug={championSlug(championData.name)}
        loadouts={championData.loadouts}
        cardStats={cardStats}
        talentId={selectedTalentId}
        returnTo={currentLocation}
        detailBasePath={`/stats/loadouts/${championSlug(championData.name)}/cards`}
      /> : <EmptyState title={t("generated.champions.noLoadoutCards")} description={t("generated.champions.thisChampionDoesNotHaveLocalLoadoutCardMetadataYet")} />}
    </section>
  </div>;
}

function TalentStatCard({ championName, talent, stat, totalMatches, maxTalentPlays, selected, onSelect }: {
  championName: string;
  talent: ChampionTalent;
  stat?: ChampionTalentStat;
  totalMatches: number;
  maxTalentPlays: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, formatNumber, formatPercent, formatRecord } = useLocalization();
  const descriptionKey = championDescriptionKey(championName, "talents", talent.name);
  const pickRate = stat && totalMatches > 0 ? stat.totalPlays / totalMatches * 100 : 0;
  const quality = stat ? getStatQuality(stat.winRate, stat.totalPlays, maxTalentPlays) : null;
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`pc-card flex items-start gap-3 text-left transition-colors hover:border-pc-accent-mid ${selected ? "ring-1 ring-pc-accent" : ""}`} style={quality ? { borderColor: quality.borderColor } : undefined}>
    <CanonicalTalentImage talentId={talent.id} talentName={talent.name} alt="" className="h-14 w-14 shrink-0 object-contain" fallbackClassName="h-14 w-14 shrink-0" />
    <div className="min-w-0 flex-1">
      <h2 className="text-sm font-semibold text-pc-accent">{talent.name}</h2>
      <p className="mt-1 text-xs leading-relaxed text-pc-text-secondary">{descriptionKey ? t(descriptionKey) : talent.description}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-pc-text-muted">
        <span>{t("generated.champions.wr")} <strong style={stat ? { color: getPercentageColor(stat.winRate) } : undefined}>{stat ? formatPercent(stat.winRate) : "—"}</strong></span>
        <span>{t("generated.champions.pr")} <strong>{stat ? formatPercent(pickRate) : "—"}</strong></span>
        <span>{stat ? formatNumber(stat.totalPlays) : "—"}</span>
        {stat && <span>{formatRecord(stat.wins, stat.losses)}</span>}
      </div>
    </div>
  </button>;
}
