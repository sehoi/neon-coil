// 카메라: 플레이어 추적 + 화면 흔들림 + 히트스톱.

import { W, H, SETTINGS } from '../config.js';
import { damp } from '../core/vec.js';

export const camera = {
  x: 0, y: 0,
  shakeAmt: 0,
  shakeX: 0, shakeY: 0,
  hitstop: 0,
};

const DEADZONE = 40;

export function resetCamera(x, y) {
  camera.x = x; camera.y = y;
  camera.shakeAmt = 0;
  camera.shakeX = camera.shakeY = 0;
  camera.hitstop = 0;
}

export function updateCamera(target, dt) {
  // 데드존 밖으로 나갔을 때만 따라간다 (미세 이동에 화면이 흔들리지 않게)
  const dx = target.x - camera.x;
  const dy = target.y - camera.y;
  if (Math.abs(dx) > DEADZONE) camera.x = damp(camera.x, target.x - Math.sign(dx) * DEADZONE, 6, dt);
  if (Math.abs(dy) > DEADZONE) camera.y = damp(camera.y, target.y - Math.sign(dy) * DEADZONE, 6, dt);

  camera.shakeAmt = Math.max(0, camera.shakeAmt - dt * camera.shakeAmt * 6 - dt * 2);
  const a = camera.shakeAmt * SETTINGS.shake;
  camera.shakeX = (Math.random() * 2 - 1) * a;
  camera.shakeY = (Math.random() * 2 - 1) * a;
}

export function addShake(amount) {
  camera.shakeAmt = Math.min(24, camera.shakeAmt + amount);
}

export function addHitstop(seconds) {
  camera.hitstop = Math.max(camera.hitstop, seconds);
}

/** 월드 → 스크린 오프셋 */
export function camOffsetX() { return W / 2 - camera.x + camera.shakeX; }
export function camOffsetY() { return H / 2 - camera.y + camera.shakeY; }
