import type { Player } from "./model";
export const MAX_LEVEL = 10;
export const STARTING_LEVEL = 1;
export const EXPERIENCE_BUY_COST = 4;
export const EXPERIENCE_BUY_AMOUNT = 4;
export const ROUND_EXPERIENCE = 2;
// Index = current level; value = XP needed for the next level.
// TFT normal-mode curve (late levels reflect 18.2 September 14 update).
// Starting level 1 is retained for this game; rarity stars are independent.
export const EXPERIENCE_TO_NEXT: readonly number[] = [0, 2, 2, 6, 10, 20, 36, 56, 68, 68];
export function deploymentLimit(p: Pick<Player, "level">): number {
  return Math.min(MAX_LEVEL, Math.max(STARTING_LEVEL, Math.floor(p.level)));
}
export function deployedCount(p: Pick<Player, "units">): number {
  return p.units.filter(u => u.x >= 0).length;
}
export function nextLevelExperience(p: Pick<Player, "level">): number {
  return p.level >= MAX_LEVEL ? 0 : EXPERIENCE_TO_NEXT[p.level];
}
export function grantExperience(p: Player, amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid experience amount");
  if (amount === 0 || p.level >= MAX_LEVEL) return;
  p.experience += amount;
  while (p.level < MAX_LEVEL && p.experience >= EXPERIENCE_TO_NEXT[p.level]) {
    p.experience -= EXPERIENCE_TO_NEXT[p.level];
    p.level++;
  }
  if (p.level === MAX_LEVEL) p.experience = 0;
  p.experienceRevision++;
}
