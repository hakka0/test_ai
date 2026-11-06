import {newTestPlayer as newPlayer} from "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import {newMatch, prepare, startCombat} from "../shared/engine";
import type { Phase, SelfPlayerSnapshot } from "../shared/model";
import { snapshotFor } from "../shared/snapshot";

function setup() {
  const m = newMatch("practice");
  m.players = [newPlayer("a", "A"), newPlayer("b", "B")];
  prepare(m, 1000);
  const p = m.players[1], deployed = p.units[0], reserve = p.units[1];
  reserve.id = "PUBLIC_RESERVE";
  p.inventory = [
    {id: "public-item", definition: "blade", unitId: deployed.id},
    {id: "PUBLIC_BENCH_ITEM", definition: "armor", unitId: reserve.id},
    {id: "SECRET_UNUSED_ITEM", definition: "charm", unitId: null},
  ];
  deployed.equipment = [p.inventory[0].id];
  reserve.equipment = [p.inventory[1].id];
  p.shop[0].id = "SECRET_OFFER";
  return {m, p, deployed, reserve};
}

test("관전 대기석과 착용 장비는 공개, 상점·경제·보관 장비와 내부 정보는 본인에게만", () => {
  const {m, p, deployed} = setup();
  const a = snapshotFor(m, "a", 1001, "room");
  const b = snapshotFor(m, "b", 1001, "room");
  const publicB = a.players[1], privateB = b.players[1] as SelfPlayerSnapshot;
  assert.equal(publicB.visibility, "opponent");
  assert.equal(privateB.visibility, "self");
  assert.deepEqual(privateB.units, p.units);
  assert.deepEqual(privateB.shop, p.shop);
  assert.deepEqual(privateB.inventory, p.inventory);
  for (const key of ["gold", "experience", "experienceRevision", "shop", "shopRevision", "nextOfferId", "nextUnitId", "roundInterest", "streak", "streakCount", "lastIncome"])
    assert.ok(!(key in publicB), key);
  assert.ok(!("nextOfferId" in privateB) && !("nextUnitId" in privateB));
  assert.deepEqual(publicB.units.map(u => u.id), [deployed.id]);
  assert.ok(!("benchSlot" in publicB.units[0]));
  assert.ok(publicB.visibility==='opponent');
  assert.deepEqual(publicB.bench,p.units.filter(u=>u.x<0));
  assert.deepEqual(publicB.inventory, [p.inventory[0],p.inventory[1]]);
  assert.ok(!JSON.stringify(a).includes("SECRET_"));
  assert.equal(a.players[0].visibility, "self");
  assert.equal(b.players[0].visibility, "opponent");
  assert.deepEqual(a.players.map(p => p.id), b.players.map(p => p.id));
});

test("모든 경기 단계에서 비공개 정보 차단, 양측 전투·시각 동일", () => {
  const {m} = setup();
  startCombat(m, 1100);
  for (const phase of ["waiting", "prepare", "matching", "combat", "result", "finished"] as Phase[]) {
    m.phase = phase;
    const a = snapshotFor(m, "a", 1200, "room"), b = snapshotFor(m, "b", 1200, "room");
    assert.ok(!JSON.stringify(a).includes("SECRET_"), phase);
    assert.deepEqual(a.fighters, b.fighters);
    assert.deepEqual(a.events, b.events);
    assert.equal(a.deadline, b.deadline);
    assert.equal(a.serverNow, b.serverNow);
    for (const f of a.fighters) {
      for (const key of ["nextAttack", "nextMove", "basicAttacks", "stats", "buffs", "benchSlot"])
        assert.ok(!(key in f), key);
      for (const s of f.skills)
        assert.deepEqual(Object.keys(s).sort(), ["id", "cost", "active", "cooldownUntil", "activations"].sort());
    }
    assert.ok(!("lastTick" in a) && !("combatStartedAt" in a));
  }
});

test("준비 단계에서 회수한 유닛은 공개 대기석으로 이동하고 해제한 보관 장비는 숨김", () => {
  const {m, p, deployed} = setup();
  p.inventory[0].unitId = null;
  deployed.equipment = [];
  assert.deepEqual(snapshotFor(m, "a", 1001, "room").players[1].inventory,[p.inventory[1]]);
  deployed.x = -1; deployed.y = -1; deployed.benchSlot = 2;
  const publicB = snapshotFor(m, "a", 1002, "room").players[1];
  assert.deepEqual(publicB.units, []);
  assert.ok(publicB.visibility==='opponent');assert.ok(publicB.bench.some(u=>u.id===deployed.id&&u.benchSlot===2));
  assert.deepEqual(publicB.inventory, [p.inventory[1]]);
});

test("전송 허용 목록: 향후 서버 필드도 자동으로 노출되지 않음", () => {
  const {m, p} = setup();
  startCombat(m, 1100);
  for (const object of [m, p, p.units[0], p.units[1], p.shop[0], p.inventory[0], m.fighters[0], m.fighters[0].skills[0]])
    Object.assign(object, {futurePrivateField: "SECRET_FUTURE"});
  m.events.push({id: 1, type: "attack", source: m.fighters[0].id, target: m.fighters[1].id, amount: 1});
  Object.assign(m.events[0], {futurePrivateField: "SECRET_FUTURE"});
  for (const viewer of ["a", "b"])
    assert.ok(!JSON.stringify(snapshotFor(m, viewer, 1200, "room")).includes("SECRET_FUTURE"));
});

test("전송 데이터 생성·수정이 서버 상태를 변경하지 않음", () => {
  const {m} = setup();
  startCombat(m, 1100);
  const before = structuredClone(m), s = snapshotFor(m, "b", 1200, "room");
  assert.deepEqual(m, before);
  const own = s.players[1] as SelfPlayerSnapshot;
  own.units[0].equipment.push("tamper");
  own.inventory[0].definition = "tamper";
  own.shop[0].cost = 999;
  s.fighters[0].skills[0].cost = 999;
  s.fighters[1].equipment.push("tamper");
  assert.deepEqual(m, before);
});

test("알 수 없는 접속 ID에는 모든 플레이어의 비공개 정보 차단", () => {
  const {m} = setup();
  const s = snapshotFor(m, "unknown", 1001, "room");
  assert.ok(s.players.every(p => p.visibility === "opponent"));
  assert.ok(!JSON.stringify(s).includes("SECRET_"));
});
