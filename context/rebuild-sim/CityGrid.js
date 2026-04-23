export const GAME_PHASES = Object.freeze({
  PLAYER_PLANNING: 'PLAYER_PLANNING',
  NIGHT_RESOLUTION: 'NIGHT_RESOLUTION',
  GAME_OVER: 'GAME_OVER'
});

const DEFAULT_WIDTH = 6;
const DEFAULT_HEIGHT = 5;
const MAX_TILE_WALL = 6;

const TILE_TYPES = [
  'residential',
  'commercial',
  'industrial',
  'park',
  'utility'
];

const TYPE_LABELS = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
  park: 'Park',
  utility: 'Utility'
};

const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const next = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, next));
};

const readConfigInt = (value, fallback, min, max) => {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }
  return clampInt(next, min, max);
};

const tileId = (x, y) => `tile-${x}-${y}`;

const typeFor = (x, y) => TILE_TYPES[(x * 3 + y * 2) % TILE_TYPES.length];

const labelFor = (type, x, y) => `${TYPE_LABELS[type] ?? 'Sector'} ${x + 1}:${y + 1}`;

const cloneTile = (tile) => ({
  id: tile.id,
  x: tile.x,
  y: tile.y,
  type: tile.type,
  label: tile.label,
  border: tile.border,
  dangerLevel: tile.dangerLevel,
  noise: tile.noise,
  wallHealth: tile.wallHealth,
  maxWallHealth: tile.maxWallHealth,
  assignment: tile.assignment,
  occupiedBy: tile.occupiedBy,
  destroyed: tile.destroyed
});

export class CityGrid {
  constructor(config = {}) {
    this.config = {
      width: readConfigInt(config.width, DEFAULT_WIDTH, 1, 12),
      height: readConfigInt(config.height, DEFAULT_HEIGHT, 1, 12),
      initialFood: readConfigInt(config.initialFood, 18, 0, 999),
      initialMaterials: readConfigInt(config.initialMaterials, 10, 0, 999),
      initialPower: readConfigInt(config.initialPower, 5, 0, 999),
      initialDay: readConfigInt(config.initialDay, 1, 1, 999)
    };

    this.state = this.createInitialState();
  }

  createInitialState() {
    const tiles = [];

    for (let y = 0; y < this.config.height; y += 1) {
      for (let x = 0; x < this.config.width; x += 1) {
        const border = this.isBorderTile(x, y);
        const type = typeFor(x, y);
        const baseDanger = border ? 5 + ((x + y) % 3) : 2 + ((x + y) % 3);
        const baseNoise = border ? 3 + (x % 2) : 1 + ((x + y) % 2);
        const baseWalls = border ? 4 : 3;

        tiles.push({
          id: tileId(x, y),
          x,
          y,
          type,
          label: labelFor(type, x, y),
          border,
          dangerLevel: clampInt(baseDanger, 0, 10),
          noise: clampInt(baseNoise, 0, 10),
          wallHealth: clampInt(baseWalls, 0, MAX_TILE_WALL),
          maxWallHealth: MAX_TILE_WALL,
          assignment: null,
          occupiedBy: null,
          destroyed: false
        });
      }
    }

    return {
      phase: GAME_PHASES.PLAYER_PLANNING,
      day: this.config.initialDay,
      resources: {
        food: this.config.initialFood,
        materials: this.config.initialMaterials,
        power: this.config.initialPower
      },
      tiles,
      metrics: this.#buildMetrics(tiles)
    };
  }

  getTile(x, y) {
    if (typeof x === 'string' && y === undefined) {
      return this.#tileById(x);
    }
    return this.state.tiles.find((tile) => tile.x === x && tile.y === y) ?? null;
  }

  getTiles() {
    return this.state.tiles.map(cloneTile);
  }

  isBorderTile(x, y) {
    return x === 0 || y === 0 || x === this.config.width - 1 || y === this.config.height - 1;
  }

  setSurvivorAssignment(survivorId, tileOrX, y) {
    if (this.state.phase !== GAME_PHASES.PLAYER_PLANNING) {
      return false;
    }

    let tile = null;
    if (typeof tileOrX === 'string' && y === undefined) {
      tile = this.#tileById(tileOrX);
    } else if (tileOrX && typeof tileOrX === 'object' && y === undefined) {
      tile = this.#tileById(tileOrX.id ?? tileOrX.tileId ?? '');
    } else {
      tile = this.getTile(tileOrX, y);
    }

    if (!tile || tile.destroyed) {
      return false;
    }

    for (const entry of this.state.tiles) {
      if (entry.assignment === survivorId) {
        entry.assignment = null;
        entry.occupiedBy = null;
      }
    }

    tile.assignment = survivorId;
    tile.occupiedBy = survivorId;
    this.#refreshMetrics();
    return true;
  }

