// 패 얼굴 — 진짜 마작 한 벌 34종. 만수(萬)·통수(筒)·삭수(索)와 자패(中發白東南西北).
//
// 얼굴은 한 번만 그려 오프스크린 아틀라스에 담아 두고, 그 뒤로는 복사만 한다.
// 타일 180 장의 앞면을 매 프레임 경로로 그리면 채우기가 감당이 안 되고,
// 한자는 폰트 크기가 1 미만이면 엔진마다 제멋대로라 3D 면 위에 직접 못 쓴다.

import { SYMBOLS } from './symbols.js';

export const CELL_W = 132;
export const CELL_H = 174;          // 패 얼굴 비율 1 : 1.32 — TILE3D 의 hx : hy 와 같다

const MING = '"Noto Serif CJK KR", "Noto Serif KR", "Nanum Myeongjo", "Songti SC", "SimSun", "Yu Mincho", Batang, serif';

const INK = '#1a1a20';
const RED = '#c62828';
const GREEN = '#1b7a3e';
const BLUE = '#1f3f9e';

// 수패 1~9 가 놓이는 자리 (칸 크기 대비 비율) 와 알의 크기.
// 개수를 세지 않아도 배치 모양만으로 갈리도록 층수를 전부 다르게 잡았다.
const SPOTS = {
  1: [[0.50, 0.50]],
  2: [[0.50, 0.28], [0.50, 0.72]],
  3: [[0.29, 0.24], [0.50, 0.50], [0.71, 0.76]],
  4: [[0.32, 0.30], [0.68, 0.30], [0.32, 0.70], [0.68, 0.70]],
  5: [[0.30, 0.27], [0.70, 0.27], [0.50, 0.50], [0.30, 0.73], [0.70, 0.73]],
  6: [[0.31, 0.26], [0.69, 0.26], [0.31, 0.50], [0.69, 0.50], [0.31, 0.74], [0.69, 0.74]],
  7: [[0.26, 0.20], [0.50, 0.20], [0.74, 0.20],
      [0.32, 0.52], [0.68, 0.52], [0.32, 0.78], [0.68, 0.78]],
  8: [[0.33, 0.18], [0.67, 0.18], [0.33, 0.39], [0.67, 0.39],
      [0.33, 0.61], [0.67, 0.61], [0.33, 0.82], [0.67, 0.82]],
  9: [[0.27, 0.24], [0.50, 0.24], [0.73, 0.24], [0.27, 0.50], [0.50, 0.50],
      [0.73, 0.50], [0.27, 0.76], [0.50, 0.76], [0.73, 0.76]],
};
// 알 크기는 이웃과 안 닿는 선에서 가장 크게 잡았다 (칸 높이 대비 반지름)
const SIZE = { 1: 0.30, 2: 0.19, 3: 0.14, 4: 0.125, 5: 0.12, 6: 0.105, 7: 0.09, 8: 0.095, 9: 0.082 };

/**
 * 삭수는 대나무가 세로로 길어 동전과 같은 격자를 못 쓴다.
 * 줄마다 몇 대씩 세울지로 적는다 — 줄 수가 적을수록 대나무를 길게 세울 수 있다.
 */
const STICK_ROWS = {
  1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [2, 1, 2],
  6: [3, 3], 7: [1, 3, 3], 8: [4, 4], 9: [3, 3, 3],
};

const NUMERAL = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR = { 27: ['中', RED], 28: ['發', GREEN], 29: null, 30: ['東', BLUE], 31: ['南', GREEN], 32: ['西', RED], 33: ['北', BLUE] };
const WIND_ARROW = { 30: 0, 31: 1, 32: 2, 33: 3 };   // 東 南 西 北 → 오른 · 아래 · 왼 · 위

let atlas = null;

/** 34칸짜리 얼굴 아틀라스. 처음 부를 때 한 번 그린다. */
export function faceAtlas() {
  if (atlas) return atlas;
  atlas = document.createElement('canvas');
  atlas.width = CELL_W * SYMBOLS.length;
  atlas.height = CELL_H;
  const c = atlas.getContext('2d');
  const cjk = hasCJK();
  for (let i = 0; i < SYMBOLS.length; i++) {
    c.save();
    c.translate(i * CELL_W, 0);
    c.beginPath();
    c.rect(0, 0, CELL_W, CELL_H);
    c.clip();
    drawFace(c, i, cjk);
    c.restore();
  }
  return atlas;
}

