// 도구 아이콘. 이모지는 기기마다 다르게 나오므로 전부 벡터로 그린다.

export function drawIcon(ctx, name, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (name === 'undo') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.62, Math.PI * 0.85, Math.PI * 2.1);
    ctx.stroke();
    arrowHead(ctx, -s * 0.62, -s * 0.06, Math.PI * 0.5, s * 0.34);
  } else if (name === 'withdraw') {
    // 한 벌 완성 — 세 장이 나란히 서고 그 위에 체크
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      rect(ctx, i * s * 0.5 - s * 0.2, -s * 0.12, s * 0.4, s * 0.78);
      ctx.stroke();
    }
    ctx.lineWidth = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.5);
    ctx.lineTo(-s * 0.14, -s * 0.16);
    ctx.lineTo(s * 0.62, -s * 0.86);
    ctx.stroke();
  } else if (name === 'flip') {
    // 정렬 — 격자로 늘어선 타일들
    ctx.lineWidth = s * 0.13;
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        ctx.beginPath();
        rect(ctx, c * s * 0.5 - s * 0.19, r * s * 0.5 - s * 0.22, s * 0.38, s * 0.44);
        ctx.stroke();
      }
    }
  } else {
    // shuffle — 엇갈리는 두 화살
    ctx.beginPath();
    ctx.moveTo(-s * 0.72, -s * 0.4);
    ctx.bezierCurveTo(-s * 0.1, -s * 0.4, s * 0.1, s * 0.42, s * 0.62, s * 0.42);
    ctx.moveTo(-s * 0.72, s * 0.42);
    ctx.bezierCurveTo(-s * 0.1, s * 0.42, s * 0.1, -s * 0.4, s * 0.62, -s * 0.4);
    ctx.stroke();
    arrowHead(ctx, s * 0.62, s * 0.42, 0, s * 0.3);
    arrowHead(ctx, s * 0.62, -s * 0.4, 0, s * 0.3);
  }
  ctx.restore();
}

function rect(ctx, x, y, w, h) {
  ctx.rect(x, y, w, h);
}

function arrowHead(ctx, x, y, angle, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.62);
  ctx.lineTo(-size, size * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** HUD 의 일시정지 / 음소거 표시. */
export function drawGlyph(ctx, name, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';

  if (name === 'coin') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
  } else if (name === 'gift') {
    ctx.fillRect(-s * 0.85, -s * 0.15, s * 1.7, s * 0.95);
    ctx.fillRect(-s * 0.95, -s * 0.55, s * 1.9, s * 0.34);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(-s * 0.13, -s * 0.6, s * 0.26, s * 1.45);
    ctx.restore();
    ctx.lineWidth = s * 0.18;
    ctx.beginPath();
    ctx.arc(-s * 0.3, -s * 0.72, s * 0.3, 0, Math.PI * 2);
    ctx.arc(s * 0.3, -s * 0.72, s * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (name === 'pause') {
    ctx.fillRect(-s * 0.34, -s * 0.5, s * 0.24, s);
    ctx.fillRect(s * 0.1, -s * 0.5, s * 0.24, s);
  } else if (name === 'play') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.52);
    ctx.lineTo(s * 0.52, 0);
    ctx.lineTo(-s * 0.3, s * 0.52);
    ctx.closePath();
    ctx.fill();
  } else {
    // 스피커
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s * 0.22);
    ctx.lineTo(-s * 0.28, -s * 0.22);
    ctx.lineTo(0.02 * s, -s * 0.6);
    ctx.lineTo(0.02 * s, s * 0.6);
    ctx.lineTo(-s * 0.28, s * 0.22);
    ctx.lineTo(-s * 0.6, s * 0.22);
    ctx.closePath();
    ctx.fill();
    if (name === 'muted') {
      ctx.beginPath();
      ctx.moveTo(s * 0.24, -s * 0.34);
      ctx.lineTo(s * 0.68, s * 0.34);
      ctx.moveTo(s * 0.68, -s * 0.34);
      ctx.lineTo(s * 0.24, s * 0.34);
      ctx.stroke();
    } else {
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(s * 0.12, 0, s * (0.2 + i * 0.22), -Math.PI * 0.33, Math.PI * 0.33);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
