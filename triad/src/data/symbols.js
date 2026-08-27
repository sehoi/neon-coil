// 타일 무늬. 에셋 없이 전부 벡터로 그린다.
// 색만으로 구분하면 색약에게 불리하므로 모양도 전부 다르게 잡았다.

export const SYMBOLS = [
  { id: 0,  name: '삼각',   color: '#ff4d6d' },
  { id: 1,  name: '마름모', color: '#4dd2ff' },
  { id: 2,  name: '육각',   color: '#ffd166' },
  { id: 3,  name: '고리',   color: '#7cff6b' },
  { id: 4,  name: '별',     color: '#c77dff' },
  { id: 5,  name: '번개',   color: '#ff9f45' },
  { id: 6,  name: '물방울', color: '#46f0d0' },
  { id: 7,  name: '십자',   color: '#ff6bd6' },
  { id: 8,  name: '화살',   color: '#9bb0ff' },
  { id: 9,  name: '초승달', color: '#f2f2f5' },
  { id: 10, name: '톱니',   color: '#a0ff2f' },
  { id: 11, name: '나선',   color: '#ff5a3c' },
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
  ctx.lineWidth = r * 0.2;      // 최소값을 두면 안 된다 — 3D 면 위에서는
                                // 좌표계가 타일 크기(1)라 픽셀 기준 최소값이 타일을 덮는다
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (id) {
    case 0: poly(ctx, 3, r, -Math.PI / 2); ctx.fill(); break;

    case 1:
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.78, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.78, 0);
      ctx.closePath(); ctx.fill();
      break;

    case 2: poly(ctx, 6, r, -Math.PI / 2); ctx.fill(); break;

    case 3:
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
      break;

    case 4: star(ctx, 5, r, r * 0.44); ctx.fill(); break;

    case 5:
      ctx.beginPath();
      ctx.moveTo(r * 0.36, -r); ctx.lineTo(-r * 0.5, r * 0.12);
      ctx.lineTo(-r * 0.02, r * 0.12); ctx.lineTo(-r * 0.3, r);
      ctx.lineTo(r * 0.56, -r * 0.16); ctx.lineTo(r * 0.06, -r * 0.16);
      ctx.closePath(); ctx.fill();
      break;

    case 6:
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.1, r * 0.72, r * 0.9, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.72, r * 0.9, -r * 0.9, -r * 0.1, 0, -r);
      ctx.fill();
      break;

    case 7: {
      const t = r * 0.32;
      ctx.beginPath();
      ctx.rect(-t, -r, t * 2, r * 2);
      ctx.rect(-r, -t, r * 2, t * 2);
      ctx.fill();
      break;
    }

    case 8:
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.85, r * 0.15); ctx.lineTo(r * 0.3, r * 0.15);
      ctx.lineTo(r * 0.3, r); ctx.lineTo(-r * 0.3, r); ctx.lineTo(-r * 0.3, r * 0.15);
      ctx.lineTo(-r * 0.85, r * 0.15);
      ctx.closePath(); ctx.fill();
      break;

    case 9:
      // 큰 원에서 작은 원을 파낸다 (destination-out 대신 경로 두 개 + evenodd)
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.arc(r * 0.42, -r * 0.16, r * 0.78, 0, Math.PI * 2);
      ctx.fill('evenodd');
      break;

    case 10: {
      const teeth = 8;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const rr = i % 2 ? r * 0.62 : r;
        const a = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }

    default:
      ctx.beginPath();
      for (let i = 0; i <= 34; i++) {
        const a = (i / 34) * Math.PI * 3.4;
        const rr = r * (0.12 + (i / 34) * 0.86);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function poly(ctx, n, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function star(ctx, points, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
