// 루프와 상태 머신. 입력을 받아 session 을 두드리고, 그 결과를 그린다.

import { W, H, LAYOUT, SETTINGS, IS_TOUCH, fitCanvas } from './config.js';
import { seed } from './core/rng.js';
import { initAudio, sfx } from './core/audio.js';
import { loadSave, getSave, submitRun, previewRank, persist, saveRun, loadRun, clearRun } from './core/save.js';
import { ITEMS, grantClear, buyItem, claimFree } from './game/wallet.js';
import { attachInput, input, consumeRect, takeTap, key, endFrame, pointInRect } from './core/input.js';
import { SYMBOLS } from './data/symbols.js';
import { boxHeight } from './data/tuning.js';
import {
  createSession, update as updateSession, pickTile, serializeSession, restoreSession,
  useUndo, useWithdraw, useShuffle, useFlip, revive,
} from './game/session.js';
import { pickRay, remaining, visibleFront, visibleTiles as visibleAny, finishAlign, pileFault } from './game/pile.js';
import { createCamera, frameBox, screenRay, projectPoint } from './render/camera.js';
import { drawPileCached, drawTable } from './render/pile3d.js';
import { drawBackground, drawTrayTiles, drawComboFloat, trayBurstPoint } from './render/renderer.js';
import { burst, updateParticles, clearParticles } from './render/particles.js';
import { drawHud, drawTray, drawPowers } from './ui/hud.js';
import { titleScreen, pauseScreen, clearScreen, overScreen } from './ui/screens.js';
import { shopScreen, ITEM_NAME } from './ui/shop.js';
import { BTN, POWERS } from './ui/rects.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const save = loadSave();

const game = {
  state: 'title',                 // title | play | pause | clear | over | shop
  session: null,
  cam: createCamera(LAYOUT.board),
  floats: [],
  rank: 0,
  t: 0,
  screenRects: {},
  hot: null,
  saveT: 0,
  wasPouring: true,
  shopFrom: 'title',                     // 상점을 닫으면 돌아갈 화면
  shopNote: null,                        // 방금 사거나 받은 것 한 줄
  shopNoteT: 0,
  restartArmedAt: 0,                     // "이 레벨 다시" 첫 탭 시각 (0 이면 아직 안 눌렀다)
};

const RESTART_CONFIRM_WINDOW = 3; // 이 안에 한 번 더 눌러야 실제로 다시 쏟는다

seed((Date.now() ^ 0x9e3779b9) >>> 0);
newSession(1);

attachInput(canvas);

// 탭을 닫거나 홈으로 나갈 때. pagehide 는 모바일에서 unload 보다 확실하게 온다.
for (const ev of ['pagehide', 'visibilitychange']) {
  window.addEventListener(ev, () => {
    if (document.visibilityState === 'hidden' && game.state === 'play') saveProgress(true);
  });
}

function newSession(level, total = 0, runTime = 0) {
  // 아이템은 지갑을 그대로 넘긴다 — 세션이 쓰면 지갑에서 바로 빠진다.
  useSession(createSession(level, total, runTime, save.wallet.items));
}

function useSession(session) {
  game.session = session;
  // 상자는 판마다 크기가 다르다 — 장수가 적으면 상자도 작고, 카메라가 거기에
  // 맞춰 붙으므로 화면은 늘 꽉 찬다. 높이는 그 판이 실제로 쌓이는 만큼만 잡는다.
  // 바로 위에서 내려다본다 (π/2). 비스듬히 보면 앞줄 타일이 뒷줄을 가린다.
  frameBox(game.cam, session.pile.halfX, session.pile.halfZ, boxHeight(session.spec), Math.PI / 2);
  game.hot = null;
  game.wasPouring = session.pouring;
}

// ── 진행 저장 ─────────────────────────────────────────────────────────────

/**
 * 판을 통째로 적어 둔다. 쏟는 중에는 저장하지 않는다 —
 * 그 순간의 반쪽짜리 더미를 되살리는 것보다 직전 저장이 낫다.
 */
