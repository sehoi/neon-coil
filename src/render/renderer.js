// 월드 렌더링.
//
// 성능의 핵심은 하나다 — **코일 몸통을 폴리라인 한 번의 stroke 로 그린다.**
// 세그먼트를 원으로 하나씩 그리면 코일 20기 × 400세그먼트 = 8,000 draw call 이다.
// 폴리라인이면 코일당 2회(외곽 번짐 + 코어), 총 40회로 끝난다.
//
// `shadowBlur` 는 쓰지 않는다 — 도형마다 블러 래스터화가 붙어 비용이 폭증한다.
// (NEON PURGE 실측: 185.9ms → 8.8ms)

import * as cfg from '../config.js';
import { C, SETTINGS, IS_TOUCH } from '../config.js';
import { camera, camOffsetX, camOffsetY } from '../game/camera.js';
import { particles } from '../game/particle.js';
import { polygon, circle, disc, line } from './shapes.js';
import { TAU } from '../core/vec.js';
import { ARENA_RADIUS, COIL } from '../data/tuning.js';
import { bodyCount, segIndex } from '../game/coil.js';

const MARGIN = 60;
const GRID_SIZE = IS_TOUCH ? 116 : 80;

let _lowDetail = false;
const DETAIL_THRESHOLD = IS_TOUCH ? 2600 : 5200;   // 화면 안 세그먼트 총합 기준

export function renderWorld(ctx, world) {
  const ox = camOffsetX();
  const oy = camOffsetY();
  const W = cfg.W, H = cfg.H;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, ox, oy, W, H);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const left = camera.x - W / 2 - MARGIN;
  const right = camera.x + W / 2 + MARGIN;
  const top = camera.y - H / 2 - MARGIN;
  const bottom = camera.y + H / 2 + MARGIN;

  drawBoundary(ctx);
  drawFood(ctx, world, left, right, top, bottom);

  // 화면 안 세그먼트 수를 세어 디테일 수준을 정한다
  _lowDetail = estimateVisibleSegments(world, left, right, top, bottom) > DETAIL_THRESHOLD;

  for (const c of world.coils) {
    if (c.alive) drawCoil(ctx, c, left, right, top, bottom, c === world.player);
  }
  drawParticles(ctx, left, right, top, bottom);

  ctx.globalAlpha = 1;
  ctx.restore();

  drawEdgeWarning(ctx, world, W, H);
}

function estimateVisibleSegments(world, left, right, top, bottom) {
  let n = 0;
  for (const c of world.coils) {
    if (!c.alive) continue;
    // 머리가 화면 근처면 몸통 상당수가 보인다고 본다 (정확한 계수보다 싸다)
    if (c.x > left - 900 && c.x < right + 900 && c.y > top - 900 && c.y < bottom + 900) {
      n += bodyCount(c);
    }
  }
  return n;
}

function drawGrid(ctx, ox, oy, W, H) {
  const px = (ox * 0.4) % GRID_SIZE;
  const py = (oy * 0.4) % GRID_SIZE;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let x = px - GRID_SIZE; x < W + GRID_SIZE; x += GRID_SIZE) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, H);
  }
  for (let y = py - GRID_SIZE; y < H + GRID_SIZE; y += GRID_SIZE) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  ctx.stroke();
}

function drawBoundary(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 26;
  circle(ctx, 0, 0, ARENA_RADIUS + 13);
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  circle(ctx, 0, 0, ARENA_RADIUS);
  ctx.restore();
}

/**
 * 코일 하나 = 폴리라인 stroke 2회.
 * 화면 밖 구간은 moveTo 로 건너뛴다 — 아레나가 화면보다 훨씬 크므로
 * 이 컬링이 없으면 대부분의 시간을 안 보이는 몸통에 쓴다.
 */
