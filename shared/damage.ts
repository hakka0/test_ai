import type { Match, Stats } from "./model";

export const BASE_COMBAT_STATS = { weaponPower: 10, critChance: 10, critDamage: 150 };

export function clampDamageStats(stats: Stats) {
  stats.defense = Math.max(1, stats.defense);
  stats.weaponPower = Math.max(0, stats.weaponPower);
  stats.critChance = Math.max(0, Math.min(100, stats.critChance));
  stats.critDamage = Math.max(100, stats.critDamage);
}

export function combatSeed(round: number, playerIds: string[]): number {
  let seed = 2166136261;
  for (const char of JSON.stringify([round, playerIds]))
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed || 1;
}

// Shop/reward rolls cannot consume the combat sequence. Checkpoint restores and
// different tick sizes reproduce it exactly because state belongs to Match.
export function combatRandom(match: Match): number {
  let x = match.combatRandomState || 1;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  match.combatRandomState = x >>> 0;
  return match.combatRandomState / 4294967296;
}

// Direct division: weapon power * (base + attack * coefficient) / defense *
// critical multiplier * received-damage multiplier. Round only the final hit.
export function calculateDamage(amount: number, source: Stats, defense: number,
  receivedMultiplier: number, roll: number) {
  const raw = Math.max(0, amount) * Math.max(0, source.weaponPower) /
    Math.max(1, defense) * Math.max(0, receivedMultiplier);
  const critical = raw > 0 && roll < Math.max(0, Math.min(100, source.critChance)) / 100;
  return { critical, incoming: Math.max(0, Math.round(raw * (critical ? Math.max(100, source.critDamage) / 100 : 1))) };
}
