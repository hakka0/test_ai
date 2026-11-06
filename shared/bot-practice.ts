import type {Player, PvpBattle} from './model';

export function isBot(p: Pick<Player, 'id' | 'bot'>) { return p.bot === true || p.id === 'practice-bot'; }

// Circle scheduling visits every opponent once in five rounds with six survivors.
// After eliminations the same schedule is rebuilt for the remaining participants.
export function practicePairs(players: readonly Player[], round: number): PvpBattle[] {
  const seats: (string | null)[] = players.filter(p => p.health > 0).map(p => p.id);
  if (seats.length < 2) return [];
  if (seats.length % 2) seats.push(null);
  for (let i = 0; i < ((round % (seats.length - 1)) + seats.length - 1) % (seats.length - 1); i++)
    seats.splice(1, 0, seats.pop()!);
  const pairs: PvpBattle[] = [];
  for (let i = 0; i < seats.length / 2; i++) {
    const a = seats[i], b = seats[seats.length - 1 - i];
    if (a && b) pairs.push({arena: `pvp:${a}:${b}`, players: [a, b]});
  }
  return pairs;
}