function saveProgress(force = false) {
  const s = game.session;
  if (s.state !== 'play' || s.pouring) return;
  // 정렬해 옮기는 중이면 그 순간 자세는 아직 가는 길 위에 있다.
  // 급할 때(탭을 닫거나 타이틀로 나갈 때)는 끝까지 옮겨 놓고 적는다.
  if (s.pile.align) { if (!force) return; finishAlign(s.pile); }
  // 무너지는 중에 적으면 되살릴 때 속도를 버리므로 타일이 조금 어긋난다.
  // 급할 때(탭을 닫을 때)가 아니면 더미가 멈춘 다음에 적는다.
  if (!force && !s.pile.world.asleep) return;
  const snap = serializeSession(s);
  if (snap) saveRun(snap);
}

/** 저장된 판으로 이어간다. 판 상태가 없으면(레벨 시작 표식) 그 레벨을 새로 연다. */
function resumeRun(run) {
  const restored = restoreSession(run, save.wallet.items);
  if (restored) useSession(restored);
  else newSession(run.level || 1, run.total || 0, run.runTime || 0);
  game.rank = 0;
  clearParticles();
  game.floats.length = 0;
  game.state = 'play';
}

// ── 루프 ──────────────────────────────────────────────────────────────────

let last = performance.now();
requestAnimationFrame(frame);

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.t += dt;

  step(dt);
  draw();
  endFrame();
  requestAnimationFrame(frame);
}

function step(dt) {
  globalKeys();

  switch (game.state) {
    case 'title':  stepTitle(); break;
    case 'play':   stepPlay(); break;
    case 'pause':  stepPause(); break;
    case 'clear':  stepClear(); break;
    case 'over':   stepOver(); break;
    case 'shop':   stepShop(); break;
  }

  if (game.shopNote) {
    game.shopNoteT += dt;
    if (game.shopNoteT > 2.4) game.shopNote = null;
  }

  // 일시정지에서만 더미를 멈춘다. 클리어·게임오버 화면 뒤에서는 마저 무너지게 둔다.
  updateSession(game.session, (game.state === 'pause' || game.state === 'shop') ? 0 : dt);

  // 쏟기가 끝난 순간과, 그 뒤로 더미가 조용할 때 이따금 적어 둔다
  if (game.state === 'play') {
    if (game.wasPouring && !game.session.pouring) {
      game.wasPouring = false;
      if (!checkBoard()) saveProgress();
    }
    game.saveT += dt;
    if (game.saveT > 6 && game.session.pile.world.asleep) { game.saveT = 0; saveProgress(); }
  }
  updateParticles(dt);
  for (let i = game.floats.length - 1; i >= 0; i--) {
    game.floats[i].t += dt;
    if (game.floats[i].t >= game.floats[i].dur) game.floats.splice(i, 1);
  }
  drainEvents();
}

function globalKeys() {
  if (key('KeyM')) toggleMute();
  if (key('KeyG')) { SETTINGS.glow = !SETTINGS.glow; persist(); }
  if (input.pressedKeys.size || input.taps.some(t => !t.used)) initAudio();
}

function stepTitle() {
  const run = loadRun();
  if (run && (consumeRect(game.screenRects.resume) || key('Enter'))) {
    initAudio();
    sfx('ui');
    resumeRun(run);
    return;
  }
  if (consumeRect(game.screenRects.start) || key('Space')) {
    initAudio();
    sfx('ui');
    clearRun();
    startRun(1);
    return;
  }
  if (consumeRect(game.screenRects.shop)) { initAudio(); openShop('title'); }
}

// ── 상점 ──────────────────────────────────────────────────────────────────

function openShop(from) {
  sfx('ui');
  game.shopFrom = from;
  game.shopNote = null;
  game.state = 'shop';
}

