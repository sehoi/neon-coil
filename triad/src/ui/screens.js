// 오버레이 화면들. 각 함수는 그린 버튼 사각형을 돌려주고, main 이 그걸로 탭을 판정한다.
// 그리는 좌표와 누르는 좌표가 갈라지지 않게 하려는 것이다.

import { W, IS_TOUCH } from '../config.js';
import { SCORE } from '../data/tuning.js';
import { text, button, panel, dim, fmtTime } from './widgets.js';
import { PANEL, CLEAR_PANEL, OVER_PANEL, stackedButtons } from './rects.js';
import { TILE } from '../data/tuning.js';
import { drawTile } from '../render/tiles.js';
import { freeReady, price } from '../game/wallet.js';
import { goldTag, ITEM_NAME, ITEM_COLOR } from './shop.js';
import { drawIcon } from './icons.js';

export function titleScreen(ctx, save, t, run = null) {
  dim(ctx, 0.82);
  goldTag(ctx, W - 40, 76, save.wallet.gold, 28);

  // 맞춰지는 세 장을 그대로 보여준다. 규칙 설명 세 줄보다 이게 빠르다.
  const kind = 4;
  for (let i = 0; i < 3; i++) {
    const bob = Math.sin(t * 2.2 + i * 0.55) * 7;
    const w = TILE.w * 1.15, h = TILE.h * 1.15;
    drawTile(ctx, { x: W / 2 + (i - 1) * (w + 22) - w / 2, y: 236 + bob, w, h }, kind, {});
  }

  text(ctx, 'NEON TRIAD', W / 2, 452, {
    size: 66, color: '#ffffff', align: 'center', weight: '700', glow: 26,
  });
  text(ctx, '쏟아진 타일 더미에서 같은 무늬 셋을 모은다', W / 2, 502, {
    size: 24, color: 'rgba(220,228,246,0.75)', align: 'center', weight: '500',
  });

  const rows = [
    ['1', '누를 수 있는 타일은 무엇이든 집힌다'],
    ['2', '엎어진 것도 집힌다 — 무늬는 나중에 보인다'],
    ['3', '같은 무늬 3장이 모이면 사라진다'],
    ['!', '트레이 7칸이 다 차면 그 판은 끝난다'],
  ];
  rows.forEach(([n, line], i) => {
    const yy = 596 + i * 48;
    text(ctx, n, 118, yy, { size: 22, color: n === '!' ? '#ff4d6d' : '#46f0d0', align: 'left', weight: '700' });
    text(ctx, line, 154, yy, { size: 22, color: 'rgba(226,232,247,0.86)', align: 'left', weight: '500' });
  });

  if (save.best.level) {
    text(ctx, `최고 기록  레벨 ${save.best.level}  ·  ${save.best.score}점`, W / 2, run ? 786 : 812, {
      size: 21, color: 'rgba(200,208,228,0.62)', align: 'center', weight: '600',
    });
  }

  const free = freeReady(save.wallet);
  const shopSub = free ? '무료 아이템이 기다린다' : itemLine(save.wallet);

  // 두던 판이 있으면 그것부터 권한다
  const rects = {};
  if (run) {
    const [resume, start, shop] = stackedButtons(3, { y: 1096, h: 84, gap: 12 });
    rects.resume = button(ctx, resume, {
      label: `이어하기 · 레벨 ${run.level}`,
      sub: run.total ? `${run.total}점에서` : '',
      accent: '#46f0d0', active: true,
    });
    rects.start = button(ctx, start, { label: '새로 시작', accent: '#9bb0ff' });
    rects.shop = button(ctx, shop, { label: '상점', sub: shopSub, accent: '#ffd166', active: free });
  } else {
    const [start, shop] = stackedButtons(2, { y: 1080, h: 88, gap: 12 });
    rects.start = button(ctx, start, { label: '시작', accent: '#46f0d0', active: true });
    rects.shop = button(ctx, shop, { label: '상점', sub: shopSub, accent: '#ffd166', active: free });
  }

  text(ctx, IS_TOUCH ? '타일을 눌러 집는다' : '클릭으로 집는다 · Z X V C 도구',
    W / 2, 1146, { size: 16, color: 'rgba(200,208,228,0.4)', align: 'center', weight: '500' });
  return rects;
}

/** 지갑에 든 아이템을 한 줄로 — "되돌리기 2 · 뒤집기 1" */
function itemLine(wallet) {
  const parts = [];
  for (const [name, n] of Object.entries(wallet.items)) {
    if (n > 0) parts.push(`${ITEM_NAME[name]} ${n}`);
  }
  return parts.length ? parts.join(' · ') : '아이템이 없다';
}

