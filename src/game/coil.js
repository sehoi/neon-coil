// 코일: 머리 이동 + 궤적 몸통.
//
// 핵심 결정 — 세그먼트가 앞을 따라가는 스프링 방식이 아니라,
// **머리 궤적을 기록하고 그 점들이 곧 몸통**이다. 머리 하나만 움직이면 되므로
// 길이 400짜리 15기라도 프레임당 이동 계산은 15회다.

import { COIL, turnRateFor, radiusFor, ARENA_RADIUS } from '../data/tuning.js';
import { wrapAngle, TAU } from '../core/vec.js';
import { rnd, range, pick } from '../core/rng.js';
import { NPC_COLORS, C } from '../config.js';
import { NPC_NAMES } from '../data/names.js';

export function createCoil() {
  return {
    x: 0, y: 0,
    angle: 0,
    targetAngle: 0,
    speed: COIL.speed,
    boosting: false,

    // 논리 길이 = 궤적 점 개수.
    // targetLen 이 "실제로 먹은 길이", len 은 "지금 화면에 보이는 길이"다.
    // 둘을 나눈 이유 — len 을 즉시 바꾸면 꼬리 끝이 과거 궤적으로 순간이동해
    // "꼬리가 사라지는 게 아니라 다시 생기는" 것처럼 보인다.
    len: COIL.startLen,
    targetLen: COIL.startLen,
    lenFrac: 0,               // 소수점 누적 (먹이/부스트로 조금씩 변한다)
    radius: COIL.radiusMin,
    spacing: 4,

    // 궤적 원형 버퍼 [x0,y0,x1,y1,...]. head 가 최신.
    points: new Float32Array(COIL.maxLen * 2),
    head: 0,
    count: 0,
    sinceLastPoint: 0,

    // 강화 효과 남은 시간
    shieldT: 0, surgeT: 0, magnetT: 0,

    alive: false,
    isPlayer: false,
    color: C.cyan,
    name: '',
    // 누적 점수. 길이와 달리 상한이 없고, 부스트로 길이를 태워도 줄지 않는다.
    score: 0,
    kills: 0,
    aiTimer: 0,
    ai: null,
    respawnIn: 0,
  };
}

export function spawnCoil(c, x, y, angle, isPlayer, index) {
  c.x = x; c.y = y;
  c.angle = angle;
  c.targetAngle = angle;
  c.boosting = false;
  c.len = COIL.startLen;
  c.targetLen = COIL.startLen;
  c.lenFrac = 0;
  c.radius = radiusFor(c.len);
  c.spacing = c.radius * COIL.spacingRatio;
  c.head = 0;
  c.count = 0;
  c.sinceLastPoint = 0;
  c.alive = true;
  c.shieldT = 0; c.surgeT = 0; c.magnetT = 0;
  c.godMode = false;   // 재시작하면 테스트 플래그가 남지 않게 한다
  c.isPlayer = isPlayer;
  c.score = 0;
  c.kills = 0;
  c.aiTimer = 0;
  c.respawnIn = 0;
  c.color = isPlayer ? C.cyan : NPC_COLORS[index % NPC_COLORS.length];
  c.name = isPlayer ? 'YOU' : NPC_NAMES[index % NPC_NAMES.length];

  // 시작 몸통을 뒤쪽으로 깔아둔다 (한 점에 뭉쳐 있으면 첫 프레임에 이상하게 보인다)
  for (let i = 0; i < c.len; i++) {
    pushPoint(c, x - Math.cos(angle) * c.spacing * i, y - Math.sin(angle) * c.spacing * i);
  }
  return c;
}

/** 궤적에 점 하나 추가. 버퍼가 가득 차면 가장 오래된 점을 덮는다. */
function pushPoint(c, x, y) {
  c.head = (c.head + 1) % COIL.maxLen;
  c.points[c.head * 2] = x;
  c.points[c.head * 2 + 1] = y;
  if (c.count < COIL.maxLen) c.count++;
}

/** i 번째 세그먼트(0 = 머리 쪽)의 버퍼 인덱스 */
export function segIndex(c, i) {
  return ((c.head - i) % COIL.maxLen + COIL.maxLen) % COIL.maxLen;
}

export function segX(c, i) { return c.points[segIndex(c, i) * 2]; }
export function segY(c, i) { return c.points[segIndex(c, i) * 2 + 1]; }

/** 실제로 몸통으로 보이는 세그먼트 개수 */
export function bodyCount(c) {
  return Math.min(c.count, Math.floor(c.len));
}

