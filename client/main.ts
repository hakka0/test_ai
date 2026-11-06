import { assetUrl } from "../shared/assets";
declare const __APP_VERSION__:string;
import {createEquipmentUI} from "./equipment-ui";
import {createCraftUI} from "./craft-ui";
import {createHelpTooltips} from "./help-tooltips";
import { createPCLayout } from "./pc-layout";
import { unitInspection, inspectionSelection } from "./unit-inspection";
import {createHistoryUI} from "./history-ui";
import {createCombatPanel} from "./combat-panel";
import {createFinalResultUI} from "./results-ui";
import {createRewardUI} from "./reward-ui";
import {createRoomCodeUI} from "./room-code-ui";
import {createRankingUI} from "./ranking-ui";
import {ScoutingState,roster,opponentFor,scoutingBoard,battleBoard} from "./scouting";
import {createScreenModeUI} from "./screen-mode-ui";
import { GestureClicks, MutationGate, SaleConfirmation, placementIntent, type Destination } from "./interaction";
import { REWARD_INTERVAL, rewardMilestone, UNIT_REWARD_ODDS, ITEM_REWARD_ODDS } from "../shared/rewards";
import { stageLabel } from "../shared/match-rules";
import { MAX_LEVEL, EXPERIENCE_BUY_COST, EXPERIENCE_BUY_AMOUNT, ROUND_EXPERIENCE, deploymentLimit, nextLevelExperience } from "../shared/progression";
import { freeBenchSlot, canAcquireUnit } from "../shared/bench";
import { unitSellPrice, REROLL_COST, ROUND_INCOME, economyActionOpen, readyActionOpen, sellActionOpen } from "../shared/shop";
import { SKILLS } from "../shared/skill-catalog";
import { hasMaxRank } from "../shared/unit-pool";
import {MERGE_COPIES} from '../shared/merge';
import { SkillCastFeedback } from "./skill-presentation";
import { createSkillDetailsUI, skillCardHTML } from "./skill-ui";
import {createShopPreviewUI} from './shop-preview';
import "./style.css";
import './interface-theme.css';
import { createBoard } from "./board";
import { COMBAT_ATTRIBUTES } from "../shared/combat-attributes";
import { CELL, WIDTH, MARGIN, BOARD_ASPECT } from "./board-geometry";
import { Connection, LOCAL_PLAY, type ConnectionMode } from "./net";
import {unitDefinition,minionStats} from "../shared/minions";
import { UNITS, EQUIPMENT, statsFor, unitKindsFor } from "../shared/catalog";
import { unitStatsMarkup } from "./unit-stats";
import { unitSummaryMarkup } from "./unit-summary";
import { TRAITS, synergiesForPlayer, bonusFor } from "../shared/synergy";
import {synergyCards} from './synergy-ui';
import { COLS, ROWS, BENCH_SIZE, MAX_ROUNDS, type Snapshot, type SelfPlayerSnapshot, type Unit, type RewardOption, type DebugAction, type Trait } from "../shared/model";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
// Keep one composition label per row; the shop supports up to three labels.
function shopTraitBadges(traits: readonly Trait[]): string {
  return traits.slice(0, 3).map(trait => `<span class="trait-badge" data-trait="${trait}">${TRAITS[trait].name}</span>`).join("");
}
document.querySelector("#app")!.innerHTML = `
<header><div class="brand"><span>✦</span> 별빛 전술 <span class="eyebrow">ALPHA</span></div><div class="header-actions"><div id="room-code-control" class="room-code-control" hidden><span class="room-code-label">방 코드</span><span id="room-code" class="is-concealed" aria-hidden="true">—</span><button id="room-code-toggle" type="button" aria-label="방 코드 표시" aria-pressed="false" aria-controls="room-code"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button><button id="room-code-copy" type="button" aria-label="방 코드 복사" title="방 코드 복사"><svg class="copy-symbol" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span class="copy-check" aria-hidden="true">✓</span></button></div><button id="motion" aria-pressed="false">효과 줄이기</button><button id="leave" class="quiet">로비</button></div></header>
<main id="game-view" class="layout hidden">
<section class="arena-panel" aria-label="전장">
 <div class="matchbar"><div><div class="eyebrow" id="round">TACTICAL DUEL</div><h1 id="phase" tabindex="-1">별빛 아래, 나만의 전략</h1><div class="connection" id="connection">접속 전</div><button id="reward-open" type="button" hidden aria-haspopup="dialog">라운드 보상 보기</button></div><div class="timer" id="timer" aria-label="남은 시간">—</div></div>
 <section id="final-summary" class="final-summary" aria-label="최종 결과" hidden>
  <div><strong id="final-summary-title"></strong><p id="final-summary-stage" class="small muted"></p></div>
  <button id="final-open" type="button">최종 결과 보기</button>
 </section>
 <section id="history-section" class="history-section" aria-label="전투 기록">
  <div class="history-toggle-row"><button id="history-toggle" class="quiet" type="button" aria-expanded="false" aria-controls="history-panel">전투 기록 ▾</button></div>
  <div id="history-panel" class="history-panel" hidden>
   <div class="history-heading"><strong id="history-stage">스테이지 2</strong><button id="history-close" type="button" aria-label="진행표와 상세 결과 닫기">닫기</button></div>
   <div id="history-rounds" class="history-rounds" role="group" aria-label="라운드별 전투 결과"></div>
   <div class="history-navigation"><button id="history-prev" type="button" aria-label="이전 스테이지">이전</button><button id="history-next" type="button" aria-label="다음 스테이지">다음</button></div>
   <p id="history-empty" class="empty">완료된 전투 없음</p>
   <div id="history-detail" class="history-detail" hidden>
    <div class="history-heading"><strong id="history-detail-title"></strong><button id="history-detail-close" type="button" aria-label="상세 결과 닫기">상세 닫기</button></div>
    <p id="history-result-summary" class="history-result-summary"></p><p id="history-reason" class="small muted"></p><details id="history-outcome-details"><summary>체력 · 생존 유닛</summary><div id="history-detail-body" class="history-detail-body"></div></details>
    <section class="history-contribution-section" aria-labelledby="history-contribution-title">
     <h2 id="history-contribution-title">유닛별 기여도</h2>
     <p class="small muted">실제 체력 변화 기준 · 선택 항목순<br>회복은 시전자, 보호막 방어는 피해를 흡수한 유닛 기준. 아군·상대 그래프는 같은 눈금을 사용합니다.</p>
     <div id="contribution-metrics" role="group" aria-label="기여도 항목"></div><div id="contribution-teams" role="group" aria-label="기여도 진영"><button type="button" data-contribution-team="self" aria-pressed="true">아군</button><button type="button" data-contribution-team="opponent" aria-pressed="false">상대</button></div>
     <div id="history-contributions" class="history-contributions"></div>
    </section>
   </div>
  </div>
 </section>
 <div class="battlefield-stage" id="battlefield-stage"><div class="board-wrap" id="board-wrap"><div id="board" aria-hidden="true"></div><div id="cells" role="group" aria-label="${ROWS}행 ${COLS}열 전장. 아래 ${ROWS / 2}행이 내 배치 영역입니다."></div><div id="deployment-overlay"></div></div></div>
 <details id="debug-panel" class="debug-panel hidden"><summary>개발 디버깅</summary><div class="debug-controls"><label>배속 <select id="debug-speed"><option value="1">1배</option><option value="2">2배</option><option value="5">5배</option><option value="10">10배</option></select></label><button id="debug-pause" aria-pressed="false">일시정지</button><button id="debug-step">0.1초 진행</button><button id="debug-second">1초 진행</button><button id="debug-next">다음 단계</button><label>시작 상태 <select id="debug-preset"><option value="minion">미니언전 시작</option><option value="overtime">피버타임 · 방패 대결</option><option value="early">처음 · 1레벨</option><option value="mid">중반 · 7레벨</option><option value="late">후반 · 8레벨</option><option value="level10">최대 · 10레벨</option><option value="merge">합성 · 기사 2개</option><option value="synergy">조합 · 기본 6종 (2/2/2)</option><option value="synergyBulwark">조합 · 수호 6종 / 전체 18종</option><option value="synergyScout">조합 · 정찰 6종 / 전체 18종</option><option value="synergyArcane">조합 · 비전 6종 / 전체 18종</option><option value="reward">보상 · 5라운드 / 재료 4개</option></select></label><button id="debug-apply">시작 상태 적용</button><button id="debug-save">상태 저장</button><button id="debug-load">저장 상태 복원</button></div><p id="debug-status" class="small muted" role="status"></p></details>
 <section class="action-dock" aria-label="선택 유닛과 빠른 조작"><div class="dock-heading"><div><strong id="selection-name">유닛을 선택하세요</strong><p id="selected-help" class="selection-hint"></p></div><button id="clear-selection" class="quiet" aria-label="유닛 선택 해제">해제</button></div><div class="controls"><button id="inspect-button">상세</button><button id="equipment-shortcut">장비</button><button id="bench-button">대기석</button><button id="ready" class="primary">준비 완료</button></div><span id="action-status" class="small muted" role="status"></span></section>
 <section class="progression-panel" aria-label="레벨과 출전 정원"><div class="progression-heading"><span id="deployed" aria-live="polite">출전 0 / 1</span><span id="progression-gold">0 G</span></div><button id="buy-experience" type="button"><strong id="level-label">레벨 1 / 10</strong><span id="experience-track" class="experience-track" role="progressbar" aria-label="레벨 경험치" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="2" aria-valuenow="0"><span id="experience-fill"></span></span><span id="experience-label">경험치 0 / 2</span><span id="experience-purchase"><span class="xp-gain">+${EXPERIENCE_BUY_AMOUNT} XP</span><span class="xp-price"><span class="currency-coin" aria-hidden="true"></span>${EXPERIENCE_BUY_COST}</span></span></button><p class="small muted">레벨당 출전 1명 · 다음 라운드 경험치 +${ROUND_EXPERIENCE}</p><p id="income-label" class="small muted"></p></section>
 <section id="reward-summary" class="reward-panel" aria-label="라운드 보상 내역"><div class="section-title"><strong id="reward-summary-title">라운드 보상</strong></div><p id="reward-summary-help" class="help"></p><p id="reward-receipt" class="small" role="status"></p><details><summary>등급 확률</summary><div id="reward-odds" class="small"></div></details></section>
 <section id="synergy-panel" class="synergy-panel" aria-label="출전 조합"><div class="section-title"><span id="synergy-heading">출전 조합</span><span class="synergy-title-compact" aria-hidden="true">조합</span><span id="synergy-timing" class="small muted"></span></div><div id="my-synergies" class="synergy-list" aria-live="polite" aria-atomic="true"></div></section>
 <div class="bench" id="bench"><div class="section-title"><span><span id="bench-label">대기석</span> <span id="bench-count" class="muted small">0 / 12</span></span></div><div class="bench-list" id="units"></div></div>
 <section id="shop-panel" class="shop hidden" aria-label="유닛 상점"><div class="section-title"><span>유닛 상점 · 5칸</span><strong id="gold" aria-live="polite">0 G</strong></div><div id="shop-offers" class="shop-offers"></div><div class="shop-footer"><p id="shop-help" class="small muted"></p><button id="reroll">새로고침 · Reroll (${REROLL_COST} G)</button></div></section>
</section>
<aside class="side-panel" aria-label="캐릭터와 장비">
 <div class="round-banner" id="result" role="status">상점에서 유닛을 구매하고 전장에 배치하세요.</div>
 <div class="section-title"><span>전술 관리</span><span class="eyebrow">SQUAD</span></div>
 <div id="selection"><div class="empty">캐릭터를 선택하면 능력치와 장비를 확인할 수 있습니다.</div></div>
 <details id="skills-panel" open><summary>스킬</summary><div id="skill-list" class="skill-list"></div></details>
 <details id="equipment-panel"><summary>아이템 보관 · 재료와 장비</summary><p class="help">캐릭터당 2개까지 장착할 수 있습니다. 전투 중 변경한 장비는 다음 전투부터 반영됩니다.</p><div class="inventory" id="inventory"></div></details>
 <details><summary>플레이 방법</summary><div class="help">① 한 번 터치해 유닛을 선택한 뒤 빈 아군 칸을 누르세요. 드래그도 가능합니다. 다른 내 유닛 위에 드롭하면 서로 자리를 바꿉니다. 상세·장비 버튼으로 정보를 엽니다.<br>② 장비를 장착하고 준비 완료를 누르세요.<br>③ 양쪽 준비가 끝나거나 30초가 지나면 자동 전투합니다.<br>④ 체력 100으로 시작하며 체력이 0이 되면 경기에서 탈락합니다. 후반으로 갈수록 패배 피해가 커집니다. 최대 ${MAX_ROUNDS}라운드에서 체력, 승수 순으로 승자를 정합니다.<br>같은 종류·같은 강화 등급 3개는 자동 합성됩니다. 레어도는 가격, 강화 등급은 능력치를 나타냅니다. 같은 계열의 서로 다른 2·4·6종마다 조합 효과가 강해지며, 달성한 가장 높은 단계의 효과를 적용합니다. 전투 시작 조합은 그 전투 동안 유지됩니다. 합성 후 빈 출전 자리는 직접 채우세요.<br>대기석 캐릭터는 전투에 참가하지 않습니다. 빈 전장은 패배하며, 양쪽이 비어 있거나 전투 시간이 초과되면 무승부이며 양쪽 체력이 줄어듭니다.<br>${LOCAL_PLAY ? "새로고침하면 같은 탭의 연습 경기를 이어갑니다. 앱을 전환한 동안에는 경기가 진행되지 않습니다. 로비로 나가거나 탭을 닫으면 저장한 연습 경기를 종료합니다." : "연결이 끊기면 최대 60초 동안 재접속합니다. 그동안 경기는 계속 진행됩니다."}<br>상단 전투 기록 버튼을 열어 지난 라운드를 누르면 상대·승패·체력 감소를 확인할 수 있습니다. 닫아도 기록은 계속 쌓입니다.<br>키보드: Tab으로 캐릭터와 칸을 선택하고 Enter로 조작할 수 있습니다.</div></details>
</aside></main>
<section id="selected-unit-panel" class="selected-unit-panel" aria-label="선택한 캐릭터 정보" inert>
 <div id="selected-unit-content"><div class="empty">캐릭터를 선택하세요.</div></div>
</section>
<main id="lobby" class="home-page" aria-labelledby="lobby-title">
 <section class="home-intro">
  <div class="eyebrow">STARLIGHT TACTICS</div>
  <h1 id="lobby-title">작은 전장,<br>당신만의 한 수.</h1>
  <p>기사·궁수·마법사로 나만의 진형을 만들고,<br>별빛 아래 자동 전투를 시작하세요.</p>
  <div class="heroes" aria-hidden="true"><img src="${assetUrl("/units/knight.svg")}" alt=""><img src="${assetUrl("/units/ranger.svg")}" alt=""><img src="${assetUrl("/units/mage.svg")}" alt=""></div>
 </section>
 <section class="home-play" aria-labelledby="home-play-title">
  <h2 id="home-play-title">게임 시작</h2>
  <label for="nickname">닉네임</label><input id="nickname" maxlength="16" value="여행자" autocomplete="nickname">
  <div class="home-actions">
   <button class="home-action primary" id="practice" type="button"><strong>혼자 연습하기</strong><span>연습 상대와 부담 없이 시작하세요.</span></button>
   <button class="home-action" id="create" type="button"><strong>친구와 대전 · 방 만들기</strong><span>방 코드를 친구에게 공유하세요.</span></button>
   <button class="home-action" id="pvp-practice" type="button"><strong>PvP 연습 · 봇 5명</strong><span>6인 대전과 관전 · 배속·단계 진행으로 디버깅</span></button>
   <button class="home-action" id="blue-archive-practice" type="button"><strong>블루 아카이브 20인 테스트</strong><span>20명을 보유한 상태로 배치와 전투를 시험하세요.</span></button>
  </div>
  <form id="join-form" class="home-join">
   <label for="code">친구의 방 코드</label>
   <div class="lobby-row"><input id="code" maxlength="4" placeholder="4자리 코드" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="lobby-status"><button id="join" type="submit">참가</button></div>
  </form>
  <p class="small" id="lobby-status" role="status">연습을 시작하거나 친구의 방에 참여하세요.</p>
 </section>
</main>
<footer id="screen-mode-footer" class="screen-mode-footer" aria-label="게임 정보와 화면 설정">
 <div class="site-footer-inner">
  <div class="site-footer-info"><span>별빛 전술 · ALPHA</span><span id="game-version">v${__APP_VERSION__}</span></div>
  <section class="site-footer-settings" aria-label="화면 모드 선택">
   <div class="site-footer-mode-label"><strong>화면 모드</strong><span id="screen-mode-status" role="status" aria-live="polite"></span></div>
   <div class="screen-mode-buttons" role="group" aria-label="PC 또는 모바일 화면 선택"><button id="screen-mode-pc" type="button" aria-pressed="false">PC</button><button id="screen-mode-mobile" type="button" aria-pressed="false">모바일</button><button id="screen-mode-auto" type="button" class="quiet">자동 판별로 복원</button></div>
  </section>
 </div>
</footer>
<dialog id="reward-dialog" aria-labelledby="reward-title" aria-describedby="reward-help">
 <section id="reward-panel" class="reward-panel"><div class="reward-heading"><strong id="reward-title" tabindex="-1">라운드 보상</strong><button id="reward-later" type="button">닫기</button></div><p id="reward-help" class="help"></p><div id="reward-options" class="reward-options"></div><p id="reward-message" class="small" role="status"></p></section>
 <div class="reward-peek-row"><span id="reward-peek-help" class="small">눈 버튼으로 전장 확인 모드 전환</span><button id="reward-peek" type="button" aria-label="보상 선택 창 숨기고 전장 확인" aria-describedby="reward-peek-help" aria-pressed="false"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
</dialog>
<dialog id="final-dialog" aria-labelledby="final-title" aria-describedby="final-reason">
 <div class="final-heading"><span class="eyebrow">경기 종료</span><button id="final-close" type="button" aria-label="최종 결과 닫기">닫기 ✕</button></div>
 <h2 id="final-title" tabindex="-1"></h2><p id="final-reason" class="muted"></p>
 <dl class="final-progress"><div><dt>도달 스테이지</dt><dd id="final-stage"></dd></div><div><dt>완료한 전투</dt><dd id="final-rounds"></dd></div></dl>
 <div id="final-players" class="final-players"></div>
 <div class="final-actions"><button id="final-history" type="button">전투 기록 보기</button><button id="final-replay" class="primary" type="button">다시 플레이</button><button id="final-lobby" type="button">로비로 돌아가기</button></div>
 <p id="final-replay-help" class="small muted"></p><p id="final-status" class="small" role="status"></p>
</dialog>
<dialog id="unit-dialog" aria-labelledby="unit-dialog-title"><div class="dialog-heading"><h2 id="unit-dialog-title">유닛 상세</h2><button id="unit-title-sell" type="button" class="unit-quick-sell" hidden>판매</button><button id="close-unit-dialog" aria-label="유닛 상세 닫기" autofocus>닫기 ✕</button></div><p id="dialog-notice" role="status"></p><div id="unit-detail"></div><details id="dialog-equipment-panel"><summary>선택 유닛 장비 관리</summary><p class="help">유닛당 2개 · 다른 유닛의 장비도 이동할 수 있습니다.</p><div id="dialog-inventory" class="inventory"></div></details><div class="sale-controls"><p id="sale-summary" class="small" role="status"></p><div class="sale-buttons"><button id="cancel-sale" class="hidden">판매 취소</button><button id="sell-unit">판매</button></div></div><p class="small muted">닫으면 선택한 유닛을 바로 배치할 수 있습니다.</p></dialog>
<div id="notice" class="hidden" role="status" aria-live="polite"></div>`;
document.body.classList.add("home-active");
const roomCodeUI=createRoomCodeUI({notify:notice});
createScreenModeUI({beforeChange: () => {endDrag();cancelSale();}, afterChange: () => {pcUI.sync();combatPanel?.sync();craftUI?.position();equipmentUI?.render();renderReserve();requestAnimationFrame(() => game.scale.refresh());}});
$("game-view").inert = true;
const net = new Connection();
window.addEventListener("online", () => net.resume());
window.addEventListener("focus", () => net.resume());
document.addEventListener("visibilitychange", () => {if(!document.hidden)net.resume();});
const scoutingState=new ScoutingState();
const gate = new MutationGate(), gestureClicks = new GestureClicks(), sale = new SaleConfirmation();
document.addEventListener("click", e => {
  if ((e.target as HTMLElement).closest("#ready,#buy-experience,#reroll,.stat.help-trigger") && gestureClicks.consume(e, performance.now())) {
    e.preventDefault(); e.stopImmediatePropagation();
  }
}, true);
let saleArmed = false;
// Keep unchanged controls mounted while snapshots and pings arrive.
const htmlCache = new WeakMap<HTMLElement, string>();
function setHTML(id: string, html: string) {
  const el = $(id);
  if (htmlCache.get(el) !== html) { el.innerHTML = html; htmlCache.set(el, html); }
}
function cancelSale() { sale.clear(); saleArmed = false; }
function mutate(action: Parameters<Connection["send"]>[0]) {
  if(rewardUI.peeking||(scoutingState.active&&!['buy','reroll','buyExperience','ready'].includes(action.type)))return;
  const allowed = action.type === "buy" ? canPurchase() : action.type === "reroll" ? canShop()
    : action.type === "sell" ? canSell(action.unitId) : action.type==='buyExperience'?canExperience():action.type==='ready'?canReady():action.type === "equip" || action.type === "unequip" ? canSupply() : canEdit();
  if(snapshot?.phase==='matching'&&action.type==='ready'){if(allowed)net.send(action);return;}
  if (!snapshot || !allowed || !gate.start(snapshot)) return;
  endDrag();
  net.send(action);
  lastUI = "";
  render();
}
const { scene, game } = createBoard();
let snapshot: Snapshot | null = null,
  selected = "",
  lastUI = "",
  noticeTimeout: ReturnType<typeof setTimeout>;
