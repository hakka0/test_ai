// PVP 봇: 상점/경제/배치/장비 AI, 매치메이킹, 순위 계산 (DOM 의존 없음)
import {
  UNITS, UNIT_BY_KEY, SHOP_ODDS, XP_NEED, MAX_LEVEL, COLS, CENTER_COLS, FRONT_ROWS, BACK_ROWS,
  COMP_KEYS, COST_MULT, STAR_MULT, ITEMS, combine, dropsFor, BENCH_SIZE,
} from './data.js';
import { simulateMatch } from './sim.js';

export const PVP_PLAYERS = 8;
export const PVP_HP = 30;
export const PREP_FIRST = 45;      // 첫 라운드 준비 시간(초)
export const PREP_TIME = 30;       // 이후 준비 시간(초)
export const MATCH_TIME = 5;       // 매칭 연출 시간(초)
const BOT_NAMES = ['카이 선생', '리온 선생', '소라 선생', '네로 선생', '하나 선생', '유리 선생', '도윤 선생', '미나 선생', '세이 선생', '아란 선생'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [r[i], r[j]] = [r[j], r[i]]; } return r; };

let uidSeq = 1;
export function makePlayer(id, name, isBot, skill = 1) {
  return {
    id, name, bot: isBot, skill, style: (Math.random() * 4) | 0, hp: PVP_HP, maxHp: PVP_HP, alive: true, elimRound: 0,
    gold: 10, level: 3, xp: 0, streak: 0, wins: 0, losses: 0, units: [], inv: [], placed: [], readyAt: 0, ready: false, lastOpp: -1, oppHist: [],
  };
}
export function makeBots(n = PVP_PLAYERS - 1) {
  const names = shuffle(BOT_NAMES);
  const bots = [];
  for (let i = 0; i < n; i++) bots.push(makePlayer(i + 1, names[i], true, rnd(0.55, 1.0)));
  return bots;
}

