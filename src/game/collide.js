// 충돌: 세그먼트를 공간 해시에 등록하고 머리만 조회한다.
//
// 절약 지점 — 몸통 세그먼트를 전부 등록하지 않는다. 세그먼트 간격이 반지름의 0.55배라
// 3개 걸러 하나만 넣어도 반지름으로 빈틈 없이 덮인다. 등록 개수가 1/3 로 준다.
//
// 콜백은 모듈 스코프에 고정한다. 인라인 화살표로 두면 프레임당 수천 개의 클로저가
// 생겨 GC 가 p99 를 끌어올린다 (NEON PURGE 에서 실측으로 확인한 문제).

import { segX, segY, bodyCount, headHitRadius } from './coil.js';
import { dist2 } from '../core/vec.js';

const SEG_STRIDE = 3;

// 등록용 세그먼트 레코드 풀 — 프레임당 할당 0
let _segPool = [];
let _segUsed = 0;

function takeSeg() {
  if (_segUsed >= _segPool.length) {
    _segPool.push({ x: 0, y: 0, r: 0, coil: null });
  }
  return _segPool[_segUsed++];
}

/** 살아 있는 모든 코일의 몸통을 그리드에 넣는다. */
export function buildSegmentGrid(world) {
  const grid = world.grid;
  grid.clear();
  _segUsed = 0;

  for (const c of world.coils) {
    if (!c.alive) continue;
    const n = bodyCount(c);
    // 머리 바로 뒤 몇 개는 등록하지 않는다 — 자기 몸에 스치는 판정을 원천 차단
    for (let i = 4; i < n; i += SEG_STRIDE) {
      const s = takeSeg();
      s.x = segX(c, i);
      s.y = segY(c, i);
      s.r = c.radius;
      s.coil = c;
      grid.insert(s);
    }
  }
}

// ── 머리 vs 몸통 ────────────────────────────────────────────
let _hitSelf = null;
let _hitFound = null;

function _segHitCb(s) {
  if (_hitFound || s.coil === _hitSelf) return;   // 자기 몸통과는 충돌하지 않는다
  const c = _hitSelf;
  const reach = headHitRadius(c) + s.r;
  if (dist2(c.x, c.y, s.x, s.y) <= reach * reach) _hitFound = s.coil;
}

/**
 * 이 코일의 머리가 남의 몸통에 닿았는가.
 * @returns {object|null} 부딪힌 상대 코일
 */
export function headHitsBody(world, c) {
  _hitSelf = c;
  _hitFound = null;
  world.grid.query(c.x, c.y, headHitRadius(c) + 26, _segHitCb);
  return _hitFound;
}

/**
 * 머리끼리의 정면충돌. 코일 수가 20 남짓이라 전수 비교(190쌍)가 그리드보다 싸다.
 * 짧은 쪽이 죽고, 같으면 둘 다 죽는다.
 */
export function resolveHeadCollisions(world, onDeath) {
  const list = world.coils;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive) continue;
      const reach = headHitRadius(a) + headHitRadius(b);
      if (dist2(a.x, a.y, b.x, b.y) > reach * reach) continue;

      if (a.len > b.len)      onDeath(b, a);
      else if (b.len > a.len) onDeath(a, b);
      else { onDeath(a, b); onDeath(b, a); }
    }
  }
}
