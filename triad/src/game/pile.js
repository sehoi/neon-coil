// 타일 더미 — 물리 세계와 게임이 만나는 곳.
// 타일은 상자 안으로 쏟아져 서로 기대고 뒤집힌 채 쌓인다. 규칙은 하나다:
// **앞면(무늬)이 보이면 집을 수 있다.** 층 개념이 없으므로 옆으로 삐져나온 타일도,
// 더미 옆구리에 낀 타일도 무늬만 보이면 집힌다.

import { rnd, shuffle } from '../core/rng.js';
import { v3, qAxisAngle, qMul, qNorm, qToMat } from '../core/v3.js';
import { TILE3D, POUR, BOX_RATIO, PHYS } from '../data/tuning.js';
import { chooseKinds } from '../data/symbols.js';
import {
  createWorld, addBody, removeBody, step as stepWorld, raycast, freeze, wakeAll,
} from './physics.js';

const FACE_UP = qAxisAngle(v3(1, 0, 0), -Math.PI / 2);   // 로컬 +z(앞면)가 위를 본다

/**
 * 정렬했을 때 칸과 칸 사이 틈. 0 이면 기둥끼리 맞닿는다.
 *
 * 틈을 두면 한 장이 끝나는 자리가 또렷이 보이는 대신, 기둥이 서로 남남이 된다 —
 * 한 장을 집어도 옆 기둥에 힘이 전혀 전해지지 않아 판이 통째로 죽어 보였다
 * (실측: 108장 판에서 정렬 뒤 두세 번 집으면 움직이는 타일이 0장). 틈을 없애
 * 기둥끼리 맞닿게 하면 그 힘이 이웃으로 새어 나간다.
 */
const ALIGN_GAP = 0;

/**
 * 포개 놓을 때 층과 층 사이에 두는 머리카락만 한 틈.
 *
 * 딱 붙여 놓으면 접촉 해소기가 첫 스텝에 파고듦을 보고 서로 밀어내는데, 그 밀침이
 * 옆으로도 나가 기둥 꼭대기가 튕겨 나간다 (300장 판 실측: 딱 붙이면 최대 기울기
 * 115°, 즉 몇 장이 아예 넘어졌다. 0.01 을 띄우면 38° 로 아무도 안 넘어진다).
 * 화면에서는 0.6픽셀이라 눈에는 안 보인다.
 */
const ALIGN_LIFT = 0.01;

/**
 * 한 칸에 쌓는 높이의 한계.
 *
 * 다섯 층을 올리면 꼭대기가 저 혼자 흔들리다 옆으로 넘어간다 — 넘어간 타일은
 * 무늬를 감추므로 "전부 위를 보게 한다"는 약속이 그만큼 깨진다. 넷까지만 올리고
 * 넘치는 것은 가장 가까운 빈 칸으로 보낸다. 300장·98칸이면 평균이 3.06층이라
 * 다섯 층짜리 기둥 몇 개만 한 칸씩 옆으로 밀린다.
 */
const ALIGN_CAP = 4;

/** 제 칸까지 미끄러져 가는 데 걸리는 시간 (초). */
const ALIGN_TIME = 0.32;

