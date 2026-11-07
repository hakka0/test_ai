import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureClicks, MutationGate, SaleConfirmation, placementIntent} from '../client/interaction';
import {newMatch, prepare, applyAction} from "../shared/engine";
import {snapshotFor} from '../shared/snapshot';
import type {SelfPlayerSnapshot} from '../shared/model';
import {UNITS} from '../shared/catalog';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const view=()=>snapshotFor(m,'a',1,'test');const own=()=>view().players[0] as SelfPlayerSnapshot;return {m,p:m.players[0],view,own};}
test('터치 선택 뒤 빈 아군 칸·대기석 이동: 화면 좌표는 실제 서버 좌표와 일치',()=>{
 const {m,p,own}=setup();p.level=3;
 const intent=placementIntent(own(),p.units[1].id,{kind:'cell',x:4,y:7},true);
 assert.ok(intent.valid&&intent.action);assert.equal(applyAction(m,p.id,intent.action,1),null);assert.equal(p.units[1].x,4);assert.equal(p.units[1].y,0);
 const reverseView=snapshotFor(m,'b',1,'test').players[1] as SelfPlayerSnapshot;
 const reverse=placementIntent(reverseView,m.players[1].units[0].id,{kind:'cell',x:5,y:5},true);
 assert.equal(applyAction(m,'b',reverse.action,1),null);assert.equal(m.players[1].units[0].x,5);assert.equal(m.players[1].units[0].y,2);
 const reserve=placementIntent(own(),p.units[1].id,{kind:'bench',slot:11},true);
 assert.equal(applyAction(m,p.id,reserve.action,1),null);assert.equal(p.units[1].benchSlot,11);assert.equal(p.units[1].x,-1);
});
test('터치·드래그 판정: 정원·상대 영역·잘못된 슬롯은 명령을 만들지 않음',()=>{
 const {p,own}=setup(),id=p.units[1].id;
 for(const target of [{kind:'cell',x:0,y:3},{kind:'cell',x:0,y:2},{kind:'bench',slot:12},{kind:'bench',slot:0.5},{kind:'outside'}] as const){const out=placementIntent(own(),id,target,true);assert.equal(out.valid,false);assert.equal(out.action,null);assert.ok(out.reason);}
 assert.equal(placementIntent(own(),id,{kind:'cell',x:0,y:3},false).action,null);
 assert.equal(placementIntent(own(),'other-id',{kind:'cell',x:0,y:3},true).action,null);
 assert.equal(placementIntent(own(),p.units[0].id,{kind:'cell',x:2,y:6},true).action,null); // Same square: no unnecessary request.
 assert.equal(placementIntent(own(),id,{kind:'bench',slot:0},true).action,null);
});
test('결과에서는 판매 드롭만 허용하고 전장·대기석 배치는 계속 차단',()=>{
 const {p,own}=setup(),id=p.units[0].id;
 assert.deepEqual(placementIntent(own(),id,{kind:'shop'},false,true).action,{type:'sell',unitId:id});
 for(const to of [{kind:'cell',x:4,y:6},{kind:'bench',slot:5},{kind:'outside'}] as const)assert.equal(placementIntent(own(),id,to,false,true).action,null);
 assert.equal(placementIntent(own(),id,{kind:'shop'},false,false).action,null);
 assert.equal(placementIntent(own(),'foreign',{kind:'shop'},false,true).action,null);
});

