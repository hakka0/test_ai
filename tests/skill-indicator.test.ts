import test from "node:test";
import assert from "node:assert/strict";
import { skillIndicator } from "../client/skill-indicator";
const state = (id: string, cost: number, active = false) => ({ id, cost, active });

test("skill readiness follows actual cost, filters unknown/passive skills and clamps overshoot", () => {
  assert.equal(skillIndicator([state("nova", 64)], 0, false).visible, false);
  const ready = skillIndicator([state("nova", 75), state("starWard", 999, true), state("unknown", 999, true)], 0, false);
  assert.equal(ready.charge, 0.75); assert.equal(ready.visible, true); assert.equal(ready.active, false);
  assert.equal(skillIndicator([state("nova", 500)], 0, false).charge, 1);
  assert.equal(skillIndicator([state("nova", -5)], 0, false).charge, 0);
});

test("sustained skill state is authoritative even at zero cost and disappears when ended", () => {
  const active = skillIndicator([state("guardian", 0, true)], 500, false);
  assert.equal(active.active, true); assert.equal(active.visible, true);
  const ended = skillIndicator([state("guardian", 0)], 510, false);
  assert.equal(ended.active, false); assert.equal(ended.visible, false);
  const waiting = skillIndicator([state("nova", 100)], 99999, false);
  assert.equal(waiting.visible, true); assert.equal(waiting.active, false, "full cost does not predict a cast");
  assert.equal(skillIndicator([], 510, false).visible, false);
});

test("reduced motion preserves skill state while stopping rotation and pulsation", () => {
  const states = [state("guardian", 50, true)];
  assert.notEqual(skillIndicator(states, 0, false).rotation, skillIndicator(states, 1000, false).rotation);
  const first = skillIndicator(states, 0, true), later = skillIndicator(states, 1000, true);
  assert.deepEqual(first, later); assert.equal(first.active, true); assert.equal(first.rotation, 0);
});
