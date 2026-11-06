import {MAX_INTEREST} from '../shared/match-rules';
import { UNIT_STAT_HELP } from './unit-stats';
import {TRAITS,TRAIT_IDS} from '../shared/synergy';
import {synergyHelpHTML} from './synergy-ui';

type Help = {title:string;text?:string;sources?:string[]};
const help:Record<string,Help> = {
 ...Object.fromEntries(TRAIT_IDS.map(id=>[`trait-${id}`,{title:TRAITS[id].name}])),
 streak:{title:'연승·연패 추가 골드',text:'2~3회 +1G, 4회 +2G, 5회 이상 +3G\n전투 종료 직후 지급합니다. 미니언전은 연속 횟수에 포함하지 않습니다.'},
 ...UNIT_STAT_HELP,
 skills:{title:'스킬',text:'PC는 스킬 칸에 마우스를 올리고, 모바일은 스킬 칸을 터치해 상세 효과와 현재 코스트·재사용 상태를 툴팁에서 확인합니다. 스킬은 조건을 충족하면 자동으로 발동합니다. 발동 순간에는 노란색으로 빛나며, 지속형 스킬의 효과가 유지되는 동안에는 초록색으로 표시합니다. 기본 공격 시 5, 피격 시 3의 코스트를 회복하며 스킬별 추가 회복량이 더해집니다. 지속형 스킬은 별도 설정이 없으면 유지 중 회복하지 않습니다. 주기 감소율은 해당 유닛의 표시 능력치와 실제 전투 진행 간격을 기준으로 계산합니다.'},
 skillUsed:{title:'이번 전투 사용 완료',text:'이번 전투에서 사용할 수 있는 횟수를 모두 소모했습니다. 다음 전투가 시작되면 다시 사용할 수 있습니다.'},
 equipment:{title:'장비 장착',sources:['help-equipment-source'],text:'유닛당 장비 2개까지 장착할 수 있습니다. 전투 중 변경한 장비는 다음 전투부터 반영됩니다.'},
 synergy:{title:'출전 조합',sources:['synergy-timing'],text:'전장에 배치한 유닛의 계열만 표시합니다. 같은 계열의 서로 다른 2·4·6종에서 단계가 올라가며 가장 높은 단계의 효과를 적용합니다. 중복 종류와 대기석은 제외합니다. 준비 중에는 현재 배치, 전투·결과에서는 전투 시작 조합을 표시합니다. 상대 조합은 순위에서 해당 유저를 선택해 확인합니다.'},
 inventory:{title:'아이템 보관',sources:['help-inventory-source']},
 craft:{title:'아이템과 조합',text:'재료를 누르면 해당 재료로 만들 수 있는 장비를 표시합니다. 조합식을 선택하고 조합 제작을 눌러 제작합니다. 같은 재료끼리도 서로 다른 아이템 2개가 필요합니다. 완성품은 2등급입니다. 제작은 준비 완료 전 준비 단계에서만 가능합니다. 장비는 드래그하거나 장착할 유닛 선택을 눌러 장착합니다.'},
 contributions:{title:'유닛별 기여도',sources:['help-contributions-source']},
 rewardSummary:{title:'라운드 보상',sources:['reward-summary-help'],text:'유닛 레어도와 강화 등급은 별개입니다. 아이템 1등급은 조합 재료, 2~5등급은 장비입니다. 실제 유닛 확률은 기본 레어도 확률에 공유 풀의 남은 비율과 본인의 3성 완성을 반영해 조정합니다.'},
 reward:{title:'보상 선택',sources:['reward-help'],text:'유닛 레어도와 강화 등급은 별개입니다. 아이템 1등급은 조합 재료, 2~5등급은 장비입니다. 실제 유닛 확률은 기본 레어도 확률에 공유 풀의 남은 비율과 본인의 3성 완성을 반영해 조정합니다.'},
 peek:{title:'전장 확인',text:'눈 버튼을 한 번 누르면 보상 내용만 숨기고 아군·적 유닛의 상세 정보를 확인할 수 있습니다. 장비·전투 기록·정보 메뉴와 배치·구매·경험치 등 나머지 조작은 잠깁니다. 눈 버튼은 원래 자리에 남으며, 다시 누르면 보상 선택으로 돌아옵니다.'},
 final:{title:'다시 플레이',sources:['final-replay-help']},
 unit:{title:'유닛 조작',sources:['help-unit-placement-source'],text:'파란 ★는 합성으로 올라가는 강화 등급, 노란 ★ 숫자는 유닛 종류에 정해진 레어도, G는 골드 가격입니다. 선택한 유닛에는 노란 역삼각형과 칸 테두리가 표시됩니다. 유닛을 선택한 뒤 빈 아군 칸이나 대기석을 누르세요. 드래그로 이동하거나 다른 내 유닛과 자리를 바꿀 수도 있습니다. 내 유닛의 초상화를 누르면 장비·판매 관리를 엽니다. 배치는 준비 완료 전에 변경할 수 있습니다. 판매는 준비 완료 전과 라운드 결과에서 가능하며, 전투 중에는 대기석 유닛만 판매할 수 있습니다.'},
 unitEquipment:{title:'유닛 장비 관리',sources:['help-unit-equipment-source']},
 income:{title:'라운드 수입',text:`기본 수입과 이자는 준비 시작에 지급합니다. 이자는 최대 ${MAX_INTEREST}골드입니다. 연승·연패는 2~3회 +1G, 4회 +2G, 5회 이상 +3G를 전투 종료 직후 지급하며 미니언전은 포함하지 않습니다.`},
};

