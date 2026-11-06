import {newTestPlayer as newPlayer} from "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import {newMatch, prepare, startCombat, applyAction, tick} from "../shared/engine";
import { snapshotFor } from "../shared/snapshot";
import { statsFor } from "../shared/catalog";
import { EXPERIENCE_BUY_COST } from "../shared/progression";
import { MutationGate } from "../client/interaction";
import type { Action, Phase } from "../shared/model";

function setup() {
  const m = newMatch(); m.players = [newPlayer("a", "A"), newPlayer("b", "B")];
  prepare(m, 0); return {m, p:m.players[0]};
}

test("경험치·장비 장착/해제는 준비 완료 전/전투/결과에만 허용, 마감·대기·종료는 무변경 거부", () => {
  for (const phase of ["waiting", "prepare", "matching", "combat", "result", "finished"] as Phase[])
    for (const ready of [false, true]) for (const now of [1, 100])
      for (const type of ["buyExperience", "equip", "unequip"] as const) {
        const {m,p}=setup(), item=p.inventory[0], u=p.units[0];
        if (type === "unequip") assert.equal(applyAction(m,p.id,{type:"equip",itemId:item.id,unitId:u.id},1),null);
        m.phase=phase; m.deadline=100; p.ready=ready;
        const action:Action = type === "buyExperience" ? {type,revision:p.experienceRevision}
          : type === "equip" ? {type,itemId:item.id,unitId:u.id} : {type,itemId:item.id};
        const before=structuredClone(m), allowed=now<100&&(phase==="combat"||phase==="result"||phase==="prepare"&&!ready||type==="buyExperience"&&phase==="matching");
        assert.equal(applyAction(m,p.id,action,now)===null,allowed,`${phase}/${ready}/${now}/${type}`);
        if(!allowed)assert.deepEqual(m,before);
      }
});

test("전투·결과 경험치 결제와 중복 요청 차단, 레벨 상승으로 현재 출전 인원은 늘지 않음", () => {
  for (const phase of ["combat","result"] as const) {
    const {m,p}=setup(); p.ready=true;startCombat(m,10);m.phase=phase;
    const fighters=structuredClone(m.fighters),interest=p.roundInterest,gold=p.gold;
    const action={type:"buyExperience",revision:p.experienceRevision};
    assert.equal(applyAction(m,p.id,action,11),null);assert.equal(p.gold,gold-EXPERIENCE_BUY_COST);
    assert.equal(p.level,3);assert.equal(p.experience,0);
    const after=structuredClone(m);assert.ok(applyAction(m,p.id,action,11));assert.deepEqual(m,after);
    assert.ok(applyAction(m,p.id,{type:"place",unitId:p.units[1].id,x:0,y:0},11));assert.deepEqual(m.fighters,fighters);
    assert.equal(p.roundInterest,interest);
  }
});

test("전투·결과에서도 골드 부족·최대 레벨·타인 유닛/장비·재료·2개 한도를 검증", () => {
  for(const phase of ["combat","result"] as const) {
    const {m,p}=setup();startCombat(m,10);m.phase=phase;p.gold=0;
    const before=structuredClone(m);assert.ok(applyAction(m,p.id,{type:"buyExperience",revision:p.experienceRevision},11));assert.deepEqual(m,before);
    p.gold=100;p.level=10;const max=structuredClone(m);assert.ok(applyAction(m,p.id,{type:"buyExperience",revision:p.experienceRevision},11));assert.deepEqual(m,max);
    for(const i of p.inventory.slice(0,2))assert.equal(applyAction(m,p.id,{type:"equip",itemId:i.id,unitId:p.units[0].id},11),null);
    p.inventory.push({id:"material",definition:"iron",unitId:null});const full=structuredClone(m);
    for(const a of [{type:"equip",itemId:p.inventory[2].id,unitId:p.units[0].id},{type:"equip",itemId:"material",unitId:p.units[1].id},
      {type:"equip",itemId:p.inventory[2].id,unitId:m.players[1].units[0].id},{type:"equip",itemId:m.players[1].inventory[0].id,unitId:p.units[1].id}] as Action[]) {
      assert.ok(applyAction(m,p.id,a,11));assert.deepEqual(m,full);
    }
  }
});

test("전투 중 장착·해제·대기석 이동은 전투 수치/훅/결과를 유지하고 다음 전투에 반영", () => {
  const {m,p}=setup(),u=p.units[0],reserve=p.units[1],charm=p.inventory[2],armor=p.inventory[1];
  assert.equal(applyAction(m,p.id,{type:"equip",itemId:charm.id,unitId:u.id},1),null);
  startCombat(m,10);const original=structuredClone(m),fighters=structuredClone(m.fighters);
  assert.equal(applyAction(m,p.id,{type:"equip",itemId:armor.id,unitId:u.id},11),null);
  assert.equal(applyAction(m,p.id,{type:"unequip",itemId:charm.id},11),null);
  assert.equal(applyAction(m,p.id,{type:"equip",itemId:charm.id,unitId:reserve.id},11),null);
  assert.deepEqual(m.fighters,fighters);
  const publicView=snapshotFor(m,"b",12,"room");
  const publicPlayer=publicView.players[0];assert.ok(publicPlayer.visibility==='opponent'&&publicPlayer.bench.some(unit=>unit.id===reserve.id));
  assert.ok(publicPlayer.inventory.some(i=>i.id===charm.id&&i.unitId===reserve.id),'public worn equipment identifies its current reserve wearer');
  for(const now of [1010,4010,40010]){tick(m,now);tick(original,now);assert.deepEqual(m.fighters,original.fighters);assert.deepEqual(m.events,original.events);}
  assert.equal(m.winner,original.winner);assert.deepEqual(m.roundHistory,original.roundHistory);
  prepare(m,50000);startCombat(m,50001);
  const next=m.fighters.find(f=>f.id===u.id)!;assert.deepEqual(next.equipment,[armor.id]);
  assert.equal(next.maxHp,statsFor(u,p.inventory).hp);assert.equal(next.shield,0);
});

test("결과에서 경험치·상점 구매·장비 변경 후 응답 대기 해제와 다음 라운드 데이터 유지", () => {
  const {m,p}=setup();startCombat(m,10);m.phase="result";p.gold=50;
  const view=()=>snapshotFor(m,p.id,11,"room"),gate=new MutationGate();
  const actions:Action[]=[{type:"buyExperience",revision:p.experienceRevision},{type:"buy",offerId:p.shop[0].id,revision:p.shopRevision},
    {type:"equip",itemId:p.inventory[0].id,unitId:p.units[1].id}];
  for(const a of actions){assert.ok(gate.start(view()));gate.observe(view());assert.ok(gate.busy);assert.equal(applyAction(m,p.id,a,11),null);gate.observe(view());assert.equal(gate.busy,false);}
  const unit=p.units[1],equipment=[...unit.equipment],shop=structuredClone(p.shop),level=p.level;
  prepare(m,50000);assert.equal(p.level>=level,true);assert.deepEqual(unit.equipment,equipment);assert.ok(p.shop.every(o=>!shop.some(old=>old.id===o.id)));
});
