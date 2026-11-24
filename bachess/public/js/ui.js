// DOM UI: 상점, 벤치, 시너지, 툴팁, 모달, 드래그 앤 드롭
import {
  UNITS, UNIT_BY_KEY, SCHOOLS, ROLES, WEAPONS, ITEMS, COMP_KEYS, COMPONENTS, combine, COST_COLORS, SYNERGIES, SYNERGY_ORDER,
  skillDesc, MAX_ROUND, describeWave, ENEMY_TYPES, BENCH_SIZE, COLS, ROWS, SIDE_ROWS, CW, CH, BOARD_W, BOARD_H, XP_NEED, MAX_LEVEL, PC_MODE,
} from './data.js';
import { computeUnitStats } from './sim.js';
import * as S from './state.js';
import { portraitURL, itemURL, getEnemySprite, roleIconSVG } from './sprites.js';
import { unproject } from './battlefield-view.js';
import { sfx, setMuted, isMuted, setVolumes } from './audio.js';
import { MATCH_TIME } from './bots.js';

const $ = (s) => document.querySelector(s);
const G = S.G;
export const UI = { renderer: null, sel: null, speed: 1, paused: false, quality: 'high', volS: 0.8, volM: 0.5, scale: 1, synCollapsed: false, hooks: {} };

let stage, tip, drag = null, hoverTipKey = null;
const stars = (n) => '★'.repeat(n);
const pct = (v) => Math.round(v * 100) + '%';

