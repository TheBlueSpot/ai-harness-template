const cache = { assets: null };

export function createAssets() {
  if (cache.assets) {
    return cache.assets;
  }

  const assets = {
    drill: buildDrill(),
    tiles: buildTerrainTile("#6e4b2d", "#3f2717", "#9b6b3e"),
    oreCopper: buildOre("#ffbf69", "#9f5c28", "#ffdba7"),
    oreIron: buildOre("#c4d0da", "#66727e", "#f6fbff"),
    oreVoid: buildOre("#8f7bff", "#4739c8", "#cbc3ff"),
    terrain: {
      soil: buildTerrainTile("#6e4b2d", "#3f2717", "#9b6b3e"),
      clay: buildTerrainTile("#75635f", "#443730", "#a48d86"),
      rock: buildTerrainTile("#5b6474", "#2a3140", "#8d97ab"),
      basalt: buildTerrainTile("#3d4254", "#1f2333", "#727b94"),
      crystal: buildTerrainTile("#305e66", "#14333b", "#78d8e3", true),
      void: buildTerrainTile("#1a202b", "#0d1118", "#39485c", false, true),
    },
    ores: {
      copper: buildOre("#ffbf69", "#9f5c28", "#ffdba7"),
      iron: buildOre("#c4d0da", "#66727e", "#f6fbff"),
      void: buildOre("#8f7bff", "#4739c8", "#cbc3ff"),
      crystal: buildOre("#7ee8ff", "#1f7581", "#e9feff", true),
      uranium: buildOre("#a4f85d", "#4e7f1b", "#ebffd1"),
    },
    particles: {
      dust: buildParticles("#d6c2a0", "#816747"),
      sparks: buildParticles("#ffd26e", "#ff8130", true),
      smoke: buildParticles("#a0a8b4", "#495261"),
    },
    icons: {
      fuel: buildIcon("F", "#ff9d4a"),
      hull: buildIcon("H", "#73d7ff"),
      pressure: buildIcon("P", "#ff6f7c"),
      cargo: buildIcon("C", "#9ee86f"),
      depth: buildIcon("D", "#d6c07f"),
      drill: buildIcon("⟂", "#f5f0e6"),
    },
  };

  cache.assets = assets;
  return assets;
}

export const assets = createAssets();

function buildDrill() {
  const canvas = makeCanvas(72, 72);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  glow(ctx, 36, 36, 24, "rgba(255, 180, 83, 0.18)");

  ctx.save();
  ctx.translate(36, 36);
  ctx.fillStyle = "#2a313b";
  ctx.beginPath();
  ctx.moveTo(-18, -14);
  ctx.lineTo(20, -2);
  ctx.lineTo(16, 16);
  ctx.lineTo(-20, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ccd5df";
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7ae0ff";
  ctx.fillRect(-7, -4, 6, 8);
  ctx.fillStyle = "#ffbf55";
  ctx.fillRect(2, -4, 6, 8);
  ctx.strokeStyle = "#ff9d4a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(26, 0);
  ctx.stroke();
  ctx.restore();
  return canvas;
}

function buildTerrainTile(base, shadow, highlight, crystal = false, voidy = false) {
  const canvas = makeCanvas(96, 96);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const body = ctx.createRadialGradient(48, 44, 14, 48, 48, 40);
  body.addColorStop(0, base);
  body.addColorStop(0.75, shadow);
  body.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = body;
  ctx.beginPath();
  polygon(ctx, 48, 48, crystal ? 8 : 7, crystal ? 34 : 36, crystal ? 0.2 : 0.16);
  ctx.fill();

  ctx.strokeStyle = highlight;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  polygon(ctx, 48, 48, crystal ? 8 : 7, crystal ? 34 : 36, crystal ? 0.2 : 0.16);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1.5;
  for (let index = 0; index < 4; index += 1) {
    ctx.beginPath();
    ctx.moveTo(16 + index * 14, 22 + index * 7);
    ctx.lineTo(78 - index * 10, 70 + index * 5);
    ctx.stroke();
  }

  for (let index = 0; index < 5; index += 1) {
    const x = 21 + index * 11;
    const y = 28 + (index % 3) * 12;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + index * 0.01})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 9 + (index % 2), 6 + ((index + 1) % 2), index * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (crystal) {
    ctx.fillStyle = "rgba(126, 232, 255, 0.3)";
    prism(ctx, 21, 56, 12, 28, "#c8fbff");
    prism(ctx, 38, 42, 16, 38, "#f5ffff");
    prism(ctx, 61, 50, 14, 30, "#a5f5ff");
  }

  if (voidy) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.arc(68, 28, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

function buildOre(base, shadow, highlight, crystal = false) {
  const canvas = makeCanvas(48, 48);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  glow(ctx, 24, 24, 17, `${base}55`);

  ctx.fillStyle = shadow;
  ctx.beginPath();
  polygon(ctx, 24, 24, crystal ? 8 : 7, crystal ? 16 : 15, crystal ? 0.24 : 0.1);
  ctx.fill();

  ctx.strokeStyle = highlight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  polygon(ctx, 24, 24, crystal ? 8 : 7, crystal ? 16 : 15, crystal ? 0.24 : 0.1);
  ctx.stroke();

  ctx.fillStyle = `${base}dd`;
  ctx.beginPath();
  ctx.moveTo(24, 8);
  ctx.lineTo(35, 18);
  ctx.lineTo(32, 33);
  ctx.lineTo(19, 39);
  ctx.lineTo(10, 26);
  ctx.lineTo(14, 13);
  ctx.closePath();
  ctx.fill();

  if (crystal) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, 27);
    ctx.lineTo(24, 10);
    ctx.lineTo(31, 28);
    ctx.stroke();
  }

  return canvas;
}

function buildParticles(base, shadow, sparks = false) {
  const canvas = makeCanvas(64, 64);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 7; index += 1) {
    const x = 10 + index * 7;
    const y = 10 + ((index * 11) % 18);
    const radius = sparks ? 2 + (index % 3) : 4 + (index % 2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, base);
    g.addColorStop(1, shadow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

function buildIcon(letter, color) {
  const canvas = makeCanvas(48, 48);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  glow(ctx, 24, 24, 18, `${color}44`);
  ctx.fillStyle = "rgba(4, 8, 12, 0.82)";
  ctx.beginPath();
  ctx.arc(24, 24, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '800 20px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, 24, 25);
  return canvas;
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function polygon(ctx, x, y, points, radius, wobble) {
  const step = (Math.PI * 2) / points;
  ctx.moveTo(x + Math.cos(0) * radius, y + Math.sin(0) * radius);
  for (let index = 1; index <= points; index += 1) {
    const angle = step * index;
    const r = radius * (1 - wobble + Math.sin(angle * 3) * wobble * 0.25);
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
}

function prism(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y);
  ctx.lineTo(x + w, y + h * 0.22);
  ctx.lineTo(x + w * 0.78, y + h);
  ctx.lineTo(x + w * 0.14, y + h * 0.82);
  ctx.lineTo(x, y + h * 0.24);
  ctx.closePath();
  ctx.fill();
}

function glow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
