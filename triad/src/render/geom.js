// 트레이 좌표. 판은 3D 라 여기 없다 — render/pile3d.js 와 render/camera.js 를 본다.

import { LAYOUT } from '../config.js';
import { TILE } from '../data/tuning.js';

/** 트레이 i 번 칸. */
export function traySlot(i) {
  const t = LAYOUT.tray;
  return { x: t.x + i * (t.slotW + t.gap), y: t.y, w: t.slotW, h: t.h };
}

/** 트레이 칸 안에 놓이는 타일 사각형. */
export function trayTileRect(i) {
  const s = traySlot(i);
  const w = TILE.w * 0.94, h = TILE.h * 0.94;
  return { x: s.x + (s.w - w) / 2, y: s.y + (s.h - h) / 2, w, h };
}
