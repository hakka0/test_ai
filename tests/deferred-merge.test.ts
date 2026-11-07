import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,prepare,startCombat,applyAction,tick} from '../shared/engine';
import {acquireUnit,canAcquireUnit,freeBenchSlot} from '../shared/bench';
import {mergeRoster} from '../shared/merge';
import {refreshShop} from '../shared/shop';
import {unitCopies,remainingCopies} from '../shared/unit-pool';
import {snapshotFor} from '../shared/snapshot';
import {newTestPlayer} from './fixtures';

function setup(mode:'duel'|'practice'='duel'){
 const m=newMatch(mode);m.players=[newTestPlayer('a','A'),newTestPlayer('b','B')];prepare(m,0);const p=m.players[0];p.gold=100;p.level=3;
 const second=acquireUnit(p,'yuuka')!;assert.equal(applyAction(m,p.id,{type:'place',unitId:second.id,x:3,y:1},1),null);refreshShop(p,()=>0,m.players);
 return {m,p,second,buy:()=>applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},11)};
}
test('PvP/PvE 전투·결과 구매는 세 원본과 장비·성급을 유지하고 준비 진입에서만 합성',()=>{
 for(const mode of ['duel','practice'] as const)for(const phase of ['combat','result'] as const){
  const {m,p,second,buy}=setup(mode),first=p.units[0],item=p.inventory[2];assert.equal(applyAction(m,p.id,{type:'equip',unitId:second.id,itemId:item.id},1),null);
  startCombat(m,10);m.phase=phase;const fighters=structuredClone(m.fighters),original=p.units.map(u=>u.id),revision=p.mergeRevision;
  assert.equal(buy(),null);const copies=p.units.filter(u=>u.kind==='yuuka');assert.equal(copies.length,3);assert.ok(copies.every(u=>u.rank===1));assert.ok(original.every(id=>p.units.some(u=>u.id===id)));assert.equal(p.mergeRevision,revision);assert.equal(item.unitId,second.id);assert.deepEqual(m.fighters,fighters);
  const acquired=copies.find(u=>!original.includes(u.id))!;assert.equal(acquired.x,-1);assert.ok(acquired.benchSlot!==null);
  const publicView=snapshotFor(m,'b',12,'room').players[0];assert.ok(publicView.visibility==='opponent'&&publicView.units.some(u=>u.id===second.id)&&publicView.bench.some(u=>u.id===acquired.id));
  prepare(m,50000);assert.equal(first.rank,2);assert.equal(first.x,2);assert.equal(p.units.filter(u=>u.kind==='yuuka').length,1);assert.ok(!p.units.some(u=>u.id===second.id||u.id===acquired.id));assert.equal(item.unitId,first.id);assert.equal(p.mergeRevision,revision+1);
 }
});
test('한꺼번에 모인 여러 1성 묶음·2성 연쇄·다른 종류를 모두 합성하고 공유 원본 수와 장비 연결 보존',()=>{
 const {m,p}=setup();p.units=[];p.inventory.forEach(i=>i.unitId=null);const survivor=acquireUnit(p,'yuuka',false)!;Object.assign(survivor,{x:2,y:1,benchSlot:null});
 for(let i=0;i<8;i++)assert.ok(acquireUnit(p,'yuuka',false));for(let i=0;i<3;i++)assert.ok(acquireUnit(p,'hifumi',false));
 const copies=()=>p.units.reduce((n,u)=>n+unitCopies(u.rank),0),before=copies();m.phase='result';m.round=4;prepare(m,50000);
 assert.equal(copies(),before);assert.equal(p.units.filter(u=>u.kind==='yuuka').length,1);assert.equal(survivor.rank,3);assert.equal(p.units.find(u=>u.kind==='hifumi')!.rank,2);assert.equal(p.units.length,2);
 assert.ok(p.shop.every(o=>o.sold||o.kind!=='yuuka'));assert.ok(p.pendingReward?.options.every(o=>o.type!=='unit'||o.kind!=='yuuka'));
 const after=structuredClone(p);mergeRoster(p);assert.deepEqual(p,after);assert.equal(new Set(p.units.filter(u=>u.x<0).map(u=>u.benchSlot)).size,1);
});
test('여러 묶음 합성 시 모든 소모 ID와 초과 장비 반환을 누락하지 않음',()=>{
 const {m,p}=setup();p.units=[];p.inventory=[];
 for(let i=0;i<6;i++){const u=acquireUnit(p,'yuuka',false)!;const item={id:`gear-${i}`,definition:'blade',unitId:u.id};p.inventory.push(item);u.equipment=[item.id];}
 const original=p.units.map(u=>u.id);prepare(m,50000);assert.equal(p.units.length,2);assert.ok(p.units.every(u=>u.rank===2&&u.equipment.length===2));assert.equal(p.lastMerge!.consumedIds.length,4);assert.equal(p.lastMerge!.returnedEquipment,2);assert.equal(p.inventory.filter(i=>i.unitId===null).length,2);
 assert.ok(p.lastMerge!.consumedIds.every(id=>original.includes(id)&&!p.units.some(u=>u.id===id)));for(const item of p.inventory)if(item.unitId)assert.ok(p.units.find(u=>u.id===item.unitId)?.equipment.includes(item.id));
});
test('합성을 보류하는 전투·결과에서는 만석 구매가 골드·상품·유닛 ID·장비를 바꾸지 않음',()=>{
 for(const phase of ['combat','result'] as const){
  const {m,p,buy}=setup();while(freeBenchSlot(p)>=0)assert.ok(acquireUnit(p,'hifumi',false));startCombat(m,10);m.phase=phase;const before=structuredClone(m);
  assert.equal(canAcquireUnit(p,'yuuka',false),false);assert.equal(canAcquireUnit(p,'yuuka',true),true);assert.ok(buy());assert.deepEqual(m,before);
 }
});
test('전투·결과에서 보류된 대기석 원본을 판매하면 합성하지 않고 수량을 공유 풀에 반환',()=>{
 for(const phase of ['combat','result'] as const){const {m,p,buy}=setup();startCombat(m,10);assert.equal(buy(),null);m.phase=phase;const unit=p.units.at(-1)!,pool=remainingCopies(m.players,'yuuka'),fighters=structuredClone(m.fighters);
 assert.equal(applyAction(m,p.id,{type:'sell',unitId:unit.id},12),null);assert.equal(remainingCopies(m.players,'yuuka'),pool+1);assert.deepEqual(m.fighters,fighters);prepare(m,50000);assert.equal(p.units.filter(u=>u.kind==='yuuka').length,2);assert.ok(p.units.filter(u=>u.kind==='yuuka').every(u=>u.rank===1));
 }
});
test('결과·경기 종료에서는 합성하지 않으며 준비 중 구매는 기존 즉시 합성을 유지',()=>{
 const {m,p,buy}=setup();startCombat(m,10);assert.equal(buy(),null);m.phase='result';const roster=structuredClone(p.units);tick(m,m.deadline-1);assert.deepEqual(p.units,roster);m.phase='finished';tick(m,50000);assert.deepEqual(p.units,roster);
 const prepared=setup();assert.equal(prepared.buy(),null);assert.equal(prepared.p.units[0].rank,2);assert.equal(prepared.p.units.filter(u=>u.kind==='yuuka').length,1);
});
