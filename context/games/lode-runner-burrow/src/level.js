export const TILE = 32;
export const COLS = 24;
export const ROWS = 18;

const RAW_LEVEL = [
  "########################",
  "#..G....L.......G....E.#",
  "#..####..#####..####...#",
  "#..#..#......#....#....#",
  "#..#..#..##..#..#.#.##.#",
  "#..#..#..##..#..#.#.##.#",
  "#..#...P####....#.....#",
  "#..##########..#####...#",
  "#......G.....L........#",
  "#..###..####..####..##.#",
  "#..#....#..#..#..#....#",
  "#..#..###..#..#..###..#",
  "#..#..#....#..#....#..#",
  "#..#..#..#####..#..#..#",
  "#..#.....G.....#...G..#",
  "#..#########..#####...#",
  "#P...........L........P#",
  "########################",
];

const LEVEL = RAW_LEVEL.map((row) => row.padEnd(COLS, "#").slice(0, COLS));

export function createLevel() {
  const gold = [];
  const ladders = [];
  const escapeLadders = [];
  const pitSeeds = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const tile = LEVEL[y][x];
      if (tile === "G") gold.push({ x, y, collected: false });
      if (tile === "L") ladders.push({ x, y, revealed: true });
      if (tile === "E") escapeLadders.push({ x, y, revealed: false });
      if (tile === "P") pitSeeds.push({ x, y, duration: 2.5 });
    }
  }

  return {
    tileSize: TILE,
    cols: COLS,
    rows: ROWS,
    raw: LEVEL,
    spawn: { x: 2, y: 16 },
    enemySpawns: [
      { x: 18, y: 16, dir: -1 },
      { x: 15, y: 8, dir: 1 },
    ],
    exit: { x: 21, y: 1 },
    gold,
    ladders,
    escapeLadders,
    pitSeeds,
  };
}

export function getTileAt(level, x, y) {
  if (!level) return "#";
  if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) return "#";
  return level.raw[y]?.[x] ?? "#";
}

export function isSolidTile(tile) {
  return tile === "#";
}

export function isClimbableTile(tile) {
  return tile === "L" || tile === "E";
}
