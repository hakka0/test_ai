import test from "node:test";
import assert from "node:assert/strict";
import { HealthTrail, HEALTH_TRAIL_HOLD } from "../client/health-trail";

test("HP changes immediately while damage residue holds briefly then catches up", () => {
  const trail = new HealthTrail(); trail.update("a", 100, 100, 0, false);
  assert.deepEqual(trail.update("a", 60, 100, 10, false), { current: 0.6, trail: 1 });
  assert.equal(trail.update("a", 60, 100, 10 + HEALTH_TRAIL_HOLD - 1, false).trail, 1);
  const chasing = trail.update("a", 60, 100, 300, false);
  assert.ok(chasing.trail > chasing.current && chasing.trail < 1);
  assert.deepEqual(trail.update("a", 60, 100, 1500, false), { current: 0.6, trail: 0.6 });
});

test("residue follows elapsed time equally at different frame rates", () => {
  function sample(step: number) {
    const trail = new HealthTrail(); trail.update("a", 100, 100, 0, false); trail.update("a", 40, 100, 10, false);
    for (let now = 10 + step; now < 510; now += step) trail.update("a", 40, 100, now, false);
    return trail.update("a", 40, 100, 510, false).trail;
  }
  assert.ok(Math.abs(sample(16) - sample(100)) < 0.000001);
});

test("consecutive hits preserve the earlier residue and restart only its short hold", () => {
  const trail = new HealthTrail(); trail.update("a", 100, 100, 0, false);
  trail.update("a", 80, 100, 10, false);
  assert.deepEqual(trail.update("a", 50, 100, 100, false), { current: 0.5, trail: 1 });
  assert.equal(trail.update("a", 50, 100, 250, false).trail, 1);
  assert.ok(trail.update("a", 50, 100, 300, false).trail < 1);
  assert.equal(trail.update("a", 50, 100, 1500, false).trail, 0.5);
});

test("healing, a new maximum and a new unit do not show stale damage", () => {
  const trail = new HealthTrail(); trail.update("a", 100, 100, 0, false); trail.update("a", 40, 100, 10, false);
  assert.deepEqual(trail.update("a", 70, 100, 20, false), { current: 0.7, trail: 0.7 });
  assert.deepEqual(trail.update("a", 70, 200, 30, false), { current: 0.35, trail: 0.35 });
  trail.remove("a"); assert.deepEqual(trail.update("a", 20, 100, 40, false), { current: 0.2, trail: 0.2 });
  trail.clear(); assert.deepEqual(trail.update("a", 80, 100, 50, false), { current: 0.8, trail: 0.8 });
});

test("reduced motion settles immediately and old residue never resumes", () => {
  const trail = new HealthTrail(); trail.update("a", 100, 100, 0, false); trail.update("a", 40, 100, 10, false);
  assert.deepEqual(trail.update("a", 40, 100, 20, true), { current: 0.4, trail: 0.4 });
  assert.deepEqual(trail.update("a", 40, 100, 30, false), { current: 0.4, trail: 0.4 });
});
