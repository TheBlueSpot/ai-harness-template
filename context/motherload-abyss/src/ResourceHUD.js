const THEME = {
  panel: "rgba(7, 11, 18, 0.78)",
  line: "rgba(255, 255, 255, 0.12)",
  text: "#f5f0e6",
  muted: "rgba(245, 240, 230, 0.72)",
  fuel: "#ff9d4a",
  hull: "#73d7ff",
  pressure: "#ff6f7c",
  cargo: "#9ee86f"
};

export const formatRunTime = (seconds) => {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(whole / 60);
  const remaining = whole % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
};

export class ResourceHUD {
  constructor(options = {}) {
    const opts = isElement(options) ? { overlayRoot: options } : options;
    this.overlayRoot = opts.overlayRoot ?? null;
    this.snapshot = normalizeSnapshot(opts.snapshot ?? {});
    this.root = null;
    this.refs = null;
    this.flash = 0;

    if (this.overlayRoot) {
      this.mount();
    }
  }

  update(snapshot) {
    this.snapshot = normalizeSnapshot(snapshot);
    this.flash = Math.max(this.flash * 0.92, this.snapshot.warning ? 1 : 0);
    this.syncDom();
  }

  draw(ctx, canvas) {
    if (!ctx || !canvas) {
      return;
    }
    const s = this.snapshot;
    const pad = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.018));
    const w = Math.min(390, Math.round(canvas.width * 0.28));
    const x = canvas.width - pad - w;
    const y = pad;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.fillStyle = THEME.panel;
    roundRect(ctx, x, y, w, 236, 20);
    ctx.fill();
    ctx.strokeStyle = THEME.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.font = '800 16px "Segoe UI", sans-serif';
    ctx.fillText("MOTHERLOAD ABYSS", x + 16, y + 14);
    ctx.fillStyle = THEME.muted;
    ctx.font = '600 11px "Segoe UI", sans-serif';
    ctx.fillText(s.mission, x + 16, y + 34);
    drawBar(ctx, x + 16, y + 64, w - 32, "Fuel", s.fuel, THEME.fuel);
    drawBar(ctx, x + 16, y + 92, w - 32, "Hull", s.hull, THEME.hull);
    drawBar(ctx, x + 16, y + 120, w - 32, "Pressure", s.pressure, THEME.pressure);
    drawBar(ctx, x + 16, y + 148, w - 32, "Cargo", s.cargo, THEME.cargo);
    ctx.fillStyle = THEME.text;
    ctx.font = '700 12px "Segoe UI", sans-serif';
    ctx.fillText(`Ore ${formatInt(s.ore)}`, x + 16, y + 198);
    ctx.fillText(`Depth ${formatDistance(s.depth)}`, x + 132, y + 198);
    ctx.fillText(`Time ${formatRunTime(s.timeSurvived)}`, x + 248, y + 198);
    if (s.warning) {
      const bw = Math.min(canvas.width - pad * 2, 560);
      const bx = Math.max(pad, (canvas.width - bw) * 0.5);
      const by = canvas.height - pad - 66;
      ctx.shadowColor = s.warning.color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = "rgba(5, 8, 12, 0.9)";
      roundRect(ctx, bx, by, bw, 56, 16);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = s.warning.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = s.warning.color;
      ctx.font = '800 13px "Segoe UI", sans-serif';
      ctx.fillText(s.warning.title, bx + 14, by + 10);
      ctx.fillStyle = THEME.text;
      ctx.font = '600 11px "Segoe UI", sans-serif';
      ctx.fillText(s.warning.body, bx + 14, by + 30);
    }
    ctx.restore();
  }

  destroy() {
    if (this.root) {
      this.root.remove();
      this.root = null;
      this.refs = null;
    }
  }

  mount() {
    if (!this.overlayRoot || this.root) {
      return;
    }
    const root = document.createElement("section");
    root.className = "hud-panel";
    root.style.display = "grid";
    root.style.gap = "10px";
    root.style.pointerEvents = "none";
    root.innerHTML = `
      <div class="hud-row" style="margin-bottom:0;">
        <div>
          <div class="hud-label">Mission</div>
          <strong data-title style="display:block;font-size:18px;line-height:1.15;color:var(--text);">Dig. Mine. Survive.</strong>
        </div>
        <div data-time class="hud-value">0:00</div>
      </div>
      <div data-warning style="display:none;padding:10px 12px;border-radius:14px;background:rgba(255,111,124,0.12);border:1px solid rgba(255,111,124,0.26);color:var(--text);font-weight:700;"></div>
      <div data-bars style="display:grid;gap:10px;"></div>
      <div class="hud-grid">
        <div><span class="hud-label">Ore</span><strong data-ore>0</strong></div>
        <div><span class="hud-label">Depth</span><strong data-depth>0m</strong></div>
        <div><span class="hud-label">Hull</span><strong data-hull>100%</strong></div>
        <div><span class="hud-label">Pressure</span><strong data-pressure>0%</strong></div>
      </div>
    `;
    const bars = root.querySelector("[data-bars]");
    const barRefs = {};
    for (const [key, label] of [["fuel", "Fuel"], ["hull", "Hull"], ["pressure", "Pressure"], ["cargo", "Cargo"]]) {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gap = "4px";
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <span class="hud-label">${label}</span>
          <strong data-value style="font-size:12px;color:var(--text);">0%</strong>
        </div>
        <div class="meter"><span></span></div>
      `;
      bars.append(row);
      barRefs[key] = {
        value: row.querySelector("[data-value]"),
        fill: row.querySelector(".meter span")
      };
    }
    this.overlayRoot.append(root);
    this.root = root;
    this.refs = {
      title: root.querySelector("[data-title]"),
      warning: root.querySelector("[data-warning]"),
      time: root.querySelector("[data-time]"),
      ore: root.querySelector("[data-ore]"),
      depth: root.querySelector("[data-depth]"),
      hull: root.querySelector("[data-hull]"),
      pressure: root.querySelector("[data-pressure]"),
      bars: barRefs
    };
    this.syncDom();
  }

  syncDom() {
    if (!this.refs) {
      return;
    }
    const s = this.snapshot;
    this.refs.title.textContent = s.phaseLabel;
    this.refs.time.textContent = formatRunTime(s.timeSurvived);
    this.refs.ore.textContent = formatInt(s.ore);
    this.refs.depth.textContent = formatDistance(s.depth);
    this.refs.hull.textContent = `${Math.round(s.hull * 100)}%`;
    this.refs.pressure.textContent = `${Math.round(s.pressure * 100)}%`;
    syncBar(this.refs.bars.fuel, s.fuel, THEME.fuel);
    syncBar(this.refs.bars.hull, s.hull, THEME.hull);
    syncBar(this.refs.bars.pressure, s.pressure, THEME.pressure);
    syncBar(this.refs.bars.cargo, s.cargo, THEME.cargo);
    if (s.warning) {
      this.refs.warning.style.display = "block";
      this.refs.warning.style.borderColor = `${s.warning.color}44`;
      this.refs.warning.style.background = `${s.warning.color}1a`;
      this.refs.warning.textContent = `${s.warning.title} - ${s.warning.body}`;
    } else {
      this.refs.warning.style.display = "none";
      this.refs.warning.textContent = "";
    }
    this.root.dataset.critical = String(Boolean(s.warning));
  }
}

function normalizeSnapshot(snapshot = {}) {
  const fuel = normalizedValue(snapshot.fuel, snapshot.fuelRatio, snapshot.energy, 1);
  const hullFallback = snapshot.pressureDamage != null ? 1 - Number(snapshot.pressureDamage) / 100 : undefined;
  const hull = normalizedValue(snapshot.hull, snapshot.integrity, snapshot.health ?? hullFallback, 1);
  const pressure = normalizedValue(snapshot.pressure, snapshot.pressureRatio, snapshot.externalPressure, 0);
  const cargo = normalizedValue(snapshot.cargo, snapshot.cargoRatio, snapshot.load, 0);
  const hud = {
    fuel,
    hull,
    pressure,
    cargo,
    depth: number(snapshot.depth ?? snapshot.maxDepth ?? snapshot.yDepth ?? 0),
    ore: number(snapshot.ore ?? snapshot.oreValue ?? snapshot.oreCollected ?? 0),
    timeSurvived: number(snapshot.timeSurvived ?? snapshot.time ?? 0),
    phaseLabel: snapshot.phaseLabel ?? snapshot.phase ?? (snapshot.dead ? "Run ended" : "Live run"),
    mission: snapshot.mission ?? snapshot.objective ?? "Dig deeper. Stay alive."
  };
  return {
    ...hud,
    warning: deriveWarning(hud, snapshot)
  };
}

function deriveWarning(readings, snapshot) {
  if (snapshot.dead) {
    return {
      title: "Hull failed",
      body: snapshot.reason ? String(snapshot.reason) : "Run ended. Restart and dig again.",
      color: THEME.danger
    };
  }
  if (readings.pressure >= 0.82) {
    return { title: "Pressure critical", body: "Surface fast or take damage.", color: THEME.danger };
  }
  if (readings.fuel <= 0.22) {
    return { title: "Fuel low", body: "Power drain high. Mine or surface.", color: THEME.amber };
  }
  if (readings.hull <= 0.28) {
    return { title: "Hull damaged", body: "Impacts will finish the run.", color: THEME.danger };
  }
  return null;
}

function normalizedValue(primary, ratio, fallback, zeroDefault = 0) {
  const chosen = [ratio, primary, fallback].find((value) => Number.isFinite(Number(value)));
  if (!Number.isFinite(Number(chosen))) {
    return zeroDefault;
  }
  const value = Number(chosen);
  if (value <= 1 && value >= 0) {
    return value;
  }
  return Math.max(0, Math.min(1, value / 100));
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatInt(value) {
  return Math.round(number(value)).toLocaleString();
}

function formatDistance(value) {
  const numeric = number(value);
  if (Math.abs(numeric) >= 1000) {
    return `${(numeric / 1000).toFixed(1)}km`;
  }
  return `${Math.round(numeric)}m`;
}

function syncBar(ref, value, color) {
  if (!ref) {
    return;
  }
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  ref.value.textContent = `${pct}%`;
  ref.fill.style.width = `${pct}%`;
  ref.fill.style.background = `linear-gradient(90deg, ${color}, ${color})`;
}

function drawBar(ctx, x, y, w, label, value, color) {
  const pct = Math.max(0, Math.min(1, value));
  ctx.fillStyle = THEME.muted;
  ctx.font = '700 11px "Segoe UI", sans-serif';
  ctx.fillText(label, x, y - 12);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, x, y, w, 11, 999);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, Math.max(8, w * pct), 11, 999);
  ctx.fill();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(pct * 100)}%`, x + w, y - 12);
  ctx.textAlign = "left";
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function isElement(value) {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}
