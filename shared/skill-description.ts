import { attackIntervalMs } from "./attack-speed";
import type { Stats } from "./model";
import type { SkillDefinition } from "./skill-types";

// Both attack and movement timers are checked on the 100 ms simulation step.
// Describe the effective interval change without changing the additive buff.
export function skillDescriptionFor(skill: SkillDefinition, stats: Pick<Stats, "interval" | "moveMs">): string {
  return skill.description.replace(/(공격|이동) 주기 ([−+-]?\d+(?:\.\d+)?)ms/g, (_, kind: string, value: string) => {
    const raw = kind === "공격" ? stats.interval : stats.moveMs;
    const before = attackIntervalMs(raw), after = attackIntervalMs(raw + Number(value.replace("−", "-")));
    const percent = Number((Math.abs(after - before) / before * 100).toFixed(1));
    return `${kind} 주기 ${percent}% ${after <= before ? "감소" : "증가"}`;
  });
}
