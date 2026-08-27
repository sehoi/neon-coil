// 3D 수학 — 벡터, 쿼터니언, 회전 행렬. 물리와 렌더가 같은 표현을 쓴다.
//
// 회전 행렬은 Float64Array(9) 행 우선이다. world = R · local 이므로
// 열 i 가 물체의 i 번째 로컬 축(월드 좌표)이다: (m[i], m[3+i], m[6+i]).

export function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }
export function copy(a) { return { x: a.x, y: a.y, z: a.z }; }
export function set(o, x, y, z) { o.x = x; o.y = y; o.z = z; return o; }

export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
export function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
export function len(a) { return Math.hypot(a.x, a.y, a.z); }
export function len2(a) { return a.x * a.x + a.y * a.y + a.z * a.z; }
export function norm(a) {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
export function addTo(o, a, s = 1) { o.x += a.x * s; o.y += a.y * s; o.z += a.z * s; return o; }

// ── 쿼터니언 ──────────────────────────────────────────────────────────────

export function quat(x = 0, y = 0, z = 0, w = 1) { return { x, y, z, w }; }

export function qMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function qNorm(q) {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= l; q.y /= l; q.z /= l; q.w /= l;
  return q;
}

export function qConj(q) { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }

export function qAxisAngle(axis, angle) {
  const h = angle / 2, s = Math.sin(h);
  const a = norm(axis);
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(h) };
}

/** 무작위 방향 (균등). 타일을 아무렇게나 쏟을 때 쓴다. */
export function qRandom(rnd) {
  const u1 = rnd(), u2 = rnd(), u3 = rnd();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return {
    x: s1 * Math.sin(2 * Math.PI * u2),
    y: s1 * Math.cos(2 * Math.PI * u2),
    z: s2 * Math.sin(2 * Math.PI * u3),
    w: s2 * Math.cos(2 * Math.PI * u3),
  };
}

/** 각속도로 쿼터니언을 적분한다. q += 0.5 (ω ⊗ q) h */
export function qIntegrate(q, w, h) {
  const dq = qMul({ x: w.x, y: w.y, z: w.z, w: 0 }, q);
  q.x += 0.5 * h * dq.x;
  q.y += 0.5 * h * dq.y;
  q.z += 0.5 * h * dq.z;
  q.w += 0.5 * h * dq.w;
  return qNorm(q);
}

// ── 행렬 ──────────────────────────────────────────────────────────────────

export function mat3() { return new Float64Array(9); }

export function qToMat(q, m) {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy - wz;       m[2] = xz + wy;
  m[3] = xy + wz;       m[4] = 1 - (xx + zz); m[5] = yz - wx;
  m[6] = xz - wy;       m[7] = yz + wx;       m[8] = 1 - (xx + yy);
  return m;
}

/** world = R · local */
export function mApply(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

/** local = Rᵀ · world */
export function mApplyT(m, v) {
  return {
    x: m[0] * v.x + m[3] * v.y + m[6] * v.z,
    y: m[1] * v.x + m[4] * v.y + m[7] * v.z,
    z: m[2] * v.x + m[5] * v.y + m[8] * v.z,
  };
}

/** 물체의 i 번째 로컬 축 (월드). */
export function axis(m, i) {
  return { x: m[i], y: m[3 + i], z: m[6 + i] };
}
