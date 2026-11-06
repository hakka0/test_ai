// Economy and survival for player duels; introductory minions do not alter streaks.
export const STARTING_HEALTH = 100;
export const ROUNDS_PER_STAGE = 5;
export const MAX_INTEREST = 5;
export const WIN_GOLD = 1;
export function stageFor(round: number): number {
  return 2 + Math.floor((Math.max(1, round) - 1) / ROUNDS_PER_STAGE);
}
export function stageLabel(round: number): string {
  return `${stageFor(round)}-${(Math.max(1, round) - 1) % ROUNDS_PER_STAGE + 1}`;
}
// Own balance values: sustained losses end sooner; close matches have more time.
export function basePlayerDamage(round: number): number {
  // Damage progression stays independent from the display's stage grouping.
  const damageTier = Math.floor((Math.max(1, round) - 1) / 6);
  return [1, 2, 3, 4, 6, 8, 12][Math.min(6, damageTier)];
}
export function interestFor(gold: number): number {
  return Math.min(MAX_INTEREST, Math.max(0, Math.floor(gold / 10)));
}
export function streakGold(count: number): number {
  return count >= 5 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0;
}
