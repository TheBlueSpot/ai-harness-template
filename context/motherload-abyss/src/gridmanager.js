const DEFAULT_OPTIONS = {
  seed: 1,
  tileSize: 28,
  skyRows: 2
};

const CELL = Object.freeze({
  AIR: "air",
  SURFACE: "surface",
  DIRT: "dirt",
  ROCK: "rock",
  BASALT: "basalt",
  CAVE: "cave",
  ORE_COPPER: "copper",
  ORE_IRON: "iron",
  ORE_GOLD: "gold",
  ORE_CRYSTAL: "crystal"
});

const TILE_STYLES = {
  air: ["rgba(0,0,0,0)", "rgba(0,0,0,0)"],
  surface: ["#87b55b", "#5d7f35"],
  dirt: ["#6f4f2a", "#55381d"],
  rock: ["#70737c", "#4e5259"],
  basalt: ["#40464f", "#252a32"],
  cave: ["#2c3139", "#171b21"],
  copper: ["#9c6235", "#6f4022"],
  iron: ["#99a1ab", "#606772"],
  gold: ["#c7a44c", "#8c6b21"],
  crystal: ["#7ad1ff", "#295b85"]
};

const ORES = [
  { type: CELL.ORE_COPPER, minDepth: 2, weight: 0.55, value: 4, fuelBonus: 1.1, hardness: 1 },
  { type: CELL.ORE_IRON, minDepth: 6, weight: 0.28, value: 7, fuelBonus: 1.5, hardness: 2 },
  { type: CELL.ORE_GOLD, minDepth: 12, weight: 0.12, value: 12, fuelBonus: 2.3, hardness: 3 },
  { type: CELL.ORE_CRYSTAL, minDepth: 20, weight: 0.05, value: 19, fuelBonus: 3.4, hardness: 4 }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

export class GridManager {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.seed = this.#normalizeSeed(this.options.seed);
    this.tileSize = this.options.tileSize;
    this.cellSize = this.tileSize;
    this.tile = this.tileSize;
    this.rows = Number.POSITIVE_INFINITY;
    this.cols = Number.POSITIVE_INFINITY;
    this.surfaceY = 0;
    this.skyRows = Math.max(0, this.options.skyRows | 0);
    this.visiblePadding = 1;
    this.minedTiles = new Map();
    this.damage = new Map();
  }

  reset() {
    this.minedTiles.clear();
    this.damage.clear();
  }

  generate() {
    this.reset();
  }

  update() {}

  worldToCell(x, y) {
    return this.cellFromWorld(x, y);
  }

  cellAt(x, y) {
    return this.cellFromWorld(x, y);
  }

  cellAtPixel(x, y) {
    return this.cellFromWorld(x, y);
  }

  cellFromWorld(x, y) {
    return {
      col: Math.floor(x / this.tileSize),
      row: Math.floor(y / this.tileSize)
    };
  }

  worldFromCell(col, row) {
    return {
      x: col * this.tileSize,
      y: row * this.tileSize
    };
  }

  centerOf(col, row) {
    return {
      x: col * this.tileSize + this.tileSize * 0.5,
      y: row * this.tileSize + this.tileSize * 0.5
    };
  }

  depthOf(row) {
    return clamp((Math.max(0, row) / 40) * 100, 0, 100);
  }

  pressureAt(row) {
    const depth = Math.max(0, row);
    const depthPressure = Math.pow(depth / 28, 1.55);
    const bandPressure = smoothstep(4, 18, depth) * 0.18;
    return clamp(depthPressure * 0.82 + bandPressure, 0, 1);
  }

  samplePressure(x, y) {
    const { col, row } = this.cellFromWorld(x, y);
    const tile = this.getTileAtCell(col, row);
    const basePressure = this.pressureAt(row);
    if (!tile.solid) {
      return clamp(basePressure * 0.45, 0, 1);
    }
    return clamp(basePressure + clamp((tile.hardness - 1) * 0.02, 0, 0.18), 0, 1);
  }

  mineCircle(x, y, radius) {
    const minCol = Math.floor((x - radius) / this.tileSize) - this.visiblePadding;
    const maxCol = Math.floor((x + radius) / this.tileSize) + this.visiblePadding;
    const minRow = Math.floor((y - radius) / this.tileSize) - this.visiblePadding;
    const maxRow = Math.floor((y + radius) / this.tileSize) + this.visiblePadding;
    const changes = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const center = this.centerOf(col, row);
        if (Math.hypot(center.x - x, center.y - y) > radius + this.tileSize * 0.35) {
          continue;
        }
        const result = this.mineTile(col, row, 1);
        if (!result.mined) {
          continue;
        }
        const ore = result.oreValue > 0 ? { id: result.type, value: result.oreValue } : null;
        changes.push({ col, row, ore });
      }
    }

    return changes;
  }

  collectOre(changes) {
    let value = 0;
    for (const change of changes) {
      if (change?.ore) {
        value += change.ore.value ?? 0;
      }
    }
    return value;
  }

  mineTile(x, y, power = 1) {
    const col = x | 0;
    const row = y | 0;
    const key = this.#key(col, row);
    const tile = this.getTile(col, row);

    if (!tile.solid) {
      this.damage.delete(key);
      return {
        mined: false,
        oreValue: 0,
        fuelBonus: 0,
        hardness: tile.hardness,
        type: tile.type
      };
    }

    const appliedPower = Math.max(0, power);
    if (appliedPower <= 0) {
      return {
        mined: false,
        oreValue: 0,
        fuelBonus: 0,
        hardness: tile.hardness,
        type: tile.type
      };
    }

    const progress = (this.damage.get(key) ?? 0) + appliedPower;
    if (progress < tile.hardness) {
      this.damage.set(key, progress);
      return {
        mined: false,
        oreValue: 0,
        fuelBonus: 0,
        hardness: tile.hardness,
        type: tile.type
      };
    }

    this.damage.delete(key);
    this.minedTiles.set(key, {
      type: tile.type,
      oreValue: tile.oreValue,
      fuelBonus: tile.fuelBonus
    });

    return {
      mined: true,
      oreValue: tile.oreValue,
      fuelBonus: tile.fuelBonus,
      hardness: tile.hardness,
      type: tile.type
    };
  }

  isSolid(x, y) {
    return this.getTile(x, y).solid;
  }

  getCell(col, row) {
    return this.getTile(col, row);
  }

  getTile(x, y) {
    return this.getTileAtCell(x | 0, y | 0);
  }

  forEachVisible(camera = {}, canvas, callback) {
    if (typeof callback !== "function") {
      return;
    }

    const viewWidth = canvas?.width ?? camera.width ?? camera.w ?? 0;
    const viewHeight = canvas?.height ?? camera.height ?? camera.h ?? 0;
    const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
    const mode = this.#cameraMode(camera);

    if (mode === "centered") {
      const centerX = Number.isFinite(camera.x) ? camera.x : 0;
      const centerY = Number.isFinite(camera.y) ? camera.y : 0;
      const halfW = viewWidth / (2 * zoom);
      const halfH = viewHeight / (2 * zoom);
      const minCol = Math.floor((centerX - halfW) / this.tileSize) - this.visiblePadding;
      const maxCol = Math.floor((centerX + halfW) / this.tileSize) + this.visiblePadding;
      const minRow = Math.floor((centerY - halfH) / this.tileSize) - this.visiblePadding;
      const maxRow = Math.floor((centerY + halfH) / this.tileSize) + this.visiblePadding;
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const tile = this.getTile(col, row);
          const world = this.worldFromCell(col, row);
          callback(
            tile,
            (world.x - centerX) * zoom + viewWidth * 0.5,
            (world.y - centerY) * zoom + viewHeight * 0.5,
            col,
            row
          );
        }
      }
      return;
    }

    const offsetX = typeof camera === "number" ? 0 : Number.isFinite(camera.x) ? camera.x : 0;
    const offsetY = typeof camera === "number" ? camera : Number.isFinite(camera.y) ? camera.y : 0;
    const minCol = Math.floor((0 - offsetX) / this.tileSize) - this.visiblePadding;
    const maxCol = Math.floor((viewWidth - offsetX) / this.tileSize) + this.visiblePadding;
    const minRow = Math.floor((0 - offsetY) / this.tileSize) - this.visiblePadding;
    const maxRow = Math.floor((viewHeight - offsetY) / this.tileSize) + this.visiblePadding;

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const tile = this.getTile(col, row);
        const world = this.worldFromCell(col, row);
        callback(tile, (world.x - offsetX) * zoom, (world.y - offsetY) * zoom, col, row);
      }
    }
  }

  draw(ctx, cameraOrAssets = {}, maybeAssetsOrCameraY = {}, maybeViewportHeight) {
    if (!ctx) {
      return;
    }

    const { camera, assets, viewportHeight } = this.#resolveDrawArgs(
      ctx,
      cameraOrAssets,
      maybeAssetsOrCameraY,
      maybeViewportHeight
    );
    const canvas = ctx.canvas ?? { width: 0, height: viewportHeight ?? 0 };
    const size = this.tileSize * (typeof camera === "number" ? 1 : camera.zoom ?? 1);

    this.forEachVisible(camera, canvas, (tile, screenX, screenY) => {
      this.#drawTile(ctx, tile, screenX, screenY, size, assets);
    });
  }

  recalculateExposure() {}

  getTileAtCell(col, row) {
    const key = this.#key(col, row);
    if (this.minedTiles.has(key)) {
      const mined = this.minedTiles.get(key);
      return {
        col,
        row,
        x: col * this.tileSize,
        y: row * this.tileSize,
        type: CELL.AIR,
        solid: false,
        hardness: 0,
        oreValue: 0,
        fuelBonus: 0,
        exposed: true,
        mined: true,
        ore: mined?.type ? { id: mined.type, value: mined.oreValue } : null,
        color: TILE_STYLES.air
      };
    }

    if (row < -this.skyRows) {
      return this.#makeTile(col, row, CELL.AIR, {
        solid: false,
        hardness: 0,
        oreValue: 0,
        fuelBonus: 0,
        exposed: true
      });
    }

    if (row < 0) {
      return this.#makeTile(col, row, CELL.AIR, {
        solid: false,
        hardness: 0,
        oreValue: 0,
        fuelBonus: 0,
        exposed: true
      });
    }

    if (row === 0) {
      return this.#makeTile(col, row, CELL.SURFACE, {
        solid: true,
        hardness: 1,
        oreValue: 0,
        fuelBonus: 0,
        exposed: false
      });
    }

    return this.#generateUnderground(col, row);
  }

  #generateUnderground(col, row) {
    const depth = row;
    const band = depth <= 3 ? CELL.DIRT : depth <= 10 ? CELL.ROCK : CELL.BASALT;
    const caveNoise = this.#noise(col, row, 17);
    const veinNoise = this.#noise(col, row, 31);
    const oreNoise = this.#noise(col, row, 53);
    const caveChance = lerp(0.08, 0.32, smoothstep(4, 30, depth));
    if (depth > 2 && caveNoise < caveChance) {
      return this.#makeTile(col, row, CELL.CAVE, {
        solid: false,
        hardness: 0,
        oreValue: 0,
        fuelBonus: 0,
        exposed: caveNoise > 0.55
      });
    }

    const ore = this.#pickOre(depth, oreNoise);
    if (ore) {
      return this.#makeTile(col, row, ore.type, {
        solid: true,
        hardness: this.#hardnessForDepth(depth, band) + ore.hardness,
        oreValue: ore.value,
        fuelBonus: ore.fuelBonus,
        ore: true,
        exposed: veinNoise > 0.72
      });
    }

    return this.#makeTile(col, row, band, {
      solid: true,
      hardness: this.#hardnessForDepth(depth, band),
      oreValue: 0,
      fuelBonus: 0,
      exposed: veinNoise > 0.76
    });
  }

  #pickOre(depth, roll) {
    const candidates = ORES.filter((ore) => depth >= ore.minDepth);
    if (!candidates.length) {
      return null;
    }

    const rarity = clamp(0.04 + depth * 0.0055, 0.04, 0.24);
    if (roll > rarity) {
      return null;
    }

    let total = 0;
    const weighted = [];
    for (const ore of candidates) {
      const depthBoost = 1 + smoothstep(ore.minDepth, ore.minDepth + 14, depth) * 1.6;
      const weight = ore.weight * depthBoost;
      total += weight;
      weighted.push({ ore, weight });
    }

    let cursor = this.#noise(depth, Math.floor(roll * 1000), 71) * total;
    for (const entry of weighted) {
      cursor -= entry.weight;
      if (cursor <= 0) {
        return entry.ore;
      }
    }

    return weighted[weighted.length - 1].ore;
  }

  #hardnessForDepth(depth, band) {
    const pressureFactor = 1 + Math.floor(depth / 6);
    if (band === CELL.DIRT) {
      return 1 + Math.floor(depth / 8);
    }
    if (band === CELL.ROCK) {
      return 2 + pressureFactor;
    }
    if (band === CELL.BASALT) {
      return 4 + pressureFactor * 2;
    }
    return 1;
  }

  #makeTile(col, row, type, extra = {}) {
    const color = TILE_STYLES[type] ?? TILE_STYLES.rock;
    return {
      col,
      row,
      x: col * this.tileSize,
      y: row * this.tileSize,
      type,
      solid: Boolean(extra.solid),
      hardness: extra.hardness ?? 0,
      oreValue: extra.oreValue ?? 0,
      fuelBonus: extra.fuelBonus ?? 0,
      exposed: Boolean(extra.exposed),
      mined: Boolean(extra.mined),
      ore: extra.ore ?? null,
      color
    };
  }

  #drawTile(ctx, tile, screenX, screenY, size, assets) {
    if (tile.type === CELL.AIR) {
      return;
    }

    const palette = tile.color ?? TILE_STYLES[tile.type] ?? TILE_STYLES.rock;
    const [dark, light] = palette;
    const drawSize = size;
    const spriteSheet = assets?.tiles;

    ctx.save();
    ctx.translate(screenX, screenY);

    if (spriteSheet) {
      ctx.drawImage(spriteSheet, 0, 0, 96, 96, 0, 0, drawSize, drawSize);
    } else {
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, drawSize, drawSize);
      const gloss = ctx.createLinearGradient(0, 0, drawSize, drawSize);
      gloss.addColorStop(0, "rgba(255,255,255,0.12)");
      gloss.addColorStop(0.5, "rgba(255,255,255,0)");
      gloss.addColorStop(1, "rgba(0,0,0,0.22)");
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, drawSize, drawSize);
      ctx.fillStyle = dark;
      ctx.fillRect(drawSize * 0.08, drawSize * 0.08, drawSize * 0.84, drawSize * 0.84);
    }

    if (tile.type === CELL.SURFACE) {
      ctx.fillStyle = "rgba(116, 180, 81, 0.94)";
      ctx.fillRect(0, 0, drawSize, Math.max(3, drawSize * 0.2));
    }

    if (tile.oreValue > 0) {
      const oreCanvas =
        tile.type === CELL.ORE_COPPER ? assets?.oreCopper :
        tile.type === CELL.ORE_IRON ? assets?.oreIron :
        tile.type === CELL.ORE_GOLD ? assets?.oreVoid ?? assets?.oreIron :
        tile.type === CELL.ORE_CRYSTAL ? assets?.oreVoid :
        null;
      if (oreCanvas) {
        ctx.drawImage(oreCanvas, drawSize * 0.05, drawSize * 0.05, drawSize * 0.9, drawSize * 0.9);
      } else {
        ctx.fillStyle = "rgba(255, 236, 179, 0.88)";
        ctx.beginPath();
        ctx.arc(drawSize * 0.38, drawSize * 0.36, Math.max(2, drawSize * 0.09), 0, Math.PI * 2);
        ctx.arc(drawSize * 0.64, drawSize * 0.6, Math.max(2, drawSize * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (tile.exposed) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, 0, drawSize, drawSize);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = Math.max(1, drawSize * 0.04);
    ctx.strokeRect(0, 0, drawSize, drawSize);
    ctx.restore();
  }

  #resolveDrawArgs(ctx, cameraOrAssets, maybeAssetsOrCameraY, maybeViewportHeight) {
    if (typeof cameraOrAssets === "number") {
      return {
        camera: cameraOrAssets,
        assets: maybeAssetsOrCameraY && typeof maybeAssetsOrCameraY === "object" ? maybeAssetsOrCameraY : {},
        viewportHeight: maybeViewportHeight ?? ctx.canvas?.height ?? 0
      };
    }

    if (cameraOrAssets && typeof cameraOrAssets === "object") {
      if (Number.isFinite(cameraOrAssets.x) || Number.isFinite(cameraOrAssets.y) || Number.isFinite(cameraOrAssets.zoom)) {
        return {
          camera: {
            x: Number.isFinite(cameraOrAssets.x) ? cameraOrAssets.x : 0,
            y: Number.isFinite(cameraOrAssets.y) ? cameraOrAssets.y : 0,
            zoom: Number.isFinite(cameraOrAssets.zoom) && cameraOrAssets.zoom > 0 ? cameraOrAssets.zoom : 1
          },
          assets: maybeAssetsOrCameraY && typeof maybeAssetsOrCameraY === "object" ? maybeAssetsOrCameraY : {},
          viewportHeight: maybeViewportHeight ?? ctx.canvas?.height ?? 0
        };
      }

      return {
        camera: Number.isFinite(maybeAssetsOrCameraY) ? maybeAssetsOrCameraY : 0,
        assets: cameraOrAssets,
        viewportHeight: maybeViewportHeight ?? ctx.canvas?.height ?? 0
      };
    }

    return {
      camera: 0,
      assets: {},
      viewportHeight: maybeViewportHeight ?? ctx.canvas?.height ?? 0
    };
  }

  #cameraMode(camera) {
    if (typeof camera === "number") {
      return "offset";
    }
    if (camera && typeof camera === "object" && Number.isFinite(camera.x)) {
      return "centered";
    }
    return "offset";
  }

  #noise(x, y, salt = 0) {
    let h = this.seed ^ Math.imul(0x9e3779b1, salt | 0);
    h ^= Math.imul(x | 0, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
    h ^= Math.imul(y | 0, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15), 0x165667b1);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  #normalizeSeed(seed) {
    if (typeof seed === "number" && Number.isFinite(seed)) {
      return seed | 0;
    }

    const text = String(seed ?? "0");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash | 0;
  }

  #key(col, row) {
    return `${col},${row}`;
  }
}

GridManager.CELL = CELL;
