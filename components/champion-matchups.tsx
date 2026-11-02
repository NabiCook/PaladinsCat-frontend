/** Browse ranked champion relationships over the rolling 30-day window.
 * refs: see: lib/champion-matchups-api.ts · documents/06-reference/design/frontend-design-system.md
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SmartImage from "@/components/SmartImage";
import CanonicalTalentImage from "@/components/canonical-talent-image";
import PageHeader from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { championSlug } from "@/lib/utils";
import { getChampionData, type ChampionTalent } from "@/lib/champion-data";
import { STATIC_CHAMPIONS, type StaticChampion } from "@/lib/static-champions";
import { getPercentageColor } from "@/lib/stat-quality";
import { useLocalization } from "@/lib/localization-context";
import {
  fetchChampionTalentMatchups,
  type ChampionRelationship,
  type ChampionTalentMatchupRow,
} from "@/lib/champion-matchups-api";

type TalentMatchups = { talent: ChampionTalent; rows: ChampionTalentMatchupRow[] };

const ROLES = [
  { value: "Frontline", labelKey: "common.roles.frontline", icon: "/images/icons/Class_Front_Line_Icon.avif" },
  { value: "Damage", labelKey: "common.roles.damage", icon: "/images/icons/Class_Damage_Icon.avif" },
  { value: "Flank", labelKey: "common.roles.flank", icon: "/images/icons/Class_Flank_Icon.avif" },
  { value: "Support", labelKey: "common.roles.support", icon: "/images/icons/Class_Support_Icon.avif" },
] as const;

/**
 * Render every opposing-champion relationship from cumulative ranked facts.
 * I/O: in `{ initialSlug?: string }` -> out `React.JSX.Element`.
 *
 * refs: none
 */
