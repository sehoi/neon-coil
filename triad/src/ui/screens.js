// 오버레이 화면들. 각 함수는 그린 버튼 사각형을 돌려주고, main 이 그걸로 탭을 판정한다.
// 그리는 좌표와 누르는 좌표가 갈라지지 않게 하려는 것이다.

import { W, H, IS_TOUCH } from '../config.js';
import { SCORE } from '../data/tuning.js';
import { text, button, panel, fmtTime } from './widgets.js';
import { PANEL, stackedButtons } from './rects.js';
import { TILE } from '../data/tuning.js';
import { drawTile } from '../render/tiles.js';

export function dim(ctx, alpha = 0.72) {
  ctx.fillStyle = `rgba(6,8,16,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

export function titleScreen(ctx, save, t) {
  dim(ctx, 0.82);

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
    ['1', '무늬가 보이는 타일은 무엇이든 집힌다'],
    ['2', '엎어지거나 모로 선 것은 못 집는다'],
    ['3', '같은 무늬 3장이 모이면 사라진다'],
    ['!', '트레이 7칸이 다 차면 그 판은 끝난다'],
  ];
  rows.forEach(([n, line], i) => {
    const yy = 596 + i * 48;
    text(ctx, n, 118, yy, { size: 22, color: n === '!' ? '#ff4d6d' : '#46f0d0', align: 'left', weight: '700' });
    text(ctx, line, 154, yy, { size: 22, color: 'rgba(226,232,247,0.86)', align: 'left', weight: '500' });
  });

  if (save.best.level) {
    text(ctx, `최고 기록  레벨 ${save.best.level}  ·  ${save.best.score}점`, W / 2, 838, {
      size: 21, color: 'rgba(200,208,228,0.62)', align: 'center', weight: '600',
    });
  }

  const [start] = stackedButtons(1, { y: 992, h: 96 });
  button(ctx, start, { label: '시작', accent: '#46f0d0', active: true });

  text(ctx, IS_TOUCH ? '타일을 눌러 집는다' : '클릭으로 집는다 · Z 되돌리기 · X 빼내기 · V 뒤집기 · C 섞기',
    W / 2, 1064, { size: 17, color: 'rgba(200,208,228,0.45)', align: 'center', weight: '500' });

  return { start };
}

export function pauseScreen(ctx, session) {
  dim(ctx);
  panel(ctx, PANEL, { accent: 'rgba(70,240,208,0.35)' });

  text(ctx, '일시정지', W / 2, PANEL.y + 90, {
    size: 44, color: '#ffffff', align: 'center', weight: '700', glow: 16,
  });
  text(ctx, `레벨 ${session.level} · ${session.total}점 · ${fmtTime(session.time)}`, W / 2, PANEL.y + 150, {
    size: 22, color: 'rgba(220,228,246,0.7)', align: 'center', weight: '500',
  });

  const [resume, restart, quit] = stackedButtons(3);
  button(ctx, resume, { label: '계속하기', accent: '#46f0d0', active: true });
  button(ctx, restart, { label: '이 레벨 다시', accent: '#9bb0ff' });
  button(ctx, quit, { label: '처음으로', accent: '#ff4d6d' });
  return { resume, restart, quit };
}

export function clearScreen(ctx, session) {
  dim(ctx, 0.66);
  panel(ctx, PANEL, { accent: 'rgba(70,240,208,0.4)' });

  text(ctx, '판 정리 완료', W / 2, PANEL.y + 96, {
    size: 46, color: '#46f0d0', align: 'center', weight: '700', glow: 22,
  });
  text(ctx, `레벨 ${session.level}`, W / 2, PANEL.y + 148, {
    size: 24, color: 'rgba(220,228,246,0.75)', align: 'center', weight: '600',
  });

  const speed = Math.max(0, 1 - session.time / session.spec.parTime);
  const rows = [
    ['매치 점수', String(session.score - (session.clearBonus || 0))],
    ['클리어 보너스', String(SCORE.clear)],
    [`속도 보너스 (${fmtTime(session.time)})`, String((session.clearBonus || 0) - SCORE.clear)],
    ['누적 점수', String(session.total)],
  ];
  rows.forEach(([k, v], i) => {
    const yy = PANEL.y + 230 + i * 52;
    const last = i === rows.length - 1;
    text(ctx, k, PANEL.x + 52, yy, {
      size: last ? 24 : 21, color: last ? '#ffffff' : 'rgba(220,228,246,0.72)', weight: last ? '700' : '500',
    });
    text(ctx, v, PANEL.x + PANEL.w - 52, yy, {
      size: last ? 26 : 22, color: last ? '#ffd166' : '#e8ecf7', align: 'right', weight: '700',
    });
    if (last) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(PANEL.x + 52, yy - 34, PANEL.w - 104, 1);
    }
  });

  if (speed > 0.5) {
    text(ctx, '빨랐다', W / 2, PANEL.y + 460, {
      size: 22, color: '#46f0d0', align: 'center', weight: '700',
    });
  }

  const [next] = stackedButtons(1, { y: PANEL.y + PANEL.h - 60, h: 92 });
  button(ctx, next, { label: `레벨 ${session.level + 1} 로`, accent: '#46f0d0', active: true });
  return { next };
}

export function overScreen(ctx, session, save, rank) {
  dim(ctx);
  panel(ctx, PANEL, { accent: 'rgba(255,77,109,0.4)' });

  text(ctx, '트레이가 찼다', W / 2, PANEL.y + 92, {
    size: 44, color: '#ff4d6d', align: 'center', weight: '700', glow: 20,
  });
  text(ctx, `레벨 ${session.level} 에서 끝 · ${session.total}점`, W / 2, PANEL.y + 146, {
    size: 23, color: 'rgba(220,228,246,0.78)', align: 'center', weight: '600',
  });
  if (rank) {
    text(ctx, `이번 판 ${rank}위`, W / 2, PANEL.y + 184, {
      size: 20, color: '#ffd166', align: 'center', weight: '700',
    });
  }

  // 이번 판은 아직 기록에 넣지 않았다 (이어하기를 고를 수 있으므로).
  // 그래도 순위표에는 자리를 잡아 보여줘야 "1위인데 기록이 없다"는 모순이 안 생긴다.
  const rows = save.board.slice(0, 5).map(e => ({ level: e.level, score: e.score, mine: false }));
  if (rank) rows.splice(rank - 1, 0, { level: session.level, score: session.total, mine: true });

  rows.slice(0, 5).forEach((e, i) => {
    const yy = PANEL.y + 250 + i * 44;
    text(ctx, `${i + 1}`, PANEL.x + 52, yy, {
      size: 20, color: e.mine ? '#ffd166' : 'rgba(200,208,228,0.5)', weight: '700',
    });
    text(ctx, `레벨 ${e.level}`, PANEL.x + 96, yy, {
      size: 20, color: e.mine ? '#ffffff' : 'rgba(220,228,246,0.7)', weight: '600',
    });
    text(ctx, e.mine ? '이번 판' : '', PANEL.x + 230, yy, {
      size: 18, color: '#ffd166', weight: '600',
    });
    text(ctx, `${e.score}점`, PANEL.x + PANEL.w - 52, yy, {
      size: 20, color: e.mine ? '#ffd166' : 'rgba(220,228,246,0.7)', align: 'right', weight: '600',
    });
  });
  if (!rows.length) {
    text(ctx, '아직 기록이 없다', W / 2, PANEL.y + 270, {
      size: 20, color: 'rgba(200,208,228,0.45)', align: 'center', weight: '500',
    });
  }

  const canRevive = session.charges.withdraw > 0 && session.tray.length > 0;
  const rects = {};
  if (canRevive) {
    const [revive, again, quit] = stackedButtons(3);
    rects.revive = button(ctx, revive, {
      label: '빼내기로 이어하기', sub: '트레이에서 3장을 판으로 되돌린다',
      accent: '#ffd166', active: true, badge: session.charges.withdraw,
    });
    rects.again = button(ctx, again, { label: '이 레벨 다시', accent: '#9bb0ff' });
    rects.quit = button(ctx, quit, { label: '처음으로', accent: '#ff4d6d' });
  } else {
    const [again, quit] = stackedButtons(2);
    rects.again = button(ctx, again, { label: '이 레벨 다시', accent: '#9bb0ff', active: true });
    rects.quit = button(ctx, quit, { label: '처음으로', accent: '#ff4d6d' });
  }
  return rects;
}
