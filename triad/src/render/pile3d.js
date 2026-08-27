// 3D 더미 그리기. z 버퍼 없이 면 단위 화가 알고리즘으로 뒤에서 앞으로 칠한다.
// 상자는 볼록하고 서로 거의 파고들지 않으므로 이 정도로 충분하다.
// (클릭 판정은 그림이 아니라 레이-상자 교차로 하므로, 정렬이 한두 번 틀려도
//  "보이는데 안 눌린다"는 일은 생기지 않는다.)

import { SETTINGS } from '../config.js';
import { blitFace } from '../data/faces.js';
import { toView, project } from './camera.js';

// 코너 인덱스: bit0 = +x, bit1 = +y, bit2 = +z
const FACES = [
  { idx: [4, 5, 7, 6], n: [0, 0, 1],  kind: 'front' },
  { idx: [1, 0, 2, 3], n: [0, 0, -1], kind: 'back' },
  { idx: [5, 1, 3, 7], n: [1, 0, 0],  kind: 'side' },
  { idx: [0, 4, 6, 2], n: [-1, 0, 0], kind: 'side' },
  { idx: [6, 7, 3, 2], n: [0, 1, 0],  kind: 'side' },
  { idx: [0, 1, 5, 4], n: [0, -1, 0], kind: 'side' },
];

const LIGHT = { x: -0.35, y: 0.86, z: 0.37 };

// 재사용 버퍼 — 프레임마다 새로 만들면 GC 가 끊긴다
const cornerBuf = [];
for (let i = 0; i < 8; i++) cornerBuf.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, ok: false });
const facePool = [];
let faceCount = 0;

function takeFace() {
  if (faceCount === facePool.length) {
    facePool.push({ depth: 0, kind: '', tile: null, shade: 1, px: [0, 0, 0, 0], py: [0, 0, 0, 0] });
  }
  return facePool[faceCount++];
}

/**
 * @param tiles  { body, kind, state } 목록 (state === 'pile' 인 것만 그린다)
 * @param hot    강조할 타일 (마우스가 올라간 것)
 */
export function drawPile(ctx, cam, tiles, hot = null) {
  faceCount = 0;
  const list = [];

  for (const tile of tiles) {
    if (tile.state !== 'pile') continue;
    const b = tile.body;
    const R = b.R;

    for (let i = 0; i < 8; i++) {
      const sx = (i & 1) ? b.hx : -b.hx;
      const sy = (i & 2) ? b.hy : -b.hy;
      const sz = (i & 4) ? b.hz : -b.hz;
      const c = cornerBuf[i];
      c.x = b.p.x + R[0] * sx + R[1] * sy + R[2] * sz;
      c.y = b.p.y + R[3] * sx + R[4] * sy + R[5] * sz;
      c.z = b.p.z + R[6] * sx + R[7] * sy + R[8] * sz;
      toView(cam, c, c2v);
      c.vz = c2v.z;
      const p = project(cam, c2v, c2s);
      c.ok = !!p;
      if (p) { c.sx = p.x; c.sy = p.y; }
    }

    for (const f of FACES) {
      // 면의 바깥 법선 (월드)
      const nx = R[0] * f.n[0] + R[1] * f.n[1] + R[2] * f.n[2];
      const ny = R[3] * f.n[0] + R[4] * f.n[1] + R[5] * f.n[2];
      const nz = R[6] * f.n[0] + R[7] * f.n[1] + R[8] * f.n[2];

      const c0 = cornerBuf[f.idx[0]], c1 = cornerBuf[f.idx[1]], c2 = cornerBuf[f.idx[2]], c3 = cornerBuf[f.idx[3]];
      if (!c0.ok || !c1.ok || !c2.ok || !c3.ok) continue;

      // 카메라를 등진 면은 버린다
      const mx = (c0.x + c2.x) / 2, my = (c0.y + c2.y) / 2, mz = (c0.z + c2.z) / 2;
      const toEye = (cam.eye.x - mx) * nx + (cam.eye.y - my) * ny + (cam.eye.z - mz) * nz;
      if (toEye <= 0) continue;

      const face = takeFace();
      face.depth = (c0.vz + c1.vz + c2.vz + c3.vz) / 4;   // 뷰 z 는 음수, 작을수록 멀다
      face.kind = f.kind;
      face.tile = tile;
      face.shade = 0.7 + 0.3 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
      face.px[0] = c0.sx; face.py[0] = c0.sy;
      face.px[1] = c1.sx; face.py[1] = c1.sy;
      face.px[2] = c2.sx; face.py[2] = c2.sy;
      face.px[3] = c3.sx; face.py[3] = c3.sy;
      list.push(face);
    }
  }

  list.sort((a, b) => a.depth - b.depth);      // 먼 것부터
  for (const f of list) paintFace(ctx, f, f.tile === hot);
  return list.length;
}

