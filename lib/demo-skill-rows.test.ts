import test from "node:test";
import assert from "node:assert/strict";
import { groupSkillObservations, observedSlotLabel, type ObservedDevice, type Skill } from "./demo-skill-rows.ts";

const ability: Skill = {slot:"Q",ability_name:"Blast Shot",base_cd_s:10,cooldown_kind:"fixed",ability_uses:19,uses_source:"native_ability_start",avg_cd_s:8,shortest_cd_s:7,hit_signals:15};
const row = (changes: Partial<ObservedDevice>): ObservedDevice => ({slot:3,device_id:11450,name:"Blast Shot",kind:"base_ability",reference_champion_id:2092,signals:5,starts:3,fires:2,hits:1,positive_hits:1,...changes});

test("only same champion, slot and ability are combined; other observations remain", () => {
  const exact=row({}), foreign=row({device_id:99,reference_champion_id:9999}), support=row({device_id:98,kind:"ability_support"}), other=row({device_id:97,name:"Different skill"}), card=row({slot:19,device_id:12737,name:"Onslaught",kind:"loadout_card"});
  const result=groupSkillObservations([ability],[exact,foreign,support,other,card],2092);
  assert.equal(result.skills[0].starts,3); assert.equal(result.skills[0].skill.ability_uses,19);
  assert.deepEqual(result.devices,[foreign,support,other]); assert.deepEqual(result.cards,[card]);
});

test("missing identity stays unavailable and slot labels follow the recorded contract", () => {
  const observation=row({}); const result=groupSkillObservations([ability],[observation],null);
  assert.equal(result.skills[0].starts,null); assert.deepEqual(result.devices,[observation]);
  assert.equal(observedSlotLabel(3),"Q"); assert.equal(observedSlotLabel(16),"RMB"); assert.equal(observedSlotLabel(19),"19");
});