// ---------- 좌표 ----------
function stagePt(e) {
  const r = stage.getBoundingClientRect();
  return { x: (e.clientX - r.left) / UI.scale, y: (e.clientY - r.top) / UI.scale };
}
function boardPt(e) {
  const r = $('#board').getBoundingClientRect();
  const screenX = ((e.clientX - r.left) / r.width) * BOARD_W;
  const screenY = ((e.clientY - r.top) / r.height) * BOARD_H;
  const point = unproject(screenX, screenY);
  return { ...point, screenX, screenY, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
}
function boardCell(point) {
  const col = Math.floor(point.x / CW), row = Math.floor(point.y / CH);
  const onFloor = row >= 0 && row < ROWS && col >= 0 && col < COLS;
  return { col, row, onFloor, own: onFloor && row >= SIDE_ROWS };
}

// ---------- 헬퍼 ----------
const enemyIconCache = new Map();
function enemyURL(type) {
  if (enemyIconCache.has(type)) return enemyIconCache.get(type);
  const t = ENEMY_TYPES[type];
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  c.getContext('2d').drawImage(getEnemySprite({ key: 'e_' + type, isEnemy: true }, t.color), 8, 0, 80, 80, 0, 0, 64, 64);
  const u = c.toDataURL(); enemyIconCache.set(type, u); return u;
}
const schoolChip = (k) => `<span class="chip school" style="--c:${SCHOOLS[k].color}"><i>${SCHOOLS[k].name}</i></span>`;
const roleChip = (k) => `<span class="chip" style="--c:${ROLES[k].color}">${ROLES[k].name}</span>`;
function ownedCount(key, star = 1) { return S.allUnits().filter((u) => u.key === key && u.star === star).length; }

// ---------- 툴팁 ----------
function statsFor(def, star, items, battler) {
  if (battler) {
    return { maxHp: battler.maxHp, atk: battler.atk, as: battler.as, def: battler.defense, range: battler.range, manaMax: battler.manaMax, mana0: Math.round(battler.mana), crit: battler.crit, critDmg: battler.critDmg };
  }
  const s = computeUnitStats(def, star, items || [], null);
  return { maxHp: s.maxHp, atk: s.atk, as: s.as, def: s.def, range: s.range, manaMax: s.manaMax, mana0: s.mana0, crit: s.crit, critDmg: s.critDmg };
}
function unitTipHTML(def, star, items, battler) {
  const st = statsFor(def, star, items, battler);
  const w = WEAPONS[def.weapon];
  const isE = def.isEnemy;
  const skill = def.skill;
  let h = `<h4>${def.name} <span class="stars">${isE ? '' : stars(star)}</span></h4><div class="chips">`;
  if (def.school) h += schoolChip(def.school);
  h += roleChip(def.role) + `<span class="chip" style="--c:#6a7a96">${w.name} · ${st.range}칸</span></div>`;
  h += `<div class="hint" style="margin-top:3px">${ROLES[def.role].desc}</div>`;
  h += `<h5>능력치</h5><div class="grid"><span>체력 <b>${Math.round(st.maxHp)}</b></span><span>공격력 <b>${Math.round(st.atk)}</b></span><span>공격 속도 <b>${st.as.toFixed(2)}</b></span><span>방어력 <b>${pct(st.def)}</b></span><span>치명타 <b>${pct(st.crit)}</b></span><span>시작 마나 <b>${st.mana0}/${st.manaMax}</b></span></div>`;
  if (skill && skill.type !== 'none') {
    const desc = isE ? '' : skillDesc(def, star);
    h += `<h5>스킬</h5><div class="sk"><span class="t">${skill.name}</span>${desc ? '<br>' + desc : ''}</div>`;
  }
  if (items && items.length) {
    h += `<h5>장비</h5>` + items.map((k) => `<div>· <b>${ITEMS[k].name}</b> — ${ITEMS[k].desc}</div>`).join('');
  }
  return h;
}
function synTipHTML(key) {
  const sy = SYNERGIES[key];
  const { counts, active } = S.synergyNow();
  let h = `<h4>${sy.name}  <span style="font-size:13px;color:#fff">${counts[key]}명 활성</span></h4><div class="hint" style="margin:0 0 4px">${sy.desc}</div>`;
  sy.tiers.forEach((t, i) => {
    h += `<div class="tier ${active[key] >= i ? 'on' : ''}"><b>${t}명</b> — ${sy.effects[i].text}</div>`;
  });
  const members = UNITS.filter((u) => (sy.kind === 'school' ? u.school === key : u.role === key));
  const own = new Set(S.placedUnits().map((p) => p.def.key));
  h += `<h5>소속 학생</h5><div class="mini">` + members.map((u) => `<img class="${own.has(u.key) ? 'own' : ''}" src="${portraitURL(u, 56)}" alt="${u.name}">`).join('') + `</div>`;
  h += `<div class="hint">보드에 배치한 서로 다른 학생 수로 계산됩니다.</div>`;
  return h;
}
function itemTipHTML(key) {
  const it = ITEMS[key];
  let h = `<h4>${it.name}</h4><div>${it.desc}</div>`;
  if (it.tier === 2) {
    h += `<h5>조합법</h5><div class="parts"><img src="${itemURL(it.parts[0], 34)}"> + <img src="${itemURL(it.parts[1], 34)}"></div><div class="hint">${COMPONENTS[it.parts[0]].name} + ${COMPONENTS[it.parts[1]].name}</div>`;
  } else {
    h += `<h5>조합 가능한 장비</h5>` + COMP_KEYS.map((k) => { const r = combine(key, k); return `<div>· ${COMPONENTS[k].name} → <b>${r.name}</b></div>`; }).join('');
    h += `<div class="hint">다른 기본 장비 위로 드래그하거나, 이미 기본 장비를 가진 학생에게 장착하면 자동 조합됩니다.</div>`;
  }
  return h;
}
const FIXED_TIPS = {
  level: `<h4>플레이어 레벨</h4>레벨만큼 보드에 학생을 출전시킬 수 있습니다. 경험치는 라운드마다 +2, 구매로 +4 얻습니다.`,
  round: `<h4>라운드</h4>총 ${MAX_ROUND}라운드. 5, 10, 15라운드에는 <b>보스</b>가 등장합니다. 패배하면 남은 적 수만큼 체력이 감소합니다.`,
  hp: `<h4>체력</h4>0이 되면 게임 오버입니다. 전투에서 패배하면 <b>2 + 생존한 적 수</b> 이상의 피해를 받습니다.`,
  gold: `<h4>크레딧</h4>보유 크레딧 10당 이자 +1 (최대 +5). 연승/연패 보너스와 승리 보너스가 추가로 지급됩니다.`,
  kills: `<h4>청휘석 (처치 점수)</h4>쓰러뜨린 적의 누적 수입니다. 최종 점수에 반영됩니다.`,
  'btn-syn': `<h4>시너지 패널 접기/펼치기</h4>단축키 <b>S</b>`,
  'btn-recipe': `<h4>장비 조합표</h4>모든 장비 조합을 한눈에 봅니다. 단축키 <b>R</b>`,
  'btn-help': `<h4>도움말</h4>게임 방법과 단축키. 단축키 <b>H</b>`,
  'btn-mute': `<h4>소리 켜기/끄기</h4>단축키 <b>M</b>`,
  'btn-opt': `<h4>설정</h4>이펙트 품질(저사양 모드), 볼륨`,
  'btn-sell': `<h4>판매</h4>선택한 학생을 판매합니다. 단축키 <b>E</b>, 또는 상점 영역으로 드래그`,
  'btn-reroll': `<h4>리롤</h4>2 크레딧으로 상점을 새로 고칩니다. 단축키 <b>D</b>`,
  'btn-xp': `<h4>경험치 구매</h4>4 크레딧으로 경험치 +4. 레벨이 오르면 출전 인원이 늘어납니다. 단축키 <b>F</b>`,
  'btn-lock': `<h4>상점 잠금</h4>다음 라운드에도 현재 상점을 유지합니다.${PC_MODE ? ' 다음 라운드가 시작되면 잠금이 풀립니다.' : ''} 단축키 <b>L</b>`,
  'btn-start': `<h4>준비 완료</h4>모든 플레이어가 준비를 마치거나 시간이 끝나면 5초간 상대를 매칭한 뒤 1:1 전투가 시작됩니다. 단축키 <b>Space</b>`,
  'btn-auto': `<h4>자동 배치</h4>탱커는 앞줄, 딜러·서포터는 뒷줄에 최적 배치합니다. 단축키 <b>A</b>`,
  'btn-speed': `<h4>전투 배속</h4>x1 → x2 → x3. 단축키 <b>Q</b>`,
  'btn-pause': `<h4>일시정지</h4>전투 중 정지/재개. 단축키 <b>P</b>`,
  'btn-lb': `<h4>순위표</h4>남은 체력 기준 실시간 순위입니다. 이름에 마우스를 올리면 편성을 볼 수 있어요.`,
};
function tipHTMLFor(spec) {
  const [kind, arg] = spec.split('|');
  switch (kind) {
    case 'unit-shop': { const k = G.shop[+arg]; if (!k) return null; const d = UNIT_BY_KEY[k]; return unitTipHTML(d, 1, [], null) + `<div class="hint">클릭하여 구매 · 같은 학생 3명이면 ★ 합성</div>`; }
    case 'unit-bench': { const u = G.bench[+arg]; if (!u) return null; return unitTipHTML(S.defOf(u), u.star, u.items, null); }
    case 'syn': return synTipHTML(arg);
    case 'pl': return playerTipHTML(+arg);
    case 'item': return itemTipHTML(arg);
    case 'inv': { const k = G.inv[+arg]; return k ? itemTipHTML(k) : null; }
    case 'eq': { const [uid, idx] = arg.split(':'); const loc = S.locOfUid(+uid); if (!loc) return null; const k = S.getUnit(loc).items[+idx]; return k ? itemTipHTML(k) + '<div class="hint">클릭하면 보관함으로 되돌립니다.</div>' : null; }
    case 'enemy': return `<h4>${ENEMY_TYPES[arg].name}</h4>${ENEMY_TYPES[arg].boss ? '<b>보스</b> — 체력이 매우 높고 강력한 스킬을 사용합니다.' : '헬멧단 소속 적. 역할: ' + ROLES[ENEMY_TYPES[arg].role].name + ' · ' + WEAPONS[ENEMY_TYPES[arg].weapon].name}`;
    case 'recipe': { const [a, b] = arg.split('+'); const r = combine(a, b); return itemTipHTML(r.key); }
    default: return FIXED_TIPS[kind] || null;
  }
}
function showTip(html, x, y) {
  tip.innerHTML = html; tip.classList.remove('hidden');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let tx = x + 16, ty = y + 16;
  if (tx + w > 1272) tx = x - w - 14;
  if (ty + h > 714) ty = Math.max(6, 714 - h);
  if (tx < 4) tx = 4;
  tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
}
function hideTip() { tip.classList.add('hidden'); hoverTipKey = null; }

// ---------- 렌더 ----------
export function renderAll() {
  renderTop(); renderLb(); renderSyn(); renderShop(); renderBench(); renderInv(); renderRight(); renderCtrl();
  refreshBoard();
}
export function refreshBoard() {
  if (!UI.renderer) return;
  if (G.phase === 'prep') {
    const units = S.prepBattlers();
    if (PC_MODE) {
      for (const unit of units) unit.aim = Math.PI / 2;
    }
    UI.renderer.setUnits(units);
  }
  UI.renderer.selectedUid = UI.sel;
}

function renderTop() {
  $('#lvnum').textContent = G.level;
  const need = S.xpNeed();
  $('#xpfill').style.width = need === Infinity ? '100%' : Math.min(100, (G.xp / need) * 100) + '%';
  $('#xptxt').textContent = need === Infinity ? 'MAX' : `${G.xp}/${need}`;
  const pvp = G.mode === 'pvp';
  $('#rnum').textContent = G.round; $('#rmax').textContent = MAX_ROUND;
  $('#rmax').parentElement.style.display = pvp ? 'none' : '';
  updateTimer(true);
  const hp = $('#hpnum'); hp.textContent = G.hp; hp.classList.toggle('low', G.hp <= G.maxHp * 0.3);
  $('#hpmax').textContent = '/' + G.maxHp;
  $('#goldnum').textContent = G.gold;
  const it = S.interest();
  $('#intnum').textContent = it > 0 ? `+${it}` : '';
  $('#killnum').textContent = G.stats.kills;
}

let lastTimerTxt = '';
export function updateTimer(force) {
  const ph = $('#phase');
  let txt, cls = '';
  if (G.mode === 'pvp' && G.phase === 'prep') {
    const t = Math.ceil(G.prepT);
    txt = `준비 ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    cls = 'timer' + (t <= 5 ? ' warn' : '');
  } else if (G.phase === 'matching') { txt = '매칭 중'; cls = 'timer'; }
  else if (G.phase === 'battle') { txt = '전투 중'; cls = 'battle'; }
  else if (G.phase === 'result' || G.phase === 'over') txt = '전투 종료';
  else txt = '준비 단계';
  const k = txt + cls;
  if (!force && k === lastTimerTxt) return;
  lastTimerTxt = k; ph.textContent = txt; ph.className = cls;
  if (G.mode === 'pvp' && G.phase === 'prep') renderCtrlLabel();
}
export function renderLb() {
  const el = $('#lbList');
  if (G.mode !== 'pvp' || !G.players.length) { $('#lbPanel').style.display = 'none'; return; }
  $('#lbPanel').style.display = '';
  const list = S.ranking();
  const ri = S.readyInfo();
  $('#lbInfo').textContent = G.phase === 'prep' ? `준비 ${ri.ready}/${ri.total}` : `생존 ${S.aliveCount()}/${G.players.length}`;
  const oppId = G.opp && (G.phase === 'matching' || G.phase === 'battle' || G.phase === 'result') && G.revealOpp !== false ? G.opp.id : -1;
  el.innerHTML = list.map((p, i) => {
    const pc = Math.max(0, p.hp) / p.maxHp;
    const cls = [p.id === 0 ? 'me' : '', p.id === oppId ? 'opp' : '', p.alive ? '' : 'dead'].join(' ');
    let st = '';
    if (!p.alive) st = '';
    else if (p.id === oppId) st = '⚔';
    else if (G.phase === 'prep' && S.isReady(p)) st = '✔';
    return `<li class="${cls}" data-tip="pl|${p.id}"><span class="rk">${i + 1}</span><span class="nm">${p.id === 0 ? '나' : p.name}</span><span class="hpb"><i class="${pc <= 0.3 ? 'low' : pc <= 0.6 ? 'mid' : ''}" style="width:${pc * 100}%"></i></span><span class="hpn">${p.alive ? p.hp : '탈락'}</span><span class="st">${st}</span></li>`;
  }).join('');
}
function playerTipHTML(id) {
  const p = G.players.find((x) => x.id === id);
  if (!p) return null;
  S.syncMe();
  const syn = p.placed.length ? S.synergyOf(p.placed) : null;
  let h = `<h4>${p.id === 0 ? '나' : p.name} <span style="font-size:12px;color:#9fd0ff">${p.alive ? '생존' : '탈락'}</span></h4>`;
  h += `<div class="grid"><span>체력 <b>${Math.max(0, p.hp)}/${p.maxHp}</b></span><span>레벨 <b>${p.level}</b></span><span>승/패 <b>${p.wins}/${p.losses}</b></span><span>연속 <b>${p.streak > 0 ? p.streak + '연승' : p.streak < 0 ? -p.streak + '연패' : '-'}</b></span></div>`;
  if (p.placed.length) {
    h += `<h5>현재 편성</h5><div class="mini">` + p.placed.map((u) => `<img class="own" src="${portraitURL(u.def, 56)}" alt="">`).join('') + `</div>`;
    if (syn) h += `<div class="hint">${syn}</div>`;
  }
  return h;
}
function renderSyn() {
  const { counts, active } = S.synergyNow();
  const order = SYNERGY_ORDER.slice().sort((a, b) => (active[b] >= 0) - (active[a] >= 0) || counts[b] - counts[a]);
  $('#synList').innerHTML = order.map((k) => {
    const sy = SYNERGIES[k];
    const act = active[k] >= 0;
    const dim = counts[k] === 0;
    const next = sy.tiers.find((t) => counts[k] < t);
    const pips = sy.tiers.map((t) => `<i class="${counts[k] >= t ? 'on' : ''}"></i>`).join('');
    const icon = sy.kind === 'school' ? SCHOOLS[k].letter : roleIconSVG(k);
    return `<li class="${act ? 'act' : dim ? 'dim' : ''}" data-tip="syn|${k}"><span class="sicon" data-n="${counts[k]}" style="--c:${sy.color}">${icon}</span><span class="snm">${sy.name}</span><span class="pips">${pips}</span><span class="cnt">${counts[k]}${next ? `<small style="opacity:.6;font-weight:600">/${next}</small>` : ''}</span></li>`;
  }).join('');
  const n = S.boardCount();
  $('#teamCount').innerHTML = `출전 <b class="${n >= G.level ? 'full' : ''}">${n}/${G.level}</b>`;
}

function renderShop() {
  const el = $('#shopRow');
  el.innerHTML = G.shop.map((k, i) => {
    if (!k) return `<div class="scard sold"></div>`;
    const d = UNIT_BY_KEY[k];
    const poor = G.gold < d.cost;
    const own = ownedCount(k, 1);
    const badge = own >= 2 ? `<span class="triple">합성!</span>` : own === 1 ? `<span class="triple" style="background:#6a8cc0">보유 1</span>` : '';
    return `<div class="scard ${poor ? 'poor' : ''} ${G.locked ? 'locked' : ''}" data-shop="${i}" data-tip="unit-shop|${i}" style="--cc:${COST_COLORS[d.cost - 1]}">
      <div class="cbox">${d.cost}</div><div class="nm">${d.name}</div><img class="pt" src="${portraitURL(d, 72)}" alt="">
      <div class="meta">${schoolChip(d.school)}${roleChip(d.role)}<span class="wp">${WEAPONS[d.weapon].name} · ${WEAPONS[d.weapon].range}칸</span></div>
      ${badge}<div class="buy"><b><i class="coin"></i>${d.cost}</b>구매하기</div></div>`;
  }).join('');
}

function renderBench() {
  $('#benchRow').innerHTML = G.bench.map((u, i) => {
    if (!u) return `<div class="bslot" data-bslot="${i}"></div>`;
    const d = S.defOf(u);
    const eqs = u.items.map((k) => `<i style="--c:${ITEMS[k].color}"></i>`).join('');
    return `<div class="bslot has ${UI.sel === u.uid ? 'sel' : ''}" data-bslot="${i}" data-bench="${i}" data-tip="unit-bench|${i}"><img class="pt" src="${portraitURL(d, 56)}" alt=""><span class="stars">${u.star > 1 ? stars(u.star) : ''}</span><span class="tag" style="--c:${ROLES[d.role].color}">${ROLES[d.role].name}</span><span class="eqs">${eqs}</span></div>`;
  }).join('');
}

function renderInv() {
  const slots = [];
  for (let i = 0; i < 10; i++) {
    const k = G.inv[i];
    slots.push(k ? `<div class="islot has" data-inv="${i}" data-tip="inv|${i}"><img src="${itemURL(k, 40)}" alt=""></div>` : `<div class="islot"></div>`);
  }
  $('#invGrid').innerHTML = slots.join('');
  $('#invcount').textContent = `${G.inv.length}/10`;
}

function oppUnitsHTML(p, n = 5) {
  return p.placed.slice().sort((a, b) => b.def.cost * b.star - a.def.cost * a.star).slice(0, n)
    .map((u) => `<div class="eic" style="background-image:url(${portraitURL(u.def, 48)})">${u.star > 1 ? `<b>${'★'.repeat(u.star)}</b>` : ''}</div>`).join('');
}
function renderEnemy() {
  const box = $('#enemyList');
  if (G.mode === 'pvp') {
    box.classList.add('pvp');
    const ph = document.querySelector('.enemybox .ph');
    ph.querySelector('span').textContent = '이번 상대';
    ph.querySelector('em')?.remove();
    const show = G.opp && (G.phase === 'battle' || G.phase === 'result' || G.phase === 'over' || (G.phase === 'matching' && G.revealOpp));
    if (show) {
      box.innerHTML = oppUnitsHTML(G.opp);
      ph.insertAdjacentHTML('beforeend', `<em>${G.opp.name}${G.oppGhost ? ' (잔상)' : ''}</em>`);
    } else {
      const ri = S.readyInfo();
      box.innerHTML = `<div class="wait">${G.phase === 'matching' ? '상대를 찾는 중...' : `모두 준비하면 매칭이 시작됩니다.<br>준비 완료 <b>${ri.ready}/${ri.total}</b> · 시간이 끝나도 시작`}</div>`;
    }
    return;
  }
  box.classList.remove('pvp');
  const w = describeWave(G.round);
  let h = Object.entries(w.counts).map(([t, n]) => `<div class="eic ${ENEMY_TYPES[t].boss ? 'boss' : ''}" data-tip="enemy|${t}" style="background-image:url(${enemyURL(t)})">${n > 1 ? `<b>${n}</b>` : ''}</div>`).join('');
  if (w.boss) h += `<span class="bosstag">BOSS</span>`;
  $('#enemyList').innerHTML = h;
}

function selectedUnit() {
  if (!UI.sel) return null;
  const loc = S.locOfUid(UI.sel);
  if (!loc) return null;
  return { u: S.getUnit(loc), loc };
}
function renderRight() {
  renderEnemy();
  const box = $('#unitBox');
  const s = selectedUnit();
  if (!s) {
    box.innerHTML = `<div class="ph"><span>학생 정보</span></div><div class="empty">학생을 클릭하면<br>상세 정보가 표시됩니다.<br><small>마우스를 올리면 스킬 툴팁이 나타나요</small></div>`;
    return;
  }
  const { u, loc } = s;
  const d = S.defOf(u);
  let battler = null;
  if (loc.where === 'board' && UI.renderer) battler = UI.renderer.units.find((x) => x.uid === u.uid && x.team === 0);
  const st = statsFor(d, u.star, u.items, battler);
  const eq = [0, 1, 2].map((i) => u.items[i] ? `<div class="eqslot has" data-eq="${u.uid}:${i}" data-tip="eq|${u.uid}:${i}"><img src="${itemURL(u.items[i], 36)}" alt=""></div>` : `<div class="eqslot" data-eqdrop="${u.uid}"></div>`).join('');
  box.innerHTML = `<div class="ph"><span>학생 정보</span><em>${loc.where === 'board' ? '출전 중' : '벤치'}</em></div>
    <div class="ucard"><img class="pt" src="${portraitURL(d, 64)}" style="--cc:${COST_COLORS[d.cost - 1]}" alt=""><div><div class="nm">${d.name}</div><div class="st">${stars(u.star)}</div><div class="chips">${schoolChip(d.school)}${roleChip(d.role)}</div></div></div>
    <div class="statgrid"><span>체력<b>${Math.round(st.maxHp)}</b></span><span>공격<b>${Math.round(st.atk)}</b></span><span>공속<b>${st.as.toFixed(2)}</b></span><span>방어<b>${pct(st.def)}</b></span><span>사거리<b>${st.range}칸</b></span><span>치명<b>${pct(st.crit)}</b></span></div>
    <div class="skline"><b class="t">${d.skill.name}</b> ${skillDesc(d, u.star).replace(/<\/?b>/g, '')}</div>
    <div class="eqrow">${eq}<button class="btn white ${loc.where === 'board' && G.phase !== 'prep' ? 'off' : ''}" id="btnSell" data-tip="btn-sell"><span>${loc.where === 'board' && G.phase !== 'prep' ? '전투 중 판매 불가' : `판매 +${S.sellPrice(u)}`}</span></button></div>`;
}

function renderCtrl() {
  const prep = G.phase === 'prep';
  $('#btnReroll').classList.toggle('off', !prep || G.gold < 2);
  $('#btnXp').classList.toggle('off', !prep || G.gold < 4 || G.level >= MAX_LEVEL);
  $('#lockLbl').textContent = G.locked ? '잠금 해제' : '상점 잠금';
  $('#btnLock').classList.toggle('active', G.locked);
  const bs = $('#btnStart');
  bs.classList.toggle('off', G.phase === 'battle' || G.phase === 'result' || G.phase === 'matching' || G.phase === 'over');
  bs.classList.toggle('ready', G.mode === 'pvp' && prep && G.ready);
  bs.classList.toggle('yellow', !(G.mode === 'pvp' && prep && G.ready));
  renderCtrlLabel();
  $('#btnAuto').classList.toggle('off', !prep);
  $('#btnPause').classList.toggle('off', G.phase !== 'battle');
  $('#pauseLbl').textContent = UI.paused ? '재개' : '일시정지';
  if (!PC_MODE) $('#speedLbl').textContent = `배속 x${UI.speed}`;
  $('#hud').style.visibility = G.phase === 'battle' ? 'visible' : 'hidden';
  $('#btnSyn').classList.toggle('on', !UI.synCollapsed);
  $('#btnMute').classList.toggle('muted', isMuted());
}

export function renderCtrlLabel() {
  const prep = G.phase === 'prep';
  let t;
  if (G.mode === 'pvp') {
    const ri = S.readyInfo();
    t = prep ? (G.ready ? `준비 완료! ${ri.ready}/${ri.total}` : '준비 완료') : G.phase === 'matching' ? '매칭 중...' : G.phase === 'battle' ? '전투 중...' : '확인';
  } else t = prep ? '전투 시작' : G.phase === 'battle' ? '전투 중...' : '확인';
  $('#startLbl').textContent = t;
}
export function refreshReady() { renderLb(); renderCtrl(); if (G.mode === 'pvp' && G.phase === 'prep') renderEnemy(); }
export function updateHud(b) {
  $('#hudA').textContent = b.units.filter((u) => u.alive && u.team === 0).length;
  $('#hudE').textContent = b.units.filter((u) => u.alive && u.team === 1).length;
  const t = Math.floor(b.time);
  $('#hudT').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  if (PC_MODE) $('#hudFever').classList.toggle('hidden', !b.fever);
}

// ---------- 토스트/배너 ----------
export function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
}
export function banner(text, cls, ms = 1400) {
  const b = $('#banner');
  b.className = 'show ' + (cls || '');
  b.innerHTML = `<div class="bn">${text}</div>`;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.className = ''; b.innerHTML = ''; }, ms);
}

// ---------- 매칭 오버레이 ----------
let ovState = '';
export function updateMatch() {
  const ov = $('#matchOv');
  if (G.mode !== 'pvp' || G.phase !== 'matching') { if (ovState) { ov.classList.add('hidden'); ov.innerHTML = ''; ovState = ''; } return; }
  ov.classList.remove('hidden');
  const cd = Math.max(1, Math.ceil(G.matchT));
  if (!G.revealOpp) {
    if (ovState !== 'find') { ov.innerHTML = `<div class="mt">MATCHING</div><div class="spin"></div><div class="mmain">상대를 찾는 중</div><div class="sub">준비 단계가 끝났습니다</div>`; ovState = 'find'; }
    return;
  }
  const o = G.opp; const me = G.players[0];
  const key = 'vs' + cd;
  if (ovState === key) return;
  const first = !ovState.startsWith('vs');
  ovState = key;
  const syn = (p) => S.synergyOf(p.placed) || '시너지 없음';
  const side = (p, foe) => `<div class="side ${foe ? 'foe' : ''}"><div class="pn">${p.id === 0 ? '나' : p.name}${foe && G.oppGhost ? ' (잔상)' : ''}</div><div class="ps">체력 ${p.hp}/${p.maxHp} · Lv.${p.level} · ${syn(p)}</div><div class="pu">${p.placed.slice(0, 9).map((u) => `<img src="${portraitURL(u.def, 40)}" alt="">`).join('')}</div></div>`;
  S.syncMe();
  const order = S.ranking();
  const rank = (p) => order.findIndex((x) => x.id === p.id) + 1;
  ov.innerHTML = `<div class="mt">ROUND ${G.round}</div><div class="vs" ${first ? '' : 'style="animation:none"'}>${side(me, false)}<div class="vsmark">VS</div>${side(o, true)}</div><div class="cd">${cd}</div><div class="sub">나 ${rank(me)}위 vs 상대 ${rank(o)}위 · 전투가 곧 시작됩니다</div>`;
}

// ---------- 결과 / 종료 ----------
export function showResult(res, onOk) {
  const el = $('#resultPanel');
  const rows = [
    ['기본 보상', `+5`], ['이자', `+${res.intr}`], ['연승/연패 보너스', `+${res.streakBonus}`], ['승리 보너스', `+${res.winBonus}`],
  ].filter((r, i) => i === 0 || r[1] !== '+0');
  if (!res.win) rows.unshift(['받은 피해', `-${res.dmg} 체력`]);
  if (res.mode === 'pvp') { rows.unshift(['상대', `${res.oppName}${res.ghost ? ' (잔상)' : ''}`]); rows.push(['현재 순위', `${res.rank}위 / 생존 ${res.alive}명`]); }
  else rows.push(['처치한 적', `${res.kills}`]);
  el.innerHTML = `<div class="rh ${res.win ? 'win' : 'lose'}">${res.win ? 'VICTORY' : 'DEFEAT'} <span style="font-size:15px;margin-left:12px;opacity:.9">ROUND ${res.round}</span></div>
    <table>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}<tr><td><b>획득 크레딧</b></td><td style="color:#c98d00">+${res.income}</td></tr></table>
    ${res.drops.length ? `<div class="drops">${res.drops.map((k) => `<img src="${itemURL(k, 40)}" data-tip="item|${k}">`).join('')}</div><div style="text-align:center;font-size:12px;color:var(--ink2);font-weight:700">장비를 획득했습니다!</div>` : ''}
    <div class="okrow"><button class="btn yellow big" id="btnOk" style="width:200px"><span>${res.over || res.cleared ? '결과 보기' : '다음 라운드'}</span><kbd>Space</kbd></button></div>`;
  el.classList.remove('hidden');
  $('#btnOk').onclick = () => { el.classList.add('hidden'); onOk(); };
}
export function hideResult() { $('#resultPanel').classList.add('hidden'); }

export function showEnd(res, onRetry, onTitle) {
  const el = $('#endScreen');
  const best = S.bestRecord();
  const cleared = res.cleared;
  const isBest = best && best.score === res.score;
  const pvp = res.mode === 'pvp';
  const head = pvp ? (cleared ? 'No.1 VICTORY' : `${res.placement}위 · 탈락`) : (cleared ? 'MISSION CLEAR' : 'GAME OVER');
  el.innerHTML = `<div class="endwin"><div class="eh ${cleared ? '' : 'lose'}">${head}</div><div class="eb">
    <div class="score">${res.score}<small style="font-size:16px;font-style:normal;color:var(--ink2)"> 점</small>${isBest ? '<span class="newbest">최고 기록!</span>' : ''}</div>
    <table><tr><td>${pvp ? '최종 순위' : '도달 라운드'}</td><td>${pvp ? `${res.placement}위 / ${res.total}명 · R${G.round}` : `${S.G.round} / ${MAX_ROUND}`}</td></tr><tr><td>전투 승리 / 패배</td><td>${G.stats.wins} / ${G.stats.losses}</td></tr><tr><td>처치한 적</td><td>${G.stats.kills}</td></tr><tr><td>★ 합성 횟수</td><td>${G.stats.merges}</td></tr><tr><td>남은 체력</td><td>${G.hp}</td></tr>${best ? `<tr><td>역대 최고 점수</td><td>${best.score}점 (${best.placement ? best.placement + '위 · ' : ''}R${best.round})</td></tr>` : ''}</table>
    <div class="erow"><button class="btn yellow" id="btnRetry"><span>다시 도전</span></button><button class="btn white" id="btnToTitle"><span>타이틀로</span></button></div></div></div>`;
  el.classList.remove('hidden');
  $('#btnRetry').onclick = () => { el.classList.add('hidden'); onRetry(); };
  $('#btnToTitle').onclick = () => { el.classList.add('hidden'); onTitle(); };
}
export function updateBest() {
  const b = S.bestRecord();
  $('#bestRec').textContent = b ? `최고 기록  ${b.score}점  ·  ${b.placement ? `${b.placement}위 · R${b.round}` : b.cleared ? '클리어' : `라운드 ${b.round}`}` : '아직 기록이 없습니다. 첫 출동을 시작해 보세요!';
}

// ---------- 모달 ----------
export function openModal(title, bodyHTML, cls = '') {
  $('#winBody').className = 'win ' + cls;
  $('#winBody').innerHTML = `<div class="wh"><span>${title}</span><button class="x" id="modalX" aria-label="닫기">✕</button></div><div class="wb">${bodyHTML}</div>`;
  $('#modal').classList.remove('hidden');
  $('#modalX').onclick = closeModal;
  hideTip();
}
export function closeModal() { $('#modal').classList.add('hidden'); }
export function modalOpen() { return !$('#modal').classList.contains('hidden'); }

export function openRecipe() {
  if (modalOpen()) { closeModal(); return; }
  let t = `<table class="rtable"><tr><th></th>${COMP_KEYS.map((k) => `<th data-tip="item|${k}"><img src="${itemURL(k, 40)}"><small>${COMPONENTS[k].name}</small></th>`).join('')}</tr>`;
  COMP_KEYS.forEach((a, i) => {
    t += `<tr><th data-tip="item|${a}"><img src="${itemURL(a, 40)}"><small>${COMPONENTS[a].name}</small></th>`;
    COMP_KEYS.forEach((b, j) => {
      if (j < i) { t += `<td class="skip"></td>`; return; }
      const r = combine(a, b);
      t += `<td class="${i === j ? 'diag' : ''}" data-tip="recipe|${a}+${b}"><img src="${itemURL(r.key, 48)}"><small style="display:block;font-size:10px;font-weight:800;color:var(--ink2)">${r.name.length > 6 ? r.name.slice(0, 6) + '…' : r.name}</small></td>`;
    });
    t += `</tr>`;
  });
  t += `</table><p style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink2);font-weight:700">칸에 마우스를 올리면 효과가 표시됩니다 · 기본 장비 2개를 겹치면 조합 장비가 됩니다 (슬롯 3개)</p>`;
  openModal('장비 조합표', t);
}

