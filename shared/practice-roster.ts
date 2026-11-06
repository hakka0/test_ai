import { BLUE_ARCHIVE_KINDS, BLUE_ARCHIVE_UNITS, type BlueArchiveKind } from "./blue-archive";
import { COLS, ROWS, type Player } from "./model";
import { MAX_LEVEL } from "./progression";

const BLUE_ARCHIVE_BOT: readonly BlueArchiveKind[] = ["hoshino", "natsu", "neru", "mika", "aru", "hina", "aris", "noa"];

export function seedBlueArchive(player: Player, bot = false) {
  const deployedCount = BLUE_ARCHIVE_BOT.length;
  const kinds = bot ? BLUE_ARCHIVE_BOT : BLUE_ARCHIVE_KINDS;
  player.level = MAX_LEVEL;
  player.gold = bot ? 0 : 30;
  let front = 0;
  let back = 0;
  for (const [index, kind] of kinds.entries()) {
    const deployed = index < deployedCount;
    const near = BLUE_ARCHIVE_UNITS[kind].stats.range <= 2;
    player.units.push({
      id: `${player.id}-${player.nextUnitId++}`, owner: player.id, kind, rank: 1,
      x: deployed ? (near ? front++ : back++) % COLS : -1,
      y: deployed ? ROWS / 2 - (near ? 1 : 2) : -1,
      benchSlot: deployed ? null : index - deployedCount, equipment: [],
    });
  }
}
