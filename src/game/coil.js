// 코일: 머리 이동 + 궤적 몸통.
//
// 핵심 결정 — 세그먼트가 앞을 따라가는 스프링 방식이 아니라,
// **머리 궤적을 기록하고 그 점들이 곧 몸통**이다. 머리 하나만 움직이면 되므로
// 길이 400짜리 20기라도 프레임당 이동 계산은 20회다.

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

    len: COIL.startLen,       // 논리 길이 = 궤적 점 개수
    lenFrac: 0,               // 소수점 누적 (먹이/부스트로 조금씩 변한다)
    radius: COIL.radiusMin,
    spacing: 4,

    // 궤적 원형 버퍼 [x0,y0,x1,y1,...]. head 가 최신.
    points: new Float32Array(COIL.maxLen * 2),
    head: 0,
    count: 0,
    sinceLastPoint: 0,

    alive: false,
    isPlayer: false,
    color: C.cyan,
    name: '',
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
  c.lenFrac = 0;
  c.radius = radiusFor(c.len);
  c.spacing = c.radius * COIL.spacingRatio;
  c.head = 0;
  c.count = 0;
  c.sinceLastPoint = 0;
  c.alive = true;
  c.godMode = false;   // 재시작하면 테스트 플래그가 남지 않게 한다
  c.isPlayer = isPlayer;
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

  // 부스트: 길이를 태워 속도를 얻는다
  const canBoost = c.boosting && c.len > COIL.boostMinLen;
  c.speed = canBoost ? COIL.boostSpeed : COIL.speed;
  if (canBoost) {
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

/** 길이를 늘리거나 줄인다. 소수점은 누적해서 처리한다. */
export function addLength(c, amount) {
  c.lenFrac += amount;
  const whole = Math.trunc(c.lenFrac);
  if (whole !== 0) {
    c.lenFrac -= whole;
    c.len = Math.max(5, Math.min(COIL.maxLen, c.len + whole));
  }
}

export function headHitRadius(c) {
  return c.radius * COIL.headHitRatio;
}

/** 아레나 밖으로 나갔는가 */
export function outOfBounds(c) {
  return Math.hypot(c.x, c.y) > ARENA_RADIUS;
}

export function randomSpawnPoint() {
  // 경계에서 조금 안쪽, 랜덤 방향
  const a = rnd() * TAU;
  const d = range(ARENA_RADIUS * 0.35, ARENA_RADIUS * 0.85);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d, angle: a + Math.PI + range(-0.6, 0.6) };
}
