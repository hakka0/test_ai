// 학생 이미지와 코드로 그리는 기본 스프라이트 / 아이템 아이콘
import { SCHOOLS, ITEMS, COST_COLORS, PC_MODE, UNITS, WEAPONS } from './data.js';

const OUT = 'rgba(32,44,78,0.62)';
const SKIN = '#ffe7d6';

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}
function ell(ctx, x, y, rx, ry, fill, stroke = true) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(); }
}
function rr(ctx, x, y, w, h, r, fill, stroke = true) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(); }
}

// ---------- 학생 ----------
function drawStudent(ctx, d) {
  const [c1, c2] = d.outfit;
  const hair = d.hair;
  const hairD = shade(hair, -28);
  // 뒷머리
  ctx.lineJoin = 'round';
  if (d.style === 'long') rr(ctx, 26, 30, 44, 50, 16, hairD);
  if (d.style === 'twin') { ell(ctx, 25, 50, 8, 19, hairD); ell(ctx, 71, 50, 8, 19, hairD); }
  if (d.style === 'pony') { ell(ctx, 71, 46, 8, 20, hairD); }
  if (d.style === 'bob') ell(ctx, 48, 44, 25, 24, hairD);
  if (d.style === 'short') ell(ctx, 48, 42, 23, 22, hairD);
  // 날개 (트리니티)
  if (d.school === 'trinity') {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(48 + s * 12, 58); ctx.quadraticCurveTo(48 + s * 40, 38, 48 + s * 36, 70); ctx.quadraticCurveTo(48 + s * 24, 66, 48 + s * 12, 70); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // 다리
  rr(ctx, 38, 80, 8, 10, 3, SKIN); rr(ctx, 50, 80, 8, 10, 3, SKIN);
  rr(ctx, 36, 87, 11, 6, 3, '#2d3550'); rr(ctx, 49, 87, 11, 6, 3, '#2d3550');
  // 몸 (교복)
  ctx.beginPath(); ctx.moveTo(34, 58); ctx.lineTo(62, 58); ctx.lineTo(66, 82); ctx.lineTo(30, 82); ctx.closePath();
  ctx.fillStyle = c1; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  // 스커트 포인트색
  ctx.beginPath(); ctx.moveTo(32, 74); ctx.lineTo(64, 74); ctx.lineTo(66, 82); ctx.lineTo(30, 82); ctx.closePath(); ctx.fillStyle = c2; ctx.fill();
  // 세일러 카라
  ctx.beginPath(); ctx.moveTo(38, 58); ctx.lineTo(58, 58); ctx.lineTo(48, 70); ctx.closePath(); ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
  ell(ctx, 48, 66, 2.6, 2.2, '#ffffff', false);
  // 팔
  ell(ctx, 30, 66, 5, 8, c1); ell(ctx, 66, 66, 5, 8, c1);
  ell(ctx, 30, 73, 4, 4, SKIN); ell(ctx, 66, 73, 4, 4, SKIN);
  // 머리
  ell(ctx, 48, 40, 21, 20, SKIN);
  // 앞머리
  ctx.beginPath(); ctx.moveTo(26, 40);
  ctx.bezierCurveTo(24, 16, 72, 16, 70, 40);
  ctx.lineTo(66, 34); ctx.lineTo(60, 40); ctx.lineTo(54, 31); ctx.lineTo(47, 40); ctx.lineTo(40, 31); ctx.lineTo(34, 40); ctx.closePath();
  ctx.fillStyle = hair; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  // 옆머리
  if (d.style === 'long' || d.style === 'bob') { rr(ctx, 25, 34, 6, 28, 3, hair); rr(ctx, 65, 34, 6, 28, 3, hair); }
  // 눈
  for (const ex of [40, 56]) {
    ell(ctx, ex, 45, 3.6, 5, d.eye, false);
    ctx.fillStyle = '#1c2540'; ctx.beginPath(); ctx.ellipse(ex, 46, 1.8, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - 1.2, 42.6, 1.3, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,120,130,.35)'; ctx.beginPath(); ctx.ellipse(35, 51, 4, 2.4, 0, 0, 7); ctx.ellipse(61, 51, 4, 2.4, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a0505a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(48, 52, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // 포니테일 묶음
  if (d.style === 'pony') { ell(ctx, 66, 28, 4.5, 4.5, d.outfit[1]); }
  // 소품
  if (d.acc === 'ears') {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(48 + s * 10, 22); ctx.lineTo(48 + s * 22, 8); ctx.lineTo(48 + s * 24, 28); ctx.closePath();
      ctx.fillStyle = hair; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(48 + s * 14, 21); ctx.lineTo(48 + s * 21, 13); ctx.lineTo(48 + s * 22, 25); ctx.closePath(); ctx.fillStyle = '#ffb0b8'; ctx.fill();
    }
  }
  if (d.acc === 'horn') {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(48 + s * 14, 22); ctx.quadraticCurveTo(48 + s * 26, 14, 48 + s * 22, 4); ctx.quadraticCurveTo(48 + s * 17, 12, 48 + s * 9, 20); ctx.closePath();
      ctx.fillStyle = '#4a3550'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }
  if (d.acc === 'ribbon') {
    ctx.fillStyle = d.outfit[1]; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(62, 22); ctx.lineTo(72, 16); ctx.lineTo(72, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(62, 22); ctx.lineTo(54, 14); ctx.lineTo(54, 28); ctx.closePath(); ctx.fill(); ctx.stroke();
    ell(ctx, 62, 22, 3, 3, shade(d.outfit[1], -30));
  }
  if (d.acc === 'glasses') {
    ctx.strokeStyle = '#3a4560'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(40, 45, 6.5, 0, 7); ctx.moveTo(62.5, 45); ctx.arc(56, 45, 6.5, 0, 7); ctx.moveTo(46.5, 45); ctx.lineTo(49.5, 45); ctx.stroke();
  }
}

// ---------- 적 (헬멧단) ----------
function drawEnemy(ctx, d, color) {
  const dark = shade(color, -50);
  rr(ctx, 38, 80, 8, 10, 3, '#333b52'); rr(ctx, 50, 80, 8, 10, 3, '#333b52');
  rr(ctx, 36, 87, 11, 6, 3, '#1c2236'); rr(ctx, 49, 87, 11, 6, 3, '#1c2236');
  ctx.beginPath(); ctx.moveTo(33, 58); ctx.lineTo(63, 58); ctx.lineTo(66, 82); ctx.lineTo(30, 82); ctx.closePath();
  ctx.fillStyle = '#5b6481'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  rr(ctx, 36, 60, 24, 14, 4, dark);
  rr(ctx, 40, 63, 16, 4, 2, color, false);
  ell(ctx, 30, 66, 5, 8, '#5b6481'); ell(ctx, 66, 66, 5, 8, '#5b6481');
  ell(ctx, 30, 73, 4, 4, '#2d3350'); ell(ctx, 66, 73, 4, 4, '#2d3350');
  ell(ctx, 48, 40, 21, 20, '#d9c7b5');
  // 헬멧
  ctx.beginPath(); ctx.moveTo(25, 44); ctx.bezierCurveTo(22, 12, 74, 12, 71, 44); ctx.lineTo(66, 40); ctx.lineTo(30, 40); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(40, 24, 9, 4, -0.4, 0, 7); ctx.fill();
  // 마스크/고글
  rr(ctx, 29, 40, 38, 9, 4, '#1b2238');
  ctx.fillStyle = '#ff5a5a'; ctx.fillRect(34, 43, 9, 3); ctx.fillRect(53, 43, 9, 3);
  rr(ctx, 33, 51, 30, 10, 4, '#2d3452');
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(38, 54); ctx.lineTo(58, 54); ctx.moveTo(38, 57); ctx.lineTo(58, 57); ctx.stroke();
}

const artRoot = new URL(PC_MODE ? '../units/toon-pixel-test-20261117/' : '../units/blue-archive/', import.meta.url);
// 프레임 크기는 이미지를 자를 때 사용한다. 화면 표시 배율은 전장 렌더러가 정한다.
export const UNIT_FRAME_SIZE = 128;
export const UNIT_SOURCE_FRAME_SIZE = PC_MODE ? 256 : UNIT_FRAME_SIZE;
export const DRAWN_FRAME_SIZE = 96;
const sheets = new Map();
const spriteFeet = new WeakMap();
const weaponImages = new Map();
const pcPortraits = new Map();
const loadedPcArt = new Set();
// 이미지가 교체되면 이전 브라우저 캐시를 사용하지 않도록 이 버전을 올린다.
const PC_ART_VERSION = '20261117-v1';
const PC_ART_CACHE = `bachess-pc-art:${new URL('../', import.meta.url).pathname}:${PC_ART_VERSION}`;

function unitArtURL(key) { return new URL(`${key}.png`, artRoot); }
function weaponArtURL(type) { return new URL(`../units/weapons/${type.toLowerCase()}.png`, import.meta.url); }

function sheetFrame(image, index) {
  const size = UNIT_SOURCE_FRAME_SIZE;
  const frame = mk(size, size);
  const col = index % 3, row = Math.floor(index / 3);
  frame.getContext('2d').drawImage(image, col * size, row * size, size, size, 0, 0, size, size);
  return frame;
}

function bitmapCanvas(image) {
  const canvas = mk(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
}

async function prepareAsset(response, prepare) {
  if (!response.ok) throw new Error(`Image request failed (${response.status})`);
  const image = await createImageBitmap(await response.blob());
  try { prepare(image); }
  finally { image.close(); }
}

async function loadPcAsset(cache, url, prepare, onMiss) {
  let cached;
  try { cached = await cache?.match(url); } catch { /* Cache Storage may be unavailable. */ }
  if (cached) {
    try { await prepareAsset(cached, prepare); return; }
    catch { /* Re-download invalid cached images. */ }
  }
  onMiss();
  const response = await fetch(url, { cache: cached ? 'reload' : 'default', signal: AbortSignal.timeout(30_000) });
  const copy = cache && response.ok ? response.clone() : null;
  try { await prepareAsset(response, prepare); }
  catch (error) {
    if (copy?.body) void copy.body.cancel().catch(() => {});
    throw error;
  }
  if (copy) {
    try { await cache.put(url, copy); } catch { /* The decoded image is still usable. */ }
  }
}

export async function preloadPcArt({ onMiss, onProgress }) {
  if (!PC_MODE) return;
  const keys = [...new Set(UNITS.map((unit) => unit.imageKey).filter(Boolean))];
  const jobs = [
    ...keys.map((key) => [unitArtURL(key), (image) => {
      const size = UNIT_SOURCE_FRAME_SIZE;
      if (image.width !== size * 3 || image.height !== size * 2) throw new Error('Invalid unit sprite sheet size');
      sheets.set(key, { frames: Array.from({ length: 6 }, (_, i) => sheetFrame(image, i)) });
    }]),
    ...keys.map((key) => [unitArtURL(`icons/${key}`), (image) => {
      pcPortraits.set(key, bitmapCanvas(image).toDataURL('image/png'));
    }]),
    ...Object.keys(WEAPONS).map((type) => [weaponArtURL(type), (image) => {
      weaponImages.set(type, bitmapCanvas(image));
    }]),
  ];
  for (const [url] of jobs) url.searchParams.set('art', PC_ART_VERSION);
  const pending = jobs.filter(([url]) => !loadedPcArt.has(url.href));
  let completed = jobs.length - pending.length;
  onProgress(completed, jobs.length);
  if (!pending.length) return;

  let cache;
  try { cache = await globalThis.caches?.open(PC_ART_CACHE); } catch { /* Use the HTTP cache. */ }
  const results = await Promise.allSettled(pending.map(async ([url, prepare]) => {
    await loadPcAsset(cache, url.href, prepare, onMiss);
    loadedPcArt.add(url.href);
    onProgress(++completed, jobs.length);
  }));
  if (results.some((result) => result.status === 'rejected')) throw new Error('Some game images could not be loaded');
}

export function spriteFootRatio(sprite) {
  const cached = spriteFeet.get(sprite);
  if (cached !== undefined) return cached;

  // 반투명 그림자와 외곽의 작은 흔적은 발 위치 계산에서 제외한다.
  const { width, height } = sprite;
  const { data } = sprite.getContext('2d').getImageData(0, 0, width, height);
  const minPixels = Math.max(2, Math.ceil(width * 0.015));
  for (let row = height - 1; row >= 0; row--) {
    let opaque = 0;
    for (let i = row * width * 4 + 3, end = i + width * 4; i < end; i += 4) {
      if (data[i] >= 96) opaque++;
      if (opaque >= minPixels) {
        const foot = (row + 1) / height;
        spriteFeet.set(sprite, foot);
        return foot;
      }
    }
  }
  spriteFeet.set(sprite, 0.99);
  return 0.99;
}

export function facesAway(aim) {
  return Math.sin(aim) < 0;
}

export function getImportedSprite(def, aim) {
  if (!def.imageKey) return;
  let sheet = sheets.get(def.imageKey);
  if (!sheet) {
    const image = new Image();
    image.src = unitArtURL(def.imageKey).href;
    sheet = { image, frames: [], ready: false };
    sheets.set(def.imageKey, sheet);
    image.decode().then(() => { sheet.ready = true; }, () => {});
  }
  const { image, frames } = sheet;
  // 위 행은 정면, 아래 행은 후면. 각 행은 왼쪽 / 가운데 / 오른쪽 순서.
  const dx = Math.cos(aim), dy = Math.sin(aim);
  const row = facesAway(aim) ? 1 : 0;
  const col = Math.abs(dx) <= Math.abs(dy) * 0.35 ? 1 : dx < 0 ? 0 : 2;
  const index = row * 3 + col;
  if (!frames[index]) {
    const size = UNIT_SOURCE_FRAME_SIZE;
    if (!sheet.ready || image.naturalWidth !== size * 3 || image.naturalHeight !== size * 2) return;
    frames[index] = sheetFrame(image, index);
  }
  return frames[index];
}

const spriteCache = new Map();
export function getSprite(def) {
  let c = spriteCache.get(def.key);
  if (c) return c;
  c = mk(DRAWN_FRAME_SIZE, DRAWN_FRAME_SIZE);
  const ctx = c.getContext('2d');
  if (def.isEnemy) drawEnemy(ctx, def, def.enemyColor || '#e0b030');
  else drawStudent(ctx, def);
  spriteCache.set(def.key, c);
  return c;
}
export function getEnemySprite(def, color) {
  const k = def.key + color;
  let c = spriteCache.get(k);
  if (c) return c;
  c = mk(DRAWN_FRAME_SIZE, DRAWN_FRAME_SIZE);
  drawEnemy(c.getContext('2d'), def, color);
  spriteCache.set(k, c);
  return c;
}

// ---------- 무기 (+x 방향) ----------
export function getPixelWeapon(type) {
  let image = weaponImages.get(type);
  if (!image) {
    image = new Image();
    image.src = weaponArtURL(type).href;
    weaponImages.set(type, image);
  }
  if (image.naturalWidth ?? image.width) return image;
}

export function drawWeapon(ctx, type) {
  const dk = '#2f3548', md = '#4b5470', lt = '#8d98b8';
  ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(20,28,50,.8)';
  const box = (x, y, w, h, f) => { ctx.fillStyle = f; ctx.beginPath(); ctx.roundRect(x, y, w, h, 1.5); ctx.fill(); ctx.stroke(); };
  switch (type) {
    case 'SG': box(-4, -3, 22, 6, dk); box(6, 3, 10, 4, md); box(16, -2, 6, 4, lt); box(-9, -2, 6, 6, '#6a4a30'); break;
    case 'SMG': box(-4, -3, 17, 6, dk); box(0, 3, 4, 9, md); box(13, -2, 5, 4, lt); break;
    case 'AR': box(-10, -2.5, 8, 6, '#6a5a40'); box(-4, -3.5, 22, 7, dk); box(3, 3, 5, 9, md); box(18, -2, 9, 4, lt); box(2, -6, 8, 3, lt); break;
    case 'HG': box(-3, -2.5, 12, 5, dk); box(-1, 2, 5, 7, md); box(9, -1.5, 4, 3, lt); break;
    case 'MG': box(-8, -3.5, 22, 8, dk); box(14, -2, 13, 4, lt); box(2, 4, 9, 7, md); box(-2, -8, 9, 4, md); break;
    case 'SR': box(-12, -2.5, 12, 6, '#6a5a40'); box(-2, -3, 28, 5, dk); box(26, -1.5, 10, 3, lt); box(4, -8, 10, 4, md); box(6, 3, 4, 7, md); break;
    default: box(-3, -2.5, 16, 5, dk);
  }
}

// ---------- 초상화 / 아이콘 (data URL 캐시) ----------
const urlCache = new Map();
export function portraitURL(def, size = 96) {
  if (def.imageKey) return pcPortraits.get(def.imageKey) ?? unitArtURL(`icons/${def.imageKey}`).href;
  const k = 'p:' + def.key + size;
  if (urlCache.has(k)) return urlCache.get(k);
  const src = getSprite(def);
  const c = mk(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // 상반신 확대
  ctx.drawImage(src, 8, 0, 80, 80, 0, 0, size, size);
  const u = c.toDataURL('image/png');
  urlCache.set(k, u);
  return u;
}
export function fullURL(def, size = 96) {
  const k = 'f:' + def.key + size;
  if (urlCache.has(k)) return urlCache.get(k);
  const c = mk(size, size);
  c.getContext('2d').drawImage(getSprite(def), 0, 0, size, size);
  const u = c.toDataURL('image/png');
  urlCache.set(k, u);
  return u;
}

function glyph(ctx, key, cx, cy, s, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(25,36,66,.85)'; ctx.lineJoin = 'round';
  const dk = '#38405c';
  switch (key) {
    case 'mag':
      ctx.fillStyle = dk; ctx.beginPath(); ctx.roundRect(-9, -15, 18, 28, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.roundRect(-6, -11 + i * 8, 12, 5, 2); ctx.fill(); }
      break;
    case 'barrel':
      ctx.fillStyle = dk; ctx.beginPath(); ctx.roundRect(-17, -6, 34, 12, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(8, -4, 8, 8, 2); ctx.fill();
      ctx.fillStyle = '#9aa6c4'; ctx.fillRect(-14, -4, 14, 3);
      break;
    case 'vest':
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-6, -14); ctx.lineTo(0, -7); ctx.lineTo(6, -14); ctx.lineTo(14, -14); ctx.lineTo(12, 14); ctx.lineTo(-12, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(-8, 2, 16, 3); ctx.fillRect(-8, 8, 16, 3);
      break;
    case 'plate':
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-13, -13); ctx.lineTo(13, -13); ctx.lineTo(13, 3); ctx.quadraticCurveTo(13, 12, 0, 16); ctx.quadraticCurveTo(-13, 12, -13, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(0, -9); ctx.lineTo(0, 10); ctx.quadraticCurveTo(-8, 6, -8, 0); ctx.fill();
      break;
    case 'cell':
      ctx.fillStyle = dk; ctx.beginPath(); ctx.roundRect(-10, -12, 20, 26, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dk; ctx.fillRect(-4, -16, 8, 5);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-6, 3); ctx.lineTo(0, 3); ctx.lineTo(-2, 11); ctx.lineTo(6, -2); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill();
      break;
  }
  ctx.restore();
}

export function itemURL(key, size = 56) {
  const k = 'i:' + key + size;
  if (urlCache.has(k)) return urlCache.get(k);
  const it = ITEMS[key];
  const S = 64;
  const c = mk(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfdcec');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(2, 2, S - 4, S - 4, 12); ctx.fill();
  ctx.strokeStyle = it.tier === 2 ? '#f0b020' : '#aebcd2'; ctx.lineWidth = it.tier === 2 ? 3.5 : 2.5; ctx.stroke();
  if (it.tier === 1) glyph(ctx, it.glyph, 32, 33, 1.25, it.color);
  else {
    const [a, b] = it.parts;
    glyph(ctx, COMPONENT_GLYPH[a], 24, 25, 0.82, ITEMS[a].color);
    glyph(ctx, COMPONENT_GLYPH[b], 41, 41, 0.82, ITEMS[b].color);
    ctx.fillStyle = '#f0b020'; ctx.beginPath(); ctx.arc(52, 12, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', 52, 16);
  }
  const u = c.toDataURL('image/png');
  urlCache.set(k, u);
  return u;
}
const COMPONENT_GLYPH = { mag: 'mag', barrel: 'barrel', vest: 'vest', plate: 'plate', cell: 'cell' };

// 학원 / 역할 / 무기 배지 (작은 아이콘)
export function schoolBadge(school) {
  const s = SCHOOLS[school];
  return `<span class="chip school" style="--c:${s.color}"><i>${s.letter}</i></span>`;
}

// 시너지 아이콘 (SVG 문자열)
export function roleIconSVG(role, color = '#fff') {
  const paths = {
    tank: '<path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5z" fill="' + color + '"/>',
    dealer: '<path d="M12 2l1.6 6.4L20 9l-5 4 1.8 7L12 16.4 7.2 20 9 13 4 9l6.4-.6z" fill="' + color + '"/>',
    support: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="' + color + '"/>',
  };
  return `<svg viewBox="0 0 24 24" width="100%" height="100%">${paths[role] || ''}</svg>`;
}
export { COST_COLORS };
