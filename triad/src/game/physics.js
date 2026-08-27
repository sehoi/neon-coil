// 박스 강체 물리. 라이브러리 없이 XPBD(확장 위치 기반 동역학)로 쓴다.
//
// 왜 XPBD 인가: 마작패처럼 납작한 박스가 여러 겹으로 쌓이면 속도 기반 솔버는
// 떨림이 남는다. 위치를 직접 고치고 서브스텝을 잘게 쪼개면 반복 횟수가 1회여도
// 더미가 조용히 선다. (Müller 외, Detailed Rigid Body Simulation with XPBD)
//
// 접촉은 스텝당 한 번 만들고(SAT + 면 클리핑), 서브스텝마다 파고든 깊이만 다시 잰다.

import {
  v3, add, sub, scale, dot, cross, len2, norm,
  qMul, qNorm, qIntegrate, mat3, qToMat, mApply, mApplyT, axis,
} from '../core/v3.js';

const MARGIN = 0.06;        // 이 거리 안이면 접촉 후보로 잡는다 (관통 예방)
const MAX_PUSH = 0.12;      // 서브스텝 한 번에 밀어내는 최대 거리
const MU = 0.72;            // 정지 마찰 계수
// 속도 보정은 한 번으로 부족하다. 한 쌍에 접점이 넷이면 서로 물려서
// 한 바퀴로는 상대 속도가 남고, 그 잔량이 더미를 계속 흔든다.
const VEL_ITERS = 4;
const SLEEP_LIN = 0.13;     // 이 이하로 느려지고
const SLEEP_ANG = 0.32;
const SLEEP_TIME = 0.3;    // 이만큼 유지되면 잔다

let nextId = 1;

export function createWorld({ halfX = 4, halfZ = 5, gravity = -26, substeps = 6 } = {}) {
  return {
    bodies: [],
    halfX, halfZ,
    gravity,
    substeps,
    contacts: [],
    asleep: false,
    quietT: 0,
    steps: 0,
  };
}

export function addBody(world, { p, q, hx, hy, hz, density = 1 }) {
  const m = 8 * hx * hy * hz * density;
  const ex = 2 * hx, ey = 2 * hy, ez = 2 * hz;
  const body = {
    id: nextId++,
    p, q,
    v: v3(), w: v3(),
    hx, hy, hz,
    invM: 1 / m,
    invI: v3(
      12 / (m * (ey * ey + ez * ez)),
      12 / (m * (ex * ex + ez * ez)),
      12 / (m * (ex * ex + ey * ey)),
    ),
    R: mat3(),
    prevP: v3(), prevQ: { x: 0, y: 0, z: 0, w: 1 },
    sleeping: false,
    sleepT: 0,
  };
  qToMat(body.q, body.R);
  world.bodies.push(body);
  world.asleep = false;
  return body;
}

/** 더미가 사실상 멈췄을 때 게임이 강제로 끄는 스위치. 계산을 끝낸다. */
export function freeze(world) {
  for (const b of world.bodies) {
    b.v.x = b.v.y = b.v.z = 0;
    b.w.x = b.w.y = b.w.z = 0;
    b.sleeping = true;
    b.sleepT = SLEEP_TIME;
  }
  world.asleep = true;
}

export function removeBody(world, body) {
  const i = world.bodies.indexOf(body);
  if (i >= 0) world.bodies.splice(i, 1);
  wakeAll(world, body.p, 3.2);
}

export function wake(body) {
  if (!body.sleeping) return;
  body.sleeping = false;
  // sleepT 은 일부러 안 지운다. 옆 타일 때문에 깨어난 것뿐이면 다음 스텝에
  // 바로 다시 자야 한다. 여기서 0 으로 되돌리면 더미가 영영 잠들지 못한다.
  // 서브스텝 중간에 깨어나면 prev 는 옛날 값이다. 그대로 두면
  // v = (p - prevP)/h 가 터무니없이 커져 더미가 폭발한다.
  body.prevP.x = body.p.x; body.prevP.y = body.p.y; body.prevP.z = body.p.z;
  body.prevQ.x = body.q.x; body.prevQ.y = body.q.y; body.prevQ.z = body.q.z; body.prevQ.w = body.q.w;
}

