// 타이틀 · 조작법 · 일시정지 · 결과.

import * as cfg from '../config.js';
import { C, SETTINGS, IS_TOUCH } from '../config.js';
import { text, panel, button } from './widgets.js';

function dim(ctx, alpha = 0.72) {
  ctx.save();
  ctx.fillStyle = `rgba(4,5,14,${alpha})`;
  ctx.fillRect(0, 0, cfg.W, cfg.H);
  ctx.restore();
}

export function renderTitle(ctx, save) {
  const W = cfg.W, H = cfg.H;
  dim(ctx, 0.55);

  text(ctx, 'NEON COIL', W / 2, 180, {
    size: 78, align: 'center', color: C.cyan, glow: 28, weight: 'bold',
  });
  text(ctx, '대역폭을 놓고 겨루는 데이터 코일', W / 2, 222, {
    size: 16, align: 'center', color: C.dim,
  });

  const bw = 300, bh = 52, bx = (W - bw) / 2;
  const r = {
    start: button(ctx, bx, 296, bw, bh, '접속  ▶'),
    help:  button(ctx, bx, 358, bw, bh, '조작법', { color: C.dim, size: 18 }),
  };
  if (IS_TOUCH && document.fullscreenEnabled) {
    r.fullscreen = button(ctx, bx, 420, bw, 42,
      document.fullscreenElement ? '전체화면 해제' : '전체화면', { color: C.dim, size: 16 });
  }

  if (save.best.len > 0) {
    text(ctx, `최고 길이 ${save.best.len} · 최고 순위 ${save.best.rank}위 · 최다 처치 ${save.best.kills}`,
      W / 2, H - 52, { size: 14, align: 'center', color: C.dim });
  }
  text(ctx, IS_TOUCH ? '왼쪽 드래그로 조종 · 오른쪽 아래 가속'
                     : '마우스로 조종 · 클릭 또는 Space 로 가속',
    W / 2, H - 28, { size: 13, align: 'center', color: '#4a5578' });
  return r;
}

export function renderHelp(ctx) {
  const W = cfg.W, H = cfg.H;
  dim(ctx, 0.85);
  const pw = 660, ph = 400;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph);

  text(ctx, '조작법', px + pw / 2, py + 46, { size: 30, align: 'center', color: C.cyan, glow: 12 });

  const lines = IS_TOUCH ? [
    ['화면 왼쪽 드래그', '누른 자리 기준으로 방향을 민다'],
    ['오른쪽 아래 원', '가속 — 길이를 태워 빨라진다'],
    ['상단 중앙 ▮▮', '일시정지'],
  ] : [
    ['마우스 이동', '머리가 포인터 쪽을 향한다'],
    ['클릭 / Space / Shift', '가속 — 길이를 태워 빨라진다'],
    ['Esc / P', '일시정지'],
    ['M / G', '음소거 / 글로우 전환'],
  ];
  let y = py + 100;
  for (const [k, v] of lines) {
    text(ctx, k, px + 48, y, { size: 16, color: C.gold });
    text(ctx, v, px + 260, y, { size: 15, color: C.text });
    y += 32;
  }

  y += 10;
  const rules = [
    '내 머리가 남의 몸에 닿으면 터진다. 내 몸에는 닿아도 안전하다.',
    '남이 내 몸에 박으면 그쪽이 터지고, 잔해는 전부 먹이가 된다.',
    '경계 밖으로 나가면 즉사한다.',
  ];
  for (const r of rules) {
    text(ctx, `· ${r}`, px + 48, y, { size: 14, color: C.dim });
    y += 24;
  }

  return { back: button(ctx, px + pw / 2 - 90, py + ph - 58, 180, 42, '돌아가기', { size: 17 }) };
}

export function renderPause(ctx, world) {
  const W = cfg.W, H = cfg.H;
  dim(ctx, 0.8);
  const pw = 560, ph = 340;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph);

  text(ctx, '일시정지', px + pw / 2, py + 50, { size: 32, align: 'center', color: C.cyan, glow: 12 });
  text(ctx, `길이 ${Math.floor(world.player.len)} · ${world.playerRank}위 · 처치 ${world.player.kills}`,
    px + pw / 2, py + 84, { size: 16, align: 'center', color: C.dim });

  const colW = (pw - 80) / 2;
  const r = {
    glow: button(ctx, px + 40, py + 130, colW - 10, 40, `글로우: ${SETTINGS.glow ? 'ON' : 'OFF'}`, { color: C.dim, size: 15 }),
    mute: button(ctx, px + 50 + colW, py + 130, colW - 10, 40, `사운드: ${SETTINGS.muted ? 'OFF' : 'ON'}`, { color: C.dim, size: 15 }),
    fps:  button(ctx, px + 40, py + 180, pw - 80, 40, `FPS 표시: ${SETTINGS.showFps ? 'ON' : 'OFF'}`, { color: C.dim, size: 15 }),
  };
  r.quit   = button(ctx, px + 40, py + ph - 62, 190, 44, '포기', { color: C.red, size: 18 });
  r.resume = button(ctx, px + pw - 230, py + ph - 62, 190, 44, '계속', { size: 18 });
  return r;
}

export function renderResult(ctx, world, save, isBest) {
  const W = cfg.W, H = cfg.H;
  dim(ctx, 0.85);
  const pw = 600, ph = 400;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph, world.playerRank === 1 ? C.lime : C.red);

  text(ctx, world.playerRank === 1 ? '정점에서 터졌다' : '연결 종료', W / 2, py + 60, {
    size: 36, align: 'center', color: world.playerRank === 1 ? C.lime : C.red, glow: 18,
  });

  const rows = [
    ['최종 길이', `${Math.floor(world.bestLen)}`],
    ['최종 순위', `${world.playerRank}위`],
    ['처치', `${world.player.kills}`],
    ['생존 시간', `${Math.floor(world.t)}초`],
  ];
  let y = py + 124;
  for (const [k, v] of rows) {
    text(ctx, k, px + 70, y, { size: 17, color: C.dim });
    text(ctx, v, px + pw - 70, y, { size: 20, align: 'right', color: C.text });
    y += 36;
  }

  if (isBest) {
    text(ctx, '최고 기록 갱신', W / 2, y + 12, { size: 17, align: 'center', color: C.gold, glow: 10 });
  }

  return {
    retry: button(ctx, px + pw / 2 - 200, py + ph - 68, 190, 46, '재접속  [R]', { size: 18 }),
    title: button(ctx, px + pw / 2 + 10, py + ph - 68, 190, 46, '타이틀', { color: C.dim, size: 18 }),
  };
}
