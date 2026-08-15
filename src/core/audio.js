// WebAudio 절차 생성 사운드. 오디오 파일 0개.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

const lastPlayed = new Map();   // 동일 SFX 중복 호출 억제
const MIN_GAP = 0.008;

// 후반에는 히트/처치가 초당 수백 번 일어난다. WebAudio 노드 생성이 메인 스레드를
// 잡아먹는 데다 소리도 뭉개지므로, 자주 나는 효과음은 간격을 넉넉히 둔다.
const GAP = { hit: 0.045, kill: 0.05, shoot: 0.05, pickup: 0.035, pulse: 0.06 };

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.35;
  master.connect(ctx.destination);

  // 노이즈 버퍼는 부팅 시 1회만 만들어 재사용
  const len = ctx.sampleRate * 0.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = muted ? 0 : 0.35;
}

export function isMuted() { return muted; }

function tone({ type = 'square', f0, f1, dur, vol = 0.2, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur, vol = 0.2, hp = 0, lp = 20000, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  let node = src;
  if (hp > 0) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    node.connect(f); node = f;
  }
  if (lp < 20000) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    node.connect(f); node = f;
  }
  node.connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const SFX = {
  shoot:   () => tone({ type: 'square', f0: 800, f1: 400, dur: 0.06, vol: 0.06 }),
  pulse:   () => tone({ type: 'sine',   f0: 220, f1: 90,  dur: 0.18, vol: 0.12 }),
  hit:     () => noise({ dur: 0.04, vol: 0.07, hp: 2000 }),
  kill:    () => { noise({ dur: 0.10, vol: 0.09, hp: 600 }); tone({ type: 'sine', f0: 320, f1: 80, dur: 0.12, vol: 0.07 }); },
  hurt:    () => tone({ type: 'sawtooth', f0: 200, f1: 70, dur: 0.25, vol: 0.22 }),
  pickup:  () => tone({ type: 'sine', f0: 900, f1: 1300, dur: 0.05, vol: 0.04 }),
  levelup: () => { tone({ type: 'sine', f0: 523, dur: 0.12, vol: 0.14 });
                   tone({ type: 'sine', f0: 659, dur: 0.12, vol: 0.14, delay: 0.10 });
                   tone({ type: 'sine', f0: 784, dur: 0.22, vol: 0.16, delay: 0.20 }); },
  select:  () => tone({ type: 'square', f0: 660, f1: 990, dur: 0.07, vol: 0.10 }),
  dash:    () => noise({ dur: 0.12, vol: 0.06, hp: 900, lp: 5000 }),
  elite:   () => { tone({ type: 'sawtooth', f0: 80, f1: 40, dur: 1.2, vol: 0.18 });
                   noise({ dur: 1.0, vol: 0.10, lp: 800 }); },
  heal:    () => { tone({ type: 'sine', f0: 440, dur: 0.10, vol: 0.12 });
                   tone({ type: 'sine', f0: 880, dur: 0.18, vol: 0.10, delay: 0.08 }); },
  emp:     () => { noise({ dur: 0.5, vol: 0.25, lp: 3000 });
                   tone({ type: 'sine', f0: 600, f1: 60, dur: 0.5, vol: 0.18 }); },
  die:     () => { tone({ type: 'sawtooth', f0: 300, f1: 30, dur: 1.4, vol: 0.25 });
                   noise({ dur: 1.0, vol: 0.12, lp: 600 }); },
};

export function sfx(name) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  const last = lastPlayed.get(name) || -1;
  if (now - last < (GAP[name] || MIN_GAP)) return;   // 클리핑 + 노드 폭증 방지
  lastPlayed.set(name, now);
  const fn = SFX[name];
  if (fn) fn();
}

// ── BGM: 4음 베이스 아르페지오 루프 ────────────────────────────────
const SCALE = [55, 65.41, 82.41, 98];   // A1 C2 E2 G2
let musicTimer = 0;
let musicStep = 0;
let musicOn = false;
let musicRate = 0.5;   // 스텝 간격(초)

export function startMusic() { musicOn = true; musicStep = 0; musicTimer = 0; }
export function stopMusic()  { musicOn = false; }
export function setMusicIntensity(t) {
  // 후반부로 갈수록 템포가 빨라진다
  musicRate = 0.5 - Math.min(t, 1) * 0.22;
}

export function updateMusic(dt) {
  if (!musicOn || !ctx || muted) return;
  musicTimer -= dt;
  if (musicTimer > 0) return;
  musicTimer += musicRate;

  const f = SCALE[musicStep % SCALE.length];
  tone({ type: 'triangle', f0: f, dur: musicRate * 0.9, vol: 0.09 });
  if (musicStep % 4 === 0) noise({ dur: 0.05, vol: 0.05, hp: 4000 });   // 하이햇
  if (musicStep % 8 === 0) tone({ type: 'sine', f0: f * 4, dur: 0.25, vol: 0.04 });
  musicStep++;
}
