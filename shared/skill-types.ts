import type { Stats } from "./model";
export type SkillEvent =
  | "battleStart"
  | "tick"
  | "afterBasicAttack"
  | "onDamaged"
  | "onKill"
  | "costFull";
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { type: "hpBelow"; ratio: number }
  | { type: "costAtLeast"; amount: number }
  | { type: "attacksEvery"; count: number }
  | { type: "elapsedAtLeast"; ms: number }
  | { type: "enemyInRange"; range: number }
  | { type: "damageSource"; source: "basic" | "skill" };
export interface TriggerRule {
  on: SkillEvent;
  when?: Condition;
}
export interface ResourceDefinition {
  max: number;
  initial?: number;
  regenPerSecond?: number;
  perBasicAttack?: number;
  perDamaged?: number;
  perKill?: number;
  // Sustained skills stop at zero. By default neither time nor attacks refill them while active.
  recoverWhileActive?: boolean;
}
export interface CombatModifiers {
  stats?: Partial<Pick<Stats, "attack" | "defense" | "weaponPower" | "critChance" | "critDamage" | "interval" | "range" | "moveMs">>;
  damageTakenMultiplier?: number;
}
export type SkillEffect =
  | { type: "damage"; amount: number; attackScale?: number }
  | { type: "heal"; amount: number; maxHpRatio?: number }
  | { type: "shield"; amount: number }
  | { type: "buff"; durationMs: number; modifiers: CombatModifiers };
export interface TargetRule {
  kind: "self" | "nearestEnemy" | "allEnemies" | "lowestHealthAlly";
  range?: number;
  radius?: number;
}
export interface SkillDefinition {
  id: string;
  name: string;
  /** Optional public image path; custom skills fall back to the common icon. */
  image?: string;
  description: string;
  kind: "active" | "passive";
  triggers: TriggerRule[];
  resource?: ResourceDefinition;
  cooldownMs: number;
  maxActivationsPerBattle?: number;
  target: TargetRule;
  effects: SkillEffect[];
  activation:
    | { mode: "instant"; spend?: number | "all" }
    | {
        mode: "sustain";
        drainPerSecond: number;
        modifiers: CombatModifiers;
        pulse?: { everyMs: number; effects: SkillEffect[] };
      };
}
export interface SkillState {
  id: string;
  cost: number;
  active: boolean;
  cooldownUntil: number;
  activations: number;
  lastTriggeredAt: number;
  startedAt: number;
  lastUpdatedAt: number;
  nextPulseAt: number;
}
export interface BuffState {
  key: string;
  source: string;
  skillId: string;
  expiresAt: number;
  modifiers: CombatModifiers;
}
