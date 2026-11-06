import test from "node:test";
import assert from "node:assert/strict";
import { UnitMotion, DEATH_DURATION } from "../client/unit-motion";

const initial = { x: 100, y: 100, targetX: 100, targetY: 100, facing: 1, now: 0, delta: 16, reduced: false };
function setup() { const motion = new UnitMotion(); motion.update("unit", initial); return motion; }

test("aiming mirrors a unit without rotating its coordinates, including reduced motion", () => {
  const motion = setup();
  motion.update("unit", { ...initial, aim: { x: -80, y: -50 }, reduced: true });
  assert.equal(motion.pose("unit", 0, true).flipX, true);
  motion.update("unit", { ...initial, aim: { x: 80, y: -50 }, reduced: true });
  assert.equal(motion.pose("unit", 0, true).flipX, false);
  motion.update("unit", { ...initial, aim: { x: 0, y: -50 } });
  assert.equal(motion.pose("unit", 0, false).flipX, false, "vertical aim preserves facing");
});

test("firing kicks against the shot direction and recovers without accumulated drift", () => {
  const motion = setup();
  for (let i = 0; i < 30; i++) {
    motion.attack("unit", 80, 0, i * 250);
    assert.equal(motion.pose("unit", i * 250 + 28, false).x, -5);
    assert.equal(motion.pose("unit", i * 250 + 200, false).x, 0);
    assert.equal(motion.pose("unit", i * 250 + 200, false).scaleX, 1);
  }
  motion.attack("unit", -80, 0, 8000);
  assert.equal(motion.pose("unit", 8028, false).x, 5);
  assert.equal(motion.pose("unit", 8028, false).flipX, true);
});

test("incoming impacts push in the bullet direction and combine within a bounded offset", () => {
  const motion = setup();
  motion.hit("unit", 80, 0, 0);
  assert.equal(motion.pose("unit", 24, false).x, 7);
  motion.attack("unit", -80, 0, 0);
  assert.ok(motion.pose("unit", 28, false).x <= 10);
  assert.equal(motion.pose("unit", 250, false).x, 0);
  motion.hit("unit", -80, 0, 300);
  assert.equal(motion.pose("unit", 324, false).x, -7);
});

test("movement leans into travel, settles on stopping and returns to its base size", () => {
  const motion = setup();
  motion.update("unit", { ...initial, x: 120, targetX: 180, now: 16 });
  const moving = motion.pose("unit", 16, false);
  assert.equal(moving.moving, true); assert.ok(moving.angle > 0);
  motion.update("unit", { ...initial, x: 180, targetX: 180, now: 200 });
  assert.equal(motion.pose("unit", 230, false).moving, false);
  for (let i = 1; i <= 40; i++) motion.update("unit", { ...initial, x: 180, targetX: 180, now: 200 + i * 16 });
  const stopped = motion.pose("unit", 900, false);
  assert.ok(Math.abs(stopped.angle) < 0.01); assert.equal(stopped.x, 0);
  assert.equal(stopped.scaleX, 1); assert.equal(stopped.scaleY, 1);
});

test("death follows the last impact, fades once and cannot be prolonged by repeated snapshots", () => {
  const motion = setup(); motion.hit("unit", 80, 0, 0); motion.die("unit", 10);
  const half = motion.pose("unit", 10 + DEATH_DURATION / 2, false);
  assert.equal(half.dying, true); assert.equal(half.finished, false);
  assert.ok(half.x > 0 && half.angle > 0 && half.alpha > 0 && half.alpha < 1);
  motion.die("unit", 200);
  assert.equal(motion.pose("unit", 10 + DEATH_DURATION, false).finished, true);
  assert.equal(motion.pose("unit", 11, true).finished, true);
});

test("reduced motion and a new visual instance clear recoil and old death state", () => {
  const motion = setup(); motion.attack("unit", -80, 0, 0); motion.hit("unit", 80, 0, 0);
  motion.update("unit", { ...initial, now: 24, reduced: true });
  const reduced = motion.pose("unit", 28, true);
  assert.equal(reduced.flipX, true);
  assert.deepEqual([reduced.x, reduced.y, reduced.angle, reduced.scaleX, reduced.scaleY], [0, 0, 0, 1, 1]);
  assert.equal(motion.pose("unit", 28, false).x, 0);
  motion.die("unit", 30); motion.remove("unit"); motion.update("unit", initial);
  assert.equal(motion.pose("unit", 32, false).dying, false);
});

test("idle breathing is desynchronised, bounded and keeps the feet planted without drift", () => {
  const motion = setup();
  for (const id of ["unit", "another-unit"]) {
    for (let i = 0; i <= 40; i++) motion.update(id, { ...initial, idle: true, now: i * 16 });
  }
  const poses = ["unit", "another-unit"].map(id => motion.pose(id, 900, false));
  assert.notEqual(poses[0].scaleY, poses[1].scaleY);
  for (let now = 0; now < 100_000; now += 173) {
    const pose = motion.pose("unit", now, false);
    assert.ok(pose.scaleY >= 0.992 && pose.scaleY <= 1.008);
    assert.ok(pose.scaleX >= 0.996 && pose.scaleX <= 1.004);
    assert.ok(Math.abs(pose.angle) <= 0.35);
    assert.ok(Math.abs(pose.y + (pose.scaleY - 1) * 42.5) < 1e-10);
    assert.equal(pose.x, 0);
  }
});

test("idle yields to impacts, movement and drag, and reduced motion clears it", () => {
  const motion = setup();
  for (let i = 0; i < 40; i++) motion.update("unit", { ...initial, idle: true, now: i * 16 });
  motion.hit("unit", 80, 0, 640);
  const hit = motion.pose("unit", 664, false);
  assert.equal(hit.scaleY, 0.975); assert.equal(hit.scaleX, 1.03);
  for (let i = 0; i < 60; i++) motion.update("unit", { ...initial, idle: false, now: 1000 + i * 16 });
  assert.ok(Math.abs(motion.pose("unit", 2000, false).scaleY - 1) < 1e-8);
  motion.cast("unit", 2000);
  motion.update("unit", { ...initial, idle: true, reduced: true, now: 2020 });
  const reduced = motion.pose("unit", 2065, false);
  assert.deepEqual([reduced.y, reduced.angle, reduced.scaleX, reduced.scaleY], [0, 0, 1, 1]);
});

test("skill activation braces briefly, repeated activations do not accumulate, death takes priority", () => {
  const motion = setup();
  for (let i = 0; i < 30; i++) {
    motion.cast("unit", i * 400);
    const braced = motion.pose("unit", i * 400 + 65, false);
    assert.equal(braced.scaleY, 0.955); assert.equal(braced.angle, -2);
    const recovered = motion.pose("unit", i * 400 + 350, false);
    assert.equal(recovered.scaleY, 1); assert.equal(recovered.angle, 0);
  }
  motion.cast("unit", 12_000); motion.die("unit", 12_010); motion.cast("unit", 12_020);
  assert.equal(motion.pose("unit", 12_010 + DEATH_DURATION, false).finished, true);
});
