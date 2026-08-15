// 월드: 아레나, 코일 소유, 업데이트 순서.

import { GRID_CELL, C } from '../config.js';
import { createGrid } from '../core/grid.js';
import { rnd, range, irange } from '../core/rng.js';
import { sfx } from '../core/audio.js';
import { ARENA_RADIUS, NPC, COIL } from '../data/tuning.js';

import { createCoil, spawnCoil, updateCoil, outOfBounds, randomSpawnPoint, bodyCount, segX, segY } from './coil.js';
import { makeAI, steerAI } from './ai.js';
import { createFoodPool, scatterFood, scatterDebris, dropBoostItem, spawnFood, eatNearby, updateFood, buildFoodGrid } from './food.js';
import { BOOST_ITEM } from '../data/tuning.js';
import { buildSegmentGrid, headHitsBody, resolveHeadCollisions } from './collide.js';
import { burst, flash, updateParticles, clearParticles } from './particle.js';
import { addShake, resetCamera, updateCamera } from './camera.js';

export function createWorld() {
  const coils = [];
  for (let i = 0; i < NPC.count + 1; i++) coils.push(createCoil());

  const world = {
    coils,
    player: coils[0],
    food: createFoodPool(),
    grid: createGrid(GRID_CELL),        // 몸통 세그먼트
    foodGrid: createGrid(GRID_CELL * 2), // 먹이 (더 성기게)
    t: 0,
    over: false,
    leaderTimer: 0,
    leaders: [],
    playerRank: 1,
    bestLen: 0,
    eaten: 0,
    banner: null,
    finalRank: 0,     // 죽는 순간의 순위 (결과 화면용)
  };

  world.spawnLeak = (x, y) => spawnFood(world.food, x, y, 'leak');
  world.onPlayerEat = () => { world.eaten++; };

  world.applyBoost = (c, kind) => {
    if (kind === 'shield') c.shieldT = BOOST_ITEM.shieldDuration;
    else if (kind === 'surge') c.surgeT = BOOST_ITEM.surgeDuration;
    else if (kind === 'magnet') c.magnetT = BOOST_ITEM.magnetDuration;
    if (c.isPlayer) {
      world.banner = { text: kind === 'shield' ? '차폐 가동'
                           : kind === 'surge' ? '과급 가동' : '흡인 가동', life: 1.4 };
      sfx('heal');
    }
  };

  return world;
}

export function startRun(world) {
  world.t = 0;
  world.over = false;
  world.leaderTimer = 0;
  world.leaders.length = 0;
  world.playerRank = 1;
  world.bestLen = COIL.startLen;
  world.eaten = 0;
  world.banner = null;
  world.finalRank = 0;

  world.food.clear();
  clearParticles();
  scatterFood(world.food, 1400);

  const p = world.player;
  spawnCoil(p, 0, 0, rnd() * Math.PI * 2, true, 0);
  p.ai = null;

  for (let i = 1; i < world.coils.length; i++) {
    const c = world.coils[i];
    const s = randomSpawnPoint(world);
    spawnCoil(c, s.x, s.y, s.angle, false, i);
    c.ai = makeAI(i);
    c.aiTimer = i % NPC.aiIntervalFrames;   // 판단 프레임을 흩어 스파이크를 막는다
  }

  resetCamera(p.x, p.y);
}

/** 코일 사망 처리. killer 가 있으면 그쪽 킬로 잡는다. */
function killCoil(world, c, killer) {
  if (!c.alive) return;
  if (c.godMode) return;   // 성능 측정용 — 프로덕션 경로에서는 절대 설정되지 않는다

  // 차폐가 있으면 한 번 버틴다
  if (c.shieldT > 0) {
    c.shieldT = 0;
    burst(c.x, c.y, C.mint, 18, 240, 5);
    if (c.isPlayer) {
      addShake(10);
      world.banner = { text: '차폐 소멸', life: 1.2 };
    }
    sfx('shield');
    return;
  }

  c.alive = false;
  scatterDebris(world.food, c);
  dropBoostItem(world.food, c);   // 큰 코일이었다면 강화 아이템을 남긴다
  burst(c.x, c.y, c.color, c.isPlayer ? 34 : 14, 260, 5);
  if (killer && killer !== c) killer.kills++;

  if (c.isPlayer) {
    // 죽는 순간의 순위를 붙잡는다. 리더보드는 살아 있는 코일만 세므로,
    // 죽고 나면 순위가 꼴찌로 바뀌어 "1등이었는데 18위"로 표시된다.
    world.finalRank = world.playerRank;
    world.over = true;
    addShake(20);
    sfx('die');
  } else {
    c.respawnIn = range(NPC.respawnMin, NPC.respawnMax);
    if (killer && killer.isPlayer) {
      addShake(10);
      sfx('kill');
    }
  }
}

export function updateWorld(world, dt) {
  world.t += dt;
  const p = world.player;

  // 1) AI (해당 프레임에 걸린 코일만)
  for (let i = 1; i < world.coils.length; i++) {
    const c = world.coils[i];
    if (c.alive) steerAI(c, world, dt);
  }

  // 2) 이동
  for (const c of world.coils) {
    if (c.alive) updateCoil(c, dt, world);
    else if (!c.isPlayer) {
      c.respawnIn -= dt;
      if (c.respawnIn <= 0) {
        const s = randomSpawnPoint(world);   // 플레이어 머리 위에 태어나지 않게
        const idx = world.coils.indexOf(c);
        spawnCoil(c, s.x, s.y, s.angle, false, idx);
        c.ai = makeAI(idx);
      }
    }
  }

  // 3) 그리드 재구축
  buildSegmentGrid(world);
  buildFoodGrid(world);

  // 4) 충돌 — 머리 vs 몸통
  for (const c of world.coils) {
    if (!c.alive) continue;
    const other = headHitsBody(world, c);
    if (other) killCoil(world, c, other);
  }
  // 머리 vs 머리
  resolveHeadCollisions(world, (victim, killer) => killCoil(world, victim, killer));
  // 경계
  for (const c of world.coils) {
    if (c.alive && outOfBounds(c)) killCoil(world, c, null);
  }

  // 5) 먹이
  for (const c of world.coils) {
    if (c.alive) eatNearby(world, c);
  }
  updateFood(world, dt);

  // 6) 연출 · 카메라
  updateParticles(dt);
  updateCamera(p.alive ? p : { x: p.x, y: p.y }, dt);

  if (world.banner) {
    world.banner.life -= dt;
    if (world.banner.life <= 0) world.banner = null;
  }

  if (p.alive && p.targetLen > world.bestLen) world.bestLen = p.targetLen;

  // 7) 리더보드 (0.5초마다 — 매 프레임 정렬은 낭비)
  world.leaderTimer -= dt;
  if (world.leaderTimer <= 0) {
    world.leaderTimer = 0.5;
    updateLeaderboard(world);
  }
}

const _rank = [];

function updateLeaderboard(world) {
  _rank.length = 0;
  for (const c of world.coils) if (c.alive) _rank.push(c);
  _rank.sort((a, b) => b.len - a.len);

  world.leaders.length = 0;
  for (let i = 0; i < Math.min(5, _rank.length); i++) world.leaders.push(_rank[i]);

  const idx = _rank.indexOf(world.player);
  world.playerRank = idx >= 0 ? idx + 1 : _rank.length + 1;
}

export { killCoil, ARENA_RADIUS };
