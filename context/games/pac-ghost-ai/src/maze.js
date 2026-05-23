(() => {
const RAW_MAZE = [
  "###################",
  "#o........#......o#",
  "#.###.###.#.###.###",
  "#.#.....#.#.#.....#",
  "#.#.###.#.#.#.###.#",
  "#.................#",
  "#.###.#.#####.#.###",
  "#.....#...#...#...#",
  "#####.### # ###.###",
  "    #.#BINC.#.#    ",
  "#####.# ### #.#####",
  "#.......P.........#",
  "#.###.#.#####.#.###",
  "#o..#.#...#...#..o#",
  "###.#.###.#.###.#.#",
  "#.....#...#...#...#",
  "#.#####.#####.###.#",
  "#........#........#",
  "#.###.##.#.##.###.#",
  "#.....##...##.....#",
  "###################",
];

const TILE_SIZE = 32;
const MAZE_WIDTH = RAW_MAZE[0].length;
const MAZE_HEIGHT = RAW_MAZE.length;

function createMaze() {
  const tiles = [];
  const pellets = new Set();
  const powerPellets = new Set();
  const spawns = {};

  for (let y = 0; y < RAW_MAZE.length; y += 1) {
    const row = [];
    for (let x = 0; x < RAW_MAZE[y].length; x += 1) {
      const cell = RAW_MAZE[y][x];
      if ("PBINC".includes(cell)) {
        spawns[cell] = { x, y };
        row.push(" ");
      } else {
        row.push(cell);
      }

      if (cell === ".") {
        pellets.add(key(x, y));
      } else if (cell === "o") {
        powerPellets.add(key(x, y));
      }
    }
    tiles.push(row);
  }

  return {
    tiles,
    pellets,
    powerPellets,
    spawns: {
      player: spawns.P,
      blinky: spawns.B,
      pinky: spawns.I,
      inky: spawns.N,
      clyde: spawns.C,
    },
  };
}

function key(x, y) {
  return `${x},${y}`;
}

function isWall(tiles, x, y) {
  if (y < 0 || y >= tiles.length) {
    return true;
  }

  if (x < 0 || x >= tiles[0].length) {
    return false;
  }

  return tiles[y][x] === "#";
}

function wrapTileX(x) {
  if (x < 0) {
    return MAZE_WIDTH - 1;
  }

  if (x >= MAZE_WIDTH) {
    return 0;
  }

  return x;
}

window.PacGhostMaze = {
  createMaze,
  isWall,
  key,
  MAZE_HEIGHT,
  MAZE_WIDTH,
  TILE_SIZE,
  wrapTileX,
};
})();
