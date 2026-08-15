// 키보드 + 터치를 하나의 정규화된 입력으로 합친다.

import { W, H, TOUCH_UI } from '../config.js';

const keys = new Set();

export const input = {
  /**
   * 조종 방향. NEON COIL 은 8방향 이동이 아니라 "머리가 향할 방향"을 받는다.
   * 데스크톱은 마우스 포인터 방향, 터치는 조이스틱을 민 방향.
   * 입력이 없으면 null — 그때는 코일이 가던 방향을 유지한다.
   */
  aimX: 0, aimY: 0, hasAim: false,

  boost: false,          // 지속형 (엣지가 아니다)
  pointer: { x: 0, y: 0, down: false, justPressed: false },
  anyKey: false,
  pressed: new Set(),    // 이번 프레임에 새로 눌린 키 코드

  // main 이 매 프레임 갱신한다. 조종 중이 아니면 터치는 전부 UI 입력으로 취급한다.
  gameplay: false,
  pauseTapped: false,    // 모바일 일시정지 버튼

  /**
   * 미처리 탭 큐. { x, y, t, used }
   *
   * "이번 프레임에 눌렸는가"(justPressed) 하나로 클릭을 판정하면, 탭이 렌더 사이에
   * 끼거나 프레임이 길어질 때 조용히 사라진다. 탭을 큐에 쌓아두고 버튼이 직접
   * 소비하게 하면 프레임 타이밍과 무관하게 반드시 한 번 처리된다.
   */
  taps: [],

  lastEvent: '',         // ?debug 진단용
};

const TAP_TTL = 320;     // ms. 이 안에 아무 버튼도 먹지 않으면 버린다

// 이 포인터의 pointerdown 이 이미 탭을 만들었는가.
// down 과 up 이 각각 탭을 넣으면 버튼이 두 번 눌리므로 한 쌍당 하나만 남긴다.
// (좌표로 중복을 걸러내면 같은 버튼 연타까지 막혀서 pointerId 로 짝을 짓는다)
const tappedDown = new Set();

// 화면에 닿아 있는 모든 포인터.
const activePointers = new Set();

/**
 * 이 포인터의 pointerup 은 탭으로 치지 않는다.
 *
 * 전투 중 조이스틱을 잡고 있다가 레벨업이 뜨면, 손을 떼는 pointerup 이
 * "화면 왼쪽 탭"으로 변환되어 첫 카드가 제멋대로 선택됐다. 상태가 바뀌는 순간
 * 이미 닿아 있던 손가락은 새 화면에 대한 입력 의사가 아니므로 전부 무시한다.
 */
const ignoreUntilUp = new Set();

function pushTap(x, y) {
  input.taps.push({ x, y, t: performance.now(), used: false });
  if (input.taps.length > 8) input.taps.shift();
}

/** 지정한 사각형 안의 미처리 탭을 하나 소비한다. @returns {boolean} */
export function consumeTap(x, y, w, h) {
  for (const t of input.taps) {
    if (!t.used && t.x >= x && t.x <= x + w && t.y >= y && t.y <= y + h) {
      t.used = true;
      return true;
    }
  }
  return false;
}

let touchStick = null;   // { id, ox, oy, x, y }
let boostTouchId = null; // 부스트 버튼을 누르고 있는 손가락
let mouseBoost = false;  // 데스크톱: 마우스 버튼을 누르고 있는가
let canvas = null;
let onBlur = null;

const LEFT  = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UP    = ['KeyW', 'ArrowUp'];
const DOWN  = ['KeyS', 'ArrowDown'];

function inCircle(p, cx, cy, r) {
  const dx = p.x - cx, dy = p.y - cy;
  return dx * dx + dy * dy <= r * r;
}

