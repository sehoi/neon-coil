// 버튼 위치를 한 곳에서 정한다. 그리는 쪽과 누름을 판정하는 쪽이 같은 값을 봐야 한다.

import { W, H, LAYOUT } from '../config.js';
import { ITEMS } from '../game/wallet.js';

export const BTN = {
  pause: { x: 20, y: 24, w: 68, h: 68 },
  mute:  { x: W - 88, y: 24, w: 68, h: 68 },
};

/** 도구 버튼 순서 = 아이템 순서. 두 곳이 갈라지면 배지가 엉뚱한 데 붙는다. */
export const POWERS = ITEMS;

export function powerRects() {
  const p = LAYOUT.power;
  const total = p.w * POWERS.length + p.gap * (POWERS.length - 1);
  const x0 = (W - total) / 2;
  const out = {};
  POWERS.forEach((name, i) => {
    out[name] = { x: x0 + i * (p.w + p.gap), y: p.y, w: p.w, h: p.h };
  });
  return out;
}

/** 오버레이 패널과 그 안에 세로로 쌓이는 버튼들. */
export const PANEL = { x: 56, y: 300, w: W - 112, h: 680 };

/** 클리어 화면은 보상까지 실어야 해서 한 칸 더 크다. */
export const CLEAR_PANEL = { x: 48, y: 240, w: W - 96, h: 762 };

export function stackedButtons(n, { y = PANEL.y + PANEL.h - 40, h = 84, gap = 16, box = PANEL } = {}) {
  const w = box.w - 96;
  const x = box.x + 48;
  const top = y - (n * h + (n - 1) * gap);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x, y: top + i * (h + gap), w, h });
  return out;
}
