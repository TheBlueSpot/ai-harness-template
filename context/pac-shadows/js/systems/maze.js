import { DEFAULT_CONFIG } from "../config.js";

export const DEFAULT_LAYOUT = DEFAULT_CONFIG.maze.layout;

export const createMaze = (layout = DEFAULT_LAYOUT, tileSize = DEFAULT_CONFIG.maze.tileSize) => {
  const rows = normalizeLayout(layout);
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const openCells = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (rows[row][col] !== "#") {
        openCells.push({ row, col });
      }
    }
  }

  const maze = {
    rows,
    tileSize,
    width: width * tileSize,
    height: height * tileSize,
    openCells,
    isInsideCell(col, row) {
      return row >= 0 && row < height && col >= 0 && col < width;
    },
    isWalkableCell(col, row) {
      return this.isInsideCell(col, row) && rows[row][col] !== "#";
    },
    getTile(col, row) {
      return rows[row]?.[col] ?? "#";
    },
    cellFromWorld(x, y) {
      return {
        col: Math.floor(x / tileSize),
        row: Math.floor(y / tileSize)
      };
    },
    centerOfCell(col, row) {
      return {
        x: (col + 0.5) * tileSize,
        y: (row + 0.5) * tileSize,
        col,
        row
      };
    },
    worldToCellCenter(x, y) {
      const { col, row } = this.cellFromWorld(x, y);
      return this.centerOfCell(col, row);
    },
    isWallAtPixel(x, y) {
      const { col, row } = this.cellFromWorld(x, y);
      return !this.isWalkableCell(col, row);
    },
    collideCircle(x, y, radius) {
      if (x < 0 || y < 0 || x > this.width || y > this.height) {
        return { col: -1, row: -1, left: 0, top: 0, right: 0, bottom: 0 };
      }

      const minCol = Math.max(0, Math.floor((x - radius) / tileSize));
      const maxCol = Math.min(width - 1, Math.floor((x + radius) / tileSize));
      const minRow = Math.max(0, Math.floor((y - radius) / tileSize));
      const maxRow = Math.min(height - 1, Math.floor((y + radius) / tileSize));

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          if (rows[row][col] !== "#") {
            continue;
          }

          const left = col * tileSize;
          const top = row * tileSize;
          const right = left + tileSize;
          const bottom = top + tileSize;
          const closestX = Math.max(left, Math.min(x, right));
          const closestY = Math.max(top, Math.min(y, bottom));
          const dx = x - closestX;
          const dy = y - closestY;

          if (dx * dx + dy * dy < radius * radius) {
            return { col, row, left, top, right, bottom };
          }
        }
      }

      return null;
    },
    getOpenCells() {
      return openCells.map((cell) => ({ ...cell }));
    },
    randomOpenCell(filter = null) {
      const matches = filter ? openCells.filter((cell) => filter(cell)) : openCells;
      if (!matches.length) {
        return null;
      }
      const cell = matches[(Math.random() * matches.length) | 0];
      return { ...cell };
    },
    neighbors(cell) {
      return [
        { col: cell.col + 1, row: cell.row },
        { col: cell.col - 1, row: cell.row },
        { col: cell.col, row: cell.row + 1 },
        { col: cell.col, row: cell.row - 1 }
      ].filter((candidate) => this.isWalkableCell(candidate.col, candidate.row));
    },
    findPath(start, goal) {
      if (!this.isWalkableCell(start.col, start.row) || !this.isWalkableCell(goal.col, goal.row)) {
        return [];
      }

      const startKey = keyOf(start);
      const goalKey = keyOf(goal);
      const queue = [start];
      const cameFrom = new Map([[startKey, null]]);

      while (queue.length > 0) {
        const current = queue.shift();
        const currentKey = keyOf(current);
        if (currentKey === goalKey) {
          break;
        }

        for (const next of this.neighbors(current)) {
          const nextKey = keyOf(next);
          if (cameFrom.has(nextKey)) {
            continue;
          }
          cameFrom.set(nextKey, current);
          queue.push(next);
        }
      }

      if (!cameFrom.has(goalKey)) {
        return [];
      }

      const path = [];
      let cursor = goal;
      while (cursor) {
        path.push({ col: cursor.col, row: cursor.row });
        cursor = cameFrom.get(keyOf(cursor));
      }
      path.reverse();
      return path;
    },
    castRay(x, y, angle, maxDistance = Infinity) {
      const rayDirX = Math.cos(angle);
      const rayDirY = Math.sin(angle);
      if (Math.abs(rayDirX) < 1e-8 && Math.abs(rayDirY) < 1e-8) {
        return { x, y, distance: 0, hit: false, cell: this.cellFromWorld(x, y), side: 0 };
      }

      let mapX = Math.floor(x / tileSize);
      let mapY = Math.floor(y / tileSize);
      const stepX = rayDirX < 0 ? -1 : 1;
      const stepY = rayDirY < 0 ? -1 : 1;
      const deltaDistX = Math.abs(rayDirX) < 1e-8 ? Number.POSITIVE_INFINITY : tileSize / Math.abs(rayDirX);
      const deltaDistY = Math.abs(rayDirY) < 1e-8 ? Number.POSITIVE_INFINITY : tileSize / Math.abs(rayDirY);
      let sideDistX = deltaDistX;
      let sideDistY = deltaDistY;

      if (rayDirX < 0) {
        sideDistX = ((x - mapX * tileSize) / Math.abs(rayDirX));
      } else if (rayDirX > 0) {
        sideDistX = (((mapX + 1) * tileSize - x) / Math.abs(rayDirX));
      }

      if (rayDirY < 0) {
        sideDistY = ((y - mapY * tileSize) / Math.abs(rayDirY));
      } else if (rayDirY > 0) {
        sideDistY = (((mapY + 1) * tileSize - y) / Math.abs(rayDirY));
      }

      let distance = 0;
      let hit = false;
      let side = 0;
      let safety = width * height * 4;

      while (safety > 0 && distance <= maxDistance) {
        safety -= 1;
        if (sideDistX < sideDistY) {
          mapX += stepX;
          distance = sideDistX;
          sideDistX += deltaDistX;
          side = 0;
        } else {
          mapY += stepY;
          distance = sideDistY;
          sideDistY += deltaDistY;
          side = 1;
        }

        if (distance > maxDistance) {
          break;
        }

        if (!this.isInsideCell(mapX, mapY) || rows[mapY][mapX] === "#") {
          hit = true;
          break;
        }
      }

      const clampedDistance = Math.min(distance, maxDistance);
      return {
        x: x + rayDirX * clampedDistance,
        y: y + rayDirY * clampedDistance,
        distance: clampedDistance,
        hit,
        cell: { col: mapX, row: mapY },
        side
      };
    },
    hasLineOfSight(x1, y1, x2, y2) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const distance = Math.hypot(x2 - x1, y2 - y1);
      const hit = this.castRay(x1, y1, angle, distance);
      return hit.distance + 0.5 >= distance;
    }
  };

  return maze;
};

const normalizeLayout = (layout) => {
  const width = layout.reduce((max, row) => Math.max(max, row.length), 0);
  return layout.map((row) => {
    if (row.length === width) {
      return row.split("");
    }
    return row.padEnd(width, "#").split("");
  });
};

const keyOf = (cell) => `${cell.col},${cell.row}`;
