// 패 종류와 그 묶음. 그림은 faces.js 가 그린다 — 여기에는 이름·색과 세트 구성만 둔다
// (색은 파티클과 점수 연출이 쓴다).
//
// 진짜 마작 한 벌 그대로 34종이다. 한 판이 이걸 다 쓰지는 않는다 —
// 레벨마다 **세트 몇 개**를 골라, 그 안에서만 무늬를 뽑는다. 아래 chooseKinds 참고.

import { shuffle } from '../core/rng.js';

const NUM = ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

/** 수패 아홉 장. 번호가 클수록 조금씩 진해진다 — 파티클이 구분되게. */
function suit(prefix, base) {
  return NUM.map((n, i) => ({ name: n + prefix, color: tint(base, i) }));
}

/** 0 → 원래 색, 8 → 살짝 진한 색. */
function tint(hex, i) {
  const v = parseInt(hex.slice(1), 16);
  const k = 1 - i * 0.035;
  const c = (sh) => Math.round(Math.min(255, ((v >> sh) & 255) * k));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export const SYMBOLS = [
  ...suit('만', '#e2694a'),        //  0~ 8  一萬 ~ 九萬
  ...suit('통', '#3d6ed8'),        //  9~17  一筒 ~ 九筒
  ...suit('삭', '#2fa05a'),        // 18~26  一索 ~ 九索
  { name: '중', color: '#e0413f' },   // 27
  { name: '발', color: '#27b05c' },   // 28
  { name: '백', color: '#6f9bff' },   // 29
  { name: '동', color: '#5c7cff' },   // 30
  { name: '남', color: '#48c78e' },   // 31
  { name: '서', color: '#e8894a' },   // 32
  { name: '북', color: '#a88cff' },   // 33
];

/**
 * 무늬 세트 다섯 벌.
 *
 * `kinds` 는 **서로 안 닮은 순서**로 늘어놓았다 (수패는 1·9·5·3·7·2·8·4·6).
 * 앞에서부터 잘라 쓰면 같은 세트에서 여러 장을 뽑아도 三筒·四筒처럼
 * 헷갈리는 짝이 잘 안 나온다.
 */
const SPREAD = [0, 8, 4, 2, 6, 1, 7, 3, 5];

export const SETS = [
  { id: 'man',  name: '만수', kinds: SPREAD.slice() },
  { id: 'pin',  name: '통수', kinds: SPREAD.map(i => i + 9) },
  { id: 'sou',  name: '삭수', kinds: SPREAD.map(i => i + 18) },
  { id: 'honor', name: '삼원', kinds: [27, 29, 28] },          // 中 白 發
  { id: 'wind',  name: '사풍', kinds: [30, 32, 31, 33] },      // 東 西 南 北
];

/**
 * 이 판에서 쓸 무늬를 고른다.
 *
 * 세트 다섯 벌 중 `setCount` 벌을 무작위로 고르고, 고른 세트를 **돌아가며**
 * 한 종류씩 뽑는다. 전체에서 아무렇게나 뽑으면 한 판에 통수만 여섯 장이 나오는
 * 일이 생기고, 앞에서부터 잘라 쓰면 어느 판이나 같은 무늬만 본다.
 *
 * @param setCount  몇 벌에서 뽑을지
 * @param kindCount 몇 종류를 뽑을지
 */
export function chooseKinds(setCount, kindCount) {
  const pool = SETS.slice();
  shuffle(pool);
  // 고른 세트는 하나도 빠짐없이 판에 오른다 — 세트를 셋 노출하기로 했으면
  // 셋 다 나와야지, 그중 둘만 나오면 판이 늘 같은 그림으로 보인다.
  // 그래서 세트 수는 뽑을 종류 수를 넘지 않는다.
  const picked = pool.slice(0, Math.max(1, Math.min(setCount, pool.length, kindCount)));

  const out = [];
  for (let i = 0; out.length < kindCount; i++) {
    let any = false;
    for (const s of picked) {
      if (i >= s.kinds.length) continue;
      out.push(s.kinds[i]);
      any = true;
      if (out.length >= kindCount) break;
    }
    if (!any) break;                 // 고른 세트를 다 썼다
  }
  return out;
}
