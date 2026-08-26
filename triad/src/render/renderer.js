// 판·트레이 그리기. 상태를 바꾸지 않는다 — 애니메이션 시간은 session 이 갖고 있고
// 여기서는 그 시간으로 위치만 보간한다.

import { W, H, LAYOUT, SETTINGS } from '../config.js';
import { ANIM, TILE } from '../data/tuning.js';
import { SYMBOLS } from '../data/symbols.js';
import { drawTile } from './tiles.js';
import { boardView, rectOf, tileRect, drawOrder, trayTileRect } from './geom.js';
import { drawParticles } from './particles.js';

export function drawBackground(ctx, t) {
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.5, H * 0.78);
  g.addColorStop(0, '#14203a');
  g.addColorStop(1, '#05060d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 옅은 격자 — 배경이 완전히 비면 타일이 떠 있는 느낌이 안 난다
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#9bb0ff';
  ctx.lineWidth = 1;
  const step = 80;
  const drift = (t * 8) % step;
  ctx.beginPath();
  for (let x = -step + drift; x < W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -step + drift; y < H + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();
}

export function drawBoard(ctx, session, view, hoverTile) {
  for (const tile of drawOrder(session.board)) {
    const r = rectOf(view, tile);
    drawTile(ctx, r, tile.kind, {
      covered: tile.blockedBy > 0,
      selected: tile === hoverTile && tile.blockedBy === 0,
      shake: tile.shake || 0,
    });
  }
}

export function drawTrayTiles(ctx, session, view) {
  session.tray.forEach((tile, i) => {
    const dest = trayTileRect(i);
    let r = dest;
    if (tile.anim) {
      const k = easeOut(Math.min(1, tile.anim.t / tile.anim.dur));
      const from = tileRect(view, tile.anim.from.cx, tile.anim.from.cy, tile.anim.from.layer);
      r = {
        x: from.x + (dest.x - from.x) * k,
        y: from.y + (dest.y - from.y) * k - Math.sin(k * Math.PI) * 46,
        w: from.w + (dest.w - from.w) * k,
        h: from.h + (dest.h - from.h) * k,
      };
    }
    drawTile(ctx, r, tile.kind, {});
  });

  for (const p of session.popping) {
    const k = Math.min(1, p.t / ANIM.pop);
    drawTile(ctx, trayTileRect(p.slot), p.tile.kind, { pop: k });
  }

  drawParticles(ctx);
}

/** 매치가 터진 자리 (파티클을 뿌릴 좌표). */
export function trayBurstPoint(slot) {
  const r = trayTileRect(slot);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function drawComboFloat(ctx, floats) {
  for (const f of floats) {
    const k = f.t / f.dur;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.font = '700 30px ui-monospace, monospace';
    ctx.textAlign = 'center';
    if (SETTINGS.glow) { ctx.shadowColor = f.color; ctx.shadowBlur = 12; }
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - k * 60);
    ctx.restore();
  }
}

export { boardView };

function easeOut(k) {
  return 1 - Math.pow(1 - k, 3);
}
