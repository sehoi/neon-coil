// mulberry32 — 시드 가능한 PRNG. [NEON COIL 이식]
// 레벨 생성이 시드로 재현돼야 버그 난 판을 다시 볼 수 있다.

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

export function irange(lo, hi) {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

export function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** 제자리 셔플 (Fisher-Yates). */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
