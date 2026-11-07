import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, applyAction} from "../shared/engine";
import {acquireUnit,freeBenchSlot} from '../shared/bench';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];m.players.forEach(p=>p.level=3);prepare(m,0);return {m,p:m.players[0]};}
test('12칸 한도: 만석 구매·보상·전장 복귀 실패는 상태를 바꾸지 않는다',()=>{
 const {m,p}=setup(); p.gold=100; while(freeBenchSlot(p)>=0) acquireUnit(p,'hifumi')!.rank=3; p.shop[0].kind='yuuka'; p.shop[0].cost=1;
 assert.equal(p.units.filter(u=>u.x<0).length,12); const before=structuredClone(p);
 assert.ok(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},1));
 assert.equal(acquireUnit(p,'yuuka'),null);
 assert.ok(applyAction(m,p.id,{type:'bench',unitId:p.units[0].id},1));
 assert.deepEqual(p,before);
});
test('배치로 해제한 자리 재사용, 특정 슬롯 이동, 범위·타인 검증',()=>{
 const {m,p}=setup();const u=p.units[1];
 assert.equal(applyAction(m,p.id,{type:'bench',unitId:u.id,slot:11},1),null);
 assert.equal(u.benchSlot,11); assert.equal(acquireUnit(p,'hifumi')!.benchSlot,0);
 const before=structuredClone(p);
 for(const slot of [-1,12,1.5]) assert.ok(applyAction(m,p.id,{type:'bench',unitId:u.id,slot},1));
 assert.ok(applyAction(m,p.id,{type:'bench',unitId:m.players[1].units[1].id,slot:3},1));
 assert.deepEqual(p,before);
 assert.equal(applyAction(m,p.id,{type:'place',unitId:u.id,x:0,y:0},1),null);
 assert.equal(u.benchSlot,null);
 assert.equal(applyAction(m,p.id,{type:'bench',unitId:u.id,slot:11},1),null);
 assert.equal(u.x,-1); assert.equal(u.benchSlot,11);
});
