// localStorage 래퍼. 어떤 경우에도 throw 하지 않는다.

import { SETTINGS } from '../config.js';

const KEY = 'neoncoil.save';
const VERSION = 1;

const DEFAULT = {
  v: VERSION,
  best: { len: 0, rank: 99, kills: 0, time: 0 },
  /** 로컬 기록 — 상위 8개. { len, rank, kills, time, date } */
  board: [],
  settings: { glow: true, muted: false, shake: 1.0, showFps: false },
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
        data.board = Array.isArray(parsed.board) ? parsed.board.slice(0, BOARD_SIZE) : [];
      }
    }
  } catch {
    data = clone(DEFAULT);   // 손상된 저장은 조용히 버린다
  }
  SETTINGS.glow = data.settings.glow;
  SETTINGS.muted = data.settings.muted;
  SETTINGS.shake = data.settings.shake;
  SETTINGS.showFps = data.settings.showFps;
  return data;
}

export function getSave() { return data; }

/**
 * 기록을 남긴다. 정렬 기준은 **길이** — 이 게임의 목표가 길어지는 것이다.
 * @returns {number} 1부터 시작하는 순위. 진입 실패면 0.
 */
export function submitRecord(len, rank, kills, time) {
  const entry = { len: Math.floor(len), rank, kills, time: Math.floor(time), date: Date.now() };
  data.board.push(entry);
  data.board.sort((a, b) => b.len - a.len);
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
