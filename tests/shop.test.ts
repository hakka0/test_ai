import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, applyAction, startCombat, tick} from "../shared/engine";
import {MAX_ROUNDS} from '../shared/model';
import {WIN_GOLD} from '../shared/match-rules';
import { SHOP_SIZE, STARTING_GOLD, ROUND_INCOME, REROLL_COST, refreshShop } from '../shared/shop';
function setup() { const m = newMatch(); m.players = [newPlayer('a','A'),newPlayer('b','B')]; m.players.forEach(p=>p.level=3);prepare(m,0); return {m,p:m.players[0]}; }
test('상점은 5칸, 중복 허용, 서버 난수로 전체 교체',()=>{const {p}=setup(); assert.equal(p.shop.length,SHOP_SIZE); assert.equal(p.gold,STARTING_GOLD); const ids=p.shop.map(o=>o.id); refreshShop(p,()=>0); assert.ok(p.shop.every(o=>o.kind==='knight')); assert.ok(p.shop.every(o=>!ids.includes(o.id))); refreshShop(p,()=>0.999); assert.ok(p.shop.every(o=>o.kind==='technomancer'));});
test('구매는 대기석 추가·구매 완료 표시·고유 ID·중복 요청 거부',()=>{const {m,p}=setup();Object.assign(p.shop[0],{kind:'knight',cost:1});Object.assign(p.shop[1],{kind:'ranger',cost:2});const before=structuredClone(p.shop);const action={type:'buy',offerId:p.shop[0].id,revision:p.shopRevision};assert.equal(applyAction(m,p.id,action,1),null);assert.equal(p.gold,STARTING_GOLD-before[0].cost);assert.equal(p.units.length,4);assert.equal(p.units[3].kind,before[0].kind);assert.equal(p.units[3].x,-1);assert.equal(p.shop[0].sold,true);assert.equal(p.shop[0].id,before[0].id);assert.deepEqual(p.shop.slice(1),before.slice(1));assert.equal(p.shop.length,5);assert.ok(applyAction(m,p.id,action,2));assert.equal(p.gold,STARTING_GOLD-before[0].cost);assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[1].id,revision:p.shopRevision},3),null);assert.equal(new Set(p.units.map(u=>u.id)).size,5);});
test('리롤 비용과 오래된 요청, 다른 플레이어 상품 및 부족한 골드 검증',()=>{const {m,p}=setup();const other=structuredClone(m.players[1]);const old=structuredClone(p.shop);const revision=p.shopRevision;assert.equal(applyAction(m,p.id,{type:'reroll',revision},1),null);assert.equal(p.gold,STARTING_GOLD-REROLL_COST);assert.ok(p.shop.every(o=>!old.some(v=>v.id===o.id)));assert.deepEqual(m.players[1],other);assert.ok(applyAction(m,p.id,{type:'reroll',revision},2));assert.ok(applyAction(m,p.id,{type:'buy',offerId:other.shop[0].id,revision:p.shopRevision},3));p.gold=0;const saved=structuredClone(p);assert.ok(applyAction(m,p.id,{type:'reroll',revision:p.shopRevision},4));assert.ok(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},5));assert.deepEqual(p,saved);});
test('준비 완료·마감 상점 거래 거부, 다음 라운드 수입',()=>{const {m,p}=setup();const action={type:'reroll',revision:p.shopRevision};p.ready=true;assert.ok(applyAction(m,p.id,action,1));p.ready=false;assert.ok(applyAction(m,p.id,action,m.deadline));startCombat(m,2);const shop=structuredClone(p.shop);prepare(m,100);assert.equal(p.gold,STARTING_GOLD+ROUND_INCOME+1);assert.ok(p.shop.every(o=>!shop.some(old=>old.id===o.id)));});
test('구매 유닛 배치 후 기존 스킬·장비 시스템 참여',()=>{const {m,p}=setup();assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},1),null);const u=p.units[3];assert.equal(applyAction(m,p.id,{type:'place',unitId:u.id,x:0,y:0},2),null);assert.equal(applyAction(m,p.id,{type:'equip',unitId:u.id,itemId:p.inventory[0].id},3),null);startCombat(m,4);const f=m.fighters.find(f=>f.id===u.id)!;assert.equal(f.skills.length,2);assert.equal(f.equipment.length,1);});

