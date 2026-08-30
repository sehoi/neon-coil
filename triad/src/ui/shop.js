// 상점 — 골드로 아이템을 사고, 시간이 차면 무료로 한 개 받는다.
// 다른 화면과 같은 약속: 그린 사각형을 돌려주고 누름 판정은 main 이 그걸로 한다.

import { W } from '../config.js';
import { ECONOMY, TILES } from '../data/tuning.js';
import { ITEMS, price, canBuy, freeIn, freeReady } from '../game/wallet.js';
import { text, button, panel, roundRect, dim } from './widgets.js';
import { drawIcon, drawGlyph } from './icons.js';

export const ITEM_NAME = { undo: '되돌리기', withdraw: '빼내기', flip: '뒤집기', shuffle: '섞기' };
// 한 줄에 값 버튼까지 들어가야 한다. 열넉 자를 넘기면 버튼 밑으로 파고든다.
export const ITEM_WHAT = {
  undo:     '마지막 한 장을 판에 던진다',
  withdraw: '맨 왼쪽 무늬로 한 벌 완성',
  flip:     '남은 타일을 전부 정렬한다',
  shuffle:  '처음처럼 다시 쏟는다',
};
export const ITEM_COLOR = { undo: '#9bb0ff', withdraw: '#ffd166', flip: '#ff6bd6', shuffle: '#46f0d0' };

const PANEL = { x: 40, y: 150, w: W - 80, h: 920 };
const ROW = { h: 116, gap: 10 };

/**
 * @param tiles 지금(또는 다음) 판의 타일 수 — 값이 이 크기에 맞춰 오른다
 * @param note 방금 산 것 · 받은 것을 알리는 한 줄 (없으면 안 그린다)
 * @returns 누름 판정용 사각형들 — buy.<이름>, free, close
 */
export function shopScreen(ctx, wallet, t, note = null, tiles = TILES.min) {
  dim(ctx, 0.86);
  panel(ctx, PANEL, { accent: 'rgba(255,209,102,0.42)' });

  text(ctx, '상점', PANEL.x + 40, PANEL.y + 74, {
    size: 40, color: '#ffffff', weight: '700', glow: 14,
  });
  goldTag(ctx, PANEL.x + PANEL.w - 40, PANEL.y + 62, wallet.gold);
  text(ctx, `판을 깨면 점수 ${ECONOMY.goldPerScore} 마다 1골드`, PANEL.x + 40, PANEL.y + 108, {
    size: 17, color: 'rgba(200,208,228,0.55)', weight: '500',
  });

  const rects = { buy: {} };
  const top = PANEL.y + 128;
  ITEMS.forEach((name, i) => {
    const r = { x: PANEL.x + 26, y: top + i * (ROW.h + ROW.gap), w: PANEL.w - 52, h: ROW.h };
    rects.buy[name] = itemRow(ctx, r, wallet, name, tiles);
  });

  // 무료 아이템 — 시계가 차면 켜진다
  const fy = top + ITEMS.length * (ROW.h + ROW.gap) + 10;
  const fr = { x: PANEL.x + 26, y: fy, w: PANEL.w - 52, h: 92 };
  const ready = freeReady(wallet);
  button(ctx, fr, {
    label: ready ? '무료 아이템 받기' : '무료 아이템',
    sub: ready ? `${Math.round(ECONOMY.free.everyMs / 60000)}분마다 한 개` : `${fmtLeft(freeIn(wallet))} 뒤`,
    accent: '#46f0d0', active: ready, disabled: !ready,
  });
  drawGlyph(ctx, 'gift', fr.x + 52, fr.y + fr.h / 2, 15, ready ? '#46f0d0' : '#8b93aa');
  rects.free = fr;

  if (note) {
    text(ctx, note, W / 2, fy + 128, {
      size: 21, color: '#ffd166', align: 'center', weight: '700',
      glow: 10 + Math.sin(t * 6) * 4,
    });
  }

  const cr = { x: PANEL.x + 26, y: PANEL.y + PANEL.h - 96, w: PANEL.w - 52, h: 76 };
  button(ctx, cr, { label: '닫기', accent: '#9bb0ff' });
  rects.close = cr;
  return rects;
}

/** 아이템 한 줄 — 아이콘 · 이름과 설명 · 보유량 · [값] 버튼. */
function itemRow(ctx, r, wallet, name, tiles) {
  const color = ITEM_COLOR[name];
  const owned = wallet.items[name];
  const cost = price(name, tiles);
  const afford = canBuy(wallet, name, tiles);

  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.stroke();
  ctx.restore();

  drawIcon(ctx, name, r.x + 54, r.y + 44, 21, color);
  text(ctx, `보유 ${owned}`, r.x + 54, r.y + 92, {
    size: 16, color: owned ? '#e8ecf7' : 'rgba(200,208,228,0.45)', align: 'center', weight: '700',
  });

  text(ctx, ITEM_NAME[name], r.x + 108, r.y + 44, { size: 25, color: '#f2f5ff', weight: '700' });
  text(ctx, ITEM_WHAT[name], r.x + 108, r.y + 78, {
    size: 15, color: 'rgba(214,222,242,0.66)', weight: '500',
  });

  // 값 버튼은 줄 오른쪽에 붙는다. 누름 판정도 이 사각형으로만 한다.
  const br = { x: r.x + r.w - 142, y: r.y + 24, w: 118, h: 68 };
  button(ctx, br, { label: String(cost), accent: '#ffd166', disabled: !afford, radius: 14 });
  drawGlyph(ctx, 'coin', br.x + 22, br.y + br.h / 2, 8, afford ? '#ffd166' : '#8b93aa');
  return br;
}

/** 지금 가진 골드. 화면 여러 곳에서 쓴다. */
export function goldTag(ctx, xRight, y, gold, size = 30) {
  const label = String(gold);
  text(ctx, label, xRight, y, { size, color: '#ffd166', align: 'right', weight: '700' });
  ctx.save();
  ctx.font = `700 ${size}px ui-monospace, monospace`;
  const w = ctx.measureText(label).width;
  ctx.restore();
  drawGlyph(ctx, 'coin', xRight - w - size * 0.62, y - size * 0.34, size * 0.32, '#ffd166');
}

function fmtLeft(ms) {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}
