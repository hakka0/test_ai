import { EQUIPMENT, ITEM_RECIPES } from "./catalog";
import type { Player, Item } from "./model";

export function recipeFor(a: string, b: string): string | null {
  const recipe = ITEM_RECIPES.find(r => (r.materials[0] === a && r.materials[1] === b) || (r.materials[0] === b && r.materials[1] === a));
  return recipe ? `${recipe.result}-t2` : null;
}
export function grantItem(p: Player, definition: string) {
  if (!Object.hasOwn(EQUIPMENT, definition)) throw new Error("Unknown item definition");
  const item: Item = { id: `${p.id}-item-${p.nextItemId++}`, definition, unitId: null };
  p.inventory.push(item);
  return item;
}
export function craftItems(p: Player, input: unknown): string | null {
  if (!Array.isArray(input) || input.length !== 2 || !input.every(id => typeof id === "string") || input[0] === input[1])
    return "서로 다른 재료 아이템 2개를 선택하세요.";
  const items = input.map(id => p.inventory.find(i => i.id === id));
  if (items.some(i => !i)) return "보유하지 않은 재료입니다.";
  if (items.some(i => i!.unitId !== null || p.units.some(u => u.equipment.includes(i!.id))))
    return "보관 중인 재료만 조합할 수 있습니다.";
  const result = recipeFor(items[0]!.definition, items[1]!.definition);
  if (!result) return "이 재료 조합의 제작법이 없습니다.";
  // Validate every input first; consume both instances and issue one fresh item atomically.
  p.inventory = p.inventory.filter(i => !input.includes(i.id));
  grantItem(p, result);
  return null;
}
