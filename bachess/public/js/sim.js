// 순수 전투 시뮬레이션 (DOM 의존 없음)
import {
  CW, CH, BOARD_W, BOARD_H, WEAPONS, ROLES, SKILL_MULT, STAR_MULT, ITEMS, SYNERGIES, SYNERGY_ORDER,
  baseStats, ENEMY_TYPES, waveFor, ROWS, COLS,
} from './data.js';

const rand = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- 시너지 ----------
export function calcSynergies(defs) {
  const seen = new Set();
  const counts = {};
  for (const k of SYNERGY_ORDER) counts[k] = 0;
  for (const d of defs) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    if (d.school) counts[d.school]++;
    counts[d.role]++;
  }
  const active = {};
  for (const k of SYNERGY_ORDER) {
    const s = SYNERGIES[k];
    let idx = -1;
    s.tiers.forEach((t, i) => { if (counts[k] >= t) idx = i; });
    active[k] = idx;
  }
  return { counts, active };
}

export function synergyStatsFor(def, active) {
  const t = {};
  const add = (o) => { for (const k in o) t[k] = (t[k] || 0) + o[k]; };
  for (const k of SYNERGY_ORDER) {
    const idx = active[k];
    if (idx < 0) continue;
    const s = SYNERGIES[k];
    const applies = s.teamWide || (s.kind === 'school' ? def.school === k : def.role === k);
    if (applies) add(s.effects[idx].stats);
  }
  return t;
}

export function computeUnitStats(def, star, itemKeys, bonus) {
  const b = baseStats(def, star);
  const t = { hp: 0, hpPct: 0, atkPct: 0, asPct: 0, def: 0, mana0: 0, manaGain: 0, crit: 0, critDmg: 0, steal: 0,
    shield0: 0, range: 0, pen: 0, skillAmp: 0, regen: 0, hitMana: 0 };
  const add = (o) => { for (const k in o) t[k] = (t[k] || 0) + o[k]; };
  for (const ik of itemKeys || []) { const it = ITEMS[ik]; if (it) add(it.stats); }
  if (bonus) add(bonus);
  return {
    maxHp: Math.round((b.hp * (1 + t.hpPct)) + t.hp),
    atk: b.atk * (1 + t.atkPct),
    as: b.as * (1 + t.asPct),
    def: clamp(b.def + t.def, 0, 0.75),
    range: b.range + t.range,
    manaMax: b.manaMax,
    mana0: b.mana0 + t.mana0,
    manaGain: 1 + t.manaGain,
    crit: 0.05 + t.crit,
    critDmg: 1.5 + t.critDmg,
    steal: t.steal, shield0: t.shield0, pen: t.pen,
    skillAmp: 1 + t.skillAmp, regen: t.regen, hitMana: 1 + t.hitMana,
  };
}

// ---------- 전투원 생성 ----------
let uidSeq = 1;
function makeBattler(o) {
  const s = o.stats;
  return {
    id: uidSeq++, team: o.team, def: o.def, star: o.star, name: o.def.name, role: o.def.role, weapon: o.def.weapon,
    skill: o.def.skill, isBoss: !!o.boss, scale: o.scale || 1, enemyColor: o.enemyColor,
    x: (o.col + 0.5) * CW, y: (o.row + 0.5) * CH, hx: (o.col + 0.5) * CW, hy: (o.row + 0.5) * CH,
    maxHp: s.maxHp, hp: s.maxHp, atk: s.atk, as: s.as, defense: s.def, range: s.range, manaMax: s.manaMax,
    mana: Math.min(s.mana0, s.manaMax - 1), manaGain: s.manaGain, crit: s.crit, critDmg: s.critDmg,
    steal: s.steal, pen: s.pen, skillAmp: s.skillAmp, regen: s.regen, hitMana: s.hitMana,
    shield: s.shield0 || 0, shieldT: s.shield0 ? 99 : 0, tauntT: 0, atkCd: 0.2 + rand() * 0.4, castT: 0,
    target: null, retargetT: 0, buffs: [], alive: true, deadT: 0, aim: o.team === 0 ? -Math.PI / 2 : Math.PI / 2,
    moving: false, volley: null, speed: o.boss ? 62 : (o.def.role === 'tank' ? 84 : 96),
    recoil: 0, hitFlash: 0, castFlash: 0, uid: o.uid, damageDealt: 0, items: o.items || [],
  };
}

