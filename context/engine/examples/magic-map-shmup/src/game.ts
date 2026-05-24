import {
  clamp,
  createCamera,
  createKeyboardActions,
  createTileMap,
  createTileset,
  drawCircle,
  drawLine,
  drawRect,
  drawSpriteSlice,
  drawText,
  extractCollisionRects,
  generateTileMap,
  getTileAt,
  init,
  rayIntersectMap,
  rectsOverlap,
  registerSprite,
  renderTileLayer,
  seededRandom,
  setDrawContext,
  tileToWorld,
  vecNormalize,
  worldToTile
} from "../../../browser/engine.js";

type RectLike = { x: number; y: number; w: number; h: number };
type RayBox = RectLike;
type MarkerKind = "player" | "enemy" | "objective" | "gate";
type MapMarker = { type: MarkerKind; x: number; y: number; tileX?: number; tileY?: number };
type MissionMap = {
  image: HTMLImageElement;
  map: ReturnType<typeof generateTileMap>;
  markers: MapMarker[];
  solidBoxes: RayBox[];
  hazardBoxes: RectLike[];
};
type Bullet = { x: number; y: number; vx: number; vy: number; r: number; life: number; hostile?: boolean };
type Enemy = { x: number; y: number; w: number; h: number; hp: number; phase: number; fire: number };
type Player = { x: number; y: number; w: number; h: number; hp: number; fire: number; invuln: number };
type Objective = { x: number; y: number; r: number; taken: boolean };

const VIEW_W = 960;
const VIEW_H = 540;
const TILE = 32;
const SHEET_TILE = 16;
const TILESET_URL = "../../../assets/img/kenney-pixel-shmup/Tilemap/tiles_packed.png";

const VOID_FRAMES = [10, 11, 12, 13, 20, 21];
const WALL_FRAMES = [41, 42, 43, 51, 52, 53, 61, 62, 63];
const REEF_FRAMES = [44, 45, 46, 54, 55, 56, 64, 65, 66];
const HAZARD_FRAMES = [7, 8, 17, 18];
const OBJECTIVE_FRAMES = [31, 32, 33, 34];
const SPAWN_FRAME = 30;
const GATE_FRAME = 9;

const TILE_METADATA = [
  ...VOID_FRAMES.map((id) => ({ id, tags: ["void"] })),
  ...WALL_FRAMES.map((id) => ({ id, tags: ["wall", "solid"], solid: true, collision: true })),
  ...REEF_FRAMES.map((id) => ({ id, tags: ["reef", "solid"], solid: true, collision: true })),
  ...HAZARD_FRAMES.map((id) => ({ id, tags: ["hazard"] })),
  ...OBJECTIVE_FRAMES.map((id) => ({ id, tags: ["objective"] })),
  { id: SPAWN_FRAME, tags: ["spawn"] },
  { id: GATE_FRAME, tags: ["gate", "objective"] }
];

