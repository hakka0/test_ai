import type { Kind, Stats, Fighter, Rarity, UnitRank, Trait, Roster } from "./model";
import { RANK_STAT_MULTIPLIER } from "./merge";
import type { CombatAttribute } from "./combat-attributes";
import { BASE_COMBAT_STATS, clampDamageStats } from "./damage";
import { BLUE_ARCHIVE_KINDS, BLUE_ARCHIVE_UNITS } from "./blue-archive";
export { BASE_COMBAT_STATS } from "./damage";

interface UnitDefinition {
  name: string;
  rarity: Rarity;
  trait: Trait;
  role: string;
  image: string;
  spriteSheet?: string;
  stats: Stats;
  skills: string[];
  attackAttribute: CombatAttribute;
  defenseAttribute: CombatAttribute;
}
export const CORE_UNIT_KINDS = ["yuuka", "shiroko", "hifumi", "natsu", "neru", "koharu"] as const satisfies readonly Kind[];
export const UNIT_KINDS = BLUE_ARCHIVE_KINDS;
export const UNITS: Record<Kind, UnitDefinition> = { ...BLUE_ARCHIVE_UNITS };
export function unitKindsFor(_roster?: Roster): readonly Kind[] { return UNIT_KINDS; }
export interface TeamBonus { hpMultiplier?: number; attackMultiplier?: number; shield?: number; }
export type Hook = "battleStart" | "beforeAttack" | "afterAttack" | "onHit";
export interface EffectContext {
  self: Fighter;
  other?: Fighter;
  damage: number;
}
export interface EquipmentDefinition {
  tier: Rarity;
  category: "material" | "equipment";
  name: string;
  description: string;
  modifiers: Partial<Stats>;
  hooks?: Partial<Record<Hook, (ctx: EffectContext) => void>>;
}
// 확장 지점: 데이터 보정과 전투 이벤트 효과를 분리합니다. 콜백은 서버 전투에서만 호출됩니다.
export const EQUIPMENT: Record<string, EquipmentDefinition> = {
  blade: {
    tier: 2, category: "equipment",
    name: "새벽의 검",
    description: "공격력 +8",
    modifiers: { attack: 8 },
  },
  armor: {
    tier: 2, category: "equipment",
    name: "여명의 갑옷",
    description: "최대 체력 +60",
    modifiers: { hp: 60 },
  },
  charm: {
    tier: 2, category: "equipment",
    name: "별빛 부적",
    description: "전투 시작 시 보호막 35",
    modifiers: {},
    hooks: {
      battleStart: (ctx) => {
        ctx.self.shield += 35;
      },
    },
  },
};
export const MATERIALS = ["iron", "cloth", "crystal"] as const;
for (const [id, name] of [["iron", "강철 조각"], ["cloth", "수호 천"], ["crystal", "별빛 결정"]]) {
  EQUIPMENT[id] = { name, tier: 1, category: "material", description: "재료 2개를 조합해 완성 장비 제작", modifiers: {} };
}
// Unordered data-driven recipes can be extended without changing the action protocol.
export const ITEM_RECIPES = [
  { materials: ["iron", "iron"], result: "greatblade", name: "성광 대검", attack: 16, hp: 0, shield: 0 },
  { materials: ["cloth", "cloth"], result: "plate", name: "수호 흉갑", attack: 0, hp: 120, shield: 0 },
  { materials: ["crystal", "crystal"], result: "aegis", name: "별빛 방패", attack: 0, hp: 0, shield: 70 },
  { materials: ["iron", "cloth"], result: "warcoat", name: "전투 외투", attack: 8, hp: 60, shield: 0 },
  { materials: ["iron", "crystal"], result: "spellblade", name: "별의 검", attack: 8, hp: 0, shield: 35 },
  { materials: ["cloth", "crystal"], result: "wardrobe", name: "보호 로브", attack: 0, hp: 60, shield: 35 },
];
for (const recipe of ITEM_RECIPES) for (const tier of [2, 3, 4, 5] as const) {
  const scale = tier - 1, attack = recipe.attack * scale, hp = recipe.hp * scale, shield = recipe.shield * scale;
  EQUIPMENT[`${recipe.result}-t${tier}`] = {
    name: `${recipe.name} · ${tier}등급`, tier, category: "equipment",
    description: [attack ? `공격력 +${attack}` : "", hp ? `최대 체력 +${hp}` : "", shield ? `시작 보호막 ${shield}` : ""].filter(Boolean).join(" · "),
    modifiers: { attack, hp },
    ...(shield ? { hooks: { battleStart: (ctx: EffectContext) => { ctx.self.shield += shield; } } } : {}),
  };
}
export function statsFor(
  unit: { kind: Kind; rank?: UnitRank; equipment: string[] },
  inventory: { id: string; definition: string }[],
  bonus: TeamBonus = {},
): Stats {
  const s = { ...UNITS[unit.kind].stats };
  // Upgrade base HP/attack only. Flat equipment bonuses are applied afterwards.
  const multiplier = RANK_STAT_MULTIPLIER ** ((unit.rank ?? 1) - 1);
  s.hp = Math.round(s.hp * multiplier);
  s.attack = Math.round(s.attack * multiplier);
  // Team bonuses modify upgraded base stats; flat equipment remains unscaled.
  s.hp = Math.round(s.hp * (bonus.hpMultiplier ?? 1));
  s.attack = Math.round(s.attack * (bonus.attackMultiplier ?? 1));
  for (const id of unit.equipment) {
    const def = EQUIPMENT[inventory.find((i) => i.id === id)?.definition ?? ""];
    if (def)
      for (const [key, value] of Object.entries(def.modifiers))
        s[key as keyof Stats] += value;
  }
  s.hp = Math.max(1, s.hp);
  s.attack = Math.max(0, s.attack);
  clampDamageStats(s);
  s.interval = Math.max(100, s.interval);
  s.range = Math.max(1, s.range);
  s.moveMs = Math.max(100, s.moveMs);
  return s;
}
