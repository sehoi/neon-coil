// 판 상태 — 타일 목록과 "지금 집을 수 있는가"를 관리한다. 그리기와 무관하다.

import { buildLayout, linkCovers, attachTile } from './layout.js';
import { dealSymbols, redeal } from './deal.js';

export function createBoard(spec) {
  const tiles = buildLayout(spec);
  linkCovers(tiles);
  const solution = dealSymbols(tiles, spec.kinds);
  return {
    tiles,
    solution: solution.map(t => t.id),   // 생성 시점의 정답 순서
    topLayer: spec.layers - 1,
    remaining: tiles.length,
  };
}

export function isFree(tile) {
  return tile.state === 'board' && tile.blockedBy === 0;
}

export function freeTiles(board) {
  return board.tiles.filter(isFree);
}

export function boardTiles(board) {
  return board.tiles.filter(t => t.state === 'board');
}

/** 판에서 들어낸다 — 아래에 깔려 있던 타일들이 그만큼 풀린다. */
export function liftTile(board, tile) {
  tile.state = 'tray';
  board.remaining--;
  for (const b of tile.covers) if (b.state === 'board') b.blockedBy--;
}

/** 트레이에서 판으로 되돌린다. 그동안 위에 뭐가 얹혔을 수 있으니 다시 센다. */
export function dropTile(board, tile) {
  tile.state = 'board';
  board.remaining++;
  for (const b of tile.covers) if (b.state === 'board') b.blockedBy++;
  tile.blockedBy = 0;
  for (const a of board.tiles) {
    if (a === tile || a.state !== 'board' || a.layer <= tile.layer) continue;
    if (Math.abs(a.cx - tile.cx) < 2 && Math.abs(a.cy - tile.cy) < 2) tile.blockedBy++;
  }
}

/** 매치되어 완전히 사라진다. */
export function burnTile(tile) {
  tile.state = 'gone';
}

/**
 * 도구 '빼내기' — 트레이의 타일을 판의 맨 위 새 층에 흩어 놓는다.
 * 새 층이라 반드시 집을 수 있고, 아래를 덮더라도 자기가 먼저 치워지므로 막히지 않는다.
 */
export function scatterOnTop(board, tiles) {
  const live = boardTiles(board);
  const cx0 = live.length ? Math.round(avg(live.map(t => t.cx))) : 4;
  const cy0 = live.length ? Math.round(avg(live.map(t => t.cy))) : 4;
  board.topLayer++;
  const layer = board.topLayer;
  // 같은 층에 나란히 — 서로를 덮지 않으니 셋 다 바로 집을 수 있다
  const step = Math.floor(tiles.length / 2);
  tiles.forEach((tile, i) => {
    tile.cx = cx0 + (i - step) * 2;
    tile.cy = cy0;
    tile.layer = layer;
    tile.state = 'board';
    board.remaining++;
    attachTile(board.tiles, tile);
  });
}

function avg(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 남은 판의 무늬를 다시 푼다 (트레이 상황을 고려해 풀 수 있는 배치로). */
export function reshuffle(board, trayGroups) {
  const order = redeal(board.tiles, trayGroups);
  board.solution = order.map(t => t.id);   // 정답 순서도 새로 쓴다
}