let combatPanel:ReturnType<typeof createCombatPanel>|null=null;
let craftUI:ReturnType<typeof createCraftUI>|null=null;
let shopUI:ReturnType<typeof createShopPreviewUI>|null=null;
let rankingUI:ReturnType<typeof createRankingUI>|null=null,boardViewKey='';
const roundRow=document.createElement('div');roundRow.className='round-summary-line';$("round").before(roundRow);roundRow.append($("round"));roundRow.insertAdjacentHTML('beforeend','<div id="recent-results" aria-label="최근 전투 결과" hidden></div>');
$("board-wrap").insertAdjacentHTML('beforeend','<div id="round-result-summary" role="status" hidden></div>');
const historyUI = createHistoryUI({snapshot: () => snapshot, viewerId: () => net.room?.sessionId ?? "", beforeResize: endDrag,present:open=>combatPanel?.present(open)});
const finalUI = createFinalResultUI({snapshot: () => snapshot, viewerId: () => net.room?.sessionId ?? "", busy: () => busy,
  beforeOpen: () => {if(scoutingState.active)setWatchedPlayer(net.room?.sessionId??'',false);endDrag(); cancelSale(); pcUI.close(); craftUI?.close(); historyUI.close(); $<HTMLDialogElement>("unit-dialog").close(); rewardUI.hide();},
  review: () => {historyUI.openForReview();}, replay: replayMatch, lobby: returnToLobby});
