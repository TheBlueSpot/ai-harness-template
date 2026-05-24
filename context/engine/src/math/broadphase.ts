export type CollisionBroadphaseId = string | number;

export type CollisionAabb = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type CollisionBroadphaseEntry<TId extends CollisionBroadphaseId = CollisionBroadphaseId> = CollisionAabb & {
  id: TId;
};

export type CollisionBroadphasePair<TId extends CollisionBroadphaseId = CollisionBroadphaseId> = {
  a: TId;
  b: TId;
};

export type CollisionBroadphaseOptions = {
  maxEntries?: number;
};

type BoundsNode<TId extends CollisionBroadphaseId> = CollisionAabb & {
  leaf: boolean;
  children: BoundsNode<TId>[];
  id?: TId;
  order?: number;
};

const DEFAULT_MAX_ENTRIES = 12;

export function createAabb(x: number, y: number, w: number, h: number): CollisionAabb {
  return normalizeAabb({
    minX: x,
    minY: y,
    maxX: x + w,
    maxY: y + h
  });
}

export function aabbsOverlap(a: CollisionAabb, b: CollisionAabb) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function normalizeAabb(bounds: CollisionAabb): CollisionAabb {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    minY: Math.min(bounds.minY, bounds.maxY),
    maxX: Math.max(bounds.minX, bounds.maxX),
    maxY: Math.max(bounds.minY, bounds.maxY)
  };
}

export function createCollisionBroadphase<TId extends CollisionBroadphaseId = CollisionBroadphaseId>(
  options: CollisionBroadphaseOptions = {}
) {
  const maxEntries = Math.max(4, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
  const entries = new Map<TId, BoundsNode<TId>>();
  let root = emptyBranch<TId>();
  let nextOrder = 1;

  function rebuild(items: Iterable<CollisionBroadphaseEntry<TId>>) {
    clear();
    for (const item of items) {
      upsert(item.id, item);
    }
  }

  function upsert(id: TId, bounds: CollisionAabb) {
    remove(id);
    const normalized = normalizeAabb(bounds);
    const entry: BoundsNode<TId> = {
      ...normalized,
      id,
      order: nextOrder,
      leaf: true,
      children: []
    };
    nextOrder += 1;
    entries.set(id, entry);
    insert(entry);
    return entry;
  }

  function remove(id: TId) {
    if (!entries.has(id)) return false;
    entries.delete(id);
    root = emptyBranch<TId>();
    for (const entry of entries.values()) {
      insert(entry);
    }
    return true;
  }

  function clear() {
    entries.clear();
    root = emptyBranch<TId>();
    nextOrder = 1;
  }

  function query(bounds: CollisionAabb, out: TId[] = []) {
    const normalized = normalizeAabb(bounds);
    queryNode(root, normalized, out);
    return out;
  }

  function queryEntries(bounds: CollisionAabb, out: CollisionBroadphaseEntry<TId>[] = []) {
    const ids = query(bounds);
    for (let i = 0; i < ids.length; i += 1) {
      const entry = entries.get(ids[i]);
      if (!entry) continue;
      out.push({ id: ids[i], minX: entry.minX, minY: entry.minY, maxX: entry.maxX, maxY: entry.maxY });
    }
    return out;
  }

  function collides(bounds: CollisionAabb) {
    return hasOverlap(root, normalizeAabb(bounds));
  }

  function pairs(out: CollisionBroadphasePair<TId>[] = []) {
    for (const entry of entries.values()) {
      const candidates: TId[] = [];
      queryNode(root, entry, candidates);
      for (let i = 0; i < candidates.length; i += 1) {
        const other = entries.get(candidates[i]);
        if (!other || other.id === entry.id || (other.order ?? 0) <= (entry.order ?? 0)) continue;
        out.push({ a: entry.id as TId, b: other.id as TId });
      }
    }
    return out;
  }

  function insert(entry: BoundsNode<TId>) {
    const split = insertInto(root, entry);
    if (!split) return;
    root = branchFromChildren([root, split]);
  }

  function insertInto(node: BoundsNode<TId>, entry: BoundsNode<TId>): BoundsNode<TId> | undefined {
    if (node.leaf) {
      throw new Error("Cannot insert into a leaf entry");
    }

    if (node.children.length === 0 || node.children[0].leaf) {
      node.children.push(entry);
    } else {
      const child = chooseSubtree(node.children, entry);
      const split = insertInto(child, entry);
      if (split) node.children.push(split);
    }

    recalculateBounds(node);
    if (node.children.length <= maxEntries) return undefined;
    return splitNode(node);
  }

  function splitNode(node: BoundsNode<TId>) {
    const axis = boundsWidth(node) >= boundsHeight(node) ? "x" : "y";
    node.children.sort((a, b) => (axis === "x" ? a.minX - b.minX : a.minY - b.minY));
    const half = Math.ceil(node.children.length / 2);
    const siblingChildren = node.children.splice(half);
    recalculateBounds(node);
    return branchFromChildren(siblingChildren);
  }

  function queryNode(node: BoundsNode<TId>, bounds: CollisionAabb, out: TId[]) {
    if (!aabbsOverlap(node, bounds)) return;
    if (node.leaf) {
      out.push(node.id as TId);
      return;
    }
    for (let i = 0; i < node.children.length; i += 1) {
      queryNode(node.children[i], bounds, out);
    }
  }

  function hasOverlap(node: BoundsNode<TId>, bounds: CollisionAabb): boolean {
    if (!aabbsOverlap(node, bounds)) return false;
    if (node.leaf) return true;
    for (let i = 0; i < node.children.length; i += 1) {
      if (hasOverlap(node.children[i], bounds)) return true;
    }
    return false;
  }

  return {
    upsert,
    remove,
    clear,
    rebuild,
    query,
    queryEntries,
    collides,
    pairs,
    count() {
      return entries.size;
    },
    boundsOf(id: TId) {
      const entry = entries.get(id);
      if (!entry) return undefined;
      return { minX: entry.minX, minY: entry.minY, maxX: entry.maxX, maxY: entry.maxY };
    }
  };
}

function emptyBranch<TId extends CollisionBroadphaseId>(): BoundsNode<TId> {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    leaf: false,
    children: []
  };
}

