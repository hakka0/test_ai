import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,prepare,applyAction,startCombat,tick} from '../shared/engine';
import {advanceMatch} from '../shared/game-time';
import {MATCHING_MS,type Action} from '../shared/model';
import {snapshotFor} from '../shared/snapshot';
import {scoutingBoard,opponentFor} from '../client/scouting';
import {newTestPlayer} from './fixtures';

function setup(mode:'duel'|'practice'='duel'){
 const m=newMatch(mode);m.players=[newTestPlayer('a','A'),newTestPlayer('b','B')];prepare(m,1000);return m;
}
test('PvP는 준비 마감 뒤 정확히 5초 매칭, 배치/구매/판매/장비 잠금 후 전투 시작',()=>{
 const m=setup(),deadline=m.deadline,p=m.players[0],unit=p.units[0];tick(m,deadline);
 assert.equal(m.phase,'matching');assert.equal(m.deadline,deadline+MATCHING_MS);assert.deepEqual(m.fighters,[]);
 const before=structuredClone(m);
 for(const action of [{type:'place',unitId:unit.id,x:3,y:1},{type:'bench',unitId:unit.id,slot:8},{type:'sell',unitId:unit.id},
  {type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},
  {type:'equip',itemId:p.inventory[0].id,unitId:unit.id},{type:'unequip',itemId:p.inventory[0].id},{type:'craft',itemIds:[p.inventory[0].id,p.inventory[1].id]}] as Action[]){assert.ok(applyAction(m,p.id,action,deadline+1));assert.deepEqual(m,before);}
 tick(m,deadline+MATCHING_MS-1);assert.equal(m.phase,'matching');tick(m,deadline+MATCHING_MS);assert.equal(m.phase,'combat');assert.equal(m.combatStartedAt,deadline+MATCHING_MS);assert.equal(m.fighters.length,2);
});
test('PvE는 매칭 대기 없이 전투, PvP 큰 시간 이동도 두 경계를 예정 시각에 처리',()=>{
 const practice=setup('practice');tick(practice,practice.deadline);assert.equal(practice.phase,'combat');
 const duel=setup(),deadline=duel.deadline;advanceMatch(duel,deadline+MATCHING_MS-1);assert.equal(duel.phase,'matching');advanceMatch(duel,deadline+MATCHING_MS+500);assert.equal(duel.phase,'combat');assert.equal(duel.combatStartedAt,deadline+MATCHING_MS);
});
test('PvP 준비·매칭은 배치/대기석/착용 장비 공개, 실제 대전 쌍/전투 배열과 경제는 분리',()=>{
 const m=setup(),foreign=m.players[1],reserve=foreign.units[1],item=foreign.inventory[0];
 reserve.id='HIDDEN_RESERVE';reserve.equipment=[item.id];item.unitId=reserve.id;startCombat(m,1100);
 // A public preparation roster must not expose stale combat arrays or pairings.
 m.events.push({id:1,type:'attack',source:m.fighters[0].id,target:m.fighters[1].id,amount:4});
 for(const phase of ['waiting','prepare','matching'] as const){
  m.phase=phase;const before=structuredClone(m),s=snapshotFor(m,'a',1200,'ABCD'),other=s.players[1];
  assert.ok(other.visibility==='opponent');assert.equal(other.rosterVisible,phase!=='waiting');assert.equal(other.units.length,phase==='waiting'?0:1);assert.equal(other.bench.length,phase==='waiting'?0:2);
  if(phase!=='waiting'){assert.ok(other.inventory.some(i=>i.id===item.id));assert.ok(!('gold'in other)&&!('shop'in other));}
  assert.equal(s.opponentId,null);assert.deepEqual(s.battlePairs,[]);assert.deepEqual(s.fighters,[]);assert.deepEqual(s.events,[]);
  assert.equal(opponentFor(s,'a'),undefined);assert.equal(scoutingBoard(s,'b').players.flatMap(p=>p.units).length,phase==='waiting'?0:1);assert.deepEqual(m,before);
  assert.ok(snapshotFor(m,'b',1200,'ABCD').players[1].units.some(u=>u.id===reserve.id));
 }
 for(const phase of ['combat','result'] as const){m.phase=phase;const s=snapshotFor(m,'a',1200,'ABCD'),other=s.players[1];assert.ok(other.visibility==='opponent'&&other.rosterVisible);assert.ok(other.bench.some(u=>u.id===reserve.id));assert.ok(other.inventory.some(i=>i.id===item.id));assert.equal(opponentFor(s,'a')?.id,'b');assert.equal(scoutingBoard(s,'b').fighters.length,2);}
 prepare(m,90000);const next=snapshotFor(m,'a',90001,'ABCD');assert.equal(next.opponentId,null);assert.equal(next.players[1].units.length,1);assert.deepEqual(next.fighters,[]);
});
test('PvE 준비의 양쪽 배치와 대기석은 계속 공개하고 서버 본인 경제는 항상 보호',()=>{
 const m=setup('practice'),s=snapshotFor(m,'a',1001,'ABCD'),other=s.players[1];assert.ok(other.visibility==='opponent'&&other.rosterVisible);assert.equal(other.units.length,1);assert.equal(other.bench.length,2);assert.equal(scoutingBoard(s,'b').players.length,2);assert.ok(!('gold'in other)&&!('shop'in other));
});
