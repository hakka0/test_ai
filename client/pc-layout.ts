import { BOARD_ASPECT } from "./board-geometry";
import type { Player, Snapshot, SelfPlayerSnapshot, PublicPlayerSnapshot } from "../shared/model";
import {deploymentLimit} from '../shared/progression';
// Shared dock/dialog structure; mode-specific CSS preserves the PC layout.
export function createPCLayout(options:{beforeChange:()=>void;afterChange:()=>void}) {
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const main=$('game-view'),side=document.querySelector<HTMLElement>('aside.side-panel')!;
 const overview=document.createElement('aside');overview.id='pc-overview';overview.setAttribute('aria-label','전투 요약과 추가 정보');
 overview.innerHTML=`<div id="pc-round-status" role="status"></div><div class="pc-info-buttons"><button data-pc-info="rewards">보상 · 수입</button><button data-pc-info="connection">방 · 연결 정보</button><button data-pc-info="help">플레이 방법</button><button data-pc-info="debug" id="pc-debug-open">개발 도구</button></div>`;
 const dock=document.createElement('section');dock.id='pc-play-dock';
 dock.setAttribute('aria-label','유닛 상점');
 dock.innerHTML=`<div id="shop-economy"><div id="dock-gold" class="dock-gold"><span class="dock-gold-label">보유 골드</span><span class="currency-coin gold-coin" aria-hidden="true"></span><div id="dock-gold-value"></div></div><div id="pc-growth" aria-label="레벨과 경험치"><div id="pc-progression"></div></div><div id="shop-control-column"><div class="dock-shop-tools"></div></div></div><div id="pc-dock-reserve"><div id="pc-shop" role="region" aria-label="상점" tabindex="0"></div></div><div id="dock-ready"><button type="button" id="dock-streak" data-help="streak" aria-expanded="false" aria-controls="game-help-tooltip" data-streak="none" aria-live="polite" aria-atomic="true" aria-label="연승·연패 기록 없음"><span class="streak-icon" id="dock-streak-icon" aria-hidden="true"></span><span id="dock-streak-label"></span></button></div><div id="pc-actions"></div>`;
 const leftRail=document.createElement('aside');leftRail.id='pc-left-rail';leftRail.setAttribute('aria-label','출전 조합과 보유 장비');
 const deployment=document.createElement('section');deployment.id='formation-deployment';
 deployment.innerHTML='<h2>출전 현황</h2><div class="formation-deployment-row"><div id="formation-deployed"></div><div><strong>배치 유닛</strong><div id="formation-slots" aria-hidden="true"></div><p id="formation-capacity"></p></div></div><p id="formation-combat-state" hidden>전투 진행 중 · 배치 잠김</p>';
 leftRail.append(deployment);
 const supply=document.createElement('section');supply.id='formation-supply';supply.setAttribute('aria-label','대기석과 상점');dock.append(supply);
 dock.querySelector('#dock-ready')!.insertAdjacentHTML('afterbegin','<p id="formation-ready-help">편성을 마치면<br>준비 완료를 눌러주세요.</p>');
 dock.querySelector('#dock-gold')!.insertAdjacentHTML('beforeend','<span id="formation-interest"></span>');
 const synergyPanel=$('synergy-panel');
 const benchRegion=document.createElement('div');benchRegion.id='pc-bench';benchRegion.setAttribute('role','region');benchRegion.setAttribute('aria-label','대기석');
 $('battlefield-stage').after(benchRegion);
 main.append(overview,leftRail,dock);
 $('dock-gold-value').append($('gold'));
 $('gold').setAttribute('aria-atomic','true');
 $('gold').setAttribute('aria-label','보유 골드 0');
 $('deployment-overlay').append($('deployed'));
 const dialog=document.createElement('dialog');dialog.id='pc-info-dialog';dialog.setAttribute('aria-labelledby','pc-info-title');
 dialog.innerHTML=`<div class="pc-info-heading"><h2 id="pc-info-title" tabindex="-1">추가 정보</h2><button id="pc-info-close" type="button" autofocus>닫기 ✕</button></div><div id="pc-info-tabs" role="group" aria-label="확인할 정보"><button data-pc-info="rewards">보상 · 수입</button><button data-pc-info="connection">방 · 연결</button><button data-pc-info="help">도움말</button><button data-pc-info="debug" id="pc-debug-tab">개발 도구</button></div><div id="pc-info-body"></div>`;
 for(const name of ['rewards','connection','help','debug']) {
  const panel=document.createElement('section');panel.id=`pc-info-${name}`;panel.hidden=true;dialog.querySelector('#pc-info-body')!.append(panel);
 }
 document.body.append(dialog);
 const income= document.createElement('section');income.className='pc-income-details';income.innerHTML='<h3>라운드 수입</h3>';$('pc-info-rewards').append(income);
 const moves:{node:HTMLElement;home:Comment;target:HTMLElement}[]=[];
 function move(node:HTMLElement,target:HTMLElement){const home=document.createComment('mobile home');node.before(home);moves.push({node,home,target});}
 const matchbar=document.querySelector<HTMLElement>('.matchbar')!;
 const header=document.querySelector<HTMLElement>('#app > header')!,headerActions=header.querySelector<HTMLElement>('.header-actions')!;
 matchbar.firstElementChild!.insertAdjacentHTML('beforeend','<div id="formation-stage-detail"></div>');
 const clock=document.createElement('div');clock.id='formation-clock';clock.innerHTML='<span id="formation-time-label">배치 종료까지</span><div class="formation-time-track"><i id="formation-time-fill"></i></div>';
 const matchTools=document.createElement('div');matchTools.id='pc-match-tools';matchbar.insertBefore(matchTools,$('timer'));
 matchbar.append(clock);clock.append($('timer'));
 const more=document.createElement('button');more.id='mobile-info-open';more.type='button';more.textContent='정보';more.setAttribute('aria-haspopup','dialog');matchTools.append(more);more.onclick=()=>open('rewards',more);
 move($('history-toggle'),matchTools);
 // Selection belongs to the battlefield; equipped gear and bench return belong to its dialog.
 const legacySelection=document.querySelector<HTMLElement>('.action-dock')!;
 const selection=$('selected-unit-panel');
 const controls=legacySelection.querySelector<HTMLElement>('.controls')!;
 controls.append($('clear-selection'));
 $('unit-dialog').querySelector('.sale-controls')!.before($('equipment-shortcut'),$('bench-button'));
 $('dock-ready').append($('ready'));$('pc-actions').append($('action-status'));
 const shopTools=dock.querySelector<HTMLElement>('.dock-shop-tools')!;shopTools.append($('reroll'));
 legacySelection.style.display='none';legacySelection.inert=true;dialog.append(legacySelection);
 document.querySelector('.arena-panel')!.after(selection);
 const benchViewport=document.createElement('div');benchViewport.id='mobile-bench-viewport';benchViewport.tabIndex=0;benchViewport.setAttribute('aria-label','대기석 12칸 · 좌우 이동');
 const benchRow=document.createElement('div');benchRow.className='mobile-bench-row';
 const arrows=['prev','next'].map((name,i)=>{const b=document.createElement('button');b.id=`mobile-bench-${name}`;b.type='button';b.className='mobile-bench-nav';b.textContent=i?'›':'‹';b.setAttribute('aria-label',i?'뒤쪽 대기석 보기':'앞쪽 대기석 보기');b.onclick=()=>{options.beforeChange();benchViewport.scrollBy({left:(i?1:-1)*Math.max(54,benchViewport.clientWidth-58),behavior:'auto'});};return b;});
 $('units').before(benchRow);benchRow.append(arrows[0],benchViewport,arrows[1]);benchViewport.append($('units'));
 function benchNav(){arrows[0].disabled=benchViewport.scrollLeft<1;arrows[1].disabled=benchViewport.scrollLeft+benchViewport.clientWidth>=benchViewport.scrollWidth-1;}
 benchViewport.addEventListener('scroll',benchNav,{passive:true});new ResizeObserver(benchNav).observe(benchViewport);
 move($('bench'),$('pc-bench'));move($('shop-panel'),$('pc-shop'));
 move(document.querySelector<HTMLElement>('.progression-panel')!,$('pc-progression'));

 move(synergyPanel,leftRail);
 move($('reward-summary'),$('pc-info-rewards'));move($('income-label'),income);
 move($('connection'),$('pc-info-connection'));
 move($('debug-panel'),$('pc-info-debug'));
 move(side.querySelector<HTMLElement>(':scope > details:last-child')!,$('pc-info-help'));
 // Keep the unit dialog's render sources out of the visible information menu.
 side.hidden=true;side.inert=true;document.body.append(side);
 let active=false,mode:'pc'|'mobile'|null=null,opener:HTMLElement|null=null;
 function placeStatus(){
  if(!mode)return;
  const wide=mode==='pc'&&innerWidth>700&&!document.documentElement.classList.contains('landscape-layout');
  document.documentElement.classList.toggle('tactical-desktop',wide);
  document.body.classList.toggle('formation-reference',wide&&!document.body.classList.contains('home-active'));
  const sidebar=document.getElementById('equipment-sidebar');
  if(wide){
   if(matchbar.parentElement!==header)header.insertBefore(matchbar,headerActions);
   if(matchTools.parentElement!==headerActions)headerActions.prepend(matchTools);
   if($('room-code-control').parentElement!==$('pc-info-connection'))$('pc-info-connection').prepend($('room-code-control'));
   if(benchRegion.parentElement!==supply)supply.prepend(benchRegion);
   if($('pc-dock-reserve').parentElement!==supply)supply.append($('pc-dock-reserve'));
   if($('deployed').parentElement!==$('formation-deployed'))$('formation-deployed').append($('deployed'));
   if(synergyPanel.parentElement!==leftRail)leftRail.append(synergyPanel);
   if(sidebar&&sidebar.parentElement!==leftRail)leftRail.append(sidebar);
   if($('dock-streak').parentElement!==$('dock-gold'))$('dock-gold').append($('dock-streak'));
  }else{
   const stage=$('battlefield-stage'),arena=stage.parentElement!;
   if(matchbar.parentElement!==arena)arena.prepend(matchbar);
   if(matchTools.parentElement!==matchbar)matchbar.insertBefore(matchTools,clock);
   if($('room-code-control').parentElement!==headerActions)headerActions.prepend($('room-code-control'));
   if($('pc-dock-reserve').parentElement!==dock)dock.insertBefore($('pc-dock-reserve'),$('dock-ready'));
   if($('deployed').parentElement!==$('deployment-overlay'))$('deployment-overlay').append($('deployed'));
   if(benchRegion.parentElement!==arena)stage.after(benchRegion);
   if(synergyPanel.parentElement!==arena)stage.before(synergyPanel);
   if(sidebar&&sidebar.parentElement!==main)main.append(sidebar);
   if($('dock-streak').parentElement!==$('dock-ready'))$('dock-ready').prepend($('dock-streak'));
  }
  leftRail.hidden=!wide;
 }
 const titles:Record<string,string>={rewards:'라운드 보상 · 수입',connection:'방 · 연결 정보',help:'플레이 방법',debug:'개발 도구'};
 function open(name:string,source?:HTMLElement){
  if(!active||main.inert||!titles[name])return;
  options.beforeChange();if(!dialog.open)opener=source??$('history-toggle');
  for(const key of Object.keys(titles))$(`pc-info-${key}`).hidden=key!==name;
  for(const b of dialog.querySelectorAll<HTMLElement>('[data-pc-info]'))b.setAttribute('aria-pressed',String(b.dataset.pcInfo===name));
  $('pc-info-title').textContent=titles[name];
  if(name==='debug')$<HTMLDetailsElement>('debug-panel').open=true;
  if(name==='help')$<HTMLDetailsElement>('pc-info-help').querySelector('details')!.open=true;
  if(!dialog.open)dialog.showModal();$('pc-info-title').focus({preventScroll:true});
 }
 function close(){dialog.close();}
 $('pc-info-close').onclick=close;
 dialog.addEventListener('close',()=>{if(!main.inert)(opener?.isConnected?opener:$('history-toggle')).focus({preventScroll:true});});
 for(const parent of [overview,dialog])parent.addEventListener('click',event=>{
  const b=(event.target as HTMLElement).closest<HTMLElement>('[data-pc-info]');if(b)open(b.dataset.pcInfo!,b);
 });
 dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close();});
 let measureFrame=0;
 function scheduleMeasure(){if(!measureFrame)measureFrame=requestAnimationFrame(()=>{measureFrame=0;measure();options.afterChange();});}
 function measure(){
  if(!active)return;placeStatus();const dockRect=dock.getBoundingClientRect();const height=Math.ceil(dockRect.height)+24;
  const arena=document.querySelector<HTMLElement>('.arena-panel')!,stage=$('battlefield-stage');
  if(document.documentElement.classList.contains('tactical-desktop')){
   const field=Math.max(160,Math.min(arena.getBoundingClientRect().width,innerHeight-360));
   document.documentElement.style.setProperty('--formation-field',`${Math.floor(field)}px`);
   const chrome=[...arena.children].filter(el=>el!==stage).reduce((sum,el)=>sum+el.getBoundingClientRect().height,0);
   document.documentElement.style.setProperty('--board-room',`${Math.max(100,Math.floor(field-chrome))}px`);
   document.documentElement.style.setProperty('--arena-room',`${Math.floor(field)}px`);
   document.documentElement.style.setProperty('--play-dock-height',`${height}px`);
   return;
  }
  const arenaTop=arena.getBoundingClientRect().top+scrollY;
  const landscape=document.documentElement.classList.contains('landscape-layout');
  const minimumBoard=landscape?90:document.body.classList.contains('ranking-compact')&&innerHeight<=700?100:120;
  const room=Math.max(1,(landscape?innerHeight:(dockRect.height?dockRect.top:innerHeight-140))-arenaTop-8);
  const inlineSynergy=synergyPanel.parentElement===arena;
  const equipmentTop=inlineSynergy?synergyPanel.getBoundingClientRect().bottom+4:arena.getBoundingClientRect().top+matchbar.getBoundingClientRect().height+4;
  const equipmentBottom=landscape?innerHeight-54:innerHeight-height-62;
  document.documentElement.style.setProperty('--equipment-top',`${Math.max(4,Math.min(equipmentBottom,equipmentTop))}px`);
  const chrome=[...arena.children].filter(el=>el!==stage&&(!landscape||(el!==matchbar&&el!==synergyPanel))).reduce((sum,el)=>{const style=getComputedStyle(el);if(style.display==='none')return sum;return sum+el.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);},0);
  for(const [key,value] of Object.entries({'--pc-dock-height':height,'--play-dock-height':height,'--game-top':arenaTop,'--landscape-match-height':matchbar.getBoundingClientRect().height,'--landscape-synergy-height':synergyPanel.getBoundingClientRect().height,'--arena-room':room,'--board-room':Math.max(minimumBoard,(room-chrome-(landscape?12:28)) * BOARD_ASPECT)})){
   const v=`${Math.floor(value)}px`;if(document.documentElement.style.getPropertyValue(key)!==v)document.documentElement.style.setProperty(key,v);
  }
 }
 const observer=new ResizeObserver(scheduleMeasure);observer.observe(dock);observer.observe(selection);observer.observe(matchbar);observer.observe(synergyPanel);observer.observe(benchRegion);
 window.addEventListener('resize',scheduleMeasure);
 function update(){
  if(!active)return;
  benchNav();selection.classList.toggle('has-selection',!$<HTMLButtonElement>('inspect-button').disabled);scheduleMeasure();
  $('pc-round-status').textContent=$('result').textContent;
  const debug=$('debug-panel').classList.contains('hidden');$('pc-debug-open').hidden=debug;$('pc-debug-tab').hidden=debug;
 }
 function sync(){
  const next=document.documentElement.dataset.screenMode==='pc'?'pc':'mobile';if(next===mode){placeStatus();scheduleMeasure();return;}
  close();options.beforeChange();mode=next;
  if(!active){for(const item of moves)item.target.append(item.node);active=true;}
  document.documentElement.classList.toggle('pc-layout',mode==='pc');
  document.documentElement.classList.toggle('mobile-layout',mode==='mobile');
  if(mode==='pc')selection.tabIndex=0;else selection.removeAttribute('tabindex');
  $('reroll').innerHTML='<svg class="reroll-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M26 13A11 11 0 1 0 27 20M26 5v8h-8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><strong>리롤</strong><span class="reroll-price"><span class="currency-coin" aria-hidden="true"></span>5</span>';
  $('reroll').setAttribute('aria-label','상점 리롤, 5 골드');
  $('pc-shop').hidden=false;$('pc-bench').hidden=false;placeStatus();update();scheduleMeasure();
 }
 let streakKey='';
 function setStreak(streak:Player['streak'],count:number){
  const outcome=count>0?streak:null,value=outcome?count:0,key=`${outcome}:${value}`;
  if(key===streakKey)return;streakKey=key;
  const label=outcome?`${value}${outcome==='win'?'연승':'연패'}`:'';
  $('dock-streak').dataset.streak=outcome??'none';
  $('dock-streak').setAttribute('aria-label',outcome?label:'연승·연패 기록 없음');

  $('dock-streak-label').textContent=label;
  $('dock-streak-icon').innerHTML=outcome==='win'
   ?'<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M13 2c1 5-3 6-3 9-1-1-2-2-2-4C4 10 3 13 3 16a9 9 0 0 0 18 0c0-5-3-9-8-14Z"/><path class="streak-fire-core" d="M12 13c1 3-2 4-2 6a2 2 0 0 0 4 0c0-2-1-4-2-6Z"/></svg>'
   :outcome==='loss'
    ?'<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12 2C9 7 4 11 4 16a8 8 0 0 0 16 0c0-5-5-9-8-14Z"/><path class="streak-water-shine" d="M8 15a4 4 0 0 0 4 5"/></svg>'
    :'';
 }
 function updateFormation(s:Snapshot,p:SelfPlayerSnapshot,viewed:PublicPlayerSnapshot|SelfPlayerSnapshot){
  document.body.dataset.gamePhase=s.phase;
  $('phase').dataset.formationLabel={waiting:'입장 대기',prepare:'준비 단계',matching:'매칭 중',combat:'전투 중',result:'라운드 결과',finished:'경기 종료'}[s.phase];
  $('formation-combat-state').hidden=s.phase!=='combat';
  const count=viewed.units.filter(u=>u.x>=0).length,cap=deploymentLimit(viewed);
  $('formation-slots').replaceChildren(...Array.from({length:cap},(_,i)=>{const pip=document.createElement('i');pip.dataset.filled=String(i<count);return pip;}));
  $('formation-capacity').textContent=`Lv.${viewed.level} · ${Math.max(0,cap-count)}칸 더 배치 가능`;
  $('formation-stage-detail').textContent=s.encounter==='minion'?`미니언전 ${s.round}/3`:'플레이어 대전';
  $('formation-interest').textContent=`최근 이자 +${p.lastIncome.interest}`;
  $('formation-time-label').textContent={waiting:'상대 입장 대기',prepare:'배치 종료까지',matching:'매칭 종료까지',combat:s.overtime?'피버타임 종료까지':'전투 종료까지',result:'다음 준비까지',finished:'경기 종료'}[s.phase];
  $('formation-ready-help').textContent=p.ready&&s.phase==='prepare'?'준비 완료 · 상대를 기다리는 중':s.phase==='combat'?'전투 진행 중 · 배치가 잠겼습니다.':s.phase==='result'?'라운드 결과를 확인하세요.':s.phase==='finished'?'최종 결과를 확인하세요.':'편성을 마치면 준비 완료를 눌러주세요.';
 }
 return {sync,update,open,close,setStreak,updateFormation};
}
