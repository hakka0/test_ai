import { newPlayer } from "../shared/engine";
import { acquireUnit } from "../shared/bench";
import { grantItem } from "../shared/crafting";
import type { Fighter } from "../shared/model";

// Isolate skill triggers/contribution accounting from armor and random critical
// hits. The real formula and default stats have their own combat-damage suite.
export function neutralDamage(...fighters: Fighter[]) {
  for (const f of fighters) Object.assign(f.stats, { defense: 10, weaponPower: 10, critChance: 0 });
}

// Combat/equipment tests explicitly request a populated fixture. Keep this
// separate from the real, empty startup state and test that state independently.
export function newTestPlayer(id: string, name: string) {
  const player = newPlayer(id, name);
  for (const kind of ["knight", "ranger", "mage"] as const) acquireUnit(player, kind);
  player.units.forEach((unit, i) => Object.assign(unit, {
    x: i === 0 ? 2 : -1, y: i === 0 ? 1 : -1, benchSlot: i === 0 ? null : i - 1,
  }));
  for (const definition of ["blade", "armor", "charm"]) grantItem(player, definition);
  return player;
}