test('제스처 이후 클릭만 무시: 빠른 다음 빈칸 터치와 키보드 Enter는 즉시 허용',()=>{
 const clicks=new GestureClicks();clicks.end(7,10,20,100);
 assert.ok(clicks.consume({detail:1,pointerId:7,clientX:10,clientY:20},101));
 assert.ok(!clicks.consume({detail:1,pointerId:7,clientX:10,clientY:20},102));
 clicks.end(7,10,20,100);clicks.begin();assert.ok(!clicks.consume({detail:1,pointerId:7,clientX:10,clientY:20},101));
 clicks.end(7,10,20,100);assert.ok(!clicks.consume({detail:0,clientX:0,clientY:0},101));
 assert.ok(!clicks.consume({detail:1,pointerId:8,clientX:10,clientY:20},101));
 assert.ok(!clicks.consume({detail:1,pointerId:7,clientX:30,clientY:20},101));
 assert.ok(!clicks.consume({detail:1,pointerId:7,clientX:10,clientY:20},501));
});
test('터치 취소 후 호환 클릭 차단, pointerId가 없는 브라우저도 좌표로 판정',()=>{
 const clicks=new GestureClicks();clicks.end(11,100,200,1000);
 assert.equal(clicks.consume({detail:1,clientX:101,clientY:202},1005),true);
 clicks.end(11,100,200,1000);clicks.begin();assert.equal(clicks.consume({detail:1,clientX:100,clientY:200},1005),false);
});
test('서버 확인 전 중복 구매·장비 요청 차단, 반복 스냅샷·상대 갱신으로 풀리지 않음',()=>{
 const {m,p,view}=setup(),gate=new MutationGate();assert.ok(gate.start(view()));assert.ok(!gate.start(view()));
 gate.observe(view());assert.ok(gate.busy);
 m.players[1].gold++;m.players[1].ready=true;gate.observe(view());assert.ok(gate.busy);
 const current=view();assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},1),null);
 gate.observe(current);assert.ok(gate.busy);gate.observe(view());assert.ok(!gate.busy);
 assert.ok(gate.start(view()));assert.equal(applyAction(m,p.id,{type:'equip',unitId:p.units[0].id,itemId:p.inventory[0].id},1),null);gate.observe(view());assert.ok(!gate.busy);
});
test('서버 거부·연결 해제 시 재시도, 단계·체크포인트 변경 시 입력 잠금 해제',()=>{
 const {m,view}=setup(),gate=new MutationGate();gate.start(view());gate.reset();assert.ok(gate.start(view()));
 m.phase='combat';gate.observe(view());assert.ok(!gate.busy);
 m.phase='prepare';gate.start(view());const reset=view();reset.debug={speed:1,paused:true,generation:1,hasCheckpoint:true};gate.observe(reset);assert.ok(!gate.busy);
});
test('판매 확인은 대상·강화 등급·가격에 묶이며 선택 변경·합성·취소 시 무효',()=>{
 const {p}=setup(),sale=new SaleConfirmation();const u=p.units[0];assert.ok(!sale.matches(u));sale.arm(u);assert.ok(sale.matches(u));assert.ok(!sale.matches(p.units[1]));
 u.rank=2;assert.ok(!sale.matches(u));sale.arm(u);assert.ok(sale.matches(u));sale.clear();assert.ok(!sale.matches(u));assert.ok(!sale.matches(undefined));
 const rarity=UNITS.yuuka.rarity;try{sale.arm(u);UNITS.yuuka.rarity=3;assert.ok(!sale.matches(u));}finally{UNITS.yuuka.rarity=rarity;}
});
test('판매 확인 후 서버 거래·장비 반환·응답 해제, 삭제된 선택은 추가 거래 불가',()=>{
 const {m,p,view,own}=setup(),sale=new SaleConfirmation(),gate=new MutationGate();const unit=p.units[0];
 applyAction(m,p.id,{type:'equip',unitId:unit.id,itemId:p.inventory[0].id},1);sale.arm(unit);assert.ok(sale.matches(unit));gate.start(view());
 const gold=p.gold;assert.equal(applyAction(m,p.id,{type:'sell',unitId:unit.id},1),null);gate.observe(view());assert.ok(!gate.busy);assert.equal(p.gold,gold+2);assert.equal(p.inventory[0].unitId,null);
 assert.ok(!sale.matches(p.units.find(u=>u.id===unit.id)));assert.equal(placementIntent(own(),unit.id,{kind:'bench',slot:10},true).action,null);
});
