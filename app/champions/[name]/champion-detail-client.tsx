/**
 * Render one champion's reference information without match statistics.
 *
 * refs: none
 */
"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import CanonicalTalentImage from "@/components/canonical-talent-image";
import ChampionLoadoutGrid from "@/components/champion-loadout-grid";
import ChampionChangelog from "@/components/champion-changelog";
import SmartImage from "@/components/SmartImage";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { getChampionData, type ChampionData, type ChampionSkill, type ChampionTalent } from "@/lib/champion-data";
import { useLocalization } from "@/lib/localization-context";
import ContextBackLink from "@/components/context-back-link";
import { championDescriptionKey } from "@/lib/localization/champion-description-key";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";
import { championSlug } from "@/lib/utils";
import type { ChampionChangelog as ChampionChangelogData } from "@/lib/champion-changelog";

const ROLE_ICONS: Record<string, string> = {
  Frontline: "/images/icons/Class_Front_Line_Icon.avif",
  Damage: "/images/icons/Class_Damage_Icon.avif",
  Flank: "/images/icons/Class_Flank_Icon.avif",
  Support: "/images/icons/Class_Support_Icon.avif",
};

/**
 * Keep champion pages limited to stable catalog data: profile, skills, talents, and cards.
 * I/O: in `{ initialChampionData?: ChampionData | null, initialChampionChangelog?: ChampionChangelogData | null }` -> out `JSX.Element`.
 *
 * refs: none
 */
export default function ChampionDetailPage({
  initialChampionData = null,
  initialChampionChangelog = null,
}: {
  initialChampionData?: ChampionData | null;
  initialChampionChangelog?: ChampionChangelogData | null;
}) {
  const { t } = useLocalization();
  const params = useParams();
  const rawName = params?.name;
  const name = Array.isArray(rawName) ? rawName[0] ?? "" : rawName ?? "";
  const staticChampion = STATIC_CHAMPIONS.find((champion) => championSlug(champion.name) === championSlug(name));
  const [championData, setChampionData] = useState<ChampionData | null>(initialChampionData);
  const [loaded, setLoaded] = useState(Boolean(initialChampionData));

  useEffect(() => {
    if (initialChampionData && championSlug(initialChampionData.name) === championSlug(name)) return;
    let cancelled = false;
    getChampionData(name)
      .then((data) => { if (!cancelled) setChampionData(data ?? null); })
      .catch(() => { if (!cancelled) setChampionData(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [initialChampionData, name]);

  if (loaded && !championData && !staticChampion) return notFound();
  const displayName = championData?.name ?? staticChampion?.name ?? name;

  return <div className="space-y-6">
    <ContextBackLink fallbackHref="/champions" label={t("generated.champions.backToChampions")} />

    {/* Header band: portrait + identity + stats */}
    <div className="pc-card flex flex-col gap-6 sm:flex-row sm:items-start">
      <SmartImage src={getChampionIconSafe(displayName)} alt={displayName} width={112} height={112} fetchPriority="high" className="h-28 w-28 shrink-0 rounded-xl object-contain sm:h-32 sm:w-32" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="pc-heading pc-heading-lg">{displayName}</h1>
          {(championData?.roles ?? staticChampion?.roles ?? []).map((role) => (
            <span key={role} className="flex items-center gap-1.5 rounded-full bg-pc-accent/10 px-3 py-1 text-xs text-pc-accent">
              {ROLE_ICONS[role] && <SmartImage src={ROLE_ICONS[role]} alt="" className="h-3.5 w-3.5" />}
              {role}
            </span>
          ))}
        </div>
        {championData?.stats && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <StatBadge label={t("common.metrics.health")} value={championData.stats.health} />
            <StatBadge label={t("common.metrics.speed")} value={championData.stats.speed} />
            <StatBadge label={t("common.metrics.range")} value={championData.stats.range} />
            <StatBadge label={t("common.metrics.speedUnits")} value={championData.stats.speedUnits} />
          </div>
        )}
      </div>
    </div>

    {/* Abilities */}
    {championData?.skills?.length ? <section className="space-y-2">
      <h2 className="pc-card-title">{t("generated.champions.skills")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {championData.skills.map((skill) => <SkillCard key={skill.name} championName={displayName} skill={skill} />)}
      </div>
    </section> : null}

    {/* Talents */}
    {championData?.talents?.length ? <section className="space-y-2">
      <h2 className="pc-card-title">{t("generated.champions.talents")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {championData.talents.map((talent) => <TalentCard key={talent.id} championName={displayName} talent={talent} />)}
      </div>
    </section> : null}

    {/* Loadout cards */}
    {championData?.loadouts?.length ? <section className="space-y-2">
      <h2 className="pc-card-title">{t("generated.champions.loadoutCards")}</h2>
      <ChampionLoadoutGrid championSlug={championSlug(displayName)} loadouts={championData.loadouts} />
    </section> : null}

    {/* Changelog */}
    {initialChampionChangelog && <ChampionChangelog history={initialChampionChangelog} />}
  </div>;
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline gap-1.5"><span className="text-xs text-pc-text-muted">{label}</span><span className="font-mono text-sm text-pc-text">{value}</span></div>;
}

function SkillCard({ championName, skill }: { championName: string; skill: ChampionSkill }) {
  const { t } = useLocalization();
  const icons = [skill.iconUrl, skill.iconUrl2, skill.iconUrl3].filter(Boolean) as string[];
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    if (icons.length <= 1) return;
    const interval = window.setInterval(() => setActiveIndex((current) => (current + 1) % icons.length), 2500);
    return () => window.clearInterval(interval);
  }, [icons.length]);
  const descriptionKey = championDescriptionKey(championName, "skills", skill.name);
  return <div className="pc-surface-light flex items-start gap-3 rounded-lg border border-pc-border p-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pc-bg-elevated">
      {icons[activeIndex] ? <SmartImage src={icons[activeIndex]} alt={skill.name} className="h-full w-full object-contain" /> : <span className="font-mono text-xs text-pc-accent">{skill.key}</span>}
    </div>
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-pc-text">{skill.name}</span>
        {skill.damage && <span className="font-mono text-xs text-pc-text-muted">{t("generated.champions.dmg")} {skill.damage}</span>}
        {skill.cooldown && <span className="font-mono text-xs text-pc-text-muted">{t("generated.champions.cd")} {skill.cooldown}</span>}
      </div>
      {skill.description && <p className="text-xs leading-relaxed text-pc-text-secondary">{descriptionKey ? t(descriptionKey) : skill.description}</p>}
    </div>
  </div>;
}

function TalentCard({ championName, talent }: { championName: string; talent: ChampionTalent }) {
  const { t } = useLocalization();
  const descriptionKey = championDescriptionKey(championName, "talents", talent.name);
  return <div className="pc-surface-light flex items-start gap-3 rounded-lg border border-pc-border p-3">
    <CanonicalTalentImage talentId={talent.id} talentName={talent.name} alt="" className="h-14 w-14 shrink-0 object-contain" fallbackClassName="h-14 w-14 shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-medium text-pc-accent">{talent.name}</div>
      <p className="text-xs leading-relaxed text-pc-text-secondary">{descriptionKey ? t(descriptionKey) : talent.description}</p>
    </div>
  </div>;
}
