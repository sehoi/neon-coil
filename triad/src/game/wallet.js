// 지갑 — 골드와 아이템. 저장소도 그리기도 모른다.
// 여기서 상태를 바꾸면 저장은 부르는 쪽(main)이 한다.

import { rnd } from '../core/rng.js';
import { ECONOMY, startingItems, clearReward } from '../data/tuning.js';

/** 아이템 네 종류. 화면에 놓이는 순서이기도 하다. */
export const ITEMS = ['undo', 'withdraw', 'flip', 'shuffle'];

export function createWallet() {
  return { gold: 0, items: startingItems(), freeAt: 0 };
}

/** 저장에서 읽은 지갑을 성한 모양으로 맞춘다. 망가진 값 때문에 게임이 멈추면 안 된다. */
export function normalizeWallet(raw) {
  const w = createWallet();
  if (!raw || typeof raw !== 'object') return w;
  w.gold = Math.max(0, Math.floor(Number(raw.gold) || 0));
  w.freeAt = Math.max(0, Number(raw.freeAt) || 0);
  for (const name of ITEMS) {
    const n = Math.floor(Number(raw.items && raw.items[name]));
    w.items[name] = Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return w;
}

/** 판 하나의 점수가 골드로 얼마인지. */
export function scoreToGold(score) {
  return Math.max(0, Math.floor(score / ECONOMY.goldPerScore));
}

export function addGold(wallet, n) {
  wallet.gold = Math.max(0, wallet.gold + Math.floor(n));
  return wallet.gold;
}

export function price(name) {
  return ECONOMY.price[name] || 0;
}

export function canBuy(wallet, name) {
  return ITEMS.includes(name) && wallet.gold >= price(name);
}

export function buyItem(wallet, name) {
  if (!canBuy(wallet, name)) return false;
  wallet.gold -= price(name);
  wallet.items[name]++;
  return true;
}

/** 아이템 세트를 그대로 얹는다. @returns 실제로 준 것만 남긴 세트 */
export function grantSet(wallet, set) {
  const given = {};
  for (const name of ITEMS) {
    const n = set[name] | 0;
    if (n <= 0) continue;
    wallet.items[name] += n;
    given[name] = n;
  }
  return given;
}

/** 판을 깼을 때의 보상 — 점수를 바꾼 골드와 아이템 세트. */
export function grantClear(wallet, level, score) {
  const gold = scoreToGold(score);
  addGold(wallet, gold);
  return { gold, set: grantSet(wallet, clearReward(level)) };
}

// ── 무료 아이템 ───────────────────────────────────────────────────────────

/**
 * 다음 무료 아이템까지 남은 밀리초. 0 이면 지금 받을 수 있다.
 *
 * 시계는 받은 시각부터 잰다 — 안 받고 쌓아 두는 것을 막으려는 게 아니라,
 * 한참 만에 들어와도 한 개만 주려는 것이다. 기기 시계가 뒤로 돌아가면
 * (시간대 변경 등) 그냥 지금 받을 수 있게 한다.
 */
export function freeIn(wallet, now = Date.now()) {
  if (!wallet.freeAt) return 0;
  const left = wallet.freeAt - now;
  if (left <= 0) return 0;
  return Math.min(left, ECONOMY.free.everyMs);
}

export function freeReady(wallet, now = Date.now()) {
  return freeIn(wallet, now) === 0;
}

/** 무료 아이템 한 개를 받는다. @returns 받은 아이템 이름, 아직이면 null */
export function claimFree(wallet, now = Date.now()) {
  if (!freeReady(wallet, now)) return null;
  const name = rollFree();
  wallet.items[name]++;
  wallet.freeAt = now + ECONOMY.free.everyMs;
  return name;
}

/** 값이 쌀수록 자주 나온다. 섞기가 무료로 쏟아지면 살 이유가 없어진다. */
function rollFree() {
  let total = 0;
  for (const name of ITEMS) total += ECONOMY.free.weight[name] || 0;
  let r = rnd() * total;
  for (const name of ITEMS) {
    r -= ECONOMY.free.weight[name] || 0;
    if (r <= 0) return name;
  }
  return ITEMS[0];
}
