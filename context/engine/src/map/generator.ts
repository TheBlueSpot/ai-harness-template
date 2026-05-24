import { createTileMap, type TileLayerSpec, type TileMap, type TileMapMarker, type TileValue } from "./tile-map.ts";
import type { Tileset } from "./tileset.ts";

export type SeededRandom = () => number;

type Point = { x: number; y: number };

export type TileMapGeneratorRule =
  | { type: "fill"; layer?: string; tile?: TileValue; tag?: string }
  | { type: "border"; layer?: string; tile?: TileValue; tag?: string; thickness?: number }
  | { type: "noise"; layer?: string; tile?: TileValue; tag?: string; chance: number; emptyTile?: TileValue }
  | { type: "scatter"; layer?: string; tile?: TileValue; tag?: string; count?: number; chance?: number; avoidTags?: readonly string[] }
  | { type: "path"; layer?: string; tile?: TileValue; tag?: string; from?: Point; to?: Point; width?: number; turnChance?: number }
  | { type: "marker"; markerType: string; layer?: string; tile?: TileValue; tag?: string; count?: number; avoidTags?: readonly string[] };

export type GenerateTileMapOptions = {
  tileset: Tileset;
  width: number;
  height: number;
  tileSize?: number;
  tileWidth?: number;
  tileHeight?: number;
  seed?: number | string;
  baseTile?: TileValue;
  layers?: readonly TileLayerSpec[];
  rules?: readonly TileMapGeneratorRule[];
  markers?: readonly TileMapMarker[];
  outOfBoundsTile?: TileValue;
  metadata?: Record<string, unknown>;
};

function hashSeed(seed: number | string | undefined) {
  if (seed === undefined) return 0xdecafbad;
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: number | string = 0xdecafbad): SeededRandom {
  let value = hashSeed(seed);
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function choice<T>(items: readonly T[], rng: SeededRandom) {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length) % items.length];
}

function resolveTile(tileset: Tileset, rng: SeededRandom, tile: TileValue | undefined, tag: string | undefined): TileValue {
  if (tile !== undefined) return tile;
  if (!tag) return null;
  return choice(tileset.tileIdsByTag(tag), rng) ?? null;
}

function hasAvoidedTag(tileset: Tileset, tileId: TileValue, avoidTags: readonly string[] | undefined) {
  if (tileId === null || !avoidTags || avoidTags.length === 0) return false;
  const tile = tileset.getTile(tileId);
  return tile ? avoidTags.some((tag) => tile.tags.includes(tag)) : false;
}

function indexOf(x: number, y: number, width: number) {
  return y * width + x;
}

function setBrush(tiles: TileValue[], width: number, height: number, x: number, y: number, radius: number, tile: TileValue) {
  for (let ty = y - radius; ty <= y + radius; ty += 1) {
    for (let tx = x - radius; tx <= x + radius; tx += 1) {
      if (tx >= 0 && ty >= 0 && tx < width && ty < height) tiles[indexOf(tx, ty, width)] = tile;
    }
  }
}

