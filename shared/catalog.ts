import type { Kind, Stats, Fighter, Rarity, UnitRank, Trait, Roster } from "./model";
import { RANK_STAT_MULTIPLIER } from "./merge";
import type { CombatAttribute } from "./combat-attributes";
import { BASE_COMBAT_STATS, clampDamageStats } from "./damage";
import { BLUE_ARCHIVE_KINDS, BLUE_ARCHIVE_UNITS, type BlueArchiveKind } from "./blue-archive";
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
const ORIGINAL_UNITS: Record<Exclude<Kind, BlueArchiveKind>, UnitDefinition> = {
  knight: {
    name: "루멘",
    attackAttribute: "red", defenseAttribute: "blue",
    rarity: 1,
    trait: "bulwark",
    skills: ["guardian", "lastStand"],
    role: "수호 기사",
    image: "/units/knight.svg",
    stats: { ...BASE_COMBAT_STATS, hp: 220, attack: 24, defense: 12, interval: 1000, range: 1, moveMs: 480 },
  },
  ranger: {
    name: "실바",
    attackAttribute: "yellow", defenseAttribute: "red",
    rarity: 2,
    trait: "scout",
    skills: ["piercingArrow", "forestBreath"],
    role: "숲의 궁수",
    image: "/units/ranger.svg",
    stats: { ...BASE_COMBAT_STATS, hp: 175, attack: 23, defense: 10, interval: 800, range: 3, moveMs: 450 },
  },
  mage: {
    name: "노바",
    attackAttribute: "blue", defenseAttribute: "purple",
    rarity: 3,
    trait: "arcane",
    skills: ["nova", "starWard"],
    role: "별빛 마법사",
    image: "/units/mage.svg",
    stats: { ...BASE_COMBAT_STATS, hp: 150, attack: 39, defense: 8, interval: 1400, range: 3, moveMs: 520 },
  },
  warden: {
    name: "아르덴", rarity: 2, trait: "bulwark", role: "방패 파수꾼",
    attackAttribute: "yellow", defenseAttribute: "blue",
    image: "/units/warden.svg", skills: ["ironWard", "steadfast"],
    stats: { ...BASE_COMBAT_STATS, hp: 250, attack: 18, defense: 14, interval: 1150, range: 1, moveMs: 500 },
  },
  skirmisher: {
    name: "카이", rarity: 1, trait: "scout", role: "쌍검 정찰병",
    attackAttribute: "purple", defenseAttribute: "yellow",
    image: "/units/skirmisher.svg", skills: ["doubleStrike", "quickstep"],
    stats: { ...BASE_COMBAT_STATS, hp: 195, attack: 25, defense: 10, interval: 850, range: 1, moveMs: 400 },
  },
  oracle: {
    name: "세라", rarity: 2, trait: "arcane", role: "별빛 치유사",
    attackAttribute: "blue", defenseAttribute: "red",
    image: "/units/oracle.svg", skills: ["starlightHeal", "gentleWard"],
    stats: { ...BASE_COMBAT_STATS, hp: 165, attack: 17, defense: 9, interval: 1100, range: 3, moveMs: 480 },
  },
  // Temporary characters for real 2/4/6 composition testing. Fixed sample rolls
  // keep shared server/client definitions identical; balance is intentionally provisional.
  bastion: {
    name:"브릭",rarity:1,trait:"bulwark",role:"중장갑 사수",
    attackAttribute:"purple",defenseAttribute:"red",image:"/units/bastion.svg",skills:["ironWard","starWard"],
    stats:{...BASE_COMBAT_STATS,hp:285,attack:21,defense:16,interval:1300,range:2,moveMs:560},
  },
  vanguard: {
    name:"로건",rarity:3,trait:"bulwark",role:"돌격 대원",
    attackAttribute:"blue",defenseAttribute:"yellow",image:"/units/vanguard.svg",skills:["doubleStrike","forestBreath"],
    stats:{...BASE_COMBAT_STATS,hp:205,attack:36,defense:9,interval:700,range:1,moveMs:380},
  },
  sentinel: {
    name:"아이언",rarity:2,trait:"bulwark",role:"방어 요원",
    attackAttribute:"red",defenseAttribute:"purple",image:"/units/sentinel.svg",skills:["guardian","steadfast"],
    stats:{...BASE_COMBAT_STATS,hp:320,attack:15,defense:18,interval:1500,range:3,moveMs:620},
  },
  breacher: {
    name:"브루트",rarity:1,trait:"bulwark",role:"진입 대원",
    attackAttribute:"yellow",defenseAttribute:"red",image:"/units/breacher.svg",skills:["nova","quickstep"],
    stats:{...BASE_COMBAT_STATS,hp:180,attack:31,defense:7,interval:900,range:2,moveMs:420},
  },
  marksman: {
    name:"레이븐",rarity:3,trait:"scout",role:"지정 사수",
    attackAttribute:"red",defenseAttribute:"purple",image:"/units/marksman.svg",skills:["piercingArrow","lastStand"],
    stats:{...BASE_COMBAT_STATS,hp:135,attack:46,defense:6,interval:1600,range:4,moveMs:540},
  },
  striker: {
    name:"제트",rarity:2,trait:"scout",role:"기동 사수",
    attackAttribute:"blue",defenseAttribute:"yellow",image:"/units/striker.svg",skills:["doubleStrike","quickstep"],
    stats:{...BASE_COMBAT_STATS,hp:170,attack:20,defense:8,interval:600,range:2,moveMs:320},
  },
  tracker: {
    name:"에코",rarity:1,trait:"scout",role:"추적 요원",
    attackAttribute:"purple",defenseAttribute:"blue",image:"/units/tracker.svg",skills:["starlightHeal","gentleWard"],
    stats:{...BASE_COMBAT_STATS,hp:225,attack:18,defense:11,interval:1200,range:3,moveMs:450},
  },
  infiltrator: {
    name:"쉐이드",rarity:3,trait:"scout",role:"침투 요원",
    attackAttribute:"yellow",defenseAttribute:"red",image:"/units/infiltrator.svg",skills:["guardian","forestBreath"],
    stats:{...BASE_COMBAT_STATS,hp:190,attack:34,defense:10,interval:800,range:1,moveMs:360},
  },
  channeler: {
    name:"베가",rarity:2,trait:"arcane",role:"에너지 사수",
    attackAttribute:"purple",defenseAttribute:"yellow",image:"/units/channeler.svg",skills:["nova","steadfast"],
    stats:{...BASE_COMBAT_STATS,hp:155,attack:43,defense:7,interval:1700,range:4,moveMs:580},
  },
  disruptor: {
    name:"오닉스",rarity:1,trait:"arcane",role:"교란 요원",
    attackAttribute:"red",defenseAttribute:"blue",image:"/units/disruptor.svg",skills:["piercingArrow","starWard"],
    stats:{...BASE_COMBAT_STATS,hp:240,attack:27,defense:13,interval:1100,range:2,moveMs:490},
  },
  medic: {
    name:"루나",rarity:3,trait:"arcane",role:"의무 대원",
    attackAttribute:"yellow",defenseAttribute:"purple",image:"/units/medic.svg",skills:["starlightHeal","lastStand"],
    stats:{...BASE_COMBAT_STATS,hp:200,attack:14,defense:12,interval:900,range:3,moveMs:470},
  },
  technomancer: {
    name:"픽셀",rarity:2,trait:"arcane",role:"전술 기술자",
    attackAttribute:"blue",defenseAttribute:"red",image:"/units/technomancer.svg",skills:["ironWard","gentleWard"],
    stats:{...BASE_COMBAT_STATS,hp:145,attack:38,defense:5,interval:1000,range:4,moveMs:400},
  },
};
// Preserve the original mixed-composition fixture as the catalogue grows.
export const CORE_UNIT_KINDS = ["knight","ranger","mage","warden","skirmisher","oracle"] as const satisfies readonly Kind[];
export const UNIT_KINDS = Object.keys(ORIGINAL_UNITS) as Kind[];
export const UNITS: Record<Kind, UnitDefinition> = { ...ORIGINAL_UNITS, ...BLUE_ARCHIVE_UNITS };
// Older match data has no roster marker. New rooms explicitly select Blue Archive.
export function unitKindsFor(roster?: Roster): readonly Kind[] {
  return roster === "blueArchive" ? BLUE_ARCHIVE_KINDS : UNIT_KINDS;
}
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