export function openHelp() {
  if (modalOpen()) { closeModal(); return; }
  openModal('게임 방법', `
    <h3>목표</h3><p>8인 PVP입니다(현재는 봇 7명). 체력 30에서 시작해 전투에서 지면 체력이 깎이고, 0이 되면 탈락합니다. 마지막까지 살아남아 <b>1위</b>를 노리세요. 좌측 <b>실시간 순위표</b>는 남은 체력 기준입니다.</p>
    <h3>진행</h3><ul><li><b>준비 단계</b>: 제한 시간(30초, 첫 라운드 45초) 안에 학생을 구매·배치합니다. <b>준비 완료</b>를 누르고 모든 플레이어가 준비하면 즉시 다음으로 넘어가며, 시간이 끝나도 자동으로 넘어갑니다.</li>
    <li><b>매칭</b>: 약 5초간 상대를 찾고 VS 화면이 표시됩니다. 상대의 편성이 공개됩니다.</li>
    <li><b>전투 단계</b>: 매칭된 상대와 1:1 자동 전투가 진행됩니다(보드가 좌우 반전되어 상대 학생이 맞은편에 섭니다). 총을 쏘고, 마나가 차면 스킬을 사용합니다.</li>
    ${PC_MODE ? '<li><b>피버타임</b>은 전투 시간이 20초를 넘으면 시작됩니다. 양쪽의 기본 공격과 스킬 피해는 1.5배, 회복과 배리어는 0.5배가 됩니다.</li>' : ''}
    <li>같은 학생 <b>3명 = ★ 합성</b> (최대 ★3). 크레딧 10당 이자 +1 (최대 5).</li></ul>
    <h3>역할</h3><ul><li><b>탱커</b>: 샷건(사거리 1칸)·기관단총 등 전열. 높은 체력/방어로 피해를 받아냅니다.</li><li><b>딜러</b>: 돌격소총·기관총·저격총으로 화력 담당.</li><li><b>서포터</b>: 회복, 배리어, 버프. 뒷줄에 배치하세요.</li></ul>
    <h3>장비 · 시너지</h3><p>보관함의 장비를 학생에게 드래그하세요. 기본 장비 2개는 자동 조합됩니다(조합표 <b>R</b>). 학원·역할 시너지는 서로 다른 학생 수로 단계가 오릅니다(<b>S</b>로 패널 접기).</p>
    <h3>단축키</h3><div class="keys"><span><kbd>Space</kbd>준비 완료/확인</span><span><kbd>D</kbd>리롤</span><span><kbd>F</kbd>경험치</span><span><kbd>L</kbd>상점 잠금</span><span><kbd>1-5</kbd>상점 구매</span><span><kbd>E</kbd>선택 판매</span><span><kbd>A</kbd>자동 배치</span>${PC_MODE ? '' : '<span><kbd>Q</kbd>배속</span>'}<span><kbd>P</kbd>일시정지</span><span><kbd>S</kbd>시너지 토글</span><span><kbd>R</kbd>조합표</span><span><kbd>H</kbd>도움말</span><span><kbd>M</kbd>음소거</span><span><kbd>Esc</kbd>닫기</span></div>
    <p class="hint" style="margin-top:8px;color:var(--ink2);font-size:12px">학생·장비·적 위에 마우스를 올리면 스킬과 능력치가 툴팁으로 표시됩니다.</p>`);
}

