// 루프와 상태 머신. 입력을 받아 session 을 두드리고, 그 결과를 그린다.

import { W, H, LAYOUT, SETTINGS, IS_TOUCH, fitCanvas } from './config.js';
import { seed } from './core/rng.js';
import { initAudio, sfx } from './core/audio.js';
import { loadSave, getSave, submitRun, previewRank, persist } from './core/save.js';
import { attachInput, input, consumeRect, takeTap, key, endFrame, pointInRect } from './core/input.js';
import { ANIM } from './data/tuning.js';
import { SYMBOLS } from './data/symbols.js';
import { createSession, update as updateSession, pickTile, useUndo, useWithdraw, useShuffle, revive } from './game/session.js';
import { hitTile } from './render/geom.js';
import { boardView, drawBackground, drawBoard, drawTrayTiles, drawComboFloat, trayBurstPoint } from './render/renderer.js';
import { burst, updateParticles, clearParticles } from './render/particles.js';
import { drawHud, drawTray, drawPowers } from './ui/hud.js';
import { titleScreen, pauseScreen, clearScreen, overScreen } from './ui/screens.js';
import { BTN, POWERS } from './ui/rects.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const save = loadSave();

const game = {
  state: 'title',                 // title | play | pause | clear | over
  session: null,
  view: null,
  floats: [],
  rank: 0,
  t: 0,
  auto: null,                     // 디버그 자동 풀이
  screenRects: {},
};

seed((Date.now() ^ 0x9e3779b9) >>> 0);
game.session = createSession(1);

attachInput(canvas);

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
    case 'play':   stepPlay(dt); break;
    case 'pause':  stepPause(); break;
    case 'clear':  stepClear(); break;
    case 'over':   stepOver(); break;
  }

  // 일시정지에서만 연출을 멈춘다. 클리어/게임오버 화면 뒤에서는 마저 터지게 둔다
  updateSession(game.session, game.state === 'pause' ? 0 : dt);
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
  if (consumeRect(game.screenRects.start) || key('Space') || key('Enter')) {
    initAudio();
    sfx('ui');
    startRun(1);
  }
}

function stepPlay(dt) {
  if (key('Escape') || key('KeyP')) { game.state = 'pause'; sfx('ui'); return; }
  if (key('KeyZ')) doPower('undo');
  if (key('KeyX')) doPower('withdraw');
  if (key('KeyC')) doPower('shuffle');

  if (consumeRect(BTN.pause)) { game.state = 'pause'; sfx('ui'); return; }
  if (consumeRect(BTN.mute)) { toggleMute(); return; }

  const powers = powerRectsCache();
  for (const name of POWERS) {
    if (consumeRect(powers[name])) doPower(name);
  }

  if (game.auto) tickAuto(dt);

  const tap = takeTap();
  if (tap && tap.y < LAYOUT.tray.y - 20) {
    const tile = hitTile(game.session.board, game.view, tap.x, tap.y);
    if (tile) pickTile(game.session, tile);
  }
}

function stepPause() {
  const r = game.screenRects;
  if (consumeRect(r.resume) || key('Escape') || key('KeyP')) { game.state = 'play'; sfx('ui'); }
  else if (consumeRect(r.restart)) { sfx('ui'); startRun(game.session.level); }
  else if (consumeRect(r.quit)) { sfx('ui'); endRun(); game.state = 'title'; }
}

function stepClear() {
  if (consumeRect(game.screenRects.next) || key('Space') || key('Enter')) {
    sfx('ui');
    const s = game.session;
    game.session = createSession(s.level + 1, s.total, s.runTime + s.time);
    clearParticles();
    game.state = 'play';
  }
}

function stepOver() {
  const r = game.screenRects;
  if (r.revive && consumeRect(r.revive)) {
    if (revive(game.session)) { game.state = 'play'; return; }
  }
  if (consumeRect(r.again)) { sfx('ui'); endRun(); startRun(game.session.level); }
  else if (consumeRect(r.quit)) { sfx('ui'); endRun(); game.state = 'title'; }
}

// ── 진행 ──────────────────────────────────────────────────────────────────

