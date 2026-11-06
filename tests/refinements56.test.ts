import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,prepare,applyAction,tick} from '../shared/engine';
import {newTestPlayer} from './fixtures';
import {UNITS,UNIT_KINDS} from '../shared/catalog';
import {evaluateSynergies,bonusFor,synergyTier,TRAITS} from '../shared/synergy';
import {snapshotFor} from '../shared/snapshot';
import {economyActionOpen,readyActionOpen} from '../shared/shop';
import {scoutingBoard} from '../client/scouting';
import {unitInspection} from '../client/unit-inspection';

function setup(){const m=newMatch();m.players=[newTestPlayer('a','A'),newTestPlayer('b','B')];prepare(m,0);m.players[0].gold=50;return m;}
test('2/4/6 조합은 가장 높은 단계만 적용하고 3·5종은 이전 단계 유지',()=>{
 for(const trait of ['bulwark','scout','arcane'] as const){
  assert.equal(synergyTier(trait,1),undefined);
  assert.deepEqual([2,3,4,5,6,10].map(n=>synergyTier(trait,n)!.threshold),[2,2,4,4,6,6]);
  assert.deepEqual(TRAITS[trait].tiers.map(t=>t.threshold),[2,4,6]);
 }
 assert.equal(bonusFor('knight',[{trait:'bulwark',count:4,active:true}]).hpMultiplier,1.3);
 assert.equal(bonusFor('ranger',[{trait:'scout',count:6,active:true}]).attackMultiplier,1.5);
 assert.equal(bonusFor('mage',[{trait:'arcane',count:6,active:true}]).shield,100);
});
test('실제 수호 6종은 종류 중복/강화/대기석을 제외하고 최상위 효과를 전투에 적용',()=>{
 const m=setup(),p=m.players[0];p.level=6;
 p.units=UNIT_KINDS.filter(k=>UNITS[k].trait==='bulwark').map((kind,i)=>({id:`a-tier-${i}`,owner:'a',kind,rank:1 as const,x:i,y:0,benchSlot:null,equipment:[]}));
 assert.equal(evaluateSynergies(p.units)[0].count,6);
  p.units.push({...p.units[0],id:'duplicate',rank:3});p.units.push({...p.units[1],id:'reserve',x:-1,y:-1,benchSlot:0});
  assert.equal(evaluateSynergies(p.units)[0].count,6);
  // Matching XP changes do not change placement or bypass the actual deployment cap.
  m.players.forEach(p=>p.ready=true);tick(m,m.deadline);tick(m,m.deadline);
  assert.equal(m.fighters.find(f=>f.id==='a-tier-0')!.maxHp,330);
});
test('매칭 중 경험치/리롤/준비 재확인 허용, 5초 마감과 배치/구매/장비 제한 보존',()=>{
 const m=setup(),p=m.players[0];tick(m,m.deadline);const deadline=m.deadline,at=deadline-1,units=structuredClone(p.units);
 assert.equal(applyAction(m,p.id,{type:'ready'},at),null);assert.equal(m.deadline,deadline);
 const gold=p.gold,revision=p.experienceRevision;assert.equal(applyAction(m,p.id,{type:'buyExperience',revision},at),null);assert.equal(p.gold,gold-4);
 const before=structuredClone(m);assert.ok(applyAction(m,p.id,{type:'buyExperience',revision},at));assert.deepEqual(m,before);
 const shop=p.shopRevision;assert.equal(applyAction(m,p.id,{type:'reroll',revision:shop},at),null);assert.equal(p.gold,gold-9);assert.ok(p.shopRevision>shop);
 assert.deepEqual(p.units,units);assert.equal(m.phase,'matching');assert.equal(m.deadline,deadline);
 for(const action of [{type:'ready'},{type:'reroll',revision:p.shopRevision},{type:'buyExperience',revision:p.experienceRevision}]){const saved=structuredClone(m);assert.ok(applyAction(m,p.id,action,deadline));assert.deepEqual(m,saved);}
 tick(m,deadline);assert.equal(m.phase,'combat');assert.equal(m.combatStartedAt,deadline);
});
test('관전 대상과 상대 경제를 유지하면서 내 리롤/경험치/준비를 처리',()=>{
 const m=setup(),p=m.players[0],other=structuredClone(m.players[1]);
 const view=()=>scoutingBoard(snapshotFor(m,p.id,1,'TEST'),'b');
 const before=view();assert.equal(unitInspection(before,m.players[1].units[0].id,true)?.own,false);
 assert.equal(applyAction(m,p.id,{type:'buyExperience',revision:p.experienceRevision},1),null);
 assert.equal(applyAction(m,p.id,{type:'reroll',revision:p.shopRevision},1),null);
 assert.equal(applyAction(m,p.id,{type:'ready'},1),null);
 assert.deepEqual(m.players[1],other);assert.equal(view().players[0].id,'b');assert.equal(view().players[0].visibility,'opponent');assert.ok(!('gold'in view().players[0]));
});
test('단계/준비 상태/마감 권한 표에서 매칭 3개 버튼을 정확히 분리',()=>{
 for(const ready of [false,true]){
  assert.equal(economyActionOpen('reroll','matching',ready,1,10),true);assert.equal(economyActionOpen('buyExperience','matching',ready,1,10),true);assert.equal(economyActionOpen('buy','matching',ready,1,10),false);
  assert.equal(readyActionOpen('matching',ready,1,10),true);assert.equal(readyActionOpen('matching',ready,10,10),false);assert.equal(readyActionOpen('combat',ready,1,10),false);
 }
});
