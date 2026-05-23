function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class FretBoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.laneCount = 5;
    this.laneLabels = ["D", "F", "J", "K", "SPACE"];
  }

  resize(width, height) {
    this.canvas.width = Math.max(1, Math.floor(width));
    this.canvas.height = Math.max(1, Math.floor(height));
  }

  projectLane(laneIndex, progress, sway = 0) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const laneWidth = w / this.laneCount;
    const centerX = laneWidth * (laneIndex + 0.5);
    const curve = Math.sin(progress * Math.PI) * sway * w * 0.05;
    return {
      x: centerX + curve,
      y: h - clamp(progress, 0, 1) * h,
      width: laneWidth * 0.82,
    };
  }

  render({ notes = [], nowMicros = 0, intensity = 0, hyperState = {}, analyserBins = [], activeLanes = [] } = {}) {
    const ctx = this.ctx;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);
    const laneCount = this.laneCount;
    const sway = clamp((hyperState.multiplier ?? 1) - 1, 0, 1);
    const vibration = 1 + intensity * 0.35 + analyserBins.slice(0, 8).reduce((sum, n) => sum + n, 0) / 800;
    const strikeY = Math.max(112, h * 0.2);
    const activeLaneSet = new Set(activeLanes);
    const strikePulse = clamp(0.52 + intensity * 0.28 + sway * 0.18, 0.52, 0.92);

    ctx.save();
    ctx.fillStyle = `rgba(248, 184, 78, ${0.08 + strikePulse * 0.12})`;
    ctx.fillRect(0, strikeY - 28, w, 56);
    ctx.strokeStyle = `rgba(248, 184, 78, ${0.42 + strikePulse * 0.24})`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, strikeY);
    ctx.lineTo(w * 0.92, strikeY);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 241, 200, ${0.45 + strikePulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, strikeY);
    ctx.lineTo(w * 0.92, strikeY);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < laneCount; i += 1) {
      const x = (w / laneCount) * (i + 0.5);
      ctx.strokeStyle = `rgba(160, 220, 255, ${0.12 + i * 0.04})`;
      ctx.lineWidth = 2 + sway;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + Math.sin(nowMicros / 180000 + i) * 18 * sway, h * 0.52, x, h);
      ctx.stroke();

      const laneActive = activeLaneSet.has(i);
      ctx.fillStyle = laneActive ? "rgba(248, 184, 78, 0.9)" : "rgba(8, 14, 24, 0.92)";
      ctx.strokeStyle = laneActive ? "rgba(255, 247, 210, 0.95)" : "rgba(248, 184, 78, 0.45)";
      ctx.lineWidth = laneActive ? 4 : 2;
      ctx.beginPath();
      ctx.roundRect(x - 42, strikeY - 18, 84, 36, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = laneActive ? "#051018" : "rgba(247, 244, 236, 0.92)";
      ctx.font = `700 ${Math.max(15, Math.floor(w * 0.013))}px Trebuchet MS`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.laneLabels[i] ?? String(i + 1), x, strikeY);
    }

    for (const note of notes) {
      const lead = note.hitTimeMicros - nowMicros;
      const progress = clamp(1 - lead / 1800000, 0, 1.2);
      const lane = note.lane ?? 0;
      const projected = this.projectLane(lane, progress, sway);
      const radius = 12 + (note.weight ?? 1) * 4 * vibration;
      ctx.fillStyle = `hsla(${(lane * 58 + 190) % 360}, 95%, 65%, ${clamp(progress, 0, 1)})`;
      ctx.beginPath();
      ctx.ellipse(projected.x, projected.y, radius, radius * 0.72, Math.sin(progress * Math.PI) * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