function drawCoil(ctx, c, left, right, top, bottom, isPlayer) {
  const n = bodyCount(c);
  if (n < 2) return;

  // LOD — 굵은 선이라 점을 걸러도 표가 안 난다
  const step = _lowDetail ? 3 : (n > 220 ? 2 : 1);

  ctx.beginPath();
  let penDown = false;
  for (let i = 0; i < n; i += step) {
    const idx = segIndex(c, i) * 2;
    const x = c.points[idx], y = c.points[idx + 1];
    const vis = x > left && x < right && y > top && y < bottom;
    if (vis) {
      if (penDown) ctx.lineTo(x, y);
      else { ctx.moveTo(x, y); penDown = true; }
    } else if (penDown) {
      ctx.lineTo(x, y);   // 한 점은 더 이어 화면 경계에서 잘리게 한다
      penDown = false;
    }
  }

  const w = c.radius * 2;
  ctx.strokeStyle = c.color;
  if (SETTINGS.glow && !_lowDetail) {
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = w * 1.9;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = w;
  ctx.stroke();

  // 밝은 심지 — 몸통이 통짜 색면으로 보이지 않게 한다
  if (!_lowDetail) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, w * 0.22);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawHead(ctx, c, isPlayer);
}

function drawHead(ctx, c, isPlayer) {
  const r = c.radius;
  ctx.fillStyle = c.color;
  disc(ctx, c.x, c.y, r * 1.08);

  // 눈 두 개 — 방향이 읽혀야 한다
  const ex = Math.cos(c.angle), ey = Math.sin(c.angle);
  const px = -ey, py = ex;
  const off = r * 0.45, fwd = r * 0.42, er = Math.max(1.6, r * 0.26);
  ctx.fillStyle = '#04060f';
  disc(ctx, c.x + ex * fwd + px * off, c.y + ey * fwd + py * off, er);
  disc(ctx, c.x + ex * fwd - px * off, c.y + ey * fwd - py * off, er);

  if (isPlayer) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    circle(ctx, c.x, c.y, r * 1.5);
    ctx.restore();
  }
  if (c.boosting) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c.color;
    disc(ctx, c.x - ex * r * 1.4, c.y - ey * r * 1.4, r * 0.9);
    ctx.restore();
  }
}

const _foodGroups = { bit: [], block: [], debris: [], leak: [] };

function drawFood(ctx, world, left, right, top, bottom) {
  for (const k in _foodGroups) _foodGroups[k].length = 0;
  world.food.forEach(f => {
    if (f.x > left && f.x < right && f.y > top && f.y < bottom) _foodGroups[f.kind].push(f);
  });

  for (const kind in _foodGroups) {
    const list = _foodGroups[kind];
    if (!list.length) continue;
    const col = list[0].color;

    if (SETTINGS.glow && !_lowDetail && kind !== 'bit') {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = col;
      for (const f of list) disc(ctx, f.x, f.y, f.r * 2.2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    for (const f of list) {
      const pulse = 1 + Math.sin(f.age * 5) * 0.12;
      disc(ctx, f.x, f.y, f.r * pulse);
    }
  }
}

function drawParticles(ctx, left, right, top, bottom) {
  particles.forEach(p => {
    if (p.x < left || p.x > right || p.y < top || p.y > bottom) return;
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a;
    if (p.kind === 'shard') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      polygon(ctx, p.x, p.y, p.r, 3, p.rot);
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 * a;
      circle(ctx, p.x, p.y, p.r);
    }
  });
  ctx.globalAlpha = 1;
}

/** 경계에 가까우면 화면 가장자리에 붉은 비네트 */
function drawEdgeWarning(ctx, world, W, H) {
  const p = world.player;
  if (!p.alive) return;
  const margin = ARENA_RADIUS - Math.hypot(p.x, p.y);
  if (margin > 500) return;
  const k = Math.min(1, (500 - margin) / 500);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, 'rgba(255,59,59,0)');
  g.addColorStop(1, `rgba(255,59,59,${(0.32 * k).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
