// 타일 더미 — 물리 세계와 게임이 만나는 곳.
// 타일은 상자 안으로 쏟아져 서로 기대고 뒤집힌 채 쌓인다. 규칙은 하나다:
// **앞면(무늬)이 보이면 집을 수 있다.** 층 개념이 없으므로 옆으로 삐져나온 타일도,
// 더미 옆구리에 낀 타일도 무늬만 보이면 집힌다.

import { rnd, shuffle } from '../core/rng.js';
import { v3, qAxisAngle, qMul } from '../core/v3.js';
import { TILE3D, POUR } from '../data/tuning.js';
import { chooseKinds } from '../data/symbols.js';
import {
  createWorld, addBody, removeBody, step as stepWorld, raycast, freeze,
} from './physics.js';

const FACE_UP = qAxisAngle(v3(1, 0, 0), -Math.PI / 2);   // 로컬 +z(앞면)가 위를 본다

/** 정렬했을 때 칸과 칸 사이 틈. 딱 붙이면 어디서 한 장이 끝나는지 안 보인다. */
const ALIGN_GAP = 0.04;

export function createPile(spec) {
  // 상자 넓이는 "몇 겹으로 쌓이게 할지"로 정한다
  const area = spec.tiles * (TILE3D.hx * 2) * (TILE3D.hy * 2) / spec.layers;
  const halfX = Math.sqrt(area / (4 * 1.15));
  const halfZ = halfX * 1.15;

  const world = createWorld({ halfX, halfZ });

  // 무늬 가방 — 종류마다 3의 배수로. 3장씩 짝이 맞아야 판이 비워진다.
  // 어떤 무늬를 쓸지는 세트에서 뽑는다 (data/symbols.js).
  const picked = chooseKinds(spec.sets || 5, spec.kinds);
  const triples = spec.tiles / 3;
  const bag = [];
  for (let i = 0; i < triples; i++) bag.push(picked[i % picked.length]);
  shuffle(bag);
  const kinds = [];
  for (const k of bag) kinds.push(k, k, k);
  shuffle(kinds);

  return {
    world, halfX, halfZ, spec,
    tiles: [],
    kinds,
    queue: [],          // 다시 쏟기를 기다리는 타일들
    poured: 0,
    frame: 0,
    settleT: 0,
  };
}

