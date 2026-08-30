// 모든 밸런싱 수치는 여기 모여 있다. 다른 파일에 상수를 흘리지 않는다.

import { rnd } from '../core/rng.js';
import { LAYOUT } from '../config.js';

/**
 * 타일 한 장 (물리 단위, 반 크기). 가로 1 × 세로 1.32 × 두께 0.54.
 *
 * 진짜 마작패(19×25×15mm)는 더 두껍지만, 두꺼울수록 옆면으로 서서 안 넘어진다.
 * 모로 선 타일은 무늬가 안 보여 집을 수 없으므로 판이 빨리 읽기 어려워진다.
 * 실측: 두께 0.64 면 40수 뒤 모로 선 것이 54장, 0.54 면 49장, 0.4 면 39장.
 * 마작패로 보이는 선에서 가장 얇게 잡았다.
 */
export const TILE3D = {
  hx: 0.5, hy: 0.66, hz: 0.27,
  /**
   * 모서리를 깎는 반지름 (월드 단위). 진짜 마작패는 19mm 폭에 모서리가 2mm 남짓
   * 둥그니 폭의 1/9 쯤이다. 각지게 두면 플라스틱 칩처럼 보인다.
   */
  round: 0.11,
};

/** 쏟아붓기. 높은 데서 떨어뜨리면 튀면서 죄다 엎어진다. */
export const POUR = {
  perWave: 4,          // 한 번에 놓는 장수
  spots: 6,            // 놓을 자리 후보 (가장 낮은 곳을 고른다)
  everyFrames: 3,      // 몇 프레임마다
  height: 0.22,        // 더미 표면에서 이만큼 위에 놓는다
  speed: 0.8,          // 처음부터 아래로 밀어 준다 (팔랑거림 방지)
  tilt: 0.08,          // 놓을 때 앞뒤 기울기 (라디안)
  settleCap: 1.2,      // 이만큼 들썩이고도 안 자면, 조용해진 순간 그냥 세운다 (초)
};

/** 트레이에 놓이는 2D 타일 크기 (논리 픽셀). */
export const TILE = { w: 64, h: 80, radius: 9 };

/**
 * 물리의 손맛.
 *
 * 타일이 **묵직하게** 움직여야 마작패로 읽힌다. 가볍게 굴러다니면 플라스틱 칩이다.
 * 그리고 한 장을 빼서 무너진 뒤에는 **빨리 멎어야 한다** — 판이 계속 흔들리면
 * 무늬를 읽을 수가 없다.
 *
 * 두 가지를 같이 잡는 값들이라 한자리에 모아 둔다.
 */
export const PHYS = {
  gravity: -34,        // 셀수록 빨리 떨어지고 빨리 눌러앉는다 (묵직함)
  damp: { v: 0.99, w: 0.94 },        // 매 프레임 깎는 비율. 각속도를 더 깎아야 안 팔랑거린다
  // 느리게 기어다니는 것은 훨씬 세게 잡는다. 한 장을 뺐을 때 더미 전체가
  // 초속 1~2 로 몇 초씩 흐르던 것이 이 구간에서 죽는다.
  slow: { v: 1.6, w: 2.2, mul: 0.7 },
  // 재우기 문턱은 **한 프레임에 실제로 옮겨 간 거리**로 잰다 (physics.js 의 travel).
  // 접촉을 밀어낸 양이 섞인 v 로 재면 더미가 영영 못 잔다 — 실측: 한 장을 빼면
  // 온 더미(179장)가 초당 0.15 씩 끝없이 기어다니고, 그게 화면에서는 잔떨림이다.
  // 물리에 한 번에 먹이는 최대 시간. 프레임이 길어지면(300장 판에서 30ms) 한 스텝이
  // 그만큼 커지고, 접촉을 밀어내는 양도 커져 더미가 더 오래 들썩인다. 30ms 짜리
  // 프레임에서도 20ms 씩만 밟는다 — 잠깐 아주 느린 화면이 되지만 더미는 조용하다.
  maxStep: 1 / 50,
  sleep: { lin: 0.45, ang: 1.1, time: 0.18 },    // 이보다 덜 움직인 채로 time 만큼 있으면 잔다
  quiet: { v: 1.2, w: 2.6, time: 0.3 },
  // 게임이 더미를 강제로 세워도 되는 선 (POUR.settleCap 과 함께 쓴다).
  // 이보다 빠른 타일이 하나라도 있으면 아직 진짜로 떨어지는 중이므로 기다린다 —
  // 그 상태로 세우면 타일이 공중에 박제된다.
  calm: 1.6,        // 더미에서 가장 많이 움직이는 것이 이 정도면 통째로 재운다
};

