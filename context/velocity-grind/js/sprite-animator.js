const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const drawFallbackShip = (ctx, { x, y, angle, scale, alpha, glow, color, accent }) => {
  const body = [
    [0, -26],
    [18, 14],
    [0, 24],
    [-18, 14]
  ];
  const fin = [
    [-10, 4],
    [-30, 18],
    [-8, 12]
  ];
  const finRight = fin.map(([px, py]) => [-px, py]);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  if (glow) {
    ctx.shadowColor = "rgba(255, 179, 71, 0.32)";
    ctx.shadowBlur = 20;
  }

  ctx.fillStyle = color;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(body[0][0], body[0][1]);
  for (let index = 1; index < body.length; index += 1) {
    ctx.lineTo(body[index][0], body[index][1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(fin[0][0], fin[0][1]);
  for (let index = 1; index < fin.length; index += 1) {
    ctx.lineTo(fin[index][0], fin[index][1]);
  }
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(finRight[0][0], finRight[0][1]);
  for (let index = 1; index < finRight.length; index += 1) {
    ctx.lineTo(finRight[index][0], finRight[index][1]);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.arc(0, -2, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.rect(-10, -2, 20, 16);
  ctx.fill();

  ctx.restore();
};

const isRenderableImage = (frame) => Boolean(frame && frame.complete && frame.naturalWidth > 0 && frame.naturalHeight > 0);

export class SpriteAnimator {
  constructor(frames, options = {}) {
    this.frames = frames.filter(Boolean);
    this.frameDuration = options.frameDuration ?? 0.12;
    this.scale = options.scale ?? 1;
    this.offsetX = options.offsetX ?? 0;
    this.offsetY = options.offsetY ?? 0;
    this.anchorX = options.anchorX ?? 0.5;
    this.anchorY = options.anchorY ?? 0.5;
    this.bobAmplitude = options.bobAmplitude ?? 0;
    this.bobSpeed = options.bobSpeed ?? 0;
    this.fallbackColor = options.fallbackColor ?? "#ffb347";
    this.fallbackAccent = options.fallbackAccent ?? "rgba(255,255,255,0.72)";
  }

  frameAt(time, phase = 0) {
    if (!this.frames.length) {
      return null;
    }
    const index = Math.floor((time + phase) / this.frameDuration) % this.frames.length;
    return this.frames[(index + this.frames.length) % this.frames.length];
  }

  draw(ctx, options = {}) {
    const {
      x,
      y,
      time = 0,
      phase = 0,
      angle = 0,
      scale = 1,
      alpha = 1,
      width,
      height,
      glow = false
    } = options;
    const frame = this.frameAt(time, phase);
    const bob = this.bobAmplitude ? Math.sin((time + phase) * this.bobSpeed) * this.bobAmplitude : 0;
    const drawScale = clamp(this.scale * scale, 0.2, 8);
    const px = x + this.offsetX;
    const py = y + this.offsetY + bob;

    if (!isRenderableImage(frame)) {
      drawFallbackShip(ctx, {
        x: px,
        y: py,
        angle,
        scale: drawScale * 1.08,
        alpha,
        glow,
        color: this.fallbackColor,
        accent: this.fallbackAccent
      });
      return;
    }

    const spriteWidth = width ?? frame.naturalWidth ?? frame.width ?? 64;
    const spriteHeight = height ?? frame.naturalHeight ?? frame.height ?? 64;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    if (glow) {
      ctx.shadowColor = "rgba(255, 179, 71, 0.28)";
      ctx.shadowBlur = 22;
    }

    ctx.drawImage(
      frame,
      -spriteWidth * drawScale * this.anchorX,
      -spriteHeight * drawScale * this.anchorY,
      spriteWidth * drawScale,
      spriteHeight * drawScale
    );
    ctx.restore();
  }
}