/** 한 프레임 분량을 쏟는다. 다 쏟았으면 true. */
export function pourTick(pile) {
  pile.frame++;

  // 섞기로 다시 쏟는 중이면 큐에 든 타일부터 내려놓는다 (처음 쏟는 것과 같은 방식)
  if (pile.queue.length) {
    if (pile.frame % POUR.everyFrames !== 0) return false;
    for (let k = 0; k < POUR.perWave && pile.queue.length; k++) placeTile(pile, pile.queue.shift());
    return pile.queue.length === 0;
  }

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

/** 이미 있는 타일(몸이 없는 'wait' 상태)을 더미 위에 다시 내려놓는다. */
function placeTile(pile, tile) {
  const { halfX, halfZ } = pile;
  const mx = halfX - 0.8, mz = halfZ - 0.8;
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
  body.tile = tile;
  tile.body = body;
  tile.state = 'pile';
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
  if (pile.poured >= pile.spec.tiles && !pile.queue.length) {
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
  removeBody(pile.world, tile.body);   // 주변만 깨운다 (반경은 physics.js)
  tile.state = 'tray';
  tile.body = null;
  pile.settleT = 0;
  return at;
}

/**
 * 트레이의 타일을 더미로 되돌린다.
 * @param toss true 면 원래 자리가 아니라 **아무 데나** 던져 넣는다. 도로 집으면
 *             그만인 되돌리기를 대가 있는 선택으로 만드는 것이 목적이다 —
 *             어디에 떨어져 무엇을 무너뜨릴지는 던져 봐야 안다.
 */
export function dropBack(pile, tiles, { toss = false } = {}) {
  const out = [];
  for (const tile of tiles) {
    const near = toss ? null : tile.lastTransform;
    const mx = pile.halfX - 0.8, mz = pile.halfZ - 0.8;
    const px = near ? clamp(near.p.x, -mx, mx) : (rnd() * 2 - 1) * mx;
    const pz = near ? clamp(near.p.z, -mz, mz) : (rnd() * 2 - 1) * mz;
    const body = addBody(pile.world, {
      p: v3(px, surfaceAt(pile, px, pz) + (toss ? 1.8 : 0.9), pz),
      q: spawnRotation(),
      hx: TILE3D.hx, hy: TILE3D.hy, hz: TILE3D.hz,
    });
    body.v.y = -1.5;
    if (toss) {
      body.v.x = (rnd() - 0.5) * 2.4;
      body.v.z = (rnd() - 0.5) * 2.4;
      body.w.x = (rnd() - 0.5) * 5; body.w.y = (rnd() - 0.5) * 5; body.w.z = (rnd() - 0.5) * 5;
    }
    body.tile = tile;
    tile.body = body;
    tile.state = 'pile';
    out.push(tile);
  }
  pile.settleT = 0;
  pile.world.asleep = false;
  return out;
}

/**
 * 섞기 — 판을 통째로 걷어내고 **처음 세팅 때와 똑같이** 다시 쏟는다.
 * 한 번에 들었다 놓으면 원래 모양이 어렴풋이 남는다. 큐에 넣어 한 장씩
 * 내려놓아야 진짜로 새 판이 된다.
 * @returns {number} 다시 쏟을 장수
 */
export function retoss(pile) {
  const live = pile.tiles.filter(t => t.state === 'pile');
  for (const tile of live) {
    removeBody(pile.world, tile.body);
    tile.body = null;
    tile.state = 'wait';          // 몸이 없는 동안 — 그리지도, 맞히지도 않는다
  }
  shuffle(live);
  pile.queue = live;
  pile.frame = 0;
  pile.settleT = 0;
  pile.world.asleep = false;
  return live.length;
}

/**
 * 정렬 — 타일을 **제 자리에 가장 가까운 칸**에 눕혀 층끼리 정확히 포개 놓는다.
 *
 * 자리를 한 톨도 안 옮기면 층이 반 칸씩 어긋나 옆면만 잔뜩 보이는 계단이 된다.
 * 그렇다고 처음부터 다시 늘어놓으면 어디를 팠는지가 다 날아간다. 그래서 칸은
 * 나누되 **원래 있던 자리에서 가장 가까운 칸**으로 보낸다 — 두껍던 쪽은 그대로
 * 두껍고, 파 놓은 자리는 그대로 비어 있다.
 *
 * 같은 칸에 여러 장이 오면 그 칸에서 정확히 포개어 쌓는다. 방위도 전부 0 으로
 * 맞춘다. 한 장이라도 비스듬하면 그 기둥은 포개지지 않는다.
 * @returns {number} 정렬한 장수
 */
export function alignAll(pile) {
  const live = pile.tiles.filter(t => t.state === 'pile');
  if (!live.length) return 0;

  const cw = TILE3D.hx * 2 + ALIGN_GAP, ch = TILE3D.hy * 2 + ALIGN_GAP;
  const cols = Math.max(1, Math.floor(pile.halfX * 2 / cw));
  const rows = Math.max(1, Math.floor(pile.halfZ * 2 / ch));
  const x0 = -(cols - 1) * cw / 2;             // 첫 칸의 중심
  const z0 = -(rows - 1) * ch / 2;
  const stack = new Int32Array(cols * rows);   // 칸마다 몇 장 쌓였는지

  // 아래에 있던 것이 아래로 간다 — 쌓인 순서가 곧 더미의 모양이다
  live.sort((a, b) => a.body.p.y - b.body.p.y);
  for (const tile of live) {
    const cx = clamp(Math.round((tile.body.p.x - x0) / cw), 0, cols - 1);
    const cz = clamp(Math.round((tile.body.p.z - z0) / ch), 0, rows - 1);
    const layer = stack[cz * cols + cx]++;

    removeBody(pile.world, tile.body);
    const body = addBody(pile.world, {
      p: v3(x0 + cx * cw, TILE3D.hz + layer * TILE3D.hz * 2, z0 + cz * ch),
      q: FACE_UP,
      hx: TILE3D.hx, hy: TILE3D.hy, hz: TILE3D.hz,
    });
    body.tile = tile;
    tile.body = body;
  }
  // 자리를 다 잡아 놓았으므로 그대로 재운다. 물리에 맡기면 기둥이 무너져
  // 무늬를 다 보여 준다는 약속이 깨진다.
  freeze(pile.world);
  pile.settleT = 0;
  return live.length;
}

/** 무늬가 kind 인 타일을 위에 있는 것부터 n 장 고른다 (빼내기). */
export function topOfKind(pile, kind, n) {
  return pile.tiles
    .filter(t => t.state === 'pile' && t.kind === kind)
    .sort((a, b) => b.body.p.y - a.body.p.y)
    .slice(0, n);
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
 * 지금 화면에서 눌러서 집을 수 있는 타일들. 카메라에서 표본 광선을 쏘아 실제로 확인한다.
 *
 * 매 프레임 돌릴 만큼 싸지 않다 — 힌트와 검증에만 쓴다.
 * @param frontOnly true 면 무늬(앞면)가 보이는 것만. 엎어진 것도 집을 수는 있지만
 *                  무엇인지 모르고 집는 것이므로, 봇과 힌트는 아는 것만 세야 한다.
 */
export function visibleTiles(pile, cam, screenRay, { frontOnly = false, samples = 5 } = {}) {
  const out = [];
  const grid = [[0, 0], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]].slice(0, samples);
  for (const tile of pile.tiles) {
    if (tile.state !== 'pile') continue;
    const b = tile.body;
    let seen = false;
    for (const [u, v] of grid) {
      // 앞면 표본이 안 보이면 뒷면 표본도 본다 (엎어진 타일은 뒷면이 보인다)
      for (const face of frontOnly ? [1] : [1, -1]) {
        const local = { x: u * b.hx * 1.4, y: v * b.hy * 1.4, z: b.hz * face };
        const world = {
          x: b.p.x + b.R[0] * local.x + b.R[1] * local.y + b.R[2] * local.z,
          y: b.p.y + b.R[3] * local.x + b.R[4] * local.y + b.R[5] * local.z,
          z: b.p.z + b.R[6] * local.x + b.R[7] * local.y + b.R[8] * local.z,
        };
        const sp = cam.projectPoint(world);
        if (!sp) continue;
        const hit = pickRay(pile, screenRay(sp.x, sp.y));
        if (hit && hit.tile === tile && (!frontOnly || hit.faceUp)) { seen = true; break; }
      }
      if (seen) break;
    }
    if (seen) out.push(tile);
  }
  return out;
}

/** 무늬가 보이는 타일들 — 무엇인지 알고 집을 수 있는 것. */
export function visibleFront(pile, cam, screenRay, samples = 5) {
  return visibleTiles(pile, cam, screenRay, { frontOnly: true, samples });
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ── 저장과 복원 ───────────────────────────────────────────────────────────

const R4 = (v) => Math.round(v * 1e4) / 1e4;   // 소수 넷째 자리면 눈으로 같은 자리다

/** 더미를 그대로 적어 둔다. 타일마다 무늬·상태와, 판 위에 있으면 위치·자세. */
export function serializePile(pile) {
  return pile.tiles.map((t) => {
    const inPile = t.state !== 'tray' && t.state !== 'gone';
    const row = [t.kind, inPile ? 0 : t.state === 'tray' ? 1 : 2];
    if (inPile) {
      // 다시 쏟기를 기다리는 중(몸 없음)이면 위에서 떨어뜨리는 것으로 적는다.
      // 쏟는 동안에는 저장하지 않으므로 실제로는 거의 오지 않는 길이다.
      const b = t.body;
      if (b) row.push(R4(b.p.x), R4(b.p.y), R4(b.p.z), R4(b.q.x), R4(b.q.y), R4(b.q.z), R4(b.q.w));
      else row.push(0, 4, 0, 0, 0, 0, 1);
    }
    return row;
  });
}

/**
 * 적어 둔 더미를 되살린다. 속도는 버린다 — 저장 순간 공중에 있었더라도
 * 그 자리에서 다시 떨어지면 그만이고, 그 편이 재현하기 쉽고 안전하다.
 */
export function restorePile(pile, rows, asleep = false) {
  for (let id = 0; id < rows.length; id++) {
    const row = rows[id];
    const kind = row[0];
    const state = row[1] === 0 ? 'pile' : row[1] === 1 ? 'tray' : 'gone';
    const tile = { id, kind, body: null, state };
    if (state === 'pile') {
      const body = addBody(pile.world, {
        p: v3(row[2], row[3], row[4]),
        q: { x: row[5], y: row[6], z: row[7], w: row[8] },
        hx: TILE3D.hx, hy: TILE3D.hy, hz: TILE3D.hz,
      });
      body.tile = tile;
      tile.body = body;
      if (asleep) { body.sleeping = true; body.sleepT = 1; }
    }
    pile.tiles.push(tile);
  }
  pile.poured = rows.length;
  pile.settleT = 0;
  pile.world.asleep = asleep;
  return pile;
}
