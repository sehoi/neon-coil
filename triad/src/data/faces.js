// 패 얼굴 — 진짜 마작패의 무늬를 그린다. 만수(萬)·통수(筒)·삭수(索)와 자패(中發東南白).
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

let atlas = null;

/** 열두 칸짜리 얼굴 아틀라스. 처음 부를 때 한 번 그린다. */
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
    (cjk ? drawFace : drawPlainFace)(c, i);
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
 * 두부 여섯 장이 되어 게임 자체가 성립하지 않으므로, 그때는 통수·삭수로 대신한다.
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
  return real !== 0 && real !== ink('');
}

// ── 한자 얼굴 열두 가지 ───────────────────────────────────────────────────

function drawFace(c, kind) {
  switch (kind) {
    case 0: char(c, '中', 0.62, RED); break;                    // 홍중
    case 1: dots(c, [[0.5, 0.5, 0.29]]); break;                 // 일통
    case 2: bamboos(c, 3); break;                               // 삼삭
    case 3: white(c); break;                                    // 백판
    case 4: char(c, '發', 0.6, GREEN); break;                   // 녹발
    case 5: dots(c, [[0.31, 0.26, 0.15], [0.5, 0.5, 0.15], [0.69, 0.74, 0.15]]); break;   // 삼통
    case 6: char(c, '東', 0.58, BLUE); break;                   // 동
    case 7: bamboos(c, 1); break;                               // 일삭
    case 8: wan(c, '一'); break;                                // 일만
    case 9: dots(c, [[0.29, 0.27, 0.135], [0.71, 0.27, 0.135], [0.5, 0.5, 0.135],
                     [0.29, 0.73, 0.135], [0.71, 0.73, 0.135]]); break;                   // 오통
    case 10: char(c, '南', 0.58, GREEN); break;                 // 남
    default: wan(c, '九'); break;                               // 구만
  }
}

// ── 한자가 없는 기기용 — 통수와 삭수만으로 열두 가지 ──────────────────────

function drawPlainFace(c, kind) {
  switch (kind) {
    case 0: middle(c); break;                                   // 중 (테두리로 대신)
    case 2: bamboos(c, 3); break;
    case 3: white(c); break;
    case 4: bamboos(c, 2); break;
    case 6: dots(c, [[0.34, 0.34, 0.16], [0.66, 0.34, 0.16],
                     [0.34, 0.66, 0.16], [0.66, 0.66, 0.16]]); break;                     // 사통
    case 7: bamboos(c, 1); break;
    case 8: dots(c, [[0.5, 0.29, 0.19], [0.5, 0.71, 0.19]]); break;                       // 이통
    case 10: bamboos(c, 4); break;
    case 11: dots(c, [[0.29, 0.22, 0.11], [0.5, 0.22, 0.11], [0.71, 0.22, 0.11],
                      [0.29, 0.5, 0.11], [0.5, 0.5, 0.11], [0.71, 0.5, 0.11],
                      [0.29, 0.78, 0.11], [0.5, 0.78, 0.11], [0.71, 0.78, 0.11]]); break; // 구통
    default: drawFace(c, kind); break;                          // 통수는 그대로
  }
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

/** 통수패 — 겹고리 동전. [x, y, r] 은 칸 높이 대비 비율. */
function dots(c, list) {
  for (const [fx, fy, fr] of list) {
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
  const cols = n === 1 ? [0.5] : n === 2 ? [0.36, 0.64] : n === 3 ? [0.25, 0.5, 0.75] : [0.22, 0.41, 0.59, 0.78];
  const h = CELL_H * (n === 1 ? 0.66 : 0.56);
  const w = CELL_W * (n === 1 ? 0.2 : n === 4 ? 0.11 : 0.14);
  for (const fx of cols) stick(c, CELL_W * fx, CELL_H * 0.5, w, h, n === 1);
}

/** 대나무 한 대 — 초록 몸통을 마디 두 줄로 끊고, 위아래에 붉은 촉을 얹는다. */
function stick(c, x, y, w, h, big) {
  const body = h * (big ? 0.78 : 0.84);
  c.fillStyle = GREEN;
  roundRect(c, x - w / 2, y - body / 2, w, body, w * 0.4);
  c.fill();

  // 마디는 파내서 뒤(패 바탕)가 비치게 한다 — 바탕색을 여기서 알 필요가 없다
  c.save();
  c.globalCompositeOperation = 'destination-out';
  for (const k of [-1, 1]) {
    c.fillRect(x - w / 2, y + k * body * 0.24 - body * 0.028, w, body * 0.056);
  }
  c.restore();

  c.fillStyle = RED;
  for (const k of [-1, 1]) {
    const ty = y + k * body * 0.5;
    c.beginPath();
    c.moveTo(x, ty + k * h * 0.11);
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

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
