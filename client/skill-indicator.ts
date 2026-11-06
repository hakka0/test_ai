import { SKILLS } from "../shared/skill-catalog";
import type { SkillState } from "../shared/skill-types";

// Snapshot state alone determines readiness and activation. Cosmetic motion never
// predicts a cast or keeps a skill active after its authoritative state ends.
export function skillIndicator(states: Pick<SkillState, "id" | "cost" | "active">[], now: number, reduced: boolean) {
  const active = states.some(state => SKILLS[state.id]?.kind === "active" && state.active);
  const charge = Math.max(0, ...states.map(state => {
    const skill = SKILLS[state.id];
    return skill?.kind === "active" && skill.resource && !state.active
      ? Math.min(1, Math.max(0, state.cost / skill.resource.max)) : 0;
  }));
  return {
    active, charge, visible: active || charge >= 0.65,
    rotation: reduced || !active ? 0 : now / 1800,
    alpha: reduced ? 0.65 : active ? 0.65 + Math.sin(now / 280) * 0.12 : 0.25 + charge * 0.35,
  };
}
