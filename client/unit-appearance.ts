import { CELL } from "./board-geometry";

// A square image slot supports 500x500 artwork. Older portrait artwork is fitted
// inside the same slot without cropping or stretching its original proportions.
export const UNIT_IMAGE_BOX = CELL * 0.96;
export const UNIT_BODY_HEIGHT = CELL * 0.84;
export const UNIT_FOOT_Y = CELL * 0.28;

export type UnitFrameBounds = {
  left: number; top: number; right: number; bottom: number;
  footX: number; footY: number;
};

// Measure opaque artwork, not its transparent frame. Keep separate halo/weapon
// pieces, but ignore isolated export specks that would move the ground anchor.
export function measureUnitFrame(pixels: Uint8ClampedArray, width: number, height: number): UnitFrameBounds | undefined {
  const visited = new Uint8Array(width * height), components: number[][] = [];
  let largest = 0;
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || pixels[start * 4 + 3] < 128) continue;
    const component = [start]; visited[start] = 1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const pixel = component[cursor], x = pixel % width, y = Math.floor(pixel / width);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const next = ny * width + nx;
          if (visited[next] || pixels[next * 4 + 3] < 128) continue;
          visited[next] = 1; component.push(next);
        }
      }
    }
    largest = Math.max(largest, component.length); components.push(component);
  }
  if (!largest) return;
  const artwork = components.filter(c => c.length >= Math.min(largest, Math.max(16, largest * 0.005)));
  let left = width, top = height, right = 0, bottom = 0;
  for (const component of artwork) for (const pixel of component) {
    const x = pixel % width, y = Math.floor(pixel / width);
    left = Math.min(left, x); right = Math.max(right, x + 1);
    top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
  }
  const feet: number[] = [];
  const footBand = Math.max(1, Math.round((bottom - top) * 0.07));
  for (const component of artwork) for (const pixel of component) {
    if (Math.floor(pixel / width) >= bottom - footBand) feet.push(pixel % width + 0.5);
  }
  feet.sort((a, b) => a - b);
  const middle = Math.floor(feet.length / 2);
  const footX = (feet[middle] + feet[Math.max(0, Math.ceil(feet.length / 2) - 1)]) / 2;
  return { left, top, right, bottom, footX, footY: bottom };
}

export function unitImageLayout(width: number, height: number, bounds?: UnitFrameBounds) {
  if (!bounds) return { ...unitImageSize(width, height), originX: 0.5, originY: 0.5, offsetY: -4, centerY: -4, footAnchored: false };
  const scale = UNIT_BODY_HEIGHT / (bounds.bottom - bounds.top);
  return {
    width: width * scale, height: height * scale,
    originX: bounds.footX / width, originY: bounds.footY / height,
    offsetY: UNIT_FOOT_Y, centerY: UNIT_FOOT_Y - UNIT_BODY_HEIGHT / 2, footAnchored: true,
  };
}

// The top row faces the viewer and the bottom row faces away.
export function directionFrame(dx: number, dy: number, own: boolean): number {
  const row = (dy === 0 ? own : dy < 0) ? 3 : 0;
  const column = Math.abs(dx) <= Math.abs(dy) * 0.35 ? 1 : dx < 0 ? 0 : 2;
  return row + column;
}

export function unitImageSize(width: number, height: number) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const scale = UNIT_IMAGE_BOX / Math.max(w, h);
  return { width: w * scale, height: h * scale };
}