export function buildPlayerBattlers(placed) {
  // placed: [{def, star, items, col, row(0..2), uid}]
  const syn = calcSynergies(placed.map((p) => p.def));
  return placed.map((p) => makeBattler({
    team: 0, def: p.def, star: p.star, col: p.col, row: 3 + p.row, uid: p.uid, items: p.items,
    stats: computeUnitStats(p.def, p.star, p.items, synergyStatsFor(p.def, syn.active)),
  }));
}

// PVP: 임의의 편성(placed)을 team(0|1)의 전투원으로 변환. team 1은 위쪽 절반에 좌우/상하 대칭으로 배치
export function buildTeamBattlers(placed, team) {
  const syn = calcSynergies(placed.map((p) => p.def));
  return placed.map((p, i) => makeBattler({
    team, def: p.def, star: p.star, items: p.items, uid: team === 0 ? p.uid : 100000 + i,
    col: team === 0 ? p.col : COLS - 1 - p.col, row: team === 0 ? 3 + p.row : 2 - p.row,
    stats: computeUnitStats(p.def, p.star, p.items, synergyStatsFor(p.def, syn.active)),
  }));
}
// 화면 없이 전투를 끝까지 계산 (봇 vs 봇)
export function simulateMatch(placedA, placedB) {
  const b = new Battle([...buildTeamBattlers(placedA, 0), ...buildTeamBattlers(placedB, 1)]);
  for (let i = 0; i < 4000 && !b.over; i++) { b.advance(0.1, 1); b.events.length = 0; }
  return { winner: b.winner, a: b.survivors ? b.survivors.player : 0, b: b.survivors ? b.survivors.enemy : 0 };
}
export function buildEnemyBattlers(round) {
  const wave = waveFor(round);
  return wave.map((w) => {
    const t = ENEMY_TYPES[w.type];
    const wp = WEAPONS[t.weapon];
    const m = w.mult;
    const def = { key: 'e_' + w.type, name: t.name, role: t.role, weapon: t.weapon, cost: 1, school: null, isEnemy: true,
      skill: t.skill || { name: '-', type: 'none', mana: [999, 999] } };
    const stats = {
      maxHp: Math.round(t.hp * HPK * (t.boss ? Math.min(m, 1.5) : m)), atk: t.atk * ATKK * Math.pow(m, 0.85), as: wp.as * 0.95 * (t.boss ? 0.8 : 1),
      def: ROLES[t.role].def * 0.6 + (t.boss ? 0.1 : 0), range: wp.range + (t.boss ? 1 : 0), manaMax: def.skill.mana[1], mana0: def.skill.mana[0],
      manaGain: 1, crit: 0.05, critDmg: 1.5, steal: 0, shield0: 0, pen: 0, skillAmp: 1, regen: 0, hitMana: 1,
    };
    return makeBattler({ team: 1, def, star: 1, col: w.col, row: w.row, stats, boss: t.boss, scale: t.scale, enemyColor: t.color });
  });
}

// ---------- 전투 ----------
export const HPK = +(globalThis.__HPK ?? 2.6), ATKK = +(globalThis.__ATKK ?? 1.5);
const SUDDEN_AT = 38;
const HARD_END = 75;

export class Battle {
  constructor(units) {
    this.units = units;
    this.bullets = [];
    this.events = [];
    this.time = 0;
    this.over = false;
    this.winner = null;
    this.kills = 0;
    this.acc = 0;
  }
  emit(type, data) { data.type = type; this.events.push(data); }
  alive(team) { return this.units.filter((u) => u.alive && u.team === team); }