export function createPile(spec) {
  // 상자 넓이는 "몇 겹으로 쌓이게 할지"로 정한다. 장수가 적은 판은 상자도
  // 같이 줄어들고, 카메라가 그 상자에 맞춰 붙으므로 화면은 늘 꽉 찬다.
  // 가로세로 비는 화면의 판 사각형과 같게 잡는다 (BOX_RATIO).
  const area = spec.tiles * (TILE3D.hx * 2) * (TILE3D.hy * 2) / spec.layers;
  const halfX = Math.sqrt(area / (4 * BOX_RATIO));
  const halfZ = halfX * BOX_RATIO;

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
    align: null,        // 정렬해 옮기는 중이면 그 진행 상태
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
  if (pile.align) { stepAlign(pile, dt); return true; }

  // 프레임이 길어져도 물리는 그만큼만 밟는다 (PHYS.maxStep 참고)
  dt = Math.min(dt, PHYS.maxStep);
  const moved = stepWorld(pile.world, dt);
  if (!moved) { pile.settleT = 0; return false; }

  // 다 쏟은 뒤에도 오래 뒤척이면 그냥 세운다. 눈에 안 보이는 미동 때문에
  // 프레임마다 몇 ms 를 계속 쓰는 것이 아깝다.
  if (pile.poured >= pile.spec.tiles && !pile.queue.length) {
    pile.settleT += dt;
    // 오래 들썩이면 세운다. 다만 아직 진짜로 떨어지는 타일이 있으면 기다린다 —
    // 그 상태로 얼리면 타일이 공중에 박제된다.
    if (pile.settleT > POUR.settleCap && pile.world.maxV < PHYS.calm) freeze(pile.world);
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

  const moves = [];
  // 아래에 있던 것이 아래로 간다 — 쌓인 순서가 곧 더미의 모양이다
  live.sort((a, b) => a.body.p.y - b.body.p.y);
  for (const tile of live) {
    const wx = clamp(Math.round((tile.body.p.x - x0) / cw), 0, cols - 1);
    const wz = clamp(Math.round((tile.body.p.z - z0) / ch), 0, rows - 1);
    const [cx, cz] = roomNear(stack, cols, rows, wx, wz);
    const layer = stack[cz * cols + cx]++;

    const from = { p: { ...tile.body.p }, q: { ...tile.body.q } };
    removeBody(pile.world, tile.body);
    const body = addBody(pile.world, {
      p: v3(x0 + cx * cw, TILE3D.hz + layer * (TILE3D.hz * 2 + ALIGN_LIFT), z0 + cz * ch),
      q: FACE_UP,
      hx: TILE3D.hx, hy: TILE3D.hy, hz: TILE3D.hz,
    });
    body.tile = tile;
    tile.body = body;
    moves.push({ body, from, to: { p: { ...body.p }, q: { ...body.q } } });
    place(body, from.p, from.q);        // 보여 주기는 있던 자리에서 시작한다
  }

  // 옮기는 동안에는 물리를 멈춰 둔다 — 중간 자세는 아직 아무 데도 안 닿아 있다.
  freeze(pile.world);
  pile.align = { t: 0, moves };
  pile.settleT = 0;
  return live.length;
}

/**
 * 정렬 한 프레임.
 *
 * 자리를 순간이동으로 바꾸면 판이 그림처럼 탁 굳는다. 있던 자리에서 제 칸까지
 * 실제로 미끄러져 가는 이 0.32초가 "판을 정리했다"는 유일한 신호다.
 * 다 옮기고 나면 물리에 넘겨 제 무게로 내려앉게 둔다 — 얼려 두지 않는다.
 */
function stepAlign(pile, dt) {
  const a = pile.align;
  a.t = Math.min(1, a.t + dt / ALIGN_TIME);
  const k = 1 - Math.pow(1 - a.t, 3);          // 끝에서 부드럽게 선다
  for (const m of a.moves) {
    if (!m.body.tile || m.body.tile.body !== m.body) continue;   // 옮기는 중에 집힌 타일
    place(m.body, lerpV(m.from.p, m.to.p, k), nlerpQ(m.from.q, m.to.q, k));
  }
  pile.world.rev++;                            // 그림이 바뀌었다 (렌더 캐시가 본다)
  if (a.t < 1) return;

  pile.align = null;
  wakeAll(pile.world, v3(0, 0, 0), Infinity);  // 이제부터는 물리가 맡는다
  pile.settleT = 0;
}

/** 옮기던 것을 지금 당장 끝낸다 (저장처럼 중간 자세를 남기면 안 되는 자리에서). */
export function finishAlign(pile) {
  if (pile.align) stepAlign(pile, ALIGN_TIME);
}

/** 몸을 그 자리에 그대로 놓는다 (속도는 건드리지 않는다). */
function place(body, p, q) {
  body.p.x = p.x; body.p.y = p.y; body.p.z = p.z;
  body.q.x = q.x; body.q.y = q.y; body.q.z = q.z; body.q.w = q.w;
  body.prevP.x = p.x; body.prevP.y = p.y; body.prevP.z = p.z;
  body.prevQ.x = q.x; body.prevQ.y = q.y; body.prevQ.z = q.z; body.prevQ.w = q.w;
  qToMat(body.q, body.R);
}

function lerpV(a, b, k) {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

/** 짧은 회전이라 구면 보간까지 갈 것 없다. 대신 먼 쪽으로 도는 것만 막는다. */
function nlerpQ(a, b, k) {
  const s = (a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) < 0 ? -1 : 1;
  return qNorm({
    x: a.x + (b.x * s - a.x) * k,
    y: a.y + (b.y * s - a.y) * k,
    z: a.z + (b.z * s - a.z) * k,
    w: a.w + (b.w * s - a.w) * k,
  });
}

/** 무늬가 kind 인 타일을 위에 있는 것부터 n 장 고른다 (빼내기). */
export function topOfKind(pile, kind, n) {
  return pile.tiles
    .filter(t => t.state === 'pile' && t.kind === kind)
    .sort((a, b) => b.body.p.y - a.body.p.y)
    .slice(0, n);
}

/**
 * 판이 성한지 본다. 다 쏟고 나면 타일은 상자에 고루 퍼져 있어야 한다.
 *
 * 한 자리에 탑처럼 쌓였거나 좌표가 NaN 이면 그 판은 손을 댈 수가 없다 —
 * 무늬가 안 보이니 집을 것이 없고, 아이템을 써도 그대로다. 그런 판을 그냥 두면
 * 사람은 게임이 죽었다고 느낀다. 그래서 다시 쏟을 수 있도록 여기서 알린다.
 *
 * 문턱은 실측에서 한참 떨어뜨려 잡았다 — 성한 판은 상자의 90% 폭을 채우고
 * 꼭대기가 상자 높이를 넘지 않는다. 멀쩡한 판을 다시 쏟는 쪽이 더 나쁘다.
 *
 * @returns {string|null} 망가졌으면 그 이유, 성하면 null
 */
export function pileFault(pile, boxH = 3) {
  const live = pileTiles(pile);
  if (live.length < 8) return null;                 // 몇 장 안 남은 판은 원래 몰려 있다

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, top = -Infinity;
  for (const t of live) {
    const p = t.body.p;
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return '좌표가 NaN';
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    if (p.y > top) top = p.y;
  }
  if (maxX - minX < pile.halfX * 0.9) return '한 줄로 몰렸다 (가로)';
  if (maxZ - minZ < pile.halfZ * 0.9) return '한 줄로 몰렸다 (세로)';
  if (top > boxH * 2.2) return `탑처럼 쌓였다 (꼭대기 ${top.toFixed(1)})`;
  return null;
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

/**
 * (cx, cz) 부터 시작해 아직 자리가 남은 칸을 찾는다. 제자리가 찼으면 한 겹씩
 * 둘레를 넓혀 가며 가장 가까운 칸으로 — 어디를 팠는지가 뭉개지지 않게.
 * 판 전체가 꽉 차 있으면 그중 가장 낮은 칸에 얹는다.
 */
function roomNear(stack, cols, rows, cx, cz) {
  for (let r = 0; r < Math.max(cols, rows); r++) {
    let best = null, bestN = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;   // 둘레만
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= cols || z >= rows) continue;
        const n = stack[z * cols + x];
        if (n < ALIGN_CAP && n < bestN) { best = [x, z]; bestN = n; }    // 낮은 칸부터
      }
    }
    if (best) return best;
  }
  // 칸보다 타일이 많다 — 가장 낮은 칸에 얹는다
  let at = 0;
  for (let i = 1; i < stack.length; i++) if (stack[i] < stack[at]) at = i;
  return [at % cols, Math.floor(at / cols)];
}