const c2v = { x: 0, y: 0, z: 0 };
const c2s = { x: 0, y: 0, d: 0 };

function paintFace(ctx, f, hot) {
  const { px, py } = f;
  quadPath(ctx, px, py);

  const s = f.shade;
  if (f.kind === 'front') ctx.fillStyle = rgb(243 * s, 239 * s, 227 * s);
  else if (f.kind === 'back') ctx.fillStyle = rgb(38 * s, 96 * s, 182 * s);
  else ctx.fillStyle = rgb(232 * s, 227 * s, 211 * s);
  ctx.fill();

  // 마작패의 얼굴은 테두리보다 한 단 들어가 있다. 그 턱이 보여야 패로 읽힌다.
  const area = quadArea(px, py);
  if (area > 90) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(24,28,40,0.5)';
    ctx.stroke();
  }
  if (f.kind === 'front') {
    if (area > 260) {
      inset(ctx, px, py, 0.13);
      ctx.fillStyle = rgb(255 * s, 253 * s, 246 * s);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(150,140,116,${0.5 * s})`;
      ctx.stroke();
    }
    drawFace(ctx, f);
  } else if (f.kind === 'back' && area > 260) {
    inset(ctx, px, py, 0.15);
    ctx.fillStyle = rgb(52 * s, 118 * s, 210 * s);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(12,40,90,${0.6 * s})`;
    ctx.stroke();

    ctx.save();
    setQuadTransform(ctx, f);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0.32, 0.5); ctx.lineTo(0.5, 0.32); ctx.lineTo(0.68, 0.5); ctx.lineTo(0.5, 0.68);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  if (hot) {
    quadPath(ctx, px, py);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#46f0d0';
    if (SETTINGS.glow) { ctx.shadowColor = '#46f0d0'; ctx.shadowBlur = 12; }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function quadPath(ctx, px, py) {
  ctx.beginPath();
  ctx.moveTo(px[0], py[0]);
  ctx.lineTo(px[1], py[1]);
  ctx.lineTo(px[2], py[2]);
  ctx.lineTo(px[3], py[3]);
  ctx.closePath();
}

/** 사각형을 중심 쪽으로 k 만큼 오므린 경로. */
function inset(ctx, px, py, k) {
  const cx = (px[0] + px[1] + px[2] + px[3]) / 4;
  const cy = (py[0] + py[1] + py[2] + py[3]) / 4;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x = cx + (px[i] - cx) * (1 - k);
    const y = cy + (py[i] - cy) * (1 - k);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function quadArea(px, py) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    a += px[i] * py[j] - px[j] * py[i];
  }
  return Math.abs(a) / 2;
}

function drawFace(ctx, f) {
  ctx.save();
  setQuadTransform(ctx, f);
  // 원근 왜곡은 면 안에서 무시한다. 타일이 작아 눈에 띄지 않는다.
  // multiply 로 얹으면 아래 깔린 음영이 그대로 무늬에도 먹는다.
  ctx.globalCompositeOperation = 'multiply';
  blitFace(ctx, f.tile.kind, 0.09, 0.09, 0.82, 0.82);
  ctx.restore();
}

/** 단위 정사각형을 투영된 사각형에 맞추는 아핀 변환. */
function setQuadTransform(ctx, f) {
  const { px, py } = f;
  const ux = px[1] - px[0], uy = py[1] - py[0];
  const vx = px[3] - px[0], vy = py[3] - py[0];
  ctx.transform(ux, uy, vx, vy, px[0], py[0]);
}

function rgb(r, g, b) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** 타일이 놓인 판 — 바닥과 테두리. */
export function drawTable(ctx, cam, halfX, halfZ) {
  const pts = [
    { x: -halfX, y: 0, z: -halfZ },
    { x: halfX, y: 0, z: -halfZ },
    { x: halfX, y: 0, z: halfZ },
    { x: -halfX, y: 0, z: halfZ },
  ].map(p => project(cam, toView(cam, p, {}), {}));
  if (pts.some(p => !p)) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();

  const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
  g.addColorStop(0, '#0b2620');
  g.addColorStop(1, '#071a1c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(70,240,208,0.35)';
  if (SETTINGS.glow) { ctx.shadowColor = 'rgba(70,240,208,0.5)'; ctx.shadowBlur = 16; }
  ctx.stroke();
  ctx.restore();
}
