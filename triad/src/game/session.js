// 한 판의 진행 — 트레이, 매치, 점수, 도구. 그리기·소리·DOM 을 전혀 모른다.
// (그래서 node 에서 그대로 돌려 검증할 수 있다: tools/simulate.mjs)

import { levelSpec, powerCharges, TRAY_CAP, SCORE, ANIM } from '../data/tuning.js';
import {
  createBoard, isFree, liftTile, dropTile, burnTile, scatterOnTop, reshuffle,
} from './board.js';

export function createSession(level, totalScore = 0, runTime = 0) {
  const spec = levelSpec(level);
  return {
    spec,
    level,
    board: createBoard(spec),
    tray: [],                 // 같은 무늬끼리 모여 있는 순서 배열
    total: totalScore,        // 이번 런의 누적 점수
    score: 0,                 // 이 레벨에서 번 점수
    combo: 0,
    picksSinceMatch: 0,
    time: 0,                  // 이 레벨에서 흐른 시간
    runTime,                  // 이번 런에서 앞선 레벨들에 쓴 시간
    charges: powerCharges(level),
    history: [],              // 되돌리기 스택
    popping: [],              // 터지는 중인 타일 (연출용)
    state: 'play',            // play | won | lost
    events: [],               // main 이 매 프레임 비운다
    stats: { picks: 0, matches: 0, undos: 0, powers: 0 },
  };
}

export function update(session, dt) {
  if (session.state === 'play') session.time += dt;

  for (const t of session.board.tiles) {
    if (t.anim) {
      t.anim.t += dt;
      if (t.anim.t >= t.anim.dur) t.anim = null;
    }
    if (t.shake) {
      t.shake -= dt;
      if (t.shake <= 0) t.shake = 0;
    }
  }
  for (let i = session.popping.length - 1; i >= 0; i--) {
    const p = session.popping[i];
    p.t += dt;
    if (p.t >= ANIM.pop) session.popping.splice(i, 1);
  }
}

/** 판의 타일 한 장을 집어 트레이로 보낸다. */
export function pickTile(session, tile) {
  if (session.state !== 'play' || !tile || tile.state !== 'board') return false;

  if (!isFree(tile)) {
    tile.shake = ANIM.shake;
    session.events.push({ type: 'blocked', tile });
    return false;
  }

  liftTile(session.board, tile);
  tile.anim = { t: 0, dur: ANIM.fly, from: { cx: tile.cx, cy: tile.cy, layer: tile.layer } };
  insertIntoTray(session, tile);
  session.history.push(tile);
  session.stats.picks++;
  session.picksSinceMatch++;
  session.events.push({ type: 'pick', tile });

  resolve(session);
  return true;
}

/** 트레이는 같은 무늬가 반드시 붙어 있어야 한다. 눈으로 세지 않아도 되게. */
function insertIntoTray(session, tile) {
  let at = session.tray.length;
  for (let i = session.tray.length - 1; i >= 0; i--) {
    if (session.tray[i].kind === tile.kind) { at = i + 1; break; }
  }
  session.tray.splice(at, 0, tile);
}

function resolve(session) {
  const matched = takeTriple(session);

  if (matched) {
    // 세 장을 빨리 이어 맞추면 콤보가 붙는다. 뜸 들이면 처음부터.
    session.combo = session.picksSinceMatch <= 5 ? Math.min(session.combo + 1, SCORE.comboMax) : 1;
    session.picksSinceMatch = 0;
    session.stats.matches++;

    const gain = SCORE.match + (session.combo - 1) * SCORE.comboStep;
    session.score += gain;
    session.total += gain;
    session.events.push({ type: 'match', tiles: matched, gain, combo: session.combo });
  }

  if (session.board.remaining === 0 && session.tray.length === 0) {
    win(session);
    return;
  }
  if (session.tray.length >= TRAY_CAP) {
    session.state = 'lost';
    session.events.push({ type: 'lose' });
  }
}

function takeTriple(session) {
  const counts = new Map();
  for (const t of session.tray) counts.set(t.kind, (counts.get(t.kind) || 0) + 1);
  for (const [kind, n] of counts) {
    if (n < 3) continue;
    const taken = [];
    for (let i = session.tray.length - 1; i >= 0; i--) {
      if (session.tray[i].kind === kind) {
        taken.unshift(session.tray[i]);
        session.tray.splice(i, 1);
      }
    }
    for (const t of taken) {
      burnTile(t);
      session.popping.push({ tile: t, t: 0, slot: taken.indexOf(t) });
    }
    return taken;
  }
  return null;
}

function win(session) {
  session.state = 'won';
  const speed = Math.max(0, 1 - session.time / session.spec.parTime);
  const bonus = SCORE.clear + Math.round(speed * SCORE.speedBonus);
  session.score += bonus;
  session.total += bonus;
  session.clearBonus = bonus;
  session.events.push({ type: 'win', bonus });
}

// ── 도구 ──────────────────────────────────────────────────────────────────

/** 되돌리기 — 마지막에 집은 한 장을 원래 자리로 돌려놓는다. */
export function useUndo(session) {
  if (session.state !== 'play' || session.charges.undo <= 0) return false;

  let tile = null;
  while (session.history.length) {
    const t = session.history.pop();
    if (t.state === 'tray') { tile = t; break; }   // 이미 터진 장은 건너뛴다
  }
  if (!tile) return false;

  session.tray.splice(session.tray.indexOf(tile), 1);
  dropTile(session.board, tile);
  tile.anim = null;
  session.charges.undo--;
  session.combo = 0;
  session.stats.undos++;
  session.events.push({ type: 'power', name: 'undo', tile });
  return true;
}

/**
 * 빼내기 — 트레이에서 세 장을 판 위로 되돌린다.
 * 아무거나 빼면 짝이 깨지므로, 같은 무늬가 가장 적게 모인 것부터 내보낸다.
 */
export function useWithdraw(session, force = false) {
  if (!force && session.state !== 'play') return false;
  if (session.charges.withdraw <= 0 || session.tray.length === 0) return false;

  const counts = new Map();
  for (const t of session.tray) counts.set(t.kind, (counts.get(t.kind) || 0) + 1);
  const order = session.tray
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (counts.get(a.t.kind) - counts.get(b.t.kind)) || (b.i - a.i));

  const out = order.slice(0, 3).map(e => e.t);
  for (const t of out) session.tray.splice(session.tray.indexOf(t), 1);
  scatterOnTop(session.board, out);
  for (const t of out) t.anim = null;

  session.charges.withdraw--;
  session.combo = 0;
  session.stats.powers++;
  session.events.push({ type: 'power', name: 'withdraw', tiles: out });
  return true;
}

/** 섞기 — 남은 판의 무늬만 다시 푼다. 위치와 층은 그대로다. */
export function useShuffle(session) {
  if (session.state !== 'play' || session.charges.shuffle <= 0) return false;
  if (session.board.remaining === 0) return false;

  const counts = new Map();
  for (const t of session.tray) counts.set(t.kind, (counts.get(t.kind) || 0) + 1);
  const groups = [...counts].map(([kind, count]) => ({ kind, count }));

  reshuffle(session.board, groups);
  session.charges.shuffle--;
  session.stats.powers++;
  session.events.push({ type: 'power', name: 'shuffle' });
  return true;
}

/** 트레이가 꽉 차 진 판을, 빼내기를 써서 이어간다. */
export function revive(session) {
  if (session.state !== 'lost' || session.charges.withdraw <= 0) return false;
  if (!useWithdraw(session, true)) return false;
  session.state = 'play';
  session.events.push({ type: 'revive' });
  return true;
}
