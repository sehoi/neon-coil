// 2D 층 — 배경, 트레이 타일, 점수 뜨기. 더미(3D)는 pile3d.js 가 그린다.

import { W, H, SETTINGS } from '../config.js';
import { ANIM } from '../data/tuning.js';
import { drawTile } from './tiles.js';
import { trayTileRect } from './geom.js';
import { drawParticles } from './particles.js';
import { projectPoint } from './camera.js';

let bgCache = null;

/**
 * 배경은 한 번 그려 두고 매 프레임 복사한다.
 * 전면 그라디언트를 프레임마다 다시 칠하면 그것만으로 저사양 기기에서
 * 프레임을 다 먹는다 (실측: 캔버스 1440×2560 에서 15ms 이상).
 */
export function drawBackground(ctx) {
  const dw = ctx.canvas.width, dh = ctx.canvas.height;
  if (!bgCache || bgCache.width !== dw || bgCache.height !== dh) {
    bgCache = document.createElement('canvas');
    bgCache.width = dw;
    bgCache.height = dh;
    const c = bgCache.getContext('2d');
    c.setTransform(dw / W, 0, 0, dh / H, 0, 0);

    const g = c.createRadialGradient(W / 2, H * 0.38, 60, W / 2, H * 0.5, H * 0.8);
    g.addColorStop(0, '#12203a');
    g.addColorStop(1, '#05060d');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.globalAlpha = 0.05;
    c.strokeStyle = '#9bb0ff';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x < W; x += 80) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = 0; y < H; y += 80) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCache, 0, 0);
  ctx.restore();
}

/**
 * 트레이에 놓인 타일. 방금 집은 것은 더미에서 뽑힌 자리(3D)에서 날아온다 —
 * 그 자리를 월드 좌표로 들고 있다가 매 프레임 다시 투영하므로,
 * 더미가 무너져 화면이 흔들려도 출발점이 어긋나지 않는다.
 */
export function drawTrayTiles(ctx, session, cam) {
  session.tray.forEach((tile, i) => {
    const dest = trayTileRect(i);
    let r = dest;
    if (tile.anim && tile.pickedAt) {
      const from = projectPoint(cam, tile.pickedAt, {});
      if (from) {
        const k = easeOut(Math.min(1, tile.anim.t / tile.anim.dur));
        const w = dest.w * (0.55 + 0.45 * k), h = dest.h * (0.55 + 0.45 * k);
        r = {
          x: (from.x - w / 2) + (dest.x - (from.x - w / 2)) * k,
          y: (from.y - h / 2) + (dest.y - (from.y - h / 2)) * k - Math.sin(k * Math.PI) * 40,
          w, h,
        };
      }
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

function easeOut(k) {
  return 1 - Math.pow(1 - k, 3);
}
