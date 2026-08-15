// 전역 상수. 다른 어떤 모듈도 참조하지 않는다.
// NEON PURGE 에서 이식 — 동적 논리 해상도와 터치 판별은 그대로 검증된 코드다.

/**
 * 논리 해상도. 높이는 720 으로 고정하고 폭만 화면 비율에 맞춘다.
 * 16:9 로 못박으면 20:9 인 폰에서 좌우에 검은 띠가 생겨 화면이 20% 가까이 낭비된다.
 *
 * `let` + live binding 이라 import 한 쪽도 갱신된 값을 본다. 다만 모듈 최상위에서
 * 값을 읽어 상수를 계산해 두면 그건 고정되므로, 반드시 함수 안에서 읽어야 한다.
 */
export let W = 1280;
export let H = 720;
export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;

const MIN_W = 1280;
const MAX_W = 1750;

export function setViewport(cssW, cssH) {
  if (!cssW || !cssH) return false;
  const w = Math.round(Math.min(MAX_W, Math.max(MIN_W, H * (cssW / cssH))));
  if (w === W) return false;
  W = w;
  refreshTouchUI();
  return true;
}

export const C = {
  bg:      '#070711',
  grid:    '#151a35',
  cyan:    '#00f0ff',
  magenta: '#ff2e88',
  lime:    '#8cff3d',
  gold:    '#ffd23d',
  violet:  '#b06bff',
  orange:  '#ff8a1f',
  mint:    '#3dff9e',
  red:     '#ff3b3b',
  text:    '#e6f2ff',
  dim:     '#7b88a8',
};

/** NPC 코일 색상 순환 */
export const NPC_COLORS = [C.magenta, C.lime, C.gold, C.violet, C.orange, C.mint];

/**
 * 손가락으로 조작하는 기기인가.
 * 마우스가 달린 터치스크린 노트북까지 모바일 UI 로 바꾸면 오히려 불편하므로,
 * "정밀한 포인터가 없는" 기기만 잡는다.
 */
export const IS_TOUCH =
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  (navigator.maxTouchPoints || 0) > 0;

/** 터치 조작 UI 배치. W 가 바뀌면 refreshTouchUI 로 다시 계산한다. */
export const TOUCH_UI = {
  boostX: 0, boostY: 0, boostR: 62,
  pauseX: 0, pauseY: 0, pauseR: 26,
};

export function refreshTouchUI() {
  TOUCH_UI.boostX = W - 104;
  TOUCH_UI.boostY = H - 104;
  TOUCH_UI.pauseX = W / 2 + 108;
  TOUCH_UI.pauseY = 48;
}
refreshTouchUI();

export const SETTINGS = {
  glow: true,
  shake: 1.0,
  muted: false,
  showFps: false,
};

// 모바일 GPU 는 픽셀 수에 민감하다.
export const MAX_DPR = IS_TOUCH ? 1.25 : 2;

// 공간 해시 셀 — 최대 몸 반지름의 약 2배
export const GRID_CELL = 48;
