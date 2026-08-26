// 무늬 배분 — 이 파일이 "반드시 풀리는 판"을 보장한다.
//
// 핵심: 먼저 유효한 제거 순서를 하나 만든다 (매 단계에서 덮이지 않은 타일만 뽑는다).
// 그 순서를 앞에서부터 3장씩 묶어 같은 무늬를 주면, 그 순서대로만 집으면
// 트레이에 3장 넘게 쌓이는 일 없이 판이 비워진다. 순서 자체는 무작위라
// 플레이어에게는 흩어져 보이지만, 해답은 항상 존재한다.

import { rnd, shuffle } from '../core/rng.js';

/** 항상 '덮이지 않은 타일'만 고르는 무작위 제거 순서. */
export function solveOrder(tiles) {
  const live = tiles.filter(t => t.state === 'board');
  const block = new Map();
  for (const t of live) block.set(t, 0);
  for (const t of live) {
    for (const b of t.covers) if (block.has(b)) block.set(b, block.get(b) + 1);
  }

  const free = live.filter(t => block.get(t) === 0);
  const order = [];
  while (free.length) {
    const i = Math.floor(rnd() * free.length);
    const t = free[i];
    free[i] = free[free.length - 1];
    free.pop();
    order.push(t);
    for (const b of t.covers) {
      if (!block.has(b)) continue;
      const n = block.get(b) - 1;
      block.set(b, n);
      if (n === 0) free.push(b);
    }
  }
  return order;   // live 와 길이가 같다 (겹침 관계가 층 순서라 순환이 없다)
}

/**
 * 새 판에 무늬를 나눠준다.
 * @param {number} kinds 쓸 무늬 종류 수
 */
export function dealSymbols(tiles, kinds) {
  const order = solveOrder(tiles);
  const triples = Math.floor(order.length / 3);
  const bag = [];
  for (let i = 0; i < triples; i++) bag.push(i % kinds);
  shuffle(bag);
  for (let i = 0; i < triples; i++) {
    for (let j = 0; j < 3; j++) order[i * 3 + j].kind = bag[i];
  }
  return order;   // 이 순서대로 집으면 반드시 풀린다 (테스트와 자동 풀이가 쓴다)
}

/**
 * 도구 '섞기' — 판에 남은 무늬 구성은 그대로 두고 위치만 다시 푼다.
 *
 * 트레이에 이미 들어간 낱장들을 무시하면 섞은 뒤에 못 푸는 판이 될 수 있다.
 * 그래서 트레이의 미완성 짝을 채울 무늬를 제거 순서 맨 앞에 배치한다 —
 * 많이 모인 짝부터 채워야 트레이가 먼저 비워지고 자리가 난다.
 *
 * @param {{kind:number,count:number}[]} trayGroups 트레이의 무늬별 장수
 */
export function redeal(tiles, trayGroups) {
  const order = solveOrder(tiles);

  const counts = new Map();
  for (const t of order) counts.set(t.kind, (counts.get(t.kind) || 0) + 1);

  const seq = [];
  const groups = trayGroups.slice().sort((a, b) => b.count - a.count);
  for (const g of groups) {
    const need = 3 - (g.count % 3);
    if (need === 3) continue;
    const have = counts.get(g.kind) || 0;
    const take = Math.min(need, have);
    for (let i = 0; i < take; i++) seq.push(g.kind);
    counts.set(g.kind, have - take);
  }

  const rest = [];
  for (const [kind, n] of counts) {
    for (let i = 0; i < Math.floor(n / 3); i++) rest.push(kind);
  }
  shuffle(rest);
  for (const kind of rest) seq.push(kind, kind, kind);

  // 3의 배수가 아닌 나머지(있을 수 없지만 방어적으로)는 뒤에 붙인다
  for (const [kind, n] of counts) {
    for (let i = 0; i < n % 3; i++) seq.push(kind);
  }

  for (let i = 0; i < order.length; i++) order[i].kind = seq[i];
  return order;   // 이 순서대로 집으면 (트레이의 낱장까지) 다시 풀린다
}