function stepShop() {
  const r = game.screenRects;
  if (consumeRect(r.close) || key('Escape')) {
    sfx('ui');
    game.state = game.shopFrom;
    return;
  }
  if (consumeRect(r.free)) {
    const got = claimFree(save.wallet);
    if (got) {
      persist();
      sfx('win');
      note(`${ITEM_NAME[got]}를 받았다`);
    } else sfx('blocked');
    return;
  }
  for (const name of ITEMS) {
    if (!consumeRect(r.buy && r.buy[name])) continue;
    if (buyItem(save.wallet, name, game.session.spec.tiles)) {
      persist();
      sfx('power');
      note(`${ITEM_NAME[name]}를 샀다`);
    } else sfx('blocked');
    return;
  }
}

function note(msg) {
  game.shopNote = msg;
  game.shopNoteT = 0;
}

function stepPlay() {
  if (key('Escape') || key('KeyP')) { game.state = 'pause'; sfx('ui'); return; }
  if (key('KeyZ')) doPower('undo');
  if (key('KeyX')) doPower('withdraw');
  if (key('KeyV')) doPower('flip');
  if (key('KeyC')) doPower('shuffle');

  if (consumeRect(BTN.pause)) { game.state = 'pause'; sfx('ui'); return; }
  if (consumeRect(BTN.mute)) { toggleMute(); return; }

  const powers = cachedPowers || {};
  for (const name of POWERS) {
    if (consumeRect(powers[name])) doPower(name);
  }

  const tap = takeTap();
  if (tap && pointInRect(tap.x, tap.y, LAYOUT.board)) {
    const hit = pickRay(game.session.pile, screenRay(game.cam, tap.x, tap.y));
    if (hit) pickTile(game.session, hit.tile);   // 누를 수 있으면 무조건 집힌다
  }
}

function restartArmed() {
  return game.restartArmedAt > 0 && game.t - game.restartArmedAt < RESTART_CONFIRM_WINDOW;
}

function stepPause() {
  const r = game.screenRects;
  if (consumeRect(r.resume) || key('Escape') || key('KeyP')) {
    game.state = 'play'; game.restartArmedAt = 0; sfx('ui');
  } else if (consumeRect(r.shop)) { openShop('pause'); game.restartArmedAt = 0; }
  else if (consumeRect(r.restart)) {
    // 잘못 눌러 진행 중인 판을 통째로 버리는 일을 막는다 — 첫 탭은 확인만 하고,
    // 정해진 시간(3초) 안에 다시 눌러야 실제로 다시 쏟는다.
    if (restartArmed()) { sfx('ui'); game.restartArmedAt = 0; startRun(game.session.level); }
    else { sfx('ui'); game.restartArmedAt = game.t; }
  } else if (consumeRect(r.quit)) { sfx('ui'); game.restartArmedAt = 0; parkRun(); }
  else if (consumeRect(r.glow)) { SETTINGS.glow = !SETTINGS.glow; persist(); sfx('ui'); }
}

/**
 * 일시정지에서 타이틀로 — **판은 그대로 둔다.**
 *
 * 예전에는 여기서도 endRun 을 불러 기록에 올리고 저장을 지웠다. 그런데 이 버튼은
 * 진 것도 그만두는 것도 아니다. 잠깐 나갔다 오는 길이라, 타이틀의 `이어하기` 로
 * 돌아올 수 있어야 한다. 기록은 판이 진짜로 끝날 때(게임오버) 올린다.
 */
function parkRun() {
  saveProgress(true);
  game.state = 'title';
}

function stepClear() {
  if (consumeRect(game.screenRects.shop)) { openShop('clear'); return; }
  if (consumeRect(game.screenRects.next) || key('Space') || key('Enter')) {
    sfx('ui');
    const s = game.session;
    newSession(s.level + 1, s.total, s.runTime + s.time);
    clearParticles();
    game.state = 'play';
  }
}

function stepOver() {
  const r = game.screenRects;
  if (r.revive && consumeRect(r.revive)) {
    if (revive(game.session)) { persist(); game.state = 'play'; return; }
  }
  if (consumeRect(r.shop)) { openShop('over'); return; }
  if (consumeRect(r.again)) { sfx('ui'); endRun(); startRun(game.session.level); }
  else if (consumeRect(r.quit)) { sfx('ui'); endRun(); game.state = 'title'; }
}

