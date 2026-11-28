// 게임 상태, 경제, 상점, 합성, 장비 로직
import {
  UNITS, UNIT_BY_KEY, POOL_SIZE, SHOP_ODDS, XP_NEED, MAX_LEVEL, BENCH_SIZE, COLS, SIDE_ROWS, CENTER_COLS, FRONT_ROWS, BACK_ROWS,
  MAX_ROUND, ITEMS, COMP_KEYS, combine, dropsFor, SYNERGIES, SYNERGY_ORDER, PC_MODE,
} from './data.js';
import { buildPlayerBattlers, buildEnemyBattlers, buildTeamBattlers, Battle, calcSynergies } from './sim.js';
import {
  makeBots, makePlayer, botPrep, makeMatches, resolveBotMatch, applyResult, standings, lossDamage,
  PVP_HP, PREP_FIRST, PREP_TIME, MATCH_TIME,
} from './bots.js';

export const BOARD_SLOTS = COLS * SIDE_ROWS;
const listeners = [];
export const on = (fn) => listeners.push(fn);
const emit = (type, data) => { for (const l of listeners) l(type, data); };
export const toast = (msg, kind = 'info') => emit('toast', { msg, kind });

export const G = {
  phase: 'title', round: 1, hp: 20, maxHp: 20, gold: 10, level: 3, xp: 0, streak: 0,
  shop: [], locked: false, bench: [], board: [], inv: [], pool: {}, uidSeq: 1,
  stats: { kills: 0, wins: 0, losses: 0, merges: 0, maxGold: 0 }, lastResult: null, battle: null,
  mode: 'pvp', players: [], prepT: 0, prepMax: 0, ready: false, matchT: 0, opp: null, oppGhost: false, revealOpp: false, matches: [], pending: [], results: [],
};

export function bestRecord() {
  try { return JSON.parse(localStorage.getItem('bachess_best') || 'null'); } catch { return null; }
}
export function saveBest(rec) {
  try {
    const old = bestRecord();
    if (!old || rec.score > old.score) localStorage.setItem('bachess_best', JSON.stringify(rec));
  } catch { /* ignore */ }
}

export function newGame(mode = 'pvp') {
  const hp0 = mode === 'pvp' ? PVP_HP : 20;
  Object.assign(G, {
    mode, players: [], prepT: 0, prepMax: 0, ready: false, matchT: 0, opp: null, oppGhost: false, revealOpp: false, matches: [], pending: [], results: [],
    phase: 'prep', round: 1, hp: hp0, maxHp: hp0, gold: 10, level: 3, xp: 0, streak: 0, locked: false,
    shop: [null, null, null, null, null], bench: Array(BENCH_SIZE).fill(null), board: Array(BOARD_SLOTS).fill(null),
    inv: [], pool: {}, uidSeq: 1, lastResult: null, battle: null,
    stats: { kills: 0, wins: 0, losses: 0, merges: 0, maxGold: 10 },
  });
  for (const u of UNITS) G.pool[u.key] = POOL_SIZE[u.cost - 1];
  // 시작 장비 1개
  G.inv.push(COMP_KEYS[(Math.random() * COMP_KEYS.length) | 0]);
  rollShop(true);
  if (mode === 'pvp') {
    G.players = [makePlayer(0, '나', false, 1), ...makeBots()];
    G.prepMax = G.prepT = PREP_FIRST;
    for (const b of G.players) if (b.bot) {
      botPrep(b, 1);
      if (!PC_MODE) b.readyAt = 8 + Math.random() * 28;
    }
    syncMe();
  }
  emit('change');
}

