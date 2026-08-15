// 벡터 도형 프리미티브. 전부 stroke 기반(채우지 않음) + 글로우.

import { TAU } from '../core/vec.js';

export function polygonPath(ctx, x, y, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function polygon(ctx, x, y, r, sides, rot = 0) {
  polygonPath(ctx, x, y, r, sides, rot);
  ctx.stroke();
}

/** 속이 꽉 찬 다각형. 적(외곽선)과 픽업(채움)을 실루엣만으로 구분하는 데 쓴다. */
export function fillPolygon(ctx, x, y, r, sides, rot = 0) {
  polygonPath(ctx, x, y, r, sides, rot);
  ctx.fill();
}

export function star(ctx, x, y, r, points, rot = 0) {
  ctx.beginPath();
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i / n) * TAU - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

export function disc(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

export function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** 플레이어 삼각형 — 진행 방향을 향한다. */
export function ship(ctx, x, y, r, angle) {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(angle) * r * 1.6, y + Math.sin(angle) * r * 1.6);
  ctx.lineTo(x + Math.cos(angle + 2.5) * r, y + Math.sin(angle + 2.5) * r);
  ctx.lineTo(x + Math.cos(angle - 2.5) * r, y + Math.sin(angle - 2.5) * r);
  ctx.closePath();
  ctx.stroke();
}

/** 지그재그 번개. seed 로 모양이 고정된다. */
export function zap(ctx, x0, y0, x1, y1, seed = 0) {
  const segs = 6;
  const dx = x1 - x0, dy = y1 - y0;
  const nx = -dy, ny = dx;
  const len = Math.hypot(dx, dy) || 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    // 결정적 의사난수: 프레임마다 흔들리지 않게
    const j = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1;
    const off = (j - 0.5) * 0.18 * len;
    ctx.lineTo(x0 + dx * t + (nx / len) * off, y0 + dy * t + (ny / len) * off);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
