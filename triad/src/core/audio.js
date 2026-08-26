// 절차 생성 사운드. 오디오 파일이 하나도 없다.
// AudioContext 는 사용자 제스처 전에 만들면 브라우저가 정지 상태로 준다.

import { SETTINGS } from '../config.js';

let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function tone(freq, start, dur, type = 'sine', gain = 0.25, slideTo = 0) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env); env.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function noise(start, dur, gain = 0.12, freq = 1800) {
  const t0 = ctx.currentTime + start;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.8;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(bp); bp.connect(env); env.connect(master);
  src.start(t0);
}

const MAJOR = [523.25, 659.25, 783.99, 1046.5, 1318.5];

export function sfx(name, arg = 0) {
  if (SETTINGS.muted || !ctx) return;
  switch (name) {
    case 'pick':
      tone(520 + Math.min(arg, 6) * 40, 0, 0.09, 'triangle', 0.18);
      break;
    case 'match': {
      const step = Math.min(arg, 4);          // 콤보가 높을수록 위로 쌓인다
      for (let i = 0; i < 3; i++) {
        tone(MAJOR[Math.min(i + step, MAJOR.length - 1)] * (i === 2 ? 1 : 1), i * 0.055, 0.22, 'sine', 0.22);
      }
      noise(0, 0.12, 0.06, 3200);
      break;
    }
    case 'blocked':
      tone(150, 0, 0.13, 'sawtooth', 0.1, 96);
      break;
    case 'power':
      noise(0, 0.22, 0.1, 900);
      tone(320, 0, 0.24, 'triangle', 0.14, 780);
      break;
    case 'undo':
      tone(660, 0, 0.16, 'triangle', 0.16, 380);
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.4, 'sine', 0.22));
      break;
    case 'lose':
      tone(392, 0, 0.35, 'sawtooth', 0.16, 180);
      tone(196, 0.12, 0.5, 'sine', 0.14, 98);
      break;
    case 'ui':
      tone(880, 0, 0.06, 'square', 0.08);
      break;
    case 'warn':
      tone(240, 0, 0.1, 'square', 0.09);
      break;
  }
}
