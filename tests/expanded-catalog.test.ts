import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UNITS,UNIT_KINDS,CORE_UNIT_KINDS,statsFor} from '../shared/catalog';
import {SKILLS} from '../shared/skill-catalog';
import {validateSkill} from '../shared/skills';
import {TRAIT_IDS,synergiesForPlayer} from '../shared/synergy';
import {newMatch,newPlayer,applyAction,startCombat,tick} from '../shared/engine';
import {DebugSession} from '../server/debug';
import {GameClock} from '../shared/game-time';
import {snapshotFor} from '../shared/snapshot';
import {remainingCopies} from '../shared/unit-pool';
import {pickPoolKind} from '../shared/unit-pool';
import {offerRoundReward} from '../shared/rewards';
import type {Kind} from '../shared/model';

const presets=['synergyBulwark','synergyScout','synergyArcane'] as const;
function fixture(){const m=newMatch('botPractice',0);m.players=Array.from({length:6},(_,i)=>({...newPlayer(`p${i}`,`P${i}`),bot:i>0}));return{m,d:new DebugSession(),clock:new GameClock(100)};}
test('18 unique types, six per trait: sample stats/attributes/skills and square self-contained images',()=>{
 assert.equal(UNIT_KINDS.length,CORE_UNIT_KINDS.length*3);assert.equal(new Set(UNIT_KINDS).size,18);
 for(const trait of TRAIT_IDS)assert.equal(UNIT_KINDS.filter(k=>UNITS[k].trait===trait).length,6);
 assert.equal(new Set(UNIT_KINDS.map(k=>UNITS[k].name)).size,18);
 for(const kind of UNIT_KINDS){
  const u=UNITS[kind],s=statsFor({kind,rank:3,equipment:[]},[]);
  assert.ok(Object.values(s).every(Number.isFinite));assert.ok(s.hp>0&&s.defense>0&&s.interval>=100&&s.moveMs>=100);
  assert.equal(s.critChance,10);assert.equal(s.critDamage,150);
  assert.ok(['red','yellow','blue','purple'].includes(u.attackAttribute));assert.ok(['red','yellow','blue','purple'].includes(u.defenseAttribute));
  assert.deepEqual(u.skills.map(id=>SKILLS[id].kind),['active','passive']);u.skills.forEach(id=>validateSkill(SKILLS[id]));
  if(!(CORE_UNIT_KINDS as readonly Kind[]).includes(kind)){
   const svg=readFileSync(`public${u.image}`,'utf8');assert.match(svg,/width="500" height="500"/);assert.doesNotMatch(svg,/<image|https?:\/\/(?!www\.w3\.org)/);
  }
 }
});
test('new presets provide all 18 kinds, exactly six focused deploys and twelve valid reserves for all six participants',()=>{
 for(const [i,preset] of presets.entries()){
  const {m,d,clock}=fixture();assert.equal(d.apply(m,clock,{type:'preset',preset},100),null);
  for(const p of m.players){
   assert.equal(p.level,6);assert.equal(p.units.length,18);assert.equal(new Set(p.units.map(u=>u.kind)).size,18);
   const field=p.units.filter(u=>u.x>=0),bench=p.units.filter(u=>u.x<0);
   assert.equal(field.length,6);assert.ok(field.every(u=>UNITS[u.kind].trait===TRAIT_IDS[i]&&u.rank===1));assert.equal(new Set(field.map(u=>`${u.x},${u.y}`)).size,6);
   assert.deepEqual(bench.map(u=>u.benchSlot).sort((a,b)=>a!-b!),Array.from({length:12},(_,i)=>i));
  }
  for(const kind of UNIT_KINDS)assert.ok(remainingCopies(m.players,kind)>=0);
  const s=snapshotFor(m,'p0',100,'TEST');assert.equal(synergiesForPlayer(s,s.players[0]).find(s=>s.trait===TRAIT_IDS[i])!.count,6);
  d.apply(m,clock,{type:'save'},100);const saved=structuredClone(m);startCombat(m,100);d.apply(m,clock,{type:'load'},100);assert.deepEqual(m,saved);
 }
});
test('actual new kinds reach 2/4/6 effects, exclude reserves and keep the composition frozen after death',()=>{
 for(const [index,preset] of presets.entries())for(const count of [2,4,6]){
  const {m,d,clock}=fixture();d.apply(m,clock,{type:'preset',preset},100);const p=m.players[0];
  // Release the unrelated reserves to make space for displaced focused units.
  for(const u of p.units.filter(u=>u.x<0))assert.equal(applyAction(m,p.id,{type:'sell',unitId:u.id},100),null);
  for(const [slot,u] of p.units.slice(count).entries())assert.equal(applyAction(m,p.id,{type:'bench',unitId:u.id,slot},100),null);
  const s=snapshotFor(m,p.id,100,'TEST');assert.equal(synergiesForPlayer(s,s.players[0]).find(s=>s.trait===TRAIT_IDS[index])!.count,count);
  startCombat(m,100);const f=m.fighters.find(f=>f.owner===p.id)!,base=UNITS[f.kind].stats,tier=[2,4,6].indexOf(count);
  if(index===0)assert.equal(f.maxHp,Math.round(base.hp*[1.15,1.3,1.5][tier]));
  if(index===1)assert.equal(f.stats.attack,Math.round(base.attack*[1.15,1.3,1.5][tier])+8); // debug blade on first unit
  if(index===2)assert.equal(f.shield,20+[30,60,100][tier]); // first arcane is Nova, with starWard and the debug blade
  f.hp=0;const after=snapshotFor(m,p.id,100,'TEST');assert.equal(synergiesForPlayer(after,after.players[0]).find(s=>s.trait===TRAIT_IDS[index])!.count,count);
 }
});
test('new types participate in normal shared-pool draws and unit rewards',()=>{
 const p=newPlayer('a','A');p.units=[];p.shop=[];
 for(const [index,kind] of UNIT_KINDS.entries())assert.equal(pickPoolKind(p,[p],()=>(index+.5)/18),kind);
 let seed=123;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const observed=new Set<Kind>();for(let i=0;i<1000;i++){offerRoundReward(p,5,random,[p]);for(const o of p.pendingReward?.options??[])if(o.type==='unit')observed.add(o.kind);p.pendingReward=null;}
 for(const kind of UNIT_KINDS)assert.ok(observed.has(kind),kind);
});
test('all three expanded rosters execute attacks and assigned skills with finite combat state',()=>{
 for(const preset of presets){
  const {m,d,clock}=fixture();d.apply(m,clock,{type:'preset',preset},100);startCombat(m,100);tick(m,20100);
  assert.ok(m.fighters.every(f=>Number.isFinite(f.hp)&&Number.isFinite(f.shield)&&f.hp>=0&&f.shield>=0));
  assert.ok(m.fighters.some(f=>f.skills.some(s=>s.activations>0)));
 }
});
