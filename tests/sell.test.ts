import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, startCombat, tick, applyAction} from "../shared/engine";
import {unitSellPrice,sellActionOpen} from '../shared/shop';
import {remainingCopies,unitCopies} from '../shared/unit-pool';
import {acquireUnit} from '../shared/bench';
import {snapshotFor} from '../shared/snapshot';
import {MutationGate,placementIntent} from '../client/interaction';
import type {Phase} from '../shared/model';
test('판매: 장비 반환, 슬롯 해제, 중복 및 타인 판매 거부',()=>{
 const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const p=m.players[0];const u=p.units[1];
 applyAction(m,p.id,{type:'equip',unitId:u.id,itemId:p.inventory[0].id},1);
 const gold=p.gold;assert.equal(applyAction(m,p.id,{type:'sell',unitId:u.id},1),null);
 assert.equal(p.gold,gold+unitSellPrice(u));assert.equal(p.inventory[0].unitId,null);assert.ok(!p.units.includes(u));
 const before=structuredClone(m);
 assert.ok(applyAction(m,p.id,{type:'sell',unitId:u.id},1));
 assert.ok(applyAction(m,p.id,{type:'sell',unitId:m.players[1].units[0].id},1));assert.deepEqual(m,before);
});
test('준비 완료·마감·대기·종료 판매 차단 및 전장 유닛 판매',()=>{
 const m=newMatch();m.players=[newPlayer('a','A')];prepare(m,0);const p=m.players[0];const a={type:'sell',unitId:p.units[0].id};
 p.ready=true;assert.ok(applyAction(m,p.id,a,1));p.ready=false;assert.ok(applyAction(m,p.id,a,m.deadline));
 for(const phase of ['waiting','finished'] as const){m.phase=phase;const before=structuredClone(m);assert.ok(applyAction(m,p.id,a,1));assert.deepEqual(m,before);}
 m.phase='prepare';assert.equal(applyAction(m,p.id,a,1),null);
});

test('결과 판매는 골드·장비·공유 풀을 즉시 갱신하고 중복·타인 판매와 배치 변경은 거부',()=>{
 for(const phase of ['result'] as const){
  const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const p=m.players[0],unit=p.units[0],reserve=p.units[1],item=p.inventory[0];
  assert.equal(applyAction(m,p.id,{type:'equip',unitId:unit.id,itemId:item.id},1),null);
  p.ready=true;startCombat(m,10);m.phase=phase;const fighters=structuredClone(m.fighters),gold=p.gold,pool=remainingCopies(m.players,unit.kind),interest=p.roundInterest;
  assert.equal(applyAction(m,p.id,{type:'sell',unitId:unit.id},11),null);
  assert.equal(p.gold,gold+unitSellPrice(unit));assert.equal(item.unitId,null);assert.equal(remainingCopies(m.players,unit.kind),pool+1);assert.deepEqual(m.fighters,fighters);assert.equal(p.roundInterest,interest);
  const after=structuredClone(m);
  for(const action of [{type:'sell',unitId:unit.id},{type:'sell',unitId:m.players[1].units[0].id},{type:'place',unitId:reserve.id,x:0,y:0},{type:'bench',unitId:reserve.id,slot:8}]){assert.ok(applyAction(m,p.id,action,11));assert.deepEqual(m,after);}
  assert.equal(applyAction(m,p.id,{type:'sell',unitId:reserve.id},11),null);assert.deepEqual(m.fighters,fighters);
  const expired=structuredClone(m);assert.ok(applyAction(m,p.id,{type:'sell',unitId:p.units[0].id},m.deadline));assert.deepEqual(m,expired);
 }
});

