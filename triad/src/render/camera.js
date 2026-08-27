// 원근 카메라. 3D 점을 화면 좌표로 보내고, 화면 좌표를 다시 광선으로 되돌린다.
// 되돌리기가 되어야 "보이는 타일을 클릭"이 정확해진다 — 클릭 판정은 그림이 아니라
// 이 광선과 상자의 교차로 한다.

import { v3, sub, cross, norm, dot } from '../core/v3.js';

/**
 * @param rect 화면에서 3D 를 그릴 사각형 (논리 좌표)
 */
export function createCamera(rect, { fov = 42 } = {}) {
  return {
    eye: v3(0, 8, 9),
    target: v3(0, 0.5, 0),
    fov,
    rect,
    // 아래는 update 가 채운다
    xAxis: v3(1, 0, 0), yAxis: v3(0, 1, 0), zAxis: v3(0, 0, 1),
    f: 1, scale: 1, cx: 0, cy: 0,
  };
}

/**
 * 상자 전체가 화면 사각형에 들어오도록 카메라를 놓는다.
 * @param pitch 수평선에서 내려다보는 각도 (라디안)
 */
export function frameBox(cam, halfX, halfZ, height, pitch = 1.1) {
  const rect = cam.rect;
  cam.target = v3(0, height * 0.3, 0);

  // 1) 감싸는 구로 대충 거리를 잡고
  const radius = Math.hypot(halfX, halfZ, height * 0.6);
  const fovY = cam.fov * Math.PI / 180;
  let dist = radius / Math.sin(fovY / 2);

  // 2) 상자 여덟 귀퉁이를 실제로 투영해 화면에 꽉 채운다.
  //    구로만 맞추면 위아래로 빈 공간이 크게 남는다 — 더미는 납작한데
  //    구는 상자 대각선을 기준으로 잡기 때문이다.
  for (let iter = 0; iter < 3; iter++) {
    place(cam, dist, pitch);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = v3(
        (i & 1) ? halfX : -halfX,
        (i & 2) ? height : 0,
        (i & 4) ? halfZ : -halfZ,
      );
      const s = projectPoint(cam, p, {});
      if (!s) continue;
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const ratio = Math.max((maxX - minX) / (rect.w * 0.96), (maxY - minY) / (rect.h * 0.96));
    if (!isFinite(ratio) || ratio <= 0) break;
    dist *= ratio;
    if (Math.abs(ratio - 1) < 0.01) break;
  }
  place(cam, dist, pitch);
  return cam;
}

function place(cam, dist, pitch) {
  cam.eye = v3(
    cam.target.x,
    cam.target.y + Math.sin(pitch) * dist,
    cam.target.z + Math.cos(pitch) * dist,
  );
  update(cam);
}

export function update(cam) {
  const z = norm(sub(cam.eye, cam.target));          // 뒤쪽
  const x = norm(cross(v3(0, 1, 0), z));
  const y = cross(z, x);
  cam.xAxis = x; cam.yAxis = y; cam.zAxis = z;

  cam.f = 1 / Math.tan(cam.fov * Math.PI / 360);
  cam.scale = cam.rect.h / 2;
  cam.cx = cam.rect.x + cam.rect.w / 2;
  cam.cy = cam.rect.y + cam.rect.h / 2;
}

/** 월드 → 카메라 좌표. z 가 음수여야 앞에 있다. */
export function toView(cam, p, out = {}) {
  const dx = p.x - cam.eye.x, dy = p.y - cam.eye.y, dz = p.z - cam.eye.z;
  out.x = dx * cam.xAxis.x + dy * cam.xAxis.y + dz * cam.xAxis.z;
  out.y = dx * cam.yAxis.x + dy * cam.yAxis.y + dz * cam.yAxis.z;
  out.z = dx * cam.zAxis.x + dy * cam.zAxis.y + dz * cam.zAxis.z;
  return out;
}

/** 카메라 좌표 → 화면. 뒤에 있는 점은 null. */
export function project(cam, view, out = {}) {
  const d = -view.z;
  if (d < 0.05) return null;
  const k = cam.f * cam.scale / d;
  out.x = cam.cx + view.x * k;
  out.y = cam.cy - view.y * k;
  out.d = d;
  return out;
}

export function projectPoint(cam, p, out = {}) {
  return project(cam, toView(cam, p, scratch), out);
}
const scratch = { x: 0, y: 0, z: 0 };

/** 화면의 한 점에서 장면 안쪽으로 쏘는 광선. */
export function screenRay(cam, sx, sy) {
  const nx = (sx - cam.cx) / (cam.scale * cam.f);
  const ny = -(sy - cam.cy) / (cam.scale * cam.f);
  const dir = norm(v3(
    cam.xAxis.x * nx + cam.yAxis.x * ny - cam.zAxis.x,
    cam.xAxis.y * nx + cam.yAxis.y * ny - cam.zAxis.y,
    cam.xAxis.z * nx + cam.yAxis.z * ny - cam.zAxis.z,
  ));
  return { origin: cam.eye, dir };
}

/** 광선이 y = h 평면과 만나는 점 (바닥 표시용). */
export function rayPlaneY(ray, h) {
  if (Math.abs(ray.dir.y) < 1e-6) return null;
  const t = (h - ray.origin.y) / ray.dir.y;
  if (t < 0) return null;
  return v3(ray.origin.x + ray.dir.x * t, h, ray.origin.z + ray.dir.z * t);
}

export { dot };
