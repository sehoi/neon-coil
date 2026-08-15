// 데이터 조각: 스폰 유지 · 흡인 · 흡수.

import { createPool } from '../core/pool.js';
import { rnd, range } from '../core/rng.js';
import { dist2 } from '../core/vec.js';
import { FOOD, ARENA_RADIUS, COIL } from '../data/tuning.js';
import { C } from '../config.js';
import { addLength } from './coil.js';

export function makeFood() {
  return { x: 0, y: 0, r: 4, value: 1, kind: 'bit', color: C.lime, age: 0,
           pull: null, alive: false };
}

export const KIND_STYLE = {
  bit:    { r: 4, color: C.lime,  value: FOOD.bitValue },
  block:  { r: 7, color: C.gold,  value: FOOD.blockValue },
  debris: { r: 9, color: '#ffffff', value: FOOD.debrisValue },
  leak:   { r: 3, color: C.cyan,  value: FOOD.leakValue },
};

export function createFoodPool() {
  return createPool(makeFood, 2600);
}

export function spawnFood(pool, x, y, kind) {
  const s = KIND_STYLE[kind];
  const f = pool.spawn();
  f.x = x; f.y = y;
  f.r = s.r;
  f.color = s.color;
  f.value = s.value;
  f.kind = kind;
  f.age = rnd() * 10;      // 맥동 위상을 흩어 한꺼번에 깜빡이지 않게
  f.pull = null;
  return f;
}

/** 아레나 안 랜덤 지점 */
export function scatterFood(pool, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * ARENA_RADIUS * 0.98;   // 균등 분포
    spawnFood(pool, Math.cos(a) * d, Math.sin(a) * d, rnd() < FOOD.blockChance ? 'block' : 'bit');
  }
}

/** 코일이 죽으면 몸 길이에 비례한 잔해를 뿌린다. */
export function scatterDebris(pool, c) {
  const n = Math.min(FOOD.deathDropMax, Math.max(6, Math.floor(c.len * FOOD.deathDropRatio / 3)));
  for (let i = 0; i < n; i++) {
    // 몸통을 따라 뿌린다 — 죽은 자리에 길게 남아야 "먹으러 가는" 동선이 생긴다
    const t = i / n;
    const idx = Math.floor(t * Math.max(1, Math.min(c.count, c.len) - 1));
    const px = c.points[((c.head - idx) % COIL.maxLen + COIL.maxLen) % COIL.maxLen * 2];
    const py = c.points[((c.head - idx) % COIL.maxLen + COIL.maxLen) % COIL.maxLen * 2 + 1];
    spawnFood(pool, px + range(-14, 14), py + range(-14, 14), 'debris');
  }
}

// ── 흡인 · 흡수 ─────────────────────────────────────────────
// 콜백은 모듈 스코프 고정 (프레임당 클로저 생성 금지)
let _eatCoil = null, _eatWorld = null;

function _eatCb(f) {
  if (!f.alive) return;
  const c = _eatCoil;
  const reach = c.radius + COIL.magnet;
  const d2 = dist2(c.x, c.y, f.x, f.y);
  if (d2 > reach * reach) return;

  const swallow = c.radius + f.r;
  if (d2 <= swallow * swallow) {
    f.alive = false;
    addLength(c, f.value);
    if (c.isPlayer) _eatWorld.onPlayerEat(f);
    return;
  }
  f.pull = c;   // 흡인 대상 지정 — 이동은 updateFood 가 처리
}

export function eatNearby(world, c) {
  _eatCoil = c;
  _eatWorld = world;
  world.foodGrid.query(c.x, c.y, c.radius + COIL.magnet, _eatCb);
}

export function updateFood(world, dt) {
  world.food.forEach(f => {
    f.age += dt;
    if (f.pull && f.pull.alive) {
      const dx = f.pull.x - f.x, dy = f.pull.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 260 + (1 - Math.min(d / 200, 1)) * 420;
      f.x += (dx / d) * speed * dt;
      f.y += (dy / d) * speed * dt;
    }
    f.pull = null;   // 매 프레임 다시 판정한다
  });
  world.food.compact();

  // 개수 유지 — 화면 밖에서만 보충해 눈앞에 튀어나오지 않게 한다
  const missing = FOOD.target - world.food.count;
  if (missing > 0) {
    const n = Math.min(missing, 24);   // 한 프레임에 몰아 만들지 않는다
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * ARENA_RADIUS * 0.98;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const p = world.player;
      if (p.alive && dist2(x, y, p.x, p.y) < 900 * 900) continue;
      spawnFood(world.food, x, y, rnd() < FOOD.blockChance ? 'block' : 'bit');
    }
  }
}

/** 먹이 전용 그리드 재구축 */
export function buildFoodGrid(world) {
  world.foodGrid.clear();
  world.food.forEach(f => world.foodGrid.insert(f));
}