/** 반경 안의 물체를 깨운다. 타일을 들어내면 그 위가 무너져야 한다. */
export function wakeAll(world, at, radius) {
  const r2 = radius * radius;
  for (const b of world.bodies) {
    if (len2(sub(b.p, at)) < r2) { wake(b); b.sleepT = 0; }
  }
  world.asleep = false;
  world.quietT = 0;
}

export function step(world, dt) {
  if (world.asleep) return false;

  const n = world.substeps;
  const h = dt / n;
  const bodies = world.bodies;

  for (const b of bodies) qToMat(b.q, b.R);

  // 어떤 쌍을 볼지는 스텝당 한 번만 고른다(AABB 스윕). 실제 접촉면은
  // 서브스텝마다 다시 만든다 — 앵커를 한 스텝 내내 고정하면 그게 핀처럼 작용해
  // 더미에 에너지를 계속 밀어 넣는다. 이것 하나로 잔떨림이 한 자릿수로 준다.
  const pairs = broadphase(world);
  let contacts = narrowphase(world, pairs);
  world.contacts = contacts;

  for (let s = 0; s < n; s++) {
    if (s > 0) { contacts = narrowphase(world, pairs); world.contacts = contacts; }
    for (const b of bodies) {
      if (b.sleeping) continue;
      b.prevP.x = b.p.x; b.prevP.y = b.p.y; b.prevP.z = b.p.z;
      b.prevQ.x = b.q.x; b.prevQ.y = b.q.y; b.prevQ.z = b.q.z; b.prevQ.w = b.q.w;

      b.v.y += world.gravity * h;
      b.p.x += b.v.x * h; b.p.y += b.v.y * h; b.p.z += b.v.z * h;
      qIntegrate(b.q, b.w, h);
      qToMat(b.q, b.R);
    }

    for (const c of contacts) solveContact(c);

    for (const b of bodies) {
      if (b.sleeping) continue;
      b.v.x = (b.p.x - b.prevP.x) / h;
      b.v.y = (b.p.y - b.prevP.y) / h;
      b.v.z = (b.p.z - b.prevP.z) / h;

      // Δq = q · prevQ⁻¹ → ω = 2 Δq.xyz / h
      const pq = b.prevQ;
      const dq = qMul(b.q, { x: -pq.x, y: -pq.y, z: -pq.z, w: pq.w });
      const s2 = (dq.w >= 0 ? 2 : -2) / h;
      b.w.x = dq.x * s2; b.w.y = dq.y * s2; b.w.z = dq.z * s2;
    }

    // 속도 보정. 위치를 밀어내면 그만큼이 그대로 속도가 되는데(v = Δp/h),
    // 깊이 박힌 타일에서는 그 값이 수십 u/s 라 더미가 폭발한다.
    // 반발이 없는 물체이므로 접촉면에서 멀어지는 속도를 0 으로 깎는다.
    for (let k = 0; k < VEL_ITERS; k++) for (const c of contacts) solveContactVelocity(c);
    if (globalThis.__PDBG2) {
      console.log('  sub', s, bodies.map(b => `y=${b.p.y.toFixed(3)} v=${b.v.y.toFixed(2)} w=${Math.hypot(b.w.x,b.w.y,b.w.z).toFixed(2)}`).join(' | '),
        'lam=' + contacts.map(c => c.lambda.toFixed(3)).join(','));
    }
  }

  // 감쇠
  for (const b of bodies) {
    if (b.sleeping) continue;
    b.v.x *= 0.995; b.v.y *= 0.995; b.v.z *= 0.995;
    b.w.x *= 0.97; b.w.y *= 0.97; b.w.z *= 0.97;

    // 더미가 다 무너진 뒤에도 타일들이 아주 느리게 기어다닌다. 눈에는 안 보이지만
    // 그 때문에 영영 잠들지 않으므로, 느린 것은 더 세게 잡아 세운다.
    if (len2(b.v) < 0.12 && len2(b.w) < 0.5) {
      b.v.x *= 0.82; b.v.y *= 0.82; b.v.z *= 0.82;
      b.w.x *= 0.82; b.w.y *= 0.82; b.w.z *= 0.82;
    }
  }

  // 재우기. 잠든 타일도 옆에서 깨어난 타일이 닿으면 브로드페이즈가 깨우므로,
  // 개별로 재워도 무리가 어긋나지 않는다. 대신 sleepT 은 깨어날 때 지우지 않는다 —
  // 지우면 더미 하나가 계속 뒤척이는 동안 나머지도 영영 못 잔다.
  // 더미 전체가 거의 멈췄으면 통째로 재운다. 한두 장이 문턱 언저리에서
  // 하염없이 뒤척이는 동안 프레임마다 수 ms 를 쓰는 것을 막는다.
  let maxV = 0, maxW = 0;
  for (const b of bodies) {
    if (b.sleeping) continue;
    maxV = Math.max(maxV, len2(b.v));
    maxW = Math.max(maxW, len2(b.w));
  }
  world.quietT = (maxV < 0.02 && maxW < 0.1) ? world.quietT + dt : 0;
  const forceSleep = world.quietT > 1.2;

  let allAsleep = true;
  for (const b of bodies) {
    if (b.sleeping) continue;
    const still = len2(b.v) < SLEEP_LIN * SLEEP_LIN && len2(b.w) < SLEEP_ANG * SLEEP_ANG;
    b.sleepT = still ? b.sleepT + dt : 0;
    if (forceSleep || b.sleepT > SLEEP_TIME) {
      b.sleeping = true;
      b.v.x = b.v.y = b.v.z = 0;
      b.w.x = b.w.y = b.w.z = 0;
    } else {
      allAsleep = false;
    }
  }
  world.asleep = allAsleep;
  world.steps++;
  return true;
}