function pick<T>(list: readonly T[], rng: () => number) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function hasTag(tile: { tags?: readonly string[] } | undefined, tag: string) {
  return tile?.tags?.includes(tag) ?? false;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

function buildMissionMap(image: HTMLImageElement, seed = "magic-map-shmup"): MissionMap {
  const rng = seededRandom(seed);
  const width = 30;
  const height = 92;
  const tileset = createTileset({
    image,
    tileSize: SHEET_TILE,
    tiles: TILE_METADATA
  });
  const generated = generateTileMap({
    tileset,
    width,
    height,
    tileWidth: TILE,
    tileHeight: TILE,
    baseTile: pick(WALL_FRAMES, rng),
    outOfBoundsTile: WALL_FRAMES[0],
    rules: [
      { type: "path", tag: "void", from: { x: Math.floor(width * 0.5), y: height - 6 }, to: { x: Math.floor(width * 0.5), y: 3 }, width: 13, turnChance: 0.34 },
      { type: "scatter", tag: "reef", count: 86, avoidTags: ["solid"] },
      { type: "scatter", tag: "hazard", count: 46, avoidTags: ["solid"] },
      { type: "marker", markerType: "enemy", count: 15, avoidTags: ["solid", "hazard"] },
      { type: "marker", markerType: "objective", tag: "objective", count: 7, avoidTags: ["solid", "hazard"] }
    ]
  });
  const ground = generated.getLayer("ground") ?? generated.layers[0];
  const tiles = [...ground.tiles];

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tileset.getTile(tiles[index]);
    if (hasTag(tile, "void")) tiles[index] = pick(VOID_FRAMES, rng);
    else if (hasTag(tile, "wall")) tiles[index] = pick(WALL_FRAMES, rng);
    else if (hasTag(tile, "reef")) tiles[index] = pick(REEF_FRAMES, rng);
    else if (hasTag(tile, "hazard")) tiles[index] = pick(HAZARD_FRAMES, rng);
    else if (hasTag(tile, "objective")) tiles[index] = pick(OBJECTIVE_FRAMES, rng);
  }

  const spawnTile = { x: Math.floor(width * 0.5), y: height - 7 };
  const gateTile = { x: Math.floor(width * 0.5), y: 3 };

  function setTile(x: number, y: number, tile: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    tiles[y * width + x] = tile;
  }

  function carve(centerX: number, centerY: number, radius: number, centerTile: number) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) setTile(x, y, pick(VOID_FRAMES, rng));
    }
    setTile(centerX, centerY, centerTile);
  }

  carve(spawnTile.x, spawnTile.y, 3, SPAWN_FRAME);
  carve(gateTile.x, gateTile.y, 3, GATE_FRAME);

  const spawn = tileToWorld(generated, spawnTile.x, spawnTile.y, "center");
  const gate = tileToWorld(generated, gateTile.x, gateTile.y, "center");
  const markers = generated.markers
    .filter((marker) => marker.type === "enemy" || marker.type === "objective")
    .filter((marker) => Math.hypot(marker.x - spawn.x, marker.y - spawn.y) > 300)
    .map((marker) => ({ type: marker.type as MarkerKind, x: marker.x, y: marker.y, tileX: marker.tileX, tileY: marker.tileY }));
  markers.push({ type: "player", x: spawn.x, y: spawn.y, tileX: spawnTile.x, tileY: spawnTile.y });
  markers.push({ type: "gate", x: gate.x, y: gate.y, tileX: gateTile.x, tileY: gateTile.y });

  const map = createTileMap({
    tileset,
    width,
    height,
    tileWidth: TILE,
    tileHeight: TILE,
    layers: [{ ...ground, tiles }],
    markers,
    outOfBoundsTile: WALL_FRAMES[0],
    metadata: { seed }
  });

  return {
    image,
    map,
    markers,
    solidBoxes: extractCollisionRects(map, { layer: "ground", tags: ["solid"] }),
    hazardBoxes: extractCollisionRects(map, { layer: "ground", tags: ["hazard"], merge: false })
  };
}

function rectOf(entity: { x: number; y: number; w: number; h: number }): RectLike {
  return { x: entity.x - entity.w * 0.5, y: entity.y - entity.h * 0.5, w: entity.w, h: entity.h };
}

function queryMapRect(mission: MissionMap, rect: RectLike, predicate: (tags: readonly string[]) => boolean) {
  const min = worldToTile(mission.map, rect.x, rect.y);
  const max = worldToTile(mission.map, rect.x + rect.w - 1, rect.y + rect.h - 1);
  for (let y = min.y; y <= max.y; y += 1) {
    for (let x = min.x; x <= max.x; x += 1) {
      const cell = getTileAt(mission.map, x, y, "ground");
      if (cell?.tile && predicate(cell.tile.tags)) return true;
    }
  }
  return false;
}

export async function createMagicMapShmup(parent: HTMLElement) {
  const image = await loadImage(TILESET_URL);
  registerSprite("magic-map-tiles", image);

  let game: ReturnType<typeof createSession>;
  const keyboard = createKeyboardActions({
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    Space: "fire",
    KeyR: "retry",
    KeyH: "help"
  });

  const app = init({
    width: VIEW_W,
    height: VIEW_H,
    parent,
    background: "#08111d",
    update(dt: number) {
      if (keyboard.consume("retry")) game = createSession(game.mission);
      if (keyboard.consume("help")) game.showHelp = !game.showHelp;
      game.update(dt, keyboard);
      keyboard.update();
    },
    render(_dt: number, t: number) {
      setDrawContext(app.ctx as CanvasRenderingContext2D);
      game.render(app.ctx as CanvasRenderingContext2D, t);
    }
  });

  game = createSession(buildMissionMap(image));
}

