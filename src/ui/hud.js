// 인게임 오버레이: 길이 · 리더보드 · 미니맵 · 터치 버튼.
// 터치에서는 중요한 정보를 위쪽에 둔다 — 하단은 조이스틱과 부스트 버튼을 쥔 손에 가린다.

import * as cfg from '../config.js';
import { C, IS_TOUCH, TOUCH_UI } from '../config.js';
import { text, bar } from './widgets.js';
import { circle, disc, line } from '../render/shapes.js';
import { getTouchStick, isBoostHeld } from '../core/input.js';
import { ARENA_RADIUS, COIL } from '../data/tuning.js';
import { TAU } from '../core/vec.js';

export function renderHud(ctx, world) {
  const W = cfg.W, H = cfg.H;
  const p = world.player;

  // ── 좌상단: 길이 · 순위 ──
  text(ctx, `${Math.floor(p.len)}`, 20, IS_TOUCH ? 46 : 44, {
    size: 38, color: C.cyan, glow: 10,
  });
  text(ctx, '길이', 20, IS_TOUCH ? 66 : 64, { size: 13, color: C.dim });
  text(ctx, `${world.playerRank}위 / ${world.coils.length}`, 96, IS_TOUCH ? 66 : 64, {
    size: 14, color: C.text,
  });
  if (p.kills > 0) {
    text(ctx, `처치 ${p.kills}`, 190, IS_TOUCH ? 66 : 64, { size: 13, color: C.gold });
  }

  // 부스트 가능 여부 게이지 (데스크톱)
  if (!IS_TOUCH) {
    const ratio = Math.min(1, (p.len - COIL.boostMinLen) / 60);
    bar(ctx, 20, 76, 150, 6, Math.max(0, ratio), p.len > COIL.boostMinLen ? C.lime : C.red, '#141a30');
  }

  drawLeaderboard(ctx, world, W);
  drawMinimap(ctx, world, W, H);

  if (IS_TOUCH) {
    drawTouchControls(ctx, world);
    drawTouchStick(ctx);
  }
}

function drawLeaderboard(ctx, world, W) {
  const x = W - 18;
  let y = IS_TOUCH ? 34 : 32;
  text(ctx, '순위', x, y, { size: 13, align: 'right', color: C.dim });
  y += 20;
  for (let i = 0; i < world.leaders.length; i++) {
    const c = world.leaders[i];
    const me = c === world.player;
    text(ctx, `${i + 1}. ${c.name}`, x - 62, y, {
      size: 14, align: 'right', color: me ? C.cyan : C.text, alpha: me ? 1 : 0.85,
    });
    text(ctx, `${Math.floor(c.len)}`, x, y, {
      size: 14, align: 'right', color: me ? C.cyan : C.dim,
    });
    y += 19;
  }
}

function drawMinimap(ctx, world, W, H) {
  const r = IS_TOUCH ? 52 : 62;
  const cx = W - r - 20;
  const cy = H - r - 20;
  const scale = r / ARENA_RADIUS;

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#0a0e1e';
  disc(ctx, cx, cy, r);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 1.5;
  circle(ctx, cx, cy, r);

  // 상위 3기
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < Math.min(3, world.leaders.length); i++) {
    const c = world.leaders[i];
    if (c === world.player) continue;
    ctx.fillStyle = c.color;
    disc(ctx, cx + c.x * scale, cy + c.y * scale, 2.5);
  }

  const p = world.player;
  if (p.alive) {
    ctx.fillStyle = C.cyan;
    disc(ctx, cx + p.x * scale, cy + p.y * scale, 3.5);
  }
  ctx.restore();
}

/** 모바일 전용: 부스트 버튼 + 일시정지 버튼 */
function drawTouchControls(ctx, world) {
  const p = world.player;
  const ready = p.len > COIL.boostMinLen;
  const held = isBoostHeld();

  ctx.save();
  ctx.globalAlpha = held ? 0.5 : ready ? 0.3 : 0.14;
  ctx.fillStyle = C.lime;
  disc(ctx, TOUCH_UI.boostX, TOUCH_UI.boostY, TOUCH_UI.boostR);
  ctx.globalAlpha = ready ? 0.9 : 0.4;
  ctx.strokeStyle = C.lime;
  ctx.lineWidth = 2;
  circle(ctx, TOUCH_UI.boostX, TOUCH_UI.boostY, TOUCH_UI.boostR);
  ctx.restore();

  text(ctx, '가속', TOUCH_UI.boostX, TOUCH_UI.boostY, {
    size: 19, align: 'center', baseline: 'middle', color: ready ? C.text : C.dim,
  });

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = C.text;
  disc(ctx, TOUCH_UI.pauseX, TOUCH_UI.pauseY, TOUCH_UI.pauseR);
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 4;
  line(ctx, TOUCH_UI.pauseX - 6, TOUCH_UI.pauseY - 9, TOUCH_UI.pauseX - 6, TOUCH_UI.pauseY + 9);
  line(ctx, TOUCH_UI.pauseX + 6, TOUCH_UI.pauseY - 9, TOUCH_UI.pauseX + 6, TOUCH_UI.pauseY + 9);
  ctx.restore();
}

function drawTouchStick(ctx) {
  const s = getTouchStick();
  if (!s) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 2;
  circle(ctx, s.ox, s.oy, 60);
  const dx = s.x - s.ox, dy = s.y - s.oy;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(len, 60) / len;
  circle(ctx, s.ox + dx * k, s.oy + dy * k, 22);
  ctx.restore();
}