const rewardUI = createRewardUI({snapshot: () => snapshot, viewerId: () => net.room?.sessionId ?? "", gameNow: () => net.gameNow(),
  cancelInteractions:()=>{endDrag();cancelSale();equipmentUI?.cancel();pcUI.close();craftUI?.close();historyUI.close();},
  changed:()=>{endDrag();cancelSale();equipmentUI?.cancel();lastUI='';render();refreshCells();},
  beforeOpen: () => {if(scoutingState.active)setWatchedPlayer(net.room?.sessionId??'',false);endDrag(); cancelSale(); pcUI.close();craftUI?.close();if($<HTMLDialogElement>("combat-record-dialog").open)historyUI.close(); $<HTMLDialogElement>("unit-dialog").close();}});
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function notice(s: string, persistent = false) {
  $("notice").textContent = s;
  if ($<HTMLDialogElement>("unit-dialog").open) $("dialog-notice").textContent = s;
  if ($<HTMLDialogElement>("reward-dialog").open) $("reward-message").textContent = s;
  if ($<HTMLDialogElement>("craft-dialog")?.open) {$("craft-message").textContent=s;$("craft-message").hidden=false;}
  $("notice").classList.remove("hidden");
  clearTimeout(noticeTimeout);
  if(!persistent)noticeTimeout = setTimeout(() => { $("notice").classList.add("hidden"); $("dialog-notice").textContent = ""; }, 4500);
}
function me(): SelfPlayerSnapshot | undefined {
  return snapshot?.players.find((p): p is SelfPlayerSnapshot =>
    p.visibility === "self" && p.id === net.room?.sessionId);
}
function viewedPlayer(){return snapshot?.players.find(p=>p.id===(scoutingState.playerId||net.room?.sessionId));}
function inspectionOf(id:string){return unitInspection(scoutingState.active?scene.snapshot:snapshot,id,scoutingState.active);}
function rosterView(s:Snapshot):Snapshot{return scoutingState.active?scoutingBoard(s,scoutingState.playerId):s;}
function syncBoardView(){
 const s=snapshot,viewer=net.room?.sessionId??'',projected=s?(scoutingState.active?scoutingBoard(s,scoutingState.playerId):battleBoard(s,viewer)):null;
 const key=s?JSON.stringify([s.roomId,scoutingState.playerId||viewer,projected?.players.map(p=>p.id)]):'';
 if(key!==boardViewKey){boardViewKey=key;scene.switchView();}
 scene.snapshot=projected;
 scene.selfId=scoutingState.playerId||viewer;scene.readOnly=scoutingState.active;
}
function setWatchedPlayer(id:string,refresh=true){
 if(!snapshot||rewardUI.peeking)return;
 const before=scoutingState.playerId;if(!scoutingState.watch(snapshot,net.room?.sessionId??'',id)||before===scoutingState.playerId)return;
 endDrag();cancelSale();equipmentUI?.cancel();pcUI.close();craftUI?.close();historyUI.close();$<HTMLDialogElement>('unit-dialog').close();
 selected='';scene.selected='';lastUI='';syncBoardView();
 if(refresh){render();refreshCells();}
}
function preparationOpen() {
  return !!(
    net.connected && net.hasSnapshot &&
    snapshot?.phase === "prepare" &&
    (snapshot.mode!=='botPractice'||(me()?.health??0)>0) &&
    !me()?.ready &&
    net.gameNow() < snapshot.deadline
  );
}
function canEdit() { return preparationOpen() && !gate.busy && !rewardUI.peeking && !scoutingState.active; }
function canEconomy(type:'buy'|'reroll'|'buyExperience') {
  const p = me();
  return !!(net.connected && net.hasSnapshot && snapshot && p && !gate.busy && !rewardUI.peeking &&
    (snapshot.mode!=='botPractice'||p.health>0) &&
    economyActionOpen(type,snapshot.phase, p.ready, net.gameNow(), snapshot.deadline));
}
function canPurchase(){return canEconomy('buy');}
function canShop() { return canEconomy('reroll'); }
function canExperience(){return canEconomy('buyExperience');}
function canSupply() { return canPurchase()&&!scoutingState.active; }
function canSell(id=selected) {const p=me();return !!(canSupply()&&snapshot&&p&&sellActionOpen(snapshot.phase,p.ready,net.gameNow(),snapshot.deadline,p.units.find(u=>u.id===id),snapshot.fighters));}
function canReady(){const p=me();return !!(net.connected&&net.hasSnapshot&&snapshot&&p&&!gate.busy&&!rewardUI.peeking&&(snapshot.mode!=='botPractice'||p.health>0)&&readyActionOpen(snapshot.phase,p.ready,net.gameNow(),snapshot.deadline));}
function select(id: string) {
  if(id)historyUI.close();
  if (selected !== id) cancelSale();
  selected = id;
  scene.selected = id;
  lastUI = "";
  render();
  refreshCells();
}
function compactUnitDetails(){return document.documentElement.dataset.screenMode==='mobile'||innerWidth<=700||(innerHeight<=540&&innerWidth>innerHeight);}
function chooseUnit(id:string){
  if(compactUnitDetails())inspectUnit(id);
  else select(id);
}
function inspectUnit(id: string, equipment = false) {
  endDrag(); cancelSale(); pcUI.close(); $("dialog-notice").textContent = "";
  select(id);
  const unit = inspectionOf(id)?.unit;
  if (!unit) return;
  updateUnitDialog(unit);
  const dialog = $<HTMLDialogElement>("unit-dialog");
  $<HTMLDetailsElement>("dialog-equipment-panel").open = equipment;
  if (!dialog.open) dialog.showModal();
  if (equipment) $("dialog-equipment-panel").scrollIntoView({block: "nearest"});
}
function updateUnitDialog(unit: Unit) {
  const inspection=inspectionOf(unit.id);if(!inspection)return;
  const {player,own}=inspection,readOnly=!own||!me()?.units.some(u=>u.id===unit.id)||rewardUI.peeking||scoutingState.active;
  $('unit-dialog').dataset.readOnly=String(readOnly);
  $('unit-dialog').dataset.unitSide=own?'self':'enemy';
  $('unit-dialog').setAttribute('aria-label',`${own?'내 유닛':'적 유닛'} · ${unitDefinition(unit).name}`);
  $('dialog-equipment-panel').hidden=readOnly;
  $('unit-dialog').querySelector<HTMLElement>('.sale-controls')!.hidden=readOnly;
  $('bench-button').hidden=readOnly;$('equipment-shortcut').hidden=readOnly;
  $("unit-dialog-title").textContent = unitDefinition(unit).name;
  const titleSell=$<HTMLButtonElement>('unit-title-sell');titleSell.hidden=readOnly;titleSell.disabled=!canSell(unit.id);
  titleSell.innerHTML=`<span>판매</span><strong>${unitSellPrice(unit)}G</strong>`;
  titleSell.setAttribute('aria-label',`${unitDefinition(unit).name} ${unitSellPrice(unit)}골드에 판매`);
  setHTML("unit-detail", $("selection").innerHTML + `<h3>스킬</h3><div data-skill-cards></div>` +
    `<h3>장착 장비</h3><p>${unit.equipment.map(id => {
      const item = player.inventory.find(i => i.id === id)!;
      const def = EQUIPMENT[item.definition];
      return escape(def.name + " · " + def.description);
    }).join("<br>") || "장착한 장비가 없습니다."}</p>`);
  syncSkillCards($("unit-detail").querySelector<HTMLElement>('[data-skill-cards]')!);
  paintSkillFeedback();
  if (!canSell(unit.id) || readOnly || (saleArmed && !sale.matches(unit))) cancelSale();
  setHTML("dialog-inventory", !readOnly?$("inventory").innerHTML:'');
  $("sale-summary").textContent = saleArmed ? `${unitDefinition(unit).name} 강화 ${unit.rank}성을 ${unitSellPrice(unit)}골드에 판매할까요? 장비는 반환됩니다.` : "";
  $("cancel-sale").classList.toggle("hidden", !saleArmed);
  $("sell-unit").textContent = gate.busy ? "처리 중…" : `${saleArmed ? "판매 확인" : "판매"} · ${unitSellPrice(unit)} 골드`;
  $<HTMLButtonElement>("sell-unit").disabled = readOnly||!canSell(unit.id);
}
function renderSelectedUnitPanel() {
  const inspection = inspectionOf(selected);
  $("selected-unit-panel").inert = !snapshot;
  if (!inspection) {
    delete $('selected-unit-content').dataset.unitSide;
    $('selected-unit-content').removeAttribute('aria-label');
    setHTML("selected-unit-content", '<div class="empty">캐릭터를 선택하세요.</div>');
    return;
  }
  const { player, unit, own } = inspection;
  $('selected-unit-content').dataset.unitSide=own?'self':'enemy';
  $('selected-unit-content').setAttribute('aria-label',`${own?'내 유닛':'적 유닛'} · ${unitDefinition(unit).name}`);
  const equipment = unit.equipment.flatMap(id => {
    const item = player.inventory.find(i => i.id === id);
    if (!item) return [];
    const def = EQUIPMENT[item.definition];
    return [`<article class="selected-unit-equipment"><strong>${escape(def.name)}</strong><span class="small muted">${def.tier}등급</span><p>${escape(def.description)}</p></article>`];
  }).join("");
  const quickSell=own&&me()?.units.some(u=>u.id===unit.id)&&!rewardUI.peeking&&!scoutingState.active?`<button type="button" class="unit-quick-sell" data-quick-sell="${escape(unit.id)}" ${!canSell(unit.id)?'disabled':''} aria-label="${escape(unitDefinition(unit).name)} ${unitSellPrice(unit)}골드에 판매"><span>판매</span><strong>${unitSellPrice(unit)}G</strong></button>`:'';
  const overviewNode=document.createElement('div');
  overviewNode.innerHTML=$("selection").innerHTML;
  if(quickSell)overviewNode.querySelector('.selection')!.insertAdjacentHTML('beforeend',quickSell);
  const overviewWithSale=overviewNode.innerHTML;
  setHTML("selected-unit-content", `<section class="selected-unit-overview">${overviewWithSale}</section>` +
    `<section class="selected-unit-section"><h3>스킬</h3><div data-skill-cards></div></section>` +
    `<section class="selected-unit-section"><h3>착용 장비</h3>${equipment || '<p class="small muted">착용한 장비가 없습니다.</p>'}</section>`);
  syncSkillCards($("selected-unit-content").querySelector<HTMLElement>('[data-skill-cards]')!);
  const portrait = $("selected-unit-content").querySelector<HTMLElement>(".selection img");
  if (portrait && (own||rewardUI.peeking||scoutingState.active)) {
    portrait.tabIndex = 0; portrait.setAttribute("role", "button");
    portrait.setAttribute("aria-label", quickSell?`${unitDefinition(unit).name} 장비·판매 관리 열기`:`${unitDefinition(unit).name} 상세 정보 확인`);
  }else if(portrait){portrait.removeAttribute('tabindex');portrait.removeAttribute('role');portrait.removeAttribute('aria-label');}
  paintSkillFeedback();
}
$("selected-unit-content").addEventListener("click", event => {
  if ((event.target as HTMLElement).closest('.selection img[role="button"]') && selected) inspectUnit(selected);
});
$("selected-unit-content").addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && (event.target as HTMLElement).matches('.selection img[role="button"]')) {
    event.preventDefault(); if (selected) inspectUnit(selected);
  }
});
$("unit-dialog").addEventListener("close", cancelSale);
$("cancel-sale").onclick = () => { cancelSale(); const unit = me()?.units.find(u => u.id === selected); if (unit) updateUnitDialog(unit); };
$("close-unit-dialog").onclick = () => $<HTMLDialogElement>("unit-dialog").close();
$("unit-dialog").addEventListener("click", e => {
  const r = $("unit-dialog").getBoundingClientRect();
  if (e.target === $("unit-dialog") && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) && !gestureClicks.consume(e, performance.now()))
    $<HTMLDialogElement>("unit-dialog").close();
});
$("sell-unit").onclick = () => {
  if (!selected || !canSell()) return;
  const unit = me()?.units.find(u => u.id === selected);
  if (!unit) return;
  if (!sale.matches(unit)) { sale.arm(unit); saleArmed = true; updateUnitDialog(unit); return; }
  cancelSale();
  mutate({type: "sell", unitId: unit.id});
};
function sellSelected(id=selected){
  if(!canSell(id)||!me()?.units.some(u=>u.id===id))return;
  cancelSale();mutate({type:'sell',unitId:id});
}
$("unit-title-sell").onclick=()=>sellSelected();
$("selected-unit-content").addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-quick-sell]');if(b&&!b.disabled)sellSelected(b.dataset.quickSell);});
function renderReserve() {
  $("bench").classList.remove("hidden");
  $("shop-panel").classList.remove("hidden");
}
renderReserve();
function planPlacement(id: string, to: Destination) {
  const intent = placementIntent(me(), id, to, canEdit(), canSell(id));
  return gate.busy ? {...intent, reason: "서버 응답 후 다시 배치하세요."} : intent;
}
function place(x: number, y: number) {
  const intent = planPlacement(selected, {kind: "cell", x, y});
  if (intent.action) mutate(intent.action);
  else if (!intent.valid) notice(intent.reason);
}
$("board-wrap").style.setProperty("--board-aspect", String(BOARD_ASPECT));
$("cells").style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
$("cells").style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;
$("cells").style.padding = `${MARGIN / WIDTH * 100}%`;
for (let y = 0; y < ROWS; y++)
  for (let x = 0; x < COLS; x++) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.x = String(x);
    b.dataset.y = String(y);
    b.setAttribute(
      "aria-label",
      `${y + 1}행 ${x + 1}열 ${y >= ROWS / 2 ? "아군" : "상대"} 칸`,
    );
    $("cells").append(b);
    b.onclick = (e) => {
      if (gestureClicks.consume(e, performance.now())) return;
      const u = scene.unitAt(x, y);
      if (u) chooseUnit(u.id);
      else if(!rewardUI.peeking&&!scoutingState.active)place(x, y);
    };
  }
