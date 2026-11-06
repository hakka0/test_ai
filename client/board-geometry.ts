import { COLS, ROWS } from "../shared/model";

export const WIDTH = 800, MARGIN = 40, CELL = (WIDTH - MARGIN * 2) / COLS;
export const HEIGHT = MARGIN * 2 + ROWS * CELL;
export const BOARD_ASPECT = WIDTH / HEIGHT;
// Preparation and combat share world coordinates; each player sees their own side below.
export function preparationPosition(side: number, x: number, y: number) {
  return { x: side === 0 ? x : COLS - 1 - x, y: side === 0 ? ROWS - 1 - y : y };
}
export function displayPosition(reverse: boolean, x: number, y: number) {
  return { x: reverse ? COLS - 1 - x : x, y: reverse ? ROWS - 1 - y : y };
}
