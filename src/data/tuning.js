// 모든 밸런싱 수치를 한곳에. 게임 느낌을 바꾸려면 여기만 만진다.

export const ARENA_RADIUS = 2600;

export const COIL = {
  speed:      190,
  boostSpeed: 340,

  // 길이가 늘수록 둔해진다 — 커질수록 죽기 쉬워야 긴장이 생긴다
  turnFast:   3.4,    // 길이 20 에서
  turnSlow:   2.2,    // 길이 400 이상에서
  turnLenLo:  20,
  turnLenHi:  400,

  startLen:   24,
  maxLen:     600,    // 궤적 버퍼 크기이자 하드 상한

  // 몸 반지름도 길이에 따라 굵어진다
  radiusMin:  7,
  radiusMax:  20,
  radiusLenHi: 400,

  spacingRatio: 0.55, // 세그먼트 간격 = 반지름 × 이 값
  headHitRatio: 0.8,  // 머리 히트박스는 실제보다 작게 — 억울한 죽음 방지

  boostDrainPerSec: 6,
  boostMinLen: 20,
  magnet: 40,         // 머리 반경에 더해지는 흡인 거리
};

/** 길이 → 회전 속도 (rad/s) */
export function turnRateFor(len) {
  const t = Math.min(1, Math.max(0, (len - COIL.turnLenLo) / (COIL.turnLenHi - COIL.turnLenLo)));
  return COIL.turnFast + (COIL.turnSlow - COIL.turnFast) * t;
}

/** 길이 → 몸 반지름 */
export function radiusFor(len) {
  const t = Math.min(1, len / COIL.radiusLenHi);
  // 제곱근으로 올려 초반 성장이 눈에 잘 보이게 한다
  return COIL.radiusMin + (COIL.radiusMax - COIL.radiusMin) * Math.sqrt(t);
}

export const FOOD = {
  target: 1400,       // 아레나에 유지할 개수
  bitValue: 1,
  blockValue: 4,
  debrisValue: 6,
  leakValue: 1,
  blockChance: 0.2,
  // 사망 시 길이 몇 배를 잔해로 뿌리는가 (1 이면 먹은 만큼 그대로 돌려준다)
  deathDropRatio: 0.7,
  deathDropMax: 90,   // 잔해 개수 상한 — 거대 코일이 죽어도 프레임을 지킨다
};

/**
 * 강화 아이템.
 * 큰 코일을 잡는 것은 위험하다 — 잔해(경험치)만으로는 그 위험이 보상되지 않는다.
 */
export const BOOST_ITEM = {
  minLenToDrop: 110,     // 이 길이 이상인 코일이 죽어야 떨어진다
  shieldDuration: 9,     // 몸통에 부딪혀도 1회 버틴다
  surgeDuration: 8,      // 부스트가 길이를 태우지 않는다
  magnetDuration: 7,     // 주변 먹이를 끌어온다
  magnetRadius: 320,
  lifetime: 22,          // 이 시간이 지나면 사라진다
};

export const NPC = {
  count: 19,
  respawnMin: 3,
  respawnMax: 6,
  aiIntervalFrames: 6,   // AI 는 6프레임에 한 번만 판단한다

  // 성격 비율 (합 1.0)
  mix: [
    { kind: 'feeder',   weight: 0.5 },
    { kind: 'hunter',   weight: 0.3 },
    { kind: 'cautious', weight: 0.2 },
  ],

  foodSenseRadius:   520,
  dangerSenseRadius: 220,
  dangerCone:        Math.PI / 3,   // 전방 ±60°
  interceptRadius:   700,
  cautiousKeepOut:   400,

  // 벡터 가중치 — 위험 회피가 압도적이어야 NPC 가 자살하지 않는다
  wFood:     1.0,
  wDanger:   6.0,
  wBoundary: 5.0,
  wIntercept: 2.0,
};