test('무료 리롤 회귀: 구매 후 판매해도 상품·추첨 ID가 바뀌지 않으며 다시 살 수 없다',()=>{
 const {m,p}=setup();refreshShop(p,()=>0);const old=structuredClone(p.shop);const gold=p.gold, next=p.nextOfferId;
 assert.equal(applyAction(m,p.id,{type:'buy',offerId:old[0].id,revision:p.shopRevision},1),null);
 const unit=p.units.at(-1)!;
 assert.equal(applyAction(m,p.id,{type:'sell',unitId:unit.id},2),null);
 assert.equal(p.gold,gold);assert.equal(p.nextOfferId,next);assert.equal(p.shop[0].id,old[0].id);assert.equal(p.shop[0].sold,true);
 const before=structuredClone(p);
 assert.ok(applyAction(m,p.id,{type:'buy',offerId:old[0].id,revision:p.shopRevision},3));assert.deepEqual(p,before);
 p.gold=4;const insufficient=structuredClone(p);assert.ok(applyAction(m,p.id,{type:'reroll',revision:p.shopRevision},4));assert.deepEqual(p,insufficient);
 p.gold=5;assert.equal(applyAction(m,p.id,{type:'reroll',revision:p.shopRevision},5),null);assert.equal(p.gold,0);
 assert.ok(p.shop.every(o=>!o.sold&&!old.some(v=>v.id===o.id)));
});

test('결과에서는 상품과 구매 상태 유지, 다음 준비 진입 때 양쪽 상점 무료 1회 갱신',()=>{
 const {m,p}=setup();m.players.forEach(player=>{player.gold=0;player.shop[0].sold=true;});
 const before=m.players.map(player=>({gold:player.gold,revision:player.shopRevision,next:player.nextOfferId,shop:structuredClone(player.shop)}));
 startCombat(m,10);m.fighters.filter(f=>f.owner!==p.id).forEach(f=>f.hp=0);tick(m,110);
 assert.equal(m.phase,'result');
 for(const [i,player] of m.players.entries()){
  assert.equal(player.gold,before[i].gold+(player.id===m.winner?WIN_GOLD:0));
  assert.equal(player.shopRevision,before[i].revision);assert.equal(player.nextOfferId,before[i].next);
  assert.deepEqual(player.shop,before[i].shop);
 }
 const shops=m.players.map(player=>structuredClone(player.shop)),revisions=m.players.map(player=>player.shopRevision);
 tick(m,111);tick(m,m.deadline-1);assert.deepEqual(m.players.map(player=>player.shop),shops);assert.deepEqual(m.players.map(player=>player.shopRevision),revisions);
 const gold=m.players.map(player=>player.gold);tick(m,m.deadline);assert.equal(m.phase,'prepare');assert.equal(m.round,2);
 for(const [i,player]of m.players.entries()){
  assert.equal(player.shopRevision,before[i].revision+1);assert.equal(player.nextOfferId,before[i].next+SHOP_SIZE);
  assert.equal(player.shop.length,SHOP_SIZE);assert.ok(player.shop.every(o=>!o.sold&&!before[i].shop.some(old=>old.id===o.id)));
  assert.equal(player.gold,gold[i]+player.lastIncome.total);
 }
 const refreshed=m.players.map(player=>structuredClone(player.shop));tick(m,m.deadline-1);
 assert.deepEqual(m.players.map(player=>player.shop),refreshed);assert.ok(m.players.every((player,i)=>player.shopRevision===revisions[i]+1));
});

