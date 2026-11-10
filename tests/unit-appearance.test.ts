import test from "node:test";
import assert from "node:assert/strict";
import { UNIT_IMAGE_BOX, UNIT_BODY_HEIGHT, UNIT_FOOT_Y, measureUnitFrame, unitImageLayout, unitImageSize } from "../client/unit-appearance";
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

function artwork(width: number, height: number, rectangles: number[][]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const [left, top, right, bottom] of rectangles) {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) pixels[(y * width + x) * 4 + 3] = 255;
  }
  return measureUnitFrame(pixels, width, height);
}

test("frame measurement ignores transparent margins and isolated export specks, retaining a detached halo", () => {
  const bounds = artwork(40, 50, [[8, 12, 24, 40], [10, 4, 22, 6], [35, 48, 37, 49]]);
  assert.deepEqual(bounds, { left: 8, top: 4, right: 24, bottom: 40, footX: 16, footY: 40 });
  assert.equal(artwork(40, 50, []), undefined);
});

test("different frame sizes and padding yield the same visible height and ground anchor without stretching", () => {
  for (const [w, h, rect] of [[40, 50, [8, 4, 24, 40]], [80, 100, [30, 15, 54, 69]], [80, 100, [4, 27, 20, 63]]] as const) {
    const bounds = artwork(w, h, [[...rect]])!;
    const layout = unitImageLayout(w, h, bounds);
    const scale = layout.width / w;
    assert.ok(Math.abs(layout.width / layout.height - w / h) < 1e-10);
    assert.ok(Math.abs((bounds.bottom - bounds.top) * scale - UNIT_BODY_HEIGHT) < 1e-10);
    assert.ok(Math.abs((bounds.footX - layout.originX * w) * scale) < 1e-10);
    assert.ok(Math.abs((bounds.footY - layout.originY * h) * scale + layout.offsetY - UNIT_FOOT_Y) < 1e-10);
  }
});

test("a foot pivot keeps idle breathing planted and unmeasured images retain their fitted layout", () => {
  const motion = new UnitMotion();
  for (let i = 0; i < 60; i++) motion.update("unit", {
    x: 100, y: 100, targetX: 100, targetY: 100, facing: 1, now: i * 16,
    delta: 16, reduced: false, idle: true, halfHeight: 0,
  });
  for (const now of [1000, 1500, 2500]) assert.equal(motion.pose("unit", now, false).y, 0);
  assert.deepEqual(unitImageLayout(500, 250), {
    ...unitImageSize(500, 250), originX: 0.5, originY: 0.5, offsetY: -4, centerY: -4, footAnchored: false,
  });
});
