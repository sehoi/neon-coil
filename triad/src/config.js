// 논리 해상도는 세로 고정이다. 이 게임은 한 손 세로 조작이 기본이고,
// 타일 판이 화면비에 따라 늘어나면 레이아웃 계산이 전부 흔들린다.
// 대신 캔버스를 레터박스로 맞추고, 판만 남는 공간에 맞춰 확대/축소한다.
export const W = 720;
export const H = 1280;

export const IS_TOUCH = typeof window !== 'undefined' &&
  (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);

export const SETTINGS = {
  muted: false,
  glow: true,
};

/** 화면 영역 (논리 좌표). */
export const LAYOUT = {
  hud:   { x: 0,  y: 0,    w: W,   h: 132 },
  board: { x: 20, y: 146,  w: 680, h: 752 },
  tray:  { x: 28, y: 928,  w: 664, h: 104, slots: 7, slotW: 88, gap: 8 },
  power: { y: 1068, h: 128, w: 158, gap: 14 },
};

/** 캔버스 백버퍼를 DPR 에 맞춘다. 논리 좌표계는 항상 W×H 그대로다. */
export function fitCanvas(canvas) {
  // 3D 더미는 픽셀을 많이 칠한다 (타일 180장이면 면이 1000개가 넘는다).
  // 고DPI 기기에서 원본 배율로 그리면 채우기만으로 프레임이 무너지므로,
  // 백버퍼를 논리 해상도의 1.4배(= 약 160만 화소)로 묶는다.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.4);
  const w = Math.round(W * dpr);
  const h = Math.round(H * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return dpr;
}
