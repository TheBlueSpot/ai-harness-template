const TILE_SIZE = 48;

function makeCell(x, y, kind) {
  return { x, y, kind };
}

export function parseLevel(definition = {}) {
  const rows = Array.isArray(definition.tiles) ? definition.tiles : [];
  const height = rows.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const solids = [];
  const hazards = [];
  const decorations = [];
  let spawn = definition.spawn ?? null;
  let goal = definition.goal ?? null;

  for (let y = 0; y < height; y += 1) {
    const row = rows[y] ?? "";
    for (let x = 0; x < width; x += 1) {
      const tile = row[x] ?? ".";
      if (tile === "#" || tile === "X") {
        solids.push(makeCell(x, y, tile));
      } else if (tile === "^" || tile === "!" || tile === "~") {
        hazards.push(makeCell(x, y, tile));
      } else if (tile === "G") {
        goal = goal ?? { x: x * TILE_SIZE + TILE_SIZE * 0.5, y: y * TILE_SIZE + TILE_SIZE * 0.5, radius: TILE_SIZE * 0.45 };
      } else if (tile === "S") {
        spawn = spawn ?? { x: x * TILE_SIZE + TILE_SIZE * 0.5, y: y * TILE_SIZE + TILE_SIZE * 0.5 };
      } else if (tile !== ".") {
        decorations.push(makeCell(x, y, tile));
      }
    }
  }

  return {
    id: definition.id ?? "level",
    name: definition.name ?? "Untitled",
    width,
    height,
    tileSize: TILE_SIZE,
    tiles: rows.map((row) => `${row}`),
    solids,
    hazards,
    decorations,
    spawn: spawn ?? { x: TILE_SIZE * 2, y: TILE_SIZE * 2 },
    goal: goal ?? { x: Math.max(1, width - 2) * TILE_SIZE + TILE_SIZE * 0.5, y: TILE_SIZE * 2, radius: TILE_SIZE * 0.45 },
    render: {
      tileSize: TILE_SIZE,
      width: width * TILE_SIZE,
      height: height * TILE_SIZE,
    },
  };
}
