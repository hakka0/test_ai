import { assetUrl } from "./assets";
import type { Rarity, Stats, Trait } from "./model";
import type { ResourceDefinition, SkillDefinition, SkillEffect, TargetRule } from "./skill-types";
import type { CombatAttribute } from "./combat-attributes";
import { BASE_COMBAT_STATS } from "./damage";

export const SPRITE_FRAME_SIZE = 128;

function active(id: string, name: string, description: string, target: TargetRule, effects: SkillEffect[], recovery: Omit<ResourceDefinition, "max">): SkillDefinition {
  return {
    id: `ba-${id}`, name, description, kind: "active",
    triggers: [{ on: "costFull" }], resource: { max: 60, ...recovery },
    cooldownMs: 1000, target, effects, activation: { mode: "instant", spend: "all" },
  };
}

function shot(id: string, name: string, range: number, amount: number, attackScale: number, radius = 0): SkillDefinition {
  const perBasicAttack = radius ? 15 : 20;
  return active(id, name,
    `기본 공격마다 코스트 ${perBasicAttack}. 60에서 ${range}칸 내 가장 가까운 적${radius ? `과 주변 ${radius}칸의 적` : ""}에게 ${amount} + 공격력의 ${Math.round(attackScale * 100)}% 피해.`,
    { kind: "nearestEnemy", range, ...(radius ? { radius } : {}) },
    [{ type: "damage", amount, attackScale }], { perBasicAttack });
}

const combatByTrait: Record<Trait, { defense: number; attackAttribute: CombatAttribute; defenseAttribute: CombatAttribute }> = {
  bulwark: { defense: 13, attackAttribute: "red", defenseAttribute: "blue" },
  scout: { defense: 9, attackAttribute: "yellow", defenseAttribute: "red" },
  arcane: { defense: 8, attackAttribute: "blue", defenseAttribute: "purple" },
};

function unit(id: string, name: string, role: string, rarity: Rarity, trait: Trait,
  stats: Pick<Stats, "hp" | "attack" | "interval" | "range" | "moveMs">) {
  const { defense, attackAttribute, defenseAttribute } = combatByTrait[trait];
  return {
    name, role, rarity, trait, attackAttribute, defenseAttribute,
    stats: { ...BASE_COMBAT_STATS, ...stats, defense },
    skills: [`ba-${id}`],
    image: assetUrl(`/units/blue-archive/icons/${id}.png`),
    spriteSheet: assetUrl(`/units/blue-archive/${id}.png`),
  };
}

export const BLUE_ARCHIVE_UNITS = {
  yuuka: unit("yuuka", "유우카", "계산형 탱커", 2, "bulwark", { hp: 325, attack: 24, interval: 880, range: 2, moveMs: 440 }),
  hoshino: unit("hoshino", "호시노", "방패 돌격수", 3, "bulwark", { hp: 345, attack: 29, interval: 1140, range: 1, moveMs: 470 }),
  natsu: unit("natsu", "나츠", "자가 회복 탱커", 2, "bulwark", { hp: 310, attack: 23, interval: 1000, range: 2, moveMs: 480 }),
  neru: unit("neru", "네루", "근거리 난사", 2, "scout", { hp: 232, attack: 23, interval: 640, range: 1, moveMs: 345 }),
  izuna: unit("izuna", "이즈나", "고속 교란", 2, "scout", { hp: 196, attack: 25, interval: 720, range: 2, moveMs: 325 }),
  mika: unit("mika", "미카", "중장 돌격수", 5, "bulwark", { hp: 330, attack: 42, interval: 1020, range: 2, moveMs: 400 }),
  shiroko: unit("shiroko", "시로코", "드론 정찰수", 1, "scout", { hp: 190, attack: 27, interval: 790, range: 3, moveMs: 385 }),
  koharu: unit("koharu", "코하루", "치유 지원", 2, "arcane", { hp: 184, attack: 21, interval: 1050, range: 3, moveMs: 465 }),
  aru: unit("aru", "아루", "폭발 저격수", 3, "scout", { hp: 171, attack: 41, interval: 1180, range: 4, moveMs: 520 }),
  haruna: unit("haruna", "하루나", "관통 저격수", 3, "scout", { hp: 173, attack: 40, interval: 1130, range: 4, moveMs: 520 }),
  hifumi: unit("hifumi", "히후미", "보호막 지원", 1, "arcane", { hp: 189, attack: 22, interval: 970, range: 3, moveMs: 455 }),
  hina: unit("hina", "히나", "광역 제압", 5, "bulwark", { hp: 258, attack: 43, interval: 900, range: 4, moveMs: 510 }),
  iori: unit("iori", "이오리", "속사 저격수", 3, "scout", { hp: 190, attack: 35, interval: 870, range: 4, moveMs: 445 }),
  maki: unit("maki", "마키", "표식 지원", 1, "arcane", { hp: 184, attack: 24, interval: 890, range: 3, moveMs: 455 }),
  aris: unit("aris", "아리스", "광선 포격", 4, "arcane", { hp: 210, attack: 50, interval: 1470, range: 4, moveMs: 570 }),
  midori: unit("midori", "미도리", "치유 사격", 1, "arcane", { hp: 177, attack: 24, interval: 960, range: 4, moveMs: 455 }),
  yuzu: unit("yuzu", "유즈", "범위 유탄", 2, "arcane", { hp: 176, attack: 30, interval: 1160, range: 3, moveMs: 480 }),
  azusa: unit("azusa", "아즈사", "단일 집중 사격", 3, "scout", { hp: 197, attack: 32, interval: 900, range: 3, moveMs: 430 }),
  wakamo: unit("wakamo", "와카모", "고화력 저격수", 4, "scout", { hp: 199, attack: 48, interval: 1170, range: 4, moveMs: 480 }),
  noa: unit("noa", "노아", "전술 기록 지원", 2, "arcane", { hp: 192, attack: 22, interval: 920, range: 3, moveMs: 435 }),
};
export type BlueArchiveKind = keyof typeof BLUE_ARCHIVE_UNITS;
export const BLUE_ARCHIVE_KINDS = Object.keys(BLUE_ARCHIVE_UNITS) as BlueArchiveKind[];

