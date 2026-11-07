import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,newPlayer,prepare,startCombat,tick,finishPreparation,applyAction} from '../shared/engine';
import {newTestPlayer} from './fixtures';
import {snapshotFor} from '../shared/snapshot';
import {opponentFor,battleBoard} from '../client/scouting';
import {resultFor,roundSummary} from '../client/history';
import {INTRO_MINION_ROUNDS,isMinionRound} from '../shared/minions';
import {MATCHING_MS} from '../shared/model';
import {remainingCopies} from '../shared/unit-pool';

function setup(round=1){const m=newMatch('duel',INTRO_MINION_ROUNDS);m.players=[newTestPlayer('a','A'),newTestPlayer('b','B')];m.round=round-1;prepare(m,0);return m;}
function defeatMinions(m:ReturnType<typeof setup>){m.fighters.filter(f=>f.minion).forEach(f=>f.hp=0);tick(m,m.lastTick+100);}
test('도입부: 첫 세 전투는 각자의 미니언전, 4번째부터 5초 매칭과 PvP',()=>{
 const m=setup();
 for(let round=1;round<=3;round++){
  assert.equal(m.round,round);assert.ok(isMinionRound(m));finishPreparation(m,m.deadline-1);assert.equal(m.phase,'combat');
  assert.equal(m.fighters.filter(f=>f.minion).length,round*2);defeatMinions(m);assert.equal(m.phase,'result');
  tick(m,m.deadline);assert.equal(m.phase,'prepare');
 }
 assert.equal(m.round,4);assert.equal(m.minionBattles,undefined);finishPreparation(m,m.deadline);assert.equal(m.phase,'matching');const at=m.deadline;tick(m,at);assert.equal(m.phase,'combat');assert.ok(m.fighters.every(f=>!f.minion));assert.equal(m.combatStartedAt,at);assert.equal(MATCHING_MS,5000);
 const practice=setup();practice.mode='practice';startCombat(practice,1);assert.ok(practice.fighters.every(f=>!f.minion));
});
test('미니언 보상: 처치 즉시 유닛·재료/장비·골드 지급, 체력/승수/연속은 유지',()=>{
 const m=setup(),receipts:string[]=[];
 m.players.forEach(p=>{p.streak='win';p.streakCount=4;});
 for(let round=1;round<=3;round++){
  startCombat(m,m.deadline-1);const gold=m.players.map(p=>p.gold),counts=m.players.map(p=>p.units.length),items=m.players.map(p=>p.inventory.length);
  defeatMinions(m);assert.equal(m.phase,'result');
  m.players.forEach((p,i)=>{assert.equal(p.gold-gold[i],round===3?3:2);assert.equal(p.units.length-counts[i],round===2?0:1);assert.equal(p.inventory.length-items[i],round===1?0:1);assert.equal(p.streakCount,4);assert.equal(p.health,100);assert.equal(p.score,0);});
  const first=m.roundHistory.at(-1)!;assert.equal(first.encounter,'minion');assert.equal(resultFor(first,'a'),'win');assert.match(roundSummary(first,'b'),/미니언전 승리/);
  receipts.push(...m.events.filter(e=>e.type==='loot').map(e=>e.loot!.type));const saved=structuredClone(m);tick(m,m.deadline-1);assert.deepEqual(m,saved);
  tick(m,m.deadline);
 }
 assert.ok(receipts.includes('gold')&&receipts.includes('item')&&receipts.includes('unit'));
 assert.ok(m.players.every(p=>p.inventory.some(i=>i.definition==='iron')&&p.inventory.some(i=>i.definition==='blade')));
});
test('독립 전장: 기본 공격/스킬/이동이 다른 유저의 미니언전과 섞이지 않음',()=>{
 const m=setup(3);m.players.forEach(p=>{p.units.forEach((u,i)=>{u.x=i;u.y=3;});p.level=3;});startCombat(m,1);
 const a=m.fighters.filter(f=>f.arena==='a'),b=m.fighters.filter(f=>f.arena==='b');
 for(const f of a)if(!f.minion){f.stats.attack=10000;f.stats.range=10;f.nextAttack=1;}
 for(const f of b){f.skills=[];f.nextAttack=Infinity;f.nextMove=Infinity;}
 const bBefore=structuredClone(b);tick(m,2001);
 assert.ok(m.minionBattles!.find(b=>b.owner==='a')!.outcome);assert.equal(m.phase,'combat');assert.deepEqual(b,bBefore);
 const owner=new Map(m.fighters.map(f=>[f.id,f.arena]));for(const e of m.events)assert.equal(owner.get(e.source),owner.get(e.target));
 const aBefore=structuredClone(a);tick(m,4001);assert.deepEqual(a,aBefore,'completed battlefield stays frozen');
 tick(m,m.deadline);assert.ok(m.overtime);tick(m,m.deadline);assert.equal(m.phase,'result');assert.equal(m.roundHistory.length,1);assert.equal(resultFor(m.roundHistory[0],'b'),'loss');assert.ok(m.players.every(p=>p.health===100&&p.streakCount===0));
});
test('빈 전장/실패는 미처치 보상을 주지 않고, 한쪽 실패가 다른 전투를 끝내지 않음',()=>{
 const m=setup();m.players[0].units.forEach(u=>u.x=-1);const gold=m.players[0].gold;startCombat(m,1);
 assert.equal(m.phase,'combat');assert.equal(m.minionBattles![0].outcome,'loss');assert.equal(m.players[0].gold,gold);
 m.fighters.filter(f=>f.minion&&f.arena==='b').forEach(f=>f.hp=0);tick(m,101);
 assert.equal(m.phase,'result');assert.equal(resultFor(m.roundHistory[0],'a'),'loss');assert.equal(resultFor(m.roundHistory[0],'b'),'win');assert.equal(m.players[0].gold,gold);
});
test('만석 유닛 보상은 골드로 전환, 공유 풀/3성 제외·전투 합성 보류 유지',()=>{
 const m=setup(),p=m.players[0];
 while(p.units.filter(u=>u.x<0).length<12){const slot=p.units.filter(u=>u.x<0).length;p.units.push({id:`full-${slot}`,owner:p.id,kind:'yuuka',rank:1,x:-1,y:-1,benchSlot:slot,equipment:[]});}
 const before=structuredClone(p.units);startCombat(m,1);defeatMinions(m);assert.deepEqual(p.units,before);assert.ok(m.events.filter(e=>e.type==='loot'&&e.source.includes('minions:a:')).every(e=>e.loot?.type==='gold'));
 const other=setup();other.players[0].units[0].rank=3;const copies=remainingCopies(other.players,'yuuka');startCombat(other,1);defeatMinions(other);
 assert.equal(remainingCopies(other.players,'yuuka'),copies);assert.ok(other.players[0].units.filter(u=>u.kind==='yuuka').every(u=>u.rank===3));
});
test('스냅샷/관전: 실제 유저 2명 유지, 각 미니언 쌍과 전장만 표시·준비 타인 배치 공개',()=>{
 const m=setup(),preview=snapshotFor(m,'a',0,'TEST');assert.equal(preview.players.length,2);assert.equal(preview.encounter,'minion');assert.equal(preview.neutralOpponents?.length,2);
 assert.equal(opponentFor(preview,'a')?.name,'미니언 부대');assert.equal(preview.players[1].units.length,1);assert.equal(battleBoard(preview,'a').players.length,2);
 startCombat(m,1);const s=snapshotFor(m,'a',2,'TEST'),mine=battleBoard(s,'a'),other=battleBoard(s,'b');
 assert.equal(mine.fighters.length,2);assert.equal(other.fighters.length,2);assert.ok(mine.fighters.every(f=>f.owner==='a'||f.owner==='minions:a'));
 assert.equal(applyAction(m,'a',{type:'claimLoot'},2),'지금은 배치를 변경할 수 없습니다.');
 const checkpoint=structuredClone(m);defeatMinions(m);defeatMinions(checkpoint);assert.deepEqual(m,checkpoint,'replaying the same checkpoint cannot reroll drops');
});

test('연속 보너스는 2/4/5연속부터 전투 종료 즉시 1/2/3G, 준비에서 중복 지급 없음',()=>{
 const m=newMatch();m.players=[newTestPlayer('a','A'),newTestPlayer('b','B')];prepare(m,0);m.players[1].units.forEach(u=>u.x=-1);
 for(const bonus of [0,1,1,2,3,3]){
  m.players.forEach(p=>p.pendingReward=null);
  const before=m.players.map(p=>p.gold);startCombat(m,m.deadline-1);assert.equal(m.phase,'result');
  assert.equal(m.players[0].gold-before[0],1+bonus);assert.equal(m.players[1].gold-before[1],bonus);assert.equal(m.players[0].lastIncome.streak,bonus);
  const once=m.players.map(p=>p.gold);tick(m,m.deadline-1);assert.deepEqual(m.players.map(p=>p.gold),once);tick(m,m.deadline);
  for(let i=0;i<2;i++){assert.equal(m.players[i].lastIncome.streak,0);assert.equal(m.players[i].gold-once[i],5+m.players[i].lastIncome.interest);}
 }
});
