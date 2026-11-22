import { COLS, ROWS, SIDE_ROWS, CW, CH, BOARD_W, BOARD_H, PC_MODE } from './data.js';

const farWidth = 0.76;
const nearWidth = 0.98;
const perspective = nearWidth / farWidth - 1;
const center = BOARD_W / 2;
let top = 65;
let bottom = BOARD_H - 27;
let widthScale = 1;

export function setSpriteClearance(size, pixelsPerX, pixelsPerY) {
  bottom = BOARD_H - Math.max(27, Math.min(BOARD_H * 0.16, 34 / pixelsPerY));
  top = Math.max(65, Math.min((size + 16) / pixelsPerY, bottom - BOARD_H * 0.40));
  // 가장자리 칸의 유닛도 발을 칸에 둔 채 그림 전체가 보이도록 한다.
  const availableHalfWidth = center - (size / 2 + 8) / pixelsPerX;
  widthScale = Math.min(1, Math.max(0.35, availableHalfWidth / ((center - CW / 3) * nearWidth)));
}

export function project(x, y) {
  if (!PC_MODE) return { x, y };
  const depth = y / BOARD_H;
  const t = depth / (1 + perspective * (1 - depth));
  const width = (farWidth + (nearWidth - farWidth) * t) * widthScale;
  return { x: center + (x - center) * width, y: top + (bottom - top) * t };
}

export function unproject(x, y) {
  if (!PC_MODE) return { x, y };
  const t = (y - top) / (bottom - top);
  const width = (farWidth + (nearWidth - farWidth) * t) * widthScale;
  return {
    x: center + (x - center) / width,
    y: BOARD_H * t * (1 + perspective) / (1 + perspective * t),
  };
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function quad(left, top, right, bottom) {
  return [project(left, top), project(right, top), project(right, bottom), project(left, bottom)];
}

export function traceFloor(ctx) {
  polygon(ctx, quad(0, 0, BOARD_W, BOARD_H));
}

export function traceCell(ctx, col, row) {
  const x = col * CW, y = row * CH;
  if (PC_MODE) polygon(ctx, quad(x + 3, y + 3, x + CW - 3, y + CH - 3));
  else {
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, CW - 4, CH - 4, 8);
  }
}

export function traceGroundCircle(ctx, x, y, radius) {
  ctx.beginPath();
  if (!PC_MODE) {
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    return;
  }
  for (let i = 0; i < 48; i++) {
    const angle = i * Math.PI / 24;
    const p = project(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
}

export function paintPerspectiveFloor(ctx) {
  const backdrop = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  backdrop.addColorStop(0, '#f4faff');
  backdrop.addColorStop(1, '#bfdaef');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  const [farLeft, farRight, nearRight, nearLeft] = quad(0, 0, BOARD_W, BOARD_H);
  const frontLeft = { x: nearLeft.x, y: nearLeft.y + 14 };
  const frontRight = { x: nearRight.x, y: nearRight.y + 14 };
  for (const [points, fill] of [
    [[farLeft, farRight, frontRight, frontLeft], '#759ab9'],
    [[nearLeft, nearRight, frontRight, frontLeft], '#456b91'],
  ]) {
    polygon(ctx, points);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  traceFloor(ctx);
  ctx.fillStyle = '#9abbd4';
  ctx.fill();
  ctx.strokeStyle = '#e9f6ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let row = 0; row < ROWS; row++) {
    const y = row * CH;
    const gradient = ctx.createLinearGradient(0, project(0, y).y, 0, project(0, y + CH).y);
    const foe = row < SIDE_ROWS;
    gradient.addColorStop(0, foe ? '#fff2f3' : '#f5fbff');
    gradient.addColorStop(1, foe ? '#ecc7d1' : '#c4e0f5');
    for (let col = 0; col < COLS; col++) {
      traceCell(ctx, col, row);
      ctx.fillStyle = gradient;
      ctx.fill();
      if ((row + col) % 2) {
        ctx.fillStyle = foe ? 'rgba(153,70,105,.10)' : 'rgba(49,116,173,.10)';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.78)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  const left = project(4, SIDE_ROWS * CH), right = project(BOARD_W - 4, SIDE_ROWS * CH);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.strokeStyle = '#ffe17c';
  ctx.lineWidth = 3;
  ctx.stroke();
}
