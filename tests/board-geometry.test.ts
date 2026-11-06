import test from "node:test";
import assert from "node:assert/strict";
import { COLS, ROWS, type SelfPlayerSnapshot } from "../shared/model";
import { newMatch, prepare, applyAction, startCombat, tick } from "../shared/engine";
import { newTestPlayer } from "./fixtures";
import { snapshotFor } from "../shared/snapshot";
import { placementIntent } from "../client/interaction";
import { WIDTH, HEIGHT, MARGIN, CELL, preparationPosition, displayPosition } from "../client/board-geometry";

test("four rows per side: both players can place and swap on every friendly row", () => {
  assert.equal(COLS, 8); assert.equal(ROWS, 8);
  const m = newMatch(); m.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")]; prepare(m, 0);
  for (const p of m.players) {
    p.level = 3;
    const unit = p.units[1];
    for (let y = ROWS / 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const own = snapshotFor(m, p.id, 1, "rows").players.find(p => p.visibility === "self") as SelfPlayerSnapshot;
      const intent = placementIntent(own, unit.id, {kind:"cell", x, y}, true);
      assert.ok(intent.valid); if (intent.action) assert.equal(applyAction(m, p.id, intent.action, 1), null);
      assert.deepEqual([unit.x, unit.y], [x, ROWS - 1 - y]);
      const side = m.players.indexOf(p), world = preparationPosition(side, unit.x, unit.y);
      assert.deepEqual(displayPosition(side === 1, world.x, world.y), {x, y});
    }
    const own = snapshotFor(m, p.id, 1, "rows").players.find(p => p.visibility === "self") as SelfPlayerSnapshot;
    for (const y of [-1,0,1,2,3,8,9,NaN,1.5]) assert.equal(placementIntent(own, unit.id, {kind:"cell", x:0, y}, true).valid, false);
    for (const y of [-1,4,8,NaN,1.5]) assert.ok(applyAction(m, p.id, {type:"place", unitId:unit.id, x:0, y}, 1));
  }
});

test("square eight-by-eight rendering matches combat positions and square hit targets", () => {
  assert.equal(WIDTH, HEIGHT);
  assert.equal(WIDTH - MARGIN * 2, COLS * CELL);
  assert.equal(HEIGHT - MARGIN * 2, ROWS * CELL);
  const m = newMatch(); m.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")]; prepare(m, 0);
  for (const p of m.players) { p.units[0].x = 7; p.units[0].y = 3; }
  const before = m.players.map((p,i) => preparationPosition(i,p.units[0].x,p.units[0].y));
  startCombat(m, 1);
  assert.deepEqual(m.fighters.map(f => ({x:f.x,y:f.y})), before);
  assert.deepEqual(before, [{x:7,y:4},{x:0,y:3}]);
  for(let t=101;t<40001&&m.phase==="combat";t+=100) {
    tick(m,t);const alive=m.fighters.filter(f=>f.hp>0);
    assert.ok(alive.every(f=>f.x>=0&&f.x<COLS&&f.y>=0&&f.y<ROWS));
    assert.equal(new Set(alive.map(f=>`${f.x},${f.y}`)).size,alive.length);
  }
  assert.equal(m.phase,"result");
});
