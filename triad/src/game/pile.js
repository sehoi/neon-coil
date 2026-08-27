// 타일 더미 — 물리 세계와 게임이 만나는 곳.
// 타일은 상자 안으로 쏟아져 서로 기대고 뒤집힌 채 쌓인다. 규칙은 하나다:
// **앞면(무늬)이 보이면 집을 수 있다.** 층 개념이 없으므로 옆으로 삐져나온 타일도,
// 더미 옆구리에 낀 타일도 무늬만 보이면 집힌다.

import { rnd, shuffle, irange } from '../core/rng.js';
import { v3, qAxisAngle, qMul, qRandom, axis, len2 } from '../core/v3.js';
import { TILE3D, POUR } from '../data/tuning.js';
import {
  createWorld, addBody, removeBody, step as stepWorld, raycast, wake, wakeAll, freeze,
} from './physics.js';

const FACE_UP = qAxisAngle(v3(1, 0, 0), -Math.PI / 2);   // 로컬 +z(앞면)가 위를 본다

export function createPile(spec) {
  // 상자 넓이는 "몇 겹으로 쌓이게 할지"로 정한다
  const area = spec.tiles * (TILE3D.hx * 2) * (TILE3D.hy * 2) / spec.layers;
  const halfX = Math.sqrt(area / (4 * 1.15));
  const halfZ = halfX * 1.15;

  const world = createWorld({ halfX, halfZ });

  // 무늬 가방 — 종류마다 3의 배수로. 3장씩 짝이 맞아야 판이 비워진다
  const triples = spec.tiles / 3;
  const bag = [];
  for (let i = 0; i < triples; i++) bag.push(i % spec.kinds);
  shuffle(bag);
  const kinds = [];
  for (const k of bag) kinds.push(k, k, k);
  shuffle(kinds);

  return {
    world, halfX, halfZ, spec,
    tiles: [],
    kinds,
    poured: 0,
    frame: 0,
    settleT: 0,
  };
}

/** 한 프레임 분량을 쏟는다. 다 쏟았으면 true. */
export function pourTick(pile) {
  pile.frame++;
  if (pile.poured >= pile.spec.tiles) return true;
  if (pile.frame % POUR.everyFrames !== 0) return false;

  for (let k = 0; k < POUR.perWave && pile.poured < pile.spec.tiles; k++) {
    dropOne(pile);
    pile.poured++;
  }
  return pile.poured >= pile.spec.tiles;
}

function dropOne(pile) {
  const { halfX, halfZ } = pile;
  const mx = halfX - 0.8, mz = halfZ - 0.8;

  // 후보 몇 군데를 재서 가장 낮은 곳에 놓는다. 아무 데나 부으면 가운데가
  // 봉우리처럼 솟고, 그러면 옆구리로 흘러내리며 죄다 엎어진다.
  let px = 0, pz = 0, best = Infinity;
  for (let i = 0; i < POUR.spots; i++) {
    const x = (rnd() * 2 - 1) * mx, z = (rnd() * 2 - 1) * mz;
    const h = surfaceAt(pile, x, z);
    if (h < best) { best = h; px = x; pz = z; }
  }

  const body = addBody(pile.world, {
    p: v3(px, best + POUR.height, pz),
    q: spawnRotation(),
    hx: TILE3D.hx, hy: TILE3D.hy, hz: TILE3D.hz,
  });
  body.v.y = -POUR.speed;

  const tile = {
    id: pile.tiles.length,
    kind: pile.kinds[pile.tiles.length],
    body,
    state: 'pile',
  };
  body.tile = tile;
  pile.tiles.push(tile);
  return tile;
}

function spawnRotation() {
  const yaw = qAxisAngle(v3(0, 1, 0), rnd() * Math.PI * 2);
  const tilt = qAxisAngle(v3(1, 0, 0), (rnd() - 0.5) * POUR.tilt);
  return qMul(qMul(yaw, FACE_UP), tilt);
}

/**
 * (x, z) 위 더미의 높이. 타일 발자국 네 귀퉁이까지 재야 비탈 가장자리에서
 * 옆 타일 속에 스폰돼 영영 못 빠져나오는 일이 없다.
 */
function surfaceAt(pile, x, z) {
  let h = 0;
  const o = [[0, 0], [0.55, 0.7], [-0.55, 0.7], [0.55, -0.7], [-0.55, -0.7]];
  for (const [ox, oz] of o) {
    const hit = raycast(pile.world, v3(x + ox, 16, z + oz), v3(0, -1, 0));
    if (hit) h = Math.max(h, 16 - hit.t);
  }
  return h;
}

