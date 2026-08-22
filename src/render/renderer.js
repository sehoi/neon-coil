// 월드 렌더링.
//
// 성능의 핵심은 하나다 — **코일 몸통을 폴리라인 한 번의 stroke 로 그린다.**
// 세그먼트를 원으로 하나씩 그리면 코일 15기 × 400세그먼트 = 6,000 draw call 이다.
// 폴리라인이면 코일당 2회(외곽 번짐 + 코어), 총 30회로 끝난다.
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
  _pulseT = world.t;
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

  const leader = world.leaders.length ? world.leaders[0] : null;
  for (const c of world.coils) {
    if (c.alive) drawCoil(ctx, c, left, right, top, bottom, c === world.player, c === leader);
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
function drawCoil(ctx, c, left, right, top, bottom, isPlayer, isLeader) {
  const n = bodyCount(c);
  if (n < 2) return;

  /*
   * LOD — 점을 걸러도 몸통이 끊기지 않는다.
   * 폴리라인 stroke 는 점 사이를 선폭 2r 로 이어주므로, 점 간격이 벌어져도
   * 구멍이 생기는 게 아니라 곡선 모서리만 살짝 잘린다. 세그먼트 간격이 0.55r 이니
   * step 4 라도 현(弦)이 2.2r — 굵은 네온 선에서는 눈에 띄지 않는다.
   */
  const step = _lowDetail ? 4 : (n > 220 ? 2 : 1);

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

  // 1위는 몸 전체에 금빛 외곽을 두른다 — 화면에서 누가 선두인지 바로 읽혀야 한다.
  // 선폭이 몸통의 2.3배라 화면을 가장 많이 칠하는 stroke 다. 혼잡할 때는 접는다
  // (머리 위 왕관은 그대로 남으니 선두는 여전히 알아볼 수 있다).
  if (isLeader && !_lowDetail) {
    ctx.strokeStyle = C.gold;
    ctx.globalAlpha = 0.30 + Math.sin(_pulseT * 4) * 0.12;
    ctx.lineWidth = w * 2.3;
    ctx.stroke();
  }

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

  drawHead(ctx, c, isPlayer, isLeader);
}

/** 1위 표식의 맥동 위상 — 프레임마다 갱신 */
let _pulseT = 0;

function drawHead(ctx, c, isPlayer, isLeader) {
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

  // 1위 왕관 — 머리 위 삼각 뿔 세 개
  if (isLeader) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = C.gold;
    ctx.fillStyle = C.gold;
    ctx.lineWidth = 2;
    const cy = c.y - r * 2.1;
    const cw = r * 1.15;
    ctx.beginPath();
    ctx.moveTo(c.x - cw, cy + r * 0.5);
    ctx.lineTo(c.x - cw * 0.62, cy - r * 0.35);
    ctx.lineTo(c.x - cw * 0.24, cy + r * 0.16);
    ctx.lineTo(c.x, cy - r * 0.62);
    ctx.lineTo(c.x + cw * 0.24, cy + r * 0.16);
    ctx.lineTo(c.x + cw * 0.62, cy - r * 0.35);
    ctx.lineTo(c.x + cw, cy + r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 차폐 — 한 번은 버틴다는 걸 보여줘야 한다
  if (c.shieldT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(c.shieldT * 9) * 0.2;
    ctx.strokeStyle = C.mint;
    ctx.lineWidth = 3;
    circle(ctx, c.x, c.y, r * 2.1);
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

const _foodGroups = { bit: [], block: [], debris: [], leak: [], shield: [], surge: [], magnet: [] };

/** 열린 경로에 원 하나를 더한다 (moveTo 로 끊어야 이전 원과 선으로 이어지지 않는다) */
function addCircle(ctx, x, y, r) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

// 강화 아이템 기호 — 먹이(단순한 원)와 한눈에 구분되어야 한다
const BOOST_SYMBOL = {
  shield: (ctx, x, y, u) => {   // 방패
    ctx.beginPath();
    ctx.moveTo(x, y - u);
    ctx.lineTo(x + u * 0.78, y - u * 0.4);
    ctx.lineTo(x + u * 0.6, y + u * 0.72);
    ctx.lineTo(x, y + u);
    ctx.lineTo(x - u * 0.6, y + u * 0.72);
    ctx.lineTo(x - u * 0.78, y - u * 0.4);
    ctx.closePath();
    ctx.fill();
  },
  surge: (ctx, x, y, u) => {    // 번개
    ctx.beginPath();
    ctx.moveTo(x + u * 0.2, y - u);
    ctx.lineTo(x - u * 0.65, y + u * 0.12);
    ctx.lineTo(x - u * 0.05, y + u * 0.12);
    ctx.lineTo(x - u * 0.2, y + u);
    ctx.lineTo(x + u * 0.65, y - u * 0.12);
    ctx.lineTo(x + u * 0.05, y - u * 0.12);
    ctx.closePath();
    ctx.fill();
  },
  magnet: (ctx, x, y, u) => {   // 안쪽을 향한 화살표들
    ctx.lineWidth = u * 0.34;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const cx = Math.cos(a), cy = Math.sin(a);
      ctx.moveTo(x + cx * u, y + cy * u);
      ctx.lineTo(x + cx * u * 0.3, y + cy * u * 0.3);
    }
    ctx.stroke();
  },
};

// 화면 판정 콜백은 고정 — 먹이가 1000개 단위라 프레임마다 클로저를 만들 이유가 없다
let _vl = 0, _vr = 0, _vt = 0, _vb = 0;

function _groupCb(f) {
  if (f.x > _vl && f.x < _vr && f.y > _vt && f.y < _vb) _foodGroups[f.kind].push(f);
}

function drawFood(ctx, world, left, right, top, bottom) {
  for (const k in _foodGroups) _foodGroups[k].length = 0;
  _vl = left; _vr = right; _vt = top; _vb = bottom;
  world.food.forEach(_groupCb);

  /*
   * 같은 색끼리 **경로 하나에 모아 한 번만 fill 한다.**
   * 예전에는 먹이 하나마다 beginPath+arc+fill 이었다 — 화면에 400개면 fill 400회,
   * 글로우까지 켜면 800회다. 종류별로 색이 하나뿐이라 묶는 데 아무 손해가 없다.
   */
  for (const kind in _foodGroups) {
    const list = _foodGroups[kind];
    if (!list.length) continue;
    const col = list[0].color;
    const symbol = BOOST_SYMBOL[kind];

    if (SETTINGS.glow && !_lowDetail && kind !== 'bit') {
      ctx.globalAlpha = symbol ? 0.3 : 0.2;
      ctx.fillStyle = col;
      ctx.beginPath();
      for (const f of list) addCircle(ctx, f.x, f.y, f.r * (symbol ? 2.6 : 2.2));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const f of list) {
      const pulse = 1 + Math.sin(f.age * (symbol ? 7 : 5)) * 0.12;
      addCircle(ctx, f.x, f.y, f.r * pulse);
    }
    ctx.fill();

    // 강화 아이템은 안에 기호를 파낸다
    if (symbol) {
      ctx.fillStyle = '#04060f';
      ctx.strokeStyle = '#04060f';
      ctx.lineCap = 'round';
      for (const f of list) symbol(ctx, f.x, f.y, f.r * 0.62);
    }
  }
}

let _pctx = null;

function _particleCb(p) {
  if (p.x < _vl || p.x > _vr || p.y < _vt || p.y > _vb) return;
  const ctx = _pctx;
  const a = p.life / p.maxLife;
  ctx.globalAlpha = a;
  ctx.strokeStyle = p.color;
  if (p.kind === 'shard') {
    ctx.lineWidth = 2;
    polygon(ctx, p.x, p.y, p.r, 3, p.rot);
  } else {
    ctx.lineWidth = 2 * a;
    circle(ctx, p.x, p.y, p.r);
  }
}

function drawParticles(ctx, left, right, top, bottom) {
  _pctx = ctx;
  _vl = left; _vr = right; _vt = top; _vb = bottom;
  particles.forEach(_particleCb);
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