export function openOptions() {
  if (modalOpen()) { closeModal(); return; }
  openModal('설정', `
    <div class="optrow"><span>이펙트 품질<br><small style="color:var(--ink2);font-weight:500">저사양: 발광/파티클/탄피 최소화, 해상도 하향</small></span><div class="seg"><button class="btn ${UI.quality === 'high' ? 'active' : 'white'}" data-q="high"><span>고품질</span></button><button class="btn ${UI.quality === 'low' ? 'active' : 'white'}" data-q="low"><span>저사양</span></button></div></div>
    <div class="optrow"><span>효과음 볼륨</span><input type="range" id="volS" min="0" max="1" step="0.05" value="${UI.volS}"></div>
    <div class="optrow"><span>BGM 볼륨</span><input type="range" id="volM" min="0" max="1" step="0.05" value="${UI.volM}"></div>`);
  const body = $('#winBody');
  body.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { setQuality(b.dataset.q); closeModal(); toast(b.dataset.q === 'low' ? '저사양 모드 적용' : '고품질 모드 적용'); });
  $('#volS').oninput = (e) => { UI.volS = +e.target.value; setVolumes(UI.volS, UI.volM); };
  $('#volM').oninput = (e) => { UI.volM = +e.target.value; setVolumes(UI.volS, UI.volM); };
}
export function setQuality(q) {
  UI.quality = q;
  UI.renderer.setQuality(q);
  document.body.classList.toggle('lowfx', q === 'low');
  try { localStorage.setItem('bachess_q', q); } catch { /* ignore */ }
}