// ── 접촉 만들기 ───────────────────────────────────────────────────────────

function aabb(b) {
  const R = b.R;
  const rx = Math.abs(R[0]) * b.hx + Math.abs(R[1]) * b.hy + Math.abs(R[2]) * b.hz;
  const ry = Math.abs(R[3]) * b.hx + Math.abs(R[4]) * b.hy + Math.abs(R[5]) * b.hz;
  const rz = Math.abs(R[6]) * b.hx + Math.abs(R[7]) * b.hy + Math.abs(R[8]) * b.hz;
  return { minX: b.p.x - rx, maxX: b.p.x + rx, ry, rz, minY: b.p.y - ry, maxY: b.p.y + ry, minZ: b.p.z - rz, maxZ: b.p.z + rz };
}

/** 로컬 코너 8개를 월드로. */
export function corners(b, out = []) {
  const R = b.R;
  for (let i = 0; i < 8; i++) {
    const sx = (i & 1) ? 1 : -1, sy = (i & 2) ? 1 : -1, sz = (i & 4) ? 1 : -1;
    const lx = sx * b.hx, ly = sy * b.hy, lz = sz * b.hz;
    out[i] = {
      x: b.p.x + R[0] * lx + R[1] * ly + R[2] * lz,
      y: b.p.y + R[3] * lx + R[4] * ly + R[5] * lz,
      z: b.p.z + R[6] * lx + R[7] * ly + R[8] * lz,
      lx, ly, lz,
    };
  }
  return out;
}

function broadphase(world) {
  const boxes = [];
  for (const b of world.bodies) boxes.push(aabb(b));
  const order = world.bodies.map((_, i) => i).sort((a, b) => boxes[a].minX - boxes[b].minX);
  const pairs = [];
  for (let ii = 0; ii < order.length; ii++) {
    const i = order[ii], A = boxes[i];
    for (let jj = ii + 1; jj < order.length; jj++) {
      const j = order[jj], B = boxes[j];
      if (B.minX > A.maxX) break;
      if (A.minY > B.maxY || B.minY > A.maxY || A.minZ > B.maxZ || B.minZ > A.maxZ) continue;
      const a = world.bodies[i], b = world.bodies[j];
      if (a.sleeping && b.sleeping) continue;
      if (a.sleeping) wake(a);
      if (b.sleeping) wake(b);
      pairs.push(a, b);
    }
  }
  return pairs;
}