/** 아틀라스에서 kind 칸을 (x, y, w, h) 에 옮겨 그린다. */
export function blitFace(ctx, kind, x, y, w, h) {
  const a = faceAtlas();
  ctx.drawImage(a, kind * CELL_W, 0, CELL_W, CELL_H, x, y, w, h);
}

/**
 * 한자를 그릴 수 있는지 본다. 폭만으로는 못 가른다 — 한자 폰트는 없는 글리프에도
 * 전각 폭을 주고, 없는 폰트는 두부(.notdef)도 전각으로 그린다. 그래서 실제로 찍어
 * 사용자 영역 문자와 같은 그림이 나오는지 본다. 한자가 없는 기기에서 만수·자패는
 * 두부 열여섯 장이 되어 게임 자체가 성립하지 않으므로, 그때는 획으로 대신 그린다.
 */
function hasCJK() {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 48;
  const p = probe.getContext('2d', { willReadFrequently: true });
  p.font = `700 40px ${MING}`;
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  const ink = (ch) => {
    p.clearRect(0, 0, 48, 48);
    p.fillStyle = '#000';
    p.fillText(ch, 24, 24);
    const d = p.getImageData(0, 0, 48, 48).data;
    let h = 0, n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) { n++; h = (h * 31 + i) >>> 0; }
    return n ? h : 0;
  };
  const real = ink('萬');
  return real !== 0 && real !== ink('');
}

// ── 얼굴 서른네 가지 ──────────────────────────────────────────────────────

function drawFace(c, kind, cjk) {
  if (kind < 9) return cjk ? wan(c, NUMERAL[kind]) : plainWan(c, kind + 1);
  if (kind < 18) return dots(c, kind - 8);
  if (kind < 27) return bamboos(c, kind - 17);
  if (kind === 29) return white(c);                       // 백판은 원래 글자가 없다
  if (cjk) return char(c, HONOR[kind][0], kind === 27 ? 0.62 : 0.58, HONOR[kind][1]);
  return kind === 27 ? middle(c) : kind === 28 ? prosper(c) : wind(c, WIND_ARROW[kind]);
}

// ── 조각들 ───────────────────────────────────────────────────────────────

/** 자패 — 글자 하나를 큼직하게. */
function char(c, text, size, color) {
  c.fillStyle = color;
  c.font = `700 ${Math.round(CELL_H * size)}px ${MING}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, CELL_W / 2, CELL_H * 0.52);
}

/** 만수패 — 위에 숫자, 아래에 붉은 萬. */
function wan(c, numeral) {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = INK;
  c.font = `700 ${Math.round(CELL_H * 0.42)}px ${MING}`;
  c.fillText(numeral, CELL_W / 2, CELL_H * 0.29);
  c.fillStyle = RED;
  c.font = `700 ${Math.round(CELL_H * 0.42)}px ${MING}`;
  c.fillText('萬', CELL_W / 2, CELL_H * 0.73);
}

/** 한자가 없을 때의 만수패 — 아라비아 숫자를 붉은 테에 앉힌다. */
function plainWan(c, n) {
  c.strokeStyle = RED;
  c.lineWidth = CELL_W * 0.08;
  roundRect(c, CELL_W * 0.18, CELL_H * 0.16, CELL_W * 0.64, CELL_H * 0.68, CELL_W * 0.12);
  c.stroke();
  c.fillStyle = INK;
  c.font = `700 ${Math.round(CELL_H * 0.42)}px ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(n), CELL_W / 2, CELL_H * 0.5);
}

