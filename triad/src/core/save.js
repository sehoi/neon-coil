// localStorage 래퍼. 어떤 경우에도 throw 하지 않는다. [NEON COIL 이식]

import { SETTINGS } from '../config.js';

const KEY = 'neontriad.save';
const VERSION = 1;
export const BOARD_SIZE = 6;

const DEFAULT = {
  v: VERSION,
  best: { level: 0, score: 0 },
  board: [],                          // { level, score, time, date }
  settings: { muted: false, glow: true },
};

let data = clone(DEFAULT);

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.v === VERSION) {
      data = Object.assign(clone(DEFAULT), parsed);
      data.best = Object.assign(clone(DEFAULT.best), parsed.best);
      data.settings = Object.assign(clone(DEFAULT.settings), parsed.settings);
      data.board = Array.isArray(parsed.board) ? parsed.board.slice(0, BOARD_SIZE) : [];
      sortBoard();
    }
  } catch {
    data = clone(DEFAULT);            // 손상된 저장은 조용히 버린다
  }
  SETTINGS.muted = !!data.settings.muted;
  SETTINGS.glow = data.settings.glow !== false;
  return data;
}

export function getSave() { return data; }

function sortBoard() {
  data.board.sort((a, b) => (b.score - a.score) || (b.level - a.level) || (a.time - b.time));
}

/** 한 런의 결과를 남긴다. @returns {number} 1부터의 순위, 진입 실패면 0 */
export function submitRun(level, score, time) {
  const entry = { level, score: Math.floor(score), time: Math.floor(time), date: Date.now() };
  data.board.push(entry);
  sortBoard();
  data.board = data.board.slice(0, BOARD_SIZE);
  if (score > data.best.score) data.best.score = Math.floor(score);
  if (level > data.best.level) data.best.level = level;
  persist();
  const i = data.board.indexOf(entry);
  return i >= 0 ? i + 1 : 0;
}

/** 아직 기록에 넣지 않고 몇 위가 될지만 본다 (이어하기를 고를 수 있으므로). */
export function previewRank(score) {
  const s = Math.floor(score);
  let rank = 1;
  for (const e of data.board) if (e.score > s) rank++;
  return rank <= BOARD_SIZE ? rank : 0;
}

export function persist() {
  try {
    data.settings.muted = SETTINGS.muted;
    data.settings.glow = SETTINGS.glow;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 시크릿 모드 등에서 실패할 수 있다. 진행에는 영향 없다.
  }
}

export function resetSave() {
  data = clone(DEFAULT);
  persist();
  return data;
}
