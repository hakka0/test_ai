import type { FighterSnapshot, Snapshot } from "../shared/model";
import type { SkillDefinition } from "../shared/skill-types";

export const SKILL_FLASH_MS = 500;

export function skillCardState(skill: SkillDefinition, fighter: FighterSnapshot | undefined, now: number) {
  const state = fighter?.skills.find(s => s.id === skill.id);
  const dead = fighter?.hp === 0;
  const running = !dead && !!state?.active;
  const used = !running && !!state && state.activations >= (skill.maxActivationsPerBattle ?? Infinity);
  return {
    dead, running, used,
    cooldown: !dead && !running && !used ? Math.max(0, Math.ceil(((state?.cooldownUntil ?? 0) - now) / 1000)) : 0,
    cost: state?.cost ?? skill.resource?.initial ?? 0,
  };
}

// Observe all public fighters, independently of selection or perspective. A
// reconnect supplies a baseline; duplicate snapshots cannot restart a flash.
export class SkillCastFeedback {
  private context = "";
  private observed = false;
  private counts = new Map<string, number>();
  private flashes = new Map<string, number>();
  private key(unitId: string, skillId: string) { return JSON.stringify([unitId, skillId]); }

  reset() {
    this.context = ""; this.observed = false; this.counts.clear(); this.flashes.clear();
  }
  observe(snapshot: Pick<Snapshot, "roomId" | "round" | "phase" | "fighters">, now: number) {
    const context = JSON.stringify([snapshot.roomId, snapshot.round]);
    if (context !== this.context) { this.reset(); this.context = context; }
    const next = new Map<string, number>();
    if (snapshot.phase !== "combat") this.flashes.clear();
    for (const fighter of snapshot.fighters) for (const skill of fighter.skills) {
      const key = this.key(fighter.id, skill.id), previous = this.counts.get(key) ?? 0;
      next.set(key, skill.activations);
      if (fighter.hp === 0 || skill.activations < previous) this.flashes.delete(key);
      else if (this.observed && snapshot.phase === "combat" && skill.activations > previous)
        this.flashes.set(key, now);
    }
    for (const [key, at] of this.flashes) if (!next.has(key) || now - at >= SKILL_FLASH_MS) this.flashes.delete(key);
    this.counts = next; this.observed = true;
  }
  strength(unitId: string, skillId: string, now: number) {
    const at = this.flashes.get(this.key(unitId, skillId));
    return at === undefined ? 0 : Math.max(0, 1 - Math.max(0, now - at) / SKILL_FLASH_MS);
  }
  pending(now: number) { return [...this.flashes.values()].some(at => now - at < SKILL_FLASH_MS); }
}
