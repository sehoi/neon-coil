// 한 판의 진행 — 트레이, 매치, 점수, 도구. 그리기를 모른다.
// 판 자체(더미)는 pile.js 가, 물리는 physics.js 가 맡는다.

import { levelSpec, startingItems, TRAY_CAP, SCORE, ANIM } from '../data/tuning.js';
import { axis } from '../core/v3.js';
import {
  createPile, pourTick, stepPile, liftTile, dropBack, retoss, alignAll, topOfKind, remaining,
  serializePile, restorePile,
} from './pile.js';

/**
 * @param items 도구 인벤토리. 지갑을 그대로 넘기면 세션이 직접 깎는다 —
 *              아이템은 이제 판마다 채워지는 것이 아니라 들고 다니는 물건이다.
 */
export function createSession(level, totalScore = 0, runTime = 0, items = startingItems()) {
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
    charges: items,
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
  scoreTriple(session, takeTriple(session));

  if (remaining(session.pile) === 0) {
    win(session);
    return;
  }
  if (session.tray.length >= TRAY_CAP) {
    session.state = 'lost';
    session.events.push({ type: 'lose' });
  }
}

/** 맞춰진 세 장에 점수를 매긴다. 없으면 아무 일도 없다. */
function scoreTriple(session, matched) {
  if (!matched) return;
  session.combo = session.picksSinceMatch <= 5 ? Math.min(session.combo + 1, SCORE.comboMax) : 1;
  session.picksSinceMatch = 0;
  session.stats.matches++;

  const gain = SCORE.match + (session.combo - 1) * SCORE.comboStep;
  session.score += gain;
  session.total += gain;
  session.events.push({ type: 'match', tiles: matched, gain, combo: session.combo });
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
    stats: { ...session.stats },
    asleep: session.pile.world.asleep,
    tray: session.tray.map(t => t.id),
    tiles: serializePile(session.pile),
  };
}

/**
 * 적어 둔 판을 되살린다. 실패하면 null — 저장이 깨졌다고 게임이 멈추면 안 된다.
 * 아이템은 판이 아니라 지갑에 있으므로 저장에서 읽지 않고 넘겨받는다.
 */
export function restoreSession(data, items = startingItems()) {
  try {
    if (!data || !Array.isArray(data.tiles) || !data.tiles.length) return null;

    const spec = levelSpec(data.level);
    if (data.tiles.length !== spec.tiles) return null;   // 밸런싱이 바뀌면 이어받지 않는다

    const session = createSession(data.level, data.total, data.runTime, items);
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
    session.stats = { ...session.stats, ...(data.stats || {}) };
    return session;
  } catch {
    return null;
  }
}

// ── 도구 ──────────────────────────────────────────────────────────────────

/**
 * 아이템을 쓸 수 있는 때인가. 쏟는 중에는 안 된다 —
 * 아직 절반만 놓인 판을 정렬하거나 다시 쏟으면 아이템만 버리는 셈이다.
 */
function ready(session) {
  // 쏟는 중이거나 정렬해 옮기는 중에는 도구를 못 쓴다. 그 0.3초 사이에 또 부르면
  // 가는 길 한복판의 자세를 "원래 자리"로 읽어 칸이 엉킨다.
  return session.state === 'play' && !session.pouring && !session.pile.align;
}


/**
 * 되돌리기 — 마지막에 집은 한 장을 판에 **던져 넣는다.**
 * 원래 자리로 곱게 돌려놓으면 무를 것도 없는 무한 취소가 된다.
 * 아무 데나 떨어지므로, 무엇을 무너뜨릴지는 던져 봐야 안다.
 */
export function useUndo(session) {
  if (!ready(session) || session.charges.undo <= 0) return false;

  let tile = null;
  while (session.history.length) {
    const t = session.history.pop();
    if (t.state === 'tray') { tile = t; break; }   // 이미 터진 장은 건너뛴다
  }
  if (!tile) return false;

  session.tray.splice(session.tray.indexOf(tile), 1);
  tile.anim = null;
  dropBack(session.pile, [tile], { toss: true });
  session.charges.undo--;
  session.combo = 0;
  session.stats.undos++;
  session.events.push({ type: 'power', name: 'undo', tiles: [tile] });
  return true;
}

/**
 * 빼내기 — 트레이 **맨 왼쪽** 무늬를 판에서 데려와 한 벌을 완성해 없앤다.
 *
 * 맨 왼쪽은 가장 오래 묵은 무늬다. 트레이가 막히는 것은 늘 그 한 장 때문이므로,
 * 고를 것 없이 그것부터 치운다. 도구로 만든 상황이니 잠깐 칸이 넘쳐도 지지 않는다.
 */
export function useWithdraw(session, force = false) {
  if (!force && !ready(session)) return false;
  if (session.charges.withdraw <= 0 || session.tray.length === 0) return false;

  const kind = session.tray[0].kind;
  const have = session.tray.reduce((n, t) => n + (t.kind === kind ? 1 : 0), 0);
  const fetched = topOfKind(session.pile, kind, 3 - have);
  if (fetched.length < 3 - have) return false;        // 판에 남은 것이 모자란다

  for (const t of fetched) {
    t.pickedAt = liftTile(session.pile, t);
    t.anim = { t: 0, dur: ANIM.fly };
    insertIntoTray(session, t);
    session.history.push(t);
    session.stats.picks++;
  }
  session.charges.withdraw--;
  session.stats.powers++;
  session.events.push({ type: 'power', name: 'withdraw', tiles: fetched });

  // 짝을 맞추되 트레이 만석 판정은 건너뛴다 — 방금 만든 세 장이 바로 사라진다
  scoreTriple(session, takeTriple(session));
  if (remaining(session.pile) === 0) win(session);
  return true;
}

/** 섞기 — 남은 타일을 통째로, 처음 세팅 때와 똑같이 다시 쏟는다. */
export function useShuffle(session) {
  if (!ready(session) || session.charges.shuffle <= 0) return false;
  if (!retoss(session.pile)) return false;

  session.pouring = true;                 // 다시 쏟는 동안은 시계도 멈춘다
  session.charges.shuffle--;
  session.combo = 0;
  session.stats.powers++;
  session.events.push({ type: 'power', name: 'shuffle' });
  return true;
}

/** 뒤집기 — 남은 타일을 격자로 정렬해 무늬가 전부 위를 보게 한다. */
export function useFlip(session) {
  if (!ready(session) || session.charges.flip <= 0) return false;
  const n = alignAll(session.pile);
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
