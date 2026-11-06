import type {Snapshot} from '../shared/model';
import {finalResult,FinalResultState} from './results';

export function createFinalResultUI(options:{
 snapshot:()=>Snapshot|null;viewerId:()=>string;busy:()=>boolean;
 beforeOpen:()=>void;review:()=>void;replay:()=>Promise<void>;lobby:()=>Promise<void>;
}) {
 const state = new FinalResultState();
 const $ = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T;
 const dialog = $<HTMLDialogElement>('final-dialog');
 const escaped = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 let playerHTML = '';
 // Native close events are queued. Reviewing history must retain its new focus.
 const closeFocus: boolean[] = [];
 function close(returnFocus = false) {
  if(!dialog.open)return;
  closeFocus.push(returnFocus);dialog.close();
 }
 function open() {
  if(!options.snapshot() || !finalResult(options.snapshot()!,options.viewerId()))return;
  options.beforeOpen();
  if(!dialog.open)dialog.showModal();
  $('final-title').focus({preventScroll:true});
 }
 function render() {
  const s = options.snapshot(), viewer = options.viewerId(), autoOpen = state.observe(s,viewer);
  const result = s && finalResult(s,viewer);
  $('final-summary').hidden = !result;
  if(!result) {close();return;}
  dialog.dataset.outcome = result.outcome;
  $('final-summary-title').textContent = result.title;
  $('final-summary-stage').textContent = `도달 ${result.stage} · 전투 ${result.completedRounds}회 완료`;
  $('final-title').textContent = result.title;
  $('final-reason').textContent = result.reason;
  $('final-stage').textContent = result.stage;
  $('final-rounds').textContent = `${result.completedRounds}회`;
  const html = result.players.map(p=>`<section class="final-player"><h3>${p.self?'나':'상대'} · ${escaped(p.name)}</h3><dl><div><dt>남은 체력</dt><dd data-final-health>${p.health}<span> / 100</span></dd></div><div><dt>라운드 승수</dt><dd>${p.wins}승</dd></div></dl></section>`).join('');
  if(html !== playerHTML) {$('final-players').innerHTML = html;playerHTML = html;}
  const busy = options.busy();
  for(const id of ['final-open','final-replay','final-lobby'])$<HTMLButtonElement>(id).disabled = busy;
  $<HTMLButtonElement>('final-history').disabled = busy || !result.canReview;
  $('final-history').textContent = result.canReview ? '전투 기록 보기' : '완료된 전투 기록 없음';
  $('final-replay').textContent = busy ? '처리 중…' : result.replayMode === 'practice' ? '다시 플레이' : '다시 플레이 · 새 방';
  $('final-replay-help').textContent = result.replayMode === 'practice' ? '다시 플레이하면 새 연습 경기를 시작합니다.' : '새 대전 방을 만든 뒤 친구에게 방 코드를 알려주세요.';
  $('final-status').textContent = busy ? '새 화면으로 이동하고 있습니다…' : '';
  if(autoOpen)open();
 }
 function reset() {state.reset();close();$('final-summary').hidden=true;playerHTML='';$('final-players').innerHTML='';}
 $('final-open').onclick = open;
 $('final-close').onclick = () => close(true);
 dialog.addEventListener('cancel',()=>{closeFocus.push(true);});
 dialog.addEventListener('close',()=>{
  const returnFocus = closeFocus.shift() ?? true;
  if(returnFocus && !dialog.open && options.snapshot()?.phase === 'finished')$('final-open').focus({preventScroll:true});
 });
 $('final-history').onclick = () => {
  const s = options.snapshot();if(options.busy() || !s || !finalResult(s,options.viewerId())?.canReview)return;
  close();options.review();
 };
 $('final-replay').onclick = () => void options.replay();
 $('final-lobby').onclick = () => void options.lobby();
 return {render,reset};
}