export default function ChampionMatchups({ initialSlug }: { initialSlug?: string }): React.JSX.Element {
  const router = useRouter();
  const { t, formatNumber, formatPercent } = useLocalization();
  const [roster] = useState<StaticChampion[]>(STATIC_CHAMPIONS);
  const [champion, setChampion] = useState(() => (
    STATIC_CHAMPIONS.find((entry) => championSlug(entry.name) === championSlug(initialSlug ?? ""))?.id
      ?? Number(STATIC_CHAMPIONS[0]?.id ?? 0)
  ));
  const [relationships, setRelationships] = useState<ChampionRelationship[]>([]);
  const [opponentTalents, setOpponentTalents] = useState<Map<number, ChampionTalent[]>>(new Map());
  const [talentMatchups, setTalentMatchups] = useState<TalentMatchups[]>([]);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!champion) return;
    const controller = new AbortController();
    Promise.all([
      Promise.all(roster.map(async (entry) => ({
        entry,
        current: await getChampionData(championSlug(entry.name)),
      }))),
      fetchChampionTalentMatchups(champion, 0, controller.signal),
    ])
      .then(([champions, matchup]) => {
        const selected = champions.find(({ entry }) => Number(entry.id) === champion)?.current;
        if (!selected?.talents.length) throw new Error("Champion talents are unavailable");
        const matchups = selected.talents.map((talent) => ({
          talent,
          rows: matchup.rows.filter((row) => row.championTalentId === Number(talent.id)),
        }));
        if (controller.signal.aborted) return;
        const opponents = champions.filter(({ entry }) => Number(entry.id) !== champion);
        const byOpponent = new Map(opponents.map(({ entry, current }) => [Number(entry.id), current?.talents ?? []]));
        const globals = new Map<number, ChampionRelationship>();
        for (const { rows } of matchups) for (const row of rows) {
          if (!byOpponent.get(row.opponentChampionId)?.some((talent) => Number(talent.id) === row.opponentTalentId)) continue;
          const global = globals.get(row.opponentChampionId) ?? {
            opponentChampionId: row.opponentChampionId,
            opponentChampionName: row.opponentChampionName,
            wins: 0,
            losses: 0,
            encounters: 0,
            winRate: null,
          };
          global.wins += row.wins;
          global.losses += row.losses;
          global.encounters += row.encounters;
          global.winRate = global.encounters > 0 ? (100 * global.wins) / global.encounters : null;
          globals.set(row.opponentChampionId, global);
        }
        setRelationships(opponents.map(({ entry }) => globals.get(Number(entry.id)) ?? {
          opponentChampionId: Number(entry.id), opponentChampionName: entry.name,
          wins: 0, losses: 0, encounters: 0, winRate: null,
        }).sort((left, right) => (right.winRate ?? -1) - (left.winRate ?? -1)));
        setOpponentTalents(byOpponent);
        setTalentMatchups(matchups);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setGlobalError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setGlobalLoading(false);
        }
      });
    return () => controller.abort();
  }, [champion, retry, roster]);

  const visibleRelationships = useMemo(() => relationships.filter((row) => {
    const matchesSearch = row.opponentChampionName.toLowerCase().includes(search.trim().toLowerCase());
    const opponent = roster.find((candidate) => Number(candidate.id) === row.opponentChampionId);
    const matchesRole = !filterRole || opponent?.roles?.includes(filterRole);
    return matchesSearch && matchesRole;
  }), [relationships, search, filterRole, roster]);
  const loading = globalLoading;
  const error = globalError;

  function selectChampion(championId: number) {
    setChampion(championId);
    setRelationships([]);
    setOpponentTalents(new Map());
    setTalentMatchups([]);
    setGlobalLoading(true);
    setGlobalError(false);
    const selected = roster.find((row) => Number(row.id) === championId);
    router.push(`/stats/champions/${championSlug(selected?.name ?? "")}`, { scroll: false });
  }

  return <div className="space-y-6">
    <PageHeader
      parentHref="/stats"
      parentLabel={t("stats.matchups.directory")}
      title={t("stats.matchups.title")}
    />

    <div className="flex flex-wrap items-end gap-4">
      <label className="min-w-52 flex-1 space-y-2 text-sm">
        {t("stats.matchups.champion")}
        <select className="pc-input w-full" value={champion} onChange={(event) => selectChampion(Number(event.target.value))}>
          {roster.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label className="min-w-52 flex-1 space-y-2 text-sm">
        {t("stats.matchups.search")}
        <input className="pc-input w-full" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <div className="space-y-2">
        <span className="block text-sm">{t("generated.champions.class.41ff354")}</span>
        <SegmentedControl
          label={t("generated.champions.class.41ff354")}
          value={filterRole ?? "all"}
          onChange={(role) => setFilterRole(role === "all" ? null : role)}
          items={[
            { value: "all", label: t("generated.stats.all") },
            ...ROLES.map((role) => ({
              value: role.value,
              label: t(role.labelKey),
              icon: <SmartImage src={role.icon} alt="" aria-hidden="true" width={20} height={20} className="h-5 w-5" />,
            })),
          ]}
        />
      </div>
    </div>

    {loading && <p role="status">{t("stats.matchups.loading")}</p>}
    {error && <div role="alert" className="pc-card p-4">
      {t("stats.matchups.error")}{" "}
      <button className="pc-button" onClick={() => {
        setGlobalLoading(true);
        setGlobalError(false);
        setRetry((value) => value + 1);
      }}>
        {t("stats.matchups.retry")}
      </button>
    </div>}
    {!loading && !error && visibleRelationships.length === 0 && <p className="pc-card p-4 text-sm text-pc-text-secondary">{t("stats.matchups.empty")}</p>}
    {!loading && !error && visibleRelationships.length > 0 && <div className="grid gap-3 lg:grid-cols-2">
      {visibleRelationships.map((row) => {
        const talents = opponentTalents.get(row.opponentChampionId) ?? [];
        return <article key={row.opponentChampionId} className="rounded-lg border border-pc-border bg-pc-bg-elevated p-3">
          <Link href={`/stats/champions/${championSlug(row.opponentChampionName)}`} className="flex items-center gap-2.5">
            <SmartImage src={getChampionIconSafe(row.opponentChampionName)} alt="" width={40} height={40} className="h-10 w-10 rounded-md object-contain" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-pc-text hover:text-pc-accent">{row.opponentChampionName}</h2>
              <p className="text-xs text-pc-text-muted">{t("stats.matchups.rate")}</p>
            </div>
            {row.encounters < 30 && <span className="text-xs text-pc-text-muted">{t("stats.matchups.lowSample")}</span>}
          </Link>
          <div className="mt-3 overflow-x-auto border-t border-pc-border/60 pt-3">
            <table className="w-full min-w-[28rem] table-fixed text-xs tabular-nums">
              <caption className="sr-only">{t("stats.matchups.rate")} {row.opponentChampionName}</caption>
              <thead><tr>
                <th scope="col" className="p-2 text-left font-medium text-pc-text-muted">{roster.find((entry) => Number(entry.id) === champion)?.name}</th>
                {talents.map((talent) => <th scope="col" key={talent.id} className="p-2 align-top font-medium text-pc-text-secondary">
                  <CanonicalTalentImage talentId={Number(talent.id)} talentName={talent.name} alt="" className="mx-auto mb-1 h-8 w-8 rounded object-cover" fallbackClassName="mx-auto mb-1 h-8 w-8 rounded" />
                  {talent.name}
                </th>)}
              </tr></thead>
              <tbody>{talentMatchups.map(({ talent, rows }) => <tr key={talent.id} className="border-t border-pc-border/50">
                <th scope="row" className="p-2 text-left font-medium text-pc-text-secondary">
                  <CanonicalTalentImage talentId={Number(talent.id)} talentName={talent.name} alt="" className="mb-1 h-8 w-8 rounded object-cover" fallbackClassName="mb-1 h-8 w-8 rounded" />
                  {talent.name}
                </th>
                {talents.map((opponentTalent) => {
                  const cell = rows.find((entry) => entry.opponentChampionId === row.opponentChampionId && entry.opponentTalentId === Number(opponentTalent.id));
                  const encounters = cell?.encounters ?? 0;
                  const winRate = cell && encounters > 0 ? 100 * cell.wins / encounters : null;
                  return <td key={opponentTalent.id} className="p-2 text-center">
                    <strong className="text-sm" style={winRate == null ? undefined : { color: getPercentageColor(winRate) }}>{formatPercent(winRate, { maximumFractionDigits: 1 })}</strong>
                    <div className="mt-1 text-pc-text-muted">{formatNumber(encounters)} {t("stats.matchups.samples")}</div>
                  </td>;
                })}
              </tr>)}</tbody>
            </table>
          </div>
        </article>;
      })}
    </div>}
  </div>;
}