// ── 진행 ──────────────────────────────────────────────────────────────────

function startRun(level) {
  newSession(level);
  game.rank = 0;
  clearParticles();
  game.floats.length = 0;
  game.state = 'play';
}

/** 런이 실제로 끝났을 때만 기록에 남긴다 (이어하기를 고르면 남기지 않는다). */
/**
 * 다 쏟은 판이 손댈 수 있는 모양인지 본다. 아니면 그 자리에서 다시 쏟는다.
 *
 * 한 번도 재현하지 못한 모양이 사용자에게서 나왔다 — 타일이 한 줄로 몰려 탑처럼
 * 쌓여 아무것도 집을 수 없는 판이다. 원인을 못 찾은 채로 두면 그 사람은 게임이
 * 죽었다고 느낀다. 원인과 별개로, **그런 판은 다시 쏟는다.**
 * 무엇이 이상했는지는 저장에 적어 둔다 (일시정지 화면에서 볼 수 있다).
 *
 * @returns {boolean} 다시 쏟았으면 true
 */
function checkBoard() {
  const s = game.session;
  const why = pileFault(s.pile, boxHeight(s.spec));
  if (!why) return false;
  save.diag = { why, level: s.level, at: Date.now() };
  persist();
  newSession(s.level, s.total, s.runTime + s.time);
  return true;
}

function endRun() {
  const s = game.session;
  if (s.total > 0 && !s.recorded) {
    s.recorded = true;
    submitRun(s.level, s.total, s.runTime + s.time);
  }
  clearRun();
}

function doPower(name) {
  const s = game.session;
  const ok = name === 'undo' ? useUndo(s)
    : name === 'withdraw' ? useWithdraw(s)
    : name === 'flip' ? useFlip(s)
    : useShuffle(s);
  if (!ok) { sfx('blocked'); return; }
  // 섞기는 판을 처음부터 다시 쏟는다. 다 쏟은 순간에 다시 적어야 한다.
  if (name === 'shuffle') game.wasPouring = true;
}

function drainEvents() {
  const s = game.session;
  for (const e of s.events) {
    switch (e.type) {
      case 'pick':
        sfx(e.blind ? 'warn' : 'pick', s.tray.length);
        break;
      case 'match': {
        sfx('match', s.combo);
        saveProgress();
        const color = SYMBOLS[e.tiles[0].kind].color;
        const fresh = s.popping.slice(-3);
        for (const p of fresh) {
          const at = trayBurstPoint(p.slot);
          burst(at.x, at.y, color, 12);
        }
        const mid = trayBurstPoint(fresh.length ? fresh[Math.floor(fresh.length / 2)].slot : 3);
        game.floats.push({
          text: e.combo > 1 ? `+${e.gain}  ${e.combo}연속` : `+${e.gain}`,
          x: mid.x, y: mid.y - 76, color: e.combo > 1 ? '#ffd166' : '#46f0d0', t: 0, dur: 0.9,
        });
        break;
      }
      case 'power':
        sfx(e.name === 'undo' ? 'undo' : 'power');
        persist();                 // 아이템이 지갑에서 빠졌다
        break;
      case 'win':
        sfx('win');
        // 이 판의 점수가 골드가 되고, 클리어 세트가 얹힌다
        s.reward = grantClear(save.wallet, s.level, s.score);
        // 다음 레벨의 시작점만 남긴다. 다 비운 판을 되살릴 수는 없다.
        saveRun({ level: s.level + 1, total: s.total, runTime: s.runTime + s.time });
        game.state = 'clear';
        break;
      case 'lose':
        sfx('lose');
        clearRun();          // 진 판을 다시 불러오면 공짜 부활이 된다

        game.rank = s.total > 0 ? previewRank(s.total) : 0;
        game.state = 'over';
        break;
      case 'revive':
        sfx('power');
        break;
    }
  }
  s.events.length = 0;
}

