import { EQUIPMENT, UNITS, unitKindsFor } from "./catalog";
import { acquireUnit } from "./bench";
import { grantItem } from "./crafting";
import type { Player, Rarity, RewardOption } from "./model";
import { UNIT_POOL_SIZE, canClaimUnit, hasMaxRank, pickPoolKind, remainingCopies } from "./unit-pool";
import { removeMaxRankOffers } from "./shop";

export const REWARD_INTERVAL = 5;
// Each row is a reward milestone (5, 10, ... 40). Percentages sum to 100.
export const UNIT_REWARD_ODDS = [
  [65, 30, 5], [50, 35, 15], [35, 40, 25], [25, 40, 35],
  [15, 40, 45], [10, 35, 55], [5, 30, 65], [5, 25, 70],
];
export const ITEM_REWARD_ODDS = [
  [60, 35, 5, 0, 0], [45, 35, 15, 5, 0], [35, 30, 20, 12, 3], [25, 30, 25, 15, 5],
  [20, 25, 25, 20, 10], [15, 20, 25, 25, 15], [10, 15, 25, 30, 20], [10, 10, 20, 30, 30],
];
export function rewardMilestone(round: number) { return Math.min(7, Math.max(0, Math.floor(round / REWARD_INTERVAL) - 1)); }
export function rollTier(weights: number[], random = Math.random): Rarity {
  let value = Math.max(0, Math.min(0.999999999, random())) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) { value -= weights[i]; if (value < 0) return (i + 1) as Rarity; }
  return weights.length as Rarity;
}
function pick<T>(values: T[], random: () => number): T { return values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))]; }
export function offerRoundReward(p: Player, round: number, random = Math.random, players: readonly Player[] = [p]) {
  if (round <= 0 || round % REWARD_INTERVAL || p.pendingReward?.round === round || p.lastReward?.round === round) return;
  if (p.pendingReward) autoClaimReward(p);
  const index = rewardMilestone(round);
  const rosterKinds = unitKindsFor(p.roster);
  const weights=UNIT_REWARD_ODDS[index].map((weight,i)=>{
    const kinds=rosterKinds.filter(kind=>UNITS[kind].rarity===i+1);
    const copies=kinds.filter(kind=>!hasMaxRank(p,kind)).reduce((n,kind)=>n+remainingCopies(players,kind),0);
    return kinds.length ? weight*copies/(UNIT_POOL_SIZE*kinds.length) : 0;
  });
  const unitTier = weights.some(w=>w>0) ? rollTier(weights, random) : null, itemTier = rollTier(ITEM_REWARD_ODDS[index], random);
  const kind = unitTier===null ? null : pickPoolKind(p,players,random,rosterKinds.filter(kind=>UNITS[kind].rarity===unitTier));
  const definition = pick(Object.keys(EQUIPMENT).filter(id => EQUIPMENT[id].tier === itemTier), random);
  const id = `${p.id}-reward-${p.nextRewardId++}`;
  p.pendingReward = { id, round, options: [
    { id: `${id}-gold`, type: "gold", amount: 10 + index * 2 },
    ...(kind===null?[]:[{ id: `${id}-unit`, type: "unit" as const, kind }]),
    { id: `${id}-item`, type: "item", definition },
  ] };
}
export function chooseReward(p: Player, rewardId: unknown, optionId: unknown, automatic = false, players: readonly Player[] = [p]): string | null {
  const reward = p.pendingReward;
  if (!reward || reward.id !== rewardId) return "선택할 보상이 없거나 이미 수령했습니다.";
  const option = reward.options.find(o => o.id === optionId);
  if (!option) return "보상 후보를 다시 선택하세요.";
  if (option.type === 'unit' && !canClaimUnit(p,option.kind,players,{rewardId:reward.id})) return '이 유닛은 3성을 완성했거나 공유 풀에 남아 있지 않습니다. 다른 보상을 선택하세요.';
  if (option.type === "unit" && !acquireUnit(p, option.kind)) return "대기석이 가득 찼습니다. 빈자리를 만들거나 다른 보상을 선택하세요.";
  if (option.type === "gold") p.gold += option.amount;
  if (option.type === "item") grantItem(p, option.definition);
  p.lastReward = { round: reward.round, option: { ...option } as RewardOption, automatic };
  p.pendingReward = null;
  if(option.type==='unit')removeMaxRankOffers(p,players);
  return null;
}
export function autoClaimReward(p: Player) {
  const reward = p.pendingReward, gold = reward?.options.find(o => o.type === "gold");
  if (reward && gold) chooseReward(p, reward.id, gold.id, true);
}
