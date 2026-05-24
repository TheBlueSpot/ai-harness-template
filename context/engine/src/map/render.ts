import { getDrawContext } from "../canvas/drawing.ts";
import type { RectLike } from "../math/collision.ts";
import type { TileLayer, TileMap } from "./tile-map.ts";
import type { TilesetImage } from "./tileset.ts";

export type RenderTileLayerOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  layer?: number | string | TileLayer;
  image?: TilesetImage;
  viewport?: RectLike;
  alpha?: number;
  scale?: number;
};

export type RenderTileLayerResult = {
  drawn: number;
  skipped: number;
};

function resolveLayer(map: TileMap, layer: RenderTileLayerOptions["layer"]) {
  if (!layer) return map.getLayer(0);
  if (typeof layer === "object") return layer;
  return map.getLayer(layer);
}

export function renderTileLayer(map: TileMap, options: RenderTileLayerOptions = {}): RenderTileLayerResult {
  const layer = resolveLayer(map, options.layer);
  const image = options.image ?? map.tileset.image;
  if (!layer || !layer.visible || !image) return { drawn: 0, skipped: layer ? layer.tiles.length : 0 };

  const ctx = getDrawContext(options);
  const scale = options.scale ?? 1;
  const viewport = options.viewport;
  const minX = viewport ? Math.max(0, Math.floor((viewport.x - layer.offsetX) / map.tileWidth) - 1) : 0;
  const minY = viewport ? Math.max(0, Math.floor((viewport.y - layer.offsetY) / map.tileHeight) - 1) : 0;
  const maxX = viewport ? Math.min(layer.width - 1, Math.ceil((viewport.x + viewport.w - layer.offsetX) / map.tileWidth) + 1) : layer.width - 1;
  const maxY = viewport ? Math.min(layer.height - 1, Math.ceil((viewport.y + viewport.h - layer.offsetY) / map.tileHeight) + 1) : layer.height - 1;
  let drawn = 0;
  let skipped = 0;

  ctx.save();
  ctx.globalAlpha *= layer.opacity * (options.alpha ?? 1);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cell = map.getTileAt(x, y, layer.id);
      if (!cell?.tile) {
        skipped += 1;
        continue;
      }
      const source = cell.tile.source;
      ctx.drawImage(
        image,
        source.x,
        source.y,
        source.w,
        source.h,
        layer.offsetX + x * map.tileWidth * scale,
        layer.offsetY + y * map.tileHeight * scale,
        map.tileWidth * scale,
        map.tileHeight * scale
      );
      drawn += 1;
    }
  }
  ctx.restore();

  return { drawn, skipped };
}