function startRun(level) {
  game.session = createSession(level);
  game.auto = null;
  game.rank = 0;
  clearParticles();
  game.floats.length = 0;
  game.state = 'play';
}

/** 런이 실제로 끝났을 때만 기록에 남긴다 (이어하기를 고르면 남기지 않는다). */
function endRun() {
  const s = game.session;
  if (s.total > 0 && !s.recorded) {
    s.recorded = true;
    submitRun(s.level, s.total, s.runTime + s.time);
  }
}

function doPower(name) {
  const s = game.session;
  const ok = name === 'undo' ? useUndo(s)
    : name === 'withdraw' ? useWithdraw(s)
    : useShuffle(s);
  if (!ok) sfx('blocked');
}

function drainEvents() {
  const s = game.session;
  for (const e of s.events) {
    switch (e.type) {
      case 'pick':
        sfx('pick', s.tray.length);
        break;
      case 'blocked':
        sfx('blocked');
        break;
      case 'match': {
        sfx('match', s.combo);
        const color = SYMBOLS[e.tiles[0].kind].color;
        const fresh = s.popping.slice(-3);          // 방금 터진 세 장만
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
        break;
      case 'win':
        sfx('win');
        game.state = 'clear';
        break;
      case 'lose':
        sfx('lose');
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

function draw() {
  const dpr = fitCanvas(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const s = game.session;
  game.view = boardView(s.board);

  drawBackground(ctx, game.t);

  const hover = (!IS_TOUCH && game.state === 'play' && input.pointer.inside)
    ? hitTile(s.board, game.view, input.pointer.x, input.pointer.y)
    : null;

  drawBoard(ctx, s, game.view, hover);

  // 타이틀에서는 판만 배경처럼 두고 나머지 UI 는 걷어낸다
  if (game.state !== 'title') {
    drawTray(ctx, s);
    drawTrayTiles(ctx, s, game.view);
    drawComboFloat(ctx, game.floats);
    drawHud(ctx, s, save.best);
    const hoverPower = !IS_TOUCH ? hoveredPower() : null;
    cachedPowers = drawPowers(ctx, s, hoverPower);
  }

  switch (game.state) {
    case 'title': game.screenRects = titleScreen(ctx, save, game.t); break;
    case 'pause': game.screenRects = pauseScreen(ctx, s); break;
    case 'clear': game.screenRects = clearScreen(ctx, s); break;
    case 'over':  game.screenRects = overScreen(ctx, s, save, game.rank); break;
    default:      game.screenRects = {};
  }
}

let cachedPowers = null;
function powerRectsCache() {
  return cachedPowers || {};
}

function hoveredPower() {
  if (!cachedPowers) return null;
  for (const name of POWERS) {
    if (pointInRect(input.pointer.x, input.pointer.y, cachedPowers[name])) return name;
  }
  return null;
}

// ── 디버그 훅 ─────────────────────────────────────────────────────────────

function tickAuto(dt) {
  const a = game.auto;
  a.timer -= dt;
  if (a.timer > 0) return;
  a.timer = a.every;
  const s = game.session;
  const byId = a.byId;
  while (a.i < a.ids.length) {
    const tile = byId.get(a.ids[a.i++]);
    if (tile && tile.state === 'board') { pickTile(s, tile); return; }
  }
  game.auto = null;
}

window.TR = {
  get game() { return game; },
  get session() { return game.session; },
  start(level = 1) { initAudio(); startRun(level); },
  /** 지금 집을 수 있는 타일들. */
  free() { return game.session.board.tiles.filter(t => t.state === 'board' && t.blockedBy === 0); },
  pick(tile) { return pickTile(game.session, tile); },
  /** 생성 시점의 정답 순서대로 자동으로 푼다. 판을 건드린 뒤에는 맞지 않는다. */
  solve(every = 0.12) {
    const s = game.session;
    game.auto = { ids: s.board.solution.slice(), i: 0, timer: 0, every, byId: new Map(s.board.tiles.map(t => [t.id, t])) };
    game.state = 'play';
  },
  save: getSave,
};