// 접촉 객체는 재사용한다. 서브스텝마다 새로 만들면 GC 가 프레임을 잡아먹는다.
const pool = [];
let poolUsed = 0;

function takeContact() {
  if (poolUsed === pool.length) {
    pool.push({
      A: null, B: null,
      ra: { x: 0, y: 0, z: 0 },
      rb: { x: 0, y: 0, z: 0 },
      n: { x: 0, y: 0, z: 0 },
      plane: 0, lambda: 0,
    });
  }
  const c = pool[poolUsed++];
  c.lambda = 0;
  return c;
}

const cornerScratch = [];
for (let i = 0; i < 8; i++) cornerScratch.push({ x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 });

function narrowphase(world, pairs) {
  poolUsed = 0;
  const out = [];

  // 바닥과 벽 — 코너별로. 빠른 물체는 그만큼 여유를 더 준다(지나침 방지).
  for (const b of world.bodies) {
    if (b.sleeping) continue;
    const m = MARGIN + Math.sqrt(len2(b.v)) * 0.02;
    const R = b.R;
    const rx = Math.abs(R[0]) * b.hx + Math.abs(R[1]) * b.hy + Math.abs(R[2]) * b.hz;
    const ry = Math.abs(R[3]) * b.hx + Math.abs(R[4]) * b.hy + Math.abs(R[5]) * b.hz;
    const rz = Math.abs(R[6]) * b.hx + Math.abs(R[7]) * b.hy + Math.abs(R[8]) * b.hz;
    if (b.p.y - ry > m &&
        b.p.x - rx > -world.halfX + m && b.p.x + rx < world.halfX - m &&
        b.p.z - rz > -world.halfZ + m && b.p.z + rz < world.halfZ - m) continue;

    corners(b, cornerScratch);
    for (const c of cornerScratch) {
      if (c.y < m) planeContact(out, b, c, 0, 1, 0, 0);
      if (c.x > world.halfX - m) planeContact(out, b, c, -1, 0, 0, -world.halfX);
      if (c.x < -world.halfX + m) planeContact(out, b, c, 1, 0, 0, -world.halfX);
      if (c.z > world.halfZ - m) planeContact(out, b, c, 0, 0, -1, -world.halfZ);
      if (c.z < -world.halfZ + m) planeContact(out, b, c, 0, 0, 1, -world.halfZ);
    }
  }

  for (let i = 0; i < pairs.length; i += 2) collideBoxes(pairs[i], pairs[i + 1], out);
  return out;
}

/** 무한 평면 접촉. dot(x, n) >= d0 인 쪽이 안쪽이다. */
function planeContact(out, b, corner, nx, ny, nz, d0) {
  const c = takeContact();
  c.A = null; c.B = b; c.plane = d0;
  c.rb.x = corner.lx; c.rb.y = corner.ly; c.rb.z = corner.lz;
  c.n.x = nx; c.n.y = ny; c.n.z = nz;
  out.push(c);
}

// ── SAT + 면 클리핑 ───────────────────────────────────────────────────────

const EPS = 1e-6;