// ---------- 유틸 ----------
export function mkUnit(key) { return { uid: G.uidSeq++, key, star: 1, items: [] }; }
export function defOf(u) { return UNIT_BY_KEY[u.key]; }
export function boardCount() { return G.board.filter(Boolean).length; }
export function getUnit(loc) { return loc.where === 'bench' ? G.bench[loc.idx] : G.board[loc.idx]; }
function setUnit(loc, u) { if (loc.where === 'bench') G.bench[loc.idx] = u; else G.board[loc.idx] = u; }
export function sellPrice(u) { const c = defOf(u).cost; return u.star === 1 ? c : c * (u.star === 2 ? 3 : 9) - 1; }
export function xpNeed() { return G.level >= MAX_LEVEL ? Infinity : XP_NEED[G.level]; }
export function interest() { return Math.min(5, Math.floor(G.gold / 10)); }
// 연승/연패 보너스: 2~3연속 +1, 4~5연속 +2, 6연속 이상 +3
export function streakBonusFor(streak) { const sk = Math.abs(streak); return sk >= 6 ? 3 : sk >= 4 ? 2 : sk >= 2 ? 1 : 0; }
export function allUnits() { return [...G.bench, ...G.board].filter(Boolean); }
export function locOfUid(uid) {
  let i = G.bench.findIndex((u) => u && u.uid === uid); if (i >= 0) return { where: 'bench', idx: i };
  i = G.board.findIndex((u) => u && u.uid === uid); if (i >= 0) return { where: 'board', idx: i };
  return null;
}

// ---------- 상점 ----------
function drawFromStock(candidates) {
  const total = candidates.reduce((sum, unit) => sum + G.pool[unit.key], 0);
  let roll = Math.random() * total;
  for (const unit of candidates) if ((roll -= G.pool[unit.key]) < 0) return unit.key;
  return candidates[0].key;
}

