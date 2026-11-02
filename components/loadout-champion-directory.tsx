/**
 * Own the champion selection UI for ranked loadout statistics.
 *
 * refs: none
 */
"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import SmartImage from "@/components/SmartImage";
import { getChampionIconSafe } from "@/lib/champion-icons";
import { STATIC_CHAMPIONS } from "@/lib/static-champions";
import { useLocalization } from "@/lib/localization-context";
import { championSlug } from "@/lib/utils";

const ROLES = [
  { value: "Frontline", labelKey: "common.roles.frontline", icon: "/images/icons/Class_Front_Line_Icon.avif" },
  { value: "Damage", labelKey: "common.roles.damage", icon: "/images/icons/Class_Damage_Icon.avif" },
  { value: "Flank", labelKey: "common.roles.flank", icon: "/images/icons/Class_Flank_Icon.avif" },
  { value: "Support", labelKey: "common.roles.support", icon: "/images/icons/Class_Support_Icon.avif" },
] as const;

/**
 * List all champions and filter them by their canonical class.
 * I/O: in () -> out `JSX.Element`.
 *
 * refs: none
 */
export default function LoadoutChampionDirectory() {
  const { t } = useLocalization();
  const [role, setRole] = useState<string | null>(null);
  const deferredRole = useDeferredValue(role);
  const champions = useMemo(() => STATIC_CHAMPIONS
    .filter((champion) => deferredRole == null || champion.roles.includes(deferredRole))
    .sort((left, right) => left.name.localeCompare(right.name)), [deferredRole]);

  return <div className="space-y-6">
    <h1 className="pc-heading pc-heading-lg">{t("stats.loadouts.title")}</h1>

    <div role="group" aria-label={t("generated.champions.class.41ff354")} className="flex flex-wrap gap-2 pb-1">
      <button type="button" onClick={() => setRole(null)} aria-pressed={role == null} className={`pc-touch-target rounded-lg px-3 py-2 text-sm font-medium transition-colors ${role == null ? "bg-pc-accent text-pc-bg" : "pc-surface text-pc-muted hover:text-pc-text"}`}>
        {t("generated.stats.all")}
      </button>
      {ROLES.map((entry) => <button type="button" key={entry.value} onClick={() => setRole(entry.value)} aria-pressed={role === entry.value} className={`pc-touch-target flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${role === entry.value ? "bg-pc-accent text-pc-bg" : "pc-surface text-pc-muted hover:text-pc-text"}`}>
        <SmartImage src={entry.icon} alt="" aria-hidden="true" className="h-5 w-5" />
        {t(entry.labelKey)}
      </button>)}
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {champions.map((champion) => {
        const roleEntry = ROLES.find((entry) => entry.value === champion.roles[0]);
        return <Link key={champion.id} href={`/stats/loadouts/${championSlug(champion.name)}`} className="group flex min-h-20 items-center gap-3.5 rounded-xl border border-pc-border bg-pc-bg-elevated p-3 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-pc-accent-mid hover:bg-pc-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent motion-reduce:transform-none">
          <SmartImage src={getChampionIconSafe(champion.name)} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-sm font-semibold text-pc-text transition-colors group-hover:text-pc-accent">{champion.name}</h2>
            {roleEntry && <span className="mt-1 inline-flex items-center gap-1 text-xs text-pc-text-muted">
              <SmartImage src={roleEntry.icon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
              {t(roleEntry.labelKey)}
            </span>}
          </div>
        </Link>;
      })}
    </div>
  </div>;
}
