import type {Snapshot} from '../shared/model';
import {stageLabel} from '../shared/match-rules';
import {contributionGroups,contributionMetrics,type ContributionMetric,type ContributionTeam} from './contributions';
import {HistoryPanelState,resultFor,roundsInStage,roundSummary} from './history';

export function createHistoryUI(options:{snapshot:()=>Snapshot|null;viewerId:()=>string;beforeResize:()=>void;present:(open:boolean)=>void}){
 let state=new HistoryPanelState(),metric:ContributionMetric='damageDealt',team:ContributionTeam='self';
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const escaped=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const html=new Map<string,string>();
 function set(id:string,value:string){
  if(html.get(id)===value)return;
  const active=document.activeElement as HTMLElement|null,focusedRound=active?.closest('#'+id)?active.dataset.historyRound:undefined;
  $(id).innerHTML=value;html.set(id,value);
  if(focusedRound)$(id).querySelector<HTMLButtonElement>(`[data-history-round="${focusedRound}"]`)?.focus({preventScroll:true});
 }
 let storageKey='';
 function remember(){try{sessionStorage.setItem(storageKey,JSON.stringify({...state.preferences(),metric,team}));}catch{}}
 function render(){
  const s=options.snapshot(),viewer=options.viewerId();if(!s||!viewer)return;
  if(state.observe(s,viewer)){
   storageKey=`battle-history:${s.roomId}:${viewer}`;metric='damageDealt';team='self';
   try{const prefs=JSON.parse(sessionStorage.getItem(storageKey)??'null');state.restore(prefs);
    if(contributionMetrics.some(([key])=>key===prefs?.metric))metric=prefs.metric;
    if(prefs?.team==='self'||prefs?.team==='opponent')team=prefs.team;
   }catch{}
  }
  $('history-toggle').textContent=`전투 기록 ${state.open?'▴':'▾'}`;
  $('history-toggle').setAttribute('aria-expanded',String(state.open));
  options.present(state.open);$('history-panel').hidden=!state.open;
  $('history-stage').textContent=`스테이지 ${state.stage}`;
  $<HTMLButtonElement>('history-prev').disabled=state.stage<=2;
  $<HTMLButtonElement>('history-next').disabled=state.stage>=state.maxStage;
  const symbols={win:'✓',loss:'×',draw:'='},names={win:'승리',loss:'패배',draw:'무승부'},latest=s.roundHistory.at(-1);
  set('recent-results',s.roundHistory.slice(-5).map(r=>{
   const outcome=resultFor(r,viewer);return `<button type="button" data-history-round="${r.round}" data-outcome="${outcome}" aria-label="${stageLabel(r.round)}, ${names[outcome]}, 기록 보기" title="${stageLabel(r.round)} · ${names[outcome]}">${symbols[outcome]}</button>`;
  }).join(''));
  $('recent-results').hidden=!latest;$('round-result-summary').hidden=s.phase!=='result'||!latest;
  if(latest){$('round-result-summary').textContent=roundSummary(latest,viewer);$('round-result-summary').dataset.outcome=resultFor(latest,viewer);}
  set('history-rounds',roundsInStage(state.stage).map(round=>{
   const record=s.roundHistory.find(r=>r.round===round);
   const status=record?resultFor(record,viewer):round===s.round?(s.phase==='finished'?'ended':s.phase==='prepare'?'prepare':'current'):round<s.round?'missing':s.phase==='finished'?'unplayed':'future';
   const label={win:'✓ 승리',loss:'× 패배',draw:'= 무승부',prepare:'준비',current:'진행',ended:'종료',missing:'기록 없음',unplayed:'미진행',future:'예정'}[status];
   return `<button type="button" class="history-round" data-history-round="${round}" data-status="${status}" ${record?'':'disabled'} aria-pressed="${state.selectedRound===round}" aria-label="${stageLabel(round)}, ${label}${record?', 결과 보기':''}"><span>${stageLabel(round)}</span><strong>${label}</strong></button>`;
  }).join(''));
  $('history-empty').hidden=state.detailVisible;
  $('history-empty').textContent=s.roundHistory.some(r=>roundsInStage(state.stage).includes(r.round))?'선택된 전투 없음':'완료된 전투 없음';
  $('history-detail').hidden=!state.detailVisible;
  const record=state.selected;
  if(state.detailVisible&&record){
   $('history-detail-title').textContent=`${stageLabel(record.round)} · ${names[resultFor(record,viewer)]}`;
   $('history-result-summary').textContent=roundSummary(record,viewer);$('history-result-summary').dataset.outcome=resultFor(record,viewer);
   $('history-reason').textContent=record.reason==='timeout'?'전투 시간 초과':record.reason==='elimination'?'양쪽 전멸':'전투 종료';
   $('history-reason').hidden=record.reason==='victory';
   const playerRow=(p:typeof record.players[number],self:boolean)=>`<div class="history-player-result"><strong>${self?'나':'상대'} · ${escaped(p.name)}</strong><dl><dt>체력</dt><dd>${p.healthBefore} → ${p.healthAfter}</dd><dt>체력 감소</dt><dd>−${p.damage}</dd><dt>생존 유닛</dt><dd>${p.survivors}명</dd></dl></div>`;
   const opponentId=record.players.find(p=>p.id===viewer)?.opponentId;
   const pairedRecord=record.players.some(p=>p.opponentId||p.bye);
   set('history-detail-body',record.players.filter(p=>!pairedRecord||p.id===viewer||p.id===opponentId).sort((a,b)=>Number(b.id===viewer)-Number(a.id===viewer)).map(p=>playerRow(p,p.id===viewer)).join(''));
   set('history-contributions',contributionGroups(record,viewer,metric,team));
  }
  for(const button of document.querySelectorAll<HTMLElement>('[data-contribution-select]'))button.setAttribute('aria-pressed',String(button.dataset.contributionSelect===metric));
  for(const button of document.querySelectorAll<HTMLElement>('[data-contribution-team]'))button.setAttribute('aria-pressed',String(button.dataset.contributionTeam===team));
 }
 function update(change:()=>void){options.beforeResize();change();remember();render();}
 function close(){if(state.open)update(()=>state.toggle());}
 function openForReview(round?:number){
  render();update(()=>{if(!state.open)state.toggle();const selected=round??state.selected?.round??options.snapshot()?.roundHistory.at(-1)?.round;if(selected!==undefined)state.select(selected);});
 }
 $('history-toggle').onclick=()=>{if(state.open)close();else openForReview();};
 $('history-close').onclick=()=>{close();$('history-toggle').focus({preventScroll:true});};
 $('history-prev').onclick=()=>update(()=>state.navigate(state.stage-1));$('history-next').onclick=()=>update(()=>state.navigate(state.stage+1));
 for(const id of ['history-rounds','recent-results'])$(id).addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-history-round]');if(button&&!button.disabled)openForReview(Number(button.dataset.historyRound));
 });
 $('history-detail-close').onclick=()=>update(()=>state.closeDetail());
 $('contribution-metrics').innerHTML=contributionMetrics.map(([key,label])=>`<button type="button" data-contribution-select="${key}" aria-pressed="${key===metric}">${label}</button>`).join('');
 $('contribution-metrics').addEventListener('click',e=>{const key=(e.target as HTMLElement).closest<HTMLElement>('[data-contribution-select]')?.dataset.contributionSelect;if(contributionMetrics.some(([metric])=>metric===key))update(()=>{metric=key as ContributionMetric;});});
 $('contribution-teams').addEventListener('click',e=>{const key=(e.target as HTMLElement).closest<HTMLElement>('[data-contribution-team]')?.dataset.contributionTeam;if(key==='self'||key==='opponent')update(()=>{team=key;});});
 function reset(){
  state=new HistoryPanelState();storageKey='';metric='damageDealt';team='self';html.clear();
  $('history-panel').hidden=true;$('history-detail').hidden=true;$('recent-results').hidden=true;$('round-result-summary').hidden=true;
  $('history-toggle').textContent='전투 기록 ▾';$('history-toggle').setAttribute('aria-expanded','false');
  for(const id of ['history-rounds','history-detail-body','history-contributions','recent-results'])$(id).innerHTML='';
  options.present(false);
 }
 return {render,openForReview,close,reset};
}
