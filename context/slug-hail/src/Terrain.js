import { Quadtree } from "./Quadtree.js";

const CELL_SIZE = 26;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circleRectCollision(circleX, circleY, radius, rect) {
  const closestX = clamp(circleX, rect.x, rect.x + rect.w);
  const closestY = clamp(circleY, rect.y, rect.y + rect.h);
  const dx = circleX - closestX;
  const dy = circleY - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export class Terrain {
  constructor(world) {
    this.world = world;
    this.cells = this.buildCells();
    this.tree = new Quadtree({ x: 0, y: 0, w: world.width, h: world.height });
    this.rebuildIndex();
  }

  buildCells() {
    const cells = [];
    for (let gridX = 0; gridX < 30; gridX += 1) {
      for (let gridY = 0; gridY < 16; gridY += 1) {
        const x = 600 + gridX * CELL_SIZE;
        const y = 180 + gridY * CELL_SIZE;
        const centerGap = Math.hypot(gridX - 14.5, gridY - 7.5) < 3.4;
        const trench = gridX > 9 && gridX < 20 && gridY > 4 && gridY < 11 && Math.random() < 0.22;
        const ridge = gridY === 0 || gridY === 15 || gridX === 0 || gridX === 29;
        if (centerGap || trench) {
          continue;
        }
        cells.push({
          x,
          y,
          w: CELL_SIZE,
          h: CELL_SIZE,
          hp: ridge ? 4 : 2 + (Math.random() < 0.25 ? 1 : 0),
          maxHp: ridge ? 4 : 3,
          dead: false,
          bounds: { x, y, w: CELL_SIZE, h: CELL_SIZE },
        });
      }
    }
    return cells;
  }

  rebuildIndex() {
    this.tree.clear();
    for (const cell of this.cells) {
      if (!cell.dead) {
        cell.bounds.x = cell.x;
        cell.bounds.y = cell.y;
        this.tree.insert(cell);
      }
    }
  }

  queryRect(rect) {
    return this.tree.retrieve(rect, []).filter((cell) => !cell.dead);
  }

  damageCircle(x, y, radius, power = 1) {
    const rect = { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 };
    const hits = [];
    for (const cell of this.queryRect(rect)) {
      if (!circleRectCollision(x, y, radius, cell.bounds)) {
        continue;
      }
      cell.hp -= power;
      hits.push(cell);
      if (cell.hp <= 0) {
        cell.dead = true;
      }
    }
    if (hits.length > 0) {
      this.cells = this.cells.filter((cell) => !cell.dead);
      this.rebuildIndex();
    }
    return hits;
  }

  collideCircle(body, radius) {
    const rect = { x: body.x - radius, y: body.y - radius, w: radius * 2, h: radius * 2 };
    const collisions = [];
    for (const cell of this.queryRect(rect)) {
      if (circleRectCollision(body.x, body.y, radius, cell.bounds)) {
        collisions.push(cell);
      }
    }
    return collisions;
  }

  resolveCircle(body, radius) {
    let changed = false;
    for (const cell of this.collideCircle(body, radius)) {
      const centerX = cell.x + cell.w / 2;
      const centerY = cell.y + cell.h / 2;
      let dx = body.x - centerX;
      let dy = body.y - centerY;
      let mag = Math.hypot(dx, dy);
      if (mag < 0.001) {
        dx = 1;
        dy = 0;
        mag = 1;
      }
      const push = radius + CELL_SIZE * 0.45 - mag;
      if (push > 0) {
        body.x += (dx / mag) * push;
        body.y += (dy / mag) * push;
        changed = true;
      }
    }
    return changed;
  }

  sampleGroundHeight(x) {
    const column = this.cells
      .filter((cell) => x >= cell.x && x <= cell.x + cell.w)
      .sort((a, b) => a.y - b.y);
    return column.length > 0 ? column[0].y : this.world.height;
  }

  render(ctx) {
    for (const cell of this.cells) {
      const ratio = cell.hp / Math.max(1, cell.maxHp);
      ctx.fillStyle = ratio > 0.66 ? "#56647a" : ratio > 0.33 ? "#8b6c42" : "#c38c47";
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      ctx.strokeStyle = "rgba(238,245,255,0.08)";
      ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);
    }
  }
}

export { CELL_SIZE };