test('결과에서도 기존 상품 구매 가능, 준비 진입 갱신 후 이전 요청 거부·보유 유닛 유지',()=>{
 const {m,p}=setup();const old={type:'buy',offerId:p.shop[0].id,revision:p.shopRevision};
 startCombat(m,10);m.fighters.filter(f=>f.owner!==p.id).forEach(f=>f.hp=0);tick(m,110);
 assert.equal(m.phase,'result');const offer=p.shop[0],gold=p.gold;
 assert.equal(applyAction(m,p.id,old,111),null);
 assert.equal(p.gold,gold-offer.cost);assert.equal(offer.sold,true);
 const stale={type:'buy',offerId:p.shop[1].id,revision:p.shopRevision},units=structuredClone(p.units);
 tick(m,m.deadline);assert.equal(m.phase,'prepare');assert.deepEqual(p.units,units);const before=structuredClone(p);
 assert.ok(applyAction(m,p.id,stale,m.deadline-1));assert.deepEqual(p,before);
 assert.ok(applyAction(m,p.id,{...stale,revision:p.shopRevision},m.deadline-1));assert.deepEqual(p,before);
 const fresh=p.shop[0];assert.equal(applyAction(m,p.id,{type:'buy',offerId:fresh.id,revision:p.shopRevision},m.deadline-1),null);assert.equal(fresh.sold,true);
});

test('시간 초과 뒤 다음 준비에서 갱신, 최종 라운드는 준비가 없어 갱신하지 않음',()=>{
 for(const terminal of [false,true]){
  const {m}=setup();if(terminal)m.round=MAX_ROUNDS;
  m.players.forEach(player=>{player.gold=0;if(terminal)player.units=[];});
  const revision=m.players.map(player=>player.shopRevision);
  startCombat(m,10);if(!terminal){m.lastTick=m.deadline;tick(m,m.deadline);}assert.equal(m.phase,'result');
  assert.ok(m.players.every((player,i)=>player.gold===0&&player.shopRevision===revision[i]));
  if(!terminal)assert.equal(m.roundHistory[0].reason,'timeout');
  const shops=m.players.map(player=>structuredClone(player.shop));tick(m,m.deadline);
  assert.equal(m.phase,terminal?'finished':'prepare');
  if(terminal)assert.deepEqual(m.players.map(player=>player.shop),shops);
  assert.ok(m.players.every((player,i)=>player.shopRevision===revision[i]+(terminal?0:1)));
 }
});

test('첫 준비는 최초 상품 유지, 결과에서 수동 리롤은 비용 차감 후 준비에서 무료 갱신',()=>{
 const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];
 const initial=m.players.map(p=>({shop:structuredClone(p.shop),revision:p.shopRevision,next:p.nextOfferId}));prepare(m,0);
 for(const [i,p]of m.players.entries()){assert.deepEqual(p.shop,initial[i].shop);assert.equal(p.shopRevision,initial[i].revision);assert.equal(p.nextOfferId,initial[i].next);}
 const p=m.players[0];p.gold=20;startCombat(m,10);m.fighters.filter(f=>f.owner!==p.id).forEach(f=>f.hp=0);tick(m,110);
 const gold=p.gold;assert.equal(applyAction(m,p.id,{type:'reroll',revision:p.shopRevision},111),null);assert.equal(p.gold,gold-REROLL_COST);
 const paid=structuredClone(p.shop),revision=p.shopRevision;tick(m,m.deadline-1);assert.deepEqual(p.shop,paid);
 tick(m,m.deadline);assert.equal(p.shopRevision,revision+1);assert.ok(p.shop.every(o=>!paid.some(old=>old.id===o.id)));
 assert.equal(p.gold,gold-REROLL_COST+p.lastIncome.total);
});

test('체력 소진으로 경기 종료 시 결과와 최종 종료 모두 상점 유지',()=>{
 const {m,p}=setup();m.players[1].health=1;const shops=m.players.map(p=>structuredClone(p.shop)),revisions=m.players.map(p=>p.shopRevision);
 startCombat(m,10);m.fighters.filter(f=>f.owner!==p.id).forEach(f=>f.hp=0);tick(m,110);assert.equal(m.players[1].health,0);
 tick(m,m.deadline);assert.equal(m.phase,'finished');assert.deepEqual(m.players.map(p=>p.shop),shops);assert.deepEqual(m.players.map(p=>p.shopRevision),revisions);
});