function collideBoxes(a, b, out) {
  const ha = [a.hx, a.hy, a.hz], hb = [b.hx, b.hy, b.hz];
  const t = sub(b.p, a.p);

  let best = Infinity, bestType = -1, bestIdx = -1, bestSign = 1;

  // A 의 면 3개
  for (let i = 0; i < 3; i++) {
    const L = axis(a.R, i);
    const d = dot(t, L);
    const ra = ha[i];
    const rb = project(b, hb, L);
    const ov = ra + rb - Math.abs(d);
    if (ov < 0) return;
    if (ov < best - EPS) { best = ov; bestType = 0; bestIdx = i; bestSign = d >= 0 ? 1 : -1; }
  }
  // B 의 면 3개
  for (let i = 0; i < 3; i++) {
    const L = axis(b.R, i);
    const d = dot(t, L);
    const ra = project(a, ha, L);
    const rb = hb[i];
    const ov = ra + rb - Math.abs(d);
    if (ov < 0) return;
    if (ov < best - EPS) { best = ov; bestType = 1; bestIdx = i; bestSign = d >= 0 ? 1 : -1; }
  }
  // 모서리 × 모서리 9개
  let edgeBest = Infinity, ei = -1, ej = -1, eSign = 1, eAxis = null;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const L0 = cross(axis(a.R, i), axis(b.R, j));
      const l2 = len2(L0);
      if (l2 < 1e-8) continue;               // 평행한 축은 면 검사에서 이미 걸렀다
      const L = scale(L0, 1 / Math.sqrt(l2));
      const d = dot(t, L);
      const ov = project(a, ha, L) + project(b, hb, L) - Math.abs(d);
      if (ov < 0) return;
      if (ov < edgeBest) { edgeBest = ov; ei = i; ej = j; eSign = d >= 0 ? 1 : -1; eAxis = L; }
    }
  }

  if (globalThis.__PDBG) console.log('SAT', {best, bestType, bestIdx, bestSign, edgeBest, ei, ej});
  // 모서리 접촉은 수치적으로 예민하다. 면 축과 비슷하면 면 쪽을 택한다.
  if (edgeBest < best * 0.92) {
    edgeContact(a, b, ei, ej, eAxis, eSign, out);
    return;
  }

  const ref = bestType === 0 ? a : b;
  const inc = bestType === 0 ? b : a;
  const before = out.length;
  faceContacts(ref, inc, bestIdx, bestType === 0 ? bestSign : -bestSign, out);
  if (globalThis.__PDBG) console.log('  faceContacts ->', out.length - before);
}

function project(b, h, L) {
  const R = b.R;
  return h[0] * Math.abs(R[0] * L.x + R[3] * L.y + R[6] * L.z)
       + h[1] * Math.abs(R[1] * L.x + R[4] * L.y + R[7] * L.z)
       + h[2] * Math.abs(R[2] * L.x + R[5] * L.y + R[8] * L.z);
}

/**
 * 기준면(ref 의 i 축 ±)에 상대 박스의 면을 잘라 붙인다.
 * 계산은 ref 의 로컬 좌표에서 한다 — 그러면 기준면이 축에 정렬된 사각형이라 자르기가 쉽다.
 */
function faceContacts(ref, inc, ai, sign, out) {
  const hRef = [ref.hx, ref.hy, ref.hz];
  const hInc = [inc.hx, inc.hy, inc.hz];
  const u = (ai + 1) % 3, v = (ai + 2) % 3;

  // ref 로컬에서 본 inc 의 회전/위치
  const nLocal = [0, 0, 0]; nLocal[ai] = sign;
  const nWorld = scale(axis(ref.R, ai), sign);

  // inc 의 어느 면이 가장 마주 보는가
  let bi = 0, bDot = 0, bSign = 1;
  for (let i = 0; i < 3; i++) {
    const d = dot(axis(inc.R, i), nWorld);
    if (Math.abs(d) > Math.abs(bDot)) { bDot = d; bi = i; }
  }
  bSign = bDot > 0 ? -1 : 1;      // 마주 보려면 반대 방향 면

  // inc 면의 코너 4개 (inc 로컬 → 월드 → ref 로컬)
  const iu = (bi + 1) % 3, iv = (bi + 2) % 3;
  const poly = [];
  for (let k = 0; k < 4; k++) {
    const su = (k === 0 || k === 3) ? -1 : 1;
    const sv = (k < 2) ? -1 : 1;
    const l = [0, 0, 0];
    l[bi] = bSign * hInc[bi];
    l[iu] = su * hInc[iu];
    l[iv] = sv * hInc[iv];
    const world = add(inc.p, mApply(inc.R, { x: l[0], y: l[1], z: l[2] }));
    const rl = mApplyT(ref.R, sub(world, ref.p));
    poly.push({ a: [rl.x, rl.y, rl.z], inc: [l[0], l[1], l[2]] });
  }

  // 기준면 사각형으로 자른다 (Sutherland-Hodgman, u/v 두 축 각각 양쪽)
  let clipped = poly;
  for (const [axisIdx, half] of [[u, hRef[u]], [v, hRef[v]]]) {
    clipped = clipAxis(clipped, axisIdx, half, 1);
    clipped = clipAxis(clipped, axisIdx, half, -1);
    if (!clipped.length) return;
  }

  // 깊이 순으로 최대 4점
  const pts = [];
  for (const pt of clipped) {
    const sep = sign * pt.a[ai] - hRef[ai];
    if (sep > MARGIN) continue;
    pts.push({ pt, sep });
  }
  if (!pts.length) return;
  pts.sort((x, y) => x.sep - y.sep);

  for (let k = 0; k < Math.min(4, pts.length); k++) {
    const { pt } = pts[k];
    const raLocal = [pt.a[0], pt.a[1], pt.a[2]];
    raLocal[ai] = sign * hRef[ai];                    // 기준면 위로 투영
    const c = takeContact();
    c.A = ref; c.B = inc;
    c.ra.x = raLocal[0]; c.ra.y = raLocal[1]; c.ra.z = raLocal[2];
    c.rb.x = pt.inc[0];  c.rb.y = pt.inc[1];  c.rb.z = pt.inc[2];
    c.n.x = nLocal[0];   c.n.y = nLocal[1];   c.n.z = nLocal[2];
    out.push(c);
  }
}