/** 통수패 — 겹고리 동전 n 알. */
function dots(c, n) {
  const fr = SIZE[n];
  for (const [fx, fy] of SPOTS[n]) {
    const x = CELL_W * fx, y = CELL_H * fy, r = CELL_H * fr;
    c.lineWidth = r * 0.34;
    c.strokeStyle = BLUE;
    c.beginPath();
    c.arc(x, y, r * 0.82, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = GREEN;
    c.lineWidth = r * 0.22;
    c.beginPath();
    c.arc(x, y, r * 0.48, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = RED;
    c.beginPath();
    c.arc(x, y, r * 0.2, 0, Math.PI * 2);
    c.fill();
  }
}

/** 삭수패 — 마디진 대나무 n 대. */
function bamboos(c, n) {
  const rows = STICK_ROWS[n];
  const rowH = CELL_H * 0.88 / rows.length;
  const h = rowH * (rows.length === 1 ? 0.66 : 0.86);
  const wide = Math.max(...rows);
  const w = Math.min(CELL_W * 0.86 / (wide + 0.5), h * 0.42);
  rows.forEach((count, r) => {
    const y = CELL_H * 0.06 + rowH * (r + 0.5);
    const step = CELL_W * 0.84 / wide;
    for (let i = 0; i < count; i++) {
      stick(c, CELL_W / 2 + (i - (count - 1) / 2) * step, y, w, h);
    }
  });
}

/** 대나무 한 대 — 초록 몸통을 마디 두 줄로 끊고, 위아래에 붉은 촉을 얹는다. */
function stick(c, x, y, w, h) {
  const body = h * 0.8;
  c.fillStyle = GREEN;
  roundRect(c, x - w / 2, y - body / 2, w, body, w * 0.4);
  c.fill();

  // 마디는 파내서 뒤(패 바탕)가 비치게 한다 — 바탕색을 여기서 알 필요가 없다
  c.save();
  c.globalCompositeOperation = 'destination-out';
  for (const k of [-1, 1]) {
    c.fillRect(x - w / 2, y + k * body * 0.24 - body * 0.03, w, body * 0.06);
  }
  c.restore();

  c.fillStyle = RED;
  for (const k of [-1, 1]) {
    const ty = y + k * body * 0.5;
    c.beginPath();
    c.moveTo(x, ty + k * h * 0.1);
    c.lineTo(x + w * 0.55, ty);
    c.lineTo(x - w * 0.55, ty);
    c.closePath();
    c.fill();
  }
}

/** 백판 — 빈 테두리. */
function white(c) {
  const m = CELL_W * 0.2;
  c.strokeStyle = BLUE;
  c.lineWidth = CELL_W * 0.075;
  roundRect(c, m, m * 1.15, CELL_W - m * 2, CELL_H - m * 2.3, CELL_W * 0.05);
  c.stroke();
  c.lineWidth = CELL_W * 0.03;
  roundRect(c, m * 1.6, m * 1.85, CELL_W - m * 3.2, CELL_H - m * 3.7, CELL_W * 0.04);
  c.stroke();
}

/** 중(中) 을 획으로 흉내 낸 것 — 한자 폰트가 없을 때만 쓴다. */
function middle(c) {
  const w = CELL_W * 0.46, h = CELL_H * 0.3;
  const x = CELL_W / 2, y = CELL_H / 2;
  c.strokeStyle = RED;
  c.lineWidth = CELL_W * 0.1;
  c.strokeRect(x - w / 2, y - h / 2, w, h);
  c.lineWidth = CELL_W * 0.12;
  c.beginPath();
  c.moveTo(x, y - h * 1.55);
  c.lineTo(x, y + h * 1.55);
  c.stroke();
}

/** 발(發) 대신 — 위로 뻗는 초록 갈매기 셋. */
function prosper(c) {
  c.strokeStyle = GREEN;
  c.lineWidth = CELL_W * 0.11;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const y = CELL_H * (0.66 - i * 0.17);
    c.beginPath();
    c.moveTo(CELL_W * 0.24, y);
    c.lineTo(CELL_W * 0.5, y - CELL_H * 0.11);
    c.lineTo(CELL_W * 0.76, y);
    c.stroke();
  }
}

/** 동·남·서·북 대신 — 그 방향을 가리키는 화살. 0=오른 1=아래 2=왼 3=위 */
function wind(c, dir) {
  c.save();
  c.translate(CELL_W / 2, CELL_H / 2);
  c.rotate(dir * Math.PI / 2);
  c.fillStyle = BLUE;
  const s = CELL_W * 0.34;
  c.beginPath();
  c.moveTo(s * 1.15, 0);
  c.lineTo(s * 0.1, -s * 0.95);
  c.lineTo(s * 0.1, -s * 0.34);
  c.lineTo(-s * 1.15, -s * 0.34);
  c.lineTo(-s * 1.15, s * 0.34);
  c.lineTo(s * 0.1, s * 0.34);
  c.lineTo(s * 0.1, s * 0.95);
  c.closePath();
  c.fill();
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
