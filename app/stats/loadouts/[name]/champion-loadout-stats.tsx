/**
 * Own one champion's ranked talent and loadout-card analysis UI.
 *
 * refs: none
 */
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CanonicalTalentImage from "@/components/canonical-talent-image";
import ChampionLoadoutGrid from "@/components/champion-loadout-grid";
import ContextBackLink from "@/components/context-back-link";
import { EmptyState, ErrorState, LoadingIndicator } from "@/components/async-state";
import type { ChampionData, ChampionTalent } from "@/lib/champion-data";
import {
  fetchChampionCardStats,
  fetchChampionTalentStats,
  type ChampionTalentStat,
} from "@/lib/api-client";
import { formatApiErrorMessage } from "@/lib/api-errors";
import { useLobbyTier } from "@/lib/lobby-tier-context";
import { useLocalization } from "@/lib/localization-context";
import { getPercentageColor, getStatQuality } from "@/lib/stat-quality";
import { championSlug } from "@/lib/utils";
import { championDescriptionKey } from "@/lib/localization/champion-description-key";
import { useApiSection } from "@/lib/use-api-section";

function positiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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
  const { tierMin, tierMax } = lobbyTier;
  const readTalents = useCallback(() => fetchChampionTalentStats(championId, "ranked", { tierMin, tierMax }), [championId, tierMin, tierMax]);
  const readCards = useCallback(() => fetchChampionCardStats(championId, "ranked", selectedTalentId, { tierMin, tierMax }), [championId, selectedTalentId, tierMin, tierMax]);
  const talents = useApiSection(lobbyTierReady ? readTalents : null);
  const cards = useApiSection(lobbyTierReady ? readCards : null);
  const talentStats = talents.data;
  const statsByTalent = useMemo(() => new Map((talentStats?.talents ?? []).map((talent) => [talent.talentId, talent])), [talentStats]);
  const maxTalentPlays = Math.max(1, ...(talentStats?.talents ?? []).map((talent) => talent.totalPlays));
  const currentLocation = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;

  function selectTalent(talentId: number) {
    const query = new URLSearchParams(searchParams.toString());
    if (selectedTalentId === talentId) query.delete("talentId");
    else query.set("talentId", String(talentId));
    router.replace(query.size > 0 ? `${pathname}?${query.toString()}` : pathname, { scroll: false });
  }

  const talentError = t("generated.champions.talentStatisticsUnavailable");
  const cardError = t("generated.champions.cardStatisticsUnavailable");

  return <div className="space-y-6">
    <header>
      <ContextBackLink fallbackHref="/stats/loadouts" label={t("stats.loadouts.title")} />
      <h1 className="mt-2 pc-heading pc-heading-lg">{championData.name} {t("generated.champions.loadoutCards")}</h1>
    </header>

    <section className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-busy={talents.loading}>
      {championData.talents.slice(0, 3).map((talent) => <TalentStatCard
        key={talent.id}
        championName={championData.name}
        talent={talent}
        stat={statsByTalent.get(talent.id)}
        totalMatches={talentStats?.totalMatches ?? 0}
        maxTalentPlays={maxTalentPlays}
        selected={selectedTalentId === talent.id}
        onSelect={() => selectTalent(talent.id)}
      />)}
      {talents.loading && <LoadingIndicator className="md:col-span-3" />}
      {talents.failed && <ErrorState className="md:col-span-3" title={talentError} message={formatApiErrorMessage(talents.error, t, talentError)} onRetry={talents.retry} />}
    </section>

    <section className="space-y-2" aria-busy={cards.loading}>
      <h2 className="pc-card-title">{t("generated.champions.loadoutCards")}</h2>
      {cards.loading && <LoadingIndicator />}
      {cards.failed && <ErrorState title={cardError} message={formatApiErrorMessage(cards.error, t, cardError)} onRetry={cards.retry} />}
      {championData.loadouts?.length ? <ChampionLoadoutGrid
        championSlug={championSlug(championData.name)}
        loadouts={championData.loadouts}
        cardStats={cards.data}
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