// ---------- 토글 ----------
export function toggleSyn() { UI.synCollapsed = !UI.synCollapsed; stage.classList.toggle('syn-collapsed', UI.synCollapsed); renderCtrl(); hideTip(); }
export function toggleMute() { setMuted(!isMuted()); renderCtrl(); toast(isMuted() ? '소리 끔' : '소리 켬'); }

// ---------- 선택 ----------
export function select(uid) { UI.sel = uid; renderBench(); renderRight(); if (UI.renderer) UI.renderer.selectedUid = uid; }
export function sellSelected() {
  const s = selectedUnit();
  if (!s) return;
  if (S.sell(s.loc)) UI.sel = null;
  renderAll();
}

// ---------- 드래그 & 이벤트 ----------
function slotFromPoint(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  return el;
}
function dropTargetUnit(e) {
  // 아이템을 놓을 학생 찾기 → loc
  const el = slotFromPoint(e);
  const bs = el && el.closest('[data-bslot]');
  if (bs && G.bench[+bs.dataset.bslot]) return { where: 'bench', idx: +bs.dataset.bslot };
  const bp = boardPt(e);
  if (bp.inside && UI.renderer) {
    const u = UI.renderer.unitAt(bp.screenX, bp.screenY, 0);
    if (u) { const l = S.locOfUid(u.uid); if (l) return l; }
  }
  const eqd = el && el.closest('[data-eqdrop]');
  if (eqd) { const l = S.locOfUid(+eqd.dataset.eqdrop); if (l) return l; }
  return null;
}