function branchFromChildren<TId extends CollisionBroadphaseId>(children: BoundsNode<TId>[]) {
  const node = emptyBranch<TId>();
  node.children = children;
  recalculateBounds(node);
  return node;
}

function recalculateBounds<TId extends CollisionBroadphaseId>(node: BoundsNode<TId>) {
  if (node.children.length === 0) {
    node.minX = Number.POSITIVE_INFINITY;
    node.minY = Number.POSITIVE_INFINITY;
    node.maxX = Number.NEGATIVE_INFINITY;
    node.maxY = Number.NEGATIVE_INFINITY;
    return;
  }
  node.minX = Number.POSITIVE_INFINITY;
  node.minY = Number.POSITIVE_INFINITY;
  node.maxX = Number.NEGATIVE_INFINITY;
  node.maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < node.children.length; i += 1) {
    expandToInclude(node, node.children[i]);
  }
}

function chooseSubtree<TId extends CollisionBroadphaseId>(children: BoundsNode<TId>[], entry: CollisionAabb) {
  let best = children[0];
  let bestEnlargement = enlargement(best, entry);
  let bestArea = area(best);
  for (let i = 1; i < children.length; i += 1) {
    const child = children[i];
    const nextEnlargement = enlargement(child, entry);
    const nextArea = area(child);
    if (nextEnlargement < bestEnlargement || (nextEnlargement === bestEnlargement && nextArea < bestArea)) {
      best = child;
      bestEnlargement = nextEnlargement;
      bestArea = nextArea;
    }
  }
  return best;
}

function expandToInclude(target: CollisionAabb, bounds: CollisionAabb) {
  target.minX = Math.min(target.minX, bounds.minX);
  target.minY = Math.min(target.minY, bounds.minY);
  target.maxX = Math.max(target.maxX, bounds.maxX);
  target.maxY = Math.max(target.maxY, bounds.maxY);
}

function enlargement(a: CollisionAabb, b: CollisionAabb) {
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.maxX, b.maxX);
  const maxY = Math.max(a.maxY, b.maxY);
  return (maxX - minX) * (maxY - minY) - area(a);
}

function area(bounds: CollisionAabb) {
  return boundsWidth(bounds) * boundsHeight(bounds);
}

function boundsWidth(bounds: CollisionAabb) {
  return Math.max(0, bounds.maxX - bounds.minX);
}

function boundsHeight(bounds: CollisionAabb) {
  return Math.max(0, bounds.maxY - bounds.minY);
}
