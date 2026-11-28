// 보드 렌더링 + 전투 이펙트 (총구 화염, 탄도, 반동, 피격, 배리어)
import { COLS, ROWS, SIDE_ROWS, CW, CH, BOARD_W, BOARD_H, WEAPONS, SCHOOLS, PC_MODE } from './data.js';
import { getSprite, getEnemySprite, getImportedSprite, facesAway, getPixelWeapon, drawWeapon, spriteFootRatio } from './sprites.js';
import { sfx } from './audio.js';
import { project, unproject, traceFloor, traceCell, traceGroundCircle, paintPerspectiveFloor } from './battlefield-view.js';

const TAU = Math.PI * 2;
const rnd = Math.random;
const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const UNIT_SIZE = 64;
const UNIT_TILE_RATIO = 0.80;
const UNIT_TOP_RATIO = 0.66;
const UNIT_FOOT_RATIO = 0.33;

function bodyPose(u, time, sprite) {
  const recoil = u.recoil || 0;
  const dx = Math.cos(u.aim), dy = Math.sin(u.aim);
  const bob = u.alive
    ? (u.moving ? -4 * Math.abs(Math.sin(time * 13 + u.id)) : PC_MODE ? 0 : 1.2 * Math.sin(time * 2.6 + u.id))
    : 0;
  const offsetY = PC_MODE
    ? (UNIT_TOP_RATIO + UNIT_FOOT_RATIO - spriteFootRatio(sprite)) * UNIT_SIZE * u.scale
    : -dy * recoil * 2.2;
  return {
    x: u.x - dx * recoil * 3.2,
    y: u.y + bob + offsetY,
    tilt: -dx * recoil * 0.05,
  };
}

function unitSprite(u, imported) {
  return imported ?? (u.def.isEnemy ? getEnemySprite(u.def, u.enemyColor) : getSprite(u.def));
}

function pixelWeaponPose(u, aim) {
  const dx = Math.cos(aim), dy = Math.sin(aim);
  const flip = dx < -Math.abs(dy) * 0.35;
  const side = 12 * Math.abs(dy) * (flip ? -1 : 1);
  // 전장 깊이 방향으로 향할수록 총열이 짧게 보인다.
  const depth = dy * 0.64;
  const reach = WEAPONS[u.weapon].len + 6 - (u.recoil || 0) * 4;
  return {
    x: (dx * reach - dy * side) * u.scale,
    y: (-8 + depth * reach + dx * side) * u.scale,
    angle: Math.atan2(depth, dx),
    lengthScale: Math.hypot(dx, depth),
    flip,
  };
}

function drawPixelWeapon(ctx, u, image) {
  const pose = pixelWeaponPose(u, u.aim);
  const pixel = 1.35 * u.scale;
  const width = (image.naturalWidth ?? image.width) * pixel * pose.lengthScale;
  const height = (image.naturalHeight ?? image.height) * pixel;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  if (pose.flip) ctx.scale(1, -1);
  // 총구는 6번째 도트 행의 오른쪽 끝에 있다.
  ctx.drawImage(image, -width, -5.5 * pixel, width, height);
  ctx.restore();
}

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

const synergyOutlines = new WeakMap();
function synergyOutline(sprite) {
  const cached = synergyOutlines.get(sprite);
  if (cached) return cached;
  const radius = Math.ceil(sprite.width * 0.055);
  const padding = radius * 3;
  const mask = mkCanvas(sprite.width + 2 * padding, sprite.height + 2 * padding);
  const ctx = mask.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const angle = i * TAU / 8;
    ctx.drawImage(sprite, padding + Math.round(radius * Math.cos(angle)), padding + Math.round(radius * Math.sin(angle)));
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#fff3a6';
  ctx.fillRect(0, 0, mask.width, mask.height);

  // 방향별 그림에 발광을 한 번 구워두고, 전장에서는 캐시된 결과를 그린다.
  const image = mkCanvas(mask.width, mask.height);
  const light = image.getContext('2d');
  light.save();
  light.shadowColor = 'rgba(233, 167, 40, .86)';
  light.shadowBlur = radius * 1.25;
  light.drawImage(mask, 0, 0);
  light.restore();
  light.globalCompositeOperation = 'destination-out';
  light.drawImage(sprite, padding, padding);
  const outline = { image, scalePadding: padding / sprite.width };
  synergyOutlines.set(sprite, outline);
  return outline;
}