test('전투 중 대기석 판매는 가격/장비/공유 풀을 갱신하고 출전 유닛과 전투 결과를 보존',()=>{
 const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const p=m.players[0],unit=p.units[0],reserve=p.units[1],item=p.inventory[2];
 reserve.rank=2;assert.equal(applyAction(m,p.id,{type:'equip',unitId:reserve.id,itemId:item.id},1),null);p.ready=true;startCombat(m,10);const baseline=structuredClone(m),pool=remainingCopies(m.players,reserve.kind),gold=p.gold,interest=p.roundInterest;
 const gate=new MutationGate();gate.start(snapshotFor(m,p.id,11,'TEST'));
 assert.equal(applyAction(m,p.id,{type:'sell',unitId:reserve.id},11),null);assert.equal(p.gold,gold+unitSellPrice(reserve));assert.equal(item.unitId,null);assert.equal(remainingCopies(m.players,reserve.kind),pool+unitCopies(reserve.rank));assert.equal(p.roundInterest,interest);
 gate.observe(snapshotFor(m,p.id,11,'TEST'));assert.equal(gate.busy,false);assert.deepEqual(m.fighters,baseline.fighters);assert.deepEqual(m.events,baseline.events);
 const after=structuredClone(m);
 for(const id of [unit.id,reserve.id,m.players[1].units[1].id]){assert.ok(applyAction(m,p.id,{type:'sell',unitId:id},11));assert.deepEqual(m,after);}
 for(let now=110;now<=40010&&m.phase==='combat';now+=100){tick(m,now);tick(baseline,now);assert.deepEqual(m.fighters,baseline.fighters);assert.deepEqual(m.events,baseline.events);}
 assert.equal(m.phase,'result');assert.equal(m.winner,baseline.winner);assert.deepEqual(m.roundHistory,baseline.roundHistory);
 const resultGold=p.gold;assert.equal(applyAction(m,p.id,{type:'sell',unitId:unit.id},m.deadline-1),null);assert.equal(p.gold,resultGold+unitSellPrice(unit));
 prepare(m,50000);startCombat(m,50001);assert.ok(!m.fighters.some(f=>f.id===unit.id));
});

test('판매 권한 표: 전투 대기석만 허용, 죽었거나 좌표가 잘못된 출전 유닛과 마감 요청 거부',()=>{
 const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const p=m.players[0],field=p.units[0],reserve=p.units[1];startCombat(m,10);
 for(const phase of ['waiting','prepare','matching','combat','result','finished'] as Phase[])for(const ready of [false,true])for(const now of [1,100])for(const u of [field,reserve]){
  const allowed=now<100&&(phase==='result'||phase==='prepare'&&!ready||phase==='combat'&&u===reserve);
  assert.equal(sellActionOpen(phase,ready,now,100,u,m.fighters),allowed,`${phase}/${ready}/${now}/${u.id}`);
 }
 assert.equal(sellActionOpen('combat',true,1,100,undefined,m.fighters),false);
 m.fighters.find(f=>f.id===field.id)!.hp=0;field.x=-1;field.y=-1;field.benchSlot=4;
 const saved=structuredClone(m);assert.match(applyAction(m,p.id,{type:'sell',unitId:field.id},11)!,/전투 중/);assert.deepEqual(m,saved);
 const expired=structuredClone(m);assert.ok(applyAction(m,p.id,{type:'sell',unitId:reserve.id},m.deadline));assert.deepEqual(m,expired);
});

test('출전 유닛과 같은 종류여도 별도 대기석 유닛은 상점 드래그로 판매할 수 있고 배치는 잠김',()=>{
 const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const p=m.players[0],reserve=acquireUnit(p,'yuuka',false)!;startCombat(m,10);
 const s=snapshotFor(m,p.id,11,'TEST'),self=s.players.find(p=>p.visibility==='self')!;
 const allowed=sellActionOpen(m.phase,p.ready,11,m.deadline,reserve,m.fighters),fighters=structuredClone(m.fighters);
 assert.equal(allowed,true);const intent=placementIntent(self,reserve.id,{kind:'shop'},false,allowed);assert.equal(intent.valid,true);assert.equal(intent.action?.type,'sell');
 assert.equal(placementIntent(self,reserve.id,{kind:'cell',x:0,y:7},false,allowed).valid,false);
 assert.equal(placementIntent(self,reserve.id,{kind:'bench',slot:8},false,allowed).valid,false);
 assert.equal(applyAction(m,p.id,intent.action,11),null);assert.deepEqual(m.fighters,fighters);
});

test('레어도 1~5: 구매·판매 가격 동일, 클라이언트 임의 가격 무시',async()=>{
 const {UNITS}=await import('../shared/catalog');const {refreshShop,rarityPrice}=await import('../shared/shop');
 const original=UNITS.yuuka.rarity;
 try {
  for(const rarity of [1,2,3,4,5] as const){
   UNITS.yuuka.rarity=rarity;
   const m=newMatch();m.players=[newPlayer('a','A')];prepare(m,0);const p=m.players[0];refreshShop(p,()=>0);
   assert.equal(p.shop[0].cost,rarity);assert.equal(rarityPrice(rarity),rarity);
   assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision,cost:0},1),null);
   assert.equal(p.gold,10-rarity);const u=p.units.at(-1)!;
   assert.equal(applyAction(m,p.id,{type:'sell',unitId:u.id,price:999,rarity:5},2),null);assert.equal(p.gold,10);
  }
  for(const bad of [0,6,1.5,NaN,Infinity]) assert.throws(()=>rarityPrice(bad as 1));
 } finally { UNITS.yuuka.rarity=original; }
});
