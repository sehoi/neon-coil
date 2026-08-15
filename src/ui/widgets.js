// UI 공용 그리기 + 히트테스트.

import { C } from '../config.js';
import { input, consumeTap } from '../core/input.js';
import { polygon, circle, disc, line, star } from '../render/shapes.js';
import { TAU } from '../core/vec.js';

export function text(ctx, str, x, y, {
  size = 18, color = C.text, align = 'left', baseline = 'alphabetic',
  weight = '', glow = 0, alpha = 1,
} = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function bar(ctx, x, y, w, h, frac, color, bg = '#1a2036') {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.restore();
}

export function panel(ctx, x, y, w, h, color = C.cyan, alpha = 0.9) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(8,10,22,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/** @returns {boolean} 클릭되었는가 (미처리 탭 큐에서 소비한다) */
export function button(ctx, x, y, w, h, label, opts = {}) {
  const p = input.pointer;
  const hover = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  const color = opts.color || C.cyan;
  const clicked = consumeTap(x, y, w, h);

  ctx.save();
  ctx.fillStyle = hover ? 'rgba(0,240,255,0.12)' : 'rgba(10,14,28,0.9)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = hover ? 3 : 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = hover ? 16 : 8;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  text(ctx, label, x + w / 2, y + h / 2, {
    size: opts.size || 22, align: 'center', baseline: 'middle',
    color: hover ? '#ffffff' : color,
  });

  return clicked;
}

/** 무기/패시브 아이콘. 전부 도형으로 그린다. */
export function icon(ctx, kind, x, y, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  switch (kind) {
    case 'ring':
      circle(ctx, x, y, r * 0.9);
      circle(ctx, x, y, r * 0.45);
      break;
    case 'bolt':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y);
      ctx.lineTo(x + r * 0.7, y);
      ctx.stroke();
      disc(ctx, x + r * 0.7, y, r * 0.3);
      break;
    case 'orbit':
      circle(ctx, x, y, r * 0.85);
      disc(ctx, x + r * 0.85, y, r * 0.25);
      disc(ctx, x - r * 0.85, y, r * 0.25);
      break;
    case 'chain':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.8, y - r * 0.5);
      ctx.lineTo(x - r * 0.1, y + r * 0.1);
      ctx.lineTo(x + r * 0.1, y - r * 0.1);
      ctx.lineTo(x + r * 0.8, y + r * 0.5);
      ctx.stroke();
      break;
    case 'laser':
      line(ctx, x - r, y + r * 0.6, x + r, y - r * 0.6);
      break;
    case 'amp':
      polygon(ctx, x, y, r * 0.9, 3, 0);
      break;
    case 'clock':
      circle(ctx, x, y, r * 0.85);
      line(ctx, x, y, x, y - r * 0.5);
      line(ctx, x, y, x + r * 0.4, y);
      break;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.8, y - r * 0.4);
      ctx.lineTo(x + r * 0.6, y + r * 0.8);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.6, y + r * 0.8);
      ctx.lineTo(x - r * 0.8, y - r * 0.4);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'magnet':
      ctx.beginPath();
      ctx.arc(x, y + r * 0.2, r * 0.75, Math.PI, 0);
      ctx.stroke();
      line(ctx, x - r * 0.75, y + r * 0.2, x - r * 0.75, y + r * 0.7);
      line(ctx, x + r * 0.75, y + r * 0.2, x + r * 0.75, y + r * 0.7);
      break;
    case 'boot':
      star(ctx, x, y, r * 0.9, 5, 0);
      break;
    default:
      polygon(ctx, x, y, r * 0.8, 4, 0);
  }
  ctx.restore();
}

/** 레벨 점 표시 (아이콘 아래) */
export function levelDots(ctx, x, y, lv, max, color) {
  const gap = 7;
  const startX = x - ((max - 1) * gap) / 2;
  ctx.save();
  for (let i = 0; i < max; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, y, 2.2, 0, TAU);
    ctx.fillStyle = i < lv ? color : '#2a3350';
    ctx.fill();
  }
  ctx.restore();
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
