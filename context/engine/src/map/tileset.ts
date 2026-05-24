export type TileId = number;
export type TilesetImage = CanvasImageSource;

export type TileSourceRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TileMetadataInput = {
  id?: TileId;
  name?: string;
  tags?: readonly string[];
  solid?: boolean;
  collision?: boolean;
  spawn?: string | boolean;
  source?: Partial<TileSourceRect>;
  metadata?: Record<string, unknown>;
};

export type TileDefinition = {
  id: TileId;
  name?: string;
  tags: readonly string[];
  solid: boolean;
  collision: boolean;
  spawn?: string | boolean;
  source: TileSourceRect;
  metadata?: Record<string, unknown>;
};

export type TilesetOptions = {
  image?: TilesetImage;
  imageUrl?: string;
  tileSize?: number;
  tileWidth?: number;
  tileHeight?: number;
  spacing?: number;
  margin?: number;
  columns?: number;
  rows?: number;
  tileCount?: number;
  tiles?: readonly TileMetadataInput[] | Record<number, TileMetadataInput>;
};

export type Tileset = {
  image?: TilesetImage;
  imageUrl?: string;
  tileWidth: number;
  tileHeight: number;
  spacing: number;
  margin: number;
  columns: number;
  rows?: number;
  tileCount: number;
  getTile(id: TileId): TileDefinition | undefined;
  requireTile(id: TileId): TileDefinition;
  hasTile(id: TileId): boolean;
  tiles(): TileDefinition[];
  tileIdsByTag(tag: string): TileId[];
};

function imageSize(image: TilesetImage | undefined) {
  if (!image) return { width: 0, height: 0 };
  if ("naturalWidth" in image && image.naturalWidth) return { width: image.naturalWidth, height: image.naturalHeight };
  if ("videoWidth" in image && image.videoWidth) return { width: image.videoWidth, height: image.videoHeight };
  if ("width" in image && "height" in image) return { width: Number(image.width) || 0, height: Number(image.height) || 0 };
  return { width: 0, height: 0 };
}

function toMetadataEntries(tiles: TilesetOptions["tiles"]) {
  if (!tiles) return [] as Array<[TileId, TileMetadataInput]>;
  if (Array.isArray(tiles)) {
    return tiles.map((tile, index) => [tile.id ?? index, tile]);
  }
  return Object.entries(tiles).map(([id, tile]) => [Number(id), { ...tile, id: tile.id ?? Number(id) }]);
}

function sourceFor(id: TileId, columns: number, tileWidth: number, tileHeight: number, spacing: number, margin: number): TileSourceRect {
  const columnCount = Math.max(1, columns);
  const column = id % columnCount;
  const row = Math.floor(id / columnCount);
  return {
    x: margin + column * (tileWidth + spacing),
    y: margin + row * (tileHeight + spacing),
    w: tileWidth,
    h: tileHeight
  };
}

export function createTileset(options: TilesetOptions): Tileset {
  const tileWidth = options.tileWidth ?? options.tileSize ?? 16;
  const tileHeight = options.tileHeight ?? options.tileSize ?? tileWidth;
  const spacing = options.spacing ?? 0;
  const margin = options.margin ?? 0;
  const size = imageSize(options.image);
  const inferredColumns = Math.max(1, Math.floor((size.width - margin * 2 + spacing) / (tileWidth + spacing)));
  const columns = Math.max(1, options.columns ?? inferredColumns);
  const inferredRows = size.height > 0 ? Math.max(1, Math.floor((size.height - margin * 2 + spacing) / (tileHeight + spacing))) : undefined;
  const metadataEntries = toMetadataEntries(options.tiles);
  const highestMetadataId = metadataEntries.reduce((highest, [id]) => Math.max(highest, id), -1);
  const rows = options.rows ?? inferredRows;
  const tileCount = Math.max(0, options.tileCount ?? (rows ? columns * rows : highestMetadataId + 1));
  const tiles = new Map<TileId, TileDefinition>();

  for (let id = 0; id < tileCount; id += 1) {
    tiles.set(id, {
      id,
      tags: [],
      solid: false,
      collision: false,
      source: sourceFor(id, columns, tileWidth, tileHeight, spacing, margin)
    });
  }

  for (const [id, metadata] of metadataEntries) {
    const base: TileDefinition = tiles.get(id) ?? {
      id,
      tags: [],
      solid: false,
      collision: false,
      source: sourceFor(id, columns, tileWidth, tileHeight, spacing, margin)
    };
    const source = metadata.source ?? {};
    tiles.set(id, {
      ...base,
      name: metadata.name ?? base.name,
      tags: metadata.tags ? [...metadata.tags] : base.tags,
      solid: metadata.solid ?? base.solid,
      collision: metadata.collision ?? metadata.solid ?? base.collision,
      spawn: metadata.spawn ?? base.spawn,
      metadata: metadata.metadata ?? base.metadata,
      source: {
        x: source.x ?? base.source.x,
        y: source.y ?? base.source.y,
        w: source.w ?? base.source.w,
        h: source.h ?? base.source.h
      }
    });
  }

  return {
    image: options.image,
    imageUrl: options.imageUrl,
    tileWidth,
    tileHeight,
    spacing,
    margin,
    columns,
    rows,
    tileCount: Math.max(tileCount, highestMetadataId + 1),
    getTile(id) {
      return tiles.get(id);
    },
    requireTile(id) {
      const tile = tiles.get(id);
      if (!tile) throw new Error(`Tile not found: ${id}`);
      return tile;
    },
    hasTile(id) {
      return tiles.has(id);
    },
    tiles() {
      return [...tiles.values()];
    },
    tileIdsByTag(tag) {
      return [...tiles.values()].filter((tile) => tile.tags.includes(tag)).map((tile) => tile.id);
    }
  };
}
