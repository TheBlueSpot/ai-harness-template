import type { RectLike } from "../math/collision.ts";
import type { TileMap } from "./tile-map.ts";
import type { TileDefinition } from "./tileset.ts";

export type TileCollisionPredicate = (tile: TileDefinition, x: number, y: number, layer: string) => boolean;

export type CollisionExtractionOptions = {
  layer?: number | string;
  tags?: readonly string[];
  predicate?: TileCollisionPredicate;
  merge?: boolean;
};

function defaultCollision(tile: TileDefinition, tags: readonly string[]) {
  return tile.collision || tile.solid || tags.some((tag) => tile.tags.includes(tag));
}

function mergeRows(rects: RectLike[]) {
  const merged: RectLike[] = [];
  for (const rect of rects) {
    const existing = merged.find((candidate) => candidate.x === rect.x && candidate.w === rect.w && candidate.y + candidate.h === rect.y);
    if (existing) existing.h += rect.h;
    else merged.push({ ...rect });
  }
  return merged;
}

export function extractCollisionRects(map: TileMap, options: CollisionExtractionOptions = {}) {
  const layer = map.getLayer(options.layer ?? 0);
  if (!layer) return [];
  const tags = options.tags ?? ["solid"];
  const rects: RectLike[] = [];

  for (let y = 0; y < layer.height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= layer.width; x += 1) {
      const cell = x < layer.width ? map.getTileAt(x, y, layer.id) : undefined;
      const collides = cell?.tile
        ? options.predicate?.(cell.tile, x, y, layer.id) ?? defaultCollision(cell.tile, tags)
        : false;
      if (collides && runStart < 0) runStart = x;
      if ((!collides || x === layer.width) && runStart >= 0) {
        rects.push({
          x: runStart * map.tileWidth + layer.offsetX,
          y: y * map.tileHeight + layer.offsetY,
          w: (x - runStart) * map.tileWidth,
          h: map.tileHeight
        });
        runStart = -1;
      }
    }
  }

  return options.merge === false ? rects : mergeRows(rects);
}
