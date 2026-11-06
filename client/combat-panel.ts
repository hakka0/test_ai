/** The same history content lives in the PC rail or a compact bottom sheet. */
export function createCombatPanel(options:{show:()=>void;hide:()=>void;beforeOpen:()=>void}) {
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const side=$('selected-unit-panel'),unit=$('selected-unit-content'),history=$('history-panel');
 history.querySelector('.history-heading')!.append(history.querySelector('.history-navigation')!);
 // Keep analysis visible before the optional health/survivor breakdown.
 $('history-detail').append($('history-outcome-details'));
 const tabs=document.createElement('div');tabs.id='inspection-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','오른쪽 정보');
 tabs.innerHTML='<button id="inspection-unit-tab" type="button" role="tab" aria-controls="selected-unit-content" aria-selected="true"><svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></svg><span>유닛</span></button><button id="inspection-combat-tab" type="button" role="tab" aria-controls="combat-content" aria-selected="false" tabindex="-1"><svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 20V12m7 8V4m7 16V8" stroke-linecap="round"/></svg><span>전투</span></button>';
 const slot=document.createElement('section');slot.id='combat-content';slot.setAttribute('role','tabpanel');slot.setAttribute('aria-labelledby','inspection-combat-tab');slot.hidden=true;
 unit.setAttribute('role','tabpanel');unit.setAttribute('aria-labelledby','inspection-unit-tab');side.prepend(tabs);side.append(slot);
 const sheet=document.createElement('dialog');sheet.id='combat-record-dialog';sheet.setAttribute('aria-labelledby','combat-sheet-title');
 sheet.innerHTML='<div class="combat-sheet-heading"><h2 id="combat-sheet-title" tabindex="-1">전투 기록</h2><button id="combat-sheet-expand" type="button" aria-expanded="false" aria-label="전투 기록 크게 보기">확대</button><button id="combat-sheet-close" type="button" aria-label="전투 기록 닫기">닫기 ✕</button></div><div id="combat-sheet-body"></div>';
 document.body.append(sheet);
 let open=false,wide=false;
 function sync() {
  wide=document.documentElement.dataset.screenMode==='pc'&&innerWidth>700&&!(innerHeight<=540&&innerWidth>innerHeight);
  const host=wide?slot:$('combat-sheet-body');if(history.parentElement!==host)host.append(history);
  tabs.hidden=!wide;slot.hidden=!wide||!open;unit.hidden=wide&&open;
  side.setAttribute('aria-label',wide?'유닛 정보와 전투 기록':'선택한 캐릭터 정보');
  for(const [id,selected] of [['inspection-unit-tab',!open],['inspection-combat-tab',open]] as const){$(id).setAttribute('aria-selected',String(selected));$(id).tabIndex=selected?0:-1;}
  history.hidden=!open;
  if(wide||!open){if(sheet.open)sheet.close();}
  else if(!sheet.open){options.beforeOpen();sheet.showModal();$('combat-sheet-title').focus({preventScroll:true});}
 }
 function present(value:boolean){if(value===open)return;open=value;sync();}
 function close(){options.hide();$('history-toggle').focus({preventScroll:true});}
 $('inspection-combat-tab').onclick=options.show;$('inspection-unit-tab').onclick=options.hide;
 tabs.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const combat=e.key==='End'||(e.key!=='Home'&&!open);if(combat)options.show();else options.hide();
  $(combat?'inspection-combat-tab':'inspection-unit-tab').focus({preventScroll:true});
 });
 $('combat-sheet-close').onclick=close;
 $('combat-sheet-expand').onclick=()=>{const expanded=sheet.classList.toggle('is-expanded');$('combat-sheet-expand').setAttribute('aria-expanded',String(expanded));$('combat-sheet-expand').setAttribute('aria-label',expanded?'전투 기록 작게 보기':'전투 기록 크게 보기');$('combat-sheet-expand').textContent=expanded?'축소':'확대';};
 sheet.addEventListener('cancel',e=>{e.preventDefault();close();});
 sheet.addEventListener('click',e=>{const r=sheet.getBoundingClientRect();if(e.target===sheet&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))close();});
 // Escape closes a PC record before the game's unit-selection shortcut runs.
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&open&&wide&&!document.querySelector('dialog[open]')&&document.getElementById('game-help-tooltip')?.hidden!==false){e.preventDefault();e.stopImmediatePropagation();close();}
 },true);
 window.addEventListener('resize',sync);sync();
 return {sync,present};
}
