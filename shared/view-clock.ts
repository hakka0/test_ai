import type { Snapshot } from './model';
// Keep rendering, edit deadlines and skill cooldowns on the same game clock.
export function snapshotGameNow(s: Pick<Snapshot, 'gameNow' | 'serverNow' | 'timeScale'>, realNow: number): number {
  return s.gameNow + Math.max(0, realNow - s.serverNow) * s.timeScale;
}
