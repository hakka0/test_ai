import {TRAITS,synergyTier,type Synergy,type SynergyTier} from '../shared/synergy';
import type {Trait} from '../shared/model';

const escapeText=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const countValue=(count:number)=>Number.isFinite(count)?Math.max(0,Math.floor(count)):0;
const emblems:Record<Trait,string>={
 bulwark:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="M12 7v9m-4-5h8"/>',
 scout:'<path d="m5 5 7 7-7 7m7-14 7 7-7 7"/>',
 arcane:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
};
function effectValue(tier:SynergyTier):string {
 const b=tier.bonus;
 if(b.hpMultiplier!==undefined)return `${Math.round((b.hpMultiplier-1)*100)}%`;
 if(b.attackMultiplier!==undefined)return `${Math.round((b.attackMultiplier-1)*100)}%`;
 return String(b.shield??0);
}
function tiers(trait:Trait,count:number,effects=false):string {
 const current=synergyTier(trait,count)?.threshold;
 return TRAITS[trait].tiers.map(t=>`<span class="synergy-tier${effects?' synergy-effect-value':' synergy-threshold'}" data-threshold="${t.threshold}" data-current="${current===t.threshold}">${effects?effectValue(t):t.threshold}</span>`).join('<span class="synergy-separator" aria-hidden="true">/</span>');
}
export function synergyCountHTML(trait:Trait,count:number):string {
 count=countValue(count);
 return `<span class="synergy-count"><span class="synergy-count-now">${count}</span><span class="synergy-thresholds">${tiers(trait,count)}</span></span>`;
}
export function synergyEffectHTML(trait:Trait,count:number):string {
 return `<span class="synergy-effect-label">${escapeText(TRAITS[trait].effectLabel)} </span><span class="synergy-effect-values">${tiers(trait,countValue(count),true)}</span><span class="synergy-effect-label"> 증가</span>`;
}
export function synergyCards(synergies:readonly Synergy[]):string {
 return synergies.map(s=>{
  const d=TRAITS[s.trait],count=countValue(s.count),current=synergyTier(s.trait,count);
  const stage=d.tiers.filter(t=>count>=t.threshold).length;
  const grade=stage?['bronze','silver','gold','purple'][Math.min(3,stage-1)]:'inactive';
  const label=`${d.name}, 서로 다른 ${count}종, 기준 ${d.tiers.map(t=>t.threshold).join('·')}종, ${current?current.description:'효과 미적용'}, 조합 효과 보기`;
  return `<button type="button" class="synergy-card synergy-compact" data-help="trait-${s.trait}" data-help-activation="click" aria-expanded="false" aria-controls="game-help-tooltip" data-trait="${s.trait}" data-synergy-count="${count}" data-synergy-grade="${grade}" data-active="${Boolean(current)}" aria-label="${escapeText(label)}"><span class="synergy-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${emblems[s.trait]}</svg></span><span class="synergy-current"><span class="synergy-name"><span class="synergy-count-now">${count}</span><strong>${escapeText(d.name)}</strong></span><span class="synergy-thresholds">${tiers(s.trait,count)}</span></span></button>`;
 }).join('');
}
export function synergyHelpHTML(trait:Trait,count:number):string {
 return `<p class="synergy-help-effect">${synergyEffectHTML(trait,count)}</p>`;
}
