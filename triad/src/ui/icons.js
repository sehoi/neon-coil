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
    // 상자에서 세 장이 빠져나온다
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, s * 0.18);
    ctx.lineTo(-s * 0.7, s * 0.72);
    ctx.lineTo(s * 0.7, s * 0.72);
    ctx.lineTo(s * 0.7, s * 0.18);
    ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.42, s * 0.28);
      ctx.lineTo(i * s * 0.42, -s * 0.44);
      ctx.stroke();
      arrowHead(ctx, i * s * 0.42, -s * 0.44, -Math.PI / 2, s * 0.3);
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

  if (name === 'pause') {
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
