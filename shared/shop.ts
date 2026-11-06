import type { Kind, Player, ShopOffer, Unit, Rarity, Phase, Fighter } from "./model";
import { UNITS, unitKindsFor } from "./catalog";
import { hasMaxRank, pickPoolKind, remainingCopies } from "./unit-pool";
export const SHOP_SIZE = 5;
export const STARTING_GOLD = 10;
export const ROUND_INCOME = 5;
export const REROLL_COST = 5;
export function shopActionsOpen(phase: Phase, ready: boolean, now: number, deadline: number): boolean {
  return now < deadline && (phase === "combat" || phase === "result" || (phase === "prepare" && !ready));
}
export function economyActionOpen(type:'buy'|'reroll'|'buyExperience',phase:Phase,ready:boolean,now:number,deadline:number){
  return shopActionsOpen(phase,ready,now,deadline)||(type!=='buy'&&phase==='matching'&&now<deadline);
}
export function readyActionOpen(phase:Phase,ready:boolean,now:number,deadline:number){
  return now<deadline&&(phase==='matching'||phase==='prepare'&&!ready);
}
export function sellActionOpen(phase:Phase,ready:boolean,now:number,deadline:number,unit:Pick<Unit,'id'|'owner'|'x'>|undefined,fighters:readonly Pick<Fighter,'id'|'owner'>[]=[]):boolean {
  return !!unit&&shopActionsOpen(phase,ready,now,deadline)&&(phase!=='combat'||
    unit.x<0&&!fighters.some(f=>f.id===unit.id&&f.owner===unit.owner));
}
export function rarityPrice(rarity: Rarity): number {
  if (!Number.isInteger(rarity) || rarity < 1 || rarity > 5)
    throw new Error("Unit rarity must be an integer from 1 to 5");
  return rarity;
}
export function unitPrice(kind: Kind): number { return rarityPrice(UNITS[kind].rarity); }
// Refund the represented 1-star copies: 1x / 3x / 9x the rarity price.
export function unitSellPrice(unit: Pick<Unit, "kind" | "rank">): number {
  return unitPrice(unit.kind) * 3 ** (unit.rank - 1);
}
// Only the authoritative server calls this. Repeated kinds are intentional.
export function createOffer(p: Player, random = Math.random, players: readonly Player[] = [p]): ShopOffer | null {
  const kind = pickPoolKind(p, players, random);
  if (kind === null) return null;
  return { id: `${p.id}-offer-${p.nextOfferId++}`, kind, cost: unitPrice(kind), sold: false };
}
export function refreshShop(p: Player, random = Math.random, players: readonly Player[] = [p]) {
  p.shop = [];
  for (let i=0;i<SHOP_SIZE;i++) { const offer=createOffer(p,random,players);if(!offer)break;p.shop.push(offer); }
  p.shopRevision++;
}
export function canRefreshShop(p: Player, players: readonly Player[] = [p]) {
  return p.shop.some(o=>!o.sold&&!hasMaxRank(p,o.kind)) || unitKindsFor(p.roster).some(kind=>!hasMaxRank(p,kind)&&remainingCopies(players,kind)>0);
}
export function removeMaxRankOffers(p: Player, players: readonly Player[] = [p], random = Math.random) {
  const oldLength=p.shop.length;
  p.shop=p.shop.filter(o=>o.sold||!hasMaxRank(p,o.kind));
  if (p.shop.length !== oldLength) {
    while(p.shop.length<oldLength){const offer=createOffer(p,random,players);if(!offer)break;p.shop.push(offer);}
    p.shopRevision++;
  }
  if(p.pendingReward)p.pendingReward.options=p.pendingReward.options.filter(o=>o.type!=='unit'||!hasMaxRank(p,o.kind));
}