const glowCache = new Map();
function glow(color) {
  let g = glowCache.get(color);
  if (g) return g;
  g = mkCanvas(64, 64);
  const x = g.getContext('2d');
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.25, color); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  glowCache.set(color, g);
  return g;
}

function buildFloor() {
  const c = mkCanvas(BOARD_W, BOARD_H);
  const x = c.getContext('2d');
  if (PC_MODE) {
    paintPerspectiveFloor(x);
    return c;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const enemy = r < SIDE_ROWS;
      const alt = (r + col) % 2 === 0;
      x.fillStyle = enemy ? (alt ? '#f6e9ee' : '#eddde4') : (alt ? '#f5fbff' : '#e3f0fb');
      traceCell(x, col, r); x.fill();
      x.strokeStyle = enemy ? 'rgba(200,120,140,.25)' : 'rgba(80,160,220,.28)'; x.lineWidth = 1.5; x.stroke();
    }
  }
  // 중앙선
  const y = SIDE_ROWS * CH;
  x.save();
  x.strokeStyle = 'rgba(255,196,40,.9)'; x.lineWidth = 3; x.setLineDash([14, 10]);
  x.beginPath(); x.moveTo(6, y); x.lineTo(BOARD_W - 6, y); x.stroke();
  x.restore();
  // 육각 장식
  x.globalAlpha = 0.08; x.strokeStyle = '#2a7bd0'; x.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const cx = (80 + i * 130) * BOARD_W / (9 * CW), cy = y + 2;
    x.beginPath(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.5; const px = cx + Math.cos(a) * 26, py = cy + Math.sin(a) * 26; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.stroke();
  }
  return c;
}

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.floor = buildFloor();
    // 전투 좌표를 기존 화면 영역에 맞추되, 유닛 그림의 비율은 유지한다.
    this.unitAspectX = PC_MODE && canvas.clientWidth > 0
      ? (canvas.clientHeight / BOARD_H) / (canvas.clientWidth / BOARD_W)
      : 1;
    this.quality = 'high';
    this.parts = [];
    this.nums = [];
    this.rings = [];
    this.beams = [];
    this.texts = [];
    this.shake = 0;
    this.units = [];
    this.battle = null;
    this.hover = null;       // hover unit
    this.hlCell = null;      // {col,row,ok}
    this.selectedUid = null;
    this.synergyHighlights = null;
    this.drawRange = null;
    this.pixelsPerY = 1;
    this.pixelsPerX = 1;
    this.resX = 1;
    this.resY = 1;
    this.t = 0;
    this.lastShotSfx = 0;
    this.lastHitSfx = 0;
    this.speed = 1;
  }

  setQuality(q) { this.quality = q; this.applyRes(); }
  applyRes() {
    const dpr = window.devicePixelRatio || 1;
    const s = this.stageScale || 1;
    if (PC_MODE && this.quality === 'high') {
      const density = Math.min(2, dpr);
      this.canvas.width = Math.max(1, Math.round(BOARD_W * this.pixelsPerX * density));
      this.canvas.height = Math.max(1, Math.round(BOARD_H * this.pixelsPerY * density));
      this.resX = this.canvas.width / BOARD_W;
      this.resY = this.canvas.height / BOARD_H;
      return;
    }
    const res = this.quality === 'high' ? Math.min(2, Math.max(1, s * dpr)) : Math.min(1, Math.max(0.75, s));
    this.resX = res;
    this.resY = res;
    this.canvas.width = Math.round(BOARD_W * res);
    this.canvas.height = Math.round(BOARD_H * res);
  }
  setStageScale(s) {
    this.stageScale = s;
    if (PC_MODE && s > 0 && this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) {
      this.pixelsPerX = this.canvas.clientWidth * s / BOARD_W;
      this.pixelsPerY = this.canvas.clientHeight * s / BOARD_H;
    }
    this.applyRes();
  }
  get cap() { return this.quality === 'high' ? 420 : 110; }

  setUnits(units) { this.units = units; }
  startBattle(b) { this.battle = b; this.units = b.units; this.parts.length = 0; this.nums.length = 0; this.rings.length = 0; this.beams.length = 0; this.texts.length = 0; }
  endBattle() { this.battle = null; }

  unitView(u) {
    if (!PC_MODE) return { x: u.x, y: u.y, zoom: 1, foot: 0 };
    const base = project(u.x, u.y);
    const tileWidth = project(u.x + CW, u.y).x - base.x;
    const zoom = tileWidth * UNIT_TILE_RATIO / (UNIT_SIZE * this.unitAspectX);
    return { ...base, zoom, foot: UNIT_SIZE * u.scale * UNIT_FOOT_RATIO };
  }

  transformUnit(ctx, u) {
    const view = this.unitView(u);
    ctx.translate(view.x, view.y);
    ctx.scale(this.unitAspectX * view.zoom, view.zoom);
    ctx.translate(-u.x, -u.y - view.foot);
  }

  unitAt(px, py, team) {
    const cell = PC_MODE && !this.battle ? unproject(px, py) : null;
    let best = null, bd = 1e9;
    for (const u of this.units) {
      if (!u.alive) continue;
      if (team !== undefined && u.team !== team) continue;
      // 준비 단계에서 그림이 겹치면 포인터가 가리키는 배치 칸의 학생을 먼저 찾는다.
      if (cell && Math.floor(u.x / CW) === Math.floor(cell.x / CW)
        && Math.floor(u.y / CH) === Math.floor(cell.y / CH)) return u;
      const view = this.unitView(u);
      const r = 32 * u.scale * view.zoom;
      const bodyY = view.y - (view.foot + 8 * u.scale) * view.zoom;
      const d = Math.hypot((view.x - px) / this.unitAspectX, bodyY - py);
      const nearer = PC_MODE && best && u.y !== best.y ? u.y > best.y : d < bd;
      if (d < r && nearer) { bd = d; best = u; }
    }
    return best;
  }

  // ---------- 이벤트 → 이펙트 ----------
  handle(ev) {
    const hi = this.quality === 'high';
    switch (ev.type) {
      case 'shot': {
        const w = WEAPONS[ev.weapon];
        const big = ev.big;
        const u = ev.u;
        let x = ev.mx, y = ev.my;
        if (PC_MODE) {
          const view = this.unitView(u);
          const imported = getImportedSprite(u.def, ev.ang);
          const pose = bodyPose(u, this.t, unitSprite(u, imported));
          let offsetX = ev.mx - u.x;
          let offsetY = ev.my - u.y + (pose.y - u.y);
          if (imported && getPixelWeapon(ev.weapon)) {
            const muzzle = pixelWeaponPose(u, ev.ang);
            const c = Math.cos(pose.tilt), s = Math.sin(pose.tilt);
            offsetX = pose.x - u.x + c * muzzle.x - s * muzzle.y;
            offsetY = pose.y - u.y + s * muzzle.x + c * muzzle.y;
          }
          const drawn = unproject(view.x + offsetX * view.zoom * this.unitAspectX, view.y + (offsetY - view.foot) * view.zoom);
          x = drawn.x; y = drawn.y;
        }
        this.addPart({ t: 'flash', x, y, ang: ev.ang, life: big ? 0.14 : 0.07, max: big ? 0.14 : 0.07, size: (big ? 1.9 : 1) * (ev.weapon === 'SG' ? 1.5 : ev.weapon === 'SR' ? 1.4 : 1), color: w.color, wp: ev.weapon });
        if (hi || big) {
          // 탄피
          if (ev.weapon !== 'SG' || rnd() < 0.5) {
            const side = ev.ang + Math.PI / 2 + (rnd() - 0.5) * 0.8;
            this.addPart({ t: 'casing', x: ev.u.x, y: ev.u.y - 10, vx: Math.cos(side) * (60 + rnd() * 50), vy: Math.sin(side) * (60 + rnd() * 50) - 70, life: 0.5, max: 0.5, rot: rnd() * 6, vr: 20 * (rnd() - 0.5) });
          }
        }
        if (hi) this.addPart({ t: 'smoke', x, y, vx: Math.cos(ev.ang) * 18, vy: Math.sin(ev.ang) * 18 - 10, life: 0.45, max: 0.45, size: 6 });
        if (ev.weapon === 'SR' || big) this.shake = Math.max(this.shake, big ? 5 : 2);
        if (this.t - this.lastShotSfx > 0.045 || big) { sfx(big ? 'big' : ev.weapon === 'SR' ? 'sr' : ev.weapon === 'SG' ? 'sg' : 'shot'); this.lastShotSfx = this.t; }
        break;
      }
      case 'hit': {
        const u = ev.u;
        const n = this.quality === 'high' ? (ev.crit ? 8 : 4) : (ev.crit ? 4 : 2);
        const base = ev.ang + Math.PI;
        for (let i = 0; i < n; i++) {
          const a = base + (rnd() - 0.5) * 2.2;
          const sp = 90 + rnd() * 160;
          this.addPart({ t: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.28, max: 0.28, color: ev.crit ? '#ffe45a' : '#fff4c8', len: 0.05 });
        }
        if (ev.skill || ev.crit) this.rings.push({ x: ev.x, y: ev.y, r: 6, vr: 150, life: 0.22, max: 0.22, color: ev.crit ? '#ffe45a' : '#ffffff', w: 3 });
        if (ev.dmg >= 1) this.addNum(u.x + (rnd() - 0.5) * 16, u.y - 36 * u.scale, Math.round(ev.dmg), u.team === 0 ? '#ff6a6a' : '#ffffff', ev.crit, ev.skill);
        if (this.t - this.lastHitSfx > 0.05) { sfx(ev.crit ? 'crit' : 'hit'); this.lastHitSfx = this.t; }
        break;
      }
      case 'barrierHit': {
        const u = ev.u;
        const a = Math.atan2(ev.y - u.y, ev.x - u.x);
        this.beams.push({ t: 'barrier', u, a, life: 0.3, max: 0.3 });
        for (let i = 0; i < (this.quality === 'high' ? 5 : 2); i++) {
          const aa = a + (rnd() - 0.5) * 1.2;
          this.addPart({ t: 'spark', x: u.x + Math.cos(a) * 28, y: u.y - 8 + Math.sin(a) * 28, vx: Math.cos(aa) * 130, vy: Math.sin(aa) * 130, life: 0.3, max: 0.3, color: '#7fe6ff', len: 0.05 });
        }
        if (rnd() < 0.5) this.addText(u.x, u.y - 46 * u.scale, '방어!', '#6fe3ff', 12, 0.5);
        if (ev.broke) { this.rings.push({ x: u.x, y: u.y - 8, r: 20, vr: 160, life: 0.3, max: 0.3, color: '#7fe6ff', w: 4 }); sfx('break'); }
        else sfx('barrier');
        break;
      }
      case 'miss':
        this.addPart({ t: 'spark', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 0.1, max: 0.1, color: '#fff', len: 0.02 });
        break;
      case 'explosion': {
        const hi2 = this.quality === 'high';
        this.rings.push({ x: ev.x, y: ev.y, r: 8, vr: ev.r * 4.2, life: 0.3, max: 0.3, color: '#ffd27a', w: 6 });
        this.rings.push({ x: ev.x, y: ev.y, r: 4, vr: ev.r * 2.6, life: 0.4, max: 0.4, color: '#ff8a40', w: 3 });
        this.addPart({ t: 'fire', x: ev.x, y: ev.y, life: 0.4, max: 0.4, size: ev.r });
        const n = hi2 ? 14 : 5;
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, sp = 100 + rnd() * 260;
          this.addPart({ t: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, color: i % 2 ? '#ffb347' : '#fff2c0', len: 0.06 });
        }
        this.shake = Math.max(this.shake, 8);
        sfx('boom');
        break;
      }
      case 'death': {
        const u = ev.u;
        this.rings.push({ x: u.x, y: u.y - 8, r: 10, vr: 120, life: 0.35, max: 0.35, color: u.team === 0 ? '#9ad8ff' : '#ffffff', w: 4 });
        const n = this.quality === 'high' ? 12 : 5;
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, sp = 60 + rnd() * 140;
          this.addPart({ t: 'dot', x: u.x, y: u.y - 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.6, max: 0.6, size: 3 + rnd() * 3, color: u.team === 0 ? '#bfe6ff' : '#ffe9a0' });
        }
        sfx('down');
        break;
      }
      case 'cast': {
        const u = ev.u;
        this.beams.push({ t: 'cast', u, life: 0.5, max: 0.5 });
        this.addText(u.x, u.y - 60 * u.scale, ev.name, u.team === 0 ? '#ffffff' : '#ffb0b0', 13, 1.0, true);
        sfx('skill');
        break;
      }
      case 'heal': {
        const u = ev.u;
        for (let i = 0; i < 5; i++) this.addPart({ t: 'plus', x: u.x + (rnd() - 0.5) * 36, y: u.y + (rnd() - 0.2) * 20, vx: 0, vy: -40 - rnd() * 30, life: 0.8, max: 0.8, size: 5 + rnd() * 3 });
        if (ev.amt > 0) this.addNum(u.x, u.y - 40 * u.scale, '+' + ev.amt, '#6dffa8', false, true);
        sfx('heal');
        break;
      }
      case 'shieldOn': {
        const u = ev.u;
        this.rings.push({ x: u.x, y: u.y - 8, r: 14, vr: 90, life: 0.4, max: 0.4, color: '#7fe6ff', w: 4 });
        sfx('barrier');
        break;
      }
      case 'buff': {
        const u = ev.u;
        for (let i = 0; i < 4; i++) this.addPart({ t: 'arrow', x: u.x + (rnd() - 0.5) * 34, y: u.y + 10 + rnd() * 10, vx: 0, vy: -60, life: 0.7, max: 0.7, size: 6 });
        break;
      }
      case 'snipe':
        this.beams.push({ t: 'snipe', x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, w: ev.w, life: 0.35, max: 0.35 });
        this.shake = Math.max(this.shake, 9);
        break;
    }
  }

  addPart(p) { if (this.parts.length < this.cap) this.parts.push(p); }
  addNum(x, y, txt, color, crit, skill) {
    const cap = this.quality === 'high' ? 40 : 18;
    if (this.nums.length >= cap) this.nums.shift();
    this.nums.push({ x, y, txt, color, crit, skill, life: crit ? 0.9 : 0.7, max: crit ? 0.9 : 0.7 });
  }
  addText(x, y, txt, color, size, life, skillName) {
    if (this.texts.length > 14) this.texts.shift();
    this.texts.push({ x, y, txt, color, size, life, max: life, skillName });
  }

  // ---------- 업데이트 ----------
  update(dt) {
    this.t += dt;
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      if (p.vx !== undefined) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.t === 'casing') { p.vy += 380 * dt; p.rot += p.vr * dt; }
        else if (p.t === 'spark') { p.vx *= 0.94; p.vy *= 0.94; }
        else if (p.t === 'dot') p.vy += 220 * dt;
      }
    }
    for (let i = this.nums.length - 1; i >= 0; i--) { const n = this.nums[i]; n.life -= dt; n.y -= 36 * dt; if (n.life <= 0) this.nums.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const n = this.texts[i]; n.life -= dt; n.y -= 14 * dt; if (n.life <= 0) this.texts.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt; r.r += r.vr * dt; if (r.life <= 0) this.rings.splice(i, 1); }
    for (let i = this.beams.length - 1; i >= 0; i--) { const b = this.beams[i]; b.life -= dt; if (b.life <= 0) this.beams.splice(i, 1); }
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  // ---------- 그리기 ----------
  draw(realDt) {
    const ctx = this.ctx;
    ctx.setTransform(this.resX, 0, 0, this.resY, 0, 0);
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    let sx = 0, sy = 0;
    if (this.shake > 0 && !reducedMotion.matches) { sx = (rnd() - 0.5) * this.shake; sy = (rnd() - 0.5) * this.shake; }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.drawImage(this.floor, 0, 0);
    // 셀 하이라이트
    if (this.hlCell) {
      const h = this.hlCell;
      ctx.fillStyle = h.ok ? 'rgba(60,190,255,.38)' : 'rgba(255,90,90,.32)';
      traceCell(ctx, h.col, h.row); ctx.fill();
      ctx.strokeStyle = h.ok ? '#27a8f0' : '#f05a5a'; ctx.lineWidth = 3; ctx.stroke();
    }
    // 사거리 표시
    if (this.drawRange) {
      const u = this.drawRange;
      const r = u.range * 82 + 40;
      ctx.save();
      if (PC_MODE) { traceFloor(ctx); ctx.clip(); }
      ctx.strokeStyle = 'rgba(30,140,230,.65)'; ctx.fillStyle = 'rgba(60,170,255,.1)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      traceGroundCircle(ctx, u.x, u.y, r); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // 유닛
    const list = this.units.slice().sort((a, b) => a.y - b.y);
    for (const u of list) this.drawUnit(ctx, u);
    // 탄환
    if (this.battle) this.drawBullets(ctx);
    this.drawBeams(ctx);
    this.drawParts(ctx);
    this.drawRings(ctx);
    // 체력 바 (유닛 위에 항상 보이도록 마지막)
    for (const u of list) if (u.alive) this.drawBars(ctx, u);
    this.drawNums(ctx);
    ctx.restore();
  }

  drawUnit(ctx, u) {
    let alpha = 1;
    if (!u.alive) { alpha = 1 - u.deadT / 0.45; if (alpha <= 0) return; }
    const s = u.scale;
    const size = UNIT_SIZE * s;
    const t = this.t;
    const rec = u.recoil || 0;
    const imported = getImportedSprite(u.def, u.aim);
    const sprite = unitSprite(u, imported);
    const { x: cx, y: cy, tilt } = bodyPose(u, t, sprite);
    const ground = u.y + size * UNIT_FOOT_RATIO;
    const spriteTop = -size * UNIT_TOP_RATIO;
    const pixelWeapon = imported && u.alive ? getPixelWeapon(u.weapon) : null;
    const weaponBehind = facesAway(u.aim);
    ctx.save();
    this.transformUnit(ctx, u);
    ctx.save();
    ctx.globalAlpha = alpha;
    // 그림자
    if (PC_MODE) {
      ctx.fillStyle = 'rgba(32,60,88,.15)';
      ctx.beginPath(); ctx.ellipse(u.x, ground, size * 0.34, size * 0.12, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(30,60,100,.22)';
    ctx.beginPath(); ctx.ellipse(u.x, ground, size * (PC_MODE ? 0.23 : 0.32), size * (PC_MODE ? 0.065 : 0.1), 0, 0, TAU); ctx.fill();
    // 스킬 시전 오라
    if (u.castFlash > 0 && this.quality === 'high') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * u.castFlash * 0.7;
      const g = glow(u.team === 0 ? '#5ad0ff' : '#ff6a6a');
      ctx.drawImage(g, u.x - size * 0.8, u.y - size * 0.9, size * 1.6, size * 1.6);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    }
    // 반동으로 몸 기울기
    ctx.translate(cx, cy);
    if (rec > 0) ctx.rotate(tilt);
    if (!u.alive) { const k = 1 - u.deadT / 0.45; ctx.scale(1 + (1 - k) * 0.15, k * 0.5 + 0.5); }
    if (PC_MODE && imported) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    if (PC_MODE && u.alive && u.team === 0 && this.synergyHighlights?.has(u.def.key)) {
      const { image, scalePadding } = synergyOutline(sprite);
      const margin = size * scalePadding;
      ctx.drawImage(image, -size / 2 - margin, spriteTop - margin, size + 2 * margin, size + 2 * margin);
    }
    if (pixelWeapon && weaponBehind) drawPixelWeapon(ctx, u, pixelWeapon);
    ctx.drawImage(sprite, -size / 2, spriteTop, size, size);
    if (u.hitFlash > 0.05) {
      ctx.globalAlpha = alpha * u.hitFlash * 0.55;
      if (this.quality === 'high') ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sprite, -size / 2, spriteTop, size, size);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    }
    if (pixelWeapon && !weaponBehind) drawPixelWeapon(ctx, u, pixelWeapon);
    if (u.alive && !imported) {
      ctx.save();
      ctx.translate(0, -size * 0.12);
      ctx.rotate(u.aim);
      if (Math.cos(u.aim) < 0) ctx.scale(1, -1);
      ctx.translate(size * 0.12 - rec * 5, 0);
      const ws = size / UNIT_SIZE;
      ctx.scale(ws, ws);
      drawWeapon(ctx, u.weapon);
      ctx.restore();
    }
    ctx.restore();
    // 헤일로
    if (!u.def.isEnemy && u.alive && !imported) {
      const hy = cy + spriteTop - 1;
      ctx.save();
      ctx.translate(cx, hy);
      ctx.strokeStyle = u.def.halo || '#ffe56b';
      ctx.lineWidth = 3;
      if (this.quality === 'high') { ctx.globalAlpha = 0.35; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 0, 15, 5.5, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 2.6; }
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 5.5, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (u.def.isEnemy && u.alive && u.isBoss) {
      // 보스 경고 표시
      ctx.fillStyle = '#ff4a4a'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('BOSS', u.x, u.y - size * 0.72);
    }
    // 배리어
    if (u.alive && u.shield > 0) {
      const r = 33 * s;
      const pulse = 0.5 + Math.sin(t * 5 + u.id) * 0.12;
      ctx.save();
      ctx.translate(u.x, u.y - 8 * s);
      ctx.fillStyle = `rgba(90,210,255,${0.14 + pulse * 0.1})`;
      ctx.strokeStyle = `rgba(140,235,255,${0.7 + pulse * 0.2})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
      // 육각 패턴
      ctx.strokeStyle = 'rgba(200,250,255,.5)'; ctx.lineWidth = 1.2;
      ctx.rotate(t * 0.8);
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6; const px = Math.cos(a) * r * 0.62, py = Math.sin(a) * r * 0.62; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    // 도발 표시
    if (u.alive && u.tauntT > 0) {
      ctx.fillStyle = '#ff5a5a'; ctx.font = '900 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', u.x + 26 * s, u.y - 30 * s + Math.sin(t * 10) * 2);
    }
    // 선택 링
    if (this.selectedUid && u.uid === this.selectedUid) {
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(u.x, PC_MODE ? ground : u.y + size * 0.3, size * 0.45, size * 0.15, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  drawBars(ctx, u) {
    const s = Math.min(u.scale, 1.5);
    const w = 52 * s, h = 7;
    const x = u.x - w / 2;
    const y = u.y + 25 * u.scale + (u.scale > 1 ? 8 : 0);
    // 별
    ctx.save();
    this.transformUnit(ctx, u);
    ctx.fillStyle = '#122a52';
    ctx.beginPath(); ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3 + 4, 3); ctx.fill();
    const hp = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = u.team === 0 ? '#41d99a' : '#ff6a6a';
    ctx.fillRect(x, y, w * hp, h);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, y, w * hp, 2);
    if (u.shield > 0) {
      const sw = Math.min(1, u.shield / u.maxHp);
      ctx.fillStyle = '#9cefff'; ctx.fillRect(x, y, w * sw, 3);
    }
    // 마나
    if (u.skill.type !== 'none') {
      ctx.fillStyle = '#0d1e3c'; ctx.fillRect(x, y + h + 1, w, 3);
      ctx.fillStyle = '#35b6ff'; ctx.fillRect(x, y + h + 1, w * Math.min(1, u.mana / u.manaMax), 3);
    }
    if (!u.def.isEnemy && u.star > 1) {
      ctx.fillStyle = '#ffd23a'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'left';
      ctx.strokeStyle = '#122a52'; ctx.lineWidth = 3;
      const txt = '★'.repeat(u.star);
      ctx.strokeText(txt, x - 1, y - 4); ctx.fillText(txt, x - 1, y - 4);
    }
    ctx.restore();
  }

  drawBullets(ctx) {
    const hi = this.quality === 'high';
    ctx.save();
    if (hi) ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.battle.bullets) {
      let dx = b.x - (b.px ?? b.x), dy = b.y - (b.py ?? b.y);
      let d = Math.hypot(dx, dy);
      if (d < 0.01) { dx = Math.cos(b.ang); dy = Math.sin(b.ang); d = 1; }
      const ux = dx / d, uy = dy / d;
      const len = b.big ? 60 : (b.weapon === 'SR' ? 54 : b.weapon === 'SG' ? 14 : 28);
      const head = project(b.x, b.y);
      const tail = project(b.x - ux * len, b.y - uy * len);
      const core = project(b.x - ux * len * 0.4, b.y - uy * len * 0.4);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.big ? 6 : (b.weapon === 'SR' ? 3.2 : 2.2);
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = b.big ? 2.5 : 1.2; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(core.x, core.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      if (b.aoe) { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(head.x, head.y, 6, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  drawBeams(ctx) {
    for (const b of this.beams) {
      const k = b.life / b.max;
      if (b.t === 'snipe') {
        const start = project(b.x1, b.y1), end = project(b.x2, b.y2);
        ctx.save();
        ctx.lineCap = 'round';
        if (this.quality === 'high') ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.strokeStyle = '#59c8ff'; ctx.lineWidth = b.w * k + 4;
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, b.w * 0.3 * k);
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
        ctx.restore();
      } else if (b.t === 'barrier') {
        const u = b.u; const r = 33 * u.scale;
        ctx.save();
        this.transformUnit(ctx, u);
        ctx.translate(u.x, u.y - 8 * u.scale);
        ctx.strokeStyle = `rgba(210,250,255,${k})`; ctx.lineWidth = 5 * k + 1;
        ctx.beginPath(); ctx.arc(0, 0, r + 2, b.a - 0.7, b.a + 0.7); ctx.stroke();
        ctx.fillStyle = `rgba(150,235,255,${k * 0.35})`;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, b.a - 0.7, b.a + 0.7); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (b.t === 'cast') {
        const u = b.u; const k2 = 1 - k;
        ctx.save();
        this.transformUnit(ctx, u);
        ctx.strokeStyle = u.team === 0 ? `rgba(120,220,255,${k})` : `rgba(255,120,120,${k})`; ctx.lineWidth = 4 * k + 1;
        ctx.beginPath(); ctx.ellipse(u.x, u.y + 24 * u.scale, 18 + 40 * k2, 7 + 14 * k2, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawParts(ctx) {
    const hi = this.quality === 'high';
    ctx.save();
    for (const p of this.parts) {
      const k = p.life / p.max;
      const { x, y } = project(p.x, p.y);
      switch (p.t) {
        case 'flash': {
          ctx.save();
          ctx.translate(x, y); ctx.rotate(p.ang);
          const s = p.size * (0.6 + 0.4 * k);
          if (hi) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; const g = glow(p.color); ctx.drawImage(g, -18 * s, -18 * s, 36 * s, 36 * s); ctx.globalAlpha = 1; }
          ctx.fillStyle = '#fff6c8';
          ctx.beginPath();
          const L = 22 * s, Wd = 7 * s;
          ctx.moveTo(0, 0); ctx.lineTo(L * 0.4, -Wd); ctx.lineTo(L, 0); ctx.lineTo(L * 0.4, Wd); ctx.closePath(); ctx.fill();
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.5, -Wd * 1.9); ctx.lineTo(L * 0.62, 0); ctx.lineTo(L * 0.5, Wd * 1.9); ctx.closePath(); ctx.globalAlpha = 0.8; ctx.fill();
          if (p.wp === 'SG') { for (const a of [-0.5, 0.5]) { ctx.save(); ctx.rotate(a); ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.7, -3 * s); ctx.lineTo(L * 0.8, 0); ctx.lineTo(L * 0.7, 3 * s); ctx.closePath(); ctx.fill(); ctx.restore(); } }
          ctx.restore();
          break;
        }
        case 'spark': {
          const end = project(p.x - p.vx * p.len, p.y - p.vy * p.len);
          ctx.strokeStyle = p.color; ctx.globalAlpha = k; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(end.x, end.y); ctx.stroke();
          break;
        }
        case 'casing':
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = '#f3c24a'; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
          break;
        case 'smoke':
          ctx.globalAlpha = k * 0.35; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(x, y, p.size * (1.6 - k), 0, TAU); ctx.fill();
          break;
        case 'fire': {
          const r = p.size * (1.1 - k * 0.5);
          if (hi) ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = k * 0.9;
          const g = glow('#ff9a40'); ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'dot':
          ctx.globalAlpha = k; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(x, y, p.size * k, 0, TAU); ctx.fill();
          break;
        case 'plus':
          ctx.globalAlpha = k; ctx.fillStyle = '#6dffa8'; ctx.strokeStyle = '#1c8a58'; ctx.lineWidth = 1.2;
          ctx.beginPath(); const q = p.size, w2 = q / 3;
          ctx.rect(x - w2, y - q, w2 * 2, q * 2); ctx.rect(x - q, y - w2, q * 2, w2 * 2); ctx.fill();
          break;
        case 'arrow':
          ctx.globalAlpha = k; ctx.fillStyle = '#ffe45a';
          ctx.beginPath(); ctx.moveTo(x, y - p.size); ctx.lineTo(x + p.size, y + 2); ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + 2, y + p.size); ctx.lineTo(x - 2, y + p.size); ctx.lineTo(x - 2, y + 2); ctx.lineTo(x - p.size, y + 2); ctx.closePath(); ctx.fill();
          break;
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  drawRings(ctx) {
    ctx.save();
    for (const r of this.rings) {
      const k = r.life / r.max;
      ctx.globalAlpha = k; ctx.strokeStyle = r.color; ctx.lineWidth = r.w * k + 0.5;
      traceGroundCircle(ctx, r.x, r.y, r.r); ctx.stroke();
    }
    ctx.restore();
  }

  drawNums(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const n of this.nums) {
      const { x, y } = project(n.x, n.y);
      const k = n.life / n.max;
      const pop = n.crit ? 1 + Math.max(0, (k - 0.7)) * 2.2 : 1;
      const size = (n.crit ? 22 : n.skill ? 17 : 14) * pop;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `900 italic ${size}px 'Noto Sans KR', sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = n.crit ? '#7a3a00' : '#1a2a52';
      ctx.strokeText(n.txt, x, y);
      ctx.fillStyle = n.crit ? '#ffe03a' : n.color;
      ctx.fillText(n.txt, x, y);
    }
    for (const n of this.texts) {
      const { x, y } = project(n.x, n.y);
      const k = n.life / n.max;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `800 ${n.skillName ? 'italic ' : ''}${n.size}px 'Noto Sans KR', sans-serif`;
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#17305c';
      ctx.strokeText(n.txt, x, y); ctx.fillStyle = n.color; ctx.fillText(n.txt, x, y);
    }
    ctx.restore();
  }

}
