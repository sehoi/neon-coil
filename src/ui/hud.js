// 인게임 오버레이: 길이 · 리더보드 · 미니맵 · 터치 버튼.
// 터치에서는 중요한 정보를 위쪽에 둔다 — 하단은 조이스틱과 부스트 버튼을 쥔 손에 가린다.

import * as cfg from '../config.js';
import { C, IS_TOUCH, TOUCH_UI } from '../config.js';
import { text, bar } from './widgets.js';
import { circle, disc, line } from '../render/shapes.js';
import { getTouchStick, isBoostHeld } from '../core/input.js';
import { ARENA_RADIUS, COIL, BOOST_ITEM } from '../data/tuning.js';
import { TAU } from '../core/vec.js';

export function renderHud(ctx, world) {
  const W = cfg.W, H = cfg.H;
  const p = world.player;

  // ── 좌상단: 점수 · 길이 · 순위 (상단 끝에 붙이면 노치에 잘린다) ──
  // 큰 숫자는 점수다. 길이는 600 에서 멈추지만 점수는 계속 오른다.
  const top = IS_TOUCH ? 60 : 46;
  text(ctx, `${p.score}`, 20, top, { size: 38, color: C.cyan, glow: 10 });
  text(ctx, '점수', 20, top + 20, { size: 13, color: C.dim });
  text(ctx, `길이 ${Math.floor(p.targetLen)}`, 76, top + 20, { size: 13, color: C.text });
  text(ctx, `${world.playerRank}위/${world.coils.length}`, 172, top + 20, {
    size: 13, color: C.text,
  });
  if (p.kills > 0) {
    text(ctx, `처치 ${p.kills}`, 252, top + 20, { size: 13, color: C.gold });
  }

  drawBoostStatus(ctx, p, top + 44);

  // 부스트 가능 여부 게이지 (데스크톱)
  if (!IS_TOUCH) {
    const ratio = Math.min(1, (p.targetLen - COIL.boostMinLen) / 60);
    bar(ctx, 20, top + 30, 150, 5, Math.max(0, ratio),
      p.targetLen > COIL.boostMinLen ? C.lime : C.red, '#141a30');
  }

  drawLeaderboard(ctx, world, W);
  drawMinimap(ctx, world, W, H);

  if (world.banner) {
    const a = Math.min(1, world.banner.life / 0.4);
    text(ctx, world.banner.text, W / 2, H * 0.30, {
      size: 30, align: 'center', color: C.mint, glow: 14, alpha: a,
    });
  }

  if (IS_TOUCH) {
    drawTouchControls(ctx, world);
    drawTouchStick(ctx);
  }
}

/**
 * 순위표. 각 코일의 색을 점으로 함께 보여준다 —
 * 이름만으로는 화면의 어느 코일인지 알 수 없다.
 */
function drawLeaderboard(ctx, world, W) {
  const right = W - 18;
  // 첫 줄을 화면 맨 위에 붙이면 노치·둥근 모서리에 잘린다. 넉넉히 내린다.
  let y = IS_TOUCH ? 52 : 40;
  text(ctx, '순위', right, y, { size: 12, align: 'right', color: C.dim });
  y += 22;

  for (let i = 0; i < world.leaders.length; i++) {
    const c = world.leaders[i];
    const me = c === world.player;

    // 색 점 — 화면의 어느 코일인지 바로 알 수 있게
    ctx.save();
    ctx.fillStyle = c.color;
    disc(ctx, right - 150, y - 4, 4.5);
    if (me) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      circle(ctx, right - 150, y - 4, 7);
    }
    ctx.restore();

    text(ctx, `${i + 1}`, right - 162, y, { size: 13, align: 'right', color: me ? C.cyan : C.dim });
    text(ctx, c.name, right - 138, y, {
      size: 14, color: me ? C.cyan : C.text, alpha: me ? 1 : 0.9,
    });
    text(ctx, `${c.score}`, right, y, {
      size: 14, align: 'right', color: me ? C.cyan : C.dim,
    });
    y += 20;
  }
}

function drawMinimap(ctx, world, W, H) {
  /*
   * 터치에서는 우하단이 가속 버튼 자리다.
   *
   * 예전에는 둘 다 우하단 모서리에 붙어 있었다 — 중심 거리 45px 에 반지름 합 114px,
   * 즉 미니맵이 버튼 안에 거의 통째로 들어가 있었다. 미니맵을 조금 줄여 버튼 **위**로
   * 올린다. 버튼은 엄지가 닿는 자리라 움직이면 안 되고, 미니맵은 눈으로만 보는 것이라
   * 어디든 갈 수 있다.
   */
  const r = IS_TOUCH ? 44 : 62;
  const cx = IS_TOUCH ? W - r - 22 : W - r - 20;
  const cy = IS_TOUCH
    ? TOUCH_UI.boostY - TOUCH_UI.boostR - 12 - r
    : H - r - 20;
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

/** 활성화된 강화 효과 — 남은 시간을 짧은 바로 보여준다 */
function drawBoostStatus(ctx, p, y) {
  const items = [
    { t: p.shieldT, max: BOOST_ITEM.shieldDuration, color: C.mint,   label: '차폐' },
    { t: p.surgeT,  max: BOOST_ITEM.surgeDuration,  color: C.orange, label: '과급' },
    { t: p.magnetT, max: BOOST_ITEM.magnetDuration, color: C.violet, label: '흡인' },
  ];
  let x = 20;
  for (const it of items) {
    if (it.t <= 0) continue;
    text(ctx, it.label, x, y, { size: 12, color: it.color });
    bar(ctx, x, y + 5, 52, 4, it.t / it.max, it.color, '#141a30');
    x += 64;
  }
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
