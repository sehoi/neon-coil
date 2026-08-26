// 모든 밸런싱 수치는 여기 모여 있다. 다른 파일에 상수를 흘리지 않는다.

export const TILE = {
  w: 64,          // 타일 한 장의 논리 크기
  h: 80,
  liftX: 5,       // 한 층 올라갈 때 그려지는 위치가 밀리는 양 (겹침을 눈으로 보이게)
  liftY: 7,
  radius: 9,
};

export const TRAY_CAP = 7;   // 트레이가 이만큼 차고도 매치가 없으면 진다

/** 레벨 난이도 곡선. level 은 1부터. */
export function levelSpec(level) {
  const L = Math.max(1, level | 0);
  const layers = clamp(2 + Math.floor((L + 1) / 2), 3, 6);
  const kinds  = clamp(4 + Math.floor(L / 3), 4, 10);
  const tiles  = clamp(30 + (L - 1) * 6, 30, 120);
  // 타일이 세로로 긴 만큼 판은 가로로 한 칸 넓어야 board 영역(거의 정사각)에 꽉 찬다
  const rows = clamp(4 + Math.floor(L / 4), 4, 7);
  const cols = rows + 1;
  return {
    level: L,
    layers,
    kinds,
    tiles: tiles - (tiles % 3),
    cols,
    rows,
    parTime: 25 + tiles * 1.1,   // 이 시간 안에 끝내면 속도 보너스가 붙는다
  };
}

/** 레벨마다 새로 채워지는 도구 사용 횟수. */
export function powerCharges(level) {
  return {
    undo:     3,
    withdraw: 1,
    shuffle:  level >= 2 ? 1 : 0,   // 첫 판은 섞을 것도 없다
  };
}

export const SCORE = {
  match: 60,          // 3장 매치
  comboStep: 20,      // 연속 매치마다 붙는 가산
  comboMax: 6,
  clear: 300,         // 레벨 클리어
  speedBonus: 400,    // 파 타임 대비 남은 비율 × 이 값
};

export const ANIM = {
  fly: 0.22,          // 타일이 트레이로 날아가는 시간 (초)
  pop: 0.26,          // 매치가 터지는 시간
  shake: 0.28,        // 못 집는 타일을 흔드는 시간
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
