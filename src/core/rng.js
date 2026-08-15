// mulberry32 — 시드 가능한 PRNG. 밸런싱 재현과 디버깅에 쓴다.

let state = 0x9e3779b9;

export function seed(s) {
  state = s >>> 0;
}

export function rnd() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(lo, hi) {
  return lo + rnd() * (hi - lo);
}

export function irange(lo, hi) {
  return Math.floor(range(lo, hi + 1));
}

export function chance(p) {
  return rnd() < p;
}

export function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** 가중치 배열에서 인덱스 하나를 뽑는다. */
export function weightedIndex(weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
