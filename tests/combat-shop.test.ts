import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, applyAction, startCombat, tick} from "../shared/engine";
import {shopActionsOpen,refreshShop,REROLL_COST} from '../shared/shop';
import {acquireUnit,freeBenchSlot} from '../shared/bench';
import {snapshotFor} from '../shared/snapshot';
import {MutationGate} from '../client/interaction';
import type {Action,Phase} from '../shared/model';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];m.players.forEach(p=>p.level=3);prepare(m,0);return {m,p:m.players[0]};}
test('화면·서버 상점 권한: 준비 완료 전/전투/결과 허용, 마감과 대기/종료 거부',()=>{
 for(const phase of ['waiting','prepare','matching','combat','result','finished'] as Phase[])for(const ready of [false,true])for(const now of [1,100])for(const type of ['buy','reroll'] as const){
  const {m,p}=setup();m.phase=phase;m.deadline=100;p.ready=ready;
  const normal=now<100&&(phase==='combat'||phase==='result'||phase==='prepare'&&!ready),allowed=normal||(type==='reroll'&&phase==='matching'&&now<100);assert.equal(shopActionsOpen(phase,ready,now,100),normal);
  const before=structuredClone(m);const error=applyAction(m,p.id,{type,revision:p.shopRevision,offerId:p.shop[0].id},now);
  assert.equal(error===null,allowed,`${phase}/${ready}/${now}/${type}`);if(!allowed)assert.deepEqual(m,before);
 }
});
test('전투 중 구매·리롤: 준비 완료 상태 허용, 대기석 추가·중복/위조/골드 부족 검증',()=>{
 const {m,p}=setup();p.ready=true;startCombat(m,10);const fighters=structuredClone(m.fighters),other=structuredClone(m.players[1]);
 Object.assign(p.shop[0],{kind:'shiroko',cost:2});const gold=p.gold,buy={type:'buy',offerId:p.shop[0].id,revision:p.shopRevision};
 assert.equal(applyAction(m,p.id,buy,11),null);assert.equal(p.gold,gold-2);const reserve=p.units.at(-1)!;
 assert.equal(reserve.x,-1);assert.equal(reserve.y,-1);assert.ok(reserve.benchSlot!==null);assert.ok(!m.fighters.some(f=>f.id===reserve.id));
 const bought=structuredClone(p);assert.ok(applyAction(m,p.id,buy,11));assert.deepEqual(p,bought);
 assert.ok(applyAction(m,p.id,{type:'buy',offerId:other.shop[0].id,revision:p.shopRevision},11));assert.deepEqual(p,bought);
 const reroll={type:'reroll',revision:p.shopRevision};assert.equal(applyAction(m,p.id,reroll,11),null);assert.equal(p.gold,gold-2-REROLL_COST);
 const rolled=structuredClone(p);assert.ok(applyAction(m,p.id,reroll,11));assert.deepEqual(p,rolled);assert.deepEqual(m.fighters,fighters);assert.deepEqual(m.players[1],other);
 p.gold=0;const poor=structuredClone(p);for(const type of ['buy','reroll']){assert.ok(applyAction(m,p.id,{type,offerId:p.shop[0].id,revision:p.shopRevision},11));assert.deepEqual(p,poor);}
});
test('전투 중 배치·회수·제작·보상·준비 완료는 무변경 거부',()=>{
 const {m,p}=setup();startCombat(m,10);const u=p.units[0],item=p.inventory[0];
 const actions:Action[]=[{type:'place',unitId:u.id,x:0,y:0},{type:'bench',unitId:u.id,slot:2},
  {type:'craft',itemIds:[item.id,p.inventory[1].id]},{type:'chooseReward',rewardId:'fake',optionId:'fake'},{type:'ready'}];
 const before=structuredClone(m);for(const action of actions){assert.ok(applyAction(m,p.id,action,11));assert.deepEqual(m,before);}
});
test('전투 중 합성·장비 반환 보류: 현재 유닛·훅/승패 유지, 다음 준비에서 강화 적용',()=>{
 const {m,p}=setup();const second=acquireUnit(p,'yuuka')!;applyAction(m,p.id,{type:'place',unitId:second.id,x:3,y:1},1);
 for(const [i,id] of [p.units[0].id,p.units[0].id,second.id].entries())assert.equal(applyAction(m,p.id,{type:'equip',unitId:id,itemId:p.inventory[i].id},1),null);
 refreshShop(p,()=>0);startCombat(m,10);const original=structuredClone(m);
 assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},11),null);assert.equal(p.units[0].rank,1);
 assert.equal(p.units.filter(u=>u.kind==='yuuka').length,3);assert.ok(p.units.some(u=>u.id===second.id));assert.equal(p.inventory[2].unitId,second.id);assert.equal(p.lastMerge,null);
 assert.deepEqual(m.fighters,original.fighters);assert.deepEqual(m.events,original.events);
 tick(m,2010);tick(original,2010);assert.deepEqual(m.fighters,original.fighters);assert.deepEqual(m.events,original.events);
 tick(m,40010);tick(original,40010);assert.equal(m.phase,'result');assert.deepEqual(m.fighters,original.fighters);assert.deepEqual(m.events,original.events);
 assert.equal(m.winner,original.winner);assert.deepEqual(m.players.map(p=>p.health),original.players.map(p=>p.health));
 prepare(m,50000);assert.equal(p.inventory[2].unitId,null);assert.equal(p.lastMerge!.returnedEquipment,1);startCombat(m,50001);const f=m.fighters.find(f=>f.id===p.units[0].id)!;assert.equal(f.rank,2);assert.ok(f.maxHp>original.fighters[0].maxHp);assert.ok(!m.fighters.some(f=>f.id===second.id));
});
test('전투·결과 만석: 합성 가능한 종류도 빈 대기석 없이는 무변경 거부',()=>{
 const {m,p}=setup();acquireUnit(p,'yuuka');while(freeBenchSlot(p)>=0)acquireUnit(p,'hifumi')!.rank=3;
 refreshShop(p,()=>0);Object.assign(p.shop[1],{kind:'shiroko',cost:2});startCombat(m,10);const before=structuredClone(m);
 assert.ok(applyAction(m,p.id,{type:'buy',offerId:p.shop[1].id,revision:p.shopRevision},11));assert.deepEqual(m,before);
 assert.ok(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},11));assert.deepEqual(m,before);
 m.phase='result';const result=structuredClone(m);assert.ok(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},11));assert.deepEqual(m,result);
 const reserves=p.units.filter(u=>u.x<0);assert.ok(reserves.length<=12);assert.equal(new Set(reserves.map(u=>u.benchSlot)).size,reserves.length);assert.ok(reserves.every(u=>u.benchSlot!>=0));
});
test('전투 중 구매는 관전 대기석에 반영, 경제 비공개·응답 대기 해제·전투 시작 이자 고정',()=>{
 const {m,p}=setup();p.gold=50;p.ready=true;Object.assign(p.shop[0],{kind:'shiroko',cost:2});startCombat(m,10);
 const view=()=>snapshotFor(m,p.id,11,'test'),gate=new MutationGate(),publicBefore=snapshotFor(m,'b',11,'test').players[0];
 assert.ok(gate.start(view()));gate.observe(view());assert.ok(gate.busy);
 assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},11),null);gate.observe(view());assert.equal(gate.busy,false);
 const publicAfter=snapshotFor(m,'b',11,'test').players[0];assert.ok(publicAfter.visibility==='opponent'&&publicBefore.visibility==='opponent');
 assert.deepEqual({...publicAfter,bench:[]},{...publicBefore,bench:[]});assert.equal(publicAfter.bench.length,publicBefore.bench.length+1);assert.equal(p.gold,48);assert.equal(p.roundInterest,5);
 const shop=structuredClone(p.shop);prepare(m,50000);assert.equal(p.lastIncome.interest,5);assert.ok(p.shop.every(o=>!shop.some(old=>old.id===o.id)));
});