function toggleMute() {
  SETTINGS.muted = !SETTINGS.muted;
  persist();
  if (!SETTINGS.muted) sfx('ui');
}

// ── 그리기 ────────────────────────────────────────────────────────────────

let cachedPowers = null;

function draw() {
  const s = game.session;
  const dpr = fitCanvas(canvas, !s.pile.world.asleep);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawBackground(ctx);

  // 판 영역 밖으로 타일이 새지 않게 잘라낸다
  ctx.save();
  ctx.beginPath();
  ctx.rect(LAYOUT.board.x, LAYOUT.board.y, LAYOUT.board.w, LAYOUT.board.h);
  ctx.clip();
  drawTable(ctx, game.cam, s.pile.halfX, s.pile.halfZ);

  game.hot = null;
  if (!IS_TOUCH && game.state === 'play' && input.pointer.inside &&
      pointInRect(input.pointer.x, input.pointer.y, LAYOUT.board)) {
    const hit = pickRay(s.pile, screenRay(game.cam, input.pointer.x, input.pointer.y));
    if (hit) game.hot = hit.tile;
  }
  drawPileCached(ctx, game.cam, s.pile, game.hot, LAYOUT.board, dpr);
  ctx.restore();

  if (game.state !== 'title' && game.state !== 'shop') {
    drawTray(ctx, s);
    drawTrayTiles(ctx, s, game.cam);
    drawComboFloat(ctx, game.floats);
    drawHud(ctx, s, save);
    const hoverPower = !IS_TOUCH ? hoveredPower() : null;
    cachedPowers = drawPowers(ctx, s, hoverPower);
  }

  switch (game.state) {
    case 'title': game.screenRects = titleScreen(ctx, save, game.t, loadRun()); break;
    case 'pause': game.screenRects = pauseScreen(ctx, s, save.diag, restartArmed()); break;
    case 'clear': game.screenRects = clearScreen(ctx, s); break;
    case 'over':  game.screenRects = overScreen(ctx, s, save, game.rank); break;
    case 'shop':  game.screenRects = shopScreen(ctx, save.wallet, game.t, game.shopNote, game.session.spec.tiles); break;
    default:      game.screenRects = {};
  }
}

function camAdapter() {
  return { projectPoint: (p) => projectPoint(game.cam, p, {}) };
}

function hoveredPower() {
  if (!cachedPowers) return null;
  for (const name of POWERS) {
    if (pointInRect(input.pointer.x, input.pointer.y, cachedPowers[name])) return name;
  }
  return null;
}

// ── 디버그 훅 ─────────────────────────────────────────────────────────────

window.TR = {
  get game() { return game; },
  get session() { return game.session; },
  get pile() { return game.session.pile; },
  start(level = 1) { initAudio(); startRun(level); },
  /** 무늬가 보이는 타일 (무엇인지 알고 집을 수 있는 것). */
  visible() { return visibleFront(game.session.pile, camAdapter(), (x, y) => screenRay(game.cam, x, y)); },
  /** 눌러서 집을 수 있는 타일 전부 (엎어진 것 포함). */
  clickable() { return visibleAny(game.session.pile, camAdapter(), (x, y) => screenRay(game.cam, x, y)); },
  pick(tile) { return pickTile(game.session, tile); },
  /** 보이는 타일 중 세 장 짝이 되는 것을 골라 자동으로 집는다. */
  auto(n = 3) {
    const vis = this.visible();
    const byKind = new Map();
    for (const t of vis) {
      if (!byKind.has(t.kind)) byKind.set(t.kind, []);
      byKind.get(t.kind).push(t);
    }
    let done = 0;
    for (const [, group] of byKind) {
      if (group.length < 3 || done >= n) continue;
      for (const t of group.slice(0, 3)) pickTile(game.session, t, true);
      done++;
    }
    return done;
  },
  remaining() { return remaining(game.session.pile); },
  project(p) { return projectPoint(game.cam, p, {}); },
  rayAt(x, y) { return pickRay(game.session.pile, screenRay(game.cam, x, y)); },
  save: getSave,
};
