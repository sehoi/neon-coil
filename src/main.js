// 엔트리: 캔버스 셋업, 고정 타임스텝 루프, 상태 머신.
// 골격은 NEON PURGE 에서 이식 — 이미 검증된 부분은 다시 만들지 않는다.

import * as cfg from './config.js';
import { STEP, MAX_FRAME, SETTINGS, IS_TOUCH, MAX_DPR, C, setViewport } from './config.js';
import { initInput, pollInput, endFrameInput, input, keyPressed, clearTouchState } from './core/input.js';
import { initAudio, resumeAudio, setMuted, sfx, startMusic, stopMusic, updateMusic, setMusicIntensity } from './core/audio.js';
import { loadSave, persist, submitRecord } from './core/save.js';
import { seed } from './core/rng.js';

import { createWorld, startRun, updateWorld } from './game/world.js';
import { camera } from './game/camera.js';
import { renderWorld } from './render/renderer.js';
import { renderHud } from './ui/hud.js';
import { renderTitle, renderHelp, renderPause, renderResult, renderBoard } from './ui/screens.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

function fitCanvas() {
  // 화면 비율에 맞춰 논리 폭을 조정한다 (높이는 720 고정).
  setViewport(window.innerWidth, window.innerHeight);
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  canvas.width = cfg.W * dpr;
  canvas.height = cfg.H * dpr;
  canvas.style.aspectRatio = `${cfg.W} / ${cfg.H}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}
fitCanvas();
addEventListener('resize', fitCanvas);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));

function isPortrait() {
  return IS_TOUCH && window.innerHeight > window.innerWidth;
}

function renderRotateNotice() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cfg.W, cfg.H);
  ctx.save();
  ctx.translate(cfg.W / 2, cfg.H / 2);
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 4;
  ctx.strokeRect(-90, -55, 180, 110);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 130, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();
  ctx.font = '26px ui-monospace, monospace';
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.fillText('기기를 가로로 돌려주세요', cfg.W / 2, cfg.H / 2 + 190);
}

const save = loadSave();
setMuted(SETTINGS.muted);
seed(Date.now() & 0x7fffffff);

const world = createWorld();

const S = {
  TITLE: 'title', HELP: 'help', BOARD: 'board',
  PLAYING: 'playing', PAUSED: 'paused', RESULT: 'result',
};
let state = S.TITLE;
let recordRank = 0;
let boardFrom = S.TITLE;

initInput(canvas, () => {
  if (state === S.PLAYING) state = S.PAUSED;
});

function wakeAudio() { initAudio(); resumeAudio(); }
addEventListener('pointerdown', wakeAudio, { once: true });
addEventListener('keydown', wakeAudio, { once: true });

function beginRun() {
  startRun(world);
  state = S.PLAYING;
  startMusic();
  wakeAudio();
  requestFullscreenIfMobile();
}

function requestFullscreenIfMobile() {
  if (!IS_TOUCH || document.fullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const r = req.call(el, { navigationUI: 'hide' });
    if (r && r.catch) r.catch(() => {});
  } catch { /* 미지원 — 무시 */ }
  if (screen.orientation && screen.orientation.lock) {
    const p = screen.orientation.lock('landscape');
    if (p && p.catch) p.catch(() => {});
  }
}

function endRun() {
  const b = save.best;
  if (world.bestLen > b.len) b.len = Math.floor(world.bestLen);
  if (world.playerRank < b.rank) b.rank = world.playerRank;
  if (world.player.kills > b.kills) b.kills = world.player.kills;
  if (world.t > b.time) b.time = Math.floor(world.t);

  recordRank = submitRecord(world.bestLen, world.playerRank, world.player.kills, world.t);
  persist();
  stopMusic();
  state = S.RESULT;
}

// ── 업데이트 ────────────────────────────────────────────────
function update(dt) {
  if (keyPressed('KeyM')) { SETTINGS.muted = !SETTINGS.muted; setMuted(SETTINGS.muted); persist(); }
  if (keyPressed('KeyG')) { SETTINGS.glow = !SETTINGS.glow; persist(); }

  switch (state) {
    case S.PLAYING: {
      if (keyPressed('Escape') || keyPressed('KeyP') || input.pauseTapped) {
        state = S.PAUSED;
        clearTouchState();
        return;
      }
      // 조종 입력 → 플레이어 목표 각도
      const p = world.player;
      if (p.alive) {
        if (input.hasAim) p.targetAngle = Math.atan2(input.aimY, input.aimX);
        p.boosting = input.boost;
      }
      updateWorld(world, dt);
      setMusicIntensity(Math.min(1, p.len / 300));
      updateMusic(dt);
      if (world.over) { endRun(); return; }
      break;
    }

    case S.PAUSED:
      if (keyPressed('Escape') || keyPressed('KeyP')) state = S.PLAYING;
      break;

    case S.RESULT:
      if (keyPressed('KeyR')) beginRun();
      break;
  }
}

// ── FPS ────────────────────────────────────────────────────
const fps = { avgMs: 16.7, worstMs: 0, worstResetAt: 0 };

function trackFps(dtMs, nowMs) {
  fps.avgMs += (dtMs - fps.avgMs) * 0.08;
  if (dtMs > fps.worstMs) fps.worstMs = dtMs;
  if (nowMs - fps.worstResetAt > 3000) { fps.worstMs = dtMs; fps.worstResetAt = nowMs; }
}

function renderFps() {
  const f = 1000 / Math.max(0.1, fps.avgMs);
  const worst = Math.round(1000 / Math.max(0.1, fps.worstMs));
  const color = f >= 55 ? C.lime : f >= 40 ? C.gold : C.red;
  ctx.save();
  ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(4,6,16,0.6)';
  ctx.fillRect(cfg.W - 116, 8, 108, 20);
  ctx.fillStyle = color;
  ctx.fillText(`${Math.round(f)} fps (${worst})`, cfg.W - 14, 11);
  ctx.restore();
}

// ── 렌더 ────────────────────────────────────────────────────
function render() {
  if (isPortrait()) { renderRotateNotice(); return; }

  switch (state) {
    case S.TITLE: {
      renderWorld(ctx, world);
      const r = renderTitle(ctx, save);
      if (r.start) { sfx('select'); beginRun(); }
      if (r.help) { sfx('select'); state = S.HELP; }
      if (r.board) { sfx('select'); boardFrom = S.TITLE; state = S.BOARD; }
      if (r.fullscreen) {
        sfx('select');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
      break;
    }

    case S.HELP: {
      renderWorld(ctx, world);
      const r = renderHelp(ctx);
      if (r.back) { sfx('select'); state = S.TITLE; }
      break;
    }

    case S.BOARD: {
      renderWorld(ctx, world);
      const r = renderBoard(ctx, save, boardFrom === S.RESULT ? recordRank : 0);
      if (r.back) { sfx('select'); state = boardFrom; }
      break;
    }

    case S.PLAYING:
      renderWorld(ctx, world);
      renderHud(ctx, world);
      break;

    case S.PAUSED: {
      renderWorld(ctx, world);
      renderHud(ctx, world);
      const r = renderPause(ctx, world);
      if (r.resume) { sfx('select'); state = S.PLAYING; }
      if (r.quit) { sfx('select'); endRun(); }
      if (r.glow) { SETTINGS.glow = !SETTINGS.glow; persist(); }
      if (r.mute) { SETTINGS.muted = !SETTINGS.muted; setMuted(SETTINGS.muted); persist(); }
      if (r.fps) { SETTINGS.showFps = !SETTINGS.showFps; persist(); }
      break;
    }

    case S.RESULT: {
      renderWorld(ctx, world);
      const r = renderResult(ctx, world, save, recordRank);
      if (r.retry) { sfx('select'); beginRun(); }
      if (r.board) { sfx('select'); boardFrom = S.RESULT; state = S.BOARD; }
      if (r.title) { sfx('select'); state = S.TITLE; }
      break;
    }
  }

  if (SETTINGS.showFps) renderFps();
}

// ── 루프 ────────────────────────────────────────────────────
let acc = 0;
let prev = performance.now();

function frame(now) {
  const rawMs = now - prev;
  let dt = Math.min(rawMs / 1000, MAX_FRAME);
  prev = now;
  trackFps(rawMs, now);

  if (isPortrait()) {
    if (state === S.PLAYING) { state = S.PAUSED; clearTouchState(); }
    render();
    endFrameInput();
    requestAnimationFrame(frame);
    return;
  }

  input.gameplay = state === S.PLAYING;
  pollInput(cfg.W / 2, cfg.H / 2);   // 화면 중앙 = 플레이어 머리 기준점

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    update(STEP);
    acc -= STEP;
    steps++;
  }

  render();
  endFrameInput();
  requestAnimationFrame(frame);
}

// 타이틀 배경에 아레나를 띄워 둔다
startRun(world);
requestAnimationFrame(frame);

// 디버그 훅 — 콘솔에서 밸런싱과 성능을 확인할 때 쓴다
window.NC = {
  world, save, input, settings: SETTINGS, cfg,
  get state() { return state; },
  get viewport() { return { W: cfg.W, H: cfg.H, touchUI: { ...cfg.TOUCH_UI } }; },
  setState(s) { state = s; },
  start: beginRun,
  step(seconds) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) update(STEP);
    return { t: world.t, len: world.player.len, rank: world.playerRank };
  },
  draw() { render(); },
  poll: () => pollInput(cfg.W / 2, cfg.H / 2),
  endFrame: endFrameInput,
  godMode() { world.player.godMode = true; },
  /**
   * 모든 코일을 목표 길이까지 실제로 키운다 (궤적이 쌓여야 진짜 부하가 된다).
   * keepGod 를 켜지 않으면 끝나고 무적을 반드시 되돌린다 —
   * 안 그러면 이후 규칙 검증이 통째로 오염된다.
   */
  grow(seconds = 30, keepGod = false) {
    for (const c of world.coils) c.godMode = true;
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      world.player.targetAngle = world.t * 0.7;
      // targetLen 이 실제 길이다. len 은 easeLength 가 여기로 수렴시킨다.
      for (const c of world.coils) if (c.alive) {
        c.targetLen = Math.min(420, c.targetLen + 0.9);
      }
      update(STEP);
    }
    if (!keepGod) for (const c of world.coils) c.godMode = false;
    let seg = 0;
    for (const c of world.coils) if (c.alive) seg += Math.min(c.count, Math.floor(c.len));
    return seg;
  },
};
