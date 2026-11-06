import type {Snapshot} from '../shared/model';
import {RewardPresentation} from './reward-presentation';
export function createRewardUI(options:{snapshot:()=>Snapshot|null;viewerId:()=>string;gameNow:()=>number;beforeOpen:()=>void;cancelInteractions:()=>void;changed:()=>void}) {
 const state=new RewardPresentation(),$=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const dialog=$<HTMLDialogElement>('reward-dialog'),eye=$<HTMLButtonElement>('reward-peek');
 const eyeRow=eye.closest<HTMLElement>('.reward-peek-row')!;
 const eyeHome=document.createComment('reward eye home');eye.before(eyeHome);
 let eyeRight=0,eyeTop=4;
 eye.setAttribute('aria-controls','reward-panel');
 const locked=new Map<HTMLElement,boolean>();
 const lockSelectors='header,#screen-mode-footer,.matchbar,#player-ranking,#scout-banner,#synergy-panel,#equipment-sidebar,#pc-play-dock,#pc-overview,#inspection-tabs,#combat-content,#pc-info-dialog,#craft-dialog';
 function syncAccess(){
  if(state.peeking){
   for(const el of document.querySelectorAll<HTMLElement>(lockSelectors)){if(!locked.has(el))locked.set(el,el.inert);el.inert=true;}
  }else{for(const [el,inert] of locked)el.inert=inert;locked.clear();}
 }
 // Restrict mouse, touch and keyboard activation to unit inspection and the eye.
 const allowed=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('#reward-peek,#cells button,#units [data-unit],#mobile-bench-viewport,#mobile-bench-prev,#mobile-bench-next,#selected-unit-content,#unit-dialog,#game-help-tooltip');
 for(const type of ['pointerdown','click','keydown'] as const)window.addEventListener(type,e=>{
  if(!state.peeking||allowed(e.target)||(e instanceof KeyboardEvent&&['Tab','Escape'].includes(e.key)))return;
  e.preventDefault();e.stopImmediatePropagation();
 },true);
 function position(){
  if(!dialog.open)return;
  const board=$('board-wrap').getBoundingClientRect(),box=dialog.getBoundingClientRect();
  const view=window.visualViewport,w=view?.width??innerWidth,h=view?.height??innerHeight,x=view?.offsetLeft??0,y=view?.offsetTop??0;
  dialog.style.left=`${Math.max(x+8,Math.min(x+w-box.width-8,board.left+(board.width-box.width)/2))}px`;
  dialog.style.top=`${Math.max(y+8,Math.min(y+h-box.height-8,board.top+(board.height-box.height)/2))}px`;
 }
 // Preserve the original eye coordinates, including above a modal unit detail.
 function mountEye(){
  const unit=$<HTMLDialogElement>('unit-dialog'),floating=state.peeking&&unit.open;
  if(floating){
   const row=eyeRow.getBoundingClientRect(),box=eye.getBoundingClientRect();
   if(eye.parentElement===eyeRow){eyeRight=row.right-box.right;eyeTop=box.top-row.top;}
   eye.style.left=`${row.right-eyeRight-box.width}px`;eye.style.top=`${row.top+eyeTop}px`;
   eye.classList.add('reward-eye-fixed');if(eye.parentElement!==unit)unit.append(eye);
  }else{
   if(eye.parentElement!==eyeRow)eyeHome.after(eye);
   eye.classList.remove('reward-eye-fixed');eye.style.removeProperty('left');eye.style.removeProperty('top');
  }
 }
 function paint(){
  document.body.classList.toggle('reward-inspecting',state.peeking);
  dialog.classList.toggle('peeking',state.peeking);$('reward-panel').inert=state.peeking;
  eye.setAttribute('aria-pressed',String(state.peeking));eye.disabled=!state.available;
  eye.setAttribute('aria-label',state.peeking?'보상 선택 창 다시 표시, 확인 전용 모드 끝내기':'보상 선택 창 숨기고 전장 확인');
  $('reward-peek-help').textContent=state.peeking?'유닛 상세만 확인 가능 · 같은 자리의 눈 버튼을 다시 누르면 보상 선택으로 돌아갑니다.':'눈 버튼을 누르면 보상 선택 창을 숨기고 아군·적 유닛의 상세를 확인합니다.';
  syncAccess();
 }
 function render(){
  const inspecting=state.peeking;
  state.observe(options.snapshot(),options.viewerId(),options.gameNow());
  if(inspecting&&!state.peeking)options.cancelInteractions();
  $('reward-open').hidden=!state.available||state.visible;
  const show=state.visible,modal=dialog.matches(':modal'),wasOpen=dialog.open;
  paint();
  if(show&&(!dialog.open||modal===state.peeking)){
   if(dialog.open)dialog.close();
   if(!state.peeking){
    options.beforeOpen();if(!wasOpen)$('board-wrap').scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    dialog.showModal();$('reward-message').textContent='';$('reward-title').focus({preventScroll:true});
   }else dialog.show();
  }else if(!show&&dialog.open)dialog.close();
  if(show){position();mountEye();requestAnimationFrame(()=>{position();mountEye();});}else mountEye();
 }
 function hide(){if(state.peeking)options.cancelInteractions();state.dismiss();render();}
 function reset(){if(state.peeking)options.cancelInteractions();state.reset();dialog.close();paint();mountEye();$('reward-open').hidden=true;$('reward-message').textContent='';}
 $('reward-open').onclick=()=>{state.open();render();options.changed();};
 $('reward-later').onclick=()=>{hide();options.changed();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();hide();options.changed();$('reward-open').focus({preventScroll:true});});
 eye.onclick=()=>{
  if(!state.togglePeek())return;
  options.cancelInteractions();render();options.changed();
  if(state.peeking)eye.focus({preventScroll:true});
 };
 // Native button activation provides click/tap/Enter/Space without key repeats.
 eye.addEventListener('keydown',e=>{if(e.repeat&&(e.code==='Enter'||e.code==='Space'))e.preventDefault();});
 new MutationObserver(()=>{if(state.peeking)mountEye();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 const resize=()=>requestAnimationFrame(()=>{position();mountEye();});
 window.addEventListener('resize',resize);window.addEventListener('orientationchange',resize);window.visualViewport?.addEventListener('resize',resize);
 return {render,hide,reset,syncAccess,get peeking(){return state.peeking;}};
}