function startDrag(kind, src, imgSrc, e) {
  drag = { kind, src, imgSrc, sx: e.clientX, sy: e.clientY, moved: false };
}
function updateDrag(e) {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
    drag.moved = true;
    const gh = $('#ghost'); gh.innerHTML = `<img src="${drag.imgSrc}">`; gh.classList.remove('hidden');
    if (drag.kind === 'unit') $('#shopRow').classList.add('sellmode');
    hideTip();
  }
  if (!drag.moved) return;
  const p = stagePt(e);
  const gh = $('#ghost'); gh.style.left = p.x + 'px'; gh.style.top = p.y + 'px';
  // 하이라이트
  const r = UI.renderer;
  r.hlCell = null;
  document.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
  if (drag.kind === 'unit') {
    const bp = boardPt(e);
    if (bp.inside) {
      const { col, row, onFloor, own } = boardCell(bp);
      if (onFloor) r.hlCell = { col, row, ok: own && G.phase === 'prep' };
    } else {
      const bs = slotFromPoint(e)?.closest('[data-bslot]');
      if (bs) bs.classList.add('drop');
    }
  } else {
    const loc = dropTargetUnit(e);
    if (loc) {
      if (loc.where === 'bench') document.querySelector(`[data-bslot="${loc.idx}"]`)?.classList.add('drop');
      else { const u = S.getUnit(loc); r.selectedUid = u.uid; }
    } else r.selectedUid = UI.sel;
    const isl = slotFromPoint(e)?.closest('[data-inv]');
    if (isl && +isl.dataset.inv !== drag.src.idx) isl.classList.add('drop');
  }
}
function endDrag(e) {
  if (!drag) return;
  const d = drag; drag = null;
  const r = UI.renderer;
  r.hlCell = null; r.selectedUid = UI.sel;
  $('#ghost').classList.add('hidden'); $('#shopRow').classList.remove('sellmode');
  document.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
  if (!d.moved) {
    // 클릭
    if (d.kind === 'unit') { const u = S.getUnit(d.src); if (u) select(u.uid); }
    return;
  }
  if (G.phase !== 'prep' && !(S.isLive() && d.kind === 'unit')) return;
  if (d.kind === 'unit') {
    const el = slotFromPoint(e);
    const bp = boardPt(e);
    let to = null;
    if (bp.inside) {
      const { col, row, own } = boardCell(bp);
      if (own) to = { where: 'board', idx: (row - SIDE_ROWS) * COLS + col };
    } else {
      const bs = el && el.closest('[data-bslot]');
      if (bs) to = { where: 'bench', idx: +bs.dataset.bslot };
      else if (el && el.closest('#shopRow')) { const u = S.getUnit(d.src); if (u && UI.sel === u.uid) UI.sel = null; S.sell(d.src); renderAll(); return; }
    }
    if (to) { const u = S.getUnit(d.src); if (S.move(d.src, to) && u) UI.sel = u.uid; renderAll(); }
  } else {
    const el = slotFromPoint(e);
    const isl = el && el.closest('[data-inv]');
    if (isl && +isl.dataset.inv !== d.src.idx) { S.combineInv(d.src.idx, +isl.dataset.inv); renderAll(); return; }
    const loc = dropTargetUnit(e);
    if (loc) { S.equip(d.src.idx, loc); renderAll(); }
  }
}

