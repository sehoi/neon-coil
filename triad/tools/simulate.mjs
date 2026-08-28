// 게임플레이 검증 — 브라우저 없이 봇이 실제로 판을 푼다.
//   node triad/tools/simulate.mjs [최대레벨] [판수]
//
// 게임 로직도 물리도 카메라도 DOM 을 모르므로 node 에서 그대로 돌아간다.
// "보이는 타일"은 진짜로 카메라에서 광선을 쏘아 정한다 — 브라우저와 같은 판정이다.

import { seed } from '../src/core/rng.js';
import { LAYOUT } from '../src/config.js';
import { levelSpec, startingItems, clearReward, boxHeight, TRAY_CAP } from '../src/data/tuning.js';
import {
  createSession, update, pickTile,
  useFlip, useWithdraw, useShuffle,
} from '../src/game/session.js';
import { visibleFront, visibleTiles, remaining } from '../src/game/pile.js';
import { scoreToGold } from '../src/game/wallet.js';
import { createCamera, frameBox, screenRay, projectPoint } from '../src/render/camera.js';

const LEVELS = Number(process.argv[2]) || 12;
const RUNS = Number(process.argv[3]) || 6;
const DT = 1 / 60;

function makeCam(pile) {
  const cam = createCamera(LAYOUT.board);
  frameBox(cam, pile.halfX, pile.halfZ, boxHeight(pile.spec), Math.PI / 2);   // main.js 와 같은 시점
  return cam;
}

/**
 * 이 레벨에 들어설 때 손에 있을 아이템 — 아무것도 안 사고 클리어 보상만 받은 경우다.
 * 골드로 더 살 수 있으니 이게 바닥값이고, 봇은 그 바닥에서 둔다.
 */
function stockFor(level) {
  const items = startingItems();
  for (let L = 1; L < level; L++) {
    const set = clearReward(L);
    for (const k of Object.keys(items)) items[k] += set[k] | 0;
  }
  return items;
}

function settle(session, seconds) {
  for (let i = 0; i < seconds * 60; i++) {
    update(session, DT);
    if (!session.pouring && !session.pile.align && session.pile.world.asleep) return true;
  }
  return false;
}

function visible(session, cam) {
  return visibleFront(
    session.pile,
    { projectPoint: (p) => projectPoint(cam, p, {}) },
    (x, y) => screenRay(cam, x, y),
  );
}

/** 무늬를 몰라도 누를 수는 있는 타일 전부. */
function clickable(session, cam) {
  return visibleTiles(
    session.pile,
    { projectPoint: (p) => projectPoint(cam, p, {}) },
    (x, y) => screenRay(cam, x, y),
  );
}

/** 사람처럼 두는 봇: 짝을 맞출 수 있으면 맞추고, 아니면 여럿 보이는 무늬를 모은다. */
function play(level, s) {
  seed(s);
  const session = createSession(level, 0, 0, stockFor(level));
  const cam = makeCam(session.pile);
  settle(session, 12);

  let guard = 600;
  while (session.state === 'play' && guard-- > 0) {
    const vis = visible(session, cam);

    const tray = new Map();
    for (const t of session.tray) tray.set(t.kind, (tray.get(t.kind) || 0) + 1);
    const seen = new Map();
    for (const t of vis) {
      if (!seen.has(t.kind)) seen.set(t.kind, []);
      seen.get(t.kind).push(t);
    }

    // 사람이라면 판이 안 읽히거나 몰릴 때 도구를 쓴다. 봇도 같은 순서로 쓴다.
    const canComplete = [...seen].some(([kind, g]) => (tray.get(kind) || 0) + g.length >= 3);
    if (vis.length < 8 || (session.tray.length >= TRAY_CAP - 2 && !canComplete)) {
      if (useFlip(session)) { settle(session, 2); continue; }
      if (useWithdraw(session)) { settle(session, 2); continue; }
      if (useShuffle(session)) { settle(session, 3); continue; }
    }

    let best = null, bestScore = -1e9;
    for (const [kind, group] of seen) {
      const inTray = tray.get(kind) || 0;
      let sc;
      if (inTray + group.length >= 3 && inTray > 0) sc = 200 + inTray * 20;   // 짝을 완성한다
      else if (group.length >= 3) sc = 120;                                   // 셋이 다 보인다
      else sc = group.length * 8 + inTray * 6 - (session.tray.length >= TRAY_CAP - 2 ? 60 : 0);
      if (sc > bestScore) { bestScore = sc; best = group[0]; }
    }

    // 무늬 아는 것 중에 쓸 만한 게 없으면 눈 감고 집는다 (엎어진 것도 집을 수 있다)
    if (!best) {
      const blind = clickable(session, cam);
      if (!blind.length) break;
      best = blind[0];
    }

    pickTile(session, best);
    settle(session, 1.2);            // 무너지는 것을 기다린다
  }
  return session;
}

console.log('레벨  타일  세트  무늬 |  클리어  평균 집기  눈감고 집기  쓴 아이템   점수   골드  손 못 댐');
let ok = true;
for (let lv = 1; lv <= LEVELS; lv++) {
  const spec = levelSpec(lv);
  let wins = 0, picks = 0, blocked = 0, stuck = 0, used = 0, score = 0;
  for (let r = 0; r < RUNS; r++) {
    const s = play(lv, lv * 7919 + r * 104729);
    if (s.state === 'won') { wins++; score += s.total; }
    if (s.state === 'play') stuck++;          // 봇이 손을 못 댄 판
    picks += s.stats.picks;
    blocked += s.stats.blind;
    used += s.stats.powers + s.stats.undos;
  }
  const avgScore = wins ? Math.round(score / wins) : 0;   // 깬 판의 평균 점수
  if (stuck) ok = false;
  console.log(
    String(lv).padStart(3) + String(spec.tiles).padStart(6) + String(spec.sets).padStart(6) +
    String(spec.kinds).padStart(6) +
    ' | ' + String((wins / RUNS * 100).toFixed(0) + '%').padStart(7) +
    String((picks / RUNS).toFixed(0)).padStart(10) +
    String((blocked / RUNS).toFixed(1)).padStart(12) +
    String((used / RUNS).toFixed(1)).padStart(10) +
    String(avgScore).padStart(7) + String(scoreToGold(avgScore)).padStart(7) +
    String(stuck).padStart(9));
}
console.log(ok ? '\n막힌 판 없음 — 봇이 모든 판을 끝까지 뒀다.' : '\n주의: 봇이 손을 못 댄 판이 있다.');
