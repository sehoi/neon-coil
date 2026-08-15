// 프레임당 힙 할당을 만들지 않기 위해, 벡터를 객체로 반환하지 않고 스칼라만 다룬다.

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** 원-원 충돌 (sqrt 없이) */
export function hits(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 지수 감쇠 기반 보간. 프레임률에 무관하게 동일한 추적감을 준다. */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export const TAU = Math.PI * 2;

/** 각도 정규화 (-PI ~ PI) */
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