// ---------- 봇 경제/상점 ----------
function drawKey(level) {
  const odds = SHOP_ODDS[level];
  let x = Math.random() * 100, cost = 1;
  for (let i = 0; i < 5; i++) { if ((x -= odds[i]) < 0) { cost = i + 1; break; } }
  return pick(UNITS.filter((u) => u.cost === cost)).key;
}
function mergeAll(b) {
  for (let guard = 0; guard < 8; guard++) {
    let did = false;
    for (const star of [1, 2]) {
      const byKey = {};
      for (const u of b.units) if (u.star === star) (byKey[u.key] = byKey[u.key] || []).push(u);
      for (const k in byKey) {
        if (byKey[k].length >= 3) {
          const three = byKey[k].slice(0, 3);
          const keep = three[0];
          keep.star = star + 1;
          for (const e of three.slice(1)) { keep.items.push(...e.items); b.units.splice(b.units.indexOf(e), 1); }
          while (keep.items.length > 3) b.inv.push(keep.items.pop());
          did = true; break;
        }
      }
      if (did) break;
    }
    if (!did) break;
  }
}
const power = (u) => COST_MULT[UNIT_BY_KEY[u.key].cost - 1] * STAR_MULT[u.star - 1] * (1 + u.items.length * 0.12);
function addXp(b, n) {
  b.xp += n;
  while (b.level < MAX_LEVEL && b.xp >= XP_NEED[b.level]) { b.xp -= XP_NEED[b.level]; b.level++; }
}
function desire(b, def) {
  const owned = b.units.filter((u) => u.key === def.key);
  let d = def.cost * 2 + Math.random() * 3;
  if (owned.length) d += 8 + owned.length * 4 + (owned.some((u) => u.star === 2) ? 6 : 0);
  const board = b.units;
  d += board.filter((u) => UNIT_BY_KEY[u.key].school === def.school).length * 1.2;
  d += board.filter((u) => UNIT_BY_KEY[u.key].role === def.role).length * 0.4;
  return d;
}
function sellWeakest(b) {
  const sorted = b.units.slice().sort((x, y) => power(x) - power(y));
  const w = sorted[0];
  if (!w) return;
  b.units.splice(b.units.indexOf(w), 1);
  const c = UNIT_BY_KEY[w.key].cost;
  b.gold += w.star === 1 ? c : c * (w.star === 2 ? 3 : 9) - 1;
  b.inv.push(...w.items);
}
// 라운드 시작 시 봇의 구매/배치/장비
export function botPrep(b, round) {
  const reserve = round < 3 ? 0 : [0, 10, 20, 30][b.style];
  const targetLv = Math.min(MAX_LEVEL, Math.max(3, Math.round(3 + (round - 1) / 2.2 + (b.skill - 0.75) * 1.6)));
  while (b.level < targetLv && b.gold - 4 >= reserve) { b.gold -= 4; addXp(b, 4); }
  const maxRolls = round < 3 ? 1 : Math.floor(2 + b.skill * 5);
  for (let roll = 0; roll <= maxRolls; roll++) {
    const shop = [0, 1, 2, 3, 4].map(() => drawKey(b.level)).sort((x, y) => desire(b, UNIT_BY_KEY[y]) - desire(b, UNIT_BY_KEY[x]));
    for (const key of shop) {
      const def = UNIT_BY_KEY[key];
      const owned = b.units.some((u) => u.key === key);
      if (b.gold < def.cost) continue;
      if (!owned && b.gold - def.cost < reserve) continue;
      if (!owned && b.units.length >= b.level + 3 && desire(b, def) < 12) continue;
      if (b.units.length >= BENCH_SIZE + b.level) sellWeakest(b);
      b.gold -= def.cost;
      b.units.push({ uid: uidSeq++, key, star: 1, items: [] });
      mergeAll(b);
    }
    if (roll < maxRolls && b.gold - 2 >= reserve + (b.skill > 0.8 ? 0 : 4)) b.gold -= 2; else break;
  }
  // 남는 크레딧이 많으면 경험치
  while (b.level < MAX_LEVEL && b.gold - 4 >= Math.max(reserve, 20 + b.style * 5)) { b.gold -= 4; addXp(b, 4); }
  equipBot(b);
  arrangeBot(b);
}
function equipBot(b) {
  const board = b.units.slice().sort((x, y) => power(y) - power(x)).slice(0, b.level);
  const pref = { mag: 'dealer', barrel: 'dealer', vest: 'tank', plate: 'tank', cell: 'support' };
  for (const it of b.inv.slice()) {
    const info = ITEMS[it];
    const role = info.tier === 1 ? pref[it] : 'dealer';
    let cands = board.filter((u) => UNIT_BY_KEY[u.key].role === role && (u.items.length < 3 || u.items.some((k) => ITEMS[k].tier === 1)));
    if (!cands.length) cands = board.filter((u) => u.items.length < 3 || u.items.some((k) => ITEMS[k].tier === 1));
    if (!cands.length) break;
    const u = cands.sort((x, y) => y.items.length - x.items.length || power(y) - power(x))[0];
    const j = info.tier === 1 ? u.items.findIndex((k) => ITEMS[k].tier === 1) : -1;
    if (j >= 0 && combine(it, u.items[j])) u.items[j] = combine(it, u.items[j]).key;
    else if (u.items.length < 3) u.items.push(it);
    else continue;
    b.inv.splice(b.inv.indexOf(it), 1);
  }
}
export function arrangeBot(b) {
  const sorted = b.units.slice().sort((x, y) => power(y) - power(x));
  const chosen = [];
  const role = (u) => UNIT_BY_KEY[u.key].role;
  const need = Math.max(1, Math.round(b.level * 0.3));
  for (const u of sorted) if (role(u) === 'tank' && chosen.length < need) chosen.push(u);
  const maxSup = Math.max(1, Math.floor(b.level / 4));
  let sup = 0;
  for (const u of sorted) {
    if (chosen.length >= b.level) break;
    if (chosen.includes(u)) continue;
    if (role(u) === 'support') { if (sup >= maxSup) continue; sup++; }
    chosen.push(u);
  }
  for (const u of sorted) { if (chosen.length >= b.level) break; if (!chosen.includes(u)) chosen.push(u); }
  const taken = new Set();
  const put = (u, rows) => {
    for (const r of rows) for (const c of CENTER_COLS) { const k = r * COLS + c; if (!taken.has(k)) { taken.add(k); return { col: c, row: r }; } }
    return { col: 0, row: 0 };
  };
  const placed = [];
  const add = (u, rows) => { const p = put(u, rows); placed.push({ def: UNIT_BY_KEY[u.key], star: u.star, items: u.items.slice(), col: p.col, row: p.row, uid: u.uid }); };
  const dealerRows = [...FRONT_ROWS.slice(1), 0];
  chosen.filter((u) => role(u) === 'tank').forEach((u) => add(u, FRONT_ROWS));
  chosen.filter((u) => role(u) === 'dealer').forEach((u) => add(u, dealerRows));
  chosen.filter((u) => role(u) === 'support').forEach((u) => add(u, BACK_ROWS));
  b.placed = placed;
}
// 전투 결과 반영 (승패/체력/수입)
export function applyResult(p, win, dmg, round) {
  if (win) { p.wins++; p.streak = p.streak > 0 ? p.streak + 1 : 1; }
  else { p.losses++; p.streak = p.streak < 0 ? p.streak - 1 : -1; p.hp -= dmg; }
  if (p.bot) {
    const sk = Math.abs(p.streak);
    p.gold += 5 + Math.min(5, Math.floor(p.gold / 10)) + (sk >= 6 ? 3 : sk >= 4 ? 2 : sk >= 2 ? 1 : 0) + (win ? 1 : 0);
    addXp(p, 2);
    const n = dropsFor(round);
    for (let i = 0; i < n && p.inv.length < 10; i++) p.inv.push(pick(COMP_KEYS));
  }
  if (p.hp <= 0 && p.alive) { p.alive = false; p.elimRound = round; }
}
export const lossDamage = (survivors, round) => 3 + survivors + Math.floor(round / 2);

