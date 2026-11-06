import {newTestPlayer as newPlayer} from "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import {newMatch, prepare, startCombat, applyAction} from "../shared/engine";
import { snapshotFor } from "../shared/snapshot";
import { unitInspection, inspectionSelection } from "../client/unit-inspection";

function setup() {
  const match = newMatch("practice");
  match.players = [newPlayer("a", "나"), newPlayer("b", "상대")];
  prepare(match, 0);
  return { match, view: () => snapshotFor(match, "a", 1, "room") };
}

test("일반 전투에서 전장만 선택, 관전 모드에서는 공개 대기석 상세도 조회", () => {
  const { match, view } = setup();
  const own = match.players[0].units[0], enemy = match.players[1].units[0];
  assert.equal(unitInspection(view(), own.id)?.own, true);
  assert.equal(unitInspection(view(), enemy.id)?.own, false);
  assert.equal(unitInspection(view(), enemy.id)?.player.name, "상대");
  assert.equal(unitInspection(view(), match.players[1].units[1].id), undefined);
  assert.equal(unitInspection(view(),match.players[1].units[1].id,true)?.own,false);
  assert.equal(unitInspection(null, enemy.id), undefined);
});

test("전투 종료·종료 직행·결과 누락 뒤 다음 라운드에서 상대만 선택 해제", () => {
  const { match, view } = setup();
  startCombat(match, 1);
  const combat = view(), own = match.players[0].units[0].id, enemy = match.players[1].units[0].id;
  for (const phase of ["result", "finished", "prepare"] as const) {
    const next = { ...combat, phase };
    assert.equal(inspectionSelection(combat, next, enemy), "");
    assert.equal(inspectionSelection(combat, next, own), own);
  }
  assert.equal(inspectionSelection(combat, { ...combat, round: combat.round + 1 }, enemy), "");
  assert.equal(inspectionSelection(combat, { ...combat, round: combat.round + 1 }, own), own);
});

test("선택은 반복 전송·준비→전투에서 유지하며 결과에서 재선택하면 다음 준비에 해제", () => {
  const { match, view } = setup();
  const prepareView = view(), enemy = match.players[1].units[0].id;
  startCombat(match, 1);
  const combat = view();
  assert.equal(inspectionSelection(prepareView, combat, enemy), enemy);
  assert.equal(inspectionSelection(combat, combat, enemy), enemy);
  const result = { ...combat, phase: "result" as const };
  assert.equal(inspectionSelection(result, result, enemy), enemy);
  assert.equal(inspectionSelection(result, { ...prepareView, round: result.round + 1 }, enemy), "");
});

test("상대 교체·유닛 회수·다른 방으로 이동하면 낡은 상대 선택 해제", () => {
  const { match, view } = setup();
  const before = view(), enemy = match.players[1].units[0];
  assert.equal(inspectionSelection(before, { ...before, roomId: "other-room" }, enemy.id), "");
  match.players[1].id = "replacement";
  assert.equal(inspectionSelection(before, view(), enemy.id), "");
  enemy.x = -1;
  assert.equal(inspectionSelection(before, view(), enemy.id), "");
});

test("전투 중 합성으로 원본이 사라져도 고정 전투 성급·장비 정보만 공개", () => {
  const { match, view } = setup();
  const p = match.players[1], enemy = p.units[0];
  const visible = p.inventory[0], hidden = p.inventory[1];
  enemy.equipment = [visible.id]; visible.unitId = enemy.id;
  startCombat(match, 1);
  const before = view();
  p.units = p.units.filter(u => u.id !== enemy.id);
  visible.unitId = null;
  const during = view(), inspection = unitInspection(during, enemy.id);
  assert.ok(inspection);
  assert.equal(inspection.own, false);
  assert.equal(inspection.unit.rank, enemy.rank);
  assert.deepEqual(inspection.unit.equipment, [visible.id]);
  assert.ok(inspection.player.inventory.some(i => i.id === visible.id));
  assert.ok(!inspection.player.inventory.some(i => i.id === hidden.id));
  assert.equal(inspectionSelection(before, during, enemy.id), enemy.id);
  match.fighters.find(f => f.id === enemy.id)!.hp = 0;
  assert.equal(inspectionSelection(during, view(), enemy.id), enemy.id);
  match.phase = "prepare";
  assert.ok(!view().players[1].inventory.some(i => i.id === visible.id));
  assert.equal(unitInspection(view(), enemy.id), undefined);
});

test('결과에서 판매한 내 전투 유닛은 양쪽 시점에서 상세·선택을 유지하고 다음 준비에 정리',()=>{
 const {match,view}=setup(),p=match.players[0],unit=p.units[0],item=p.inventory[0];
 assert.equal(applyAction(match,p.id,{type:'equip',unitId:unit.id,itemId:item.id},1),null);startCombat(match,10);match.phase='result';const before=view();
 assert.equal(applyAction(match,p.id,{type:'sell',unitId:unit.id},11),null);const during=view(),inspection=unitInspection(during,unit.id);
 assert.ok(inspection?.own&&inspection.fighter);assert.deepEqual(inspection.unit.equipment,[item.id]);assert.equal(inspectionSelection(before,during,unit.id),unit.id);
 assert.equal(unitInspection(during,unit.id,true)?.unit.id,unit.id);assert.ok(unitInspection(snapshotFor(match,'b',12,'room'),unit.id)?.player.inventory.some(i=>i.id===item.id));
 prepare(match,50000);assert.equal(unitInspection(view(),unit.id),undefined);assert.equal(inspectionSelection(during,view(),unit.id),'');
});
