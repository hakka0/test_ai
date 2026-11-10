import {UNITS,statsFor} from '../shared/catalog';
import {SKILLS} from '../shared/skill-catalog';
import {skillDescriptionFor} from '../shared/skill-description';
import {canAcquireUnit} from '../shared/bench';
import type {SelfPlayerSnapshot,Snapshot} from '../shared/model';
import {createTooltipHover} from './tooltip-hover';

const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Selection={roomId:string;playerId:string;offerId:string;revision:number};
type ShopDrag=Selection&{pointer:number;x:number;y:number;lastX:number;lastY:number;touch:boolean;active:boolean};
export function createShopPreviewUI(options:{
 state:()=>{snapshot:Snapshot|null;player:SelfPlayerSnapshot|undefined;inspectable:boolean;canBuy:boolean;canDropOnBench:boolean};
 commit:(offerId:string,revision:number)=>void;
 ignoreClick:(event:MouseEvent)=>boolean;
 endGesture:(pointer:number,x:number,y:number)=>void;
}){
 const offers=document.getElementById('shop-offers')!,dock=document.getElementById('pc-dock-reserve')!,bench=document.getElementById('bench')!;
 const tip=document.createElement('div');tip.id='shop-unit-tooltip';tip.className='help-tooltip shop-unit-tooltip';
 tip.setAttribute('role','tooltip');tip.setAttribute('popover','manual');tip.hidden=true;document.body.append(tip);
 const ghost=document.createElement('div');ghost.className='shop-drag-ghost';ghost.hidden=true;ghost.setAttribute('aria-hidden','true');document.body.append(ghost);
 let active:Selection|null=null,drag:ShopDrag|null=null,detailKey='';
 const pc=()=>document.documentElement.dataset.screenMode==='pc';
 const sourceFor=(selection:Selection)=>offers.querySelector<HTMLButtonElement>(`[data-offer="${CSS.escape(selection.offerId)}"]`);
 const hover=createTooltipHover({tip,source:()=>active?sourceFor(active):null,close:closeTip});
 function selectionFor(source:HTMLButtonElement):Selection|undefined{
  const {player:p,snapshot:s,inspectable}=options.state();
  if(p&&s&&inspectable&&!source.disabled&&Number(source.dataset.revision)===p.shopRevision&&p.shop.some(o=>o.id===source.dataset.offer&&!o.sold))
   return {roomId:s.roomId,playerId:p.id,offerId:source.dataset.offer!,revision:p.shopRevision};
 }
 function current(selection:Selection|null){
  const state=options.state(),p=state.player,s=state.snapshot;
  if(!selection||!p||!s||!state.inspectable||s.roomId!==selection.roomId||p.id!==selection.playerId||p.shopRevision!==selection.revision)return;
  const offer=p.shop.find(o=>o.id===selection.offerId&&!o.sold);return offer?{...state,p,s,offer}:undefined;
 }
 function purchasable(selection:Selection|null){
  const c=current(selection);return c&&c.canBuy&&c.p.gold>=c.offer.cost&&canAcquireUnit(c.p,c.offer.kind,c.s.phase==='prepare')?c:undefined;
 }
 function closeTip(){
  hover.cancel();
  if(tip.matches(':popover-open'))tip.hidePopover();tip.hidden=true;active=null;detailKey='';
  offers.querySelectorAll('[aria-describedby="shop-unit-tooltip"]').forEach(card=>card.removeAttribute('aria-describedby'));
 }
 function endDrag(){
  const previous=drag;drag=null;
  ghost.hidden=true;ghost.replaceChildren();bench.classList.remove('shop-drop-valid','shop-drop-invalid');
  offers.querySelectorAll('.shop-drag-source').forEach(card=>card.classList.remove('shop-drag-source'));
  document.body.classList.remove('dragging-shop');
  if(previous){
   if(previous.active)options.endGesture(previous.pointer,previous.lastX,previous.lastY);
   if(document.body.hasPointerCapture(previous.pointer))document.body.releasePointerCapture(previous.pointer);
  }
 }
 function close(){closeTip();endDrag();}
 function position(source:HTMLElement){
  const r=source.getBoundingClientRect(),shop=dock.getBoundingClientRect(),edge=8,gap=8;
  const above=Math.min(shop.top,r.top)-gap-edge,beside=above<160&&shop.left>180;
  tip.style.width=`${Math.min(320,innerWidth-edge*2,beside?shop.left-gap-edge:Infinity)}px`;
  tip.style.maxHeight=`${Math.max(96,beside?innerHeight-edge*2:Math.max(above,innerHeight-r.bottom-gap-edge))}px`;
  const b=tip.getBoundingClientRect(),top=beside?r.top+r.height/2-b.height/2:above>=b.height?Math.min(shop.top,r.top)-gap-b.height:r.bottom+gap;
  tip.style.left=`${Math.round(Math.max(edge,Math.min(innerWidth-b.width-edge,beside?shop.left-gap-b.width:r.left+r.width/2-b.width/2)))}px`;
  tip.style.top=`${Math.round(Math.max(edge,Math.min(innerHeight-b.height-edge,top)))}px`;
 }
 function refresh(){
  if(drag&&(!purchasable(drag)||!sourceFor(drag)?.isConnected))endDrag();
  if(!active)return;
  const c=current(active),source=sourceFor(active);
  if(!pc()||drag?.active||!c||!source||source.disabled){closeTip();return;}
  const key=`${c.offer.id}:${c.offer.kind}`;
  if(key!==detailKey){
   detailKey=key;const d=UNITS[c.offer.kind],stats=statsFor({kind:c.offer.kind,rank:1,equipment:[]},[]);
   tip.innerHTML=d.skills.map(id=>SKILLS[id]).sort((a,b)=>Number(a.kind==='active')-Number(b.kind==='active')).map(skill=>
    `<section class="shop-skill-effect" data-skill-kind="${skill.kind}"><strong>${skill.kind==='passive'?'패시브':'액티브'} · ${escape(skill.name)}</strong><p>${escape(skillDescriptionFor(skill,stats))}</p></section>`).join('');
  }
  source.setAttribute('aria-describedby',tip.id);position(source);
 }
 function show(source:HTMLButtonElement){
  hover.cancel();if(!pc()||drag?.active)return;
  const selection=selectionFor(source);if(!selection)return;
  if(active?.offerId===selection.offerId){hover.enter();refresh();return;}
  closeTip();active=selection;document.dispatchEvent(new CustomEvent('game-tooltip-open',{detail:tip}));
  hover.enter();
  tip.hidden=false;refresh();if(!active)return;
  if(typeof tip.showPopover==='function')tip.showPopover();position(source);
 }
 function purchase(selection:Selection|undefined){
  if(!selection||!purchasable(selection))return;
  close();options.commit(selection.offerId,selection.revision);
 }
 offers.addEventListener('click',e=>{
  if(options.ignoreClick(e))return;
  const source=(e.target as Element).closest<HTMLButtonElement>('[data-offer]');if(source)purchase(selectionFor(source));
 });
 offers.addEventListener('pointerover',e=>{const source=(e.target as Element).closest<HTMLButtonElement>('[data-offer]');if(e.pointerType==='mouse'&&source)show(source);});
 offers.addEventListener('pointerout',e=>{
  const source=(e.target as Element).closest('[data-offer]');
  if(source&&active&&source===sourceFor(active))hover.leave(e.relatedTarget);
 });
 offers.addEventListener('focusin',e=>{const source=(e.target as Element).closest<HTMLButtonElement>('[data-offer]');if(source?.matches(':focus-visible'))show(source);});
 offers.addEventListener('focusout',e=>{if(!(e.relatedTarget instanceof Node&&offers.contains(e.relatedTarget)))hover.leave(e.relatedTarget);});
 offers.addEventListener('pointerdown',e=>{
  if(!e.isPrimary){close();return;}
  const source=(e.target as Element).closest<HTMLButtonElement>('[data-offer]');
  const selection=source&&selectionFor(source);if(e.button!==0||drag||!selection||!purchasable(selection))return;
  drag={...selection,pointer:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,touch:e.pointerType!=='mouse',active:false};
  // Preserve normal button activation until actual movement crosses the threshold.
 });
 function dropAt(x:number,y:number){
  const hit=document.elementFromPoint(x,y),inside=!!hit&&bench.contains(hit);
  return {inside,valid:inside&&options.state().canDropOnBench&&!!purchasable(drag)};
 }
 document.addEventListener('pointermove',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;
  drag.lastX=e.clientX;drag.lastY=e.clientY;
  if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<8)return;
  if(!purchasable(drag)){endDrag();return;}
  if(e.cancelable)e.preventDefault();
  if(!drag.active){
   const source=sourceFor(drag);if(!source){endDrag();return;}
   closeTip();drag.active=true;document.body.setPointerCapture(e.pointerId);
   ghost.innerHTML=source.innerHTML+'<span class="shop-drag-label"></span>';
   // The ghost lives outside #shop-panel. Give its portrait a separate class
   // so legacy responsive shop-portrait sizes cannot shrink or scale it.
   ghost.querySelector('.shop-portrait')!.classList.replace('shop-portrait','shop-drag-portrait');
   const box=source.getBoundingClientRect();
   ghost.style.width=`${box.width}px`;ghost.style.height=`${box.height}px`;
   ghost.dataset.rarity=source.dataset.rarity;ghost.hidden=false;
   document.body.classList.add('dragging-shop');source.classList.add('shop-drag-source');
  }
  const target=dropAt(e.clientX,e.clientY),width=parseFloat(ghost.style.width),height=parseFloat(ghost.style.height);
  ghost.style.transform=`translate3d(${e.clientX-width/2}px,${e.clientY-height/2-(drag.touch?40:12)}px,0)`;
  ghost.dataset.valid=String(target.valid);
  ghost.querySelector('.shop-drag-label')!.textContent=target.valid?'구매':options.state().canDropOnBench?'대기석에 놓으세요':'내 전장으로 돌아오세요';
  bench.classList.toggle('shop-drop-valid',target.valid);bench.classList.toggle('shop-drop-invalid',target.inside&&!target.valid);
 },{passive:false});
 document.addEventListener('pointerup',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;
  drag.lastX=e.clientX;drag.lastY=e.clientY;
  const selection=drag,valid=drag.active&&dropAt(e.clientX,e.clientY).valid;
  endDrag();if(valid)purchase(selection);
 });
 document.addEventListener('pointerdown',e=>{
  if(!e.isPrimary){close();return;}
  if(active&&!tip.contains(e.target as Node)&&!offers.contains(e.target as Node))closeTip();
 },true);
 document.addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId)endDrag();});
 // Touch starts with implicit capture on the card. Its lost-capture event
 // bubbles when capture moves to body; only losing body's capture ends a drag.
 document.body.addEventListener('lostpointercapture',e=>{if(e.target===document.body&&drag?.pointer===e.pointerId)endDrag();});
 offers.addEventListener('dragstart',e=>e.preventDefault());
 document.addEventListener('game-tooltip-open',e=>{if((e as CustomEvent).detail!==tip)closeTip();});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&(active||drag)){e.preventDefault();e.stopImmediatePropagation();close();}},true);
 window.addEventListener('resize',close);window.addEventListener('orientationchange',close);window.addEventListener('blur',close);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
 document.addEventListener('scroll',e=>{if(active&&!tip.contains(e.target as Node))refresh();},true);
 document.addEventListener('close',refresh,true);
 return {refresh,close};
}