export function initUI(renderer, hooks) {
  UI.renderer = renderer; UI.hooks = hooks;
  stage = $('#stage'); tip = $('#tip');
  const board = $('#board');

  // 툴팁 (위임)
  stage.addEventListener('mouseover', (e) => {
    if (drag && drag.moved) return;
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    const key = t.dataset.tip;
    const html = tipHTMLFor(key);
    if (!html) return;
    hoverTipKey = key;
    const p = stagePt(e);
    showTip(html, p.x, p.y);
  });
  stage.addEventListener('mousemove', (e) => {
    if (drag && drag.moved) return;
    if (!tip.classList.contains('hidden') && hoverTipKey) { const p = stagePt(e); showTip(tip.innerHTML, p.x, p.y); }
  });
  stage.addEventListener('mouseout', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t && !t.contains(e.relatedTarget)) hideTip();
  });

  // 보드 호버
  board.addEventListener('mousemove', (e) => {
    if (drag && drag.moved) return;
    const bp = boardPt(e);
    const u = renderer.unitAt(bp.screenX, bp.screenY);
    renderer.drawRange = u && G.phase === 'prep' ? u : null;
    if (u) {
      const p = stagePt(e);
      const html = !u.def.isEnemy ? unitTipHTML(u.def, u.star, u.items, u) : unitTipHTML(u.def, 1, [], u);
      hoverTipKey = 'board'; showTip(html, p.x, p.y);
    } else if (hoverTipKey === 'board') hideTip();
  });
  board.addEventListener('mouseleave', () => { renderer.drawRange = null; if (hoverTipKey === 'board') hideTip(); });

  // 클릭 & 드래그 시작
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !$('#title').classList.contains('hidden')) return;
    const t = e.target;
    const shop = t.closest('[data-shop]');
    if (shop) { if (S.canShop()) { const i = +shop.dataset.shop; S.buy(i); renderAll(); } hideTip(); return; }
    const eq = t.closest('[data-eq]');
    if (eq) { const [uid, idx] = eq.dataset.eq.split(':'); const l = S.locOfUid(+uid); if (l) { S.unequip(l, +idx); renderAll(); hideTip(); } return; }
    const prep = G.phase === 'prep';
    const live = S.isLive();
    if (!prep && !live) {
      // 결과/종료 화면: 학생 선택만 허용
      const b = t.closest('[data-bench]');
      if (b && G.bench[+b.dataset.bench]) select(G.bench[+b.dataset.bench].uid);
      return;
    }
    const b = t.closest('[data-bench]');
    // 벤치: 준비/매칭/전투 모두 선택·판매 가능 (드래그 시작)
    if (b) { const i = +b.dataset.bench; const u = G.bench[i]; if (u) startDrag('unit', { where: 'bench', idx: i }, portraitURL(S.defOf(u), 72), e); return; }
    const inv = t.closest('[data-inv]');
    if (inv) { if (prep) { const i = +inv.dataset.inv; startDrag('item', { idx: i }, itemURL(G.inv[i], 56), e); } return; }
    if (t === board) {
      const bp = boardPt(e);
      const u = renderer.unitAt(bp.screenX, bp.screenY, 0);
      if (u && !u.def.isEnemy) {
        const l = S.locOfUid(u.uid);
        // 매칭/전투 중 보드 유닛은 정보 확인만 가능 (이동·판매 불가)
        if (l) { if (prep) startDrag('unit', l, portraitURL(u.def, 72), e); else select(u.uid); }
      } else { UI.sel = null; renderBench(); renderRight(); renderer.selectedUid = null; }
    }
  });
  window.addEventListener('pointermove', updateDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('blur', () => { if (drag) { drag = null; $('#ghost').classList.add('hidden'); $('#shopRow').classList.remove('sellmode'); renderer.hlCell = null; } });

  // 버튼
  $('#btnReroll').onclick = () => { S.reroll(); renderAll(); };
  $('#btnXp').onclick = () => { S.buyXp(); renderAll(); };
  $('#btnLock').onclick = () => { S.toggleLock(); };
  $('#btnAuto').onclick = () => { S.autoArrange(); };
  $('#btnSyn').onclick = toggleSyn;
  $('#btnRecipe').onclick = openRecipe;
  $('#btnHelp').onclick = openHelp;
  $('#btnMute').onclick = toggleMute;
  $('#btnOpt').onclick = openOptions;
  const speedButton = $('#btnSpeed');
  if (PC_MODE) speedButton.remove();
  else {
    speedButton.classList.remove('hidden');
    speedButton.onclick = hooks.cycleSpeed;
  }
  $('#btnPause').onclick = () => hooks.togglePause();
  $('#btnStart').onclick = () => hooks.primary();
  stage.addEventListener('click', (e) => { if (e.target.closest('#btnSell')) { sellSelected(); hideTip(); } });
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

  S.on((type, data) => {
    if (type === 'change') renderAll();
    else if (type === 'lb') { renderLb(); renderEnemy(); }
    else if (type === 'toast') toast(data.msg, data.kind);
    else if (type === 'sfx') sfx(data);
    else if (type === 'merge') { toast(`${data.name} ${stars(data.star)} 합성 완료!`, 'good'); }
  });
}
