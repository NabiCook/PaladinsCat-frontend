/**
 * Shared relationships card view; accepts data without fetching it.
 *
 * refs: none
 */
"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { EmptyState } from "@/components/async-state";
import PlayerRelationshipBars from "@/components/player-relationship-bars";
import PlayersPageHeader from "@/components/ui/players-page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { PlayerRelationshipSummary } from "@/lib/api-client";
import { useLocalization } from "@/lib/localization-context";
import { getPercentageColor } from "@/lib/stat-quality";

type Mode = "teammates" | "opponents" | "party";

/**
 * Render the relationships card view (teammates/opponents/party) from a summary.
 * I/O: in `{ summary: PlayerRelationshipSummary }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function PlayerRelationshipsView({ summary }: { summary: PlayerRelationshipSummary }) {
  const { t, formatNumber, formatPercent } = useLocalization();
  const [mode, setMode] = useState<Mode>("teammates");
  const casual = summary.scope === "casual";
  const rows = mode === "opponents" ? summary.opponents : mode === "party" ? summary.partyPartners : summary.teammates;
  const partyMetricMatches = summary.totals.partyMetricMatches;
  const partyWinRate = partyMetricMatches > 0 ? (summary.totals.partyWins / partyMetricMatches) * 100 : null;
  const tabs: Array<{ mode: Mode; label: string; count: number }> = [
    { mode: "teammates", label: t("common.relationships.teammates"), count: summary.totals.uniqueTeammates },
    { mode: "opponents", label: t("common.relationships.opponents"), count: summary.totals.uniqueOpponents },
    { mode: "party", label: t("common.relationships.partyPartners"), count: summary.totals.partyPartners },
  ];

  return (
    <div className="space-y-6">
      <PlayersPageHeader title={t(casual ? "common.relationships.casualTitle" : "common.relationships.rankedTitle")} description={casual ? t("common.relationships.casualDescription") : undefined} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          [t("common.relationships.teammates"), formatNumber(summary.totals.teammateMatches), "text-cyan-300"],
          [t("common.relationships.opponents"), formatNumber(summary.totals.opponentMatches), "text-violet-300"],
          [t("common.relationships.partyPartners"), formatNumber(summary.totals.partyPartners), "text-amber-300"],
          [t("common.relationships.matchesTogether"), formatNumber(summary.totals.partyMatches), "text-emerald-300"],
          [t("generated.players.winRate"), formatPercent(partyWinRate), "", partyWinRate == null ? undefined : getPercentageColor(partyWinRate)],
        ].map(([label, value, color, inlineColor]) => <div key={String(label)} className="pc-card min-w-0"><div className="text-xs uppercase tracking-[0.14em] text-pc-text-muted">{label}</div><div className={`mt-2 font-mono text-2xl font-bold ${color}`} style={inlineColor ? { color: inlineColor } : undefined}>{value}</div></div>)}
      </div>

      <section className="pc-card">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-pc-border pb-4">
          <div className="flex items-center gap-2"><Swords aria-hidden="true" className="h-5 w-5 text-pc-accent" /><h2 className="text-lg font-bold text-pc-text">{t(casual ? "common.relationships.casualEncounterMix" : "common.relationships.encounterMix")}</h2></div>
          <SegmentedControl label={t("common.relationships.title")} items={tabs.map((tab) => ({ value: tab.mode, label: <>{tab.label} · {formatNumber(tab.count)}</> }))} value={mode} onChange={setMode} />
        </div>
        {rows.length === 0 ? <EmptyState title={t(casual ? "common.relationships.casualEmpty" : "common.relationships.empty")} /> : <PlayerRelationshipBars rows={rows} tone={mode === "opponents" ? "violet" : mode === "party" ? "amber" : "cyan"} showDetails className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" />}
      </section>
    </div>
  );
}