export function pauseScreen(ctx, session, diag = null) {
  dim(ctx);
  panel(ctx, PANEL, { accent: 'rgba(70,240,208,0.35)' });

  // 판이 이상해서 다시 쏟은 적이 있으면 그 사실을 여기 남긴다.
  // 재현이 안 되는 종류의 사고라, 무엇이 이상했는지는 사람이 알려 줘야 한다.
  if (diag) {
    text(ctx, `판을 다시 쏟았다 · ${diag.why} · 레벨 ${diag.level}`, W / 2, PANEL.y + 46, {
      size: 15, color: 'rgba(255,209,102,0.7)', align: 'center', weight: '600',
    });
  }

  text(ctx, '일시정지', W / 2, PANEL.y + 90, {
    size: 44, color: '#ffffff', align: 'center', weight: '700', glow: 16,
  });
  text(ctx, `레벨 ${session.level} · ${session.total}점 · ${fmtTime(session.time)}`, W / 2, PANEL.y + 150, {
    size: 22, color: 'rgba(220,228,246,0.7)', align: 'center', weight: '500',
  });

  const [resume, shop, restart, quit] = stackedButtons(4, { h: 76, gap: 12 });
  button(ctx, resume, { label: '계속하기', accent: '#46f0d0', active: true });
  button(ctx, shop, { label: '상점', accent: '#ffd166' });
  button(ctx, restart, { label: '이 레벨 다시', accent: '#9bb0ff' });
  button(ctx, quit, { label: '처음으로', accent: '#ff4d6d' });
  return { resume, shop, restart, quit };
}

export function clearScreen(ctx, session) {
  const P = CLEAR_PANEL;
  dim(ctx, 0.66);
  panel(ctx, P, { accent: 'rgba(70,240,208,0.4)' });

  text(ctx, '판 정리 완료', W / 2, P.y + 86, {
    size: 46, color: '#46f0d0', align: 'center', weight: '700', glow: 22,
  });
  text(ctx, `레벨 ${session.level}`, W / 2, P.y + 132, {
    size: 24, color: 'rgba(220,228,246,0.75)', align: 'center', weight: '600',
  });

  const speed = Math.max(0, 1 - session.time / session.spec.parTime);
  const rows = [
    ['매치 점수', String(session.score - (session.clearBonus || 0))],
    ['클리어 보너스', String(SCORE.clear)],
    [`속도 보너스 (${fmtTime(session.time)})${speed > 0.5 ? '  빨랐다' : ''}`,
      String((session.clearBonus || 0) - SCORE.clear)],
    ['누적 점수', String(session.total)],
  ];
  rows.forEach(([k, v], i) => {
    const yy = P.y + 204 + i * 48;
    const last = i === rows.length - 1;
    text(ctx, k, P.x + 48, yy, {
      size: last ? 23 : 20, color: last ? '#ffffff' : 'rgba(220,228,246,0.72)', weight: last ? '700' : '500',
    });
    text(ctx, v, P.x + P.w - 48, yy, {
      size: last ? 25 : 21, color: last ? '#ffd166' : '#e8ecf7', align: 'right', weight: '700',
    });
    if (last) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(P.x + 48, yy - 32, P.w - 96, 1);
    }
  });

  reward(ctx, P, session.reward);

  const [shop, next] = stackedButtons(2, { y: P.y + P.h - 34, h: 84, gap: 12, box: P });
  const rects = {};
  rects.shop = button(ctx, shop, { label: '상점', accent: '#ffd166' });
  rects.next = button(ctx, next, { label: `레벨 ${session.level + 1} 로`, accent: '#46f0d0', active: true });
  return rects;
}

/** 이번 판으로 번 것 — 골드와 아이템 세트. */
function reward(ctx, P, got) {
  const y = P.y + 424;
  ctx.save();
  ctx.fillStyle = 'rgba(255,209,102,0.07)';
  ctx.fillRect(P.x + 32, y - 36, P.w - 64, 128);
  ctx.restore();

  text(ctx, '이번 판 보상', P.x + 48, y, { size: 19, color: 'rgba(255,209,102,0.8)', weight: '700' });
  if (!got) {
    text(ctx, '없음', P.x + 48, y + 46, { size: 20, color: 'rgba(200,208,228,0.5)', weight: '500' });
    return;
  }
  text(ctx, `+${got.gold}`, P.x + P.w - 48, y, {
    size: 26, color: '#ffd166', align: 'right', weight: '700',
  });

  const names = Object.keys(got.set);
  if (!names.length) {
    text(ctx, '아이템 없음', P.x + 48, y + 50, { size: 19, color: 'rgba(200,208,228,0.5)', weight: '500' });
    return;
  }
  names.forEach((name, i) => {
    const x = P.x + 62 + i * 132;
    drawIcon(ctx, name, x, y + 44, 17, ITEM_COLOR[name]);
    text(ctx, `${ITEM_NAME[name]} +${got.set[name]}`, x, y + 78, {
      size: 16, color: 'rgba(226,232,247,0.8)', align: 'center', weight: '600',
    });
  });
}

