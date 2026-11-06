import { UNITS, type TeamBonus } from "./catalog";
import type { Kind, Trait, Snapshot, PublicPlayerSnapshot, SelfPlayerSnapshot } from "./model";
import { deploymentLimit } from "./progression";

export interface SynergyTier { threshold:number; description:string; bonus:TeamBonus; }
function trait(name:string,effectLabel:string,tiers:readonly SynergyTier[]){return {name,effectLabel,tiers,...tiers[0]};}
export const TRAITS = {
  bulwark:trait('수호','수호 유닛의 강화 기본 체력',[
    {threshold:2,description:'수호 유닛의 강화 기본 체력 +15%',bonus:{hpMultiplier:1.15}},
    {threshold:4,description:'수호 유닛의 강화 기본 체력 +30%',bonus:{hpMultiplier:1.3}},
    {threshold:6,description:'수호 유닛의 강화 기본 체력 +50%',bonus:{hpMultiplier:1.5}},
  ]),
  scout:trait('정찰','정찰 유닛의 강화 기본 공격력',[
    {threshold:2,description:'정찰 유닛의 강화 기본 공격력 +15%',bonus:{attackMultiplier:1.15}},
    {threshold:4,description:'정찰 유닛의 강화 기본 공격력 +30%',bonus:{attackMultiplier:1.3}},
    {threshold:6,description:'정찰 유닛의 강화 기본 공격력 +50%',bonus:{attackMultiplier:1.5}},
  ]),
  arcane:trait('비전','비전 유닛의 전투 시작 보호막',[
    {threshold:2,description:'비전 유닛의 전투 시작 보호막 +30',bonus:{shield:30}},
    {threshold:4,description:'비전 유닛의 전투 시작 보호막 +60',bonus:{shield:60}},
    {threshold:6,description:'비전 유닛의 전투 시작 보호막 +100',bonus:{shield:100}},
  ]),
} satisfies Record<Trait,{name:string;effectLabel:string;tiers:readonly SynergyTier[];threshold:number;description:string;bonus:TeamBonus}>;
export const TRAIT_IDS = Object.keys(TRAITS) as Trait[];
export interface Synergy { trait: Trait; count: number; active: boolean; }
export function synergyTier(trait:Trait,count:number):SynergyTier|undefined{
  const tiers=TRAITS[trait].tiers;
  for(let i=tiers.length-1;i>=0;i--)if(count>=tiers[i].threshold)return tiers[i];
}

// Caller supplies one team's deployed roster (or frozen combat roster).
// Dead fighters remain in that roster: composition is locked at battle start.
export function evaluateSynergies(units: readonly { kind: Kind; x: number }[]): Synergy[] {
  const kinds = new Set(units.filter(u => u.x >= 0).map(u => u.kind));
  return TRAIT_IDS.map(trait => {
    const count = [...kinds].filter(kind => UNITS[kind].trait === trait).length;
    return { trait, count, active: count >= TRAITS[trait].threshold };
  });
}

export function bonusFor(kind: Kind, synergies: readonly Synergy[]): TeamBonus {
  const trait = UNITS[kind].trait;
  const s=synergies.find(s=>s.trait===trait);
  return s?.active?synergyTier(trait,s.count)?.bonus??{}:{};
}

// UI uses only the viewer's filtered snapshot. Combat counts include dead fighters.
export function synergiesForPlayer(s: Pick<Snapshot, "phase" | "fighters">, p: PublicPlayerSnapshot | SelfPlayerSnapshot): Synergy[] {
  const combat = s.phase === "combat" || s.phase === "result" || s.phase === "finished";
  return evaluateSynergies(combat && s.fighters.length
    ? s.fighters.filter(f => f.owner === p.id)
    : p.units.filter(u => u.x >= 0).slice(0, deploymentLimit(p)));
}
