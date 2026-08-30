// 상단 정보줄, 트레이, 도구 버튼.

import { W, LAYOUT, SETTINGS, IS_TOUCH } from '../config.js';
import { TRAY_CAP } from '../data/tuning.js';
import { remaining } from '../game/pile.js';
import { text, button, roundRect, fmtTime, FONT } from './widgets.js';
import { BTN, POWERS, powerRects } from './rects.js';
import { drawIcon, drawGlyph } from './icons.js';
import { drawSlot } from '../render/tiles.js';
import { traySlot } from '../render/geom.js';
import { ITEM_NAME, ITEM_COLOR } from './shop.js';

const POWER_HINT = { undo: '판에 던진다', withdraw: '왼쪽 한 벌', flip: '전부 정렬', shuffle: '다시 쏟기' };
const POWER_KEY  = { undo: 'Z', withdraw: 'X', flip: 'V', shuffle: 'C' };

/**
 * @param save 기록·지갑을 함께 담은 저장 객체. 골드는 여기서 왼쪽 아래 구석에
 *   작게 보여준다 — 예전에는 상점을 열어 봐야만 보였는데, 살 것이 있는지
 *   판단하려면 매번 상점부터 열어야 했다.
 */
export function drawHud(ctx, session, save) {
  // 배경 띠
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0, 0, W, LAYOUT.hud.h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, LAYOUT.hud.h - 1, W, 1);

  circleButton(ctx, BTN.pause, 'pause', '#e8ecf7');
  circleButton(ctx, BTN.mute, SETTINGS.muted ? 'muted' : 'sound', SETTINGS.muted ? '#8b93aa' : '#e8ecf7');

  text(ctx, `LEVEL ${session.level}`, W / 2, 48, {
    size: 32, color: '#ffffff', align: 'center', baseline: 'middle', weight: '700', glow: 12,
  });

  const stats = [
    ['점수', String(session.total)],
    ['남은', String(remaining(session.pile))],
    ['시간', fmtTime(session.time)],
  ];
  stats.forEach(([k, v], i) => {
    const x = 112 + i * 190;
    text(ctx, k, x, 92, { size: 17, color: 'rgba(200,208,228,0.62)', align: 'center', weight: '500' });
    text(ctx, v, x, 118, { size: 25, color: '#dfe6f8', align: 'center', weight: '700' });
  });

  // 일시정지 버튼 아래 여백에 넣는다 — "점수" 칸이 x:90 부터 시작해
  // 자릿수가 늘어도 겹치지 않는 곳은 여기뿐이다 (68px 폭, 자릿수에 맞춰 글자를 줄인다).
  if (save && save.wallet) {
    const label = String(save.wallet.gold);
    const size = label.length <= 3 ? 16 : label.length === 4 ? 14 : label.length === 5 ? 12 : 10;
    const cx = BTN.pause.x + BTN.pause.w / 2, cy = 112;
    ctx.save();
    ctx.font = `700 ${size}px ${FONT}`;
    const tw = ctx.measureText(label).width;
    ctx.restore();
    const r = size * 0.34, gap = 4;
    const left = cx - (r * 2 + gap + tw) / 2;
    drawGlyph(ctx, 'coin', left + r, cy, r, '#ffd166');
    text(ctx, label, left + r * 2 + gap, cy, {
      size, color: '#ffd166', align: 'left', baseline: 'middle', weight: '700',
    });
  }

  if (session.combo > 1) {
    text(ctx, `${session.combo} 연속!`, W - 22, 118, {
      size: 22, color: '#ffd166', align: 'right', weight: '700', glow: 10,
    });
  } else if (save && save.best && save.best.score) {
    text(ctx, `최고 ${save.best.score}`, W - 24, 118, {
      size: 18, color: 'rgba(200,208,228,0.45)', align: 'right', weight: '500',
    });
  }
}

function circleButton(ctx, r, glyph, color) {
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, r.w / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.stroke();
  drawGlyph(ctx, glyph, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.3, color);
  ctx.restore();
}

/** 트레이 — 빈 칸과 경고선. 타일 자체는 renderer 가 애니메이션과 함께 그린다. */
export function drawTray(ctx, session) {
  const danger = session.tray.length >= TRAY_CAP - 1;
  const t = LAYOUT.tray;

  ctx.save();
  roundRect(ctx, t.x - 12, t.y - 14, t.w + 24, t.h + 28, 20);
  ctx.fillStyle = danger ? 'rgba(255,77,109,0.10)' : 'rgba(255,255,255,0.035)';
  ctx.fill();
  ctx.lineWidth = danger ? 2.4 : 1.4;
  ctx.strokeStyle = danger ? 'rgba(255,77,109,0.7)' : 'rgba(255,255,255,0.12)';
  if (danger && SETTINGS.glow) { ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 18; }
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < t.slots; i++) drawSlot(ctx, traySlot(i));

  text(ctx, `${session.tray.length} / ${TRAY_CAP}`, t.x + t.w, t.y - 24, {
    size: 18, color: danger ? '#ff8ea3' : 'rgba(200,208,228,0.5)', align: 'right', weight: '600',
  });
  // 한 번 맞춰 본 뒤에는 설명이 필요 없다. 점수 연출과 겹치기만 한다.
  if (session.stats.matches === 0) {
    text(ctx, '같은 무늬 3장이면 사라진다', t.x, t.y - 24, {
      size: 18, color: 'rgba(200,208,228,0.5)', align: 'left', weight: '500',
    });
  }
}

export function drawPowers(ctx, session, hover) {
  const rects = powerRects();
  for (const name of POWERS) {
    const r = rects[name];
    const n = session.charges[name];
    const usable = n > 0 && session.state === 'play' && !session.pouring;
    button(ctx, r, {
      label: '', sub: '', accent: ITEM_COLOR[name], disabled: !usable,
      badge: n, active: hover === name,
    });
    drawIcon(ctx, name, r.x + r.w / 2, r.y + 42, 20, usable ? ITEM_COLOR[name] : '#8b93aa');
    text(ctx, ITEM_NAME[name], r.x + r.w / 2, r.y + 84, {
      size: 20, color: usable ? '#f2f5ff' : 'rgba(200,208,228,0.5)', align: 'center', weight: '700',
    });
    const hint = POWER_HINT[name] + (IS_TOUCH ? '' : ` [${POWER_KEY[name]}]`);
    text(ctx, hint, r.x + r.w / 2, r.y + 108, {
      size: 13, color: 'rgba(200,208,228,0.5)', align: 'center', weight: '500',
    });
  }
  return rects;
}
