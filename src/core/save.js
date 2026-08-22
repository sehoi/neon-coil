// localStorage 래퍼. 어떤 경우에도 throw 하지 않는다.

import { SETTINGS } from '../config.js';

const KEY = 'neoncoil.save';
const VERSION = 1;

const DEFAULT = {
  v: VERSION,
  best: { score: 0, len: 0, rank: 99, kills: 0, time: 0 },
  /** 로컬 기록 — 상위 8개. { score, len, rank, kills, time, date } */
  board: [],
  settings: { glow: true, muted: false, shake: 1.0, showFps: false, control: 'key' },
};

export const BOARD_SIZE = 8;

let data = clone(DEFAULT);

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === VERSION) {
        data = Object.assign(clone(DEFAULT), parsed);
        data.best = Object.assign(clone(DEFAULT.best), parsed.best);
        data.settings = Object.assign(clone(DEFAULT.settings), parsed.settings);
        // 점수가 없던 시절의 기록은 길이를 점수로 승계한다 (지워버리면 억울하다)
        data.board = Array.isArray(parsed.board) ? parsed.board.slice(0, BOARD_SIZE) : [];
        for (const e of data.board) if (typeof e.score !== 'number') e.score = e.len || 0;
        if (typeof data.best.score !== 'number') data.best.score = data.best.len || 0;
        sortBoard();
      }
    }
  } catch {
    data = clone(DEFAULT);   // 손상된 저장은 조용히 버린다
  }
  SETTINGS.glow = data.settings.glow;
  SETTINGS.muted = data.settings.muted;
  SETTINGS.shake = data.settings.shake;
  SETTINGS.showFps = data.settings.showFps;
  SETTINGS.control = data.settings.control === 'mouse' ? 'mouse' : 'key';
  return data;
}

export function getSave() { return data; }

/**
 * 기록 정렬.
 *
 * 1순위는 점수다. 다만 점수만 보면 동점이 흔하고(같은 판에서 나온 기록끼리는
 * 특히), 그때 순서가 들쭉날쭉하면 "같은 점수인데 왜 내가 아래냐"가 된다.
 * 그래서 동점일 때 무엇이 더 잘한 판인지를 끝까지 따진다:
 *   점수 → 처치 → 최종 순위(낮을수록) → 최고 길이 → 생존 시간(길수록) → 먼저 세운 기록
 */
function sortBoard() {
  data.board.sort((a, b) =>
    (b.score - a.score) ||
    (b.kills - a.kills) ||
    (a.rank - b.rank) ||
    (b.len - a.len) ||
    (b.time - a.time) ||
    (a.date - b.date));
}

/**
 * 기록을 남긴다.
 * @returns {number} 1부터 시작하는 순위. 진입 실패면 0.
 */
export function submitRecord(score, len, rank, kills, time) {
  const entry = {
    score: Math.floor(score),
    len: Math.floor(len),
    rank, kills,
    time: Math.floor(time),
    date: Date.now(),
  };
  data.board.push(entry);
  sortBoard();
  data.board = data.board.slice(0, BOARD_SIZE);
  persist();
  const idx = data.board.indexOf(entry);
  return idx >= 0 ? idx + 1 : 0;
}

export function persist() {
  try {
    data.settings.glow = SETTINGS.glow;
    data.settings.muted = SETTINGS.muted;
    data.settings.shake = SETTINGS.shake;
    data.settings.showFps = SETTINGS.showFps;
    data.settings.control = SETTINGS.control;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 시크릿 모드 등에서 실패할 수 있다. 진행에는 영향 없음.
  }
}

export function resetSave() {
  data = clone(DEFAULT);
  persist();
  return data;
}