function drawPcKey(odds) {
  const stock = odds.map((weight, index) => weight
    ? UNITS.filter((unit) => unit.cost === index + 1 && G.pool[unit.key] > 0)
    : []);
  const weights = odds.map((weight, index) => stock[index].length ? weight : 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  // 소진된 코스트를 제외하고, 출현할 수 있는 코스트의 확률 비율을 유지한다.
  let roll = Math.random() * total;
  const index = weights.findIndex((weight) => (roll -= weight) < 0);
  return index >= 0 ? drawFromStock(stock[index]) : null;
}

function drawKey() {
  const odds = SHOP_ODDS[G.level];
  if (PC_MODE) return drawPcKey(odds);
  for (let tries = 0; tries < 30; tries++) {
    let x = Math.random() * 100, cost = 1;
    for (let i = 0; i < 5; i++) { if ((x -= odds[i]) < 0) { cost = i + 1; break; } }
    const cands = UNITS.filter((u) => u.cost === cost && G.pool[u.key] > 0);
    if (!cands.length) continue;
    return drawFromStock(cands);
  }
  return UNITS[0].key;
}
export function rollShop(initial = false) {
  for (const k of G.shop) if (k) G.pool[k]++;
  for (let i = 0; i < 5; i++) {
    const k = drawKey();
    if (k) G.pool[k]--;
    G.shop[i] = k;
  }
}
export function refreshShopNewRound() {
  if (G.locked) {
    if (PC_MODE) G.locked = false;
    return;
  }
  rollShop();
}
// 매칭/전투 단계: 상점 구입·벤치 판매·학생 정보 확인은 가능, 보드 유닛은 고정
export const isLive = () => G.phase === 'matching' || G.phase === 'battle';
export const canShop = () => G.phase === 'prep' || isLive();
export function reroll() {
  if (G.phase !== 'prep') return false;
  if (G.gold < 2) { toast('크레딧이 부족합니다.', 'warn'); return false; }
  G.gold -= 2; rollShop(); emit('change'); emit('sfx', 'roll'); return true;
}
export function toggleLock() { G.locked = !G.locked; emit('change'); }
export function buyXp() {
  if (G.phase !== 'prep') return false;
  if (G.level >= MAX_LEVEL) { toast('이미 최대 레벨입니다.', 'warn'); return false; }
  if (G.gold < 4) { toast('크레딧이 부족합니다.', 'warn'); return false; }
  G.gold -= 4; addXp(4); emit('change'); emit('sfx', 'buy'); return true;
}
function addXp(n) {
  G.xp += n;
  while (G.level < MAX_LEVEL && G.xp >= XP_NEED[G.level]) {
    G.xp -= XP_NEED[G.level]; G.level++;
    toast(`플레이어 레벨 ${G.level} 달성! 출전 인원 ${G.level}명`, 'good');
  }
  if (G.level >= MAX_LEVEL) G.xp = 0;
}

export function buy(i) {
  if (!canShop()) return false;
  const lockBoard = G.phase !== 'prep';
  const key = G.shop[i];
  if (!key) return false;
  const def = UNIT_BY_KEY[key];
  if (G.gold < def.cost) { toast('크레딧이 부족합니다.', 'warn'); emit('sfx', 'deny'); return false; }
  const slot = G.bench.findIndex((x) => !x);
  const u = mkUnit(key);
  if (slot < 0) {
    // 벤치가 가득: 합성으로 자리가 생기는 경우만 허용
    const same = (lockBoard ? G.bench.filter(Boolean) : allUnits()).filter((x) => x.key === key && x.star === 1).length;
    if (same < 2) { toast('벤치가 가득 찼습니다.', 'warn'); emit('sfx', 'deny'); return false; }
    G.gold -= def.cost; G.shop[i] = null;
    G.bench.push(u); const merged = runMerges(lockBoard); G.bench = G.bench.filter(Boolean).concat(Array(BENCH_SIZE).fill(null)).slice(0, BENCH_SIZE);
    if (!merged) { /* 안전장치 */ }
    emit('change'); emit('sfx', 'buy'); return true;
  }
  G.gold -= def.cost; G.shop[i] = null; G.bench[slot] = u;
  runMerges(lockBoard);
  emit('change'); emit('sfx', 'buy');
  return true;
}

// ---------- 합성 ----------
// 매칭/전투 중에는 보드 유닛이 전투에 묶여 있으므로 보드를 제외하고 벤치끼리만 합성한다.
// (보드가 얽힌 합성은 다음 준비 단계 시작 시 처리)
function runMerges(benchOnly = false) {
  let did = false;
  for (let guard = 0; guard < 6; guard++) {
    let merged = false;
    for (const def of UNITS) {
      for (const star of [1, 2]) {
        const holders = [];
        G.bench.forEach((u, idx) => { if (u && u.key === def.key && u.star === star) holders.push({ where: 'bench', idx, u }); });
        if (!benchOnly) G.board.forEach((u, idx) => { if (u && u.key === def.key && u.star === star) holders.push({ where: 'board', idx, u }); });
        if (holders.length >= 3) {
          // 보드 우선, 별 높은 유닛 우선
          holders.sort((a, b) => (a.where === 'board' ? 0 : 1) - (b.where === 'board' ? 0 : 1));
          const keep = holders[0];
          const eat = holders.slice(1, 3);
          const items = [...keep.u.items];
          for (const e of eat) { items.push(...e.u.items); setUnit(e, null); }
          // 벤치 임시 슬롯 처리 (bench.push 로 늘어난 경우)
          keep.u.star = star + 1;
          keep.u.items = items.slice(0, 3);
          for (const extra of items.slice(3)) G.inv.push(extra);
          G.stats.merges++;
          emit('merge', { uid: keep.u.uid, star: keep.u.star, name: def.name });
          emit('sfx', 'merge');
          merged = true; did = true;
          break;
        }
      }
      if (merged) break;
    }
    if (!merged) break;
  }
  // 벤치 길이 보정
  if (G.bench.length > BENCH_SIZE) {
    const rest = G.bench.filter(Boolean);
    G.bench = rest.concat(Array(BENCH_SIZE).fill(null)).slice(0, BENCH_SIZE);
  }
  return did;
}

// ---------- 판매 / 이동 ----------
export function sell(loc) {
  const live = isLive();
  if (G.phase !== 'prep' && !live) return false;
  const u = getUnit(loc);
  if (!u) return false;
  if (live && loc.where !== 'bench') { toast('전투 중인 보드의 유닛은 판매할 수 없습니다.', 'warn'); emit('sfx', 'deny'); return false; }
  G.gold += sellPrice(u);
  G.pool[u.key] += u.star === 1 ? 1 : u.star === 2 ? 3 : 9;
  for (const it of u.items) G.inv.push(it);
  setUnit(loc, null);
  emit('change'); emit('sfx', 'sell');
  return true;
}

export function move(from, to) {
  if (G.phase !== 'prep') {
    if (!isLive()) return false;
    if (from.where !== 'bench' || to.where !== 'bench') { toast('전투 중에는 보드의 유닛을 옮길 수 없습니다.', 'warn'); emit('sfx', 'deny'); return false; }
  }
  const a = getUnit(from);
  if (!a) return false;
  if (from.where === to.where && from.idx === to.idx) return false;
  const b = getUnit(to);
  // 보드 인원 제한
  if (to.where === 'board' && from.where === 'bench' && !b && boardCount() >= G.level) {
    toast(`출전 가능 인원은 ${G.level}명입니다. 레벨을 올리거나 다른 유닛과 교체하세요.`, 'warn'); emit('sfx', 'deny'); return false;
  }
  setUnit(from, b); setUnit(to, a);
  emit('change'); emit('sfx', 'click');
  return true;
}

// 모바일 자동 배치: 탱커 앞줄, 딜러/서포터 뒷줄
export function autoArrange() {
  if (PC_MODE || G.phase !== 'prep') return;
  const all = allUnits();
  const score = (u) => { const d = defOf(u); return d.cost * 10 + u.star * 14 + (d.role === 'tank' ? 4 : 0); };
  all.sort((a, b) => score(b) - score(a));
  const chosen = all.slice(0, G.level);
  G.board = Array(BOARD_SLOTS).fill(null);
  G.bench = Array(BENCH_SIZE).fill(null);
  const tanks = chosen.filter((u) => defOf(u).role === 'tank');
  const dealers = chosen.filter((u) => defOf(u).role === 'dealer');
  const supports = chosen.filter((u) => defOf(u).role === 'support');
  const put = (u, rows) => { for (const r of rows) for (const c of CENTER_COLS) { const idx = r * COLS + c; if (!G.board[idx]) { G.board[idx] = u; return; } } };
  tanks.forEach((u) => put(u, FRONT_ROWS));
  dealers.forEach((u) => put(u, BACK_ROWS));
  supports.forEach((u) => put(u, BACK_ROWS));
  const rest = all.slice(G.level);
  rest.forEach((u, i) => { G.bench[i] = u; });
  emit('change'); emit('sfx', 'click');
}

// ---------- 장비 ----------
export function equip(invIdx, loc) {
  if (G.phase !== 'prep') { toast('전투 중에는 장비를 장착할 수 없습니다.', 'warn'); return false; }
  const key = G.inv[invIdx];
  const u = getUnit(loc);
  if (!key || !u) return false;
  const it = ITEMS[key];
  // 조합: 이미 가진 기본 장비와 합치기
  if (it.tier === 1) {
    const j = u.items.findIndex((k) => ITEMS[k].tier === 1);
    if (j >= 0) {
      const res = combine(key, u.items[j]);
      if (res) {
        u.items[j] = res.key; G.inv.splice(invIdx, 1);
        toast(`${res.name} 조합 완성!`, 'good'); emit('sfx', 'merge'); emit('change'); return true;
      }
    }
  }
  if (u.items.length >= 3) { toast('장비 슬롯이 가득 찼습니다.', 'warn'); emit('sfx', 'deny'); return false; }
  u.items.push(key); G.inv.splice(invIdx, 1);
  emit('sfx', 'buy'); emit('change');
  return true;
}
export function unequip(loc, itemIdx) {
  if (G.phase !== 'prep') return false;
  const u = getUnit(loc);
  if (!u || !u.items[itemIdx]) return false;
  if (G.inv.length >= 10) { toast('장비 보관함이 가득 찼습니다.', 'warn'); return false; }
  G.inv.push(u.items.splice(itemIdx, 1)[0]);
  emit('sfx', 'click'); emit('change');
  return true;
}
export function combineInv(i, j) {
  if (i === j) return false;
  const a = G.inv[i], b = G.inv[j];
  if (!a || !b) return false;
  const res = combine(a, b);
  if (!res || ITEMS[a].tier !== 1 || ITEMS[b].tier !== 1) { toast('조합할 수 없는 장비입니다.', 'warn'); return false; }
  const hi = Math.max(i, j), lo = Math.min(i, j);
  G.inv.splice(hi, 1); G.inv[lo] = res.key;
  toast(`${res.name} 조합 완성!`, 'good'); emit('sfx', 'merge'); emit('change');
  return true;
}
function giveItem() {
  if (G.inv.length >= 10) return null;
  const k = COMP_KEYS[(Math.random() * COMP_KEYS.length) | 0];
  G.inv.push(k); return k;
}

// ---------- 전투 ----------
export function placedUnits() {
  const out = [];
  G.board.forEach((u, idx) => {
    if (!u) return;
    out.push({ def: defOf(u), star: u.star, items: u.items, col: idx % COLS, row: Math.floor(idx / COLS), uid: u.uid });
  });
  return out;
}
export function prepBattlers() {
  if (G.mode === 'pvp') {
    const showOpp = G.opp && (G.revealOpp || G.phase === 'battle' || G.phase === 'result');
    return [...buildPlayerBattlers(placedUnits()), ...(showOpp ? buildTeamBattlers(G.opp.placed, 1) : [])];
  }
  return [...buildPlayerBattlers(placedUnits()), ...buildEnemyBattlers(G.round)];
}
export function synergyNow() { return calcSynergies(placedUnits().map((p) => p.def)); }

export function startBattle() {
  if (G.phase !== 'prep' && !(G.mode === 'pvp' && G.phase === 'matching')) return null;
  if (PC_MODE) autoFill();
  if (boardCount() === 0 && G.mode !== 'pvp') { toast('출전할 학생을 보드에 배치하세요.', 'warn'); emit('sfx', 'deny'); return null; }
  if (PC_MODE && G.mode === 'pvp') {
    syncMe();
    while (G.pending.length) computeOne();
  }
  G.phase = 'battle';
  const b = new Battle(prepBattlers());
  G.battle = b;
  emit('change'); emit('sfx', 'start');
  return b;
}

export function combatReport(b) {
  return b.units
    .filter((u) => u.team === 0 && !u.def.isEnemy)
    .map((u) => ({
      uid: u.uid, key: u.def.key, name: u.def.name, star: u.star, role: u.def.role,
      dmgDealt: Math.round(u.damageDealt), dmgTaken: Math.round(u.damageTaken), healDone: Math.round(u.healDone),
    }));
}

export function finishBattle(b) {
  if (G.mode === 'pvp') return finishPvp(b);
  const win = b.winner === 0;
  const survivors = b.survivors?.enemy ?? 0;
  G.stats.kills += b.kills;
  let dmg = 0;
  if (win) { G.stats.wins++; G.streak = G.streak > 0 ? G.streak + 1 : 1; }
  else { G.stats.losses++; G.streak = G.streak < 0 ? G.streak - 1 : -1; dmg = 2 + survivors + Math.floor(G.round / 4); G.hp = Math.max(0, G.hp - dmg); }
  const base = 5;
  const intr = interest();
  const streakBonus = streakBonusFor(G.streak);
  const winBonus = win ? 1 : 0;
  const income = base + intr + streakBonus + winBonus;
  G.gold += income;
  G.stats.maxGold = Math.max(G.stats.maxGold, G.gold);
  addXp(2);
  // 장비 드롭
  const drops = [];
  const n = dropsFor(G.round);
  for (let i = 0; i < n; i++) { const k = giveItem(); if (k) drops.push(k); }
  const res = { win, dmg, income, intr, streakBonus, winBonus, drops, round: G.round, kills: b.kills, time: b.time, survivors, report: combatReport(b) };
  G.lastResult = res;
  const over = G.hp <= 0;
  const cleared = !over && G.round >= MAX_ROUND;
  G.phase = over ? 'over' : cleared ? 'over' : 'result';
  res.over = over; res.cleared = cleared;
  if (over || cleared) {
    const score = G.round * 100 + G.stats.wins * 20 + G.stats.kills * 2 + (cleared ? 1000 + G.hp * 30 : 0);
    res.score = score;
    saveBest({ score, round: G.round, cleared, wins: G.stats.wins, kills: G.stats.kills, hp: G.hp });
  }
  G.battle = null;
  emit('change');
  return res;
}

export function nextRound() {
  G.round++;
  G.phase = 'prep';
  runMerges(); // 전투 중 구입으로 보류된 합성 처리
  refreshShopNewRound();
  if (G.mode === 'pvp') startPvpPrep();
  emit('change');
}

// =====================================================================
// PVP: 준비 타이머 → 준비 완료/시간 종료 → 5초 매칭 → 1:1 전투 → 순위 갱신
// =====================================================================
const me = () => G.players[0];
export function syncMe() {
  const m = me(); if (!m) return;
  Object.assign(m, { hp: G.hp, maxHp: G.maxHp, gold: G.gold, level: G.level, wins: G.stats.wins, losses: G.stats.losses, streak: G.streak, placed: placedUnits() });
}
export function ranking() { syncMe(); return standings(G.players); }
export function myRank() { return ranking().findIndex((p) => p.id === 0) + 1; }
export const aliveCount = () => G.players.filter((p) => p.alive).length;
function startPvpPrep() {
  G.prepMax = G.prepT = PREP_TIME; G.ready = false; G.opp = null; G.revealOpp = false; G.matches = []; G.results = []; G.pending = [];
  for (const b of G.players) if (b.bot && b.alive) {
    botPrep(b, G.round);
    if (!PC_MODE) b.readyAt = 5 + Math.random() * 20 + (1 - b.skill) * 4;
  }
}
export function readyInfo() {
  const alive = G.players.filter((p) => p.alive);
  return { ready: alive.filter(isReady).length, total: alive.length };
}
export function isReady(p) {
  if (p.id === 0) return G.ready;
  return (PC_MODE && p.bot) || G.phase !== 'prep' || G.prepMax - G.prepT >= p.readyAt;
}
function allReady() { return G.ready && G.players.every((p) => !p.alive || isReady(p)); }

export function toggleReady() {
  if (G.mode !== 'pvp' || G.phase !== 'prep') return;
  G.ready = !G.ready;
  emit('sfx', G.ready ? 'buy' : 'click');
  if (PC_MODE && allReady()) beginMatching();
  else emit('change');
}
// 기존 편성을 유지하면서 출전 한도까지 빈 칸을 채운다.
function autoFill() {
  let remaining = G.level - boardCount();
  if (remaining <= 0) return;
  const bench = G.bench.map((u, i) => ({ u, i })).filter((entry) => entry.u);
  if (!PC_MODE) {
    const score = (unit) => defOf(unit).cost * 3 + unit.star;
    bench.sort((a, b) => score(b.u) - score(a.u));
  }
  for (const { u, i } of bench) {
    if (!remaining) break;
    const rows = defOf(u).role === 'tank' ? FRONT_ROWS : BACK_ROWS;
    const cell = rows.flatMap((row) => CENTER_COLS.map((col) => row * COLS + col))
      .find((idx) => !G.board[idx]);
    if (cell === undefined) break;
    G.board[cell] = u;
    G.bench[i] = null;
    remaining--;
  }
}
function beginMatching() {
  G.ready = false;
  if (!PC_MODE) autoFill();
  syncMe();
  G.phase = 'matching'; G.matchT = MATCH_TIME; G.revealOpp = false;
  G.matches = makeMatches(G.players, G.round);
  const mine = G.matches.find((m) => m.a.id === 0 || (m.b.id === 0 && !m.ghost));
  G.opp = mine ? (mine.a.id === 0 ? mine.b : mine.a) : null;
  G.oppGhost = !!(mine && mine.ghost);
  if (G.opp) me().oppHist.push(G.opp.id);
  G.pending = G.matches.filter((m) => m !== mine);
  G.results = [];
  emit('sfx', 'roll'); emit('change');
}
function computeOne(index = -1) {
  const [m] = G.pending.splice(index, 1);
  const r = resolveBotMatch(m, G.round);
  r.at = 7 + Math.random() * 20;
  G.results.push(r);
}
// 매 프레임 호출. 'battle' 을 반환하면 전투를 시작해야 함
export function tick(dt) {
  if (G.mode !== 'pvp') return null;
  if (G.phase === 'prep') {
    G.prepT = Math.max(0, G.prepT - dt);
    if (G.prepT <= 0 || allReady()) beginMatching();
    return null;
  }
  if (G.phase === 'matching') {
    G.matchT -= dt;
    // 내 잔상을 상대하는 봇은 자동 보충이 끝난 편성으로 계산한다.
    const next = PC_MODE ? G.pending.findLastIndex((match) => !match.ghost || match.b.id !== 0) : G.pending.length - 1;
    if (next >= 0) computeOne(next);
    if (!G.revealOpp && G.matchT <= MATCH_TIME - 2.2) { G.revealOpp = true; emit('sfx', 'merge'); emit('change'); }
    if (G.matchT <= 0) {
      if (!PC_MODE) while (G.pending.length) computeOne();
      return 'battle';
    }
  }
  return null;
}
// 전투 중 봇끼리의 결과를 시간에 맞춰 반영
export function applyDue(t, force = false) {
  const elim = [];
  for (const r of G.results.slice()) {
    if (r.done || (!force && r.at > t)) continue;
    r.done = true;
    const wasA = r.m.a.alive, wasB = r.m.b.alive;
    applyResult(r.m.a, r.aWin, r.dmgA, G.round);
    if (!r.m.ghost) { applyResult(r.m.b, !r.aWin, r.dmgB, G.round); r.m.b.oppHist.push(r.m.a.id); }
    r.m.a.oppHist.push(r.m.b.id);
    if (wasA && !r.m.a.alive) elim.push(r.m.a.name);
    if (!r.m.ghost && wasB && !r.m.b.alive) elim.push(r.m.b.name);
  }
  if (G.results.some((r) => r.done)) { G.results = G.results.filter((r) => !r.done); }
  if (elim.length) { for (const n of elim) toast(`${n} 탈락!`, 'warn'); }
  if (elim.length || true) emit('lb');
  return elim;
}
const PLACE_PTS = [0, 1000, 700, 500, 350, 250, 150, 80, 40];
function finishPvp(b) {
  syncMe();
  const win = b.winner === 0;
  const survivors = b.survivors?.enemy ?? 0;
  const mySurvivors = b.survivors?.player ?? 0;
  G.stats.kills += b.kills;
  let dmg = 0;
  if (win) { G.stats.wins++; G.streak = G.streak > 0 ? G.streak + 1 : 1; }
  else { G.stats.losses++; G.streak = G.streak < 0 ? G.streak - 1 : -1; dmg = lossDamage(survivors, G.round); G.hp = Math.max(0, G.hp - dmg); }
  const intr = interest();
  const streakBonus = streakBonusFor(G.streak);
  const winBonus = win ? 1 : 0;
  const income = 5 + intr + streakBonus + winBonus;
  G.gold += income; G.stats.maxGold = Math.max(G.stats.maxGold, G.gold);
  addXp(2);
  const drops = [];
  for (let i = 0, n = dropsFor(G.round); i < n; i++) { const k = giveItem(); if (k) drops.push(k); }
  // 남은 봇 전투 반영 후 순위 확정
  const m = me(); const oppName = G.opp ? G.opp.name : '-';
  const elim = applyDue(1e9, true);
  // 내 매치의 상대(잔상 매치 제외)에게도 결과 반영: 내가 이기면 상대가 피해를 입고, 지면 상대가 승리 처리
  const opp = G.opp;
  if (opp && !G.oppGhost) {
    const oppWasAlive = opp.alive;
    applyResult(opp, !win, win ? lossDamage(mySurvivors, G.round) : 0, G.round);
    opp.oppHist.push(0);
    if (oppWasAlive && !opp.alive) elim.push(opp.name);
  }
  m.hp = G.hp;
  if (G.hp <= 0 && m.alive) { m.alive = false; m.elimRound = G.round; }
  syncMe();
  const order = standings(G.players);
  const rank = order.findIndex((p) => p.id === 0) + 1;
  const alive = aliveCount();
  const dead = !m.alive;
  const cleared = m.alive && alive === 1;
  const res = { mode: 'pvp', win, dmg, income, intr, streakBonus, winBonus, drops, round: G.round, kills: b.kills, time: b.time, survivors, rank, alive, oppName, ghost: G.oppGhost, elim, total: G.players.length, report: combatReport(b) };
  G.lastResult = res;
  res.over = dead || cleared; res.cleared = cleared; res.placement = rank;
  G.phase = res.over ? 'over' : 'result';
  if (res.over) {
    const score = (PLACE_PTS[rank] || 0) + G.round * 20 + G.stats.wins * 15 + G.stats.kills * 2;
    res.score = score;
    saveBest({ score, round: G.round, cleared, placement: rank, wins: G.stats.wins, kills: G.stats.kills, hp: G.hp, mode: 'pvp' });
  }
  G.battle = null; G.opp = G.opp; // 결과 화면 동안 상대 정보 유지
  emit('change');
  return res;
}

export function synergyOf(placed) {
  const { counts, active } = calcSynergies(placed.map((p) => p.def));
  const t = SYNERGY_ORDER.filter((k) => active[k] >= 0).map((k) => `${SYNERGIES[k].name} ${counts[k]}`);
  return t.length ? t.join(' · ') : '';
}