export function generateTileMap(options: GenerateTileMapOptions): TileMap {
  const rng = seededRandom(options.seed);
  const baseTile = options.baseTile ?? null;
  const initialLayerSpecs = options.layers?.length
    ? options.layers
    : [{ id: "ground", name: "ground", tiles: new Array<TileValue>(options.width * options.height).fill(baseTile) }];
  const initialMap = createTileMap({
    tileset: options.tileset,
    width: options.width,
    height: options.height,
    tileSize: options.tileSize,
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight,
    layers: initialLayerSpecs,
    markers: options.markers,
    outOfBoundsTile: options.outOfBoundsTile,
    metadata: options.metadata
  });
  const mutableLayers = new Map<string, TileValue[]>();
  const markers: TileMapMarker[] = options.markers ? [...options.markers] : [];

  for (const layer of initialMap.layers) {
    mutableLayers.set(layer.id, [...layer.tiles]);
  }

  const firstLayerId = initialMap.layers[0]?.id ?? "ground";
  const getLayerTiles = (id = firstLayerId) => mutableLayers.get(id) ?? mutableLayers.get(firstLayerId);

  for (const rule of options.rules ?? []) {
    const tiles = getLayerTiles(rule.layer);
    if (!tiles) continue;
    const tile = resolveTile(options.tileset, rng, "tile" in rule ? rule.tile : undefined, "tag" in rule ? rule.tag : undefined);

    if (rule.type === "fill") {
      tiles.fill(tile);
    } else if (rule.type === "border") {
      const thickness = Math.max(1, rule.thickness ?? 1);
      for (let y = 0; y < options.height; y += 1) {
        for (let x = 0; x < options.width; x += 1) {
          if (x < thickness || y < thickness || x >= options.width - thickness || y >= options.height - thickness) {
            tiles[indexOf(x, y, options.width)] = tile;
          }
        }
      }
    } else if (rule.type === "noise") {
      for (let i = 0; i < tiles.length; i += 1) tiles[i] = rng() < rule.chance ? tile : rule.emptyTile ?? tiles[i] ?? null;
    } else if (rule.type === "scatter") {
      const count = rule.count ?? Math.round(options.width * options.height * (rule.chance ?? 0.05));
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 20) {
        attempts += 1;
        const x = Math.floor(rng() * options.width);
        const y = Math.floor(rng() * options.height);
        const index = indexOf(x, y, options.width);
        if (hasAvoidedTag(options.tileset, tiles[index], rule.avoidTags)) continue;
        tiles[index] = tile;
        placed += 1;
      }
    } else if (rule.type === "path") {
      const from = rule.from ?? { x: Math.floor(options.width * 0.5), y: options.height - 1 };
      const to = rule.to ?? { x: Math.floor(options.width * 0.5), y: 0 };
      const radius = Math.max(0, Math.floor((rule.width ?? 1) * 0.5));
      let x = from.x;
      let y = from.y;
      let favorX = Math.abs(to.x - x) > Math.abs(to.y - y);
      while (x !== to.x || y !== to.y) {
        setBrush(tiles, options.width, options.height, x, y, radius, tile);
        if (rng() < (rule.turnChance ?? 0.28)) favorX = !favorX;
        if ((favorX && x !== to.x) || y === to.y) x += Math.sign(to.x - x);
        else y += Math.sign(to.y - y);
      }
      setBrush(tiles, options.width, options.height, to.x, to.y, radius, tile);
    } else if (rule.type === "marker") {
      const count = rule.count ?? 1;
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 30) {
        attempts += 1;
        const x = Math.floor(rng() * options.width);
        const y = Math.floor(rng() * options.height);
        if (hasAvoidedTag(options.tileset, tiles[indexOf(x, y, options.width)], rule.avoidTags)) continue;
        if (tile !== null) tiles[indexOf(x, y, options.width)] = tile;
        markers.push({
          type: rule.markerType,
          tileX: x,
          tileY: y,
          x: x * (options.tileWidth ?? options.tileSize ?? options.tileset.tileWidth) + (options.tileWidth ?? options.tileSize ?? options.tileset.tileWidth) * 0.5,
          y: y * (options.tileHeight ?? options.tileSize ?? options.tileset.tileHeight) + (options.tileHeight ?? options.tileSize ?? options.tileset.tileHeight) * 0.5,
          layer: rule.layer ?? firstLayerId
        });
        placed += 1;
      }
    }
  }

  return createTileMap({
    tileset: options.tileset,
    width: options.width,
    height: options.height,
    tileSize: options.tileSize,
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight,
    layers: initialMap.layers.map((layer) => ({
      ...layer,
      tiles: mutableLayers.get(layer.id) ?? []
    })),
    markers,
    outOfBoundsTile: options.outOfBoundsTile,
    metadata: options.metadata
  });
}