const self = { kind: "self" } as const;
const ally = { kind: "lowestHealthAlly", range: 5 } as const;
const closest = { kind: "nearestEnemy", range: 5 } as const;

const blueArchiveSkills = [
  active("yuuka", "논리의 방패", "초당 코스트 10, 피격마다 8. 60에서 자신에게 보호막 75.", self, [{ type: "shield", amount: 75 }], { regenPerSecond: 10, perDamaged: 8 }),
  active("hoshino", "전술 방패", "초당 코스트 12, 피격마다 6. 60에서 자신에게 보호막 60과 3초간 받는 피해 25% 감소.", self, [{ type: "shield", amount: 60 }, { type: "buff", durationMs: 3000, modifiers: { damageTakenMultiplier: 0.75 } }], { regenPerSecond: 12, perDamaged: 6 }),
  active("natsu", "달콤한 간식", "초당 코스트 12, 피격마다 6. 60에서 자신의 체력을 30 + 최대 체력의 12% 회복.", self, [{ type: "heal", amount: 30, maxHpRatio: 0.12 }], { regenPerSecond: 12, perDamaged: 6 }),
  shot("neru", "초근거리 난사", 2, 21, 1.45),
  active("izuna", "인법 · 신속", "기본 공격마다 코스트 15. 60에서 3초간 공격 주기 230ms, 이동 주기 90ms 단축.", self, [{ type: "buff", durationMs: 3000, modifiers: { stats: { interval: -230, moveMs: -90 } } }], { perBasicAttack: 15 }),
  shot("mika", "별의 낙하", 4, 32, 2.25),
  shot("shiroko", "드론 지원 사격", 4, 12, 1.6),
  active("koharu", "구호 수류탄", "초당 코스트 16. 60에서 5칸 내 체력 비율이 가장 낮은 아군을 42 + 대상 최대 체력의 10% 회복.", ally, [{ type: "heal", amount: 42, maxHpRatio: 0.10 }], { regenPerSecond: 16 }),
  shot("aru", "하드보일드 폭발", 5, 27, 1.25, 1),
  shot("haruna", "미식가의 정밀탄", 5, 19, 1.95),
  active("hifumi", "페로로의 응원", "초당 코스트 14. 60에서 5칸 내 체력 비율이 가장 낮은 아군에게 보호막 44.", ally, [{ type: "shield", amount: 44 }], { regenPerSecond: 14 }),
  shot("hina", "종막의 일제 사격", 5, 34, 1.4, 1),
  shot("iori", "삼연속 정밀 사격", 5, 14, 1.9),
  active("maki", "그래피티 표식", "기본 공격마다 코스트 15. 60에서 5칸 내 가장 가까운 적에게 공격력의 90% 피해와 3초간 받는 피해 25% 증가.", closest, [{ type: "damage", amount: 0, attackScale: 0.9 }, { type: "buff", durationMs: 3000, modifiers: { damageTakenMultiplier: 1.25 } }], { perBasicAttack: 15 }),
  active("aris", "빛의 검 · 충전 포격", "초당 코스트 12, 기본 공격마다 8. 60에서 5칸 내 가장 가까운 적과 주변 1칸의 적에게 30 + 공격력의 135% 피해.", { ...closest, radius: 1 }, [{ type: "damage", amount: 30, attackScale: 1.35 }], { regenPerSecond: 12, perBasicAttack: 8 }),
  active("midori", "동료의 체력 회복", "기본 공격마다 코스트 20. 60에서 5칸 내 체력 비율이 가장 낮은 아군을 35 회복.", ally, [{ type: "heal", amount: 35 }], { perBasicAttack: 20 }),
  shot("yuzu", "픽셀 유탄", 4, 26, 1.05, 1),
  shot("azusa", "집중 사격", 4, 25, 1.85),
  shot("wakamo", "만개의 탄환", 5, 33, 2.05),
  active("noa", "약점 기록", "초당 코스트 15. 60에서 5칸 내 가장 가까운 적이 4초간 받는 피해가 35% 증가.", closest, [{ type: "buff", durationMs: 4000, modifiers: { damageTakenMultiplier: 1.35 } }], { regenPerSecond: 15 }),
];
export const BLUE_ARCHIVE_SKILLS = Object.fromEntries(blueArchiveSkills.map(skill => [skill.id, skill]));