/** 트레이 칸 수. 이만큼 차고도 3장이 안 모이면 그 판은 끝난다. */
export const TRAY_CAP = 7;

/**
 * 판 크기의 양 끝. 첫 판은 손에 익히는 30장, 꼭대기는 300장이다.
 * 꼭대기를 찍은 뒤로는 210·210·300 을 되풀이한다 — 300장만 계속 나오면
 * 한 판이 너무 길어져 앉은자리에서 두 판을 못 깬다.
 */
const TILES = { min: 30, max: 300, cruise: 210, peak: 10 };

/**
 * 상자의 세로/가로 비. 화면에서 판을 그리는 사각형(LAYOUT.board)과 같게
 * 잡아야 카메라가 맞췄을 때 위아래·양옆에 빈 곳이 안 남는다. LAYOUT 에서
 * 직접 뽑아 온다 — 화면 비를 고치고 여기를 깜빡하면 판 둘레에 빈 띠가 생긴다.
 */
export const BOX_RATIO = LAYOUT.board.h / LAYOUT.board.w;

/** 레벨 난이도 곡선. level 은 1부터. */
export function levelSpec(level) {
  const L = Math.max(1, level | 0);
  const tiles = tileCount(L);
  const triples = tiles / 3;
  return {
    level: L,
    tiles,
    // 무늬는 판 크기를 따라간다 — 한 무늬가 두어 벌쯤 되게. 무늬가 적으면
    // 같은 그림만 잔뜩 보여 고를 것이 없고, 마작 한 벌이 34종이라 거기서 멈춘다.
    kinds: clamp(Math.round(triples * 0.5), 6, 34),
    // 무늬를 뽑아 올 세트 수. 판마다 어느 세트가 걸릴지 달라지므로 레벨 1도
    // 매번 다른 패로 시작한다. 고른 세트는 하나도 빠짐없이 판에 오른다.
    sets: clamp(3 + Math.floor((L - 1) / 3), 3, 5),
    // 몇 겹으로 쌓을지 — 상자 넓이가 이걸로 정해진다 (game/pile.js).
    // 300장·2.6겹이면 타일 한 장이 화면에서 58×77 픽셀이라 아직 누를 만하다.
    layers: clamp(1.2 + 1.4 * (tiles - TILES.min) / (TILES.max - TILES.min), 1.2, 2.6),
    parTime: 12 + tiles * 0.85,
  };
}

/**
 * 이 레벨의 장수. 꼭대기까지는 지수 곡선이다 —
 * 30 · 39 · 51 · 66 · 84 · 108 · 138 · 180 · 231 · 300.
 * 앞은 완만하고 뒤로 갈수록 한 판이 눈에 띄게 커진다.
 */
function tileCount(L) {
  if (L >= TILES.peak) {
    // 300장 뒤로는 210 · 210 · 300 이 반복된다
    return (L - TILES.peak) % 3 === 0 ? TILES.max : TILES.cruise;
  }
  const k = Math.pow(TILES.max / TILES.min, (L - 1) / (TILES.peak - 1));
  return 3 * Math.round(TILES.min * k / 3);   // 3의 배수라야 판이 비워진다
}

/**
 * 카메라가 감쌀 상자의 높이.
 *
 * 실측한 더미 꼭대기는 1.2겹에서 2.4, 2.6겹에서 4.1 이다. 다만 그건 한가운데
 * 봉우리 얘기고 귀퉁이는 훨씬 낮으므로, 그 높이를 그대로 담으면 쓸데없이
 * 멀찍이 물러나 판이 작아진다. 봉우리의 3/4 쯤에 맞춘다.
 */
export function boxHeight(spec) {
  return 1.0 + spec.layers;
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
 * 한 판을 깨면 그 판 점수의 1/20 이 골드가 된다. 판이 커질수록 점수도 커지므로
 * 골드도 따라 는다 — 30장 판이 85골드쯤, 300장 판이 700골드쯤이다.
 * 값은 "작은 판을 깨면 잔 것 하나, 큰 판을 깨면 골라 살 수 있다" 가 되게 잡았다.
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
 *
 * 되돌리기·빼내기는 매번 주고, 판이 커질수록 한 번에 더 준다.
 * 뒤집기와 섞기는 판을 통째로 뒤집는 물건이라 확률로만 나온다 —
 * 그냥 쌓이면 어려운 판을 어려운 채로 풀 이유가 없어진다.
 */
export function clearReward(level) {
  const L = Math.max(1, level | 0);
  const step = Math.min(3, 1 + Math.floor(L / 4));   // 4레벨마다 한 개씩 후해진다
  return {
    undo:     step + 1,
    withdraw: step,
    flip:     rnd() < 0.40 ? 1 : 0,
    shuffle:  rnd() < 0.20 ? 1 : 0,
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
