// 진입점: 스테이지 스케일, 게임 루프, 단축키, 화면 전환
import { BoardRenderer } from './fx.js';
import * as S from './state.js';
import * as U from './ui.js';
import { initAudio, startMusic, setMusicMode, sfx } from './audio.js';
import { PC_MODE } from './data.js';
import { preloadPcArt } from './sprites.js';

const $ = (s) => document.querySelector(s);
const G = S.G;
const stage = $('#stage');
const canvas = $('#board');
const renderer = new BoardRenderer(canvas);
const UI = U.UI;
let battle = null;
let starting = false;
let endTimer = 0;
let dueAcc = 0, hudAcc = 0;
let lastT = performance.now();

// ---------- 스케일 ----------
function fit() {
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  UI.scale = s;
  const ox = (window.innerWidth - 1280 * s) / 2, oy = (window.innerHeight - 720 * s) / 2;
  stage.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
  renderer.setStageScale(s);
}
window.addEventListener('resize', fit);

// ---------- 흐름 ----------
function setSpeed(v) { UI.speed = v; renderer.speed = v; }
function cycleSpeed() { setSpeed(UI.speed >= 3 ? 1 : UI.speed + 1); sfx('click'); U.renderAll(); }
function togglePause() { if (PC_MODE || G.phase !== 'battle') return; UI.paused = !UI.paused; sfx('click'); U.renderAll(); }

function startBattle() {
  U.setScout(null);
  const b = S.startBattle();
  if (!b) return;
  battle = b; endTimer = 0; UI.paused = false;
  renderer.startBattle(b);
  dueAcc = 0;
  setMusicMode('battle');
  U.updateMatch();
  U.banner(`ROUND ${G.round}`, 'round', 1100);
  U.renderAll();
}

function endBattle() {
  const res = S.finishBattle(battle);
  renderer.endBattle();
  battle = null; UI.paused = false;
  setMusicMode('prep');
  U.banner(res.win ? 'VICTORY' : 'DEFEAT', res.win ? '' : 'lose', 1500);
  sfx(res.win ? 'win' : 'lose');
  U.renderAll();
  setTimeout(() => {
    if (G.phase === 'prep') return;
    U.showResult(res, () => afterResult(res));
  }, 1500);
}

function afterResult(res) {
  if (res.over || res.cleared) {
    U.showEnd(res, startNewGame, toTitle);
    return;
  }
  S.nextRound();
  U.renderAll();
  U.banner(`ROUND ${G.round}`, 'round', 900);
}

async function startNewGame() {
  if (starting) return;
  initAudio();
  if (PC_MODE) {
    starting = true;
    const loading = $('#assetLoading');
    const retry = $('#btnAssetRetry');
    $('#assetTitle').textContent = '전장 이미지 준비 중';
    $('#assetMessage').textContent = '캐시에 없는 이미지를 불러오고 있습니다.';
    retry.classList.add('hidden');
    if (!loading.classList.contains('hidden')) loading.focus();
    try {
      await preloadPcArt({
        onMiss() {
          if (loading.classList.contains('hidden')) {
            loading.classList.remove('hidden');
            loading.focus();
          }
        },
        onProgress(ready, total) {
          const meter = $('#assetProgress');
          meter.max = total;
          meter.value = ready;
          $('#assetCount').textContent = `${ready} / ${total}`;
        },
      });
    } catch {
      $('#assetTitle').textContent = '이미지를 불러오지 못했습니다';
      $('#assetMessage').textContent = '연결을 확인한 뒤 다시 시도하세요.';
      loading.classList.remove('hidden');
      retry.classList.remove('hidden');
      retry.focus();
      return;
    } finally {
      starting = false;
    }
    loading.classList.add('hidden');
  }
  startMusic(); setMusicMode('prep');
  U.resetLbState();
  S.newGame('pvp');
  UI.sel = null; UI.scoutId = null; UI.paused = false;
  $('#title').classList.add('hidden');
  U.hideResult(); $('#endScreen').classList.add('hidden');
  renderer.endBattle(); battle = null;
  U.renderAll();
  U.toast(PC_MODE
    ? '봇은 이미 준비 완료입니다. 학생을 편성하고 [준비 완료]를 누르면 매칭이 시작됩니다.'
    : '학생을 편성하고 [준비 완료]를 누르세요. 모두 준비하거나 시간이 끝나면 매칭이 시작됩니다!', 'info');
}
function toTitle() {
  G.phase = 'title';
  $('#title').classList.remove('hidden');
  U.updateBest();
}

