// 그리기 도우미 — 둥근 사각형, 버튼, 글자. 상태를 갖지 않는다.

import { SETTINGS } from '../config.js';

export const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function text(ctx, str, x, y, {
  size = 24, color = '#e8ecf7', align = 'left', baseline = 'alphabetic', weight = '600', glow = 0,
} = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (glow && SETTINGS.glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/**
 * 버튼 한 개.
 * @returns {object} 넘겨받은 사각형 그대로 (히트 테스트에 다시 쓴다)
 */
export function button(ctx, r, {
  label = '', sub = '', accent = '#4dd2ff', disabled = false, badge = null, active = false, radius = 16,
} = {}) {
  ctx.save();
  ctx.globalAlpha = disabled ? 0.38 : 1;

  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = active ? 2.6 : 1.6;
  ctx.strokeStyle = active ? accent : 'rgba(255,255,255,0.22)';
  if (SETTINGS.glow && active) { ctx.shadowColor = accent; ctx.shadowBlur = 14; }
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (label) {
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + (sub ? -8 : 0), {
      size: sub ? 24 : 26, color: '#f2f5ff', align: 'center', baseline: 'middle', weight: '700',
    });
  }
  if (sub) {
    text(ctx, sub, r.x + r.w / 2, r.y + r.h / 2 + 20, {
      size: 17, color: 'rgba(226,232,247,0.7)', align: 'center', baseline: 'middle', weight: '500',
    });
  }
  if (badge !== null) {
    const bx = r.x + r.w - 16, by = r.y + 16;
    ctx.beginPath();
    ctx.arc(bx, by, 17, 0, Math.PI * 2);
    ctx.fillStyle = badge > 0 ? accent : 'rgba(120,126,148,0.9)';
    ctx.fill();
    text(ctx, String(badge), bx, by + 1, {
      size: 20, color: '#0b0d16', align: 'center', baseline: 'middle', weight: '700',
    });
  }
  ctx.restore();
  return r;
}

/** 반투명 패널 (오버레이 화면 바탕). */
export function panel(ctx, r, { accent = 'rgba(255,255,255,0.16)' } = {}) {
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 26);
  ctx.fillStyle = 'rgba(12,15,26,0.92)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.restore();
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
