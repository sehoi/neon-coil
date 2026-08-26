// 포인터(마우스·터치)와 키보드를 논리 좌표계 하나로 정규화한다.
//
// 탭은 큐에 쌓아두고 버튼이 직접 소비한다. "이번 프레임에 눌렸는가"로만 판정하면
// 프레임이 길어질 때 탭이 조용히 사라진다. [NEON COIL 이식]

import { W, H } from '../config.js';

const TAP_TTL = 350;   // ms

export const input = {
  pointer: { x: -999, y: -999, down: false, inside: false },
  taps: [],
  pressedKeys: new Set(),   // 이번 프레임에 새로 눌린 코드
  anyKey: false,
};

let canvasEl = null;

export function attachInput(canvas) {
  canvasEl = canvas;

  canvas.addEventListener('pointerdown', (e) => {
    const p = toLogical(e);
    input.pointer.x = p.x; input.pointer.y = p.y;
    input.pointer.down = true;
    input.pointer.inside = true;
    pushTap(p.x, p.y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    input.pointer.x = p.x; input.pointer.y = p.y;
    input.pointer.inside = true;
  });

  canvas.addEventListener('pointerup', (e) => { input.pointer.down = false; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('pointercancel', () => { input.pointer.down = false; });
  canvas.addEventListener('pointerleave', () => { input.pointer.inside = false; input.pointer.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.pressedKeys.add(e.code);
    input.anyKey = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });

  window.addEventListener('blur', () => { input.pointer.down = false; });
}

function toLogical(e) {
  const r = canvasEl.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / r.width * W,
    y: (e.clientY - r.top) / r.height * H,
  };
}

function pushTap(x, y) {
  input.taps.push({ x, y, t: performance.now(), used: false });
  if (input.taps.length > 8) input.taps.shift();
}

/** 사각형 안의 미처리 탭을 하나 소비한다. */
export function consumeTap(x, y, w, h) {
  for (const t of input.taps) {
    if (!t.used && t.x >= x && t.x <= x + w && t.y >= y && t.y <= y + h) {
      t.used = true;
      return true;
    }
  }
  return false;
}

export function consumeRect(r) {
  return r ? consumeTap(r.x, r.y, r.w, r.h) : false;
}

/** 위치가 필요한 경우 (판 위의 타일 고르기). 소비한 탭의 좌표를 준다. */
export function takeTap() {
  for (const t of input.taps) {
    if (!t.used) { t.used = true; return t; }
    }
  return null;
}

export function key(code) {
  return input.pressedKeys.has(code);
}

/** 프레임 끝. 만료된 탭을 버리고 키 엣지를 지운다. */
export function endFrame() {
  const now = performance.now();
  input.taps = input.taps.filter(t => !t.used && now - t.t < TAP_TTL);
  input.pressedKeys.clear();
  input.anyKey = false;
}

export function pointInRect(px, py, r) {
  return r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
