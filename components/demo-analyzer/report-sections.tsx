"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import SmartImage from "@/components/SmartImage";
import { getChampionData, getChampionSkillIcon, type ChampionData } from "@/lib/champion-data";
import { itemIconPath } from "@/lib/image-assets";
import { Package } from "lucide-react";
import type { DemoPlayer } from "@/lib/demo-analyzer";
import { groupSkillObservations, observedSlotLabel, type ObservedDevice } from "@/lib/demo-skill-rows";
import { championSlug } from "@/lib/utils";
import championTitles from "@/public/drafts/champion-titles.json";

export const reportPanel = "pc-card p-4 sm:p-6";
export const reportButton = "pc-btn-secondary min-h-11 inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent disabled:cursor-not-allowed disabled:opacity-50";
export const displayNumber = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
export const displayTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
type ReportProps = { players: DemoPlayer[] };

function Section({ title, note, children, actions }: { title: string; note?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className={reportPanel}><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-pc-text">{title}</h2>{note && <p className="mt-1 text-sm text-pc-text-secondary">{note}</p>}</div>{actions}</div>{children}</section>;
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="flex min-h-32 items-center justify-center text-center text-sm text-pc-text-muted">{children}</p>;
}
function Metrics({ values }: { values: [string, number | null | undefined][] }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">{values.map(([label, value]) => <div key={label}><dt className="text-xs text-pc-text-muted">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{displayNumber(value)}</dd></div>)}</dl>;
}
function MetricLegend({ entries }: { entries: [string, string][] }) {
  return <details className="mt-4 text-sm"><summary className="w-fit cursor-pointer text-pc-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">Metric legend</summary><dl className="mt-3 grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2">{entries.map(([term, meaning]) => <div key={term}><dt className="font-semibold text-pc-text">{term}</dt><dd className="mt-1 text-pc-text-secondary">{meaning}</dd></div>)}</dl></details>;
}
function identity(player: DemoPlayer) {
  return player.identity.champion_name ?? "Unknown champion";
}
type MetricValue = number | null | undefined | { value: number | null; reason: string };
function Cell({ value }: { value: MetricValue }) {
  if (value != null && typeof value === "object") {
    if (value.value != null) return <>{displayNumber(value.value)}</>;
    return <span tabIndex={0} title={value.reason} aria-label={`Unavailable: ${value.reason}`} className="text-xs text-pc-text-secondary">N/A</span>;
  }
  return <>{displayNumber(value)}</>;
}
function Kda({ player }: { player: DemoPlayer }) {
  const c = player.metrics.combat;
  return <span className="mt-1 block whitespace-nowrap text-xs font-normal text-pc-text-secondary">
    <span className="text-pc-text-muted">K / D / A </span>{[c.kills,c.deaths,c.assists].map((value,index)=><span key={index} className="font-semibold text-pc-text">{index > 0 && " / "}{value == null ? <span title="Score unavailable">?</span> : displayNumber(value)}</span>)}
  </span>;
}
function Grid({ columns, players, values, compactPlayer = false }: { columns: string[]; players: DemoPlayer[]; values: (player: DemoPlayer) => MetricValue[]; compactPlayer?: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-pc-text-muted"><tr><th scope="col" className={`sticky left-0 z-10 whitespace-nowrap bg-pc-bg-elevated p-2 ${compactPlayer ? "w-36 min-w-36 max-w-36" : "min-w-44"}`}>Player · K / D / A</th>{columns.map(label => <th scope="col" key={label} className="whitespace-nowrap p-2 text-right">{label}</th>)}</tr></thead><tbody>{players.map(player => <tr key={player.index} className="border-t border-pc-border/50"><th scope="row" className={`sticky left-0 z-10 whitespace-nowrap bg-pc-bg-elevated p-2 font-medium ${compactPlayer ? "w-36 min-w-36 max-w-36" : ""}`}><span className={compactPlayer ? "block w-32 truncate" : "block"} title={player.name ?? undefined}>{player.name ?? `Player ${player.index + 1}`}</span><span className={`block text-xs font-normal text-pc-text-muted ${compactPlayer ? "w-32 truncate" : ""}`} title={identity(player)}>{identity(player)}</span><Kda player={player} /></th>{values(player).map((value, i) => <td key={columns[i]} className="p-2 text-right tabular-nums"><Cell value={value} /></td>)}</tr>)}</tbody></table>{!players.length && <Empty>Choose a .demo recording to calculate its report.</Empty>}</div>;
}

/** Plot only the observed series; geometry and display thinning do not compute metrics. */
function SeriesPlot({ series, labels, units }: { series: { name: string; points: [number, number][]; color: string }[]; labels: string; units: string }) {
  const all = series.flatMap(s => s.points);
  if (!all.length) return <Empty>No recorded samples.</Empty>;
  const start = all.reduce((value, point) => Math.min(value, point[0]), Infinity);
  const end = all.reduce((value, point) => Math.max(value, point[0]), -Infinity);
  const low = all.reduce((value, point) => Math.min(value, point[1]), 0);
  const high = all.reduce((value, point) => Math.max(value, point[1]), Math.max(1, low + 1));
  const y = (value: number) => 154 - (value - low) / (high - low || 1) * 130;
  return <figure>
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-pc-text-secondary">{series.map(s => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</span>)}<span>{units}</span></div>
    <svg viewBox="0 0 800 190" className="w-full" role="img" aria-label={labels}>
      {[low, high].map((value, index) => <g key={index}><line x1="50" x2="780" y1={y(value)} y2={y(value)} stroke="currentColor" opacity="0.12" /><text x="2" y={y(value) + 4} fill="currentColor" fontSize="10">{displayNumber(value)}</text></g>)}
      {series.map(s => {
        const stride = Math.max(1, Math.ceil(s.points.length / 400));
        const visible = s.points.filter((_, index) => index % stride === 0 || index === s.points.length - 1);
        const d = visible.map((point, index) => `${index ? "L" : "M"}${50 + (point[0] - start) / (end - start || 1) * 730},${y(point[1])}`).join(" ");
        return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth="1.5" />;
      })}
      <text x="50" y="181" fill="currentColor" fontSize="10">{displayTime(start)}</text><text x="744" y="181" fill="currentColor" fontSize="10">{displayTime(end)}</text>
    </svg>
  </figure>;
}


export function MatchReport({ players }: ReportProps) {
  return <Section title="Combat">
    <Grid players={players} columns={["Kills", "Deaths", "Assists", "Damage", "DPM", "Healing", "HPM", "Shielding", "Shield / min", "Credits", "Credits / min", "Objective assists", "In combat s", "In combat %", "Combat coverage s"]} values={p => { const c = p.metrics.combat; return [c.kills, c.deaths, c.assists, c.damage, c.dpm, c.healing, c.hpm, c.shielding, c.shielding_per_min, c.credits, c.credits_per_min, c.objective_assists, c.in_combat_s, c.in_combat_pct, c.known_s]; }} />
    <MetricLegend entries={[["K / D / A", "Kills, deaths and assists."], ["DPM / HPM", "Damage or healing per minute."], ["Shielding", "Damage absorbed by shields."], ["Objective assists", "Assists credited for objective play."], ["In combat", "Time spent fighting."], ["Combat coverage", "Time with a known combat state."], ["s / min / %", "Seconds, minutes and percent."]]} />
  </Section>;
}

export function AimReport({ players }: ReportProps) {
  return <>
    <Section title="Aim overview">
      <Grid compactPlayer players={players} columns={["Combat s", "Track %", "Track °", "Head % (est)", "Flicks", "Snap ms", "Flick °", "Retain %", "Jitter °", "Delay ms", "First aim % (est)"]} values={p => { const a=p.metrics.aim; const firing=(value:number|null,reason:string):MetricValue=>({value:a.fire_evidence==="per_shot"?value:null,reason:a.fire_evidence==="not_observed"?"Shot data unavailable.":reason}); return [p.metrics.combat.in_combat_s,{value:a.tracking_pct,reason:p.identity.team_actor==null?"Team unavailable.":"Target tracking unavailable."},{value:a.tracking_mean_deviation_deg,reason:"Target tracking unavailable."},{value:a.fire_evidence==="per_shot"?a.fire_aim_proxy.head_pct:null,reason:a.fire_evidence==="not_observed"?"Shot data unavailable.":"No near-target shots available."},firing(a.flicks,"No flick data."),firing(a.snap_ms.mean,"No flick data."),firing(a.initial_flick_deviation_deg,"No flick data."),firing(a.retention_1s_pct,"Insufficient aim data after a flick."),firing(a.jitter_deg,"Insufficient aim data after a flick."),firing(a.reaction_ms.mean,"First-shot timing unavailable."),firing(a.first_fire_aim_pct,"First-shot aim unavailable.")]; }} />
      <MetricLegend entries={[["Track %", "Time aim stays close to an enemy while fighting."], ["Track °", "Average angle between aim and the enemy."], ["Head % (est)", "Share of near-target aim points near the head, estimated."], ["Combat s", "Time spent fighting."], ["K / D / A", "Kills, deaths and assists."], ["Flicks", "Quick aim adjustments onto a target, followed by a shot."], ["Snap ms", "Average time taken to bring aim onto a target and fire."], ["Flick °", "Angle between aim and the target at the flick's shot."], ["Retain %", "Time aim stays near the target in the second after a flick."], ["Jitter °", "Variation in how far aim sits from a target after a flick."], ["Delay ms", "Estimated average delay from a target entering the aiming area to the first shot."], ["First aim % (est)", "Share of mapped first shots aimed near the target, estimated."], ["s / ms / °", "Seconds, milliseconds and degrees."]]} />
    </Section>
    {!!players.length && <Section title="Recorded aim"><div className="grid gap-6 lg:grid-cols-2">{players.map(player => <div key={player.index}><h3 className="mb-3 text-sm font-semibold">{player.name}</h3><SeriesPlot labels={`Recorded aim direction for ${player.name}`} units="Degrees" series={[{ name:"Left / right",color:"var(--color-pc-accent, #cba6f7)",points:player.aim.map(p=>[p[0],p[2]]) },{ name:"Up / down",color:"#38bdf8",points:player.aim.map(p=>[p[0],p[1]]) }]} /></div>)}</div></Section>}
  </>;
}

const zoneColors = { head:"#fcd34d",body:"#38bdf8",leg:"#a78bfa",miss:"#f87171" };
const zoneLabels = { head:"Near head",body:"Near body",leg:"Near legs",miss:"Outside target area" };
export function ShotMapReport({ players }: ReportProps) {
  const [view,setView]=useState<"far"|"center">("far");
  const [mode,setMode]=useState<"aim"|"hits">("aim");
  return <Section title="Aim and impact" actions={<SegmentedControl label="Shot map view" items={[{value:"far",label:"Far View"},{value:"center",label:"Zoom Center"}]} value={view} onChange={setView} />}>
    <SegmentedControl label="Shot data" items={[{value:"aim",label:"Aim at fire"},{value:"hits",label:"Hits on target"}]} value={mode} onChange={setMode} />
    <div className="my-4 flex flex-wrap gap-4 text-xs text-pc-text-secondary">{mode==="aim"?(Object.keys(zoneColors) as (keyof typeof zoneColors)[]).map(zone=><span key={zone} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{backgroundColor:zoneColors[zone]}} />{zoneLabels[zone]}</span>):<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Recorded hit</span>}</div>
    {!players.length && <Empty>Choose a recording to view shot placement.</Empty>}
    <div className="grid gap-4 lg:grid-cols-2">{players.map(player=>{
      const shots=mode==="aim"?player.metrics.shots:player.metrics.impacts;
      const coverage=player.metrics.shot_coverage;
      const extent=view==="center"?190:shots.reduce((m,p)=>Math.max(m,Math.abs(p.x),Math.abs(p.y)),190)*1.1;
      const project=(v:number)=>150+v/extent*135;
      const a=player.metrics.aim.fire_aim_proxy;
      return <div key={player.index} className="pc-surface-subtle rounded-lg p-4"><h3 className="text-sm font-semibold">{player.name} <span className="text-xs font-normal text-pc-text-muted">{identity(player)}</span></h3>
        <svg viewBox="0 0 360 320" className="mt-3 w-full" role="img" aria-label={`${player.name}: ${shots.length} ${mode==="aim"?"fire-time aim points":"recorded hit positions"}`}>
          <defs><clipPath id={`shot-clip-${player.index}`}><rect x="15" y="15" width="270" height="270" /></clipPath></defs>
          <g transform="translate(25,0)"><rect x="15" y="15" width="270" height="270" fill="none" stroke="currentColor" opacity=".15" />
          <line x1="150" x2="150" y1="15" y2="285" stroke="currentColor" opacity=".2" /><line x1="15" x2="285" y1="150" y2="150" stroke="currentColor" opacity=".2" />
          {view==="center" && [[60,"Head",zoneColors.head],[0,"Body",zoneColors.body],[-100,"Leg",zoneColors.leg]].map(([y,label,color])=><g key={label}><line x1="15" x2="285" y1={project(-Number(y))} y2={project(-Number(y))} stroke={String(color)} strokeDasharray="4 5" opacity=".3" /><text x="288" y={project(-Number(y))+4} fill={String(color)} fontSize="10">{label}</text></g>)}
          <g clipPath={`url(#shot-clip-${player.index})`}>{shots.map((p,i)=><circle key={i} cx={project(p.x)} cy={project(-p.y)} r={mode==="hits"?2:p.zone==="miss"?1.5:2} fill={mode==="hits"?"#34d399":zoneColors[p.zone]} opacity={mode==="hits"?.65:p.zone==="miss"?.35:.55}><title>{`${mode==="aim"?"Fired":"Hit"} ${displayTime(p.time_s)}${"deviation_deg" in p?` · aim offset ${displayNumber(p.deviation_deg)}°`:""}${"target_source" in p && p.target_source==="nearest_aim_direction_estimate"?" · estimated target":""} · target distance ${displayNumber(p.distance)} game units`}</title></circle>)}</g>
          <text x="15" y="306" fill="currentColor" fontSize="10">±{displayNumber(extent)} units · head above center</text></g>
        </svg>
        {mode==="aim"?<Metrics values={[["Near head",a.head],["Near body",a.body],["Near legs",a.leg],["Outside target area",a.misses]]} />:<Metrics values={[["Recorded hits",coverage.hit_events],["Mapped hits",coverage.mapped_impacts],["Unmapped hits",coverage.unmapped_impacts],["Friendly / self",coverage.friendly_hit_events]]} />}
        {!shots.length && <p className="my-3 text-sm text-pc-text-secondary">{mode==="aim"?"Fire-time aim unavailable.":"Hit positions unavailable."}</p>}<p className="mt-3 text-xs text-pc-text-muted">{displayNumber(shots.length)} mapped · {displayNumber(mode==="aim"?coverage.unmapped_aim:coverage.unmapped_impacts)} unmapped</p>

      </div>;
    })}</div>
    <MetricLegend entries={[["Aim at fire","Where a shot was aimed relative to the target when fired."],["Hits on target","Where recorded enemy hits landed relative to the target when hit."],["Target estimate","An inferred target for a shot."],["Body guides","Approximate head, body and leg regions."],["Unmapped","An event without enough position data to plot."],["Friendly / self","Recorded hits on allies or the shooter."],["Game units","The game’s distance unit."]]} />
  </Section>;
}

function RecordedItem({ item }: { item: DemoPlayer["identity"]["items"][number] }) {
  const [missing, setMissing] = useState(false);
  const name = item.name ?? "Unknown item";
  const rank = item.rank ?? "?";
  return <span className="inline-flex items-center gap-1.5 rounded text-xs tabular-nums" role="img" title={`${name} · rank ${rank}`} aria-label={`${name}, rank ${rank}`}>
    {item.name && !missing ? <SmartImage src={itemIconPath(item.name)} alt="" aria-hidden="true" width={32} height={32} loading="lazy" decoding="async" className="h-8 w-8 rounded object-contain" onError={() => setMissing(true)} /> : <Package aria-hidden="true" className="h-8 w-8 text-pc-text-muted" />}
    <span aria-hidden="true">{rank}</span>
  </span>;
}

export function SkillsReport({ players }: ReportProps) {
  const value = (n: number | null) => n == null ? "N/A" : displayNumber(n);
  const [kits, setKits] = useState<Record<string, ChampionData | undefined>>({});
  const champions = JSON.stringify([...new Set(players.flatMap(p => p.identity.champion_name ? [p.identity.champion_name] : []))].sort());
  useEffect(() => {
    let active = true;
    const names = JSON.parse(champions) as string[];
    if (!names.length) return;
    void Promise.all(names.map(async name => [name, await getChampionData(name)] as const))
      .then(entries => { if (active) setKits(Object.fromEntries(entries)); })
      .catch(() => { if (active) setKits({}); });
    return () => { active = false; };
  }, [champions]);
  const ids = championTitles.championIds as Record<string, number>;
  const columns = ["Slot", "Ability", "Base CD", "Ability uses", "Start signal", "Average CD", "Shortest CD", "Hit signal"];
  return <>
    <Section title="Skills & cooldowns">
      <MetricLegend entries={[["CD", "Cooldown: wait until an ability is ready again, in seconds."], ["Base CD", "The standard cooldown before reductions."], ["Average / shortest CD", "Typical and quickest complete cooldowns recorded."], ["Ability uses", "For skills: recorded activations, including interrupted starts; LMB counts shots. For devices and cards: recorded fire signals, which can repeat and are not necessarily uses."], ["Start signal", "Recorded starts; some can be interrupted."], ["Hit signal", "Recorded hit notices; one use can produce several."], ["—", "No applicable cooldown."], ["N/A", "Not enough recorded data."], ["LMB / RMB", "Left and right mouse buttons."]]} />
      {!players.length && <Empty>Choose a recording to calculate skill use.</Empty>}
    </Section>
    {players.map(player => {
      const name = player.identity.champion_name ?? "";
      const kit = kits[name];
      const championId = ids[championSlug(name)] ?? null;
      const grouped = groupSkillObservations(player.metrics.skills, player.observed_devices, championId);
      const observation = (row: ObservedDevice, card: boolean) => {
        const image = card && championId != null && row.reference_champion_id === championId && row.device_id != null
          ? kit?.loadouts?.find(reference => reference.id === row.device_id)?.iconUrl : null;
        const icon = image?.startsWith("/images/cards/") ? image : null;
        return <tr key={`${row.slot}:${row.device_id ?? "unknown"}`} className="border-t border-pc-border/50">
          <th scope="row" className="p-2">{observedSlotLabel(row.slot)}</th>
          <td className="p-2 text-xs"><div className="flex items-center gap-2">{icon ? <SmartImage src={icon} alt="" aria-hidden="true" width={32} height={32} loading="lazy" decoding="async" className="h-8 w-8 shrink-0 rounded object-contain" /> : <span aria-hidden="true" className="h-8 w-8 shrink-0" />}<span>{row.name ?? "Unknown device"}{row.kind === "ability_support" && <span className="block text-xs text-pc-text-muted">Supporting effect</span>}</span></div></td>
          <td className="p-2">—</td><td className="p-2 tabular-nums" title="Recorded fire signals; these can repeat and are not necessarily ability uses.">{value(row.fires)}</td><td className="p-2 tabular-nums">{value(row.starts)}</td><td className="p-2">—</td><td className="p-2">—</td><td className="p-2 tabular-nums">{value(row.hits)}</td>
        </tr>;
      };
      return <Section key={player.index} title={`${player.name} · ${identity(player)}`}>
        <div className="mb-5 flex flex-wrap gap-2">{player.identity.items.map(item=><RecordedItem key={`${item.id}:${item.name ?? ""}`} item={item} />)}{!player.identity.items.length && <span className="text-xs text-pc-text-muted">Items unavailable.</span>}</div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-pc-text-muted"><tr>{columns.map(label=><th scope="col" key={label} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead><tbody>
          {grouped.skills.map(({skill, starts}) => {
            const icon = getChampionSkillIcon(kit,skill.slot,skill.ability_name);
            return <tr key={skill.slot} className="border-t border-pc-border/50"><th scope="row" className="p-2">{skill.slot}</th><td className="p-2 text-xs"><div className="flex items-center gap-2">{icon ? <SmartImage src={icon} alt="" aria-hidden="true" width={32} height={32} loading="lazy" decoding="async" className="h-8 w-8 shrink-0 rounded object-contain" /> : <span aria-hidden="true" className="h-8 w-8 shrink-0" />}<span>{skill.ability_name??"N/A"}</span></div></td><td className="p-2 tabular-nums">{skill.cooldown_kind==="none"?"—":value(skill.base_cd_s)}</td><td className="p-2 tabular-nums" title={skill.uses_source==="native_ability_start"?"Includes interrupted starts.":undefined}>{value(skill.ability_uses)}</td><td className="p-2 tabular-nums">{value(starts)}</td>{[skill.avg_cd_s,skill.shortest_cd_s,skill.hit_signals].map((v,i)=><td key={i} className="p-2 tabular-nums">{value(v)}</td>)}</tr>;
          })}
          {!!grouped.devices.length && <tr><th scope="colgroup" colSpan={columns.length} className="p-2 text-xs text-pc-text-muted">Devices</th></tr>}
          {grouped.devices.map(row => observation(row, false))}
          {!!grouped.cards.length && <tr><th scope="colgroup" colSpan={columns.length} className="p-2 text-xs text-pc-text-muted">Cards</th></tr>}
          {grouped.cards.map(row => observation(row, true))}
        </tbody></table></div>
      </Section>;
    })}
  </>;
}

export function UltimateReport({ players }: ReportProps) {
  return <>
    <Section title="Ultimates"><MetricLegend entries={[["Ultimate charge", "Progress toward having an ultimate ready."], ["Charge gained", "Total ultimate charge earned."], ["Charge / second", "Average pace of ultimate charge gain."], ["Charge coverage", "Time covered by the ultimate charge history."], ["Charge spends", "Drops in ultimate charge, representing estimated ultimate uses."], ["Full charges gained", "Charge earned expressed as full ultimate meters."], ["s", "Seconds."]]} />{!players.length && <Empty>Choose a recording to view ultimate charge.</Empty>}</Section>
    {players.map(player=>{const u=player.metrics.ultimate;return <Section key={player.index} title={`${player.name} · ${identity(player)}`}>
    <Metrics values={[["Charge gained",u.charge_gained],["Charge / second",u.charge_per_s],["Charge coverage s",u.active_s],["Charge spends (estimated)",u.spend_episodes],["Full charges gained",u.charge_equivalent_ults]]} />
    <div className="mt-5"><SeriesPlot labels={`${player.name} ultimate charge`} units="Charge points" series={[{name:"Charge",color:"var(--color-pc-accent, #cba6f7)",points:player.ultimate_charge.map(p=>[p[0],p[1]])}]} /></div>
    <p className="mt-3 text-xs text-pc-text-muted">Charge spent at: {u.spend_times.map(displayTime).join(" · ")||"—"}</p>
  </Section>;})}</>;
}

export function MovementReport({ players }: ReportProps) {
  return <>
    <Section title="Movement" note="Approximate ground speed; some movement abilities may still be included.">
      <MetricLegend entries={[["Ground speed", "How quickly a player moves across the map."], ["P95 speed", "Speed at or below which 95% of measurements fall."], ["u/s", "Game distance units per second."], ["Measurements / skipped", "Recorded speed samples included or left out of this view."], ["Position updates", "Recorded player locations."]]} />
      {!players.length&&<Empty>Choose a recording to inspect movement.</Empty>}
    </Section>
    {players.map(player=><Section key={player.index} title={`${player.name} · ${identity(player)}`}>
      <Metrics values={[["Average speed u/s",player.metrics.movement.remaining_speed.mean],["P95 speed u/s",player.metrics.movement.p95_u_s],["Top speed u/s",player.metrics.movement.remaining_speed.max],["Measurements",player.metrics.movement.remaining_speed.count],["Skipped measurements",player.movement_excluded_intervals],["Position updates",player.position_count]]} />
      <div className="mt-5"><SeriesPlot labels={`${player.name} ground speed`} units="Game units / second" series={[{name:"Ground speed",color:"var(--color-pc-accent, #cba6f7)",points:player.movement.filter(p=>p[3]===0).map(p=>[p[0],p[1]])}]} /></div>
    </Section>)}
  </>;
}
