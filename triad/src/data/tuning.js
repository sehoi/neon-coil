// 모든 밸런싱 수치는 여기 모여 있다. 다른 파일에 상수를 흘리지 않는다.

/** 타일 한 장 (물리 단위, 반 크기). 가로 1 × 세로 1.32 × 두께 0.52 */
export const TILE3D = { hx: 0.5, hy: 0.66, hz: 0.26 };

/** 쏟아붓기. 높은 데서 떨어뜨리면 튀면서 죄다 엎어진다. */
export const POUR = {
  perWave: 3,          // 한 번에 놓는 장수
  spots: 6,            // 놓을 자리 후보 (가장 낮은 곳을 고른다)
  everyFrames: 4,      // 몇 프레임마다
  height: 0.22,        // 더미 표면에서 이만큼 위에 놓는다
  speed: 0.8,          // 처음부터 아래로 밀어 준다 (팔랑거림 방지)
  tilt: 0.08,          // 놓을 때 앞뒤 기울기 (라디안)
  settleCap: 4.0,      // 다 쏟고 이만큼 지나면 미동은 그냥 멈춘다 (초)
};

/** 트레이에 놓이는 2D 타일 크기 (논리 픽셀). */
export const TILE = { w: 64, h: 80, radius: 9 };

/** 트레이 칸 수. 이만큼 차고도 3장이 안 모이면 그 판은 끝난다. */
export const TRAY_CAP = 7;

/** 레벨 난이도 곡선. level 은 1부터. */
export function levelSpec(level) {
  const L = Math.max(1, level | 0);
  const tiles = clamp(24 + (L - 1) * 6, 24, 120);
  return {
    level: L,
    tiles: tiles - (tiles % 3),
    kinds: clamp(4 + Math.floor(L / 3), 4, 10),
    layers: clamp(1.15 + L * 0.06, 1.15, 2.0),   // 더미를 몇 겹으로 쌓을지 (상자 넓이가 정해진다)
    parTime: 25 + tiles * 1.0,
  };
}

/** 레벨마다 새로 채워지는 도구 사용 횟수. */
export function powerCharges(level) {
  return {
    undo:     3,
    withdraw: 1,
    flip:     level >= 2 ? 2 : 0,
    shuffle:  level >= 3 ? 1 : 0,
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
  shake: 0.28,
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
