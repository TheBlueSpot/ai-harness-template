import type { TileDefinition, TileId, Tileset } from "./tileset.ts";

export type TileValue = TileId | null;
export type CompactTileRow = string | readonly TileValue[];
export type CompactTileLegend = Record<string, TileValue>;
export type TileAnchor = "top-left" | "center";

export type TileMapMarker = {
  type: string;
  x: number;
  y: number;
  tileX?: number;
  tileY?: number;
  layer?: string;
  metadata?: Record<string, unknown>;
};

export type TileLayerSpec = {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  tiles?: readonly TileValue[] | readonly CompactTileRow[] | string;
  data?: readonly TileValue[] | readonly CompactTileRow[] | string;
  legend?: CompactTileLegend;
  visible?: boolean;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  parallaxX?: number;
  parallaxY?: number;
  metadata?: Record<string, unknown>;
};

export type TileLayer = {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: readonly TileValue[];
  visible: boolean;
  opacity: number;
  offsetX: number;
  offsetY: number;
  parallaxX: number;
  parallaxY: number;
  metadata?: Record<string, unknown>;
};

export type TileMapCell = {
  x: number;
  y: number;
  index: number;
  tileId: TileValue;
  tile?: TileDefinition;
  layer: TileLayer;
};

export type TileMapOptions = {
  tileset: Tileset;
  width: number;
  height: number;
  tileSize?: number;
  tileWidth?: number;
  tileHeight?: number;
  layers: readonly TileLayerSpec[];
  markers?: readonly TileMapMarker[];
  outOfBoundsTile?: TileValue;
  metadata?: Record<string, unknown>;
};

export type TileMap = {
  tileset: Tileset;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  layers: readonly TileLayer[];
  markers: readonly TileMapMarker[];
  outOfBoundsTile: TileValue;
  metadata?: Record<string, unknown>;
  getLayer(layer?: number | string): TileLayer | undefined;
  getTileAt(x: number, y: number, layer?: number | string): TileMapCell | undefined;
  worldToTile(x: number, y: number): { x: number; y: number };
  tileToWorld(x: number, y: number, anchor?: TileAnchor): { x: number; y: number };
};

function decodeToken(token: string, legend?: CompactTileLegend): TileValue {
  if (legend && token in legend) return legend[token];
  if (token === "." || token === "_" || token === "-") return null;
  const value = Number.parseInt(token, 10);
  return Number.isFinite(value) ? value : null;
}

function parseRows(rows: readonly CompactTileRow[], width: number, height: number, legend?: CompactTileLegend) {
  const tiles: TileValue[] = [];
  for (const row of rows) {
    if (typeof row === "string") {
      const trimmed = row.trim();
      const tokens = trimmed.includes(" ") ? trimmed.split(/\s+/) : [...trimmed];
      for (const token of tokens) tiles.push(decodeToken(token, legend));
    } else {
      tiles.push(...row);
    }
  }
  return normalizeTileCount(tiles, width, height);
}

function normalizeTileCount(tiles: readonly TileValue[], width: number, height: number) {
  const expected = width * height;
  if (tiles.length === expected) return [...tiles];
  const normalized = new Array<TileValue>(expected).fill(null);
  for (let i = 0; i < Math.min(expected, tiles.length); i += 1) normalized[i] = tiles[i] ?? null;
  return normalized;
}

function normalizeTiles(spec: TileLayerSpec, width: number, height: number) {
  const data = spec.tiles ?? spec.data ?? [];
  if (typeof data === "string") {
    return parseRows(data.split(/\r?\n/).filter((row) => row.trim().length > 0), width, height, spec.legend);
  }
  if (Array.isArray(data) && data.some((entry) => typeof entry === "string" || Array.isArray(entry))) {
    return parseRows(data as readonly CompactTileRow[], width, height, spec.legend);
  }
  return normalizeTileCount(data as readonly TileValue[], width, height);
}

function layerId(spec: TileLayerSpec, index: number) {
  return spec.id ?? spec.name ?? `layer-${index}`;
}

export function createTileMap(options: TileMapOptions): TileMap {
  const tileWidth = options.tileWidth ?? options.tileSize ?? options.tileset.tileWidth;
  const tileHeight = options.tileHeight ?? options.tileSize ?? options.tileset.tileHeight;
  const layers = options.layers.map<TileLayer>((layer, index) => {
    const width = layer.width ?? options.width;
    const height = layer.height ?? options.height;
    const id = layerId(layer, index);
    return {
      id,
      name: layer.name ?? id,
      width,
      height,
      tiles: normalizeTiles(layer, width, height),
      visible: layer.visible ?? true,
      opacity: layer.opacity ?? 1,
      offsetX: layer.offsetX ?? 0,
      offsetY: layer.offsetY ?? 0,
      parallaxX: layer.parallaxX ?? 1,
      parallaxY: layer.parallaxY ?? 1,
      metadata: layer.metadata
    };
  });

  const map: TileMap = {
    tileset: options.tileset,
    width: options.width,
    height: options.height,
    tileWidth,
    tileHeight,
    pixelWidth: options.width * tileWidth,
    pixelHeight: options.height * tileHeight,
    layers,
    markers: options.markers ? [...options.markers] : [],
    outOfBoundsTile: options.outOfBoundsTile ?? null,
    metadata: options.metadata,
    getLayer(layer = 0) {
      return typeof layer === "number" ? layers[layer] : layers.find((candidate) => candidate.id === layer || candidate.name === layer);
    },
    getTileAt(x, y, layer = 0) {
      return getTileAt(map, x, y, layer);
    },
    worldToTile(x, y) {
      return worldToTile(map, x, y);
    },
    tileToWorld(x, y, anchor = "top-left") {
      return tileToWorld(map, x, y, anchor);
    }
  };

  return map;
}

export function getTileAt(map: TileMap, x: number, y: number, layer: number | string = 0): TileMapCell | undefined {
  const targetLayer = map.getLayer(layer);
  if (!targetLayer) return undefined;
  if (x < 0 || y < 0 || x >= targetLayer.width || y >= targetLayer.height) {
    if (map.outOfBoundsTile === null) return undefined;
    return {
      x,
      y,
      index: -1,
      tileId: map.outOfBoundsTile,
      tile: map.outOfBoundsTile === null ? undefined : map.tileset.getTile(map.outOfBoundsTile),
      layer: targetLayer
    };
  }
  const index = y * targetLayer.width + x;
  const tileId = targetLayer.tiles[index] ?? null;
  return {
    x,
    y,
    index,
    tileId,
    tile: tileId === null ? undefined : map.tileset.getTile(tileId),
    layer: targetLayer
  };
}

export function worldToTile(map: TileMap, x: number, y: number) {
  return {
    x: Math.floor(x / map.tileWidth),
    y: Math.floor(y / map.tileHeight)
  };
}

export function tileToWorld(map: TileMap, x: number, y: number, anchor: TileAnchor = "top-left") {
  const offsetX = anchor === "center" ? map.tileWidth * 0.5 : 0;
  const offsetY = anchor === "center" ? map.tileHeight * 0.5 : 0;
  return {
    x: x * map.tileWidth + offsetX,
    y: y * map.tileHeight + offsetY
  };
}
