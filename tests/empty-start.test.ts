import test from "node:test";
import assert from "node:assert/strict";
import { newMatch, newPlayer, prepare, applyAction, startCombat, botSetup } from "../shared/engine";
import { snapshotFor } from "../shared/snapshot";
import { STARTING_GOLD } from "../shared/shop";
import { grantItem } from "../shared/crafting";

test("새 플레이어는 유닛·장비 없이 시작하며 골드/레벨/상점은 유지", () => {
  for (const id of ["a", "b", "practice-bot"]) {
    const p=newPlayer(id,"새 플레이어");assert.deepEqual(p.units,[]);assert.deepEqual(p.inventory,[]);
    assert.equal(p.gold,STARTING_GOLD);assert.equal(p.level,1);assert.equal(p.health,100);
    assert.equal(p.shop.length,5);assert.ok(p.shop.every(o=>!o.sold));assert.equal(p.nextUnitId,0);assert.equal(p.nextItemId,0);
  }
});
test("일반 대전 준비/본인 전송/상대 전송에도 초기 지급이 생기지 않음", () => {
  const m=newMatch();m.players=[newPlayer("a","A"),newPlayer("b","B")];prepare(m,0);
  for(const id of ["a","b"])for(const p of snapshotFor(m,id,1,"room").players){assert.deepEqual(p.units,[]);assert.deepEqual(p.inventory,[]);}
});
test("첫 구매는 대기석으로만 들어가고 직접 배치 후 전투 참여, 장비 획득도 정상", () => {
  const m=newMatch();m.players=[newPlayer("a","A"),newPlayer("b","B")];prepare(m,0);const p=m.players[0],offer=p.shop[0];
  assert.equal(applyAction(m,p.id,{type:"buy",offerId:offer.id,revision:p.shopRevision},1),null);
  assert.equal(p.gold,STARTING_GOLD-offer.cost);assert.equal(p.units.length,1);const u=p.units[0];
  assert.equal(u.x,-1);assert.equal(u.benchSlot,0);assert.equal(u.id,"a-0");assert.deepEqual(p.inventory,[]);
  assert.equal(applyAction(m,p.id,{type:"place",unitId:u.id,x:2,y:1},2),null);
  const item=grantItem(p,"blade");assert.equal(item.id,"a-item-0");assert.equal(applyAction(m,p.id,{type:"equip",itemId:item.id,unitId:u.id},3),null);
  startCombat(m,4);assert.equal(m.fighters.length,1);assert.equal(m.fighters[0].id,u.id);
});
test("연습 상대는 무료 지급 없이 골드로 출전 유닛을 구매하고 장비는 없음", () => {
  const bot=newPlayer("practice-bot","연습 상대"),gold=bot.gold;botSetup(bot);
  assert.equal(bot.units.length,1);assert.ok(bot.units[0].x>=0);assert.equal(bot.gold,gold-bot.shop.find(o=>o.sold)!.cost);assert.deepEqual(bot.inventory,[]);
  const m=newMatch();m.players=[newPlayer("a","A"),bot];prepare(m,0);assert.deepEqual(m.players[0].units,[]);assert.deepEqual(m.players[0].inventory,[]);
});
