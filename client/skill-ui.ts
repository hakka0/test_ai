import { assetUrl } from "../shared/assets";
import type { Stats, FighterSnapshot } from '../shared/model';
import type { SkillDefinition } from '../shared/skill-types';
import { skillDescriptionFor } from '../shared/skill-description';
import { skillCardState } from './skill-presentation';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const imageFor=(skill:SkillDefinition)=>skill.image??assetUrl('/skills/default.svg');
const kindFor=(skill:SkillDefinition)=>skill.kind==='active'?'액티브':'패시브';
const costFor=(skill:SkillDefinition)=>skill.resource?.max??0;

export function skillCardHTML(skill:SkillDefinition,unitId:string,fighter:FighterSnapshot|undefined,now:number) {
 const state=skillCardState(skill,fighter,now);
 return `<button type="button" class="skill-card skill-summary-card${state.running?' skill-running':''}${state.used?' skill-consumed':''}" data-skill-kind="${skill.kind}" data-skill-unit="${escape(unitId)}" data-skill-id="${escape(skill.id)}" aria-expanded="false" aria-controls="skill-detail-tooltip" aria-label="${escape(skill.name)}, ${kindFor(skill)}, 필요 코스트 ${costFor(skill)}, 상세 효과 보기"><img class="skill-image" src="${escape(imageFor(skill))}" alt=""><span class="skill-summary"><strong>${escape(skill.name)}</strong><span class="skill-meta"><span class="skill-kind">${kindFor(skill)}</span><span class="skill-required-cost">코스트 ${costFor(skill)}</span></span></span></button>`;
}

export interface SkillDetails {
 skill:SkillDefinition;
 stats:Pick<Stats,'interval'|'moveMs'>;
 fighter?:FighterSnapshot;
 now:number;
}

