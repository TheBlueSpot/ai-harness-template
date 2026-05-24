import { expect, test } from "bun:test";
import { createTileset, extractCollisionRects, generateTileMap, getTileAt, seededRandom, tileToWorld, worldToTile } from "./index.ts";

test("tileset metadata drives source rects and tag lookup", () => {
  const tileset = createTileset({
    tileSize: 16,
    columns: 4,
    tileCount: 8,
    tiles: {
      5: { name: "reef", tags: ["solid", "reef"], solid: true }
    }
  });

  expect(tileset.requireTile(5).source).toEqual({ x: 16, y: 16, w: 16, h: 16 });
  expect(tileset.requireTile(5).collision).toBe(true);
  expect(tileset.tileIdsByTag("reef")).toEqual([5]);
});

test("generated maps are seeded and expose tile/world queries", () => {
  const tileset = createTileset({
    tileSize: 8,
    columns: 4,
    tileCount: 4,
    tiles: {
      0: { tags: ["floor"] },
      1: { tags: ["wall", "solid"], solid: true },
      2: { tags: ["hazard"] },
      3: { tags: ["spawn"] }
    }
  });
  const options = {
    tileset,
    width: 8,
    height: 8,
    baseTile: 1,
    seed: "same-route",
    rules: [
      { type: "path" as const, tile: 0, from: { x: 4, y: 7 }, to: { x: 4, y: 0 }, width: 3 },
      { type: "marker" as const, markerType: "spawn", tile: 3, count: 2, avoidTags: ["solid"] }
    ]
  };

  const first = generateTileMap(options);
  const second = generateTileMap(options);

  expect(first.layers[0].tiles).toEqual(second.layers[0].tiles);
  expect(first.markers).toEqual(second.markers);
  expect(worldToTile(first, 18, 26)).toEqual({ x: 2, y: 3 });
  expect(tileToWorld(first, 2, 3, "center")).toEqual({ x: 20, y: 28 });
  expect(getTileAt(first, -1, 0)).toBeUndefined();
});

test("collision extraction merges tagged tile runs into world rects", () => {
  const tileset = createTileset({
    tileSize: 16,
    columns: 2,
    tileCount: 2,
    tiles: {
      1: { tags: ["solid"], collision: true }
    }
  });
  const map = generateTileMap({
    tileset,
    width: 4,
    height: 3,
    baseTile: null,
    rules: [
      { type: "border", tile: 1, thickness: 1 }
    ]
  });

  expect(extractCollisionRects(map, { tags: ["solid"] })).toEqual([
    { x: 0, y: 0, w: 64, h: 16 },
    { x: 0, y: 16, w: 16, h: 16 },
    { x: 48, y: 16, w: 16, h: 16 },
    { x: 0, y: 32, w: 64, h: 16 }
  ]);
});

test("seeded random is stable for repeatable asset generation", () => {
  const left = seededRandom("asset-seed");
  const right = seededRandom("asset-seed");

  expect([left(), left(), left()]).toEqual([right(), right(), right()]);
});