export function stepPile(pile, dt) {
  const moved = stepWorld(pile.world, dt);
  if (!moved) { pile.settleT = 0; return false; }

  // 다 쏟은 뒤에도 오래 뒤척이면 그냥 세운다. 눈에 안 보이는 미동 때문에
  // 프레임마다 몇 ms 를 계속 쓰는 것이 아깝다.
  if (pile.poured >= pile.spec.tiles) {
    pile.settleT += dt;
    if (pile.settleT > POUR.settleCap) freeze(pile.world);
  }
  return true;
}

// ── 집기 ──────────────────────────────────────────────────────────────────

/**
 * 광선이 처음 맞는 타일. 앞면(로컬 +z)을 맞혔을 때만 집을 수 있다.
 * @returns {{tile, faceUp:boolean}|null}
 */
export function pickRay(pile, ray) {
  const hit = raycast(pile.world, ray.origin, ray.dir);
  if (!hit || !hit.body.tile) return null;
  return {
    tile: hit.body.tile,
    faceUp: hit.faceAxis === 2 && hit.faceSign === 1,
    point: hit.point,
  };
}

/** 판에서 들어낸다. 위에 얹혀 있던 타일들이 무너지도록 주변을 깨운다. */
export function liftTile(pile, tile) {
  const at = { x: tile.body.p.x, y: tile.body.p.y, z: tile.body.p.z };
  tile.lastTransform = { p: at, q: { ...tile.body.q } };
  removeBody(pile.world, tile.body);
  tile.state = 'tray';
  tile.body = null;
  pile.settleT = 0;
  return at;
}

/** 트레이의 타일을 더미 위로 되돌린다 (되돌리기 · 빼내기). */
export function dropBack(pile, tiles) {
  const out = [];
  for (const tile of tiles) {
    const near = tile.lastTransform;
    const px = clamp(near ? near.p.x : 0, -pile.halfX + 0.8, pile.halfX - 0.8);
    const pz = clamp(near ? near.p.z : 0, -pile.halfZ + 0.8, pile.halfZ - 0.8);
    const body = addBody(pile.world, {
      p: v3(px, surfaceAt(pile, px, pz) + 0.9, pz),
      q: spawnRotation(),
      hx: TILE3D.hx, hy: TILE3D.hy, hz: TILE3D.hz,
    });
    body.v.y = -1.5;
    body.tile = tile;
    tile.body = body;
    tile.state = 'pile';
    out.push(tile);
  }
  pile.settleT = 0;
  pile.world.asleep = false;
  return out;
}

/** 섞기 — 남은 타일을 전부 들어 올렸다가 다시 쏟는다. */
export function retoss(pile) {
  const live = pile.tiles.filter(t => t.state === 'pile');
  live.forEach((tile, i) => {
    const b = tile.body;
    b.p.x = (rnd() * 2 - 1) * (pile.halfX - 0.8);
    b.p.z = (rnd() * 2 - 1) * (pile.halfZ - 0.8);
    b.p.y = 1.6 + (i % 6) * 0.55 + rnd() * 0.3;
    b.q = spawnRotation();
    b.v.x = (rnd() - 0.5) * 1.2; b.v.y = -1; b.v.z = (rnd() - 0.5) * 1.2;
    b.w.x = (rnd() - 0.5) * 2.5; b.w.y = (rnd() - 0.5) * 2.5; b.w.z = (rnd() - 0.5) * 2.5;
    wake(b);
    b.sleepT = 0;
  });
  pile.world.asleep = false;
  pile.settleT = 0;
  return live.length;
}

/**
 * 뒤집기 — 엎어진 타일을 뒤집는다. 위가 트인 것만 뒤집을 수 있다
 * (더미 속에 낀 타일을 뒤집으면 이웃을 뚫고 들어간다).
 * @returns {number} 뒤집은 장수
 */