// ---------- 매치메이킹 ----------
// 반환: [{a, b, ghost}]  ghost=true 면 b는 복제 편성(피해 없음)
export function makeMatches(players, round) {
  const alive = players.filter((p) => p.alive);
  const list = shuffle(alive);
  const matches = [];
  let left = null;
  if (list.length % 2 === 1) left = list.pop();
  const me = list.find((p) => !p.bot);
  if (me) {
    const idx = list.indexOf(me);
    const others = list.filter((p) => p !== me);
    // 최근에 만난 상대를 피한다
    others.sort((x, y) => me.oppHist.lastIndexOf(x.id) - me.oppHist.lastIndexOf(y.id) || Math.random() - 0.5);
    const opp = others[0];
    list.splice(0, list.length, me, opp, ...list.filter((p) => p !== me && p !== opp));
    void idx;
  }
  for (let i = 0; i + 1 < list.length; i += 2) matches.push({ a: list[i], b: list[i + 1], ghost: false });
  if (left) {
    const others = alive.filter((p) => p !== left);
    const target = others.length ? pick(others) : left;
    matches.push({ a: left, b: target, ghost: true });
  }
  if (me) matches.sort((x, y) => ((y.a === me || y.b === me) ? 1 : 0) - ((x.a === me || x.b === me) ? 1 : 0));
  return matches;
}
// 봇끼리의 전투 계산
export function resolveBotMatch(m, round) {
  const r = simulateMatch(m.a.placed, m.b.placed);
  const aWin = r.winner === 0;
  return {
    m, aWin,
    dmgA: aWin ? 0 : lossDamage(r.b, round),
    dmgB: !aWin && !m.ghost ? 0 : (m.ghost ? 0 : lossDamage(r.a, round)),
  };
}
// 순위표: 생존자 우선 → 체력 → 탈락 라운드(늦을수록 상위)
export function standings(players) {
  return players.slice().sort((x, y) => (y.alive - x.alive) || (y.alive ? (y.hp - x.hp) || (y.wins - x.wins) : (y.elimRound - x.elimRound) || (y.hp - x.hp)) || (x.id - y.id));
}