// ── 저장과 복원 ───────────────────────────────────────────────────────────

const R4 = (v) => Math.round(v * 1e4) / 1e4;   // 소수 넷째 자리면 눈으로 같은 자리다

/**
 * 더미를 그대로 적어 둔다. 타일마다 무늬·상태와, 판 위에 있으면 위치·자세.
 * @returns 적을 수 없는 상태(몸 없는 타일이 있다)면 null
 */
export function serializePile(pile) {
  return pile.tiles.map((t) => {
    const inPile = t.state !== 'tray' && t.state !== 'gone';
    const row = [t.kind, inPile ? 0 : t.state === 'tray' ? 1 : 2];
    if (inPile) {
      // 다시 쏟기를 기다리는 중(몸 없음)이면 위에서 떨어뜨리는 것으로 적는다.
      // 쏟는 동안에는 저장하지 않으므로 실제로는 거의 오지 않는 길이다.
      // 몸 없는 타일(섞기로 다시 쏟기를 기다리는 중)은 적을 자리가 없다.
      // 예전에는 (0,4,0) 으로 적었는데, 그런 판을 되살리면 온 타일이 원점에
      // 겹쳐 쌓여 손을 댈 수 없는 탑이 된다. 그래서 아예 적지 않는다 —
      // 부르는 쪽(serializeSession)이 이걸 보고 저장을 건너뛴다.
      const b = t.body;
      if (!b) return null;
      // 좌표가 NaN·Infinity 면 JSON 이 그것을 **null 로 적는다.** 그 판을 되살리면
      // null 은 0 으로 읽혀 온 타일이 원점에 겹쳐 쌓인다 — 손댈 수 없는 탑이다.
      // 그런 판은 적지 않는다 (다 쏟은 뒤 검사에서 어차피 다시 쏟게 된다).
      if (!isFinite(b.p.x) || !isFinite(b.p.y) || !isFinite(b.p.z) ||
          !isFinite(b.q.x) || !isFinite(b.q.y) || !isFinite(b.q.z) || !isFinite(b.q.w)) return null;
      row.push(R4(b.p.x), R4(b.p.y), R4(b.p.z), R4(b.q.x), R4(b.q.y), R4(b.q.z), R4(b.q.w));
    }
    return row;
  }).reduce((out, row) => (out && row ? (out.push(row), out) : null), []);
}

/**
 * 적어 둔 더미를 되살린다. 속도는 버린다 — 저장 순간 공중에 있었더라도
 * 그 자리에서 다시 떨어지면 그만이고, 그 편이 재현하기 쉽고 안전하다.
 * @returns 적힌 값이 성하지 않으면 null (부르는 쪽이 새 판을 연다)
 */
export function restorePile(pile, rows, asleep = false) {
  for (let id = 0; id < rows.length; id++) {
    const row = rows[id];
    const kind = row[0];
    const state = row[1] === 0 ? 'pile' : row[1] === 1 ? 'tray' : 'gone';
    const tile = { id, kind, body: null, state };
    // 적힌 값이 수가 아니면(옛 저장이 NaN 을 null 로 적어 둔 경우) 그 판은 못 믿는다.
    if (state === 'pile' && !row.slice(2, 9).every(v => typeof v === 'number' && isFinite(v))) {
      return null;
    }
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
