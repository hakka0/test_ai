import {EQUIPMENT} from '../shared/catalog';
import type {Action,SelfPlayerSnapshot} from '../shared/model';
import {equipmentIntent} from './equipment-intent';
import {GestureClicks} from './interaction';
type Target={el:HTMLElement;unitId?:string;name?:string;own:boolean}|null;
export function createEquipmentUI(options:{player:()=>SelfPlayerSnapshot|undefined;editable:()=>boolean;readOnly:()=>boolean;blocked:()=>boolean;beforeDrag:()=>void;commit:(action:Action)=>void;notice:(text:string)=>void;target:(el:HTMLElement|null)=>Target;openItem:(id:string,source:HTMLElement)=>void;closeItem:()=>void;clicks:GestureClicks}) {
 const panel=document.createElement('aside');panel.id='equipment-sidebar';panel.className='equipment-sidebar';panel.setAttribute('aria-label','보유 장비와 조합 재료');
 panel.innerHTML=`<div class="equipment-heading"><button id="equipment-toggle" type="button" aria-controls="equipment-body" aria-expanded="false"><svg class="equipment-panel-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 7V5a4 4 0 0 1 8 0v2M5 7h14l1 14H4Z"/><path d="M8 7v4m8-4v4"/></svg>장비 <span id="equipment-count">0</span></button><button id="equipment-close" type="button" aria-label="장비 패널 접기">✕</button></div><div id="equipment-body"><p class="equipment-help">아이템을 누르면 설명과 관련 조합식을 확인합니다. 장비는 유닛 위로 드래그하거나 상세 창의 ‘장착할 유닛 선택’을 눌러 장착합니다.</p><div id="equipment-stash"></div><p id="equipment-selection" role="status">보관 중인 장비</p><button id="equipment-cancel" type="button" hidden>장비 선택 취소</button></div>`;
 document.querySelector('main')!.append(panel);
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const ghost=document.createElement('div');ghost.id='equipment-drag-ghost';ghost.className='hidden';ghost.setAttribute('aria-hidden','true');
 ghost.innerHTML='<strong id="equipment-drag-item"></strong><strong id="equipment-target-name"></strong><span id="equipment-target-reason"></span>';document.body.append(ghost);
 const live=document.createElement('div');live.id='equipment-target-live';live.className='visually-hidden';live.setAttribute('role','status');live.setAttribute('aria-live','polite');document.body.append(live);
 let selectedItem='',key='',hint:HTMLElement|null=null,lastAnnouncement='',detailFrame=0;
 let drag:{id:string;pointer:number;startX:number;startY:number;x:number;y:number;touch:boolean;active:boolean}|null=null;
 function setOpen(open:boolean){options.beforeDrag();panel.classList.toggle('is-open',open);syncExpanded();}
 function syncExpanded(){const overlay=document.documentElement.dataset.screenMode==='mobile'||innerWidth<=700||(innerHeight<=540&&innerWidth>innerHeight);const open=!overlay||panel.classList.contains('is-open');$('equipment-toggle').setAttribute('aria-expanded',String(open));$('equipment-body').inert=!open;}
 $('equipment-toggle').onclick=()=>setOpen(!panel.classList.contains('is-open'));$('equipment-close').onclick=()=>setOpen(false);
 $('equipment-cancel').onclick=cancel;
 function clearHint(){hint?.classList.remove('equipment-drop-valid','equipment-drop-invalid');hint=null;}
 function updateSelection(){
  $('equipment-selection').textContent='';
  $('equipment-selection').hidden=true;
  $('equipment-cancel').hidden=!selectedItem;panel.classList.toggle('has-item-selection',!!selectedItem);
  for(const b of panel.querySelectorAll<HTMLElement>('[data-equipment-item]'))b.setAttribute('aria-pressed',String(b.dataset.equipmentItem===selectedItem));
 }
 function stopDrag(){const d=drag;drag=null;ghost.classList.add('hidden');clearHint();document.body.classList.remove('dragging-equipment');if(d?.active)options.clicks.end(d.pointer,d.x,d.y,performance.now());if(d&&document.body.hasPointerCapture(d.pointer))document.body.releasePointerCapture(d.pointer);}
 function cancel(){cancelAnimationFrame(detailFrame);detailFrame=0;stopDrag();selectedItem='';updateSelection();live.textContent='';lastAnnouncement='';}
 function selectForEquip(id:string){const item=options.player()?.inventory.find(i=>i.id===id&&i.unitId===null);if(!item||EQUIPMENT[item.definition].category==='material'||!options.editable()||options.readOnly())return;cancel();selectedItem=id;updateSelection();options.notice('장착할 유닛을 선택하세요.');}
 function targetAt(x:number,y:number){return options.target(document.elementFromPoint(x,y) as HTMLElement|null);}
 function intent(id:string,t:Target){return equipmentIntent(options.player(),id,t?.own?t.unitId:undefined,options.editable());}
 function showTarget(){
  if(!drag?.active)return;
  const t=targetAt(drag.x,drag.y),plan=intent(drag.id,t),item=options.player()?.inventory.find(i=>i.id===drag!.id);
  clearHint();if(t){hint=t.el;hint.classList.add(plan.valid?'equipment-drop-valid':'equipment-drop-invalid');}
  ghost.dataset.valid=String(plan.valid);ghost.dataset.targetUnit=t?.own?t.unitId??'':'';
  $('equipment-drag-item').textContent=item?EQUIPMENT[item.definition].name:'장비';
  $('equipment-target-name').textContent=t?.name?`${plan.valid?'→':'×'} ${t.name}`:'대상 유닛 없음';
  $('equipment-target-reason').textContent=t&&!t.own?'상대 유닛에게는 장착할 수 없습니다.':plan.reason;
  const text=$('equipment-target-name').textContent+' · '+$('equipment-target-reason').textContent;
  if(text!==lastAnnouncement){lastAnnouncement=text;live.textContent=text;}
  const width=210,left=Math.max(4,Math.min(innerWidth-width-4,drag.x-width/2)),top=Math.max(4,Math.min(innerHeight-108,drag.y-(drag.touch?130:110)));
  ghost.style.transform=`translate3d(${left}px,${top}px,0)`;
 }
 function render(){
  const player=options.player(),items=player?.inventory.filter(i=>i.unitId===null)??[];
  if((drag&&!items.some(i=>i.id===drag!.id))||(selectedItem&&!items.some(i=>i.id===selectedItem)))cancel();
  const next=JSON.stringify([items,options.readOnly()]);if(next!==key){key=next;const focus=(document.activeElement as HTMLElement|null)?.dataset.equipmentItem;
   $('equipment-count').textContent=String(items.length);const cards=items.map(item=>{const def=EQUIPMENT[item.definition],b=document.createElement('button');b.type='button';b.className='equipment-source';b.dataset.equipmentItem=item.id;b.dataset.category=def.category;b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls','craft-dialog');b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',`${def.name}, ${def.description}, 상세와 조합식 열기${def.category==='material'?'':', 유닛으로 드래그해 장착'}`);
    const icon=document.createElement('span'),label=document.createElement('span'),name=document.createElement('strong'),tier=document.createElement('span');icon.className='equipment-icon';icon.textContent=def.category==='material'?'◇':item.definition.includes('armor')?'▣':item.definition.includes('charm')?'✦':'⚔';name.textContent=def.name;tier.textContent=def.category==='material'?'조합 재료':`${def.tier}등급`;label.append(name,tier);b.append(icon,label);return b;});
   const groups:HTMLElement[]=[];
   for(const [category,label] of [['equipment','장비'],['material','재료']] as const){const matching=cards.filter(card=>card.dataset.category===category);if(!matching.length)continue;const section=document.createElement('section'),heading=document.createElement('h3');section.className='equipment-group';section.dataset.equipmentGroup=category;heading.textContent=`${label} ${matching.length}`;section.append(heading,...matching);groups.push(section);}
   $('equipment-stash').replaceChildren(...groups);if(!items.length)$('equipment-stash').textContent='장비 없음';
   if(focus)panel.querySelector<HTMLElement>(`[data-equipment-item="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
  }syncExpanded();updateSelection();showTarget();
 }
 document.addEventListener('pointerdown',e=>{
  if(!e.isPrimary){cancel();return;}if(e.button!==0||options.blocked())return;
  const el=(e.target as HTMLElement).closest<HTMLElement>('[data-equipment-item]');
  if(el){if(options.readOnly())return;e.stopImmediatePropagation();options.beforeDrag();options.clicks.begin();drag={id:el.dataset.equipmentItem!,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,touch:e.pointerType!=='mouse',active:false};document.body.setPointerCapture(e.pointerId);}
  else if(selectedItem&&!options.readOnly()&&(e.target as HTMLElement).closest('#cells button,[data-bench-slot]')){options.clicks.begin();e.stopImmediatePropagation();}
 },true);
 document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;drag.x=e.clientX;drag.y=e.clientY;if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<8)return;
  if(options.blocked()){cancel();return;}if(e.cancelable)e.preventDefault();if(!drag.active){options.closeItem();drag.active=true;document.body.classList.add('dragging-equipment');ghost.classList.remove('hidden');}showTarget();e.stopImmediatePropagation();
 },{capture:true,passive:false});
 document.addEventListener('pointerup',e=>{if(!drag||drag.pointer!==e.pointerId)return;e.stopImmediatePropagation();drag.x=e.clientX;drag.y=e.clientY;const d=drag,plan=intent(d.id,targetAt(d.x,d.y));stopDrag();
  if(!d.active){options.clicks.end(d.pointer,d.x,d.y,performance.now());cancelAnimationFrame(detailFrame);detailFrame=requestAnimationFrame(()=>{detailFrame=0;const source=panel.querySelector<HTMLElement>(`[data-equipment-item="${CSS.escape(d.id)}"]`);if(source&&!options.blocked())options.openItem(d.id,source);});return;}
  selectedItem='';updateSelection();if(plan.action)options.commit(plan.action);else if(!plan.valid)options.notice(plan.reason);
 },true);
 document.addEventListener('click',e=>{
  const source=(e.target as HTMLElement).closest<HTMLElement>('[data-equipment-item]');
  if(source){e.stopImmediatePropagation();if(options.clicks.consume(e,performance.now())||options.blocked())return;options.openItem(source.dataset.equipmentItem!,source);return;}
  if(options.readOnly()||!selectedItem||!(e.target as HTMLElement).closest('#cells button,[data-bench-slot]'))return;
  e.preventDefault();e.stopImmediatePropagation();if(options.clicks.consume(e,performance.now()))return;
  const plan=intent(selectedItem,options.target(e.target as HTMLElement));if(plan.action){selectedItem='';updateSelection();options.commit(plan.action);}else options.notice(plan.reason);
 },true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(drag||selectedItem)){e.preventDefault();e.stopImmediatePropagation();cancel();}},true);
 document.addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId)cancel();},true);
 document.body.addEventListener('lostpointercapture',e=>{if(drag?.pointer===e.pointerId)cancel();});
 window.addEventListener('resize',()=>{cancel();syncExpanded();});window.addEventListener('orientationchange',cancel);window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 panel.addEventListener('dragstart',e=>e.preventDefault());render();
 return {render,cancel,selectForEquip,get dragging(){return !!drag;}};
}
