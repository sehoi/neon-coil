// 좌표 변환 — cell 좌표를 화면 좌표로. 그리기와 히트 테스트가 같은 식을 쓴다.

import { LAYOUT } from '../config.js';
import { TILE } from '../data/tuning.js';

const CW = TILE.w / 2;   // cell 하나 = 반 타일
const CH = TILE.h / 2;

/**
 * 판 전체를 board 영역에 맞추는 배율과 원점.
 * 사라진 타일까지 포함해 재는 이유는, 판이 줄어들 때마다 확대되면
 * 남은 타일이 매 매치마다 춤을 추기 때문이다.
 */
export function boardView(board) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of board.tiles) {
    const x = t.cx * CW + t.layer * TILE.liftX;
    const y = t.cy * CH - t.layer * TILE.liftY;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x + TILE.w > x1) x1 = x + TILE.w;
    if (y + TILE.h > y1) y1 = y + TILE.h;
  }
  const a = LAYOUT.board;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const scale = Math.min(a.w / bw, a.h / bh, 1.6);
  return {
    scale,
    ox: a.x + (a.w - bw * scale) / 2 - x0 * scale,
    oy: a.y + (a.h - bh * scale) / 2 - y0 * scale,
  };
}

export function tileRect(view, cx, cy, layer) {
  const s = view.scale;
  return {
    x: view.ox + (cx * CW + layer * TILE.liftX) * s,
    y: view.oy + (cy * CH - layer * TILE.liftY) * s,
    w: TILE.w * s,
    h: TILE.h * s,
  };
}

export function rectOf(view, tile) {
  return tileRect(view, tile.cx, tile.cy, tile.layer);
}

/** 아래층 → 위층, 같은 층은 뒤에서 앞으로. 위에 있는 것이 나중에 그려진다. */
export function drawOrder(board) {
  return board.tiles
    .filter(t => t.state === 'board')
    .sort((a, b) => (a.layer - b.layer) || (a.cy - b.cy) || (a.cx - b.cx));
}

/** 그려진 순서의 역순으로 훑어 맨 위 타일을 고른다. */
export function hitTile(board, view, px, py) {
  const order = drawOrder(board);
  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i];
    const r = rectOf(view, t);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return t;
  }
  return null;
}

/** 트레이 i 번 칸. */
export function traySlot(i) {
  const t = LAYOUT.tray;
  return {
    x: t.x + i * (t.slotW + t.gap),
    y: t.y,
    w: t.slotW,
    h: t.h,
  };
}

/** 트레이 칸 안에 놓이는 타일 사각형. */
export function trayTileRect(i) {
  const s = traySlot(i);
  const w = TILE.w * 0.94, h = TILE.h * 0.94;
  return { x: s.x + (s.w - w) / 2, y: s.y + (s.h - h) / 2, w, h };
}
