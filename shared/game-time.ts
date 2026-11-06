import { tick } from "./engine";
import type { Match } from "./model";

// Real time remains separate for pings, rate limits and reconnect grace periods.
export class GameClock {
  private lastReal: number;
  now: number;
  speed = 1;
  paused = false;
  constructor(realNow: number) { this.now = realNow; this.lastReal = realNow; }
  advance(realNow: number): number {
    const elapsed = Math.max(0, realNow - this.lastReal);
    this.lastReal = Math.max(realNow, this.lastReal);
    this.now += elapsed * this.scale;
    return this.now;
  }
  get scale(): number { return this.paused ? 0 : this.speed; }
  seek(gameNow: number, realNow: number): void { this.now = gameNow; this.lastReal = realNow; }
}

// Process boundaries at their scheduled times even when a debug jump crosses
// several phases. Combat still uses the engine's authoritative 100 ms steps.
export function advanceMatch(m: Match, now: number): void {
  for (let transitions = 0; transitions < 128; transitions++) {
    if (m.phase === "waiting" || m.phase === "finished") return;
    const phase = m.phase;
    const deadline=m.deadline;
    if (phase === "combat") tick(m, Math.min(now, m.deadline));
    else if (now >= m.deadline) tick(m, m.deadline);
    else return;
    if (m.phase === phase&&m.deadline===deadline) return;
  }
  throw new Error("Too many match transitions");
}

