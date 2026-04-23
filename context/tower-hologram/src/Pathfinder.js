function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function cloneCell(cell) {
  return cell ? { x: cell.x, y: cell.y } : null;
}

function pointKey(point) {
  return `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function heuristic(a, b) {
  return pointDistance(a, b);
}

function segmentDistanceSquared(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const lengthSquared = abx * abx + aby * aby;

  if (lengthSquared <= 0) {
    return apx * apx + apy * apy;
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSquared));
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy;
}

function pointToSegmentDistance(point, a, b) {
  return Math.sqrt(segmentDistanceSquared(point, a, b));
}

function toPoint(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (isFiniteNumber(value.x) && isFiniteNumber(value.y)) {
    return { x: Number(value.x), y: Number(value.y) };
  }

  return null;
}

function toCell(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (isFiniteNumber(value.x) && isFiniteNumber(value.y)) {
    return { x: Math.trunc(value.x), y: Math.trunc(value.y) };
  }

  return null;
}

export class Pathfinder {
  constructor({
    width = null,
    height = null,
    spawn = null,
    goal = null,
    sampleStep = 48,
    margin = 24,
    cols = null,
    rows = null,
    start = null,
    layout = null,
  } = {}) {
    this.sampleStep = Math.max(4, Math.floor(sampleStep) || 48);
    this.margin = Math.max(0, Number(margin) || 0);
    this.width = isFiniteNumber(width) ? Number(width) : null;
    this.height = isFiniteNumber(height) ? Number(height) : null;
    this.cols = isFiniteNumber(cols) ? Math.max(1, Math.floor(cols)) : null;
    this.rows = isFiniteNumber(rows) ? Math.max(1, Math.floor(rows)) : null;
    this.layout = layout ? { ...layout } : null;
    this.legacyMode = !isFiniteNumber(this.width) || !isFiniteNumber(this.height);
    this.start = start ? cloneCell(start) : null;
    this.goal = goal ? (this.legacyMode && !layout ? cloneCell(goal) : clonePoint(goal)) : null;
    this.spawn = spawn ? clonePoint(spawn) : null;
    this.goalPoint = goal ? clonePoint(goal) : null;
    this.blockers = [];
    this.transientFields = [];
    this.revision = 0;
    this._graphCacheKey = "";
    this._graphCache = null;
    this._debugGraph = null;

    if (this.layout) {
      this.setLayout(this.layout);
    }

    if (!this.spawn) {
      this.spawn = this._deriveSpawnPoint();
    }

    if (!this.goalPoint) {
      this.goalPoint = this._deriveGoalPoint();
    }
  }

  setLayout(layout) {
    this.layout = { ...(this.layout ?? {}), ...layout };

    if (isFiniteNumber(this.layout.width) && isFiniteNumber(this.layout.height)) {
      this.width = Number(this.layout.width);
      this.height = Number(this.layout.height);
    }

    if (this.start && (this.legacyMode || this._looksLikeCell(this.start))) {
      this.spawn = this.cellToPoint(this.start);
    }

    if (this.goal && (this.legacyMode || this._looksLikeCell(this.goal))) {
      this.goalPoint = this.cellToPoint(this.goal);
    }

    this._invalidateGraph();
  }

  setWorld({ width, height, spawn, goal, sampleStep, margin, layout } = {}) {
    if (layout) {
      this.layout = { ...(this.layout ?? {}), ...layout };
    }

    if (isFiniteNumber(width)) {
      this.width = Number(width);
    }

    if (isFiniteNumber(height)) {
      this.height = Number(height);
    }

    if (sampleStep != null) {
      this.sampleStep = Math.max(4, Math.floor(sampleStep) || this.sampleStep);
    }

    if (margin != null) {
      this.margin = Math.max(0, Number(margin) || 0);
    }

    const spawnPoint = toPoint(spawn);
    const goalPoint = toPoint(goal);
    if (spawnPoint) {
      this.spawn = spawnPoint;
      this.start = spawnPoint;
    }

    if (goalPoint) {
      this.goalPoint = goalPoint;
      this.goal = goalPoint;
    }

    this.legacyMode = false;
    this._invalidateGraph();
  }

  getCellSize() {
    if (this.layout?.cellSize) {
      return this.layout.cellSize;
    }

    return this.sampleStep;
  }

  pointToCell(point) {
    const pointValue = toPoint(point);
    if (!pointValue) {
      return null;
    }

    const originX = this.layout?.originX ?? 0;
    const originY = this.layout?.originY ?? 0;
    const cellSize = this.layout?.cellSize ?? this.sampleStep;
    if (!cellSize) {
      return null;
    }

    const cell = {
      x: Math.floor((pointValue.x - originX) / cellSize),
      y: Math.floor((pointValue.y - originY) / cellSize),
    };

    if (this.cols != null && this.rows != null) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= this.cols || cell.y >= this.rows) {
        return null;
      }
    }

    return cell;
  }

  cellToPoint(cell) {
    const cellValue = toCell(cell);
    if (!cellValue) {
      return null;
    }

    const originX = this.layout?.originX ?? 0;
    const originY = this.layout?.originY ?? 0;
    const cellSize = this.layout?.cellSize ?? this.sampleStep;
    return {
      x: originX + (cellValue.x + 0.5) * cellSize,
      y: originY + (cellValue.y + 0.5) * cellSize,
    };
  }

  getRevision() {
    return this.revision;
  }

  updateBlockers(blockers) {
    this.setBlockers(blockers);
  }

  setBlockers(blockers) {
    const normalized = Array.isArray(blockers) ? blockers.map((blocker) => this._normalizeBlocker(blocker)).filter(Boolean) : [];
    normalized.sort((a, b) => a.key.localeCompare(b.key));

    const nextKey = normalized.map((blocker) => blocker.key).join("|");
    const currentKey = this.blockers.map((blocker) => blocker.key).join("|");
    this.blockers = normalized;

    if (nextKey !== currentKey) {
      this.revision += 1;
      this._invalidateGraph();
    }
  }

  setTransientFields(fields) {
    const normalized = Array.isArray(fields) ? fields.map((field) => this._normalizeTransientField(field)).filter(Boolean) : [];
    normalized.sort((a, b) => a.key.localeCompare(b.key));

    const nextKey = normalized.map((field) => field.key).join("|");
    const currentKey = this.transientFields.map((field) => field.key).join("|");
    this.transientFields = normalized;

    if (nextKey !== currentKey) {
      this.revision += 1;
      this._invalidateGraph();
    }
  }

  isPathClear() {
    const path = this.findPath(this._resolveSpawnPoint(), this._resolveGoalPoint());
    return path.length > 0;
  }

  canPlaceBlocker(blocker) {
    const candidate = this._normalizeBlocker(blocker);
    if (!candidate) {
      return false;
    }

    const blockers = [...this.blockers, candidate];
    return this._findPathInternal(this._resolveSpawnPoint(), this._resolveGoalPoint(), blockers).length > 0;
  }

  findPath(start = this.start ?? this.spawn, goal = this.goal ?? this.goalPoint, blockers = this.blockers) {
    const startPoint = this._normalizePointLike(start, "auto") ?? this._resolveSpawnPoint();
    const goalPoint = this._normalizePointLike(goal, "auto") ?? this._resolveGoalPoint();
    return this._findPathInternal(startPoint, goalPoint, blockers, this.transientFields);
  }

  findPathFromPoint(point, goal = this.goal ?? this.goalPoint, blockers = this.blockers) {
    const startPoint = this._normalizePointLike(point, "point") ?? this._resolveSpawnPoint();
    const goalPoint = this._normalizePointLike(goal, "auto") ?? this._resolveGoalPoint();
    return this._findPathInternal(startPoint, goalPoint, blockers, this.transientFields);
  }

  getDebugGraph() {
    const graph = this._getGraph(this.blockers);
    return {
      revision: this.revision,
      bounds: { ...graph.bounds },
      sampleStep: this.sampleStep,
      margin: this.margin,
      nodes: graph.nodes.map((node) => ({
        x: node.x,
        y: node.y,
        key: node.key,
        blocked: node.blocked,
      })),
      edges: graph.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        length: edge.length,
      })),
      blockers: graph.blockers.map((blocker) => ({
        x: blocker.x,
        y: blocker.y,
        radius: blocker.radius,
        margin: blocker.margin,
        key: blocker.key,
      })),
    };
  }

  _invalidateGraph() {
    this._graphCacheKey = "";
    this._graphCache = null;
    this._debugGraph = null;
  }

  _deriveSpawnPoint() {
    if (this.spawn) {
      return clonePoint(this.spawn);
    }

    if (this.start) {
      const point = this.cellToPoint(this.start);
      if (point) {
        return point;
      }
    }

    const bounds = this._getBounds();
    return {
      x: bounds.minX + this.margin,
      y: (bounds.minY + bounds.maxY) * 0.5,
    };
  }

  _deriveGoalPoint() {
    if (this.goalPoint) {
      return clonePoint(this.goalPoint);
    }

    if (this.goal) {
      const point = this.legacyMode ? this.cellToPoint(this.goal) : toPoint(this.goal);
      if (point) {
        return point;
      }
    }

    const bounds = this._getBounds();
    return {
      x: bounds.maxX - this.margin,
      y: (bounds.minY + bounds.maxY) * 0.5,
    };
  }

  _resolveSpawnPoint() {
    const point = this._normalizePointLike(this.spawn ?? this.start, "auto");
    return point ?? this._deriveSpawnPoint();
  }

  _resolveGoalPoint() {
    const point = this._normalizePointLike(this.goalPoint ?? this.goal, "auto");
    return point ?? this._deriveGoalPoint();
  }

  _looksLikeCell(value) {
    if (!value || typeof value !== "object") {
      return false;
    }

    if (!Number.isInteger(value.x) || !Number.isInteger(value.y)) {
      return false;
    }

    if (this.cols != null && this.rows != null) {
      return value.x >= 0 && value.y >= 0 && value.x < this.cols && value.y < this.rows;
    }

    return this.legacyMode;
  }

  _normalizePointLike(value, mode = "auto") {
    if (!value) {
      return null;
    }

    if (mode === "cell") {
      const cell = toCell(value);
      return cell ? this.cellToPoint(cell) : null;
    }

    if (mode === "point") {
      return toPoint(value);
    }

    if (value.cell && this.layout) {
      const cell = toCell(value.cell);
      if (cell) {
        return this.cellToPoint(cell);
      }
    }

    if (this.legacyMode && this.layout && this._looksLikeCell(value)) {
      const cell = toCell(value);
      if (cell) {
        return this.cellToPoint(cell);
      }
    }

    return toPoint(value);
  }

  _normalizeBlocker(blocker) {
    if (!blocker || typeof blocker !== "object") {
      return null;
    }

    const margin = isFiniteNumber(blocker.margin) ? Math.max(0, Number(blocker.margin)) : this.margin;
    let point = null;
    let cell = null;
    let radius = null;

    if (isFiniteNumber(blocker.radius) && isFiniteNumber(blocker.x) && isFiniteNumber(blocker.y)) {
      point = { x: Number(blocker.x), y: Number(blocker.y) };
      radius = Math.max(0, Number(blocker.radius));
    } else if (blocker.cell) {
      cell = toCell(blocker.cell);
      point = cell ? this.cellToPoint(cell) : null;
    } else if (isFiniteNumber(blocker.x) && isFiniteNumber(blocker.y) && this.layout) {
      cell = toCell(blocker);
      point = this.cellToPoint(cell);
    } else if (isFiniteNumber(blocker.x) && isFiniteNumber(blocker.y)) {
      point = { x: Number(blocker.x), y: Number(blocker.y) };
    }

    if (!point) {
      return null;
    }

    if (!isFiniteNumber(radius)) {
      const baseRadius = isFiniteNumber(blocker.baseRadius)
        ? Number(blocker.baseRadius)
        : this.getCellSize() * 0.34;
      radius = Math.max(0, baseRadius);
    }

    return {
      x: point.x,
      y: point.y,
      radius,
      margin,
      cell,
      key: `${point.x.toFixed(3)},${point.y.toFixed(3)},${(radius + margin).toFixed(3)}`,
    };
  }

  _normalizeTransientField(field) {
    if (!field || typeof field !== "object") {
      return null;
    }

    const margin = isFiniteNumber(field.margin) ? Math.max(0, Number(field.margin)) : 0;
    const hard = field.hard === true || field.blocking === true || field.type === "false-wall";
    const weight = isFiniteNumber(field.weight) ? Math.max(0, Number(field.weight)) : 0;
    let point = null;
    let cell = null;
    let radius = null;

    if (isFiniteNumber(field.radius) && isFiniteNumber(field.x) && isFiniteNumber(field.y)) {
      point = { x: Number(field.x), y: Number(field.y) };
      radius = Math.max(0, Number(field.radius));
    } else if (field.cell) {
      cell = toCell(field.cell);
      point = cell ? this.cellToPoint(cell) : null;
    } else if (isFiniteNumber(field.x) && isFiniteNumber(field.y)) {
      point = { x: Number(field.x), y: Number(field.y) };
    }

    if (!point) {
      return null;
    }

    if (!isFiniteNumber(radius)) {
      const baseRadius = isFiniteNumber(field.baseRadius)
        ? Number(field.baseRadius)
        : this.getCellSize() * 0.42;
      radius = Math.max(0, baseRadius);
    }

    return {
      x: point.x,
      y: point.y,
      radius,
      margin,
      weight,
      hard,
      cell,
      kind: field.kind ?? "phase-gate",
      key: `${point.x.toFixed(3)},${point.y.toFixed(3)},${(radius + margin).toFixed(3)},${weight.toFixed(3)},${hard ? 1 : 0}`,
    };
  }

  _getBounds() {
    if (isFiniteNumber(this.width) && isFiniteNumber(this.height)) {
      if (this.layout && isFiniteNumber(this.layout.originX) && isFiniteNumber(this.layout.originY)) {
        return {
          minX: Number(this.layout.originX),
          minY: Number(this.layout.originY),
          maxX: Number(this.layout.originX) + Number(this.width),
          maxY: Number(this.layout.originY) + Number(this.height),
        };
      }

      return {
        minX: 0,
        minY: 0,
        maxX: Number(this.width),
        maxY: Number(this.height),
      };
    }

    if (this.layout && isFiniteNumber(this.layout.width) && isFiniteNumber(this.layout.height)) {
      return {
        minX: Number(this.layout.originX ?? 0),
        minY: Number(this.layout.originY ?? 0),
        maxX: Number(this.layout.originX ?? 0) + Number(this.layout.width),
        maxY: Number(this.layout.originY ?? 0) + Number(this.layout.height),
      };
    }

    const inferredWidth = Math.max(
      this.sampleStep * 6,
      (this.cols ?? 0) * this.sampleStep,
      pointDistance(this.spawn ?? { x: 0, y: 0 }, this.goalPoint ?? { x: this.sampleStep * 4, y: 0 }) + this.margin * 4,
    );
    const inferredHeight = Math.max(this.sampleStep * 6, (this.rows ?? 0) * this.sampleStep || this.sampleStep * 6);
    return {
      minX: 0,
      minY: 0,
      maxX: inferredWidth,
      maxY: inferredHeight,
    };
  }

  _blockerSignature(blockers) {
    return blockers.map((blocker) => blocker.key).join("|");
  }

  _getGraph(blockers, fields = this.transientFields) {
    const bounds = this._getBounds();
    const blockerList = blockers.map((blocker) => this._normalizeBlocker(blocker)).filter(Boolean);
    const fieldList = fields.map((field) => this._normalizeTransientField(field)).filter(Boolean);
    const hardFields = fieldList.filter((field) => field.hard);
    const softFields = fieldList.filter((field) => !field.hard);
    blockerList.sort((a, b) => a.key.localeCompare(b.key));
    hardFields.sort((a, b) => a.key.localeCompare(b.key));
    softFields.sort((a, b) => a.key.localeCompare(b.key));
    const cacheKey = [
      `${bounds.minX.toFixed(2)},${bounds.minY.toFixed(2)},${bounds.maxX.toFixed(2)},${bounds.maxY.toFixed(2)}`,
      this.sampleStep,
      this.margin,
      this._blockerSignature(blockerList),
      this._blockerSignature(fieldList),
    ].join("::");

    if (this._graphCache && this._graphCacheKey === cacheKey) {
      return this._graphCache;
    }

    const nodes = [];
    const grid = [];
    const xCoords = [];
    const yCoords = [];
    const step = this.sampleStep;
    const epsilon = 1e-6;

    for (let x = bounds.minX; x <= bounds.maxX + epsilon; x += step) {
      xCoords.push(Number(x.toFixed(6)));
    }
    if (xCoords.length === 0 || xCoords[xCoords.length - 1] !== bounds.maxX) {
      xCoords.push(bounds.maxX);
    }

    for (let y = bounds.minY; y <= bounds.maxY + epsilon; y += step) {
      yCoords.push(Number(y.toFixed(6)));
    }
    if (yCoords.length === 0 || yCoords[yCoords.length - 1] !== bounds.maxY) {
      yCoords.push(bounds.maxY);
    }

    for (let row = 0; row < yCoords.length; row += 1) {
      grid[row] = [];
      for (let col = 0; col < xCoords.length; col += 1) {
        const node = {
          x: xCoords[col],
          y: yCoords[row],
          key: `${xCoords[col].toFixed(3)},${yCoords[row].toFixed(3)}`,
          row,
          col,
          blocked: false,
          neighbors: [],
        };

        node.blocked = this._pointBlocked(node, blockerList) || this._pointBlocked(node, hardFields);
        node.weight = 1 + this._fieldPenalty(node, softFields);
        grid[row][col] = node;
        nodes.push(node);
      }
    }

    const edgeSet = new Map();
    const neighborOffsets = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];

    for (let row = 0; row < grid.length; row += 1) {
      for (let col = 0; col < grid[row].length; col += 1) {
        const node = grid[row][col];
        if (node.blocked) {
          continue;
        }

        for (const [dx, dy] of neighborOffsets) {
          const candidates = [
            [col + dx, row + dy],
            [col - dx, row - dy],
          ];

          for (const [nextCol, nextRow] of candidates) {
            const neighbor = grid[nextRow]?.[nextCol];
            if (!neighbor || neighbor.blocked) {
              continue;
            }

            if (!this._segmentClear(node, neighbor, blockerList) || !this._segmentClear(node, neighbor, hardFields)) {
              continue;
            }

            if (node.key >= neighbor.key) {
              continue;
            }

            node.neighbors.push(neighbor);
            neighbor.neighbors.push(node);
            const edgeKey = `${node.key}|${neighbor.key}`;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.set(edgeKey, {
                from: node.key,
                to: neighbor.key,
                length: pointDistance(node, neighbor),
              });
            }
          }
        }
      }
    }

    const graph = {
      bounds,
      nodes,
      grid,
      edges: Array.from(edgeSet.values()).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
      blockers: blockerList,
      fields: fieldList,
    };

    this._graphCacheKey = cacheKey;
    this._graphCache = graph;
    this._debugGraph = graph;
    return graph;
  }

  _pointBlocked(point, blockers) {
    for (const blocker of blockers) {
      const radius = blocker.radius + blocker.margin;
      const dx = point.x - blocker.x;
      const dy = point.y - blocker.y;
      if (dx * dx + dy * dy <= radius * radius) {
        return true;
      }
    }

    return false;
  }

  _fieldPenalty(point, fields) {
    let penalty = 0;
    for (const field of fields) {
      const radius = field.radius + field.margin;
      const dx = point.x - field.x;
      const dy = point.y - field.y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) {
        continue;
      }

      const falloff = Math.max(0, 1 - distance / (radius || 1));
      penalty += field.weight * falloff;
    }

    return penalty;
  }

  _segmentClear(a, b, blockers) {
    for (const blocker of blockers) {
      const radius = blocker.radius + blocker.margin;
      const distance = pointToSegmentDistance({ x: blocker.x, y: blocker.y }, a, b);
      if (distance <= radius - 1e-6) {
        return false;
      }
    }

    return true;
  }

  _chooseAttachmentNodes(point, graph) {
    const candidates = [];
    const maxDistance = this.sampleStep * 2.5;
    for (const node of graph.nodes) {
      if (node.blocked) {
        continue;
      }

      if (!this._segmentClear(point, node, graph.blockers)) {
        continue;
      }

      const distance = pointDistance(point, node);
      if (distance <= maxDistance || samePoint(point, node)) {
        candidates.push({
          node,
          distance,
        });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance || a.node.key.localeCompare(b.node.key));
    return candidates.slice(0, 12).map((entry) => entry.node);
  }

  _buildSearchGraph(startPoint, goalPoint, blockers, fields) {
    const baseGraph = this._getGraph(blockers, fields);
    const nodeCopies = new Map();
    for (const node of baseGraph.nodes) {
      nodeCopies.set(node.key, {
        x: node.x,
        y: node.y,
        key: node.key,
        row: node.row,
        col: node.col,
        blocked: node.blocked,
        neighbors: [],
      });
    }

    for (const node of baseGraph.nodes) {
      const copy = nodeCopies.get(node.key);
      copy.neighbors = node.neighbors
        .map((neighbor) => nodeCopies.get(neighbor.key))
        .filter(Boolean);
    }

    const graph = {
      ...baseGraph,
      nodes: Array.from(nodeCopies.values()),
    };
    const startNode = {
      x: startPoint.x,
      y: startPoint.y,
      key: `start:${pointKey(startPoint)}`,
      blocked: this._pointBlocked(startPoint, graph.blockers),
      neighbors: [],
      temp: true,
    };
    const goalNode = {
      x: goalPoint.x,
      y: goalPoint.y,
      key: `goal:${pointKey(goalPoint)}`,
      blocked: this._pointBlocked(goalPoint, graph.blockers),
      neighbors: [],
      temp: true,
    };

    if (startNode.blocked || goalNode.blocked) {
      return null;
    }

    const startAttachments = this._chooseAttachmentNodes(startPoint, graph);
    const goalAttachments = this._chooseAttachmentNodes(goalPoint, graph);

    if (startAttachments.length === 0 || goalAttachments.length === 0) {
      return null;
    }

    for (const node of startAttachments) {
      startNode.neighbors.push(node);
      node.neighbors.push(startNode);
    }

    for (const node of goalAttachments) {
      goalNode.neighbors.push(node);
      node.neighbors.push(goalNode);
    }

    graph.nodes = [startNode, goalNode, ...graph.nodes];
    graph.startNode = startNode;
    graph.goalNode = goalNode;
    return graph;
  }

  _runAStar(graph) {
    const startNode = graph.startNode;
    const goalNode = graph.goalNode;
    const open = [startNode];
    const openSet = new Set([startNode.key]);
    const cameFrom = new Map();
    const gScore = new Map([[startNode.key, 0]]);
    const fScore = new Map([[startNode.key, heuristic(startNode, goalNode)]]);
    const closed = new Set();

    const pickBestIndex = () => {
      let bestIndex = 0;
      let bestNode = open[0];
      let bestF = fScore.get(bestNode.key) ?? Number.POSITIVE_INFINITY;
      let bestG = gScore.get(bestNode.key) ?? Number.POSITIVE_INFINITY;

      for (let index = 1; index < open.length; index += 1) {
        const candidate = open[index];
        const candidateF = fScore.get(candidate.key) ?? Number.POSITIVE_INFINITY;
        const candidateG = gScore.get(candidate.key) ?? Number.POSITIVE_INFINITY;
        if (
          candidateF < bestF ||
          (candidateF === bestF && candidateG < bestG) ||
          (candidateF === bestF && candidateG === bestG && candidate.key < bestNode.key)
        ) {
          bestIndex = index;
          bestNode = candidate;
          bestF = candidateF;
          bestG = candidateG;
        }
      }

      return bestIndex;
    };

    while (open.length > 0) {
      const current = open.splice(pickBestIndex(), 1)[0];
      openSet.delete(current.key);

      if (current.key === goalNode.key) {
        return this._reconstructPath(cameFrom, current);
      }

      closed.add(current.key);

      for (const neighbor of current.neighbors) {
        if (closed.has(neighbor.key)) {
          continue;
        }

        const segmentPenalty = ((current.weight ?? 1) + (neighbor.weight ?? 1)) * 0.5;
        const tentativeG = (gScore.get(current.key) ?? Number.POSITIVE_INFINITY) + pointDistance(current, neighbor) * segmentPenalty;
        const existingG = gScore.get(neighbor.key) ?? Number.POSITIVE_INFINITY;
        if (tentativeG >= existingG - 1e-9) {
          continue;
        }

        cameFrom.set(neighbor.key, current);
        gScore.set(neighbor.key, tentativeG);
        fScore.set(neighbor.key, tentativeG + heuristic(neighbor, goalNode));

        if (!openSet.has(neighbor.key)) {
          open.push(neighbor);
          openSet.add(neighbor.key);
        }
      }
    }

    return [];
  }

  _reconstructPath(cameFrom, current) {
    const nodes = [current];
    let cursor = current;

    while (cameFrom.has(cursor.key)) {
      cursor = cameFrom.get(cursor.key);
      nodes.push(cursor);
    }

    nodes.reverse();
    return nodes;
  }

  _smoothPath(nodes, blockers) {
    if (nodes.length <= 2) {
      return nodes;
    }

    const smoothed = [nodes[0]];
    let anchorIndex = 0;

    while (anchorIndex < nodes.length - 1) {
      let lookAhead = nodes.length - 1;
      let found = false;

      for (; lookAhead > anchorIndex + 1; lookAhead -= 1) {
        if (this._segmentClear(nodes[anchorIndex], nodes[lookAhead], blockers)) {
          smoothed.push(nodes[lookAhead]);
          anchorIndex = lookAhead;
          found = true;
          break;
        }
      }

      if (!found) {
        const nextIndex = anchorIndex + 1;
        smoothed.push(nodes[nextIndex]);
        anchorIndex = nextIndex;
      }
    }

    const deduped = [smoothed[0]];
    for (let index = 1; index < smoothed.length; index += 1) {
      if (!samePoint(smoothed[index], deduped[deduped.length - 1])) {
        deduped.push(smoothed[index]);
      }
    }

    return deduped;
  }

  _decoratePath(points) {
    return points.map((point) => ({
      x: point.x,
      y: point.y,
      cell: this.pointToCell(point),
    }));
  }

  _findPathInternal(startPoint, goalPoint, blockers, fields = this.transientFields) {
    const start = this._normalizePointLike(startPoint, "point") ?? this._normalizePointLike(startPoint, "cell");
    const goal = this._normalizePointLike(goalPoint, "point") ?? this._normalizePointLike(goalPoint, "cell");

    if (!start || !goal) {
      return [];
    }

    const graph = this._buildSearchGraph(start, goal, Array.isArray(blockers) ? blockers : [], Array.isArray(fields) ? fields : []);
    if (!graph) {
      return [];
    }

    const pathNodes = this._runAStar(graph);
    if (!pathNodes.length) {
      return [];
    }

    const pointPath = this._smoothPath(pathNodes, graph.blockers).map((node) => clonePoint(node));

    if (!samePoint(pointPath[0], start)) {
      pointPath.unshift(clonePoint(start));
    }

    if (!samePoint(pointPath[pointPath.length - 1], goal)) {
      pointPath.push(clonePoint(goal));
    }

    return this._decoratePath(pointPath);
  }
}
