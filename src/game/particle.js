// 사망 폭발 · 흡수 플래시. NEON PURGE 에서 이식 — 혼잡 시 자기 억제 규칙도 그대로.

import { createPool } from '../core/pool.js';
import { range, rnd } from '../core/rng.js';

export function makeParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, r: 3, life: 0, maxLife: 1,
           color: '#fff', kind: 'shard', rot: 0, spin: 0, alive: false };
}

export const particles = createPool(makeParticle, 600);

// 풀이 붐빌수록 새 파티클을 스스로 줄여 렌더 비용의 상한을 만든다.
function congestion() {
  return particles.count / particles.capacity;
}

export function burst(x, y, color, count = 8, speed = 160, size = 4) {
  const c = congestion();
  if (c > 0.55) count = Math.max(1, Math.round(count * (c > 0.8 ? 0.25 : 0.5)));
  for (let i = 0; i < count; i++) {
    const p = particles.spawn();
    const a = rnd() * Math.PI * 2;
    const s = range(speed * 0.4, speed);
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.r = range(size * 0.5, size);
    p.maxLife = p.life = range(0.3, 0.7);
    p.color = color;
    p.kind = 'shard';
    p.rot = rnd() * Math.PI;
    p.spin = range(-8, 8);
  }
}

export function flash(x, y, color, r = 18) {
  if (congestion() > 0.45 && rnd() > 0.25) return;
  const p = particles.spawn();
  p.x = x; p.y = y;
  p.vx = p.vy = 0;
  p.r = r;
  p.maxLife = p.life = 0.16;
  p.color = color;
  p.kind = 'flash';
}

export function updateParticles(dt) {
  particles.forEach(p => {
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; return; }
    if (p.kind === 'shard') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 3 * dt;
      p.vy *= 1 - 3 * dt;
      p.rot += p.spin * dt;
    } else if (p.kind === 'flash') {
      p.r += 120 * dt;
    }
  });
  particles.compact();
}

export function clearParticles() {
  particles.clear();
}