function canAffordRevive(save) {
  return save.wallet.gold >= price('withdraw');
}

export function overScreen(ctx, session, save, rank) {
  const P = OVER_PANEL;
  dim(ctx);
  panel(ctx, P, { accent: 'rgba(255,77,109,0.4)' });

  text(ctx, '트레이가 찼다', W / 2, P.y + 88, {
    size: 44, color: '#ff4d6d', align: 'center', weight: '700', glow: 20,
  });
  text(ctx, `레벨 ${session.level} 에서 끝 · ${session.total}점`, W / 2, P.y + 140, {
    size: 23, color: 'rgba(220,228,246,0.78)', align: 'center', weight: '600',
  });
  if (rank) {
    text(ctx, `이번 판 ${rank}위`, W / 2, P.y + 178, {
      size: 20, color: '#ffd166', align: 'center', weight: '700',
    });
  }

  // 빼내기가 없으면 상점에서 사서 이어할 수 있다 — 그래서 상점은 늘 열어 둔다.
  const canRevive = session.charges.withdraw > 0 && session.tray.length > 0;
  const menu = canRevive
    ? [
      ['revive', { label: '빼내기로 이어하기', sub: '맨 왼쪽 무늬로 한 벌을 완성해 비운다',
        accent: '#ffd166', active: true, badge: session.charges.withdraw }],
      ['shop', { label: '상점', accent: '#ffd166' }],
    ]
    : [
      ['shop', { label: '상점', sub: '빼내기를 사면 그 자리에서 이어할 수 있다',
        accent: '#ffd166', active: canAffordRevive(save) }],
    ];
  menu.push(['again', { label: '이 레벨 다시', accent: '#9bb0ff', active: !canRevive }]);
  menu.push(['quit', { label: '처음으로', accent: '#ff4d6d' }]);

  // 버튼 자리를 **먼저** 잡는다. 순위표는 그러고 남은 자리에만 그린다 —
  // 줄 수를 고정해 두면 버튼이 하나 늘어나는 순간(이어하기가 붙는 판) 글자가
  // 버튼 위로 겹쳐 찍힌다.
  const slots = stackedButtons(menu.length, { y: P.y + P.h - 34, h: 76, gap: 12, box: P });
  board(ctx, P, save, session, rank, P.y + (rank ? 216 : 190), slots[0].y - 18);

  const rects = {};
  menu.forEach(([name, opts], i) => { rects[name] = button(ctx, slots[i], opts); });
  return rects;
}

/**
 * 순위표 — top 부터 bottom 사이에 들어가는 줄만 그린다.
 *
 * 이번 판은 아직 기록에 넣지 않았다(이어하기를 고를 수 있으므로). 그래도 순위표에는
 * 자리를 잡아 보여줘야 "1위인데 기록이 없다"는 모순이 안 생긴다.
 */
function board(ctx, P, save, session, rank, top, bottom) {
  const ROW = 42;
  const rows = save.board.slice(0, 5).map(e => ({ level: e.level, score: e.score, mine: false }));
  if (rank) rows.splice(Math.min(rank - 1, rows.length), 0,
    { level: session.level, score: session.total, mine: true });

  const fit = Math.max(0, Math.floor((bottom - top) / ROW));
  if (!rows.length) {
    text(ctx, '아직 기록이 없다', W / 2, (top + bottom) / 2, {
      size: 20, color: 'rgba(200,208,228,0.45)', align: 'center', weight: '500',
    });
    return;
  }

  rows.slice(0, fit).forEach((e, i) => {
    const yy = top + 22 + i * ROW;
    text(ctx, `${i + 1}`, P.x + 44, yy, {
      size: 20, color: e.mine ? '#ffd166' : 'rgba(200,208,228,0.5)', weight: '700',
    });
    text(ctx, `레벨 ${e.level}`, P.x + 84, yy, {
      size: 20, color: e.mine ? '#ffffff' : 'rgba(220,228,246,0.7)', weight: '600',
    });
    if (e.mine) {
      text(ctx, '이번 판', P.x + 210, yy, { size: 18, color: '#ffd166', weight: '600' });
    }
    text(ctx, `${e.score}점`, P.x + P.w - 44, yy, {
      size: 20, color: e.mine ? '#ffd166' : 'rgba(220,228,246,0.7)', align: 'right', weight: '600',
    });
  });
}