export function flipDown(pile, limit = 8) {
  const cands = [];
  for (const tile of pile.tiles) {
    if (tile.state !== 'pile') continue;
    // 엎어진 것뿐 아니라 '모로 선' 것도 대상이다. 옆으로 선 타일은 무늬가
    // 위를 보지 않아 집을 수 없는데, 뒤집기까지 건너뛰면 영영 굳어 버린다.
    if (axis(tile.body.R, 2).y > 0.3) continue;
    const above = raycast(pile.world, v3(tile.body.p.x, 16, tile.body.p.z), v3(0, -1, 0));
    if (!above || above.body !== tile.body) continue;      // 위에 뭔가 덮여 있다
    cands.push(tile);
  }
  cands.sort((a, b) => b.body.p.y - a.body.p.y);

  const flipped = cands.slice(0, limit);
  for (const tile of flipped) {
    const b = tile.body;
    b.q = qMul(faceUpDelta(axis(b.R, 2)), b.q);
    b.p.y += 0.34;
    b.v.x = 0; b.v.y = 0.3; b.v.z = 0;
    b.w.x = 0; b.w.y = 0; b.w.z = 0;
    wake(b);
    b.sleepT = 0;
  }
  if (flipped.length) { pile.world.asleep = false; pile.settleT = 0; }
  return flipped.length;
}

/** 지금 앞면이 향한 방향 n 을 위(+y)로 돌리는 회전. */
function faceUpDelta(n) {
  const d = n.y;
  if (d > 0.9999) return { x: 0, y: 0, z: 0, w: 1 };
  if (d < -0.9999) return qAxisAngle(v3(1, 0, 0), Math.PI);
  const axisV = { x: n.z, y: 0, z: -n.x };          // cross(n, +y)
  return qAxisAngle(axisV, Math.acos(Math.max(-1, Math.min(1, d))));
}

// ── 조회 ──────────────────────────────────────────────────────────────────

export function pileTiles(pile) {
  return pile.tiles.filter(t => t.state === 'pile');
}

export function remaining(pile) {
  let n = 0;
  for (const t of pile.tiles) if (t.state !== 'gone') n++;
  return n;
}

/**
 * 집을 수 있는 타일이 하나라도 있는가 — 타일당 광선 하나로 싸게 본다.
 *
 * 남은 타일이 전부 엎어져 있으면 아무것도 집을 수 없고, 트레이는 차지 않으니
 * 지지도 않는다. 그대로 굳어 버리는 그 상황만 잡아내면 된다.
 * 앞면 한가운데만 보므로 "구석만 삐죽 보이는" 타일은 놓친다 — 그래서 이 검사가
 * 실패하면 곧바로 구제하지 않고, 표본을 더 쓰는 visibleFront 로 한 번 더 확인한다.
 */
export function hasPlayable(pile, eye) {
  for (const tile of pile.tiles) {
    if (tile.state !== 'pile') continue;
    const b = tile.body;
    const front = axis(b.R, 2);
    const cx = b.p.x + front.x * b.hz, cy = b.p.y + front.y * b.hz, cz = b.p.z + front.z * b.hz;
    const dx = cx - eye.x, dy = cy - eye.y, dz = cz - eye.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const dir = { x: dx / l, y: dy / l, z: dz / l };
    if (front.x * dir.x + front.y * dir.y + front.z * dir.z > -0.15) continue;   // 앞면이 카메라를 등졌다
    const hit = raycast(pile.world, eye, dir);
    if (hit && hit.body === b && hit.faceAxis === 2 && hit.faceSign === 1) return true;
  }
  return false;
}

/**
 * 지금 화면에서 앞면이 보이는 타일들. 카메라에서 표본 광선을 쏘아 실제로 확인한다.
 * 매 프레임 돌릴 만큼 싸지 않다 — 힌트와 검증에만 쓴다.
 */
export function visibleFront(pile, cam, screenRay, samples = 5) {
  const out = [];
  const grid = [[0, 0], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]].slice(0, samples);
  for (const tile of pile.tiles) {
    if (tile.state !== 'pile') continue;
    const b = tile.body;
    let seen = false;
    for (const [u, v] of grid) {
      const local = { x: u * b.hx * 1.4, y: v * b.hy * 1.4, z: b.hz };
      const world = {
        x: b.p.x + b.R[0] * local.x + b.R[1] * local.y + b.R[2] * local.z,
        y: b.p.y + b.R[3] * local.x + b.R[4] * local.y + b.R[5] * local.z,
        z: b.p.z + b.R[6] * local.x + b.R[7] * local.y + b.R[8] * local.z,
      };
      const sp = cam.projectPoint(world);
      if (!sp) continue;
      const hit = pickRay(pile, screenRay(sp.x, sp.y));
      if (hit && hit.tile === tile && hit.faceUp) { seen = true; break; }
    }
    if (seen) out.push(tile);
  }
  return out;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