function createSession(mission: MissionMap) {
  const map = mission.map;
  const start = mission.markers.find((marker) => marker.type === "player") ?? { x: map.pixelWidth * 0.5, y: map.pixelHeight - TILE * 6 };
  const player: Player = { x: start.x, y: start.y, w: 26, h: 30, hp: 3, fire: 0, invuln: 1.2 };
  const camera = createCamera({
    viewportWidth: VIEW_W,
    viewportHeight: VIEW_H,
    bounds: { x: 0, y: 0, w: map.pixelWidth, h: map.pixelHeight },
    follow: player,
    deadzoneX: 160,
    deadzoneY: 180,
    smoothing: 0.22
  });
  camera.centerOn(player);

  const enemies = mission.markers
    .filter((marker) => marker.type === "enemy")
    .map<Enemy>((marker, index) => ({ x: marker.x, y: marker.y, w: 30, h: 26, hp: 2, phase: index * 1.7, fire: 0.6 + (index % 3) * 0.25 }));
  const objectives = mission.markers
    .filter((marker) => marker.type === "objective")
    .map<Objective>((marker) => ({ x: marker.x, y: marker.y, r: 13, taken: false }));
  const gate = mission.markers.find((marker) => marker.type === "gate") ?? { type: "gate", x: map.pixelWidth * 0.5, y: TILE * 3 };
  const bullets: Bullet[] = [];
  const sparks: Bullet[] = [];
  let scroll = 52;
  let state: "playing" | "won" | "lost" = "playing";
  let showHelp = true;

  function canMove(rect: RectLike) {
    return !queryMapRect(mission, rect, (tags) => tags.includes("solid"));
  }

  function damagePlayer() {
    if (player.invuln > 0 || state !== "playing") return;
    player.hp -= 1;
    player.invuln = 1.4;
    if (player.hp <= 0) state = "lost";
  }

  function update(dt: number, keyboard: ReturnType<typeof createKeyboardActions>) {
    if (state !== "playing") return;

    scroll = clamp(scroll + dt * 3.5, 0, 120);
    const dx = (keyboard.down("right") ? 1 : 0) - (keyboard.down("left") ? 1 : 0);
    const dy = (keyboard.down("down") ? 1 : 0) - (keyboard.down("up") ? 1 : 0);
    const move = vecNormalize(dx, dy);
    const speed = 250;
    const nextX = clamp(player.x + move.x * speed * dt, TILE, map.pixelWidth - TILE);
    const nextY = clamp(player.y + move.y * speed * dt - scroll * dt, TILE, map.pixelHeight - TILE);

    const xRect = rectOf({ ...player, x: nextX });
    if (canMove(xRect)) player.x = nextX;
    const yRect = rectOf({ ...player, y: nextY });
    if (canMove(yRect)) player.y = nextY;

    player.fire = Math.max(0, player.fire - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    if ((keyboard.down("fire") || keyboard.pressed("fire")) && player.fire <= 0) {
      bullets.push({ x: player.x, y: player.y - 24, vx: 0, vy: -520, r: 4, life: 1.3 });
      player.fire = 0.14;
    }

    const playerRect = rectOf(player);
    if (queryMapRect(mission, playerRect, (tags) => tags.includes("hazard"))) damagePlayer();

    for (const objective of objectives) {
      if (!objective.taken && Math.hypot(objective.x - player.x, objective.y - player.y) < objective.r + 18) {
        objective.taken = true;
        sparks.push({ x: objective.x, y: objective.y, vx: 0, vy: 0, r: 30, life: 0.3 });
      }
    }

    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      enemy.phase += dt;
      enemy.x += Math.sin(enemy.phase * 2.2) * 40 * dt;
      enemy.fire -= dt;
      if (enemy.fire <= 0 && !rayIntersectMap(enemy.x, enemy.y, player.x, player.y, mission.solidBoxes)) {
        const aim = vecNormalize(player.x - enemy.x, player.y - enemy.y);
        bullets.push({ x: enemy.x, y: enemy.y + 16, vx: aim.x * 180, vy: aim.y * 180, r: 5, life: 3, hostile: true });
        enemy.fire = 1.2;
      }
      if (rectsOverlap(playerRect, rectOf(enemy))) damagePlayer();
    }

    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      const bulletRect = { x: bullet.x - bullet.r, y: bullet.y - bullet.r, w: bullet.r * 2, h: bullet.r * 2 };
      if (queryMapRect(mission, bulletRect, (tags) => tags.includes("solid"))) bullet.life = 0;
      if (bullet.hostile) {
        if (rectsOverlap(bulletRect, playerRect)) {
          bullet.life = 0;
          damagePlayer();
        }
      } else {
        for (const enemy of enemies) {
          if (enemy.hp > 0 && rectsOverlap(bulletRect, rectOf(enemy))) {
            enemy.hp -= 1;
            bullet.life = 0;
            sparks.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, r: 22, life: 0.18 });
            break;
          }
        }
      }
    }

    for (const spark of sparks) spark.life -= dt;
    for (let i = bullets.length - 1; i >= 0; i -= 1) if (bullets[i].life <= 0) bullets.splice(i, 1);
    for (let i = sparks.length - 1; i >= 0; i -= 1) if (sparks[i].life <= 0) sparks.splice(i, 1);

    if (objectives.every((objective) => objective.taken) && Math.hypot(player.x - gate.x, player.y - gate.y) < 48) state = "won";

    camera.follow(player, { deadzoneX: 160, deadzoneY: 180, smoothing: 0.18 });
    camera.update();
  }

  function render(ctx: CanvasRenderingContext2D, time: number) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawStarfield(ctx, camera, time);
    camera.apply(ctx, () => {
      renderMap(mission, camera, time);
      renderObjectives(objectives, gate, time);
      renderEnemies(enemies, time);
      renderBullets(bullets);
      renderPlayer(player, time);
      renderSparks(sparks, time);
    });
    renderHud(player, objectives, state, showHelp);
  }

  return {
    mission,
    update,
    render,
    get showHelp() {
      return showHelp;
    },
    set showHelp(value: boolean) {
      showHelp = value;
    }
  };
}