  // 실시간 dt와 배속으로 진행
  advance(realDt, speed) {
    if (this.over) return;
    this.acc += Math.min(realDt, 0.1) * speed;
    const h = 1 / 60;
    let guard = 0;
    while (this.acc >= h && guard++ < 12) {
      this.acc -= h;
      this.step(h);
      if (this.over) break;
    }
  }

  effAs(u) { let b = 0; for (const f of u.buffs) b += f.as || 0; return u.as * (1 + b); }
  effAtk(u) { let b = 0; for (const f of u.buffs) b += f.atkp || 0; return u.atk * (1 + b); }

  step(dt) {
    this.time += dt;
    const us = this.units;
    for (const u of us) {
      if (!u.alive) { u.deadT += dt; continue; }
      // 타이머
      u.recoil = Math.max(0, u.recoil - dt * 7);
      u.hitFlash = Math.max(0, u.hitFlash - dt * 6);
      u.castFlash = Math.max(0, u.castFlash - dt * 3);
      if (u.tauntT > 0) u.tauntT -= dt;
      if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
      if (u.buffs.length) { for (const f of u.buffs) f.t -= dt; u.buffs = u.buffs.filter((f) => f.t > 0); }
      if (u.regen) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * u.regen * dt);
      if (this.time > SUDDEN_AT) this.hurtRaw(u, u.maxHp * 0.05 * dt);
      if (!u.alive) continue;
      u.atkCd -= dt;
      if (u.castT > 0) { u.castT -= dt; u.moving = false; }
      if (u.volley) this.stepVolley(u, dt);
      if (u.castT > 0) continue;
      // 타겟
      u.retargetT -= dt;
      if (!u.target || !u.target.alive || u.retargetT <= 0) { u.target = this.pickTarget(u); u.retargetT = 0.5; }
      const t = u.target;
      if (!t) { u.moving = false; continue; }
      const d = dist(u, t);
      const reach = u.range * 82 + 40 + t.scale * 8;
      u.aim = Math.atan2(t.y - u.y, t.x - u.x);
      // 스킬
      if (u.mana >= u.manaMax && u.skill.type !== 'none') {
        if (this.canCast(u, d, reach)) { this.castSkill(u); continue; }
      }
      if (d <= reach) {
        u.moving = false;
        if (u.atkCd <= 0) this.fire(u);
      } else {
        u.moving = true;
        const sp = u.speed * dt;
        u.x += ((t.x - u.x) / d) * sp;
        u.y += ((t.y - u.y) / d) * sp;
      }
    }
    this.separate();
    this.stepBullets(dt);
    // 종료 판정
    const a = this.alive(0).length, b = this.alive(1).length;
    if (a === 0 || b === 0 || this.time > HARD_END) {
      this.over = true;
      this.winner = b === 0 && a > 0 ? 0 : (a === 0 && b > 0 ? 1 : (a === 0 && b === 0 ? 1 : 1));
      this.survivors = { player: a, enemy: b };
      this.emit('end', { winner: this.winner });
    }
  }

  pickTarget(u) {
    let best = null, bd = 1e9, taunt = null, td = 1e9;
    for (const e of this.units) {
      if (!e.alive || e.team === u.team) continue;
      const d = dist(u, e);
      if (e.tauntT > 0 && d < td) { td = d; taunt = e; }
      if (d < bd) { bd = d; best = e; }
    }
    return taunt || best;
  }

  separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i]; if (!a.alive) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j]; if (!b.alive) continue;
        const min = 34 * (a.scale + b.scale) * 0.62 + 12;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < min && d > 0.001) {
          const push = (min - d) * 0.5;
          // 이동 중인 쪽이 더 많이 밀림
          const wa = a.moving ? 0.7 : 0.3, wb = b.moving ? 0.7 : 0.3, ws = wa + wb;
          dx /= d; dy /= d;
          a.x -= dx * push * (wa / ws) * 2; a.y -= dy * push * (wa / ws) * 2;
          b.x += dx * push * (wb / ws) * 2; b.y += dy * push * (wb / ws) * 2;
        } else if (d <= 0.001) { a.x += rand() - 0.5; a.y += rand() - 0.5; }
      }
      a.x = clamp(a.x, 30, BOARD_W - 30);
      a.y = clamp(a.y, 30, BOARD_H - 24);
    }
  }

  canCast(u, d, reach) {
    switch (u.skill.type) {
      case 'burst': case 'barrage': case 'blast': case 'snipe': return d <= reach + 10;
      default: return true;
    }
  }

  // ----- 기본 공격 -----
  fire(u) {
    const w = WEAPONS[u.weapon];
    const t = u.target;
    u.atkCd = 1 / this.effAs(u);
    u.recoil = 1;
    const ang = u.aim;
    const mx = u.x + Math.cos(ang) * (w.len + 6), my = u.y - 8 + Math.sin(ang) * (w.len + 6);
    const crit = rand() < u.crit;
    const total = this.effAtk(u) * (crit ? u.critDmg : 1);
    this.emit('shot', { u, ang, mx, my, weapon: u.weapon, big: false });
    const n = w.pellets;
    for (let i = 0; i < n; i++) {
      const spread = (rand() - 0.5) * 2 * w.spread;
      this.bullets.push({ x: mx, y: my, src: u, tgt: t, dmg: total / n, crit, speed: w.speed * (0.9 + rand() * 0.2), ang: ang + spread,
        weapon: u.weapon, color: w.color, basic: true, jx: (rand() - 0.5) * 22 * (n > 1 ? 1 : 0.3), jy: (rand() - 0.5) * 22 * (n > 1 ? 1 : 0.3), life: 1.2, trail: [] });
    }
    if (u.skill.type === 'none') u.mana += 0; else u.mana = Math.min(u.manaMax, u.mana + 8 * u.manaGain);
  }

  stepBullets(dt) {
    const bs = this.bullets;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.life -= dt;
      const t = b.tgt;
      let tx = b.x + Math.cos(b.ang) * 100, ty = b.y + Math.sin(b.ang) * 100;
      if (t) { tx = t.x + b.jx; ty = t.y - 10 + b.jy; }
      const dx = tx - b.x, dy = ty - b.y;
      const d = Math.hypot(dx, dy);
      const step = b.speed * dt;
      b.px = b.x; b.py = b.y;
      if (d <= step + 8 || b.life <= 0) {
        b.x = tx; b.y = ty;
        this.bulletHit(b);
        bs.splice(i, 1);
      } else {
        b.x += (dx / d) * step; b.y += (dy / d) * step;
      }
    }
  }

  bulletHit(b) {
    const src = b.src;
    if (b.aoe) {
      this.emit('explosion', { x: b.x, y: b.y, r: b.aoe, big: !!b.big });
      for (const e of this.units) {
        if (!e.alive || e.team === src.team) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) <= b.aoe + 14) this.hurt(src, e, b.dmg, { skill: true, ang: b.ang });
      }
      return;
    }
    const t = b.tgt;
    if (!t || !t.alive) {
      // 빗나간 탄: 근처 적에게 흡수
      this.emit('miss', { x: b.x, y: b.y, ang: b.ang });
      return;
    }
    this.hurt(src, t, b.dmg, { crit: b.crit, skill: !b.basic, ang: b.ang, x: b.x, y: b.y });
    if (b.basic && src.skill.type !== 'none') src.mana = Math.min(src.manaMax, src.mana + 0);
  }

  hurt(src, tgt, amount, o = {}) {
    if (!tgt.alive) return;
    const pen = src ? src.pen : 0;
    let dmg = amount * (1 - clamp(tgt.defense - pen, 0, 0.8));
    const hx = o.x ?? tgt.x, hy = o.y ?? (tgt.y - 10);
    let shielded = false;
    if (tgt.shield > 0) {
      const ab = Math.min(tgt.shield, dmg);
      tgt.shield -= ab; dmg -= ab; shielded = true;
      this.emit('barrierHit', { u: tgt, x: hx, y: hy, ang: o.ang ?? 0, broke: tgt.shield <= 0 });
      if (tgt.shield <= 0) tgt.shieldT = 0;
    }
    if (dmg > 0) {
      tgt.hp -= dmg; tgt.hitFlash = 1;
      if (src) { src.damageDealt += dmg; if (src.steal) src.hp = Math.min(src.maxHp, src.hp + dmg * src.steal); }
    }
    if (tgt.skill.type !== 'none') tgt.mana = Math.min(tgt.manaMax, tgt.mana + 4 * tgt.hitMana);
    this.emit('hit', { u: tgt, x: hx, y: hy, dmg, crit: !!o.crit, shielded, skill: !!o.skill, ang: o.ang ?? 0 });
    if (tgt.hp <= 0) this.kill(tgt, src);
  }

  hurtRaw(u, amount) {
    u.hp -= amount;
    if (u.hp <= 0) this.kill(u, null);
  }

  kill(u, src) {
    if (!u.alive) return;
    u.alive = false; u.hp = 0; u.deadT = 0; u.shield = 0;
    if (u.team === 1) this.kills++;
    this.emit('death', { u, src });
  }

  // ----- 스킬 -----
  castSkill(u) {
    const sk = u.skill;
    const p = SKILL_MULT[Math.min(2, u.star - 1)] * u.skillAmp;
    u.mana = 0; u.castT = 0.38; u.castFlash = 1; u.atkCd = Math.max(u.atkCd, 0.3);
    this.emit('cast', { u, name: sk.name });
    const atk = this.effAtk(u);
    const t = u.target;
    switch (sk.type) {
      case 'burst': {
        const w = WEAPONS[u.weapon];
        const mx = u.x + Math.cos(u.aim) * 30, my = u.y - 8 + Math.sin(u.aim) * 30;
        this.emit('shot', { u, ang: u.aim, mx, my, weapon: u.weapon, big: true });
        u.recoil = 1.4;
        this.bullets.push({ x: mx, y: my, src: u, tgt: t, dmg: atk * sk.mult * p * (1 + (u.crit > 0.3 ? 0.15 : 0)), crit: true, speed: 1800, ang: u.aim, weapon: u.weapon,
          color: '#fff6a0', basic: false, big: true, jx: 0, jy: 0, life: 1.2, trail: [] });
        break;
      }
      case 'barrage':
        u.volley = { left: sk.shots, t: 0, interval: sk.shots > 16 ? 0.06 : 0.09, mult: sk.mult * p };
        u.castT = sk.shots * (sk.shots > 16 ? 0.06 : 0.09) + 0.25;
        break;
      case 'blast': {
        const mx = u.x + Math.cos(u.aim) * 30, my = u.y - 8 + Math.sin(u.aim) * 30;
        this.emit('shot', { u, ang: u.aim, mx, my, weapon: u.weapon, big: true });
        u.recoil = 1.5;
        this.bullets.push({ x: mx, y: my, src: u, tgt: t, dmg: atk * sk.mult * p, speed: 900, ang: u.aim, weapon: u.weapon, color: '#ffb347', basic: false,
          aoe: sk.r * 82 + 20, big: true, jx: 0, jy: 0, life: 1.5, trail: [] });
        if (sk.selfPct) this.addShield(u, u.maxHp * sk.selfPct * p, 5);
        if (sk.taunt) u.tauntT = sk.taunt;
        break;
      }
      case 'snipe': {
        const ang = u.aim, len = 1500;
        const x1 = u.x + Math.cos(ang) * 24, y1 = u.y - 8 + Math.sin(ang) * 24;
        const x2 = x1 + Math.cos(ang) * len, y2 = y1 + Math.sin(ang) * len;
        this.emit('shot', { u, ang, mx: x1, my: y1, weapon: u.weapon, big: true });
        this.emit('snipe', { x1, y1, x2, y2, w: sk.w * CW, u });
        u.recoil = 1.8;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const dmg = atk * sk.mult * p;
        for (const e of this.units) {
          if (!e.alive || e.team === u.team) continue;
          const rx = e.x - x1, ry = e.y - y1;
          const along = rx * dx + ry * dy;
          if (along < 0) continue;
          const perp = Math.abs(rx * dy - ry * dx);
          if (perp <= sk.w * CW * 0.5 + 22 * e.scale) this.hurt(u, e, dmg, { skill: true, ang });
        }
        break;
      }
      case 'barrier': {
        const amt = u.maxHp * sk.pct * p + (sk.flat || 0) * p;
        const rr = (sk.r || 0) * 82 + 30;
        for (const a of this.units) {
          if (!a.alive || a.team !== u.team) continue;
          if (a === u || (sk.r > 0 && Math.hypot(a.x - u.x, a.y - u.y) <= rr)) this.addShield(a, a === u ? amt : amt * 0.9, sk.dur);
        }
        if (sk.taunt) u.tauntT = sk.taunt;
        break;
      }
      case 'heal': {
        const allies = this.units.filter((a) => a.alive && a.team === u.team).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        const list = sk.count ? allies.slice(0, sk.count) : allies;
        for (const a of list) {
          const amt = sk.pct ? a.maxHp * sk.pct * p : (sk.amt + atk * sk.atkMult) * p;
          const real = Math.min(a.maxHp - a.hp, amt);
          a.hp += real;
          this.emit('heal', { u: a, amt: Math.round(amt), from: u });
          if (sk.shield) this.addShield(a, a.maxHp * sk.shield * p, 5);
        }
        break;
      }
      case 'buff': {
        const rr = (sk.r || 0) * 82 + 30;
        for (const a of this.units) {
          if (!a.alive || a.team !== u.team) continue;
          const ok = sk.scope === 'self' ? a === u : sk.scope === 'team' ? true : Math.hypot(a.x - u.x, a.y - u.y) <= rr;
          if (!ok) continue;
          a.buffs.push({ as: (sk.as || 0) * Math.min(SKILL_MULT[Math.min(2, u.star - 1)], 1.6), atkp: (sk.atkp || 0) * p, t: sk.dur });
          this.emit('buff', { u: a });
        }
        break;
      }
    }
  }

  addShield(u, amt, dur) {
    u.shield = (u.shield > 0 ? Math.max(u.shield, amt) : amt);
    u.shieldT = Math.max(u.shieldT, dur);
    this.emit('shieldOn', { u });
  }

  stepVolley(u, dt) {
    const v = u.volley;
    v.t -= dt;
    while (v.t <= 0 && v.left > 0) {
      v.t += v.interval; v.left--;
      // 사거리 내 랜덤 적 선택
      const reach = u.range * 82 + 60;
      const cands = this.units.filter((e) => e.alive && e.team !== u.team && dist(u, e) <= reach);
      const tg = cands.length ? cands[(rand() * cands.length) | 0] : u.target;
      if (!tg || !tg.alive) { v.left = 0; break; }
      const ang = Math.atan2(tg.y - u.y, tg.x - u.x);
      u.aim = ang; u.recoil = 1;
      const w = WEAPONS[u.weapon];
      const mx = u.x + Math.cos(ang) * (w.len + 6), my = u.y - 8 + Math.sin(ang) * (w.len + 6);
      this.emit('shot', { u, ang, mx, my, weapon: u.weapon, big: false, volley: true });
      this.bullets.push({ x: mx, y: my, src: u, tgt: tg, dmg: this.effAtk(u) * v.mult, crit: false, speed: w.speed, ang: ang + (rand() - 0.5) * 0.1,
        weapon: u.weapon, color: w.color, basic: false, jx: (rand() - 0.5) * 20, jy: (rand() - 0.5) * 20, life: 1.2, trail: [] });
    }
    if (v.left <= 0) u.volley = null;
  }
}

// 전투 결과 요약
export function summarize(b) {
  return { win: b.winner === 0, survivors: b.survivors, kills: b.kills, time: b.time };
}