export function createSkillDetailsUI(details:(unitId:string,skillId:string)=>SkillDetails|undefined) {
 const tip=document.createElement('div');tip.id='skill-detail-tooltip';tip.className='help-tooltip skill-tooltip';
 tip.setAttribute('role','tooltip');tip.setAttribute('popover','manual');tip.hidden=true;
 tip.innerHTML='<div class="skill-detail-heading"><img id="skill-detail-image" class="skill-image" alt=""><div><strong id="skill-detail-name"></strong><div id="skill-detail-meta" class="skill-meta"></div></div></div><div class="skill-detail-body"><p id="skill-detail-description"></p><div id="skill-detail-resource"></div><p id="skill-detail-status"></p></div>';
 document.body.append(tip);
 const find=<T extends HTMLElement=HTMLElement>(id:string)=>tip.querySelector<T>(`#skill-detail-${id}`)!;
 const text=(id:string,value:string)=>{const node=find(id);if(node.textContent!==value)node.textContent=value;};
 let active:{unitId:string;skillId:string;source:HTMLElement;parent:HTMLDialogElement|null}|null=null,lastResource:string|null=null;
 let pinned=false,leaveTimer=0;
 const trigger=(target:EventTarget|null)=>(target as Element|null)?.closest<HTMLElement>('button.skill-card[data-skill-id]');
 const mobile=()=>document.documentElement.dataset.screenMode==='mobile';
 function cancelLeave(){window.clearTimeout(leaveTimer);leaveTimer=0;}
 function close(){
  cancelLeave();
  if(active){active.source.setAttribute('aria-expanded','false');active.source.removeAttribute('aria-describedby');}
  if(tip.matches(':popover-open'))tip.hidePopover();
  tip.hidden=true;active=null;lastResource=null;pinned=false;
 }
 function position(){
  if(!active)return;
  const r=active.source.getBoundingClientRect(),edge=8,gap=8;
  const below=innerHeight-r.bottom-gap-edge,above=r.top-gap-edge;
  tip.style.maxHeight=`${Math.max(1,Math.min(innerHeight-edge*2,Math.max(below,above)))}px`;
  const box=tip.getBoundingClientRect();
  const preferred=below>=box.height||below>=above?r.bottom+gap:r.top-gap-box.height;
  tip.style.top=`${Math.round(Math.max(edge,Math.min(innerHeight-box.height-edge,preferred)))}px`;
  tip.style.left=`${Math.round(Math.max(edge,Math.min(innerWidth-box.width-edge,r.left+r.width/2-box.width/2)))}px`;
 }
 function refresh(){
  if(!active)return;
  const data=details(active.unitId,active.skillId);
  const source=active.source,r=source.getBoundingClientRect();
  if(!data||!source.isConnected||source.closest('[hidden],[inert]')||!source.getClientRects().length||r.bottom<=0||r.top>=innerHeight||
    (active.parent&&!active.parent.open)||[...document.querySelectorAll('dialog[open]')].some(d=>d!==active!.parent)){close();return;}
  const {skill,fighter,stats,now}=data,state=skillCardState(skill,fighter,now);
  text('name',skill.name);
  const img=find<HTMLImageElement>('image');if(img.getAttribute('src')!==imageFor(skill))img.src=imageFor(skill);
  text('meta',`${kindFor(skill)} · 필요 코스트 ${costFor(skill)}`);
  text('description',skillDescriptionFor(skill,stats));
  const resource=skill.resource?`<div class="cost-track" role="progressbar" aria-label="현재 코스트" aria-valuemin="0" aria-valuemax="${skill.resource.max}" aria-valuenow="${state.cost.toFixed(1)}"><span style="width:${Math.min(100,state.cost/skill.resource.max*100)}%"></span></div><div class="cost-value">코스트 ${Math.floor(state.cost)}/${skill.resource.max}</div>`:'';
  if(resource!==lastResource){find('resource').innerHTML=resource;lastResource=resource;}
  text('status',state.dead?'':state.running?'효과 유지 중':state.used?'이번 전투 사용 완료':state.cooldown?`재사용 대기 ${state.cooldown}초`:'');
  find('status').hidden=!find('status').textContent;
  position();
 }
 function show(source:HTMLElement,pin:boolean){
  if(!details(source.dataset.skillUnit!,source.dataset.skillId!))return;
  cancelLeave();
  if(active?.source!==source){close();active={unitId:source.dataset.skillUnit!,skillId:source.dataset.skillId!,source,parent:source.closest('dialog')};(active.parent??document.body).append(tip);}
  pinned=pin;source.setAttribute('aria-expanded','true');source.setAttribute('aria-describedby',tip.id);
  document.dispatchEvent(new CustomEvent('game-tooltip-open',{detail:tip}));
  tip.hidden=false;refresh();if(!active)return;
  if(typeof tip.showPopover==='function'&&!tip.matches(':popover-open'))tip.showPopover();
  position();
 }
 function leave(){if(!pinned){cancelLeave();leaveTimer=window.setTimeout(close,120);}}
 document.addEventListener('close',e=>{if(active?.parent===e.target)close();},true);
 document.addEventListener('click',e=>{
  const source=trigger(e.target);
  if(!source||source.closest('[hidden],[inert]'))return;
  if(mobile()){if(active?.source===source&&pinned)close();else show(source,true);}
  else show(source,false);
 });
 document.addEventListener('pointerdown',e=>{if(active&&!tip.contains(e.target as Node)&&trigger(e.target)!==active.source)close();},true);
 document.addEventListener('pointerover',e=>{const source=trigger(e.target);if(!mobile()&&e.pointerType==='mouse'&&source)show(source,false);});
 document.addEventListener('pointerout',e=>{if(active&&active.source===trigger(e.target)&&!(e.relatedTarget instanceof Node&&(active.source.contains(e.relatedTarget)||tip.contains(e.relatedTarget))))leave();});
 tip.addEventListener('pointerenter',cancelLeave);
 tip.addEventListener('pointerleave',e=>{if(!(e.relatedTarget instanceof Node&&active?.source.contains(e.relatedTarget)))leave();});
 document.addEventListener('focusin',e=>{const source=trigger(e.target);if(source&&!mobile()&&source.matches(':focus-visible'))show(source,false);else if(active&&e.target!==active.source&&!tip.contains(e.target as Node))close();});
 document.addEventListener('game-tooltip-open',e=>{if((e as CustomEvent).detail!==tip)close();});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();e.stopImmediatePropagation();close();}},true);
 window.addEventListener('blur',close);
 window.addEventListener('resize',()=>{if(active)requestAnimationFrame(refresh);});
 document.addEventListener('scroll',e=>{if(active&&!tip.contains(e.target as Node))refresh();},true);
 return {refresh,close};
}