  clearAssignments() {
    for (const tile of this.state.tiles) {
      tile.assignment = null;
      tile.occupiedBy = null;
    }
    this.#refreshMetrics();
  }

  beginNightResolution() {
    if (this.state.phase !== GAME_PHASES.GAME_OVER) {
      this.state.phase = GAME_PHASES.NIGHT_RESOLUTION;
    }
    return this.getSnapshot();
  }

  applyNightReport(report = {}) {
    const tileChanges = Array.isArray(report.tileChanges) ? report.tileChanges : [];

    for (const change of tileChanges) {
      const tile = this.#tileById(change.tileId ?? '');
      if (!tile) {
        continue;
      }

      if (Number.isFinite(change.wallHealthDelta)) {
        tile.wallHealth = clampInt(tile.wallHealth + change.wallHealthDelta, 0, tile.maxWallHealth);
      }
      if (Number.isFinite(change.wallDelta)) {
        tile.wallHealth = clampInt(tile.wallHealth + change.wallDelta, 0, tile.maxWallHealth);
      }
      if (Number.isFinite(change.dangerDelta)) {
        tile.dangerLevel = clampInt(tile.dangerLevel + change.dangerDelta, 0, 10);
      }
      if (Number.isFinite(change.noiseDelta)) {
        tile.noise = clampInt(tile.noise + change.noiseDelta, 0, 10);
      }
      if (change.destroyed === true || tile.wallHealth <= 0) {
        tile.destroyed = true;
        tile.assignment = null;
        tile.occupiedBy = null;
      }
    }

    const resourceDelta = report.resourceDelta ?? {};
    if (Number.isFinite(resourceDelta.food)) {
      this.state.resources.food = clampInt(this.state.resources.food + resourceDelta.food, 0, 999);
    }
    if (Number.isFinite(resourceDelta.materials)) {
      this.state.resources.materials = clampInt(this.state.resources.materials + resourceDelta.materials, 0, 999);
    }
    if (Number.isFinite(resourceDelta.power)) {
      this.state.resources.power = clampInt(this.state.resources.power + resourceDelta.power, 0, 999);
    }

    if (Number.isFinite(report.day)) {
      this.state.day = Math.max(this.state.day, clampInt(report.day, 1, 999));
    } else if (this.state.phase === GAME_PHASES.NIGHT_RESOLUTION) {
      this.state.day += 1;
    }

    this.clearAssignments();
    this.#refreshMetrics();

    if (report.gameOver || this.#isCollapsed()) {
      this.state.phase = GAME_PHASES.GAME_OVER;
    } else {
      this.state.phase = GAME_PHASES.PLAYER_PLANNING;
    }

    return this.getSnapshot();
  }

  getSnapshot() {
    this.#refreshMetrics();
    return {
      width: this.config.width,
      height: this.config.height,
      phase: this.state.phase,
      day: this.state.day,
      resources: { ...this.state.resources },
      food: this.state.resources.food,
      materials: this.state.resources.materials,
      power: this.state.resources.power,
      walls: this.state.metrics.integrity,
      danger: this.state.metrics.danger,
      noise: this.state.metrics.noise,
      assignments: this.state.metrics.assignments,
      destroyedTiles: this.state.metrics.destroyedTiles,
      survivors: this.state.metrics.assignments,
      gameOver: this.state.phase === GAME_PHASES.GAME_OVER,
      destroyed: this.#isCollapsed(),
      tiles: this.getTiles()
    };
  }

  getHudState() {
    const snapshot = this.getSnapshot();
    return {
      day: snapshot.day,
      phase: snapshot.phase,
      food: snapshot.food,
      materials: snapshot.materials,
      power: snapshot.power,
      walls: snapshot.walls,
      danger: snapshot.danger,
      noise: snapshot.noise,
      assignments: snapshot.assignments,
      destroyedTiles: snapshot.destroyedTiles,
      gameOver: snapshot.gameOver
    };
  }

  #tileById(id) {
    return this.state.tiles.find((tile) => tile.id === id) ?? null;
  }

  #buildMetrics(tiles) {
    return {
      integrity: tiles.reduce((sum, tile) => sum + tile.wallHealth, 0),
      danger: tiles.reduce((sum, tile) => sum + tile.dangerLevel, 0),
      noise: tiles.reduce((sum, tile) => sum + tile.noise, 0),
      assignments: tiles.filter((tile) => Boolean(tile.assignment)).length,
      destroyedTiles: tiles.filter((tile) => tile.destroyed).length
    };
  }

  #refreshMetrics() {
    this.state.metrics = this.#buildMetrics(this.state.tiles);
  }

  #isCollapsed() {
    return this.state.resources.food <= 0 || this.state.metrics.integrity <= 0;
  }
}
