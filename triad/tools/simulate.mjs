// 판 생성기 검증 — 브라우저 없이 순수 로직만 돌린다.
//   node triad/tools/simulate.mjs [레벨수] [판수]
//
// 1) 정답 순서대로 집으면 반드시 클리어되는가 (생성기의 보장)
// 2) 사람처럼 두는 그리디 전략의 클리어율 — 난이도 곡선을 눈으로 보려고

import { seed } from '../src/core/rng.js';
import { levelSpec, TRAY_CAP } from '../src/data/tuning.js';
import { createSession, pickTile, useShuffle } from '../src/game/session.js';
import { isFree } from '../src/game/board.js';

const LEVELS = Number(process.argv[2]) || 20;
const RUNS = Number(process.argv[3]) || 40;

function playSolution(level, s) {
  seed(s);
  const ses = createSession(level);
  const byId = new Map(ses.board.tiles.map(t => [t.id, t]));
  for (const id of ses.board.solution) {
    if (ses.state !== 'play') break;
    pickTile(ses, byId.get(id));
  }
  return ses;
}

function playGreedy(level, s) {
  seed(s);
  const ses = createSession(level);
  let guard = 4000;
  while (ses.state === 'play' && guard-- > 0) {
    const free = ses.board.tiles.filter(isFree);
    if (!free.length) break;

    const trayCount = new Map();
    for (const t of ses.tray) trayCount.set(t.kind, (trayCount.get(t.kind) || 0) + 1);
    const freeCount = new Map();
    for (const t of free) freeCount.set(t.kind, (freeCount.get(t.kind) || 0) + 1);

    // 1) 트레이의 짝을 완성할 수 있으면 그것부터  2) 자유 타일 중 같은 무늬가 많은 것
    let best = null, bestScore = -1e9;
    for (const t of free) {
      const inTray = trayCount.get(t.kind) || 0;
      const inFree = freeCount.get(t.kind) || 0;
      let sc = 0;
      if (inTray + inFree >= 3 && inTray > 0) sc = 100 + inTray * 10;
      else if (inFree >= 3) sc = 50;
      else sc = inTray * 5 + inFree - (ses.tray.length >= TRAY_CAP - 2 ? 40 : 0);
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    pickTile(ses, best);
  }
  return ses;
}

let allSolved = true;
console.log('레벨  타일  층  무늬 | 정답순서 | 그리디 클리어율  평균 시도');
for (let lv = 1; lv <= LEVELS; lv++) {
  const spec = levelSpec(lv);
  let solved = 0, greedyWins = 0, picks = 0;
  for (let r = 0; r < RUNS; r++) {
    const s = lv * 7919 + r * 104729;
    const a = playSolution(lv, s);
    if (a.state === 'won') solved++;
    const b = playGreedy(lv, s);
    if (b.state === 'won') greedyWins++;
    picks += b.stats.picks;
  }
  if (solved !== RUNS) allSolved = false;
  const tiles = 0;
  console.log(
    String(lv).padStart(3) + String(spec.tiles).padStart(6) +
    String(spec.layers).padStart(4) + String(spec.kinds).padStart(5) +
    ' | ' + String(solved + '/' + RUNS).padStart(8) +
    ' | ' + String((greedyWins / RUNS * 100).toFixed(0) + '%').padStart(6) +
    String((picks / RUNS).toFixed(0)).padStart(11));
}
// ── 섞기 검증 ────────────────────────────────────────────────────────────
// 트레이에 낱장이 남은 상태에서 섞어도 여전히 풀려야 한다.
let shuffleOk = 0, shuffleRuns = 0;
for (let lv = 3; lv <= 12; lv++) {
  for (let r = 0; r < 20; r++) {
    seed(lv * 31337 + r * 7717);
    const ses = createSession(lv);
    const byId = new Map(ses.board.tiles.map(t => [t.id, t]));

    // 아무렇게나 몇 장 집어 트레이를 어지럽힌다
    let picks = 6 + Math.floor(Math.random() * 6);
    while (picks-- > 0 && ses.state === 'play') {
      const free = ses.board.tiles.filter(isFree);
      if (!free.length) break;
      pickTile(ses, free[Math.floor(Math.random() * free.length)]);
    }
    if (ses.state !== 'play' || ses.tray.length === 0) continue;

    shuffleRuns++;
    ses.charges.shuffle = 1;
    useShuffle(ses);
    for (const id of ses.board.solution) {
      if (ses.state !== 'play') break;
      pickTile(ses, byId.get(id));
    }
    if (ses.state === 'won') shuffleOk++;
  }
}
const shuffleFine = shuffleOk === shuffleRuns;
console.log(`\n섞기 후 재검증: ${shuffleOk}/${shuffleRuns}`);
console.log(allSolved ? '정답 순서 검증 통과 — 모든 판이 풀린다.' : '실패: 풀리지 않는 판이 있다.');
process.exit(allSolved && shuffleFine ? 0 : 1);