type DragState = {
  id: string;
  x: number;
  y: number;
  pointer: number;
  touch: boolean;
  active: boolean;
  lastX: number;
  lastY: number;
};
let drag: DragState | null = null;
let equipmentUI:ReturnType<typeof createEquipmentUI>|null=null;
const ghost = document.createElement("div");
ghost.className = "unit-drag-ghost hidden";
ghost.setAttribute("aria-hidden", "true");
const ghostImage = document.createElement("img");
ghostImage.draggable = false;
ghostImage.alt = "";
const ghostLabel = document.createElement("span");
ghost.append(ghostImage, ghostLabel);
document.body.append(ghost);
let highlighted: HTMLElement | null = null;
function clearDropHint() {
  highlighted?.classList.remove("drop-valid", "drop-invalid");
  highlighted = null;
}
function endDrag() {
  equipmentUI?.cancel();
  const current = drag;
  drag = null;
  if (current) gestureClicks.end(current.pointer, current.lastX, current.lastY, performance.now());
  scene.dragging = "";
  ghost.classList.add("hidden");
  delete ghost.dataset.selling;
  clearDropHint();
  document
    .querySelectorAll(".drag-source")
    .forEach((el) => el.classList.remove("drag-source"));
  document.body.classList.remove("dragging-unit", "placement-drag-compact");
  if (current && document.body.hasPointerCapture(current.pointer))
    document.body.releasePointerCapture(current.pointer);
}
function dropTarget(clientX: number, clientY: number) {
  const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("#cells button, [data-bench-slot], #pc-dock-reserve") ?? null;
  const to: Destination = !el ? {kind: "outside"} : el.id==='pc-dock-reserve'?{kind:'shop'}:el.dataset.benchSlot !== undefined ?
    {kind: "bench", slot: Number(el.dataset.benchSlot)} : {kind: "cell", x: Number(el.dataset.x), y: Number(el.dataset.y)};
  return {el, to, ...planPlacement(drag?.id ?? selected, to)};
}
document.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary) { endDrag(); return; }
  gestureClicks.begin();
  if (e.button !== 0 || drag || rewardUI.peeking || scoutingState.active || document.querySelector('dialog[open]')) return;
  const target = e.target as HTMLElement;
  let id = target.closest<HTMLElement>("[data-unit]")?.dataset.unit;
  const cell = target.closest<HTMLElement>("#cells button");
  if (cell) {
    const u = scene.unitAt(Number(cell.dataset.x), Number(cell.dataset.y));
    if (u && u.owner === net.room?.sessionId) id = u.id;
  }
  if (!id) return;
  const unit = me()?.units.find((u) => u.id === id);
  if (!unit) return;
  if ($<HTMLButtonElement>("inspect-button").disabled) document.body.classList.add("placement-drag-compact");
  drag = {
    id,
    x: e.clientX,
    y: e.clientY,
    pointer: e.pointerId,
    touch: e.pointerType !== "mouse",
    active: false,
    lastX: e.clientX, lastY: e.clientY,
  };
  ghostImage.src = unitDefinition(unit).image;
  const cellWidth =
    ($("board-wrap").getBoundingClientRect().width * CELL) / WIDTH;
  ghost.style.width = `${Math.max(58, Math.min(88, cellWidth * 1.2))}px`;
  // Capture on a stable element: selecting a unit redraws its card.
  document.body.setPointerCapture(e.pointerId);
});
document.addEventListener(
  "pointermove",
  (e) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8)
      return;
    if (!canEdit() && !canSell(drag.id)) { endDrag(); return; }
    if (e.cancelable) e.preventDefault();
    if (!drag.active) {
      select(drag.id);
      drag.active = true;
      scene.dragging = drag.id;
      ghost.classList.remove("hidden");
      document.body.classList.add("dragging-unit");
      document
        .querySelector<HTMLElement>(`[data-unit="${CSS.escape(drag.id)}"]`)
        ?.classList.add("drag-source");
    }
    const target = dropTarget(e.clientX, e.clientY);
    // Keep the pointer anchor stable when entering or leaving any drop target.
    const width = parseFloat(ghost.style.width), offset = drag.touch ? 52 : 12;
    ghost.style.transform = `translate3d(${e.clientX - width / 2}px,${e.clientY - width / 2 - offset}px,0)`;
    ghost.dataset.selling = String(target.to.kind === "shop" && target.valid);
    clearDropHint();
    if (target.el) {
      highlighted = target.el;
      highlighted.classList.add(target.valid ? "drop-valid" : "drop-invalid");
    }
    ghost.dataset.valid = String(target.valid);
    ghostLabel.textContent = target.valid ? target.reason : "배치 불가";
  },
  { passive: false },
);
document.addEventListener("pointerup", (e) => {
  if (!drag || drag.pointer !== e.pointerId) return;
  drag.lastX = e.clientX; drag.lastY = e.clientY;
  const d = drag, target = dropTarget(e.clientX, e.clientY);
  endDrag();
  if (!d.active) {
    select(d.id);
    // Let the captured compatibility click finish before creating a modal backdrop.
    if(compactUnitDetails())requestAnimationFrame(()=>{
      if(selected===d.id&&!drag&&!document.querySelector('dialog[open]'))inspectUnit(d.id);
    });
    return;
  }
  if (target.action) mutate(target.action);
  else if (!target.valid && (canEdit() || canSell(d.id))) notice(target.reason);
});
document.addEventListener("pointercancel", (e) => {
  if (drag?.pointer === e.pointerId) endDrag();
});
document.body.addEventListener("lostpointercapture", (e) => {
  if (drag?.pointer === e.pointerId) endDrag();
});
window.addEventListener("blur", endDrag);
window.addEventListener("resize", endDrag);
window.addEventListener("orientationchange", endDrag);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) endDrag();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector('dialog[open]')) { endDrag(); select(""); }
});
document.addEventListener("dragstart", (e) => {
  if ((e.target as HTMLElement).closest("#bench,#cells")) e.preventDefault();
});
$("units").addEventListener("click", (e) => {
  if (gestureClicks.consume(e, performance.now())) return;
  const target = (e.target as HTMLElement).closest<HTMLElement>("[data-bench-slot]");
  if (!target) return;
  if (target.dataset.unit) chooseUnit(target.dataset.unit);
  else {
    if(rewardUI.peeking||scoutingState.active)return;
    const intent = planPlacement(selected, {kind: "bench", slot: Number(target.dataset.benchSlot)});
    if (intent.action) mutate(intent.action);
    else if (!intent.valid) notice(intent.reason);
  }
});
function equipmentClick(e: MouseEvent) {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-item]");
  if (!button || button.disabled || !canSupply() || !me()?.units.some(u => u.id === selected)) return;
  const itemId = button.dataset.item!;
  mutate(button.dataset.mode === "unequip" ? {type: "unequip", itemId} : {type: "equip", itemId, unitId: selected});
}
$("inventory").addEventListener("click", equipmentClick);
$("dialog-inventory").addEventListener("click", equipmentClick);
let skillPanelKey = "";
const skillFeedback = new SkillCastFeedback();
let skillFeedbackFrame = 0;
const skillDetailsUI=createSkillDetailsUI((unitId,skillId)=>{
  if(unitId!==selected)return;
  const inspection=inspectionOf(unitId);if(!inspection||!unitDefinition(inspection.unit).skills.includes(skillId))return;
  const {unit,player,fighter}=inspection,view=snapshot?rosterView(snapshot):null;
  const bonus=view&&unit.x>=0?bonusFor(unit.kind,synergiesForPlayer(view,player)):{};
  return {skill:SKILLS[skillId],stats:statsFor(unit,player.inventory,bonus),fighter,now:net.gameNow()};
});
function syncSkillCards(target: HTMLElement) {
  const sources = [...$("skill-list").querySelectorAll<HTMLElement>('.skill-card')];
  const existing = [...target.querySelectorAll<HTMLElement>('.skill-card')];
  if (sources.length !== existing.length || sources.some((s, i) => s.dataset.skillUnit !== existing[i].dataset.skillUnit || s.dataset.skillId !== existing[i].dataset.skillId)) {
    target.replaceChildren(...sources.map(source => source.cloneNode(true))); return;
  }
  // Preserve focus and popup triggers while combat feedback changes.
  sources.forEach((source, i) => {
    const card = existing[i];
    for (const name of ['skill-running', 'skill-consumed']) card.classList.toggle(name, source.classList.contains(name));
  });
}
function paintSkillFeedback() {
  const now = performance.now();
  for (const card of document.querySelectorAll<HTMLElement>('.skill-card[data-skill-unit]')) {
    const strength = scene.reduced ? 0 : skillFeedback.strength(card.dataset.skillUnit!, card.dataset.skillId!, now);
    card.classList.toggle('skill-cast', strength > 0);
    if (strength > 0) card.style.setProperty('--skill-cast-strength', strength.toFixed(3));
    else if (card.style.getPropertyValue('--skill-cast-strength')) card.style.removeProperty('--skill-cast-strength');
  }
  if (!scene.reduced && skillFeedback.pending(now) && !skillFeedbackFrame)
    skillFeedbackFrame = requestAnimationFrame(() => { skillFeedbackFrame = 0; paintSkillFeedback(); });
}
function renderSkills() {
  const inspection = inspectionOf(selected), unit = inspection?.unit;
  if (!unit || !inspection) {
    $("skill-list").textContent = "캐릭터를 선택하세요.";
    skillPanelKey = "";
    skillDetailsUI.close();
    return;
  }
  const fighter = inspection.fighter;
  const content = unitDefinition(unit).skills
    .map(id=>skillCardHTML(SKILLS[id],unit.id,fighter,net.gameNow()))
    .join("");
  if (skillPanelKey !== content) {
    skillPanelKey = content;
    $("skill-list").innerHTML = content;
  }
  skillDetailsUI.refresh();
}
function render() {
  const s = snapshot,
    p = me();
  if (!s || !p) return;
  shopUI?.refresh();
  historyUI.render();
  rewardUI.render();
  finalUI.render();
  rankingUI?.render();syncBoardView();
  $("game-view").classList.toggle("match-finished", s.phase === "finished");
  if (selected && !inspectionOf(selected)) {
    selected = "";
    scene.selected = "";
    endDrag();
    $<HTMLDialogElement>("unit-dialog").close();
    $("selection").innerHTML = '<div class="empty">캐릭터를 선택하세요.</div>';
  }
  if (!canSell()) cancelSale();
  $<HTMLButtonElement>("sell-unit").disabled = !canSell() || !p.units.some(u => u.id === selected);
  renderSkills();
  renderRewards(p);
  const other = opponentFor(s,p.id),viewed=viewedPlayer()??p,viewUnits=roster(viewed),viewS=rosterView(s),concealed=viewed.visibility==='opponent'&&viewed.rosterVisible===false;
  const key = JSON.stringify([
    s.phase,
    s.round,
    s.result,
    s.players,
    s.battlePairs,s.opponentId,
    s.debug,
    s.overtime,
    s.fighters.map(f => [f.id, f.kind, f.rank, f.owner]),
    selected,
    net.connected,
    gate.busy, canEdit(), canShop(), canPurchase(),rewardUI.peeking,scoutingState.playerId,
  ]);
  if (lastUI === key) {
    equipmentUI?.render();
    craftUI?.render();
    renderSelectedUnitPanel();
    const unit = inspectionOf(selected)?.unit;
    if (unit && $<HTMLDialogElement>("unit-dialog").open) updateUnitDialog(unit);
    rewardUI.syncAccess();
    return;
  }
  lastUI = key;
  const active = document.activeElement as HTMLElement | null;
  const focusUnit = active?.dataset.unit,
    focusItem = active?.dataset.item,
    focusShop = active?.dataset.shopSlot,
    inDialog = !!active?.closest("#unit-dialog");
  $("lobby").classList.add("hidden");
  const fromHome = document.body.classList.contains("home-active");
  document.body.classList.remove("home-active");
  $("game-view").classList.remove("hidden");
  $("game-view").inert = false;
  document.querySelector("header")!.inert = false;
  $("screen-mode-footer").inert = false;
  if (fromHome) requestAnimationFrame(() => {
    game.scale.refresh(); $("phase").focus({preventScroll:true}); window.scrollTo(0,0);
  });
  $("round").textContent = `스테이지 ${stageLabel(s.round)}`;
  $("round").dataset.compactLabel = stageLabel(s.round);
  $("round").setAttribute("aria-label",$("round").textContent!);
  $("round").title = $("round").textContent!;
  $("phase").textContent = {
    waiting: "상대 입장 대기",
    prepare: "준비 · 나만의 진형",
    matching: "매칭 중 · 상대 탐색",
    combat: s.overtime?"전투 · 피버타임":"전투 · 영웅들의 시간",
    result: "라운드 결과",
    finished: "경기 종료",
  }[s.phase];
  if(s.encounter==='minion'&&['prepare','combat','result'].includes(s.phase))$("phase").textContent += ` · 미니언전 ${s.round}/3`;
  $("phase").dataset.compactLabel = s.phase==='combat'&&s.overtime?'피버':{waiting:"대기",prepare:"준비",matching:"매칭",combat:"전투",result:"결과",finished:"종료"}[s.phase];
  $("phase").setAttribute("aria-label",$("phase").textContent!);
  $("game-view").classList.toggle('combat-overtime',s.phase==='combat'&&!!s.overtime);
  roomCodeUI.render(LOCAL_PLAY ? "" : s.roomId);
  $("result").textContent = s.result;
  pcUI.setStreak(p.streak, p.streakCount);
  $("income-label").textContent = `최근 지급 +${p.lastIncome.total} G · 기본 ${p.lastIncome.base} + 이자 ${p.lastIncome.interest} + 연속 ${p.lastIncome.streak}`;
  $("debug-panel").classList.toggle("hidden", !s.debug);
  if (s.debug) {
    $<HTMLSelectElement>("debug-speed").value = String(s.debug.speed);
    $("debug-pause").textContent = s.debug.paused ? "계속 진행" : "일시정지";
    $("debug-pause").setAttribute("aria-pressed", String(s.debug.paused));
    for (const id of ["debug-step", "debug-second"]) $<HTMLButtonElement>(id).disabled = !net.connected || !s.debug.paused;
    $<HTMLButtonElement>("debug-load").disabled = !net.connected || !s.debug.hasCheckpoint;
    $<HTMLButtonElement>("debug-next").disabled = !net.connected || !s.deadline;
    for (const id of ["debug-pause", "debug-save"]) $<HTMLButtonElement>(id).disabled = !net.connected;
    $<HTMLSelectElement>("debug-preset").disabled = !net.connected || s.roster === "blueArchive";
    $<HTMLButtonElement>("debug-apply").disabled = !net.connected || s.roster === "blueArchive";
    $<HTMLSelectElement>("debug-speed").disabled = !net.connected;
    $("debug-status").textContent = `${s.debug.paused ? "일시정지" : `${s.debug.speed}배 진행`} · ${s.debug.hasCheckpoint ? "저장 상태 있음" : "저장 상태 없음"} · ${s.mode==='botPractice'?'봇 5명 PvP 연습':'혼자 연습 전용'}`;
  }
  const maximum = p.level >= MAX_LEVEL, requiredXP = nextLevelExperience(p);
  const deployed = viewed.units.filter(u=>u.x>=0).length, deploymentCap = deploymentLimit(viewed);
  $("deployed").textContent = `${deployed}/${deploymentCap}`;
  $("deployed").setAttribute("aria-label", `현재 출전 ${deployed}명, 최대 출전 ${deploymentCap}명`);
  $("deployment-overlay").hidden=s.phase==='combat';
  setHTML("level-label", `<span class="visually-hidden">레벨 ${p.level} / ${MAX_LEVEL}</span><span aria-hidden="true">Lv. ${p.level}<small> / ${MAX_LEVEL}</small></span>`);
  setHTML("experience-label", maximum ? "최대 레벨" : `<span>경험치</span><span>${p.experience} / ${requiredXP}</span>`);
  $("experience-fill").style.height = `${maximum ? 100 : 100 * p.experience / requiredXP}%`;
  $("experience-track").setAttribute("aria-valuemax", String(maximum ? 1 : requiredXP));
  $("experience-track").setAttribute("aria-valuenow", String(maximum ? 1 : p.experience));
  $("experience-track").setAttribute("aria-valuetext", maximum ? `최대 레벨 ${MAX_LEVEL}` : `레벨 ${p.level}, 경험치 ${p.experience} / ${requiredXP}`);
  $<HTMLButtonElement>("buy-experience").disabled = !canExperience() || maximum || p.gold < EXPERIENCE_BUY_COST;
  $("experience-purchase").hidden = maximum;
  $("buy-experience").setAttribute("aria-label", maximum ? `최대 레벨 ${MAX_LEVEL}, 경험치 구매 불가` : `레벨 ${p.level}, 경험치 ${p.experience} / ${requiredXP}, 경험치 ${EXPERIENCE_BUY_AMOUNT} 구매, ${EXPERIENCE_BUY_COST} 골드`);
  $("gold").textContent = String(p.gold);
  $("gold").setAttribute("aria-label", `보유 골드 ${p.gold}`);
  $("progression-gold").textContent = `${p.gold} G`;
  setHTML("shop-offers", Array.from({length:5},(_,slot) => {
    const offer=p.shop[slot];
    if(!offer)return `<div class="shop-offer"><button class="shop-card shop-empty" data-shop-slot="${slot}" disabled aria-label="${slot+1}번 상품, 남은 유닛 없음"><strong>—</strong></button></div>`;
    const def = UNITS[offer.kind];
    if (offer.sold) return `<div class="shop-offer"><button class="shop-card shop-sold" data-shop-slot="${slot}" disabled aria-label="${slot + 1}번 상품 구매 완료"><span class="sold-icon" aria-hidden="true">✓</span><strong>구매 완료</strong><span>리롤로 보충</span></button></div>`;
    const mergeReady=!hasMaxRank(p,offer.kind)&&p.units.filter(u=>u.kind===offer.kind&&u.rank===1).length%MERGE_COPIES===MERGE_COPIES-1;
    return `<div class="shop-offer"><button type="button" class="shop-card" data-rarity="${def.rarity}" data-trait="${def.trait}" aria-disabled="${!canPurchase()||p.gold<offer.cost||!canAcquireUnit(p,offer.kind,s.phase==='prepare')}" data-merge-ready="${mergeReady}" data-shop-slot="${slot}" data-offer="${escape(offer.id)}" data-revision="${p.shopRevision}" ${rewardUI.peeking ? "disabled" : ""} aria-label="${slot + 1}번 상품, ${def.name}, ${TRAITS[def.trait].name}, 레어도 ${def.rarity}등급, ${offer.cost} 골드에 구매${mergeReady?', 구매 시 합성 가능':''}"><span class="shop-portrait" data-kind="${offer.kind}" aria-hidden="true"><img src="${def.image}" alt="" draggable="false"><span class="shop-traits">${shopTraitBadges([def.trait])}</span><span class="shop-unit-info"><strong>${def.name}</strong></span><span class="shop-price"><span class="currency-coin" aria-hidden="true"></span>${offer.cost}</span></span></button></div>`;
  }).join(""));
  shopUI?.refresh();
  $<HTMLButtonElement>("reroll").disabled = !canShop() || p.gold < REROLL_COST || unitKindsFor(s.roster).every(kind=>hasMaxRank(p,kind));
  $("shop-help").textContent = !canPurchase() ? (gate.busy ? "상점 요청 처리 중…" : "상점은 준비 완료 전, 전투 중, 라운드 결과 시간에 이용할 수 있습니다.")
    : (scoutingState.active ? "관전 중에도 내 골드로 구매해 내 대기석에 추가합니다. " : "") + (freeBenchSlot(p) < 0 ? s.phase==='prepare'?"대기석 12 / 12 · 즉시 합성되는 상품만 구매 가능. ":"대기석 12 / 12 · 빈자리를 만들어 주세요. " : "") +
      (s.phase === "combat" || s.phase === "result" ? "전투·결과 중 합성은 보류하고 다음 준비에서 적용합니다. 구매한 유닛은 빈 대기석에 추가됩니다." : `같은 종류·강화 등급 3개는 자동 합성 (최대 3성) · 다음 기본 수입 +${ROUND_INCOME} G`);
  $("bench-label").textContent=scoutingState.active?'관전 대기석':'대기석';
  $("bench-count").textContent = concealed?'비공개':`${viewUnits.filter(u => u.x < 0).length} / ${BENCH_SIZE}`;
  setHTML("units", Array.from({length: BENCH_SIZE}, (_, slot) => {
    if(concealed)return `<button class="bench-slot empty-slot" data-bench-slot="${slot}" disabled aria-label="대기석 ${slot+1}, 비공개"><span class="slot-number">${slot+1}</span><span aria-hidden="true">—</span></button>`;
    const u = viewUnits.find(u => u.x < 0 && u.benchSlot === slot);
    return u ? `<button class="unit-card bench-slot ${u.id === selected ? "selected" : ""}" data-bench-slot="${slot}" data-rarity="${UNITS[u.kind].rarity}" data-unit="${escape(u.id)}" aria-label="대기석 ${slot + 1}, ${unitDefinition(u).name}, ${TRAITS[UNITS[u.kind].trait].name}, 강화 ${u.rank}성, 레어도 ${UNITS[u.kind].rarity}등급" aria-pressed="${u.id === selected}"><svg class="bench-selection-pointer" viewBox="0 0 18 12" aria-hidden="true" focusable="false"><path d="M1 1h16L9 11Z" fill="currentColor" stroke="#fff4b0" stroke-width="1"/></svg><span class="slot-number">${slot + 1}</span><img src="${UNITS[u.kind].image}" alt="" draggable="false"><strong>${unitDefinition(u).name}</strong><span class="small trait-badge" data-trait="${UNITS[u.kind].trait}">${TRAITS[UNITS[u.kind].trait].name}</span><span class="unit-rank" aria-label="강화 ${u.rank}성">강화 ${"★".repeat(u.rank)}</span><span class="bench-rarity" aria-label="레어도 ${UNITS[u.kind].rarity}등급">★${UNITS[u.kind].rarity}</span><span class="pc-bench-rank" aria-hidden="true">${"★".repeat(u.rank)}</span>${u.equipment.length ? `<span class="pc-bench-equipment" aria-label="장비 ${u.equipment.length}개">◇${u.equipment.length}</span>` : ""}</button>` : `<button class="bench-slot empty-slot" data-bench-slot="${slot}" aria-label="대기석 ${slot + 1}, 빈자리"><span class="slot-number">${slot + 1}</span><span aria-hidden="true">＋</span></button>`;
  }).join(""));
  const mySynergies = synergiesForPlayer(viewS, viewed);
  setHTML("my-synergies", concealed?`<p class="synergy-empty">${s.phase==='matching'?'매칭':'준비'} 중 비공개</p>`:synergyCards(mySynergies.filter(s=>s.count>0))||'<p class="synergy-empty">출전 유닛 없음</p>');
  $("synergy-timing").textContent = ['prepare','waiting','matching'].includes(viewS.phase) ? "배치 미리보기" : "전투 시작 조합";
  $("synergy-heading").textContent = ['prepare','waiting','matching'].includes(viewS.phase) ? "출전 조합" : "전투 조합";
  const ownUnit = p.units.find((u) => u.id === selected);
  const inspection = inspectionOf(selected), unit = inspection?.unit;
  if (unit) {
    const owner = inspection!.player;
    const def = unitDefinition(unit),
      bonus = !unit.minion&&unit.x >= 0 ? bonusFor(unit.kind, synergiesForPlayer(viewS, owner)) : {},
      stats = unit.minion ? minionStats(unit) : statsFor(unit, owner.inventory, bonus);
    const statNotes = [
      inspection!.own && owner.units.some(u=>u.id===unit.id) && (s.phase === "combat" || s.phase === "result") ? "다음 전투 기준" : "",
      bonus.shield ? `시너지 시작 보호막 +${bonus.shield}` : "",
    ].filter(Boolean).join(" · ");
    $("selection").innerHTML =
      `<div class="selection"><img data-rarity="${def.rarity}" src="${def.image}" alt=""><div><div class="eyebrow">${def.role}${unit.minion?'':` · ${TRAITS[def.trait].name}`}</div><h2>${def.name}</h2>${unit.minion?'<div class="unit-meta">중립 유닛</div>':unitSummaryMarkup(unit.rank,def.rarity)}</div></div>${statNotes ? `<div class="muted small">${statNotes}</div>` : ""}${unitStatsMarkup(stats)}`;
  } else {
    $("selection").innerHTML = '<div class="empty">유닛을 선택하세요.</div>';
  }
  if (unit) {
    const def = unitDefinition(unit);
    const attributes = document.createElement("div");
    attributes.className = "combat-attributes";
    for (const [role, attribute, label] of [
      ["attack", def.attackAttribute, "공격"], ["defense", def.defenseAttribute, "방어"],
    ] as const) {
      const badge = document.createElement("span");
      badge.className = "combat-attribute";
      badge.dataset.attributeRole = role;
      badge.dataset.combatAttribute = attribute;
      badge.style.setProperty("--attribute-color", COMBAT_ATTRIBUTES[attribute].css);
      badge.textContent = `${label} · ${COMBAT_ATTRIBUTES[attribute].name}`;
      attributes.append(badge);
    }
    $("selection").querySelector(".stats")!.before(attributes);
  }
  $("selection-name").textContent = unit ? `${unitDefinition(unit).name} · 강화 ${unit.rank}성 · ${unit.x < 0 ? "대기석" : "전장"}` : "유닛을 선택하세요";
  for (const id of ["inspect-button", "equipment-shortcut"]) $<HTMLButtonElement>(id).disabled = !ownUnit;
  $<HTMLButtonElement>("clear-selection").disabled = !unit;
  $("action-status").textContent = gate.busy ? "서버 응답을 기다리는 중…" : "";
  $("selected-help").textContent = unit
    ? ownUnit && canEdit()
      ? "빈 아군 칸·대기석을 터치하거나 드래그하세요."
      : "현재는 캐릭터 정보만 확인할 수 있습니다."
    : "한 번 터치는 선택 · 상세·장비 버튼으로 확인";
  ($("bench-button") as HTMLButtonElement).disabled =
    !ownUnit || !canEdit() || ownUnit.x < 0 || freeBenchSlot(p) < 0;
  ($("ready") as HTMLButtonElement).disabled = !canReady();
  $("ready").textContent = p.ready ? "준비 완료 ✓" : "준비 완료";
  $("ready").title = p.pendingReward ? "미선택 라운드 보상은 골드로 자동 선택됩니다." : "배치를 마치고 준비 완료";
  $("ready").setAttribute("aria-label", p.pendingReward ? "준비 완료, 미선택 라운드 보상은 골드 자동 선택" : p.ready ? "준비 완료됨" : "준비 완료");
  pcUI.update();
  setHTML("inventory", p.inventory
    .map((item) => {
      const def = EQUIPMENT[item.definition],
        equipped = p.units.find((u) => u.id === item.unitId),
        onSelected = item.unitId === selected;
      return `<div class="item"><div><strong>${def.name} · ${def.category === "material" ? "재료" : `${def.tier}등급`}</strong><p>${def.description}</p><p>${equipped ? UNITS[equipped.kind].name + " 장착 중" : "보관 중"}</p></div><button data-item="${escape(item.id)}" data-mode="${onSelected ? "unequip" : "equip"}" ${!canSupply() || !ownUnit || def.category === "material" ? "disabled" : ""}>${def.category === "material" ? "조합 재료" : onSelected ? "해제" : equipped ? "이동" : "장착"}</button></div>`;
    })
    .join(""));
  equipmentUI?.render();
  craftUI?.render();
  renderSelectedUnitPanel();
  if (unit && $<HTMLDialogElement>("unit-dialog").open) updateUnitDialog(unit);
  if (focusShop !== undefined)
    document.querySelector<HTMLElement>(`[data-shop-slot="${focusShop}"]`)?.focus({ preventScroll: true });
  if (focusUnit)
    document
      .querySelector<HTMLElement>(`[data-unit="${CSS.escape(focusUnit)}"]`)
      ?.focus({ preventScroll: true });
  if (focusItem)
    document
      .querySelector<HTMLElement>(`${inDialog ? "#dialog-inventory" : "#inventory"} [data-item="${CSS.escape(focusItem)}"]`)
      ?.focus({ preventScroll: true });
  rewardUI.syncAccess();
}
function rewardLabel(option: RewardOption): string {
  if (option.type === "gold") return `골드 ${option.amount} G`;
  if (option.type === "unit") { const d = UNITS[option.kind]; return `유닛 1명 · ${d.name} · 레어도 ${d.rarity} · 강화 1성`; }
  const d = EQUIPMENT[option.definition];
  return `아이템 1개 · ${d.name} · ${d.category === "material" ? "1등급 재료" : `${d.tier}등급 장비`}`;
}
function renderRewards(p: SelfPlayerSnapshot) {
  const reward = p.pendingReward;
  const next = Math.ceil(((snapshot?.round ?? 0) + 1) / REWARD_INTERVAL) * REWARD_INTERVAL;
  $("reward-title").textContent = reward ? `${reward.round}라운드 보상 · 하나 선택` : `라운드 보상 · 다음 ${next <= MAX_ROUNDS ? next : "없음"}${next <= MAX_ROUNDS ? "라운드" : ""}`;
  $("reward-panel").classList.toggle("reward-available", !!reward);
  $("reward-summary-title").textContent = $("reward-title").textContent;
  $("reward-summary-help").textContent = reward ? "보상 선택은 전장 위 팝업에서 할 수 있습니다. 닫았다면 상단 라운드 보상 보기 버튼을 누르세요." : "5라운드마다 골드·유닛 1명·아이템 1개 중 하나를 선택합니다.";
  $("reward-help").textContent = reward ? "후보 중 하나만 받습니다. 준비 완료 또는 시간 종료 시 골드를 자동 선택합니다." : "5라운드마다 골드·유닛 1명·아이템 1개 중 하나를 선택합니다.";
  setHTML("reward-options", reward ? reward.options.map(o => {
    const full = o.type === "unit" && !canAcquireUnit(p, o.kind);
    const detail = o.type === "item" ? EQUIPMENT[o.definition].description : o.type === "unit" ? "대기석으로 지급 · 기존 자동 합성 적용" : "즉시 지급";
    return `<button data-reward="${escape(o.id)}" ${!canEdit() || full ? "disabled" : ""}><strong>${rewardLabel(o)}</strong><span>${detail}</span>${full ? "<span>대기석이 가득 찼습니다</span>" : ""}</button>`;
  }).join("") : "");
  rewardUI.render();
  $("reward-receipt").textContent = p.lastReward ? `${p.lastReward.round}라운드 수령: ${rewardLabel(p.lastReward.option)}${p.lastReward.automatic ? " · 자동 선택" : ""}` : "";
  const index = rewardMilestone(reward?.round ?? Math.min(next, MAX_ROUNDS));
  setHTML("reward-odds", `<p>유닛 기본 레어도: ${UNIT_REWARD_ODDS[index].map((v, i) => `${i + 1}등급 ${v}%`).join(" · ")}</p><p>아이템: ${ITEM_REWARD_ODDS[index].map((v, i) => `${i + 1}등급 ${v}%`).join(" · ")}</p>`);

}
$("reward-options").addEventListener("click", e => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-reward]");
  const reward = me()?.pendingReward;
  if (button && !button.disabled && reward) mutate({type: "chooseReward", rewardId: reward.id, optionId: button.dataset.reward!});
});
$("clear-selection").onclick = () => { endDrag(); select(""); };
$("inspect-button").onclick = () => { if (selected) inspectUnit(selected); };
$("equipment-shortcut").onclick = () => { if (selected) inspectUnit(selected, true); };
$("bench-button").onclick = () => {
  const intent = planPlacement(selected, {kind: "bench", slot: me() ? freeBenchSlot(me()!) : -1});
  if (intent.action) mutate(intent.action);
};
$("reroll").onclick = () => {
  const p = me();
  if (p && canShop()) mutate({ type: "reroll", revision: p.shopRevision });
};
$("buy-experience").onclick = () => {
  const p = me();
  if (!p || !canExperience() || p.level >= MAX_LEVEL || p.gold < EXPERIENCE_BUY_COST) return;
  mutate({type: "buyExperience", revision: p.experienceRevision});
};
$("ready").onclick = () => mutate({ type: "ready" });
$("debug-speed").onchange = () => net.debug({type: "speed", value: Number($<HTMLSelectElement>("debug-speed").value)});
$("debug-pause").onclick = () => net.debug({type: "pause", paused: !snapshot?.debug?.paused});
$("debug-step").onclick = () => net.debug({type: "step", ms: 100});
$("debug-second").onclick = () => net.debug({type: "step", ms: 1000});
$("debug-next").onclick = () => net.debug({type: "nextPhase"});
$("debug-apply").onclick = () => net.debug({type: "preset", preset: $<HTMLSelectElement>("debug-preset").value as Extract<DebugAction, {type: "preset"}>["preset"]});
$("debug-save").onclick = () => net.debug({type: "save"});
$("debug-load").onclick = () => net.debug({type: "load"});
net.onNotice = (message) => { gate.reset();craftUI?.clearPending(); lastUI = ""; render(); notice(message);if(!snapshot&&!busy)$("lobby-status").textContent=message; };
let reconnecting = false;
net.onStatus = (s) => {
  if (!net.connected) { gate.reset();craftUI?.clearPending(); endDrag(); cancelSale(); }
  $("connection").textContent = s;
  if(!snapshot&&!busy)$("lobby-status").textContent = s;
  const recovering = s.startsWith("재접속 중");
  if(snapshot && recovering)notice(s,true);
  else if(snapshot && reconnecting && net.connected)notice("연결이 복구되었습니다.");
  reconnecting = recovering;
  lastUI = "";
  render();
};
net.onSnapshot = (s) => {
  gate.observe(s);
  const previous = me();
  const previousSnapshot = snapshot;
  if(previousSnapshot && previousSnapshot.phase !== s.phase){endDrag();cancelSale();}
  const reset = !!s.debug && s.debug.generation !== snapshot?.debug?.generation;
  if (reset) {
    craftUI?.reset();
    gate.reset(); cancelSale(); endDrag(); selected = ""; scene.selected = ""; scene.resetVisuals();
    $<HTMLDialogElement>("unit-dialog").close(); lastUI = "";
  }
  snapshot = s;
  skillFeedback.observe(s, performance.now());
  scoutingState.observe(s,net.room?.sessionId??'');syncBoardView();
  const p = me();
  if (!reset && p && previous?.id === p.id && p.mergeRevision > previous.mergeRevision && p.lastMerge) {
    endDrag();
    const merged = p.lastMerge;
    if (!scoutingState.active && merged.consumedIds.includes(selected)) selected = merged.unitId;
    notice(`${UNITS[merged.kind].name} 강화 ${merged.rank}성 합성!${merged.returnedEquipment ? ` 장비 ${merged.returnedEquipment}개를 인벤토리에 반환했습니다.` : ""}`);
  }
  if (!reset && selected && (scoutingState.active?!inspectionOf(selected):inspectionSelection(previousSnapshot, s, selected) !== selected)) {
    endDrag(); cancelSale(); selected = "";
    $<HTMLDialogElement>("unit-dialog").close(); lastUI = "";
  }
  scene.selected = selected;
  if (drag?.active && !canEdit() && !canSell(drag.id)) endDrag();
  render();
  renderSkills();
  refreshCells();
};
function refreshCells() {
  $("cells").setAttribute("aria-label",scoutingState.active?`${ROWS}행 ${COLS}열 전장, ${viewedPlayer()?.name??"상대"} 시점`:`${ROWS}행 ${COLS}열 전장. 아래 ${ROWS / 2}행이 내 배치 영역입니다.`);
  for (const b of $("cells").querySelectorAll<HTMLButtonElement>("button")) {
    const x = Number(b.dataset.x),
      y = Number(b.dataset.y),
      u = scene.unitAt(x, y);
    if(u){b.dataset.boardUnit=u.id;b.dataset.boardOwner=u.owner;}else{delete b.dataset.boardUnit;delete b.dataset.boardOwner;}
    b.setAttribute("aria-pressed", String(u?.id === selected));
    b.setAttribute(
      "aria-label",
      `${y + 1}행 ${x + 1}열 ${scoutingState.active?'관전':y >= ROWS / 2 ? "아군" : "상대"} 칸${u ? `, ${unitDefinition(u).name}, ${TRAITS[UNITS[u.kind].trait].name}, 강화 ${u.rank}성${"hp" in u ? `, 체력 ${u.hp}` : ""}${scoutingState.active?`, ${snapshot?.players.find(p=>p.id===u.owner)?.name??""} 진영`:""}` : ", 빈 칸"}`,
    );
  }
}
setInterval(() => {
  if (!snapshot || !snapshot.deadline) {
    $("timer").textContent = "—";
    $("timer").setAttribute("aria-label", "남은 시간 없음");
    return;
  }
  const seconds = Math.max(
    0,
    Math.ceil((snapshot.deadline - net.gameNow()) / 1000),
  );
  $("timer").textContent = String(seconds).padStart(2, "0");
  $("timer").setAttribute("aria-label", `${snapshot.phase==='combat'&&snapshot.overtime?'피버타임 ':''}남은 시간 ${seconds}초`);
  rewardUI.render();
  if (seconds === 0) { endDrag(); cancelSale(); render(); }
}, 100);
const localLobbyMessage = "이 기기에서 혼자 플레이합니다. 새로고침하면 같은 탭의 경기를 이어갑니다.";
if (LOCAL_PLAY) {
  $("create").classList.add("hidden");
  $("join-form").classList.add("hidden");
  $("home-play-title").textContent = "1인 연습 시작";
  $("lobby-status").textContent = localLobbyMessage;
  $("pvp-practice").querySelector("strong")!.textContent = "봇 5명과 연습";
}
let busy = false;
function navigationBusy(value: boolean) {
  busy = value;
  for (const id of ["practice", "pvp-practice", "blue-archive-practice", "create", "join", "leave"]) $<HTMLButtonElement>(id).disabled = value;
  finalUI.render();
}
function resetMatchView() {
  shopUI?.close();
  skillDetailsUI.close();
  roomCodeUI.reset();
  scoutingState.reset();boardViewKey='';document.body.classList.remove('scouting-player');
  const player = me();
  if (player) $<HTMLInputElement>("nickname").value = player.name;
  endDrag(); cancelSale(); gate.reset(); selected = ""; lastUI = "";
  pcUI.close();
  craftUI?.reset();
  snapshot = null; equipmentUI?.render(); scene.snapshot = null; scene.selfId = ""; scene.readOnly=false;scene.selected = ""; scene.resetVisuals();rankingUI?.render();
  skillFeedback.reset();
  refreshCells();
  renderSelectedUnitPanel();
  $<HTMLDialogElement>("unit-dialog").close();finalUI.reset();historyUI.reset();rewardUI.reset();
  $("notice").classList.add("hidden");clearTimeout(noticeTimeout);
  $("lobby").classList.remove("hidden");document.body.classList.add("home-active");
  $("game-view").classList.add("hidden");$("game-view").inert = true;
  document.querySelector("header")!.inert = false;$("screen-mode-footer").inert = false;
  $("game-view").classList.remove("match-finished");
  $("connection").textContent = "접속 전";$("timer").textContent = "—";$("timer").setAttribute("aria-label", "남은 시간 없음");
  $<HTMLInputElement>("code").value = "";
}
async function returnToLobby() {
  if (busy) return;
  navigationBusy(true);resetMatchView();$("lobby-status").textContent = "로비로 돌아가는 중…";
  try { await net.leave(); $("lobby-status").textContent = LOCAL_PLAY ? localLobbyMessage : "새 연습 경기나 친구 대전을 시작하세요."; }
  catch { $("lobby-status").textContent = "로비로 돌아왔습니다. 새 경기를 시작하세요."; }
  finally {navigationBusy(false);$("nickname").focus();}
}
async function replayMatch() {
  if (busy || snapshot?.phase !== "finished") return;
  const mode = snapshot.roster === "blueArchive" ? "blueArchive"
    : snapshot.mode === "duel" ? "create" : snapshot.mode;
  await connect(mode, true);
}
async function connect(mode: ConnectionMode, replace = false) {
  if (busy) return;
  const code = ($("code") as HTMLInputElement).value.trim();
  if (mode === "join" && !/^[A-Fa-f0-9]{4}$/.test(code)) {
    $("lobby-status").textContent = "4자리 방 코드를 입력하세요.";
    $("code").setAttribute("aria-invalid", "true");$("code").focus();
    return;
  }
  $("code").removeAttribute("aria-invalid");
  navigationBusy(true);
  $("lobby-status").textContent = LOCAL_PLAY ? "연습을 준비하고 있습니다…" : "서버에 연결하고 있습니다…";
  try {
    if (replace) {resetMatchView();await net.leave();$("lobby-status").textContent = "새 경기에 연결하고 있습니다…";}
    await net.connect(mode, ($("nickname") as HTMLInputElement).value, code);
  } catch (error) {
    $("lobby-status").textContent =
      `접속 실패: ${error instanceof Error ? error.message : "서버 실행 여부를 확인하세요."}`;
  } finally {
    navigationBusy(false);
  }
}
$("practice").onclick = () => void connect("practice");
$("pvp-practice").onclick = () => void connect("botPractice");
$("blue-archive-practice").onclick = () => void connect("blueArchive");
$("create").onclick = () => void connect("create");
$("join-form").onsubmit = event => { event.preventDefault(); void connect("join"); };
$("code").oninput = () => $("code").removeAttribute("aria-invalid");
$("leave").onclick = () => void returnToLobby();
const motionPreference = localStorage.getItem("reduced-motion");
if (motionPreference !== null) scene.reduced = motionPreference === "true";
function motionLabel() {
  document.documentElement.dataset.reducedMotion = String(scene.reduced);
  $("motion").setAttribute("aria-pressed", String(scene.reduced));
  $("motion").textContent = scene.reduced ? "효과 줄임 ✓" : "효과 줄이기";
  paintSkillFeedback();
}
motionLabel();
$("motion").onclick = () => {
  scene.reduced = !scene.reduced;
  localStorage.setItem("reduced-motion", String(scene.reduced));
  motionLabel();
};
new ResizeObserver(() => {
  game.scale.refresh();
  endDrag();
}).observe($("board-wrap"));
const pcUI = createPCLayout({beforeChange: () => {endDrag();cancelSale();}, afterChange: () => {requestAnimationFrame(() => game.scale.refresh());}});
$("pc-dock-reserve").insertAdjacentHTML('beforeend','<div id="shop-sell-overlay" aria-hidden="true"><strong>판매</strong></div>');
pcUI.sync();renderReserve();
shopUI=createShopPreviewUI({state:()=>({snapshot,player:me(),inspectable:!!snapshot&&!$("game-view").inert&&!rewardUI.peeking&&!document.querySelector('dialog[open]')&&!document.body.classList.contains('dragging-unit'),canBuy:canPurchase(),canDropOnBench:!scoutingState.active}),commit:(offerId,revision)=>mutate({type:'buy',offerId,revision}),ignoreClick:event=>gestureClicks.consume(event,performance.now()),endGesture:(pointer,x,y)=>gestureClicks.end(pointer,x,y,performance.now())});
equipmentUI=createEquipmentUI({player:me,editable:canSupply,readOnly:()=>rewardUI.peeking||scoutingState.active,commit:mutate,notice,beforeDrag:endDrag,clicks:gestureClicks,
 blocked:()=>scoutingState.active||rewardUI.peeking||$("game-view").inert||!!document.querySelector('dialog[open]:not(#craft-dialog)'),
 target:(element)=>{const el=element?.closest<HTMLElement>('#cells button,[data-bench-slot]');if(!el)return null;
  const unit=el.dataset.benchSlot!==undefined?me()?.units.find(u=>u.id===el.dataset.unit):scene.unitAt(Number(el.dataset.x),Number(el.dataset.y));
  return {el,unitId:unit?.id,name:unit?`${unitDefinition(unit).name} · ${unit.rank}성`:undefined,own:!!unit&&unit.owner===net.room?.sessionId};},
 openItem:(id,source)=>craftUI?.open(id,source),closeItem:()=>craftUI?.close()});
