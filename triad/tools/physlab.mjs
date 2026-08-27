// 물리 검증 — 브라우저 없이 게임과 똑같이 타일을 쏟아 보고 더미가 제대로 서는지 본다.
//   node triad/tools/physlab.mjs [최대레벨] [판수]

import { seed } from '../src/core/rng.js';
import { levelSpec } from '../src/data/tuning.js';
import { createPile, pourTick, stepPile, pileTiles } from '../src/game/pile.js';
import { corners } from '../src/game/physics.js';
import { axis, sub } from '../src/core/v3.js';

const LEVELS = Number(process.argv[2]) || 12;
const RUNS = Number(process.argv[3]) || 3;
const DT = 1 / 60;

console.log('레벨  타일 | 정착(초) 스텝ms  최대관통  바닥밖  앞면비율  더미높이');
let ok = true;

for (let lv = 1; lv <= LEVELS; lv += Math.max(1, Math.floor(LEVELS / 6))) {
  const spec = levelSpec(lv);
  for (let r = 0; r < RUNS; r++) {
    seed(lv * 7919 + r * 104729);
    const pile = createPile(spec);

    let t = 0, ms = 0, steps = 0, done = false;
    while (t < 25) {
      if (!done) done = pourTick(pile);
      const t0 = process.hrtime.bigint();
      stepPile(pile, DT);
      ms += Number(process.hrtime.bigint() - t0) / 1e6;
      steps++;
      t += DT;
      if (done && pile.world.asleep) break;
    }

    let outside = 0, up = 0, top = 0;
    const tmp = [];
    for (const tile of pileTiles(pile)) {
      corners(tile.body, tmp);
      for (const c of tmp) {
        if (c.y < -0.06 || Math.abs(c.x) > pile.halfX + 0.1 || Math.abs(c.z) > pile.halfZ + 0.1) outside++;
        if (c.y > top) top = c.y;
      }
      if (axis(tile.body.R, 2).y > 0.3) up++;
    }
    const pen = worstOverlap(pile);
    if (outside > 0) ok = false;

    console.log(
      String(lv).padStart(3) + String(spec.tiles).padStart(6) + ' | ' +
      (pile.world.asleep ? t.toFixed(1) : '안잠').padStart(8) +
      (ms / steps).toFixed(2).padStart(7) +
      pen.toFixed(3).padStart(10) +
      String(outside).padStart(7) +
      (up / spec.tiles * 100).toFixed(0).padStart(9) + '%' +
      top.toFixed(2).padStart(9));
  }
}
console.log(ok ? '\n바닥 아래나 벽 밖으로 샌 타일 없음.' : '\n실패: 상자를 빠져나간 타일이 있다.');

/** 가장 깊게 파고든 쌍 — 면 6축 + 모서리 9축을 다 본다 (진짜 SAT). */
function worstOverlap(pile) {
  const bs = pileTiles(pile).map(t => t.body);
  let worst = 0;
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const d = Math.hypot(bs[i].p.x - bs[j].p.x, bs[i].p.y - bs[j].p.y, bs[i].p.z - bs[j].p.z);
      if (d > 2.2) continue;
      const ov = overlap(bs[i], bs[j]);
      if (ov > worst) worst = ov;
    }
  }
  return worst;
}

function overlap(a, b) {
  const ha = [a.hx, a.hy, a.hz], hb = [b.hx, b.hy, b.hz];
  const t = sub(b.p, a.p);
  const axes = [];
  for (let i = 0; i < 3; i++) axes.push(axis(a.R, i), axis(b.R, i));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const A = axis(a.R, i), B = axis(b.R, j);
      const c = { x: A.y * B.z - A.z * B.y, y: A.z * B.x - A.x * B.z, z: A.x * B.y - A.y * B.x };
      const l = Math.hypot(c.x, c.y, c.z);
      if (l > 1e-4) axes.push({ x: c.x / l, y: c.y / l, z: c.z / l });
    }
  }
  let best = Infinity;
  for (const L of axes) {
    const d = Math.abs(L.x * t.x + L.y * t.y + L.z * t.z);
    const ov = proj(a, ha, L) + proj(b, hb, L) - d;
    if (ov < 0) return 0;
    if (ov < best) best = ov;
  }
  return best;
}

function proj(b, h, L) {
  const R = b.R;
  return h[0] * Math.abs(R[0] * L.x + R[3] * L.y + R[6] * L.z)
       + h[1] * Math.abs(R[1] * L.x + R[4] * L.y + R[7] * L.z)
       + h[2] * Math.abs(R[2] * L.x + R[5] * L.y + R[8] * L.z);
}
