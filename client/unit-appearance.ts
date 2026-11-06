import { CELL } from "./board-geometry";

// A square image slot supports 500x500 artwork. Older portrait artwork is fitted
// inside the same slot without cropping or stretching its original proportions.
export const UNIT_IMAGE_BOX = CELL * 0.96;

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
