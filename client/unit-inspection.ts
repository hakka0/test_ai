import type { Snapshot } from "../shared/model";
import {roster} from './scouting';

// Scouting accepts public reserves as well as both sides' frozen combat units.
export function unitInspection(snapshot: Snapshot | null, id: string, scouting=false) {
  if (!snapshot || !id) return undefined;
  const battle = ["combat", "result", "finished"].includes(snapshot.phase);
  const fighter = battle ? snapshot.fighters.find(f => f.id === id) : undefined;
  const player = [...snapshot.players,...snapshot.neutralOpponents??[]].find(p => (scouting?roster(p):p.units).some(u => u.id === id) || p.id === fighter?.owner);
  if (!player) return undefined;
  const own = player.visibility === "self";
  const rosterUnit = (scouting?roster(player):player.units).find(u => u.id === id);
  const reserve = scouting && rosterUnit && rosterUnit.x < 0;
  const unit = own ? rosterUnit ?? fighter : reserve ? rosterUnit : fighter ?? rosterUnit;
  return unit ? { player, unit, own, fighter: reserve ? undefined : fighter } : undefined;
}

export function inspectionSelection(previous: Snapshot | null, next: Snapshot, id: string): string {
  if (!id) return "";
  const before = unitInspection(previous, id);
  const after = unitInspection(next, id);
  if (!after) return "";
  if (before && !before.own && (
    previous?.roomId !== next.roomId || previous.round !== next.round ||
    before.player.id !== after.player.id ||
    (previous.phase === "combat" && next.phase !== "combat") ||
    (previous.phase !== "prepare" && next.phase === "prepare")
  )) return "";
  return id;
}