function renderMap(mission: MissionMap, camera: ReturnType<typeof createCamera>, time: number) {
  const visible = camera.visibleRect();
  renderTileLayer(mission.map, { viewport: visible });

  for (const rect of mission.hazardBoxes) {
    if (!rectsOverlap(rect, visible)) continue;
    const pulse = 0.72 + Math.sin(time * 8 + rect.x * 0.03 + rect.y * 0.02) * 0.18;
    drawRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, { fill: `rgba(239, 68, 68, ${0.2 * pulse})`, stroke: "#ff8a6b", lineWidth: 2 });
  }
}

function renderObjectives(objectives: Objective[], gate: MapMarker, time: number) {
  for (const objective of objectives) {
    if (objective.taken) continue;
    const pulse = 1 + Math.sin(time * 5 + objective.x) * 0.08;
    drawCircle(objective.x, objective.y, objective.r * 1.8 * pulse, { stroke: "#ffe082", lineWidth: 2, alpha: 0.5 });
    drawSpriteSlice("magic-map-tiles", objective.x - 16, objective.y - 16, OBJECTIVE_FRAMES[Math.floor(time * 8) % OBJECTIVE_FRAMES.length], {
      frameWidth: SHEET_TILE,
      frameHeight: SHEET_TILE,
      width: 32,
      height: 32
    });
  }
  drawCircle(gate.x, gate.y, 32 + Math.sin(time * 4) * 4, { stroke: "#8ef7ff", lineWidth: 4, alpha: 0.85 });
  drawSpriteSlice("magic-map-tiles", gate.x - 16, gate.y - 16, GATE_FRAME, { frameWidth: SHEET_TILE, frameHeight: SHEET_TILE, width: 32, height: 32 });
}

function renderPlayer(player: Player, time: number) {
  const blink = player.invuln > 0 && Math.floor(time * 18) % 2 === 0;
  if (blink) return;
  drawLine(player.x, player.y - 18, player.x - 15, player.y + 17, { stroke: "#b5f3ff", lineWidth: 4, cap: "round" });
  drawLine(player.x, player.y - 18, player.x + 15, player.y + 17, { stroke: "#b5f3ff", lineWidth: 4, cap: "round" });
  drawCircle(player.x, player.y + 4, 10, { fill: "#1d4ed8", stroke: "#e0fbff", lineWidth: 3 });
  drawCircle(player.x, player.y + 21, 5 + Math.sin(time * 20) * 2, { fill: "#facc15", alpha: 0.9 });
}

