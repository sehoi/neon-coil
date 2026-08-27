// 한 판의 진행 — 트레이, 매치, 점수, 도구. 그리기를 모른다.
// 판 자체(더미)는 pile.js 가, 물리는 physics.js 가 맡는다.

import { levelSpec, powerCharges, TRAY_CAP, SCORE, ANIM } from '../data/tuning.js';
import { axis } from '../core/v3.js';
import {
  createPile, pourTick, stepPile, liftTile, dropBack, retoss, flipDown, remaining,
  serializePile, restorePile,
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
    stats: { picks: 0, matches: 0, undos: 0, powers: 0, blind: 0 },
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
  }
  for (let i = session.popping.length - 1; i >= 0; i--) {
    const p = session.popping[i];
    p.t += dt;
    if (p.t >= ANIM.pop) session.popping.splice(i, 1);
  }
}

/**
 * 더미에서 한 장 집는다.
 *
 * **누를 수 있으면 무조건 집힌다.** 엎어졌든 모로 섰든 상관없다 —
 * 다만 엎어진 것은 무늬를 모르고 집는 셈이라 트레이에 와서야 무엇인지 보인다.
 * 그게 이 게임의 도박이다.
 */
export function pickTile(session, tile) {
  if (session.state !== 'play' || !tile || tile.state !== 'pile') return false;

  const faceUp = axis(tile.body.R, 2).y > 0.3;
  const at = liftTile(session.pile, tile);
  tile.pickedAt = at;
  tile.anim = { t: 0, dur: ANIM.fly };
  insertIntoTray(session, tile);
  session.history.push(tile);
  session.stats.picks++;
  session.picksSinceMatch++;
  if (!faceUp) session.stats.blind++;
  session.events.push({ type: 'pick', tile, blind: !faceUp });

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

// ── 저장과 복원 ───────────────────────────────────────────────────────────

/**
 * 진행 중인 판을 통째로 적어 둔다.
 * 되돌리기 기록(history)은 트레이 순서로 대신한다 — 어차피 마지막에 집은 것부터
 * 되돌리는 것이고, 트레이 순서가 그 근사치다.
 */
export function serializeSession(session) {
  return {
    level: session.level,
    total: session.total,
    score: session.score,
    combo: session.combo,
    picksSinceMatch: session.picksSinceMatch,
    time: Math.round(session.time * 10) / 10,
    runTime: Math.round(session.runTime * 10) / 10,
    charges: { ...session.charges },
    stats: { ...session.stats },
    asleep: session.pile.world.asleep,
    tray: session.tray.map(t => t.id),
    tiles: serializePile(session.pile),
  };
}

/** 적어 둔 판을 되살린다. 실패하면 null — 저장이 깨졌다고 게임이 멈추면 안 된다. */
export function restoreSession(data) {
  try {
    if (!data || !Array.isArray(data.tiles) || !data.tiles.length) return null;

    const spec = levelSpec(data.level);
    if (data.tiles.length !== spec.tiles) return null;   // 밸런싱이 바뀌면 이어받지 않는다

    const session = createSession(data.level, data.total, data.runTime);
    session.pile.tiles.length = 0;
    restorePile(session.pile, data.tiles, !!data.asleep);
    session.pouring = false;

    const byId = new Map(session.pile.tiles.map(t => [t.id, t]));
    session.tray = data.tray.map(id => byId.get(id)).filter(Boolean);
    session.history = session.tray.slice();

    session.score = data.score || 0;
    session.combo = data.combo || 0;
    session.picksSinceMatch = data.picksSinceMatch || 0;
    session.time = data.time || 0;
    session.charges = { ...session.charges, ...(data.charges || {}) };
    session.stats = { ...session.stats, ...(data.stats || {}) };
    return session;
  } catch {
    return null;
  }
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

/** 트레이가 꽉 차 진 판을, 빼내기를 써서 이어간다. */
export function revive(session) {
  if (session.state !== 'lost' || session.charges.withdraw <= 0) return false;
  if (!useWithdraw(session, true)) return false;
  session.state = 'play';
  session.events.push({ type: 'revive' });
  return true;
}