pcUI.sync();
craftUI=createCraftUI({player:me,canCraft:canEdit,canEquip:canSupply,busy:()=>gate.busy,commit:mutate,selectForEquip:id=>equipmentUI?.selectForEquip(id),
 availability:()=>canEdit()?'':gate.busy?'처리 중…':!net.connected?'연결 복구 중':snapshot?.phase==='prepare'?(me()?.ready?'준비 완료 · 제작 잠김':'준비 마감 · 제작 잠김'):'준비 단계에서만 제작 가능',
 allowed:()=>!!snapshot&&!rewardUI.peeking&&!scoutingState.active&&!$("game-view").inert&&!document.querySelector('dialog[open]:not(#craft-dialog)'),beforeOpen:()=>{endDrag();cancelSale();equipmentUI?.cancel();pcUI.close();$<HTMLDialogElement>('unit-dialog').close();if($<HTMLDialogElement>('combat-record-dialog').open)historyUI.close();}});
combatPanel=createCombatPanel({show:()=>historyUI.openForReview(),hide:()=>historyUI.close(),beforeOpen:()=>{endDrag();equipmentUI?.cancel();pcUI.close();$<HTMLDialogElement>('unit-dialog').close();}});
rankingUI=createRankingUI({snapshot:()=>snapshot,viewerId:()=>net.room?.sessionId??'',watchedId:()=>scoutingState.playerId,select:setWatchedPlayer,blocked:()=>rewardUI.peeking||$("game-view").inert||!!document.querySelector('dialog[open]')});
createHelpTooltips();
async function restoreSession() {
  if (!sessionStorage.getItem("duel-token")) return;
  $("lobby-status").textContent = "이전 경기 연결을 복구하고 있습니다…";
  // Starting another game cancels this restore; keep the home actions usable.
  await net.restore();
}
void restoreSession();
