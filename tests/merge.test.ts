import {newTestPlayer as newPlayer} from "./fixtures";
import { UNIT_KINDS } from "../shared/catalog";
import { COLS } from '../shared/model';
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, applyAction, startCombat, botSetup} from "../shared/engine";
import {acquireUnit, canAcquireUnit, freeBenchSlot} from '../shared/bench';
import {UNITS, statsFor} from '../shared/catalog';
import {unitSellPrice, refreshShop} from '../shared/shop';
import {snapshotFor} from '../shared/snapshot';
import {DebugSession} from '../server/debug';
import {GameClock} from '../shared/game-time';
import type {Kind, Player, Rarity, SelfPlayerSnapshot, UnitRank} from '../shared/model';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);return {m,p:m.players[0]};}
function empty(){const {m,p}=setup();p.units=[];p.inventory.forEach(i=>i.unitId=null);return {m,p};}
function invariant(p:Player){
 const ids=new Set(p.units.map(u=>u.id));assert.equal(ids.size,p.units.length);
 const reserves=p.units.filter(u=>u.x<0);assert.ok(reserves.length<=12);
 assert.equal(new Set(reserves.map(u=>u.benchSlot)).size,reserves.length);
 assert.ok(reserves.every(u=>Number.isInteger(u.benchSlot)&&u.benchSlot!>=0&&u.benchSlot!<12));
 for(const u of p.units){assert.ok(u.rank>=1&&u.rank<=3);assert.ok(u.equipment.length<=2);for(const id of u.equipment)assert.equal(p.inventory.find(i=>i.id===id)?.unitId,u.id);}
 for(const i of p.inventory)if(i.unitId!==null){assert.ok(ids.has(i.unitId));assert.ok(p.units.find(u=>u.id===i.unitId)!.equipment.includes(i.id));}
}
test('3개 자동 2성, 9개 연쇄 3성, 최대 3성은 다시 합성하지 않음',()=>{
 const {p}=empty();
 for(let i=0;i<27;i++) {const u=acquireUnit(p,'yuuka')!;assert.ok(u);invariant(p);if((i+1)%9===0)assert.equal(u.rank,3);}
 assert.equal(p.units.length,3);assert.ok(p.units.every(u=>u.rank===3));
 assert.equal(p.mergeRevision,9); // One notification per acquisition, including chains.
 assert.equal(p.lastMerge!.rank,3);assert.equal(p.lastMerge!.consumedIds.length,4);
});
test('다른 종류·등급·플레이어 유닛은 합성 대상으로 섞이지 않음',()=>{
 const {m,p}=empty();const other=structuredClone(m.players[1]);
 const upgraded=acquireUnit(p,'yuuka')!;upgraded.rank=2;
 acquireUnit(p,'yuuka');acquireUnit(p,'shiroko');acquireUnit(p,'yuuka');
 assert.equal(p.units.length,4);assert.equal(p.mergeRevision,0);
 acquireUnit(p,'yuuka');assert.equal(p.units.filter(u=>u.kind==='yuuka').length,2);
 assert.ok(p.units.filter(u=>u.kind==='yuuka').every(u=>u.rank===2));assert.deepEqual(m.players[1],other);
});
test('전장 유닛 우선 보존: ID·장비·위치 유지, 강화 등급도 출전 한 자리',()=>{
 const {m,p}=empty();p.level=3;
 const first=acquireUnit(p,'yuuka')!,deployed=acquireUnit(p,'yuuka')!;
 assert.equal(applyAction(m,p.id,{type:'place',unitId:deployed.id,x:2,y:1},1),null);
 const merged=acquireUnit(p,'yuuka')!;assert.equal(merged.id,deployed.id);assert.equal(merged.rank,2);
 assert.equal(merged.x,2);assert.equal(merged.y,1);assert.equal(merged.benchSlot,null);assert.ok(!p.units.some(u=>u.id===first.id));
 for(const type of ['place','sell'])assert.ok(applyAction(m,p.id,{type,unitId:first.id,x:0,y:0},1));
 assert.equal(p.units.filter(u=>u.x>=0).length,1);invariant(p);
 startCombat(m,2);const f=m.fighters.find(f=>f.id===merged.id)!;assert.equal(f.rank,2);assert.equal(f.maxHp,585);assert.equal(f.skills.length,1);
});
test('여러 전장 유닛 합성 후 빈 출전 자리는 자동으로 채우지 않음',()=>{
 const {m,p}=empty();p.level=3;
 for(let i=0;i<2;i++){const u=acquireUnit(p,'hifumi')!;assert.equal(applyAction(m,p.id,{type:'place',unitId:u.id,x:i,y:0},1),null);}
 acquireUnit(p,'shiroko');acquireUnit(p,'hifumi');assert.equal(p.units.filter(u=>u.x>=0).length,1);
 assert.equal(p.units.find(u=>u.kind==='hifumi')!.rank,2);assert.equal(p.units.find(u=>u.kind==='shiroko')!.x,-1);
});
test('장비 이관은 남는 유닛 장비 우선 2개, 초과 반환 및 강화 판매 후 전체 반환',()=>{
 const {m,p}=empty();const first=acquireUnit(p,'yuuka')!,field=acquireUnit(p,'yuuka')!;p.level=3;
 applyAction(m,p.id,{type:'place',unitId:field.id,x:2,y:1},1);
 for(const [i,id] of [field.id,field.id,first.id].entries())assert.equal(applyAction(m,p.id,{type:'equip',unitId:id,itemId:p.inventory[i].id},1),null);
 const merged=acquireUnit(p,'yuuka')!;assert.deepEqual(merged.equipment,p.inventory.slice(0,2).map(i=>i.id));assert.equal(p.inventory[2].unitId,null);
 assert.equal(p.lastMerge!.returnedEquipment,1);invariant(p);const gold=p.gold;
 assert.equal(applyAction(m,p.id,{type:'sell',unitId:merged.id},1),null);assert.equal(p.gold,gold+6);assert.ok(p.inventory.every(i=>i.unitId===null));
 const sold=structuredClone(p);assert.ok(applyAction(m,p.id,{type:'sell',unitId:merged.id},1));assert.deepEqual(p,sold);
});
test('연쇄 합성의 소모 ID·장비 반환 내역을 마지막 강화 결과에 합산',()=>{
 const {p}=empty();for(let i=0;i<8;i++)acquireUnit(p,'yuuka');
 // Two upgraded units and two base copies before the ninth acquisition.
 assert.deepEqual(p.units.map(u=>u.rank),[2,2,1,1]);
 p.inventory=[];
 for(const u of p.units)for(let i=0;i<2;i++){
  const item={id:`gear-${p.inventory.length}`,definition:'blade',unitId:u.id};p.inventory.push(item);u.equipment.push(item.id);
 }
 const merged=acquireUnit(p,'yuuka')!;assert.equal(merged.rank,3);assert.equal(p.lastMerge!.consumedIds.length,4);
 assert.equal(p.lastMerge!.returnedEquipment,6);assert.ok(p.lastMerge!.consumedIds.every(id=>!p.units.some(u=>u.id===id)));invariant(p);
});
test('대기석 만석 즉시 합성 구매 허용, 한 번만 결제·상점 상태 유지',()=>{
 const {m,p}=empty();acquireUnit(p,'yuuka');acquireUnit(p,'yuuka');
 while(freeBenchSlot(p)>=0)acquireUnit(p,'hifumi')!.rank=3;
 assert.equal(freeBenchSlot(p),-1);assert.ok(canAcquireUnit(p,'yuuka'));assert.ok(!canAcquireUnit(p,'shiroko'));
 refreshShop(p,()=>0);const action={type:'buy',offerId:p.shop[0].id,revision:p.shopRevision,cost:0,rank:3};const gold=p.gold;
 assert.equal(applyAction(m,p.id,action,1),null);assert.equal(p.gold,gold-2);assert.equal(p.units.length,11);assert.equal(p.units[0].rank,2);
 assert.equal(p.shop[0].sold,true);invariant(p);const after=structuredClone(p);
 assert.ok(applyAction(m,p.id,action,1));assert.deepEqual(p,after);
});
test('만석 합성 불가능·골드 부족·준비 완료·마감·종료 단계는 무변경 거부',()=>{
 const {m,p}=empty();while(freeBenchSlot(p)>=0)acquireUnit(p,'hifumi')!.rank=3;
 refreshShop(p,()=>0);let action={type:'buy',offerId:p.shop[0].id,revision:p.shopRevision};const full=structuredClone(p);
 assert.ok(applyAction(m,p.id,action,1));assert.equal(acquireUnit(p,'yuuka'),null);assert.deepEqual(p,full);
 p.units=[];acquireUnit(p,'yuuka');acquireUnit(p,'yuuka');p.gold=0;const poor=structuredClone(p);assert.ok(applyAction(m,p.id,action,1));assert.deepEqual(p,poor);
 p.gold=10;p.ready=true;const ready=structuredClone(p);assert.ok(applyAction(m,p.id,action,1));assert.deepEqual(p,ready);p.ready=false;
 const locked=structuredClone(p);assert.ok(applyAction(m,p.id,action,m.deadline));assert.deepEqual(p,locked);
 m.phase='finished';assert.ok(applyAction(m,p.id,action,1));assert.deepEqual(p,locked);
});
test('레어도 1~5 × 강화 1·3·9 판매가와 기본 능력치 1·1.8·3.24, 장비 가산 별도',()=>{
 const rarity=UNITS.yuuka.rarity;
 try {for(let r=1;r<=5;r++){UNITS.yuuka.rarity=r as Rarity;for(let rank=1;rank<=3;rank++)assert.equal(unitSellPrice({kind:'yuuka',rank:rank as UnitRank}),r*3**(rank-1));}}
 finally{UNITS.yuuka.rarity=rarity;}
 const {m,p}=empty();const u=acquireUnit(p,'yuuka')!;
 applyAction(m,p.id,{type:'equip',unitId:u.id,itemId:p.inventory[0].id},1);applyAction(m,p.id,{type:'equip',unitId:u.id,itemId:p.inventory[1].id},1);
 for(const rank of [1,2,3] as const){u.rank=rank;const stats=statsFor(u,p.inventory);assert.equal(stats.hp,Math.round(325*1.8**(rank-1))+60);assert.equal(stats.attack,Math.round(24*1.8**(rank-1))+8);assert.equal(stats.range,2);assert.equal(stats.interval,880);}
});
test('상대에게 전장과 대기석 강화 등급은 공개, 합성 내역·미래 내부 필드는 비공개',()=>{
 const {m,p}=empty();m.mode='practice';for(let i=0;i<3;i++)acquireUnit(p,'yuuka');
 Object.assign(p.lastMerge!,{privateFuture:'secret'});const before=structuredClone(m);
 const own=snapshotFor(m,'a',1,'test').players[0] as SelfPlayerSnapshot;assert.equal(own.units[0].rank,2);assert.ok(!('privateFuture'in own.lastMerge!));
 const enemy=snapshotFor(m,'b',1,'test').players[0];assert.equal(enemy.units.length,0);assert.ok(!('mergeRevision'in enemy));assert.ok(!('lastMerge'in enemy));
 own.lastMerge!.consumedIds.push('tamper');assert.deepEqual(m,before);
 assert.equal(applyAction(m,p.id,{type:'place',unitId:p.units[0].id,x:0,y:0},1),null);
 const publicUnit=snapshotFor(m,'b',1,'test').players[0].units[0];assert.equal(publicUnit.rank,2);assert.ok(!('benchSlot'in publicUnit));
});
test('합성 프리셋 구매·저장 복원은 골드·강화·장비·합성 이벤트를 재현',()=>{
 const {m,p}=setup();const clock=new GameClock(1000),debug=new DebugSession();
 assert.equal(debug.apply(m,clock,{type:'preset',preset:'merge'},1000),null);const player=m.players[0];
 assert.equal(player.units.filter(u=>u.kind==='yuuka'&&u.rank===1).length,2);assert.equal(player.units.filter(u=>u.x>=0).length,1);
 debug.apply(m,clock,{type:'save'},1000);const saved=structuredClone(m);
 const buy=()=>applyAction(m,p.id,{type:'buy',offerId:m.players[0].shop[0].id,revision:m.players[0].shopRevision},1001);
 assert.equal(buy(),null);const merged=structuredClone(m);assert.equal(m.players[0].units[0].rank,2);assert.equal(m.players[0].lastMerge!.returnedEquipment,0);
 debug.apply(m,clock,{type:'load'},1000);assert.deepEqual(m,saved);assert.equal(clock.paused,true);assert.equal(buy(),null);assert.deepEqual(m,merged);invariant(m.players[0]);
});
test('긴 획득 시퀀스: 종류별 원본 수 보존·대기석·장비 연결 불변, 봇 최대 10인 배치',()=>{
 const {p}=empty();const counts = Object.fromEntries(UNIT_KINDS.map(kind => [kind, 0])) as Record<Kind,number>;let seed=19;
 for(let i=0;i<200;i++){seed=(seed*1664525+1013904223)>>>0;const kind=UNIT_KINDS[seed%UNIT_KINDS.length];const before=structuredClone(p);
  if(acquireUnit(p,kind))counts[kind]++;else assert.deepEqual(p,before);invariant(p);
  for(const kind of UNIT_KINDS)assert.equal(p.units.filter(u=>u.kind===kind).reduce((n,u)=>n+3**(u.rank-1),0),counts[kind]);
 }
 // A complete upgraded roster still deploys ten unique valid cells.
 const bot=newPlayer('practice-bot','Bot');bot.level=10;bot.units=[];for(let i=0;i<10;i++)acquireUnit(bot,'yuuka')!.rank=3;
 botSetup(bot);assert.equal(bot.units.filter(u=>u.x>=0).length,10);assert.equal(new Set(bot.units.map(u=>`${u.x},${u.y}`)).size,10);assert.ok(bot.units.every(u=>u.x<COLS&&u.y<4));invariant(bot);
});
