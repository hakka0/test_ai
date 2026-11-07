import test from "node:test";
import assert from "node:assert/strict";
import { SkillCastFeedback, skillCardState } from "../client/skill-presentation";
import { skillDescriptionFor } from "../shared/skill-description";
import { SKILLS } from "../shared/skill-catalog";
import { UNITS } from "../shared/catalog";
import { newMatch, startCombat } from "../shared/engine";
import { snapshotFor } from "../shared/snapshot";
import { newTestPlayer } from "./fixtures";
import { combatStats } from "../shared/skills";
import { attackIntervalMs } from "../shared/attack-speed";

function setup() {
  const m = newMatch(); m.players = [newTestPlayer('a','A'),newTestPlayer('b','B')];
  startCombat(m, 1000);
  const snapshot = snapshotFor(m, 'a', 1000, 'room');
  return { m, snapshot, fighter: snapshot.fighters[0], skill: snapshot.fighters[0].skills[0] };
}

test('skill flashes follow real activation increases, expire, and never replay on duplicate snapshots', () => {
  const {snapshot, fighter, skill} = setup(), feedback = new SkillCastFeedback();
  feedback.observe(snapshot, 0); assert.equal(feedback.strength(fighter.id, skill.id, 0),0);
  skill.activations++; feedback.observe(snapshot,100);
  assert.equal(feedback.strength(fighter.id, skill.id,100),1);
  feedback.observe(snapshot,350); assert.equal(feedback.strength(fighter.id,skill.id,350),0.5);
  assert.equal(feedback.pending(600),false); assert.equal(feedback.strength(fighter.id,skill.id,600),0);
  skill.activations+=2;feedback.observe(snapshot,700);assert.equal(feedback.strength(fighter.id,skill.id,700),1);
  assert.equal(feedback.strength('elsewhere',skill.id,700),0);
});

test('initial combat, reconnect, round/room reset, death, result, and rewound counts do not replay past casts', () => {
  const {snapshot,fighter,skill}=setup(),feedback=new SkillCastFeedback();
  skill.activations=4;feedback.observe(snapshot,0);assert.equal(feedback.pending(0),false);
  snapshot.round++;skill.activations++;feedback.observe(snapshot,10);assert.equal(feedback.pending(10),false);
  snapshot.roomId='other';skill.activations++;feedback.observe(snapshot,20);assert.equal(feedback.pending(20),false);
  skill.activations++;feedback.observe(snapshot,30);assert.equal(feedback.pending(30),true);
  skill.activations=0;feedback.observe(snapshot,40);assert.equal(feedback.pending(40),false);
  skill.activations++;feedback.observe(snapshot,50);fighter.hp=0;feedback.observe(snapshot,60);assert.equal(feedback.pending(60),false);
  fighter.hp=100;skill.activations++;feedback.observe(snapshot,70);snapshot.phase='result';feedback.observe(snapshot,80);assert.equal(feedback.pending(80),false);
  feedback.reset();assert.equal(feedback.pending(90),false);
});

test('a selected preparation unit can flash on the first battle-start passive, without selection tracking', () => {
  const {snapshot,fighter,skill}=setup(),feedback=new SkillCastFeedback(),fighters=snapshot.fighters;
  snapshot.phase='prepare';snapshot.fighters=[];feedback.observe(snapshot,0);
  snapshot.phase='combat';snapshot.fighters=fighters;skill.activations=1;feedback.observe(snapshot,100);
  assert.equal(feedback.strength(fighter.id,skill.id,100),1);
  assert.equal(feedback.strength(fighter.id,skill.id,350),0.5);
});

test('cooldown and one-battle limit are distinct from ongoing sustain and death', () => {
  const {fighter,skill}=setup();skill.id='guardian';skill.active=true;skill.cooldownUntil=5000;
  assert.equal(skillCardState(SKILLS.guardian,fighter,2000).running,true);
  assert.equal(skillCardState(SKILLS.guardian,fighter,2000).cooldown,0);
  skill.active=false;assert.equal(skillCardState(SKILLS.guardian,fighter,3100).cooldown,2);
  skill.id='steadfast';skill.activations=1;
  assert.equal(skillCardState(SKILLS.steadfast,fighter,3100).used,true);
  assert.equal(skillCardState(SKILLS.steadfast,fighter,3100).cooldown,0);
  fighter.hp=0;assert.equal(skillCardState(SKILLS.steadfast,fighter,3100).dead,true);
  assert.equal(skillCardState(SKILLS.guardian,undefined,0).running,false);
});

test('millisecond descriptions use actual scheduled intervals and preserve combat buffs', () => {
  const stats=UNITS.neru.stats,before=structuredClone(SKILLS.quickstep);
  const text=skillDescriptionFor(SKILLS.quickstep,stats);
  assert.match(text,/공격 주기 28\.6% 감소/);assert.match(text,/이동 주기 25% 감소/);assert.doesNotMatch(text,/ms/);
  const {m}=setup(),f=m.fighters[0];f.stats={...stats};
  f.buffs=[{key:'quickstep',source:f.id,skillId:'quickstep',expiresAt:5000,modifiers:SKILLS.quickstep.effects.find(e=>e.type==='buff')!.modifiers}];
  const adjusted=combatStats(f,2000).stats;
  assert.equal(Number(((1-attackIntervalMs(adjusted.interval)/attackIntervalMs(stats.interval))*100).toFixed(1)),28.6);
  assert.equal(Number(((1-attackIntervalMs(adjusted.moveMs)/attackIntervalMs(stats.moveMs))*100).toFixed(1)),25);
  assert.match(skillDescriptionFor(SKILLS.quickstep,{interval:1000,moveMs:500}),/공격 주기 10% 감소, 이동 주기 20% 감소/);
  assert.match(skillDescriptionFor(SKILLS.quickstep,{interval:100,moveMs:100}),/공격 주기 0% 감소, 이동 주기 0% 감소/);
  assert.equal(skillDescriptionFor(SKILLS.ironWard,stats),SKILLS.ironWard.description);
  assert.deepEqual(SKILLS.quickstep,before);
});
