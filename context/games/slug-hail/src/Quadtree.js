export class Quadtree {
  constructor(bounds, level = 0, maxObjects = 8, maxLevels = 6) {
    this.bounds = { ...bounds };
    this.level = level;
    this.maxObjects = maxObjects;
    this.maxLevels = maxLevels;
    this.objects = [];
    this.nodes = [];
  }

  clear() {
    this.objects.length = 0;
    for (const node of this.nodes) {
      node.clear();
    }
    this.nodes.length = 0;
  }

  split() {
    const { x, y, w, h } = this.bounds;
    const halfW = w / 2;
    const halfH = h / 2;
    const next = this.level + 1;
    this.nodes = [
      new Quadtree({ x: x + halfW, y, w: halfW, h: halfH }, next, this.maxObjects, this.maxLevels),
      new Quadtree({ x, y, w: halfW, h: halfH }, next, this.maxObjects, this.maxLevels),
      new Quadtree({ x, y: y + halfH, w: halfW, h: halfH }, next, this.maxObjects, this.maxLevels),
      new Quadtree({ x: x + halfW, y: y + halfH, w: halfW, h: halfH }, next, this.maxObjects, this.maxLevels),
    ];
  }

  getIndex(rect) {
    const verticalMidpoint = this.bounds.x + this.bounds.w / 2;
    const horizontalMidpoint = this.bounds.y + this.bounds.h / 2;
    const top = rect.y < horizontalMidpoint && rect.y + rect.h < horizontalMidpoint;
    const bottom = rect.y > horizontalMidpoint;
    const left = rect.x < verticalMidpoint && rect.x + rect.w < verticalMidpoint;
    const right = rect.x > verticalMidpoint;

    if (top && right) return 0;
    if (top && left) return 1;
    if (bottom && left) return 2;
    if (bottom && right) return 3;
    return -1;
  }

  insert(item) {
    if (this.nodes.length > 0) {
      const index = this.getIndex(item.bounds);
      if (index !== -1) {
        this.nodes[index].insert(item);
        return;
      }
    }

    this.objects.push(item);

    if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
      if (this.nodes.length === 0) {
        this.split();
      }

      for (let i = this.objects.length - 1; i >= 0; i -= 1) {
        const index = this.getIndex(this.objects[i].bounds);
        if (index !== -1) {
          this.nodes[index].insert(this.objects.splice(i, 1)[0]);
        }
      }
    }
  }

  retrieve(rect, out = []) {
    out.push(...this.objects);
    if (this.nodes.length === 0) {
      return out;
    }

    const index = this.getIndex(rect);
    if (index !== -1) {
      this.nodes[index].retrieve(rect, out);
      return out;
    }

    for (const node of this.nodes) {
      if (Quadtree.rectsIntersect(node.bounds, rect)) {
        node.retrieve(rect, out);
      }
    }
    return out;
  }

  static rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
}
