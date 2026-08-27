// 한 판의 진행 — 트레이, 매치, 점수, 도구. 그리기를 모른다.
// 판 자체(더미)는 pile.js 가, 물리는 physics.js 가 맡는다.

import { levelSpec, powerCharges, TRAY_CAP, SCORE, ANIM } from '../data/tuning.js';
import {
  createPile, pourTick, stepPile, liftTile, dropBack, retoss, flipDown, remaining,
} from './pile.js';

export function createSession(level, totalScore = 0, runTime = 0) {
  const spec = levelSpec(level);
  return {
    spec,
    level,
    pile: createPile(spec),
    pouring: true,
    tray: [],
    total: totalScore,
    score: 0,
    combo: 0,
    picksSinceMatch: 0,
    time: 0,
    runTime,
    charges: powerCharges(level),
    history: [],
    popping: [],
    state: 'play',
    events: [],
    stats: { picks: 0, matches: 0, undos: 0, powers: 0, blocked: 0 },
  };
}

export function update(session, dt) {
  if (session.pouring) {
    session.pouring = !pourTick(session.pile);
  }
  stepPile(session.pile, dt);

  if (session.state === 'play' && !session.pouring) session.time += dt;

  for (const t of session.pile.tiles) {
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

/**
 * 더미에서 한 장 집는다.
 * @param faceUp 광선이 앞면(무늬)을 맞혔는가. 엎어진 면·옆면은 집을 수 없다.
 */
export function pickTile(session, tile, faceUp) {
  if (session.state !== 'play' || !tile || tile.state !== 'pile') return false;

  if (!faceUp) {
    tile.shake = ANIM.shake;
    session.stats.blocked++;
    session.events.push({ type: 'blocked', tile });
    return false;
  }

  const at = liftTile(session.pile, tile);
  tile.pickedAt = at;
  tile.anim = { t: 0, dur: ANIM.fly };
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
    session.combo = session.picksSinceMatch <= 5 ? Math.min(session.combo + 1, SCORE.comboMax) : 1;
    session.picksSinceMatch = 0;
    session.stats.matches++;

    const gain = SCORE.match + (session.combo - 1) * SCORE.comboStep;
    session.score += gain;
    session.total += gain;
    session.events.push({ type: 'match', tiles: matched, gain, combo: session.combo });
  }

  if (remaining(session.pile) === 0) {
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
    // 같은 무늬는 트레이에서 늘 붙어 있다. 자리 번호를 먼저 챙겨야
    // 터지는 연출을 원래 칸에서 띄울 수 있다.
    const at = [];
    for (let i = 0; i < session.tray.length; i++) {
      if (session.tray[i].kind === kind) at.push(i);
    }
    const taken = at.map(i => session.tray[i]);
    for (let i = at.length - 1; i >= 0; i--) session.tray.splice(at[i], 1);
    taken.forEach((t, j) => {
      t.state = 'gone';
      session.popping.push({ tile: t, t: 0, slot: at[j] });
    });
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

/** 되돌리기 — 마지막에 집은 한 장을 더미 위로 되돌린다. */
export function useUndo(session) {
  if (session.state !== 'play' || session.charges.undo <= 0) return false;

  let tile = null;
  while (session.history.length) {
    const t = session.history.pop();
    if (t.state === 'tray') { tile = t; break; }   // 이미 터진 장은 건너뛴다
  }
  if (!tile) return false;

  session.tray.splice(session.tray.indexOf(tile), 1);
  tile.anim = null;
  dropBack(session.pile, [tile]);
  session.charges.undo--;
  session.combo = 0;
  session.stats.undos++;
  session.events.push({ type: 'power', name: 'undo', tiles: [tile] });
  return true;
}

/**
 * 빼내기 — 트레이에서 세 장을 더미 위로 쏟는다.
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
  for (const t of out) {
    session.tray.splice(session.tray.indexOf(t), 1);
    t.anim = null;
  }
  dropBack(session.pile, out);

  session.charges.withdraw--;
  session.combo = 0;
  session.stats.powers++;
  session.events.push({ type: 'power', name: 'withdraw', tiles: out });
  return true;
}

/** 섞기 — 남은 타일을 통째로 다시 쏟는다. 무늬는 그대로, 놓인 모양만 새로. */
export function useShuffle(session) {
  if (session.state !== 'play' || session.charges.shuffle <= 0) return false;
  if (remaining(session.pile) === 0) return false;

  retoss(session.pile);
  session.charges.shuffle--;
  session.combo = 0;
  session.stats.powers++;
  session.events.push({ type: 'power', name: 'shuffle' });
  return true;
}

/** 뒤집기 — 위가 트인 엎어진 타일을 뒤집는다. */
export function useFlip(session) {
  if (session.state !== 'play' || session.charges.flip <= 0) return false;
  const n = flipDown(session.pile);
  if (!n) return false;
  session.charges.flip--;
  session.stats.powers++;
  session.events.push({ type: 'power', name: 'flip', count: n });
  return true;
}

/**
 * 남은 타일이 전부 엎어져 굳어 버렸을 때의 구제.
 * 도구를 쓰지 않는다 — 플레이어 잘못이 아니라 물리가 만든 막다른 길이다.
 */
export function rescueFlip(session) {
  if (session.state !== 'play' || session.pouring) return false;

  const n = flipDown(session.pile, 4);
  if (n) {
    session.events.push({ type: 'rescue', count: n });
    return true;
  }
  // 뒤집을 것조차 없으면(처마 밑에 깔린 채 굳은 경우) 통째로 다시 쏟는다.
  // 어떤 경우에도 판이 굳은 채로 끝나지는 않게 한다.
  if (remaining(session.pile) > session.tray.length) {
    retoss(session.pile);
    session.events.push({ type: 'rescue', count: 0 });
    return true;
  }
  return false;
}

/** 트레이가 꽉 차 진 판을, 빼내기를 써서 이어간다. */
export function revive(session) {
  if (session.state !== 'lost' || session.charges.withdraw <= 0) return false;
  if (!useWithdraw(session, true)) return false;
  session.state = 'play';
  session.events.push({ type: 'revive' });
  return true;
}
