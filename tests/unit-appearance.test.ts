import test from "node:test";
import assert from "node:assert/strict";
import { UNIT_IMAGE_BOX, unitImageSize } from "../client/unit-appearance";
import { UnitMotion } from "../client/unit-motion";

test("500x500 artwork fills a square slot independently of source resolution", () => {
  assert.deepEqual(unitImageSize(500, 500), { width: UNIT_IMAGE_BOX, height: UNIT_IMAGE_BOX });
  assert.deepEqual(unitImageSize(1000, 1000), unitImageSize(500, 500));
});

test("portrait and landscape artwork fit without cropping or changing proportions", () => {
  for (const [w, h] of [[100, 120], [1000, 500], [256, 512]]) {
    const size = unitImageSize(w, h);
    assert.ok(Math.abs(size.width / size.height - w / h) < 1e-10);
    assert.equal(Math.max(size.width, size.height), UNIT_IMAGE_BOX);
  }
});

test("breathing keeps the feet planted for square and portrait image sizes", () => {
  for (const [w, h] of [[500, 500], [100, 120], [1000, 500]]) {
    const motion = new UnitMotion(), halfHeight = unitImageSize(w, h).height / 2;
    for (let i = 0; i < 60; i++) motion.update("unit", {
      x: 100, y: 100, targetX: 100, targetY: 100, facing: 1, now: i * 16,
      delta: 16, reduced: false, idle: true, halfHeight,
    });
    for (const now of [1000, 1500, 2500]) {
      const pose = motion.pose("unit", now, false);
      assert.ok(Math.abs(pose.y + (pose.scaleY - 1) * halfHeight) < 1e-10);
    }
  }
});
