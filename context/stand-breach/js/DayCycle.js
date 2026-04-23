const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class DayCycle {
  constructor(options = {}) {
    this.cycleSeconds = options.cycleSeconds ?? 110;
    this.startTime = options.startTime ?? this.cycleSeconds * 0.5;
    this.time = this.startTime;
    this.day = options.startDay ?? 1;
    this.phase = 0;
    this.phaseName = "day";
    this.daylight = 1;
    this.night = 0;
    this.pressure = 0;
    this.fog = 0.25;
    this.skyBlend = "rgba(52, 94, 150, 1)";
    this.glow = 1;
    this.difficulty = 1;
  }

  reset() {
    this.time = this.startTime;
    this.day = 1;
    this.phase = 0;
    this.phaseName = "day";
    this.daylight = 1;
    this.night = 0;
    this.pressure = 0;
    this.fog = 0.25;
    this.glow = 1;
    this.difficulty = 1;
  }

  advanceDay() {
    this.day += 1;
    this.time = this.startTime;
    this.phase = 0;
    return this.day;
  }

  isNight() {
    return this.night > 0.45;
  }

  getPhase() {
    return this.phaseName;
  }

  getTimeLabel() {
    const totalMinutes = Math.floor((this.phase * 24 * 60) % (24 * 60));
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return `${this.phaseName === "night" ? "Night" : "Day"} ${this.day} ${clock}`;
  }

  getDifficultyMultiplier() {
    return this.difficulty;
  }

  update(dt, pressure = 0) {
    this.time += dt;
    this.pressure = pressure;
    while (this.time >= this.cycleSeconds) {
      this.time -= this.cycleSeconds;
      this.day += 1;
    }

    this.phase = this.time / this.cycleSeconds;
    const wave = Math.sin((this.phase * Math.PI * 2) - Math.PI / 2);
    this.daylight = clamp(0.16 + ((wave + 1) * 0.42), 0.05, 1);
    this.night = 1 - this.daylight;

    if (this.daylight > 0.72) {
      this.phaseName = "day";
    } else if (this.daylight > 0.42) {
      this.phaseName = wave >= 0 ? "day" : "dusk";
    } else if (this.daylight > 0.2) {
      this.phaseName = wave >= 0 ? "dawn" : "night";
    } else {
      this.phaseName = "night";
    }

    this.glow = clamp(0.35 + this.daylight * 0.68 - pressure * 0.012, 0.08, 1.15);
    this.fog = clamp(0.18 + this.night * 0.44 + pressure * 0.004, 0.12, 0.95);
    this.difficulty = clamp(1 + this.night * 0.72 + pressure * 0.012 + Math.max(0, this.day - 1) * 0.03, 1, 4);

    return {
      phase: this.phase,
      phaseName: this.phaseName,
      daylight: this.daylight,
      night: this.night,
      pressure: this.pressure,
      glow: this.glow,
      skyBlend: `rgba(${Math.round(20 + this.daylight * 50)}, ${Math.round(32 + this.daylight * 82)}, ${Math.round(64 + this.daylight * 110)}, 1)`,
      fog: this.fog,
      difficulty: this.difficulty,
      day: this.day
    };
  }

  draw(ctx, width, height) {
    if (!ctx) {
      return;
    }
    const w = width ?? 0;
    const h = height ?? 0;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, `rgba(${Math.round(18 + this.daylight * 48)}, ${Math.round(24 + this.daylight * 70)}, ${Math.round(50 + this.daylight * 100)}, 1)`);
    sky.addColorStop(1, "rgba(4, 6, 10, 1)");
    ctx.save();
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.25 + this.night * 0.35;
    ctx.fillStyle = "#0a1120";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.28 + this.daylight * 0.18;
    ctx.fillStyle = "#dff2ff";
    const orbX = w * (0.2 + this.phase * 0.6);
    const orbY = h * (0.22 + 0.05 * Math.sin(this.phase * Math.PI * 2));
    ctx.beginPath();
    ctx.arc(orbX, orbY, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
