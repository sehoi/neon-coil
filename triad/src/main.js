// 루프와 상태 머신. 입력을 받아 session 을 두드리고, 그 결과를 그린다.

import { W, H, LAYOUT, SETTINGS, IS_TOUCH, fitCanvas } from './config.js';
import { seed } from './core/rng.js';
import { initAudio, sfx } from './core/audio.js';
import { loadSave, getSave, submitRun, previewRank, persist } from './core/save.js';
import { attachInput, input, consumeRect, takeTap, key, endFrame, pointInRect } from './core/input.js';
import { SYMBOLS } from './data/symbols.js';
import {
  createSession, update as updateSession, pickTile,
  useUndo, useWithdraw, useShuffle, useFlip, revive,
} from './game/session.js';
import { pickRay, remaining, visibleFront, visibleTiles as visibleAny } from './game/pile.js';
import { createCamera, frameBox, screenRay, projectPoint } from './render/camera.js';
import { drawPile, drawTable } from './render/pile3d.js';
import { drawBackground, drawTrayTiles, drawComboFloat, trayBurstPoint } from './render/renderer.js';
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
  cam: createCamera(LAYOUT.board),
  floats: [],
  rank: 0,
  t: 0,
  screenRects: {},
  hot: null,                      // 마우스가 올라간 타일
};

seed((Date.now() ^ 0x9e3779b9) >>> 0);
newSession(1);

attachInput(canvas);

function newSession(level, total = 0, runTime = 0) {
  game.session = createSession(level, total, runTime);
  // 더미가 3~3.7 단위까지 솟으므로 그 높이를 담아 잡는다 (안 그러면 꼭대기가 잘린다)
  frameBox(game.cam, game.session.pile.halfX, game.session.pile.halfZ, 2.8, 1.12);
  game.hot = null;
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
  }

  // 일시정지에서만 더미를 멈춘다. 클리어·게임오버 화면 뒤에서는 마저 무너지게 둔다.
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
    newSession(s.level + 1, s.total, s.runTime + s.time);
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
  newSession(level);
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
    : name === 'flip' ? useFlip(s)
    : useShuffle(s);
  if (!ok) sfx('blocked');
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

let cachedPowers = null;

function draw() {
  const dpr = fitCanvas(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const s = game.session;
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
  drawPile(ctx, game.cam, s.pile.tiles, game.hot);
  ctx.restore();

  if (game.state !== 'title') {
    drawTray(ctx, s);
    drawTrayTiles(ctx, s, game.cam);
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
  /** 지금 화면에서 무늬가 보이는 타일들 — 집을 수 있는 것 전부. */
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