/** side=1 이면 coord <= half 를 남긴다. */
function clipAxis(poly, axisIdx, half, side) {
  const out = [];
  const limit = side * half;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], nxt = poly[(i + 1) % poly.length];
    const dc = side * cur.a[axisIdx] - half;
    const dn = side * nxt.a[axisIdx] - half;
    if (dc <= 0) out.push(cur);
    if ((dc < 0 && dn > 0) || (dc > 0 && dn < 0)) {
      const t = dc / (dc - dn);
      out.push({
        a: [
          cur.a[0] + (nxt.a[0] - cur.a[0]) * t,
          cur.a[1] + (nxt.a[1] - cur.a[1]) * t,
          cur.a[2] + (nxt.a[2] - cur.a[2]) * t,
        ],
        inc: [
          cur.inc[0] + (nxt.inc[0] - cur.inc[0]) * t,
          cur.inc[1] + (nxt.inc[1] - cur.inc[1]) * t,
          cur.inc[2] + (nxt.inc[2] - cur.inc[2]) * t,
        ],
      });
    }
  }
  return out;
}

/** 모서리끼리 엇갈려 닿는 경우 — 두 선분의 최근접점 하나로 잡는다. */
function edgeContact(a, b, ai, bi, L, sign, out) {
  const n = sign > 0 ? L : scale(L, -1);          // a → b 방향
  const pa = supportEdge(a, ai, n);
  const pb = supportEdge(b, bi, scale(n, -1));
  const closest = closestSegments(pa.p0, pa.p1, pb.p0, pb.p1);
  const raLocal = mApplyT(a.R, sub(closest.a, a.p));
  const rbLocal = mApplyT(b.R, sub(closest.b, b.p));
  const nLocal = mApplyT(a.R, n);
  const c = takeContact();
  c.A = a; c.B = b;
  c.ra.x = raLocal.x; c.ra.y = raLocal.y; c.ra.z = raLocal.z;
  c.rb.x = rbLocal.x; c.rb.y = rbLocal.y; c.rb.z = rbLocal.z;
  c.n.x = nLocal.x;   c.n.y = nLocal.y;   c.n.z = nLocal.z;
  out.push(c);
}

/** 방향 d 쪽으로 가장 먼 모서리(축 ai 방향의 선분). */
function supportEdge(b, ai, d) {
  const h = [b.hx, b.hy, b.hz];
  const u = (ai + 1) % 3, v = (ai + 2) % 3;
  const su = dot(axis(b.R, u), d) >= 0 ? 1 : -1;
  const sv = dot(axis(b.R, v), d) >= 0 ? 1 : -1;
  const base = [0, 0, 0];
  base[u] = su * h[u];
  base[v] = sv * h[v];
  const l0 = base.slice(); l0[ai] = -h[ai];
  const l1 = base.slice(); l1[ai] = h[ai];
  return {
    p0: add(b.p, mApply(b.R, { x: l0[0], y: l0[1], z: l0[2] })),
    p1: add(b.p, mApply(b.R, { x: l1[0], y: l1[1], z: l1[2] })),
  };
}

