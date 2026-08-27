// 타일 한 장 그리기. 마작패처럼 밝은 몸통에 무늬만 형광으로 태운다 —
// 어두운 배경 위에서 밝은 면이 "집을 수 있는 것"으로 바로 읽힌다.

import { SETTINGS } from '../config.js';
import { TILE } from '../data/tuning.js';
import { SYMBOLS, drawSymbol } from '../data/symbols.js';
import { roundRect } from '../ui/widgets.js';

export function drawTile(ctx, r, kind, {
  covered = false, alpha = 1, selected = false, pop = 0,
} = {}) {
  const sym = SYMBOLS[kind] || SYMBOLS[0];
  const radius = TILE.radius * (r.h / TILE.h);
  const thick = Math.max(3, r.h * 0.07);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (pop > 0) {
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(1 + pop * 0.55, 1 + pop * 0.55);
    ctx.globalAlpha = alpha * (1 - pop);
    ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  }

  // 바닥 그림자 — 층이 떠 있다는 느낌은 거의 여기서 나온다
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(ctx, r.x + 3, r.y + thick + 4, r.w, r.h, radius);
  ctx.fill();
  ctx.restore();

  // 옆면
  roundRect(ctx, r.x, r.y + thick, r.w, r.h - thick, radius);
  ctx.fillStyle = covered ? '#7d8599' : '#a8a293';
  ctx.fill();

  // 윗면
  roundRect(ctx, r.x, r.y, r.w, r.h - thick, radius);
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  if (covered) {
    g.addColorStop(0, '#c2c9d8');
    g.addColorStop(1, '#9aa2b4');
  } else {
    g.addColorStop(0, '#f6f3ea');
    g.addColorStop(1, '#ddd8c8');
  }
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = covered ? 'rgba(30,36,52,0.5)' : 'rgba(70,80,104,0.55)';
  ctx.stroke();

  // 마작패처럼 얼굴을 한 단 파 넣는다 (더미의 3D 타일과 같은 인상)
  const pad = Math.max(3, r.w * 0.11);
  roundRect(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - thick - pad * 2, radius * 0.7);
  ctx.fillStyle = covered ? 'rgba(255,255,255,0.10)' : '#fffdf6';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(150,140,116,0.45)';
  ctx.stroke();

  // 무늬
  const cx = r.x + r.w / 2;
  const cy = r.y + (r.h - thick) / 2;
  const rad = Math.min(r.w, r.h - thick) * 0.29;
  ctx.save();
  if (covered) ctx.globalAlpha = ctx.globalAlpha * 0.82;
  else if (SETTINGS.glow) { ctx.shadowColor = sym.color; ctx.shadowBlur = 10; }
  drawSymbol(ctx, kind, cx, cy, rad, covered ? shade(sym.color) : sym.color);
  ctx.restore();

  if (covered) {
    roundRect(ctx, r.x, r.y, r.w, r.h - thick, radius);
    ctx.fillStyle = 'rgba(10,13,24,0.30)';
    ctx.fill();
  }

  if (selected) {
    roundRect(ctx, r.x - 2, r.y - 2, r.w + 4, r.h - thick + 4, radius + 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = sym.color;
    if (SETTINGS.glow) { ctx.shadowColor = sym.color; ctx.shadowBlur = 16; }
    ctx.stroke();
  }

  ctx.restore();
}

/** 덮인 타일의 무늬는 채도를 죽여 "지금은 못 집는다"를 색으로도 말한다. */
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const y = (r * 0.3 + g * 0.6 + b * 0.1);
  return `rgb(${Math.round((r + y) / 2.05)}, ${Math.round((g + y) / 2.05)}, ${Math.round((b + y) / 2.05)})`;
}

/** 빈 트레이 칸. */
export function drawSlot(ctx, r) {
  roundRect(ctx, r.x, r.y, r.w, r.h, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.stroke();
}
