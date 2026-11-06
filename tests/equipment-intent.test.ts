import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentIntent} from '../client/equipment-intent';
import {newMatch, prepare, applyAction, startCombat} from "../shared/engine";
import {snapshotFor} from '../shared/snapshot';
import type {SelfPlayerSnapshot} from '../shared/model';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const p=m.players[0],view=()=>snapshotFor(m,'a',1,'test').players[0] as SelfPlayerSnapshot;return {m,p,view};}
test('장비 드롭은 명시한 전장/대기석 유닛에게만 장착하며 기존 선택과 무관함',()=>{
 for(const index of [0,1]){const {m,p,view}=setup(),item=p.inventory[0],unit=p.units[index];const plan=equipmentIntent(view(),item.id,unit.id,true);assert.ok(plan.valid&&plan.action);assert.equal(applyAction(m,'a',plan.action,1),null);assert.equal(item.unitId,unit.id);assert.ok(unit.equipment.includes(item.id));assert.equal(p.units[1-index].equipment.length,0);}
});
test('상대/빈 칸/보유하지 않은 장비는 장착 명령을 만들지 않음',()=>{
 const {m,p,view}=setup();for(const [item,id] of [[p.inventory[0].id,undefined],[p.inventory[0].id,m.players[1].units[0].id],['missing',p.units[0].id]] as const){const plan=equipmentIntent(view(),item,id,true);assert.equal(plan.valid,false);assert.equal(plan.action,null);}
});
test('드롭과 해제 사이에 준비/연결/응답 상태가 바뀌면 장착 명령을 만들지 않음',()=>{
 const {m,p,view}=setup();const unit=p.units[0],item=p.inventory[0];assert.equal(equipmentIntent(view(),item.id,unit.id,false).action,null);startCombat(m,1);assert.equal(equipmentIntent(view(),item.id,unit.id,false).action,null);assert.equal(item.unitId,null);
});
test('장비 두 개 한도: 다른 장비나 유닛을 변경하지 않고 거절',()=>{
 const {m,p,view}=setup(),u=p.units[0];for(const item of p.inventory.slice(0,2))assert.equal(applyAction(m,'a',{type:'equip',unitId:u.id,itemId:item.id},1),null);const before=structuredClone(p),plan=equipmentIntent(view(),p.inventory[2].id,u.id,true);assert.equal(plan.valid,false);assert.equal(plan.action,null);assert.match(plan.reason,/2개/);assert.deepEqual(p,before);
});
test('재료 직접 장착 거절; 이미 붙어 있는 장비를 다시 드롭해도 중복 요청 없음',()=>{
 const {m,p,view}=setup();p.inventory.push({id:'material',definition:'iron',unitId:null});const material=equipmentIntent(view(),'material',p.units[0].id,true);assert.equal(material.action,null);assert.match(material.reason,/재료/);const item=p.inventory[0],u=p.units[0];applyAction(m,'a',{type:'equip',unitId:u.id,itemId:item.id},1);const same=equipmentIntent(view(),item.id,u.id,true);assert.ok(same.valid);assert.equal(same.action,null);assert.equal(equipmentIntent(view(),item.id,p.units[1].id,true).action,null);
});
test('드래그 도중 아이템/유닛이 사라지면 유효한 대상이 남지 않음',()=>{
 const {p,view}=setup(),item=p.inventory[0],u=p.units[0];p.inventory.shift();assert.equal(equipmentIntent(view(),item.id,u.id,true).action,null);p.units.shift();assert.equal(equipmentIntent(view(),p.inventory[0].id,u.id,true).action,null);
});
