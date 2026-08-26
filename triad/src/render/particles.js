// 매치가 터질 때 튀는 조각. 풀은 쓰지 않는다 — 최대 수십 개다.

const list = [];

export function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 90 + Math.random() * 260;
    list.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life: 0.45 + Math.random() * 0.35,
      age: 0,
      size: 2 + Math.random() * 4,
      color,
    });
  }
  if (list.length > 400) list.splice(0, list.length - 400);
}

export function updateParticles(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) { list.splice(i, 1); continue; }
    p.vy += 900 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawParticles(ctx) {
  for (const p of list) {
    const k = 1 - p.age / p.life;
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 1.4);
  }
  ctx.globalAlpha = 1;
}

export function clearParticles() {
  list.length = 0;
}
