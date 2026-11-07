import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, applyAction, startCombat} from "../shared/engine";
import {acquireUnit,freeBenchSlot} from '../shared/bench';
import {deployedCount} from '../shared/progression';
import {placementIntent} from '../client/interaction';
import {planUnitPlacement} from '../shared/placement';
import { COLS } from '../shared/model';
import {snapshotFor} from '../shared/snapshot';
import type {Action,Phase,Player,SelfPlayerSnapshot,Unit} from '../shared/model';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);return {m,p:m.players[0]};}
const position=(u:Unit)=>({x:u.x,y:u.y,benchSlot:u.benchSlot});
function invariant(p:Player){
 const field=p.units.filter(u=>u.x>=0),bench=p.units.filter(u=>u.x<0);
 assert.ok(field.length<=p.level);assert.ok(bench.length<=12);
 assert.equal(new Set(field.map(u=>`${u.x},${u.y}`)).size,field.length);
 assert.ok(field.every(u=>u.benchSlot===null&&u.x<COLS&&u.y>=0&&u.y<4));
 assert.equal(new Set(bench.map(u=>u.benchSlot)).size,bench.length);
 assert.ok(bench.every(u=>u.x===-1&&u.y===-1&&Number.isInteger(u.benchSlot)&&u.benchSlot!>=0&&u.benchSlot!<12));
}
test('정원 1명에서 대기석→전장/전장→대기석 교환: 장비·강화·ID 유지',()=>{
 for(const direction of ['place','bench'] as const){
  const {m,p}=setup(),field=p.units[0],bench=p.units[1];field.rank=2;bench.rank=3;
  applyAction(m,p.id,{type:'equip',unitId:field.id,itemId:p.inventory[0].id},1);
  applyAction(m,p.id,{type:'equip',unitId:bench.id,itemId:p.inventory[1].id},1);
  const original=structuredClone(p),from=position(field),to=position(bench);
  const action:Action=direction==='place'?{type:'place',unitId:bench.id,x:field.x,y:field.y}:{type:'bench',unitId:field.id,slot:bench.benchSlot!};
  assert.equal(applyAction(m,p.id,action,1),null);assert.deepEqual(position(field),to);assert.deepEqual(position(bench),from);invariant(p);
  const expected=structuredClone(original);Object.assign(expected.units[0],to);Object.assign(expected.units[1],from);assert.deepEqual(p,expected);
  const swapped=structuredClone(m);assert.equal(applyAction(m,p.id,action,1),null);assert.deepEqual(m,swapped); // A duplicate destination request cannot swap back.
 }
});
test('대기석끼리·전장끼리 교환, 같은 위치 드롭은 변경 없음',()=>{
 const {m,p}=setup();const [a,b,c]=p.units;
 assert.equal(applyAction(m,p.id,{type:'bench',unitId:b.id,slot:c.benchSlot!},1),null);assert.equal(b.benchSlot,1);assert.equal(c.benchSlot,0);invariant(p);
 p.level=3;applyAction(m,p.id,{type:'place',unitId:b.id,x:0,y:0},1);const oldA=position(a),oldB=position(b);
 assert.equal(applyAction(m,p.id,{type:'place',unitId:a.id,x:b.x,y:b.y},1),null);assert.deepEqual(position(a),oldB);assert.deepEqual(position(b),oldA);invariant(p);
 const before=structuredClone(m);assert.equal(applyAction(m,p.id,{type:'place',unitId:a.id,x:a.x,y:a.y},1),null);
 assert.equal(applyAction(m,p.id,{type:'bench',unitId:c.id,slot:c.benchSlot!},1),null);assert.deepEqual(m,before);
});
test('대기석 12칸·출전 정원 만석이어도 양방향 자리 교환 가능',()=>{
 const {m,p}=setup();while(freeBenchSlot(p)>=0)acquireUnit(p,'hifumi')!.rank=3;
 const field=p.units[0],bench=p.units[1],target=position(field),slot=bench.benchSlot!;
 assert.equal(freeBenchSlot(p),-1);assert.equal(applyAction(m,p.id,{type:'bench',unitId:field.id,slot},1),null);invariant(p);assert.equal(freeBenchSlot(p),-1);
 assert.equal(applyAction(m,p.id,{type:'place',unitId:field.id,x:target.x,y:target.y},1),null);invariant(p);assert.equal(field.benchSlot,null);assert.equal(bench.benchSlot,slot);
 const before=structuredClone(p);assert.ok(applyAction(m,p.id,{type:'bench',unitId:field.id},1));assert.deepEqual(p,before); // Automatic return still needs a free slot.
 assert.ok(applyAction(m,p.id,{type:'place',unitId:bench.id,x:0,y:0},1));assert.deepEqual(p,before); // Empty-cell placement still increases the deployed count.
});
test('타인 유닛·범위·마감·준비 완료·전투/결과/종료 교환은 무변경 거부',()=>{
 const {m,p}=setup(),unit=p.units[1];
 for(const input of [{type:'place',unitId:m.players[1].units[0].id,x:2,y:1},{type:'place',unitId:unit.id,x:2,y:4},
  {type:'place',unitId:unit.id,x:NaN,y:1},{type:'bench',unitId:unit.id,slot:12},{type:'bench',unitId:unit.id,slot:0.5}]){
  const before=structuredClone(m);assert.ok(applyAction(m,p.id,input,1));assert.deepEqual(m,before);
 }
 const swap={type:'place',unitId:unit.id,x:2,y:1};const before=structuredClone(m);assert.ok(applyAction(m,p.id,swap,m.deadline));assert.deepEqual(m,before);
 p.ready=true;const ready=structuredClone(m);assert.ok(applyAction(m,p.id,swap,1));assert.deepEqual(m,ready);p.ready=false;
 for(const phase of ['waiting','combat','result','finished'] as Phase[]){m.phase=phase;const locked=structuredClone(m);assert.ok(applyAction(m,p.id,swap,1));assert.deepEqual(m,locked);}
});
test('드롭 안내와 서버는 양쪽 플레이어에서 같은 교환/정원 판정 사용',()=>{
 const {m}=setup();
 for(const p of m.players){
  const own=snapshotFor(m,p.id,1,'test').players.find(p=>p.visibility==='self') as SelfPlayerSnapshot;
  const before=structuredClone(m);const unit=p.units[1];
  const intent=placementIntent(own,unit.id,{kind:'cell',x:2,y:6},true);assert.equal(intent.reason,'자리 교환');assert.equal(intent.valid,true);assert.ok(intent.action);
  assert.deepEqual(m,before);assert.equal(applyAction(m,p.id,intent.action,1),null);assert.equal(unit.x,2);assert.equal(unit.y,1);invariant(p);
  const current=snapshotFor(m,p.id,1,'test').players.find(p=>p.visibility==='self') as SelfPlayerSnapshot;
  assert.equal(placementIntent(current,unit.id,{kind:'cell',x:2,y:6},true).action,null);
  assert.equal(placementIntent(current,unit.id,{kind:'bench',slot:0},true).reason,'자리 교환');
  assert.equal(placementIntent(current,unit.id,{kind:'bench',slot:0},false).action,null);
 }
});
test('전장 교환은 공개 배치와 관전 대기석을 갱신하고 출전 유닛만 전투에 참가',()=>{
 const {m,p}=setup(),field=p.units[0],bench=p.units[1];m.mode='practice';
 applyAction(m,p.id,{type:'place',unitId:bench.id,x:field.x,y:field.y},1);
 const other=snapshotFor(m,'b',1,'test').players[0];assert.deepEqual(other.units.map(u=>u.id),[bench.id]);assert.ok(other.visibility==='opponent'&&other.bench.some(u=>u.id===field.id));
 startCombat(m,2);assert.ok(m.fighters.some(f=>f.id===bench.id));assert.ok(!m.fighters.some(f=>f.id===field.id));
 const before=structuredClone(m);assert.ok(applyAction(m,p.id,{type:'place',unitId:field.id,x:2,y:1},3));assert.deepEqual(m,before);
});
test('긴 교환 시퀀스: 배치/대기석 유일성·출전 수·유닛/장비 연결 보존',()=>{
 const {m,p}=setup();p.level=10;while(freeBenchSlot(p)>=0)acquireUnit(p,'hifumi')!.rank=3;
 for(const [i,u] of p.units.slice(0,3).entries())applyAction(m,p.id,{type:'equip',unitId:u.id,itemId:p.inventory[i].id},1);
 const possessions=p.units.map(({x,y,benchSlot,...rest})=>rest),inventory=structuredClone(p.inventory),gold=p.gold;let seed=17;
 for(let i=0;i<150;i++){
  seed=(seed*1664525+1013904223)>>>0;const u=p.units[seed%p.units.length];seed=(seed*1664525+1013904223)>>>0;const target=p.units[seed%p.units.length];
  const action:Action=target.x<0?{type:'bench',unitId:u.id,slot:target.benchSlot!}:{type:'place',unitId:u.id,x:target.x,y:target.y};
  assert.equal(applyAction(m,p.id,action,1),null);invariant(p);assert.equal(deployedCount(p),1);
 }
 assert.deepEqual(p.units.map(({x,y,benchSlot,...rest})=>rest),possessions);assert.deepEqual(p.inventory,inventory);assert.equal(p.gold,gold);
});
test('공유 배치 계획은 원본을 변경하지 않고 양쪽 이동을 한번에 반환',()=>{
 const {p}=setup(),before=structuredClone(p);const plan=planUnitPlacement(p,p.units[1].id,{kind:'cell',x:2,y:1});
 assert.equal(plan.error,null);assert.equal(plan.swapped,true);assert.equal(plan.moves.length,2);assert.deepEqual(p,before);
});
