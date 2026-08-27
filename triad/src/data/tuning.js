// 모든 밸런싱 수치는 여기 모여 있다. 다른 파일에 상수를 흘리지 않는다.

/**
 * 타일 한 장 (물리 단위, 반 크기). 가로 1 × 세로 1.32 × 두께 0.54.
 *
 * 진짜 마작패(19×25×15mm)는 더 두껍지만, 두꺼울수록 옆면으로 서서 안 넘어진다.
 * 모로 선 타일은 무늬가 안 보여 집을 수 없으므로 판이 빨리 읽기 어려워진다.
 * 실측: 두께 0.64 면 40수 뒤 모로 선 것이 54장, 0.54 면 49장, 0.4 면 39장.
 * 마작패로 보이는 선에서 가장 얇게 잡았다.
 */
export const TILE3D = { hx: 0.5, hy: 0.66, hz: 0.27 };

/** 쏟아붓기. 높은 데서 떨어뜨리면 튀면서 죄다 엎어진다. */
export const POUR = {
  perWave: 4,          // 한 번에 놓는 장수
  spots: 6,            // 놓을 자리 후보 (가장 낮은 곳을 고른다)
  everyFrames: 3,      // 몇 프레임마다
  height: 0.22,        // 더미 표면에서 이만큼 위에 놓는다
  speed: 0.8,          // 처음부터 아래로 밀어 준다 (팔랑거림 방지)
  tilt: 0.08,          // 놓을 때 앞뒤 기울기 (라디안)
  settleCap: 2.5,      // 다 쏟고 이만큼 지나면 미동은 그냥 멈춘다 (초)
};

/** 트레이에 놓이는 2D 타일 크기 (논리 픽셀). */
export const TILE = { w: 64, h: 80, radius: 9 };

/** 트레이 칸 수. 이만큼 차고도 3장이 안 모이면 그 판은 끝난다. */
export const TRAY_CAP = 7;

/** 레벨 난이도 곡선. level 은 1부터. */
export function levelSpec(level) {
  const L = Math.max(1, level | 0);
  // 한 판에 120장부터 시작한다. 장수가 많아야 타일이 화면에서 작게 보이고,
  // 그래야 원본처럼 "더미를 뒤진다"는 느낌이 난다.
  const tiles = clamp(120 + (L - 1) * 6, 120, 180);
  return {
    level: L,
    tiles: tiles - (tiles % 3),
    kinds: clamp(5 + L, 6, 12),        // 레벨마다 한 종류씩. 종류가 늘수록 트레이가 빨리 찬다
    // 무늬를 뽑아 올 세트 수. 판마다 어느 세트가 걸릴지 달라지므로 레벨 1도
    // 매번 다른 패로 시작한다. 세트가 늘수록 서로 안 닮은 무늬가 섞인다.
    sets: clamp(3 + Math.floor((L - 1) / 3), 3, 5),
    layers: clamp(1.25 + L * 0.05, 1.25, 2.0),   // 더미를 몇 겹으로 쌓을지 (상자 넓이가 정해진다)
    parTime: 40 + tiles * 1.1,
  };
}

/**
 * 아이템은 이제 레벨마다 채워지지 않는다 — 사서 쟁이는 물건이다.
 * 처음 시작할 때만 이만큼 쥐어 준다.
 */
export function startingItems() {
  return { undo: 2, withdraw: 1, flip: 2, shuffle: 0 };
}

/**
 * 골드와 값.
 *
 * 한 판을 깨면 그 판 점수의 1/20 이 골드가 된다 (레벨 1 이 6000점쯤이니 300골드).
 * 값은 "한 판 깨면 센 것 하나, 아니면 잔 것 서넛" 이 되게 잡았다.
 */
export const ECONOMY = {
  goldPerScore: 20,
  price: { undo: 60, withdraw: 150, flip: 110, shuffle: 220 },
  /** 무료 아이템 — 15분마다 한 개. 뽑히는 비율은 값의 역순이다. */
  free: {
    everyMs: 15 * 60 * 1000,
    weight: { undo: 5, flip: 3, withdraw: 2, shuffle: 1 },
  },
};

/**
 * 판 하나를 깰 때마다 주는 아이템 세트.
 * 되돌리기·뒤집기는 매번, 빼내기는 두 판마다, 섞기는 세 판마다.
 */
export function clearReward(level) {
  const L = Math.max(1, level | 0);
  return {
    undo:     1,
    flip:     1,
    withdraw: L % 2 === 0 ? 1 : 0,
    shuffle:  L % 3 === 0 ? 1 : 0,
  };
}

export const SCORE = {
  match: 60,
  comboStep: 20,
  comboMax: 6,
  clear: 300,
  speedBonus: 400,
};

export const ANIM = {
  fly: 0.26,          // 타일이 트레이로 날아가는 시간 (초)
  pop: 0.26,
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