function primary() {
  if (!$('#title').classList.contains('hidden')) return;
  if (G.phase === 'prep') {
    S.toggleReady();
    if (G.phase === 'matching') U.updateMatch();
    else U.refreshReady();
  }
  else if (G.phase === 'result' || G.phase === 'over') { const b = $('#btnOk'); if (b && !$('#resultPanel').classList.contains('hidden')) b.click(); }
}

// ---------- 루프 ----------
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now;
  if (dt > 0.05) dt = 0.05;
  if (document.hidden) return;
  let fxDt = dt;
  if (G.mode === 'pvp' && (G.phase === 'prep' || G.phase === 'matching') && !battle) {
    const before = G.phase;
    const r = S.tick(dt);
    if (before === 'prep' && G.phase === 'matching') { U.setScout(null); U.hideTip && U.hideTip(); U.renderAll(); }
    U.updateTimer();
    if (G.phase === 'matching') U.updateMatch();
    hudAcc += dt;
    if (G.phase === 'prep' && hudAcc > 0.5) { hudAcc = 0; U.refreshReady(); }
    if (r === 'battle') startBattle();
  }
  if (battle) {
    if (PC_MODE || !UI.paused) {
      const speed = PC_MODE ? 1 : UI.speed;
      battle.advance(dt, speed);
      const evs = battle.events; battle.events = [];
      for (const ev of evs) renderer.handle(ev);
      fxDt = dt * speed;
      U.updateHud(battle);
      if (G.mode === 'pvp') { dueAcc += fxDt; if (dueAcc > 0.3) { dueAcc = 0; S.applyDue(battle.time); } }
      if (battle.over && !endTimer) endTimer = 1;
    } else fxDt = 0;
    if (endTimer) { endTimer += dt; if (endTimer > 1.2) { endTimer = 0; endBattle(); } }
  }
  renderer.update(fxDt);
  renderer.draw(dt);
}

// ---------- 단축키 ----------
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (PC_MODE) {
    const loadingVisible = !$('#assetLoading').classList.contains('hidden');
    if (loadingVisible && k === 'Tab') e.preventDefault();
    if (starting || loadingVisible) return;
  }
  initAudio();
  if (k === 'Escape') {
    if (U.modalOpen()) U.closeModal();
    else if (PC_MODE && UI.scoutId != null) { U.setScout(null); sfx('click'); }
    return;
  }
  if (!$('#title').classList.contains('hidden')) {
    if (k === ' ' || k === 'Enter') { e.preventDefault(); startNewGame(); }
    else if (k === 'h' || k === 'H') U.openHelp();
    return;
  }
  if (!$('#endScreen').classList.contains('hidden')) {
    if (k === ' ' || k === 'Enter') { e.preventDefault(); $('#btnRetry')?.click(); }
    return;
  }
  const lk = k.toLowerCase();
  if (lk === 'h') { U.openHelp(); return; }
  if (lk === 'r') { U.openRecipe(); return; }
  if (U.modalOpen()) return;
  if (k === ' ' || k === 'Enter') { e.preventDefault(); primary(); return; }
  switch (lk) {
    case 'd': if (G.phase === 'prep') { S.reroll(); U.renderAll(); } break;
    case 'f': if (G.phase === 'prep') { S.buyXp(); U.renderAll(); } break;
    case 'l': S.toggleLock(); break;
    case 's': U.toggleSyn(); break;
    case 'm': U.toggleMute(); break;
    case 'a': if (!PC_MODE) S.autoArrange(); break;
    case 'e': if (S.canShop()) U.sellSelected(); break;
    case 'q': if (!PC_MODE) cycleSpeed(); break;
    case 'p': if (!PC_MODE) togglePause(); break;
    case '1': case '2': case '3': case '4': case '5':
      if (S.canShop()) { S.buy(+lk - 1); U.renderAll(); }
      break;
    default:
  }
});
window.addEventListener('pointerdown', () => { initAudio(); if (G.phase !== 'title') startMusic(); }, { capture: true });

// ---------- 시작 ----------
fit();
U.initUI(renderer, PC_MODE ? { primary } : { cycleSpeed, togglePause, primary });
let q = 'high';
try { q = localStorage.getItem('bachess_q') || ((navigator.hardwareConcurrency || 4) <= 2 ? 'low' : 'high'); } catch { /* ignore */ }
U.setQuality(q);
$('#btnPlay').onclick = () => { sfx('click'); startNewGame(); };
if (PC_MODE) $('#btnAssetRetry').onclick = startNewGame;
$('#btnHow').onclick = () => U.openHelp();
U.updateBest();
renderer.setUnits([]);
requestAnimationFrame(frame);
window.__bachess = { S, U, renderer }; // 디버깅용
