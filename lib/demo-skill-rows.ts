import type { DemoPlayer } from "@/lib/demo-analyzer";

export type ObservedDevice = DemoPlayer["observed_devices"][number];
export type Skill = DemoPlayer["metrics"]["skills"][number];
const slotNumbers: Record<string, number> = { LMB: 1, E: 2, Q: 3, F: 4, RMB: 16 };
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Join only identified, same-champion base devices with the exact skill and slot. */
export function groupSkillObservations(skills: Skill[], devices: ObservedDevice[], championId: number | null) {
  const matched = new Set<ObservedDevice>();
  const skillsWithStarts = skills.map(skill => {
    const records = skill.ability_name && championId != null ? devices.filter(device =>
      device.kind === "base_ability" && device.reference_champion_id === championId &&
      device.slot === slotNumbers[skill.slot] && device.name != null &&
      normalize(device.name) === normalize(skill.ability_name!)) : [];
    records.forEach(device => matched.add(device));
    return { skill, starts: records.length ? records.reduce((total, device) => total + device.starts, 0) : null };
  });
  return {
    skills: skillsWithStarts,
    devices: devices.filter(device => device.kind !== "loadout_card" && !matched.has(device)),
    cards: devices.filter(device => device.kind === "loadout_card"),
  };
}

export function observedSlotLabel(slot: number): string {
  return Object.entries(slotNumbers).find(([, number]) => number === slot)?.[0] ?? String(slot);
}
