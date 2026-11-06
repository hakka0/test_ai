export const COMBAT_ATTRIBUTE_IDS = ["red", "yellow", "blue", "purple"] as const;
export type CombatAttribute = (typeof COMBAT_ATTRIBUTE_IDS)[number];

// Shared by attack and defense; ownership decides which attribute an effect uses.
export const COMBAT_ATTRIBUTES: Record<CombatAttribute, { name: string; color: number; css: string }> = {
  red: { name: "빨강", color: 0xff667a, css: "#ff667a" },
  yellow: { name: "노랑", color: 0xffd45c, css: "#ffd45c" },
  blue: { name: "파랑", color: 0x66baff, css: "#66baff" },
  purple: { name: "보라", color: 0xc58aff, css: "#c58aff" },
};