export function initInput(cv, blurHandler) {
  canvas = cv;
  onBlur = blurHandler;

  addEventListener('keydown', e => {
    // 게임이 쓰는 키만 기본 동작을 막는다 (F5, DevTools 등은 살려둔다)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    keys.add(e.code);
    input.pressed.add(e.code);
    input.anyKey = true;
  });

  addEventListener('keyup', e => keys.delete(e.code));

  // 포커스를 잃으면 키가 눌린 채로 남는다 → 전부 해제하고 일시정지
  addEventListener('blur', () => {
    keys.clear();
    touchStick = null;
    boostTouchId = null;
    mouseBoost = false;
    tappedDown.clear();
    activePointers.clear();
    ignoreUntilUp.clear();
    if (onBlur) onBlur();
  });

  cv.addEventListener('pointerdown', e => {
    const p = toCanvas(e);
    input.lastEvent = `down ${e.pointerType} ${Math.round(p.x)},${Math.round(p.y)}`;
    activePointers.add(e.pointerId);

    if (e.pointerType === 'touch' && input.gameplay) {
      // 조종 중 터치는 조작기다. 스틱 손가락이 UI 포인터를 끌고 다니면 안 되므로
      // pointer 는 갱신하지 않는다.
      if (inCircle(p, TOUCH_UI.pauseX, TOUCH_UI.pauseY, TOUCH_UI.pauseR + 10)) {
        input.pauseTapped = true;
        return;
      }
      if (inCircle(p, TOUCH_UI.boostX, TOUCH_UI.boostY, TOUCH_UI.boostR)) {
        boostTouchId = e.pointerId;   // 누르고 있는 동안 지속 (엣지가 아니다)
        return;
      }
      if (p.x < W * 0.62 && !touchStick) {
        cv.setPointerCapture(e.pointerId);
        touchStick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
        return;
      }
      return;   // 우측 빈 공간 탭은 무시
    }

    // 데스크톱 조종 중의 클릭은 부스트다 — UI 탭으로 흘리지 않는다
    if (input.gameplay) {
      input.pointer.x = p.x;
      input.pointer.y = p.y;
      mouseBoost = true;
      return;
    }

    // 그 외에는 전부 UI 포인터
    input.pointer.x = p.x;
    input.pointer.y = p.y;
    input.pointer.down = true;
    input.pointer.justPressed = true;
    pushTap(p.x, p.y);
    tappedDown.add(e.pointerId);
  });

  cv.addEventListener('pointermove', e => {
    const p = toCanvas(e);
    if (touchStick && touchStick.id === e.pointerId) {
      touchStick.x = p.x;
      touchStick.y = p.y;
      return;                       // 스틱 손가락은 UI 포인터를 움직이지 않는다
    }
    if (e.pointerType === 'touch' && input.gameplay) return;
    input.pointer.x = p.x;
    input.pointer.y = p.y;
  });

  const release = e => {
    input.lastEvent = `${e.type} ${e.pointerType}`;
    activePointers.delete(e.pointerId);

    // 상태가 바뀔 때 이미 닿아 있던 손가락 — 떼는 동작을 탭으로 오인하지 않는다
    if (ignoreUntilUp.delete(e.pointerId)) {
      tappedDown.delete(e.pointerId);
      return;
    }
    if (touchStick && touchStick.id === e.pointerId) { touchStick = null; return; }
    if (boostTouchId === e.pointerId) { boostTouchId = null; return; }
    if (e.pointerType !== 'touch') mouseBoost = false;
    input.pointer.down = false;

    // pointerdown 이 이미 탭을 만들었으면 여기서는 넣지 않는다.
    if (tappedDown.delete(e.pointerId)) return;

    // down 이 제스처로 해석돼 취소되는 기기를 위한 폴백 — up 에서 탭을 확정한다.
    if (e.pointerType === 'touch' && e.type === 'pointerup' && !input.gameplay) {
      const p = toCanvas(e);
      input.pointer.x = p.x;
      input.pointer.y = p.y;
      pushTap(p.x, p.y);
    }
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('contextmenu', e => e.preventDefault());
}

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (W / r.width),
    y: (e.clientY - r.top) * (H / r.height),
  };
}

function held(list) {
  for (const k of list) if (keys.has(k)) return true;
  return false;
}

/**
 * 매 프레임 update 앞에서 호출.
 * 조종 방향을 하나로 합친다 — 터치는 조이스틱, 데스크톱은 마우스 포인터(또는 키보드).
 * 화면 좌표를 넘겨받아야 마우스 방향을 계산할 수 있다.
 */
export function pollInput(screenCenterX, screenCenterY) {
  let x = 0, y = 0, has = false;

  if (touchStick) {
    const dx = touchStick.x - touchStick.ox;
    const dy = touchStick.y - touchStick.oy;
    const len = Math.hypot(dx, dy);
    if (len > 10) { x = dx / len; y = dy / len; has = true; }
  } else if (held(LEFT) || held(RIGHT) || held(UP) || held(DOWN)) {
    if (held(LEFT))  x -= 1;
    if (held(RIGHT)) x += 1;
    if (held(UP))    y -= 1;
    if (held(DOWN))  y += 1;
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; has = true; }
  } else if (!IS_TOUCH_DEVICE) {
    // 마우스: 화면 중앙(= 플레이어 머리)에서 포인터로 향하는 방향
    const dx = input.pointer.x - screenCenterX;
    const dy = input.pointer.y - screenCenterY;
    const len = Math.hypot(dx, dy);
    if (len > 12) { x = dx / len; y = dy / len; has = true; }
  }

  input.aimX = x;
  input.aimY = y;
  input.hasAim = has;
  input.boost = mouseBoost || boostTouchId !== null ||
                keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight');
}

// 모듈 로드 시점에 한 번만 판별 (config 의 IS_TOUCH 와 같은 기준)
const IS_TOUCH_DEVICE =
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  (navigator.maxTouchPoints || 0) > 0;

/** 매 프레임 update 뒤에서 호출. 엣지 트리거들을 소비한다. */
export function endFrameInput() {
  input.pointer.justPressed = false;
  input.pauseTapped = false;
  input.pressed.clear();
  input.anyKey = false;

  // 탭은 소비 여부와 무관하게 TTL 로만 만료시킨다 (pushTap 의 중복 검사가 이 기록에 의존)
  const now = performance.now();
  for (let i = input.taps.length - 1; i >= 0; i--) {
    if (now - input.taps[i].t > TAP_TTL) input.taps.splice(i, 1);
  }
}

export function keyPressed(code) {
  return input.pressed.has(code);
}

export function getTouchStick() {
  return touchStick;
}

export function isBoostHeld() {
  return boostTouchId !== null || mouseBoost;
}

/** 상태가 바뀔 때 조작 중이던 터치를 정리한다. */
export function clearTouchState() {
  // 지금 화면에 닿아 있는 손가락은 새 화면을 누르려던 게 아니다.
  // 떼는 순간이 탭으로 오인되지 않도록 표시해 둔다.
  for (const id of activePointers) ignoreUntilUp.add(id);
  touchStick = null;
  boostTouchId = null;
  mouseBoost = false;
  tappedDown.clear();
  input.taps.length = 0;    // 전환 직전에 쌓인 탭도 새 화면으로 넘기지 않는다
}
