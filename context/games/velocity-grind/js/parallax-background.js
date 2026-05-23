const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value, min, max) => {
  const span = max - min;
  return ((value - min) % span + span) % span + min;
};

const createStars = (count, width, height, seed, color) => {
  const stars = [];
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = 0; index < count; index += 1) {
    stars.push({
      x: next() * width,
      y: next() * height,
      radius: 0.6 + next() * 2.4,
      twinkle: next() * Math.PI * 2,
      speed: 0.02 + next() * 0.06,
      color
    });
  }

  return stars;
};

export class ParallaxBackground {
  constructor() {
    this.layers = [
      { stars: createStars(90, 1600, 900, 11, "rgba(255,255,255,0.2)"), speed: 0.08, drift: 6 },
      { stars: createStars(48, 1600, 900, 22, "rgba(126,224,129,0.16)"), speed: 0.16, drift: 12 },
      { stars: createStars(22, 1600, 900, 33, "rgba(255,179,71,0.18)"), speed: 0.28, drift: 20 }
    ];
  }

  drawFallbackMark(ctx, { x, y, size, accent }) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 96, size / 96);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(16, 0);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  render(ctx, { width, height, time, scroll = 0, accent = "#ffb347", image = null }) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#18304a");
    sky.addColorStop(0.55, "#0f1f30");
    sky.addColorStop(1, "#05070c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.7;

    for (const layer of this.layers) {
      for (const star of layer.stars) {
        const x = wrap(star.x - scroll * layer.speed - time * layer.drift, -40, width + 40);
        const y = wrap(star.y + Math.sin(time * star.speed + star.twinkle) * 10, -40, height + 40);
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 0.18;
    const haze = ctx.createRadialGradient(width * 0.72, height * 0.22, 30, width * 0.72, height * 0.22, height * 0.62);
    haze.addColorStop(0, accent);
    haze.addColorStop(1, "transparent");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let index = 0; index < 10; index += 1) {
      const x = wrap(width * 0.08 + index * 180 - scroll * 0.04, -220, width + 220);
      const y = height * 0.72 + Math.sin(time * 0.5 + index) * 24;
      ctx.beginPath();
      ctx.ellipse(x, y, 120, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16;
    if (image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      ctx.drawImage(image, width * 0.05, height * 0.12, 96, 96);
    } else {
      this.drawFallbackMark(ctx, {
        x: width * 0.11,
        y: height * 0.2,
        size: 96,
        accent
      });
    }
    ctx.restore();
  }
}
