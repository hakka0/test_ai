import {newTestPlayer as newPlayer} from "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import {newMatch, prepare, applyAction, startCombat, tick, botSetup} from "../shared/engine";
import { COLS, MAX_ROUNDS } from "../shared/model";
import { statsFor } from "../shared/catalog";
function setup() {
  const m = newMatch();
  m.players = [newPlayer("A", "가"), newPlayer("B", "나")];
  m.players.forEach(p => p.level = 3);
  prepare(m, 1000);
  return m;
}
test("소유권·범위·마감 시각 검증", () => {
  const m = setup(),
    u = m.players[0].units[1];
  assert.ok(
    applyAction(m, "B", { type: "place", unitId: u.id, x: 0, y: 0 }, 1001),
  );
  for (const x of [NaN, Infinity, 1.5, -1, COLS])
    assert.ok(
      applyAction(m, "A", { type: "place", unitId: u.id, x, y: 0 }, 1001),
    );
  assert.ok(
    applyAction(m, "A", { type: "place", unitId: u.id, x: 1, y: 4 }, 1001),
  );
  assert.equal(
    applyAction(m, "A", { type: "place", unitId: u.id, x: 1, y: 1 }, 1001),
    null,
  );
  assert.ok(applyAction(m, "A", { type: "bench", unitId: u.id }, m.deadline));
  assert.equal(u.x, 1);
});
test("장비 슬롯·이동·해제·타인 장비 검증과 기본 능력치 보존", () => {
  const m = setup(),
    p = m.players[0],
    u = p.units[0];
  for (const i of [0, 1])
    assert.equal(
      applyAction(
        m,
        "A",
        { type: "equip", itemId: p.inventory[i].id, unitId: u.id },
        1001,
      ),
      null,
    );
  assert.ok(
    applyAction(
      m,
      "A",
      { type: "equip", itemId: p.inventory[2].id, unitId: u.id },
      1001,
    ),
  );
  assert.equal(statsFor(u, p.inventory).hp, 385);
  assert.equal(statsFor(u, p.inventory).attack, 32);
  assert.ok(
    applyAction(
      m,
      "B",
      {
        type: "equip",
        itemId: p.inventory[0].id,
        unitId: m.players[1].units[0].id,
      },
      1001,
    ),
  );
  assert.equal(
    applyAction(
      m,
      "A",
      { type: "equip", itemId: p.inventory[0].id, unitId: p.units[1].id },
      1001,
    ),
    null,
  );
  assert.equal(statsFor(u, p.inventory).attack, 24);
  assert.equal(
    applyAction(m, "A", { type: "unequip", itemId: p.inventory[1].id }, 1001),
    null,
  );
  assert.equal(statsFor(u, p.inventory).hp, 325);
});
test("준비 완료 후 수정 거부, 양쪽 완료 시 5초 매칭 후 전투", () => {
  const m = setup();
  assert.equal(applyAction(m, "A", { type: "ready" }, 1001), null);
  assert.ok(
    applyAction(
      m,
      "A",
      { type: "bench", unitId: m.players[0].units[0].id },
      1002,
    ),
  );
  assert.equal(m.phase, "prepare");
  assert.equal(applyAction(m, "B", { type: "ready" }, 1002), null);
  assert.equal(m.phase, "matching");assert.equal(m.deadline,6002);tick(m,6001);assert.equal(m.phase,'matching');tick(m,6002);
  assert.equal(m.phase, "combat");
});
test("장비 전투 시작 훅과 양측 좌표 변환", () => {
  const m = setup(),
    p = m.players[0];
  applyAction(
    m,
    "A",
    { type: "equip", unitId: p.units[0].id, itemId: p.inventory[2].id },
    1001,
  );
  startCombat(m, 2000);
  assert.equal(m.fighters[0].shield, 35);
  assert.equal(m.fighters[0].y, 6);
  assert.equal(m.fighters[1].y, 1);
  assert.equal(m.fighters[1].x, COLS - 1 - m.players[1].units[0].x);
});
test("자동전투에서 이동·공격·승패 및 다음 라운드 체력 복구", () => {
  const m = setup();
  m.players.forEach(p=>botSetup(p,m.players));
  startCombat(m, 2000);
  for (let t = 2100; t < 42000 && m.phase === "combat"; t += 100) {
    tick(m, t);
    const alive = m.fighters.filter((f) => f.hp > 0);
    assert.equal(new Set(alive.map((f) => `${f.x},${f.y}`)).size, alive.length);
  }
  assert.equal(m.phase, "result");
  assert.ok(m.eventId > 0);
  tick(m, m.deadline);
  assert.equal(m.phase, "prepare");
  assert.equal(m.round, 2);
  startCombat(m, 50000);
  assert.ok(m.fighters.every((f) => f.hp === f.maxHp));
});
test("빈 전장 무승부에서도 체력이 감소하여 경기 종료", () => {
  const m = setup();
  m.players.forEach((p) =>
    p.units.forEach((u) => {
      u.x = -1;
      u.y = -1;
    }),
  );
  for (let i = 0; i < MAX_ROUNDS && m.phase !== "finished"; i++) {
    tick(m, m.deadline);
    assert.equal(m.phase,'matching');tick(m,m.deadline);
    assert.equal(m.phase, "result");
    tick(m, m.deadline);
  }
  assert.equal(m.phase, "finished");
  assert.equal(m.winner, null);
  assert.ok(m.players.every(p => p.health === 0));
});
