// NPC 조종. 벡터를 합산해 targetAngle 하나를 만든다.
//
// 비용 관리 두 가지:
//  1. 6프레임에 한 번만 판단한다 (그 사이에는 마지막 목표각으로 계속 회전).
//     15기 × 60fps = 900회/초가 150회/초가 되고, 체감 차이는 없다.
//  2. 먹이·위험 탐색은 각각 그리드 조회 1회. 전체 순회 금지.
//
// 목표는 "완벽한 AI"가 아니라 **가끔 나를 죽이고 자기들끼리도 죽는** 수준이다.

import { NPC, ARENA_RADIUS, COIL } from '../data/tuning.js';
import { rnd, range } from '../core/rng.js';
import { dist2, wrapAngle } from '../core/vec.js';

export function makeAI(index) {
  // 비율대로 성격을 배분한다 (랜덤보다 분포가 안정적이다)
  let kind = 'feeder';
  const r = (index % 10) / 10;
  if (r >= 0.5 && r < 0.8) kind = 'hunter';
  else if (r >= 0.8) kind = 'cautious';
  return {
    kind,
    wander: rnd() * Math.PI * 2,
    boostUrge: 0,
  };
}

// 모듈 스코프 누산기 — 프레임당 할당 0
let _ax = 0, _ay = 0;
let _self = null, _world = null;
let _bestFood = null, _bestFoodD2 = 0;
let _dangerCount = 0;

function _foodCb(f) {
  if (!f.alive) return;
  const d2 = dist2(_self.x, _self.y, f.x, f.y);
  if (d2 < _bestFoodD2) { _bestFoodD2 = d2; _bestFood = f; }
}

function _dangerCb(s) {
  if (s.coil === _self) return;
  const c = _self;
  const dx = s.x - c.x, dy = s.y - c.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) return;

  // 전방 부채꼴 안에 있는 것만 위험으로 친다 — 뒤쪽 몸통은 피할 필요가 없다
  const ang = Math.atan2(dy, dx);
  if (Math.abs(wrapAngle(ang - c.angle)) > NPC.dangerCone) return;

  const d = Math.sqrt(d2);
  const w = (1 - d / NPC.dangerSenseRadius) / d;   // 가까울수록 강하게
  _ax -= dx * w * NPC.wDanger;
  _ay -= dy * w * NPC.wDanger;
  _dangerCount++;
}

export function steerAI(c, world, dt) {
  c.aiTimer -= 1;
  if (c.aiTimer > 0) return;
  c.aiTimer = NPC.aiIntervalFrames;

  _self = c; _world = world;
  _ax = 0; _ay = 0;
  _dangerCount = 0;

  // ── 위험 회피 (최우선) ──
  world.grid.query(c.x, c.y, NPC.dangerSenseRadius, _dangerCb);

  // ── 경계 회피 ──
  const distFromCenter = Math.hypot(c.x, c.y);
  const margin = ARENA_RADIUS - distFromCenter;
  if (margin < 400) {
    const w = (1 - margin / 400) * NPC.wBoundary;
    const d = distFromCenter || 1;
    _ax -= (c.x / d) * w;
    _ay -= (c.y / d) * w;
  }

  // ── 먹이 유인 ──
  _bestFood = null;
  _bestFoodD2 = NPC.foodSenseRadius * NPC.foodSenseRadius;
  world.foodGrid.query(c.x, c.y, NPC.foodSenseRadius, _foodCb);
  if (_bestFood) {
    const dx = _bestFood.x - c.x, dy = _bestFood.y - c.y;
    const d = Math.sqrt(_bestFoodD2) || 1;
    _ax += (dx / d) * NPC.wFood;
    _ay += (dy / d) * NPC.wFood;
  }

  // ── 사냥형: 짧은 상대의 진로 앞을 막는다 ──
  if (c.ai.kind === 'hunter' && _dangerCount === 0) {
    let target = null, bestD2 = NPC.interceptRadius * NPC.interceptRadius;
    for (const o of world.coils) {
      if (!o.alive || o === c || o.len >= c.len * 0.9) continue;
      const d2 = dist2(c.x, c.y, o.x, o.y);
      if (d2 < bestD2) { bestD2 = d2; target = o; }
    }
    if (target) {
      // 상대가 갈 자리를 노린다
      const lead = Math.min(260, Math.sqrt(bestD2) * 0.7);
      const px = target.x + Math.cos(target.angle) * lead;
      const py = target.y + Math.sin(target.angle) * lead;
      const dx = px - c.x, dy = py - c.y;
      const d = Math.hypot(dx, dy) || 1;
      _ax += (dx / d) * NPC.wIntercept;
      _ay += (dy / d) * NPC.wIntercept;
      c.ai.boostUrge = bestD2 < 300 * 300 ? 0.9 : 0;
    } else {
      c.ai.boostUrge = 0;
    }
  }

  // ── 신중형: 큰 코일 근처에 아예 안 간다 ──
  if (c.ai.kind === 'cautious') {
    for (const o of world.coils) {
      if (!o.alive || o === c || o.len < c.len * 1.2) continue;
      const dx = c.x - o.x, dy = c.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > NPC.cautiousKeepOut * NPC.cautiousKeepOut || d2 < 1) continue;
      const d = Math.sqrt(d2);
      const w = (1 - d / NPC.cautiousKeepOut) * 3;
      _ax += (dx / d) * w;
      _ay += (dy / d) * w;
    }
  }

  // ── 아무 신호도 없으면 완만하게 배회 ──
  if (_ax === 0 && _ay === 0) {
    c.ai.wander += range(-0.4, 0.4);
    _ax = Math.cos(c.ai.wander);
    _ay = Math.sin(c.ai.wander);
  }

  c.targetAngle = Math.atan2(_ay, _ax);

  // 부스트: 위험에서 탈출하거나 사냥을 마무리할 때만
  const escaping = _dangerCount >= 2;
  c.boosting = (escaping || rnd() < c.ai.boostUrge) && c.len > COIL.boostMinLen + 10;
}