function renderEnemies(enemies: Enemy[], time: number) {
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    drawCircle(enemy.x, enemy.y, 18, { fill: "#781c2e", stroke: "#ff9ab0", lineWidth: 3 });
    drawLine(enemy.x - 17, enemy.y, enemy.x + 17, enemy.y, { stroke: "#ffd6df", lineWidth: 3, cap: "round" });
    drawCircle(enemy.x, enemy.y + 8 + Math.sin(time * 8 + enemy.phase) * 2, 5, { fill: "#ff4d6d" });
  }
}

function renderBullets(bullets: Bullet[]) {
  for (const bullet of bullets) {
    drawCircle(bullet.x, bullet.y, bullet.r + 2, { fill: bullet.hostile ? "#ff5370" : "#7dd3fc", alpha: 0.45 });
    drawCircle(bullet.x, bullet.y, bullet.r, { fill: bullet.hostile ? "#ffd1dc" : "#ecfeff" });
  }
}

function renderSparks(sparks: Bullet[], time: number) {
  for (const spark of sparks) {
    drawCircle(spark.x, spark.y, spark.r * spark.life * 4, { stroke: "#fef08a", lineWidth: 3, alpha: clamp(spark.life * 4, 0, 1) });
    drawCircle(spark.x + Math.sin(time * 20) * 8, spark.y, 4, { fill: "#fbbf24", alpha: clamp(spark.life * 5, 0, 1) });
  }
}

function drawStarfield(ctx: CanvasRenderingContext2D, camera: ReturnType<typeof createCamera>, time: number) {
  const visible = camera.visibleRect();
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  gradient.addColorStop(0, "#07101f");
  gradient.addColorStop(0.52, "#0c1830");
  gradient.addColorStop(1, "#101622");
  drawRect(0, 0, VIEW_W, VIEW_H, { fill: gradient });

  for (let i = 0; i < 120; i += 1) {
    const wx = (i * 157) % 960;
    const wy = (i * 307 + visible.y * (0.18 + (i % 4) * 0.05) + time * 10) % VIEW_H;
    const size = i % 7 === 0 ? 2 : 1;
    ctx.fillStyle = i % 5 === 0 ? "#96f2ff" : "#d7e6ff";
    ctx.globalAlpha = i % 3 === 0 ? 0.55 : 0.28;
    ctx.fillRect(wx, wy, size, size);
  }
  ctx.globalAlpha = 1;
}

function renderHud(player: Player, objectives: Objective[], state: "playing" | "won" | "lost", showHelp: boolean) {
  const collected = objectives.filter((objective) => objective.taken).length;
  drawRect(0, 0, VIEW_W, 54, { fill: "rgba(3, 9, 20, 0.72)" });
  drawText(`HP ${player.hp}`, 24, 33, { fill: "#f8fafc", size: 20, weight: 800, align: "left" });
  drawText(`Charts ${collected}/${objectives.length}`, 132, 33, { fill: "#f8fafc", size: 20, weight: 800, align: "left" });
  drawText("Collect charts, clear gate", VIEW_W * 0.5, 33, { fill: "#b5f3ff", size: 18, weight: 700, align: "center" });
  drawText("WASD/Arrows Move  Space Fire  R Retry  H Help", VIEW_W - 24, 33, { fill: "#dbeafe", size: 16, align: "right" });

  if (showHelp && state === "playing") {
    drawRect(18, VIEW_H - 62, VIEW_W - 36, 42, { fill: "rgba(8, 17, 29, 0.78)", stroke: "rgba(181, 243, 255, 0.42)", lineWidth: 1 });
    drawText("Tile tags build the route: walls block, red glyphs burn, charts unlock the gate.", VIEW_W * 0.5, VIEW_H - 36, {
      fill: "#e0fbff",
      size: 16,
      weight: 700,
      align: "center"
    });
  }

  if (state !== "playing") {
    drawRect(0, 0, VIEW_W, VIEW_H, { fill: "rgba(2, 6, 16, 0.68)" });
    drawText(state === "won" ? "Gate cleared" : "Ship lost", VIEW_W * 0.5, VIEW_H * 0.5 - 20, {
      fill: "#f8fafc",
      size: 44,
      weight: 900,
      align: "center"
    });
    drawText("Press R for instant retry", VIEW_W * 0.5, VIEW_H * 0.5 + 34, { fill: "#b5f3ff", size: 22, weight: 800, align: "center" });
  }
}
