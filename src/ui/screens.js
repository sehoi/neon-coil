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

  const bw = 300, bh = 50, bx = (W - bw) / 2;
  const r = {
    start: button(ctx, bx, 286, bw, bh, '접속  ▶'),
    board: button(ctx, bx, 344, bw, bh, '기록', { color: C.gold, size: 18 }),
    help:  button(ctx, bx, 402, bw, bh, '조작법', { color: C.dim, size: 18 }),
  };
  if (IS_TOUCH && document.fullscreenEnabled) {
    r.fullscreen = button(ctx, bx, 460, bw, 40,
      document.fullscreenElement ? '전체화면 해제' : '전체화면', { color: C.dim, size: 16 });
  }

  if (save.best.score > 0 || save.best.len > 0) {
    text(ctx, `최고 점수 ${save.best.score} · 최고 길이 ${save.best.len} · 최고 순위 ${save.best.rank}위 · 최다 처치 ${save.best.kills}`,
      W / 2, H - 52, { size: 14, align: 'center', color: C.dim });
  }
  text(ctx, IS_TOUCH ? '왼쪽 드래그로 조종 · 오른쪽 아래 가속'
       : SETTINGS.control === 'key' ? 'WASD / 방향키로 조종 · Space 로 가속'
       : '마우스로 조종 · 클릭 또는 Space 로 가속',
    W / 2, H - 28, { size: 13, align: 'center', color: '#4a5578' });
  return r;
}

/** 로컬 기록 — 점수 기준 상위 8개 (동점은 처치·순위·길이·생존 순으로 가른다) */
export function renderBoard(ctx, save, highlightRank = 0) {
  const W = cfg.W, H = cfg.H;
  dim(ctx, 0.88);
  const pw = 700, ph = 480;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph, C.gold);

  text(ctx, '기록', px + pw / 2, py + 44, { size: 28, align: 'center', color: C.gold, glow: 12 });

  if (!save.board.length) {
    text(ctx, '아직 기록이 없다', px + pw / 2, py + 130, {
      size: 16, align: 'center', color: C.dim,
    });
  } else {
    text(ctx, '순위', px + 44, py + 84, { size: 12, color: C.dim });
    text(ctx, '점수', px + 110, py + 84, { size: 12, color: C.dim });
    text(ctx, '길이', px + 240, py + 84, { size: 12, color: C.dim });
    text(ctx, '최종 순위', px + pw - 230, py + 84, { size: 12, align: 'right', color: C.dim });
    text(ctx, '처치', px + pw - 130, py + 84, { size: 12, align: 'right', color: C.dim });
    text(ctx, '생존', px + pw - 40, py + 84, { size: 12, align: 'right', color: C.dim });

    save.board.forEach((e, i) => {
      const y = py + 118 + i * 38;
      const me = (i + 1) === highlightRank;
      const col = me ? C.cyan : (i === 0 ? C.gold : C.text);
      if (me) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = C.cyan;
        ctx.fillRect(px + 30, y - 19, pw - 60, 28);
        ctx.restore();
      }
      text(ctx, `${i + 1}`, px + 50, y, { size: 16, align: 'center', color: col });
      text(ctx, `${e.score}`, px + 110, y, { size: 18, color: col });
      text(ctx, `${e.len}`, px + 240, y, { size: 15, color: me ? C.cyan : C.dim });
      text(ctx, `${e.rank}위`, px + pw - 230, y, { size: 14, align: 'right', color: me ? C.cyan : C.dim });
      text(ctx, `${e.kills}`, px + pw - 130, y, { size: 14, align: 'right', color: me ? C.cyan : C.dim });
      text(ctx, `${e.time}초`, px + pw - 40, y, { size: 14, align: 'right', color: me ? C.cyan : C.dim });
    });
  }

  return { back: button(ctx, px + pw / 2 - 90, py + ph - 58, 180, 42, '돌아가기', { size: 17 }) };
}

