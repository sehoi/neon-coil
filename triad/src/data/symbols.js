// 타일 무늬 — 마작패를 본떴다. 에셋 없이 전부 벡터로 그린다.
//
// 통(筒)은 동그라미, 삭(索)은 대나무, 중(中)·백(白)은 테두리, 화(花)는 꽃.
// 색만으로 구분하면 색약에게 불리하므로 모양도 전부 다르게 잡았고,
// 앞의 여섯 개(레벨 1~3 에서 쓰는 것)는 특히 서로 안 닮게 순서를 짰다.

export const SYMBOLS = [
  { id: 0,  name: '일통', color: '#e23b4e' },
  { id: 1,  name: '일삭', color: '#12b5a4' },
  { id: 2,  name: '백',   color: '#3d8bff' },
  { id: 3,  name: '화',   color: '#ff5fa8' },
  { id: 4,  name: '삼통', color: '#35c15f' },
  { id: 5,  name: '죽',   color: '#8ddc2a' },
  { id: 6,  name: '중',   color: '#d81f3a' },
  { id: 7,  name: '이삭', color: '#4fd2ff' },
  { id: 8,  name: '오통', color: '#f0b429' },
  { id: 9,  name: '이통', color: '#6f7bff' },
  { id: 10, name: '삼삭', color: '#a86bff' },
  { id: 11, name: '구통', color: '#ff7a2f' },
];

/**
 * 무늬 하나를 (x, y) 중심에 반지름 r 로 그린다.
 * 색은 호출자가 정한다 (덮인 타일은 흐리게 그려야 해서).
 */
export function drawSymbol(ctx, id, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  // 3D 면 위에서는 좌표계가 타일 크기(1)라 픽셀 기준 최소값을 두면 안 된다
  ctx.lineWidth = r * 0.17;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (id) {
    case 0: dot(ctx, 0, 0, r * 0.92, color); break;                       // 일통
    case 1: bamboo(ctx, 0, r, color); break;                              // 일삭
    case 2: frame(ctx, r, color, false); break;                           // 백
    case 3: flower(ctx, r, color); break;                                 // 화
    case 4:                                                               // 삼통
      dot(ctx, -r * 0.5, -r * 0.5, r * 0.42, color);
      dot(ctx, 0, 0, r * 0.42, color);
      dot(ctx, r * 0.5, r * 0.5, r * 0.42, color);
      break;
    case 5: leaves(ctx, r, color); break;                                 // 죽
    case 6: frame(ctx, r, color, true); break;                            // 중
    case 7:                                                               // 이삭
      bamboo(ctx, -r * 0.42, r, color);
      bamboo(ctx, r * 0.42, r, color);
      break;
    case 8:                                                               // 오통
      for (const [ox, oy] of [[-0.55, -0.55], [0.55, -0.55], [0, 0], [-0.55, 0.55], [0.55, 0.55]]) {
        dot(ctx, ox * r, oy * r, r * 0.34, color);
      }
      break;
    case 9:                                                               // 이통
      dot(ctx, 0, -r * 0.5, r * 0.46, color);
      dot(ctx, 0, r * 0.5, r * 0.46, color);
      break;
    case 10:                                                              // 삼삭
      bamboo(ctx, -r * 0.6, r, color);
      bamboo(ctx, 0, r, color);
      bamboo(ctx, r * 0.6, r, color);
      break;
    default:                                                              // 구통
      for (let i = 0; i < 9; i++) {
        dot(ctx, (i % 3 - 1) * r * 0.66, (Math.floor(i / 3) - 1) * r * 0.66, r * 0.26, color);
      }
      break;
  }
  ctx.restore();
}

/** 통(筒) 한 알 — 바깥 고리와 가운데 점. */
function dot(ctx, cx, cy, rr, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 0.82, 0, Math.PI * 2);
  ctx.lineWidth = rr * 0.34;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** 삭(索) 한 대 — 마디로 끊긴 굵은 대나무. */
function bamboo(ctx, cx, r, color) {
  const w = r * 0.34, h = r * 0.95;
  ctx.save();
  ctx.translate(cx, 0);
  ctx.fillStyle = color;

  // 마디 세 토막
  for (let i = -1; i <= 1; i++) {
    const cy = i * h * 0.63;
    round(ctx, -w / 2, cy - h * 0.28, w, h * 0.56, w * 0.35);
    ctx.fill();
  }
  // 위쪽 잎 두 장
  ctx.beginPath();
  ctx.ellipse(-w * 0.75, -h * 1.02, w * 0.42, w * 0.2, -0.7, 0, Math.PI * 2);
  ctx.ellipse(w * 0.75, -h * 1.02, w * 0.42, w * 0.2, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 중(中)·백(白) — 테두리, 중은 가운데를 세로로 꿴다. */
function frame(ctx, r, color, bar) {
  const w = r * 0.76, h = r * 0.98;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  ctx.rect(-w, -h, w * 2, h * 2);
  ctx.stroke();
  if (bar) {
    ctx.lineWidth = r * 0.26;
    ctx.beginPath();
    ctx.moveTo(0, -h * 1.28);
    ctx.lineTo(0, h * 1.28);
    ctx.stroke();
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, 0);
    ctx.lineTo(w * 0.45, 0);
    ctx.stroke();
  }
}

/** 화(花) — 다섯 잎. */
function flower(ctx, r, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.42, r * 0.26, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** 죽(竹) — 잎 세 장. */
function leaves(ctx, r, color) {
  ctx.fillStyle = color;
  for (const a of [-0.75, 0, 0.75]) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.22, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.98);
  ctx.lineTo(0, r * 0.15);
  ctx.stroke();
}
