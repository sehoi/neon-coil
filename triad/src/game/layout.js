// 타일 배치 생성 — "어디에 몇 층으로 쌓을지"만 정한다. 무늬는 deal.js 가 나중에 준다.
//
// 좌표는 반 타일(cell) 단위다. 타일 한 장은 2×2 cell 을 차지하고,
// 층이 하나 올라갈 때마다 시작점이 1 cell 씩 밀린다. 그래서 위층 타일 한 장이
// 아래층 타일 최대 네 장에 걸친다 — 마작 더미 특유의 어긋난 겹침이 여기서 나온다.

import { rnd, shuffle } from '../core/rng.js';

const LAYER_WEIGHT = [1, 0.7, 0.5, 0.36, 0.26, 0.19, 0.14];

export function buildLayout(spec) {
  const caps = [];
  const grids = [];

  for (let k = 0; k < spec.layers; k++) {
    const cols = Math.max(2, spec.cols - k);
    const rows = Math.max(2, spec.rows - k);
    const cands = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) cands.push({ cx: k + i * 2, cy: k + j * 2 });
    }
    grids.push({ cols, rows, cands });
    caps.push(cands.length);
  }

  const want = allocate(spec.tiles, caps);
  const tiles = [];
  let id = 0;

  for (let k = 0; k < spec.layers; k++) {
    const { cols, rows, cands } = grids[k];
    const cxMid = k + (cols - 1);      // cell 단위 중심
    const cyMid = k + (rows - 1);
    // 위층일수록 가운데로 모은다. 아래층은 흩뿌려 구멍을 낸다.
    const pull = k / Math.max(1, spec.layers - 1);
    for (const c of cands) {
      const d = Math.abs(c.cx - cxMid) + Math.abs(c.cy - cyMid);
      c.score = d * pull * 0.6 + rnd() * (cols + rows) * (1 - pull * 0.55);
    }
    cands.sort((a, b) => a.score - b.score);

    for (let i = 0; i < want[k]; i++) {
      const c = cands[i];
      tiles.push({ id: id++, cx: c.cx, cy: c.cy, layer: k, kind: -1, state: 'board', blockedBy: 0, covers: [] });
    }
  }

  return tiles;
}

/**
 * 층별 장수 배분. 가중치대로 나누되 각 층의 자리 수를 넘지 않고,
 * 합은 반드시 목표와 같아야 한다 (3의 배수가 깨지면 풀 수 없는 판이 된다).
 */
function allocate(total, caps) {
  const w = caps.map((_, k) => LAYER_WEIGHT[Math.min(k, LAYER_WEIGHT.length - 1)]);
  const sumW = w.reduce((a, b) => a + b, 0);
  const want = caps.map((cap, k) => Math.min(cap, Math.round(total * w[k] / sumW)));

  let placed = want.reduce((a, b) => a + b, 0);
  // 모자라면 아래층부터 채우고, 남으면 위층부터 덜어낸다
  for (let k = 0; k < want.length && placed < total; k++) {
    const add = Math.min(caps[k] - want[k], total - placed);
    want[k] += add; placed += add;
  }
  for (let k = want.length - 1; k >= 0 && placed > total; k--) {
    const cut = Math.min(want[k], placed - total);
    want[k] -= cut; placed -= cut;
  }
  return want;
}

/** 겹침 관계를 잇는다. A 가 B 보다 위층이고 사각형이 겹치면 A 가 B 를 덮는다. */
export function linkCovers(tiles) {
  for (const t of tiles) { t.covers = []; t.blockedBy = 0; }
  for (const a of tiles) {
    for (const b of tiles) {
      if (a.layer <= b.layer) continue;
      if (Math.abs(a.cx - b.cx) < 2 && Math.abs(a.cy - b.cy) < 2) {
        a.covers.push(b);
        if (a.state === 'board') b.blockedBy++;
      }
    }
  }
}

/** 이미 놓인 판 위에 타일 한 장을 새로 얹는다 (도구 '빼내기' 용). */
export function attachTile(tiles, tile) {
  tile.covers = [];
  tile.blockedBy = 0;
  for (const b of tiles) {
    if (b === tile || b.state !== 'board' || b.layer >= tile.layer) continue;
    if (Math.abs(tile.cx - b.cx) < 2 && Math.abs(tile.cy - b.cy) < 2) {
      tile.covers.push(b);
      b.blockedBy++;
    }
  }
}

export { shuffle };
