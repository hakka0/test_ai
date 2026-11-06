import { unitKindsFor } from "./catalog";
import type { Kind, Player } from "./model";

// Per kind, shared by every participant. Merges retain their original copies.
export const UNIT_POOL_SIZE = 30;
export function unitCopies(rank: number) { return 3 ** (rank - 1); }
export function hasMaxRank(p: Pick<Player, "units">, kind: Kind) {
  return p.units.some(u => u.kind === kind && u.rank >= 3);
}
export function remainingCopies(players: readonly Player[], kind: Kind, released: {offerId?: string; rewardId?: string} = {}) {
  let used = 0;
  for (const p of players) {
    used += p.units.filter(u => u.kind === kind).reduce((n,u) => n + unitCopies(u.rank), 0);
    used += p.shop.filter(o => !o.sold && o.kind === kind && o.id !== released.offerId).length;
    if (p.pendingReward && p.pendingReward.id !== released.rewardId)
      used += p.pendingReward.options.filter(o => o.type === 'unit' && o.kind === kind).length;
  }
  return Math.max(0, UNIT_POOL_SIZE - used);
}
export function canClaimUnit(p: Player, kind: Kind, players: readonly Player[], released: {offerId?: string; rewardId?: string} = {}) {
  return !hasMaxRank(p, kind) && remainingCopies(players, kind, released) > 0;
}
export function pickPoolKind(p: Player, players: readonly Player[], random = Math.random, kinds: readonly Kind[] = unitKindsFor(p.roster)): Kind | null {
  const choices = kinds.filter(kind => !hasMaxRank(p, kind)).map(kind => ({kind, count:remainingCopies(players,kind)})).filter(c => c.count > 0);
  const total = choices.reduce((n,c) => n+c.count,0);
  if (!total) return null;
  let roll = Math.max(0, Math.min(0.999999999, random())) * total;
  for (const choice of choices) { roll -= choice.count; if (roll < 0) return choice.kind; }
  return choices.at(-1)!.kind;
}
