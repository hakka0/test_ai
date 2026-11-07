import { mkdirSync, writeFileSync } from "node:fs";
import { newMatch, newPlayer, startCombat, tick } from "../shared/engine";
import { UNITS, UNIT_KINDS } from "../shared/catalog";
import type { Kind, Match, UnitRank } from "../shared/model";

// Real combat/skills/synergies, no browser or wall-clock waits. Mirror sides to
// expose turn-order bias; vary formation and the saved combat RNG independently.
const teams: Record<string, Kind[]> = {
  balanced: ["yuuka", "shiroko", "hifumi"],
  sustain: ["natsu", "neru", "koharu"],
  frontline: ["yuuka", "natsu", "shiroko"],
  backline: ["shiroko", "hifumi", "koharu"],
  full: UNIT_KINDS,
};
function fight(a: Kind[], b: Kind[], rank: UnitRank, seed: number, mirror: boolean) {
  const m = newMatch(); m.round = 1;
  m.players = [newPlayer("a", "A"), newPlayer("b", "B")];
  const rosters = mirror ? [b, a] : [a, b];
  for (const [side, p] of m.players.entries()) {
    p.level = 10;
    p.units = rosters[side].map((kind, i) => ({
      id: p.id + i, owner: p.id, kind, rank, equipment: [],
      x: (i + seed % 3 + 1) % 8,
      y: UNITS[kind].stats.range === 1 ? 0 : 2,
    }));
  }
  startCombat(m, 0);
  (m as Match & { combatRandomState: number }).combatRandomState = seed * 2654435761 >>> 0;
  for (let now = 100; m.phase === "combat" && now <= 40000; now += 100) tick(m, now);
  const r = m.roundHistory[0];
  return {
    winner: r.winner === null ? "draw" : r.winner === (mirror ? "b" : "a") ? "a" : "b",
    timeout: r.reason === "timeout", seconds: m.lastTick / 1000,
  };
}
function series(a: Kind[], b: Kind[], rank: UnitRank) {
  const runs = [];
  for (let seed = 1; seed <= 8; seed++) for (const mirror of [false, true]) runs.push(fight(a, b, rank, seed, mirror));
  const durations = runs.map(r => r.seconds).sort((a, b) => a - b);
  return { rank, runs: runs.length, winsA: runs.filter(r => r.winner === "a").length,
    winsB: runs.filter(r => r.winner === "b").length, draws: runs.filter(r => r.winner === "draw").length,
    timeouts: runs.filter(r => r.timeout).length, medianSeconds: durations[Math.floor(durations.length / 2)], maxSeconds: durations.at(-1)! };
}
const duels = [];
for (let i = 0; i < UNIT_KINDS.length; i++) for (let j = i; j < UNIT_KINDS.length; j++)
  duels.push({ a: UNIT_KINDS[i], b: UNIT_KINDS[j], ...series([UNIT_KINDS[i]], [UNIT_KINDS[j]], 1) });
const compositions = [];
for (const [a, b] of [["balanced", "sustain"], ["balanced", "frontline"], ["balanced", "backline"], ["sustain", "frontline"], ["sustain", "backline"], ["full", "full"]])
  for (const rank of [1, 2, 3] as const) compositions.push({ a, b, ...series(teams[a], teams[b], rank) });
const all = [...duels, ...compositions];
const report = { label: process.argv[2] ?? "current", stats: Object.fromEntries(UNIT_KINDS.map(k => [k, UNITS[k].stats])),
  runs: all.reduce((n, r) => n + r.runs, 0), timeouts: all.reduce((n, r) => n + r.timeouts, 0), duels, compositions };
mkdirSync("docs/balance", { recursive: true });
writeFileSync(`docs/balance/${report.label}.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ label: report.label, runs: report.runs, timeouts: report.timeouts, compositions }, null, 2));
