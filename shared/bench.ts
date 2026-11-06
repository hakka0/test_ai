import { BENCH_SIZE, type Player, type Kind, type Unit } from "./model";
import { canMergeAcquisition, mergeAcquiredKind } from "./merge";
export function freeBenchSlot(p: Pick<Player, "units">): number {
  for (let i = 0; i < BENCH_SIZE; i++)
    if (!p.units.some(u => u.x < 0 && u.benchSlot === i)) return i;
  return -1;
}
export function canAcquireUnit(p: Pick<Player, "units">, kind: Kind, mergeNow=true): boolean {
  return freeBenchSlot(p) >= 0 || (mergeNow && canMergeAcquisition(p, kind));
}
// Deferred acquisitions need a real reserve slot and keep every original unit.
// A refused acquisition never consumes an ID or mutates state.
export function acquireUnit(p: Player, kind: Kind, mergeNow=true): Unit | null {
  const slot = freeBenchSlot(p);
  if (slot < 0 && (!mergeNow || !canMergeAcquisition(p, kind))) return null;
  const unit: Unit = { id: `${p.id}-${p.nextUnitId++}`, owner: p.id, kind, rank: 1,
    x: -1, y: -1, benchSlot: slot, equipment: [] };
  p.units.push(unit);
  return (mergeNow ? mergeAcquiredKind(p, kind) : null) ?? unit;
}
