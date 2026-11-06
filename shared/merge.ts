import { MAX_EQUIPMENT, type Kind, type Player, type Unit, type UnitRank } from "./model";
export const MERGE_COPIES = 3;
export const MAX_UNIT_RANK = 3;
export const RANK_STAT_MULTIPLIER = 1.8;

export function canMergeAcquisition(p: Pick<Player, "units">, kind: Kind): boolean {
  return p.units.filter(u => u.kind === kind && u.rank === 1).length >= MERGE_COPIES - 1;
}
// Called for preparation acquisitions and when a new preparation begins.
export function mergeAcquiredKind(p: Player, kind: Kind): Unit | null {
  let result: Unit | null = null;
  const allConsumed: string[] = [];
  let allReturned = 0;
  for (const rank of [1, 2] as const) {
   while (true) {
    const candidates = p.units.filter(u => u.kind === kind && u.rank === rank);
    if (candidates.length < MERGE_COPIES) break;
    // Stable roster order decides ties. Keep a deployed unit before a reserve.
    candidates.sort((a, b) => Number(a.x < 0) - Number(b.x < 0));
    const group = candidates.slice(0, MERGE_COPIES), survivor = group[0];
    const consumed = group.slice(1), consumedIds = new Set(consumed.map(u => u.id));
    const ids = [...new Set(group.flatMap(u => u.equipment))];
    const kept: string[] = [];
    let returnedEquipment = 0;
    for (const id of ids) {
      const item = p.inventory.find(i => i.id === id && group.some(u => u.id === i.unitId));
      if (!item) continue;
      if (kept.length < MAX_EQUIPMENT) { kept.push(id); item.unitId = survivor.id; }
      else { item.unitId = null; returnedEquipment++; }
    }
    survivor.equipment = kept;
    survivor.rank = (rank + 1) as UnitRank;
    p.units = p.units.filter(u => !consumedIds.has(u.id));
    allConsumed.push(...consumedIds);
    allReturned += returnedEquipment;
    result = survivor;
   }
  }
  if (result) {
    p.mergeRevision++;
    p.lastMerge = {unitId: result.id, kind, rank: result.rank, consumedIds: allConsumed, returnedEquipment: allReturned};
  }
  return result;
}

export function mergeRoster(p:Player):void {
  for(const kind of new Set(p.units.map(u=>u.kind)))mergeAcquiredKind(p,kind);
}