/** One nonmodal balloon, shared by mouse, keyboard and touch controls. */
export function createHelpTooltips() {
 const vault=document.createElement('div');vault.id='help-sources';vault.hidden=true;
 document.body.append(vault);
 function take(selector:string,id?:string) {
  const node=document.querySelector<HTMLElement>(selector);if(!node)return;
  if(id)node.id=id;vault.append(node);
 }
 take('.equipment-help','help-equipment-source');
 take('#synergy-timing');
 take('#equipment-panel > p.help','help-inventory-source');
 take('.history-contribution-section > p.small','help-contributions-source');
 for(const id of ['reward-summary-help','reward-help','reward-peek-help','final-replay-help'])take(`#${id}`);
 take('#dialog-equipment-panel > p.help','help-unit-equipment-source');
 take('#unit-dialog > p.small.muted','help-unit-placement-source');
 // Headings have no separate information buttons. Direct stat, streak and
 // synergy controls still use this shared tooltip; legacy helper text stays hidden.

 const tip=document.createElement('div');tip.id='game-help-tooltip';tip.className='help-tooltip';
 tip.setAttribute('role','tooltip');tip.setAttribute('popover','manual');tip.hidden=true;
 document.body.append(tip);
 let active:HTMLButtonElement|null=null,pinned=false,lastText='',frame=0,openedAt=0;
 function content(button:HTMLButtonElement) {
  const entry=help[button.dataset.help!];
  const parts=(entry.sources??[]).map(id=>{
   const copy=document.getElementById(id)?.cloneNode(true) as HTMLElement|undefined;
   copy?.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));
   return copy?.textContent?.trim()??'';
  });
  if(entry.text)parts.push(entry.text);
  const trait=TRAIT_IDS.find(id=>button.dataset.help===`trait-${id}`);
  return {title:trait?`${TRAITS[trait].name} ${Number(button.dataset.synergyCount??0)}`:button.dataset.helpTitle??entry.title,text:parts.filter(Boolean).join('\n\n'),html:trait?synergyHelpHTML(trait,Number(button.dataset.synergyCount??0)):undefined};
 }
 function close() {
  if(!active)return;
  active.setAttribute('aria-expanded','false');active.removeAttribute('aria-describedby');
  if(tip.matches(':popover-open'))tip.hidePopover();
  tip.hidden=true;active=null;pinned=false;lastText='';
 }
 function position() {
  if(!active)return;
  const r=active.getBoundingClientRect(),gap=8,edge=8;
  const below=innerHeight-r.bottom-gap-edge,above=r.top-gap-edge;
  // Keep a long balloon on one side of its trigger, so the same mobile button
  // remains available to close it even beside a taller sticky dialog heading.
  tip.style.maxHeight=`${Math.max(1,Math.min(innerHeight-edge*2,Math.max(below,above)))}px`;
  const box=tip.getBoundingClientRect();
  let top=below>=box.height||below>=above?r.bottom+gap:r.top-gap-box.height;
  top=Math.max(edge,Math.min(innerHeight-box.height-edge,top));
  const left=Math.max(edge,Math.min(innerWidth-box.width-edge,r.left+r.width/2-box.width/2));
  tip.style.left=`${Math.round(left)}px`;tip.style.top=`${Math.round(top)}px`;
 }
 function refresh() {
  if(!active)return;
  const modals=[...document.querySelectorAll('dialog[open]')],modal=modals.at(-1);
  if(!active.isConnected||active.closest('[hidden],[inert]')||!active.getClientRects().length||(modal&&!modal.contains(active))){close();return;}
  const {title,text,html}=content(active),next=title+'\n'+(html??text);
  if(next!==lastText){
   lastText=next;const heading=document.createElement('strong'),body=document.createElement(html?'div':'p');
   heading.textContent=title;
   if(html)body.innerHTML=html;else body.textContent=text;
   tip.replaceChildren(heading,body);
  }
  position();
 }
 function show(button:HTMLButtonElement,pin:boolean) {
  document.dispatchEvent(new CustomEvent('game-tooltip-open',{detail:tip}));
  if(active!==button){close();active=button;const parent=button.closest('dialog')??document.body;parent.append(tip);}
  pinned=pin;openedAt=performance.now();button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby',tip.id);
  tip.hidden=false;refresh();if(!active)return;
  if(typeof tip.showPopover==='function'&&!tip.matches(':popover-open'))tip.showPopover();
  position();
 }
 const trigger=(target:EventTarget|null)=>(target as Element|null)?.closest<HTMLButtonElement>('[data-help]');
 const mobile=()=>document.documentElement.dataset.screenMode==='mobile';
 document.addEventListener('game-tooltip-open',e=>{if((e as CustomEvent).detail!==tip)close();});
 document.addEventListener('click',e=>{
  const button=trigger(e.target);if(!button)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!mobile()&&button.dataset.helpActivation!=='click')return;
  if(active===button&&pinned)close();else show(button,true);
 },true);
 document.addEventListener('pointerdown',e=>{if(active&&!tip.contains(e.target as Node)&&!trigger(e.target))close();},true);
 document.addEventListener('pointerover',e=>{const button=trigger(e.target);if(!mobile()&&e.pointerType==='mouse'&&button&&button.dataset.helpActivation!=='click')show(button,false);});
 document.addEventListener('pointerout',e=>{
  if(!pinned&&active===trigger(e.target)&&!(e.relatedTarget instanceof Node&&active?.contains(e.relatedTarget)))close();
 });
 tip.addEventListener('pointerleave',e=>{if(!pinned&&!(e.relatedTarget instanceof Node&&active?.contains(e.relatedTarget)))close();});
 // Capture before native dialog cancellation or equipment-selection shortcuts.
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();e.stopImmediatePropagation();close();}},true);
 document.addEventListener('focusin',e=>{if(active&&pinned&&e.target!==active&&!tip.contains(e.target as Node))close();});
 window.addEventListener('resize',close);window.addEventListener('blur',close);
 // A focused trigger can scroll its dialog before the queued scroll event fires.
 document.addEventListener('scroll',e=>{if(e.target===tip)return;if(pinned&&performance.now()-openedAt<150)position();else close();},true);
 document.addEventListener('close',close,true);
 // Rendered headings and dynamic reward text can change while a balloon is open.
 new MutationObserver(()=>{if(active&&!frame)frame=requestAnimationFrame(()=>{frame=0;refresh();});})
  .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','inert','open','data-screen-mode']});
}