export function renderHelp(ctx) {
  const W = cfg.W, H = cfg.H;
  dim(ctx, 0.85);
  // 키보드 설명이 마우스보다 길어 폭을 조금 넓혔다 (글꼴에 따라 넘칠 여지를 없앤다)
  const pw = 700, ph = 400;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph);

  text(ctx, '조작법', px + pw / 2, py + 46, { size: 30, align: 'center', color: C.cyan, glow: 12 });

  const lines = IS_TOUCH ? [
    ['화면 왼쪽 드래그', '누른 자리 기준으로 방향을 민다'],
    ['오른쪽 아래 원', '가속 — 길이를 태워 빨라진다'],
    ['상단 중앙 ▮▮', '일시정지'],
  ] : SETTINGS.control === 'key' ? [
    ['WASD / 방향키', '누른 방향으로 머리가 돈다 · 두 개면 대각선'],
    ['Space / Shift', '가속 — 길이를 태워 빨라진다'],
    ['Esc / P', '일시정지'],
    ['M / G', '음소거 / 글로우 전환'],
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
  // 데스크톱에는 조작 방식 전환이 한 줄 더 붙는다
  const pw = 560, ph = IS_TOUCH ? 340 : 390;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph);

  text(ctx, '일시정지', px + pw / 2, py + 50, { size: 32, align: 'center', color: C.cyan, glow: 12 });
  text(ctx, `${world.player.score}점 · 길이 ${Math.floor(world.player.len)} · ${world.playerRank}위 · 처치 ${world.player.kills}`,
    px + pw / 2, py + 84, { size: 16, align: 'center', color: C.dim });

  const colW = (pw - 80) / 2;
  const r = {
    glow: button(ctx, px + 40, py + 130, colW - 10, 40, `글로우: ${SETTINGS.glow ? 'ON' : 'OFF'}`, { color: C.dim, size: 15 }),
    mute: button(ctx, px + 50 + colW, py + 130, colW - 10, 40, `사운드: ${SETTINGS.muted ? 'OFF' : 'ON'}`, { color: C.dim, size: 15 }),
    fps:  button(ctx, px + 40, py + 180, pw - 80, 40, `FPS 표시: ${SETTINGS.showFps ? 'ON' : 'OFF'}`, { color: C.dim, size: 15 }),
  };
  if (!IS_TOUCH) {
    r.control = button(ctx, px + 40, py + 230, pw - 80, 40,
      `조작: ${SETTINGS.control === 'key' ? '키보드 (WASD / 방향키)' : '마우스'}`,
      { color: C.gold, size: 15 });
  }
  r.quit   = button(ctx, px + 40, py + ph - 62, 190, 44, '포기', { color: C.red, size: 18 });
  r.resume = button(ctx, px + pw - 230, py + ph - 62, 190, 44, '계속', { size: 18 });
  return r;
}

export function renderResult(ctx, world, save, recordRank) {
  const W = cfg.W, H = cfg.H;
  dim(ctx, 0.85);
  const pw = 600, ph = 430;   // 점수 줄이 하나 늘었다
  const px = (W - pw) / 2, py = (H - ph) / 2;
  // 죽는 순간의 순위를 쓴다. playerRank 는 사후에 꼴찌로 바뀐다.
  const rank = world.finalRank || world.playerRank;
  const wasTop = rank === 1;
  panel(ctx, px, py, pw, ph, wasTop ? C.lime : C.red);

  text(ctx, wasTop ? '정상에서 터졌다' : '코일 파열', W / 2, py + 60, {
    size: 36, align: 'center', color: wasTop ? C.lime : C.red, glow: 18,
  });

  const rows = [
    ['점수', `${world.player.score}`],
    ['최고 길이', `${Math.floor(world.bestLen)}`],
    ['최종 순위', `${rank}위 / ${world.coils.length}`],
    ['처치', `${world.player.kills}`],
    ['생존 시간', `${Math.floor(world.t)}초`],
  ];
  let y = py + 120;
  for (const [k, v] of rows) {
    const big = k === '점수';
    text(ctx, k, px + 70, y, { size: big ? 19 : 17, color: big ? C.cyan : C.dim });
    text(ctx, v, px + pw - 70, y, {
      size: big ? 30 : 20, align: 'right', color: big ? C.cyan : C.text, glow: big ? 10 : 0,
    });
    y += big ? 40 : 34;
  }

  if (recordRank) {
    text(ctx, recordRank === 1 ? '신기록 · 1위' : `기록 ${recordRank}위`, W / 2, y + 12, {
      size: 17, align: 'center', color: C.gold, glow: 10,
    });
  }

  return {
    retry: button(ctx, px + 60, py + ph - 68, 170, 46, '재접속  [R]', { size: 17 }),
    board: button(ctx, px + 244, py + ph - 68, 112, 46, '기록', { color: C.gold, size: 16 }),
    title: button(ctx, px + pw - 230, py + ph - 68, 170, 46, '타이틀', { color: C.dim, size: 17 }),
  };
}