export function updateCoil(c, dt, world) {
  if (!c.alive) return;

  // 목표 각도로 turnRate 만큼만 꺾는다 — 즉시 꺾이면 회피가 무의미해진다
  const turn = turnRateFor(c.len) * dt;
  const diff = wrapAngle(c.targetAngle - c.angle);
  c.angle += Math.abs(diff) <= turn ? diff : Math.sign(diff) * turn;

  easeLength(c, dt);

  c.shieldT = Math.max(0, c.shieldT - dt);
  c.surgeT = Math.max(0, c.surgeT - dt);
  c.magnetT = Math.max(0, c.magnetT - dt);

  // 부스트: 길이를 태워 속도를 얻는다 (서지 중에는 공짜)
  const canBoost = c.boosting && (c.surgeT > 0 || c.targetLen > COIL.boostMinLen);
  c.speed = canBoost ? COIL.boostSpeed : COIL.speed;
  if (canBoost && c.surgeT <= 0) {
    const drain = COIL.boostDrainPerSec * dt;
    addLength(c, -drain);
    // 태운 만큼 꼬리에서 흘린다 — 남이 주울 수 있어야 추격에 의미가 생긴다
    c.leakAcc = (c.leakAcc || 0) + drain;
    while (c.leakAcc >= 1) {
      c.leakAcc -= 1;
      const t = bodyCount(c) - 1;
      if (t > 0) world.spawnLeak(segX(c, t), segY(c, t));
    }
  }

  const prevX = c.x, prevY = c.y;
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;

  c.radius = radiusFor(c.len);
  c.spacing = c.radius * COIL.spacingRatio;

  // 이동 거리가 spacing 을 넘으면 그 사이를 보간해 점을 채운다.
  // (부스트 중 한 프레임에 spacing 을 넘게 이동해도 몸이 끊기지 않게)
  const moved = Math.hypot(c.x - prevX, c.y - prevY);
  c.sinceLastPoint += moved;
  let guard = 0;
  while (c.sinceLastPoint >= c.spacing && guard++ < 16) {
    const back = c.sinceLastPoint - c.spacing;
    const t = moved > 0 ? 1 - back / moved : 1;
    pushPoint(c, prevX + (c.x - prevX) * t, prevY + (c.y - prevY) * t);
    c.sinceLastPoint -= c.spacing;
  }
}

/** 길이를 늘리거나 줄인다. 실제 반영은 updateCoil 이 부드럽게 따라간다. */
export function addLength(c, amount) {
  c.lenFrac += amount;
  const whole = Math.trunc(c.lenFrac);
  if (whole !== 0) {
    c.lenFrac -= whole;
    c.targetLen = Math.max(5, Math.min(COIL.maxLen, c.targetLen + whole));
  }
}

/**
 * 보이는 길이를 목표 길이로 수렴시킨다.
 * 즉시 바꾸면 꼬리 끝이 과거 궤적으로 순간이동해 몸이 되살아난 것처럼 보인다.
 */
function easeLength(c, dt) {
  const diff = c.targetLen - c.len;
  if (Math.abs(diff) < 0.5) { c.len = c.targetLen; return; }
  c.len += diff * Math.min(1, dt * 7);
}

export function headHitRadius(c) {
  return c.radius * COIL.headHitRatio;
}

/** 아레나 밖으로 나갔는가 */
export function outOfBounds(c) {
  return Math.hypot(c.x, c.y) > ARENA_RADIUS;
}

const SPAWN_CLEARANCE = 420;   // 다른 코일 몸통에서 이만큼은 떨어져야 한다

/**
 * 리스폰 지점.
 *
 * 순수 랜덤이면 하필 플레이어 머리 위에 나타나 태어나자마자 죽는 일이 생긴다.
 * 다른 코일의 몸통에서 충분히 떨어진 곳을 몇 번 찾아보고,
 * 끝내 못 찾으면 그중 가장 여유로운 후보를 쓴다.
 */
export function randomSpawnPoint(world) {
  let best = null, bestClear = -1;

  for (let attempt = 0; attempt < 12; attempt++) {
    const a = rnd() * TAU;
    const d = range(ARENA_RADIUS * 0.30, ARENA_RADIUS * 0.85);
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    const clear = world ? nearestCoilDistance(world, x, y) : Infinity;
    if (clear > bestClear) {
      bestClear = clear;
      best = { x, y, angle: a + Math.PI + range(-0.6, 0.6) };
    }
    if (clear >= SPAWN_CLEARANCE) break;
  }
  return best;
}

/** (x,y) 에서 가장 가까운 코일 세그먼트까지의 거리 */
function nearestCoilDistance(world, x, y) {
  let best = Infinity;
  for (const c of world.coils) {
    if (!c.alive) continue;
    // 머리는 반드시 보고, 몸통은 성기게 훑는다 (정확도보다 속도)
    const dh = Math.hypot(c.x - x, c.y - y);
    if (dh < best) best = dh;
    const n = bodyCount(c);
    for (let i = 6; i < n; i += 12) {
      const d = Math.hypot(segX(c, i) - x, segY(c, i) - y);
      if (d < best) best = d;
    }
  }
  return best;
}