function closestSegments(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  const c = dot(d1, r), bb = dot(d1, d2);
  const den = a * e - bb * bb;
  let s = den > EPS ? clamp01((bb * f - c * e) / den) : 0;
  let t = clamp01((bb * s + f) / (e || 1));
  s = clamp01((bb * t - c) / (a || 1));
  return { a: add(p1, scale(d1, s)), b: add(p2, scale(d2, t)) };
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// ── 접촉 풀기 ─────────────────────────────────────────────────────────────

function invInertiaApply(b, w) {
  const l = mApplyT(b.R, w);
  return mApply(b.R, { x: l.x * b.invI.x, y: l.y * b.invI.y, z: l.z * b.invI.z });
}

function solveContact(c) {
  const A = c.A, B = c.B;
  if ((!A || A.sleeping) && B.sleeping) return;

  const rbW = mApply(B.R, c.rb);
  const pb = add(B.p, rbW);

  let nW, raW = null, pa;
  if (A) {
    nW = mApply(A.R, c.n);
    raW = mApply(A.R, c.ra);
    pa = add(A.p, raW);
  } else {
    // 무한 평면 — 앵커를 굳히지 않고 지금 위치를 평면에 투영한다
    nW = c.n;
    const depthNow = c.plane - dot(pb, nW);
    pa = { x: pb.x + nW.x * depthNow, y: pb.y + nW.y * depthNow, z: pb.z + nW.z * depthNow };
  }

  const depth = dot(sub(pa, pb), nW);
  if (depth <= 0) { c.lambda = 0; return; }

  const wA = (A && !A.sleeping) ? genInvMass(A, raW, nW) : 0;
  const wB = B.sleeping ? 0 : genInvMass(B, rbW, nW);
  const wSum = wA + wB;
  if (wSum < EPS) return;

  // 깊이 전부를 한 서브스텝에 갚지 않는다. 깊게 박힌 타일이 튕겨 나가는 것을 막는다.
  const push = Math.min(depth, MAX_PUSH);
  const lambda = push / wSum;
  c.lambda = lambda;
  const P = scale(nW, lambda);

  if (!B.sleeping) applyCorrection(B, P, rbW, 1);
  if (A && !A.sleeping) applyCorrection(A, P, raW, -1);

  // 정지 마찰 — 이번 서브스텝 동안 두 접점이 옆으로 어긋난 만큼 되돌린다
  const paPrev = A ? add(A.prevP, rotByQ(A.prevQ, c.ra)) : null;
  const pbPrev = add(B.prevP, rotByQ(B.prevQ, c.rb));
  const paNow = A ? add(A.p, mApply(A.R, c.ra)) : null;
  const pbNow = add(B.p, mApply(B.R, c.rb));

  const dpx = (A ? paNow.x - paPrev.x : 0) - (pbNow.x - pbPrev.x);
  const dpy = (A ? paNow.y - paPrev.y : 0) - (pbNow.y - pbPrev.y);
  const dpz = (A ? paNow.z - paPrev.z : 0) - (pbNow.z - pbPrev.z);
  const dn = dpx * nW.x + dpy * nW.y + dpz * nW.z;
  const tx = dpx - nW.x * dn, ty = dpy - nW.y * dn, tz = dpz - nW.z * dn;
  const dtLen = Math.hypot(tx, ty, tz);
  if (dtLen < EPS) return;

  const tDir = { x: tx / dtLen, y: ty / dtLen, z: tz / dtLen };
  const rbT = mApply(B.R, c.rb);
  const raT = A ? mApply(A.R, c.ra) : null;
  const wAt = (A && !A.sleeping) ? genInvMass(A, raT, tDir) : 0;
  const wBt = B.sleeping ? 0 : genInvMass(B, rbT, tDir);
  const wt = wAt + wBt;
  if (wt < EPS) return;

  // dt 는 "B 가 미끄러진 반대 방향"이다. 그 방향으로 되돌려야 미끄럼이 상쇄된다.
  const lambdaT = Math.min(dtLen / wt, MU * lambda);
  const Pt = scale(tDir, lambdaT);
  if (!B.sleeping) applyCorrection(B, Pt, rbT, 1);
  if (A && !A.sleeping) applyCorrection(A, Pt, raT, -1);
}

function solveContactVelocity(c) {
  const A = c.A, B = c.B;
  if (c.lambda <= 0) return;
  if ((!A || A.sleeping) && B.sleeping) return;

  const nW = A ? mApply(A.R, c.n) : c.n;
  const rbW = mApply(B.R, c.rb);
  const raW = A ? mApply(A.R, c.ra) : null;

  const vB = add(B.v, cross(B.w, rbW));
  const vA = (A && !A.sleeping) ? add(A.v, cross(A.w, raW)) : { x: 0, y: 0, z: 0 };
  const vn = dot(sub(vB, vA), nW);          // B 가 A 에서 멀어지는 속도
  if (vn <= 0) return;

  const wA = (A && !A.sleeping) ? genInvMass(A, raW, nW) : 0;
  const wB = B.sleeping ? 0 : genInvMass(B, rbW, nW);
  const wSum = wA + wB;
  if (wSum < EPS) return;

  const P = scale(nW, -vn / wSum);
  if (!B.sleeping) applyImpulse(B, P, rbW, 1);
  if (A && !A.sleeping) applyImpulse(A, P, raW, -1);
}

function applyImpulse(b, P, r, sign) {
  b.v.x += sign * P.x * b.invM;
  b.v.y += sign * P.y * b.invM;
  b.v.z += sign * P.z * b.invM;
  const dw = invInertiaApply(b, cross(r, P));
  b.w.x += sign * dw.x;
  b.w.y += sign * dw.y;
  b.w.z += sign * dw.z;
}

function genInvMass(b, r, n) {
  const rn = cross(r, n);
  const l = mApplyT(b.R, rn);
  return b.invM + l.x * l.x * b.invI.x + l.y * l.y * b.invI.y + l.z * l.z * b.invI.z;
}

function applyCorrection(b, P, r, sign) {
  b.p.x += sign * P.x * b.invM;
  b.p.y += sign * P.y * b.invM;
  b.p.z += sign * P.z * b.invM;

  const dw = invInertiaApply(b, cross(r, P));
  const dq = qMul({ x: dw.x, y: dw.y, z: dw.z, w: 0 }, b.q);
  b.q.x += 0.5 * sign * dq.x;
  b.q.y += 0.5 * sign * dq.y;
  b.q.z += 0.5 * sign * dq.z;
  b.q.w += 0.5 * sign * dq.w;
  qNorm(b.q);
  qToMat(b.q, b.R);
}

function rotByQ(q, v) {
  const m = qToMat(q, mat3());
  return mApply(m, v);
}

// ── 레이캐스트 ────────────────────────────────────────────────────────────

/**
 * 화면을 찍은 지점에서 쏜 광선이 가장 먼저 맞는 박스.
 * @returns {{body, t, faceAxis, faceSign, point}|null}
 */
export function raycast(world, origin, dir) {
  let hit = null;
  for (const b of world.bodies) {
    const o = mApplyT(b.R, sub(origin, b.p));
    const d = mApplyT(b.R, dir);
    const h = [b.hx, b.hy, b.hz];
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];

    let tMin = -Infinity, tMax = Infinity, hitAxis = 0, hitSign = 1;
    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(da[i]) < 1e-9) {
        if (Math.abs(oa[i]) > h[i]) { ok = false; break; }
        continue;
      }
      const inv = 1 / da[i];
      let t1 = (-h[i] - oa[i]) * inv;
      let t2 = (h[i] - oa[i]) * inv;
      let sign = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
      if (t1 > tMin) { tMin = t1; hitAxis = i; hitSign = sign; }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) { ok = false; break; }
    }
    if (!ok || tMax < 0) continue;
    const t = tMin >= 0 ? tMin : tMax;
    if (t < 0) continue;
    if (!hit || t < hit.t) {
      hit = {
        body: b, t,
        faceAxis: hitAxis,
        faceSign: hitSign,
        point: add(origin, scale(dir, t)),
      };
    }
  }
  return hit;
}
