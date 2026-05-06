(() => {
  // src/assets.js
  var ASSET_MANIFEST = Object.freeze({
    hologramCore: {
      kind: "image",
      src: "assets/images/hologram-core.png"
    },
    place: {
      kind: "audio",
      src: "assets/sfx/place.wav"
    }
  });
  function getAssetBaseUrl() {
    const currentScript = typeof document !== "undefined" ? document.currentScript : null;
    if (currentScript?.src) {
      return new URL("./", currentScript.src);
    }
    if (typeof document !== "undefined" && document.baseURI) {
      return new URL("./", document.baseURI);
    }
    return new URL("./", "http://localhost/");
  }
  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image;
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image asset: ${source}`));
      image.src = source;
    });
  }
  function loadAudio(source) {
    return new Promise((resolve, reject) => {
      const audio = new Audio;
      const cleanup = () => {
        audio.removeEventListener("loadeddata", onReady);
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve(audio);
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load audio asset: ${source}`));
      };
      audio.preload = "auto";
      audio.addEventListener("loadeddata", onReady, { once: true });
      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.src = source;
      audio.load();
    });
  }
  async function loadAsset(definition) {
    const resolvedSource = new URL(definition.src, getAssetBaseUrl()).href;
    if (definition.kind === "image") {
      return loadImage(resolvedSource);
    }
    if (definition.kind === "audio") {
      return loadAudio(resolvedSource);
    }
    throw new Error(`Unsupported asset kind: ${definition.kind}`);
  }
  async function loadAssets(manifest = ASSET_MANIFEST) {
    const ids = Object.keys(manifest);
    const entries = await Promise.all(ids.map(async (id) => [id, await loadAsset(manifest[id])]));
    return Object.fromEntries(entries);
  }

  // src/Pathfinder.js
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

  class Pathfinder {
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
      layout = null
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
      this.goal = goal ? this.legacyMode && !layout ? cloneCell(goal) : clonePoint(goal) : null;
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
      this.layout = { ...this.layout ?? {}, ...layout };
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
        this.layout = { ...this.layout ?? {}, ...layout };
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
        y: Math.floor((pointValue.y - originY) / cellSize)
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
        y: originY + (cellValue.y + 0.5) * cellSize
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
          blocked: node.blocked
        })),
        edges: graph.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          length: edge.length
        })),
        blockers: graph.blockers.map((blocker) => ({
          x: blocker.x,
          y: blocker.y,
          radius: blocker.radius,
          margin: blocker.margin,
          key: blocker.key
        }))
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
        y: (bounds.minY + bounds.maxY) * 0.5
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
        y: (bounds.minY + bounds.maxY) * 0.5
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
        const baseRadius = isFiniteNumber(blocker.baseRadius) ? Number(blocker.baseRadius) : this.getCellSize() * 0.34;
        radius = Math.max(0, baseRadius);
      }
      return {
        x: point.x,
        y: point.y,
        radius,
        margin,
        cell,
        key: `${point.x.toFixed(3)},${point.y.toFixed(3)},${(radius + margin).toFixed(3)}`
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
        const baseRadius = isFiniteNumber(field.baseRadius) ? Number(field.baseRadius) : this.getCellSize() * 0.42;
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
        key: `${point.x.toFixed(3)},${point.y.toFixed(3)},${(radius + margin).toFixed(3)},${weight.toFixed(3)},${hard ? 1 : 0}`
      };
    }
    _getBounds() {
      if (isFiniteNumber(this.width) && isFiniteNumber(this.height)) {
        if (this.layout && isFiniteNumber(this.layout.originX) && isFiniteNumber(this.layout.originY)) {
          return {
            minX: Number(this.layout.originX),
            minY: Number(this.layout.originY),
            maxX: Number(this.layout.originX) + Number(this.width),
            maxY: Number(this.layout.originY) + Number(this.height)
          };
        }
        return {
          minX: 0,
          minY: 0,
          maxX: Number(this.width),
          maxY: Number(this.height)
        };
      }
      if (this.layout && isFiniteNumber(this.layout.width) && isFiniteNumber(this.layout.height)) {
        return {
          minX: Number(this.layout.originX ?? 0),
          minY: Number(this.layout.originY ?? 0),
          maxX: Number(this.layout.originX ?? 0) + Number(this.layout.width),
          maxY: Number(this.layout.originY ?? 0) + Number(this.layout.height)
        };
      }
      const inferredWidth = Math.max(this.sampleStep * 6, (this.cols ?? 0) * this.sampleStep, pointDistance(this.spawn ?? { x: 0, y: 0 }, this.goalPoint ?? { x: this.sampleStep * 4, y: 0 }) + this.margin * 4);
      const inferredHeight = Math.max(this.sampleStep * 6, (this.rows ?? 0) * this.sampleStep || this.sampleStep * 6);
      return {
        minX: 0,
        minY: 0,
        maxX: inferredWidth,
        maxY: inferredHeight
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
        this._blockerSignature(fieldList)
      ].join("::");
      if (this._graphCache && this._graphCacheKey === cacheKey) {
        return this._graphCache;
      }
      const nodes = [];
      const grid = [];
      const xCoords = [];
      const yCoords = [];
      const step = this.sampleStep;
      const epsilon = 0.000001;
      for (let x = bounds.minX;x <= bounds.maxX + epsilon; x += step) {
        xCoords.push(Number(x.toFixed(6)));
      }
      if (xCoords.length === 0 || xCoords[xCoords.length - 1] !== bounds.maxX) {
        xCoords.push(bounds.maxX);
      }
      for (let y = bounds.minY;y <= bounds.maxY + epsilon; y += step) {
        yCoords.push(Number(y.toFixed(6)));
      }
      if (yCoords.length === 0 || yCoords[yCoords.length - 1] !== bounds.maxY) {
        yCoords.push(bounds.maxY);
      }
      for (let row = 0;row < yCoords.length; row += 1) {
        grid[row] = [];
        for (let col = 0;col < xCoords.length; col += 1) {
          const node = {
            x: xCoords[col],
            y: yCoords[row],
            key: `${xCoords[col].toFixed(3)},${yCoords[row].toFixed(3)}`,
            row,
            col,
            blocked: false,
            neighbors: []
          };
          node.blocked = this._pointBlocked(node, blockerList) || this._pointBlocked(node, hardFields);
          node.weight = 1 + this._fieldPenalty(node, softFields);
          grid[row][col] = node;
          nodes.push(node);
        }
      }
      const edgeSet = new Map;
      const neighborOffsets = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
      ];
      for (let row = 0;row < grid.length; row += 1) {
        for (let col = 0;col < grid[row].length; col += 1) {
          const node = grid[row][col];
          if (node.blocked) {
            continue;
          }
          for (const [dx, dy] of neighborOffsets) {
            const candidates = [
              [col + dx, row + dy],
              [col - dx, row - dy]
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
                  length: pointDistance(node, neighbor)
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
        fields: fieldList
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
        if (distance <= radius - 0.000001) {
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
            distance
          });
        }
      }
      candidates.sort((a, b) => a.distance - b.distance || a.node.key.localeCompare(b.node.key));
      return candidates.slice(0, 12).map((entry) => entry.node);
    }
    _buildSearchGraph(startPoint, goalPoint, blockers, fields) {
      const baseGraph = this._getGraph(blockers, fields);
      const nodeCopies = new Map;
      for (const node of baseGraph.nodes) {
        nodeCopies.set(node.key, {
          x: node.x,
          y: node.y,
          key: node.key,
          row: node.row,
          col: node.col,
          blocked: node.blocked,
          neighbors: []
        });
      }
      for (const node of baseGraph.nodes) {
        const copy = nodeCopies.get(node.key);
        copy.neighbors = node.neighbors.map((neighbor) => nodeCopies.get(neighbor.key)).filter(Boolean);
      }
      const graph = {
        ...baseGraph,
        nodes: Array.from(nodeCopies.values())
      };
      const startNode = {
        x: startPoint.x,
        y: startPoint.y,
        key: `start:${pointKey(startPoint)}`,
        blocked: this._pointBlocked(startPoint, graph.blockers),
        neighbors: [],
        temp: true
      };
      const goalNode = {
        x: goalPoint.x,
        y: goalPoint.y,
        key: `goal:${pointKey(goalPoint)}`,
        blocked: this._pointBlocked(goalPoint, graph.blockers),
        neighbors: [],
        temp: true
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
      const cameFrom = new Map;
      const gScore = new Map([[startNode.key, 0]]);
      const fScore = new Map([[startNode.key, heuristic(startNode, goalNode)]]);
      const closed = new Set;
      const pickBestIndex = () => {
        let bestIndex = 0;
        let bestNode = open[0];
        let bestF = fScore.get(bestNode.key) ?? Number.POSITIVE_INFINITY;
        let bestG = gScore.get(bestNode.key) ?? Number.POSITIVE_INFINITY;
        for (let index = 1;index < open.length; index += 1) {
          const candidate = open[index];
          const candidateF = fScore.get(candidate.key) ?? Number.POSITIVE_INFINITY;
          const candidateG = gScore.get(candidate.key) ?? Number.POSITIVE_INFINITY;
          if (candidateF < bestF || candidateF === bestF && candidateG < bestG || candidateF === bestF && candidateG === bestG && candidate.key < bestNode.key) {
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
          if (tentativeG >= existingG - 0.000000001) {
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
        for (;lookAhead > anchorIndex + 1; lookAhead -= 1) {
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
      for (let index = 1;index < smoothed.length; index += 1) {
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
        cell: this.pointToCell(point)
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

  // src/tower-data.js
  var TOWER_TYPES = Object.freeze({
    splash: {
      label: "Splash",
      roleLabel: "Area burst",
      family: "splash",
      cost: 60,
      rangeCells: 2.7,
      fireRate: 1.15,
      projectileSpeed: 430,
      damage: 24,
      impactRadiusCells: 1.45,
      arcHeight: 0.28,
      color: "#7df3ff",
      glow: "rgba(125, 243, 255, 0.34)",
      trail: "rgba(125, 243, 255, 0.8)"
    },
    splash_prism: {
      label: "Prism Splash",
      roleLabel: "Fracture bloom",
      family: "splash",
      cost: 82,
      rangeCells: 3.15,
      fireRate: 1.32,
      projectileSpeed: 460,
      damage: 28,
      impactRadiusCells: 1.7,
      arcHeight: 0.32,
      color: "#9ef9ff",
      glow: "rgba(126, 255, 247, 0.34)",
      trail: "rgba(126, 255, 247, 0.84)"
    },
    splash_breach: {
      label: "Breach Splash",
      roleLabel: "Siegebreaker",
      family: "splash",
      cost: 94,
      rangeCells: 3.35,
      fireRate: 1.05,
      projectileSpeed: 495,
      damage: 34,
      impactRadiusCells: 1.95,
      arcHeight: 0.28,
      revealHidden: true,
      color: "#d4fffb",
      glow: "rgba(125, 243, 255, 0.42)",
      trail: "rgba(125, 243, 255, 0.9)"
    },
    slow: {
      label: "Slow",
      roleLabel: "Frost field",
      family: "slow",
      cost: 50,
      rangeCells: 3.2,
      fireRate: 0.95,
      projectileSpeed: 390,
      damage: 11,
      impactRadiusCells: 0.55,
      slowFactor: 0.55,
      slowDuration: 1.8,
      controlBonus: 0.12,
      color: "#7d8dff",
      glow: "rgba(125, 141, 255, 0.34)",
      trail: "rgba(125, 141, 255, 0.82)"
    },
    slow_fracture: {
      label: "Fracture Slow",
      roleLabel: "Lockfield",
      family: "slow",
      cost: 68,
      rangeCells: 3.6,
      fireRate: 1.08,
      projectileSpeed: 420,
      damage: 13,
      impactRadiusCells: 0.7,
      slowFactor: 0.42,
      slowDuration: 2.3,
      controlBonus: 0.16,
      color: "#98a4ff",
      glow: "rgba(125, 141, 255, 0.38)",
      trail: "rgba(125, 141, 255, 0.86)"
    },
    slow_glacier: {
      label: "Glacier Slow",
      roleLabel: "Permafrost",
      family: "slow",
      cost: 88,
      rangeCells: 3.9,
      fireRate: 0.88,
      projectileSpeed: 400,
      damage: 15,
      impactRadiusCells: 0.8,
      slowFactor: 0.36,
      slowDuration: 2.7,
      controlBonus: 0.2,
      revealHidden: true,
      color: "#b8c0ff",
      glow: "rgba(170, 178, 255, 0.42)",
      trail: "rgba(170, 178, 255, 0.9)"
    },
    burn: {
      label: "Burn",
      roleLabel: "Damage over time",
      family: "burn",
      cost: 70,
      rangeCells: 2.9,
      fireRate: 0.82,
      projectileSpeed: 410,
      damage: 8,
      impactRadiusCells: 0.6,
      burnDps: 18,
      burnDuration: 3.2,
      burnTickInterval: 0.25,
      burnAmplify: 1,
      color: "#ffae57",
      glow: "rgba(255, 174, 87, 0.34)",
      trail: "rgba(255, 174, 87, 0.82)"
    },
    burn_solar: {
      label: "Solar Burn",
      roleLabel: "Incinerator",
      family: "burn",
      cost: 92,
      rangeCells: 3.15,
      fireRate: 0.96,
      projectileSpeed: 448,
      damage: 11,
      impactRadiusCells: 0.75,
      burnDps: 24,
      burnDuration: 3.8,
      burnTickInterval: 0.22,
      burnAmplify: 1.16,
      color: "#ffd08f",
      glow: "rgba(255, 174, 87, 0.4)",
      trail: "rgba(255, 174, 87, 0.88)"
    },
    burn_inferno: {
      label: "Inferno Burn",
      roleLabel: "Ember crown",
      family: "burn",
      cost: 110,
      rangeCells: 3.35,
      fireRate: 0.75,
      projectileSpeed: 470,
      damage: 13,
      impactRadiusCells: 0.82,
      burnDps: 30,
      burnDuration: 4.2,
      burnTickInterval: 0.2,
      burnAmplify: 1.28,
      revealHidden: true,
      color: "#ffe6b1",
      glow: "rgba(255, 174, 87, 0.48)",
      trail: "rgba(255, 198, 130, 0.92)"
    },
    needle: {
      label: "Needle",
      roleLabel: "Focus line",
      family: "needle",
      cost: 66,
      rangeCells: 3.4,
      fireRate: 2.3,
      projectileSpeed: 610,
      damage: 10,
      impactRadiusCells: 0.34,
      markDuration: 1.6,
      markEnergy: 1,
      critBonus: 1.18,
      color: "#6ef8d7",
      glow: "rgba(110, 248, 215, 0.36)",
      trail: "rgba(110, 248, 215, 0.82)"
    },
    needle_quasar: {
      label: "Quasar Needle",
      roleLabel: "Rapid-fire single-target DPS",
      family: "needle",
      cost: 88,
      rangeCells: 3.85,
      fireRate: 3.85,
      projectileSpeed: 670,
      damage: 8,
      impactRadiusCells: 0.3,
      markDuration: 1.95,
      markEnergy: 1.5,
      critBonus: 1.32,
      color: "#a2ffee",
      glow: "rgba(110, 248, 215, 0.42)",
      trail: "rgba(110, 248, 215, 0.9)"
    },
    needle_lance: {
      label: "Lance Needle",
      roleLabel: "Pierce cutter",
      family: "needle",
      cost: 98,
      rangeCells: 4.05,
      fireRate: 2.95,
      projectileSpeed: 700,
      damage: 12,
      impactRadiusCells: 0.36,
      markDuration: 1.5,
      markEnergy: 1.25,
      critBonus: 1.24,
      color: "#d3fff2",
      glow: "rgba(110, 248, 215, 0.46)",
      trail: "rgba(110, 248, 215, 0.92)"
    },
    relay: {
      label: "Relay",
      roleLabel: "Energy conduit",
      family: "relay",
      cost: 58,
      rangeCells: 3.05,
      fireRate: 0.88,
      projectileSpeed: 430,
      damage: 6,
      impactRadiusCells: 0.45,
      markDuration: 2.1,
      scanReward: 1,
      energyPulse: 2,
      markEnergy: 1,
      color: "#ffdf7a",
      glow: "rgba(255, 223, 122, 0.34)",
      trail: "rgba(255, 223, 122, 0.82)"
    },
    relay_chain: {
      label: "Chain Relay",
      roleLabel: "Scan lattice",
      family: "relay",
      cost: 76,
      rangeCells: 3.45,
      fireRate: 1.02,
      projectileSpeed: 470,
      damage: 7,
      impactRadiusCells: 0.5,
      markDuration: 2.8,
      scanReward: 2,
      energyPulse: 3,
      markEnergy: 1.5,
      scanRadiusCells: 4.2,
      color: "#ffe79d",
      glow: "rgba(255, 223, 122, 0.4)",
      trail: "rgba(255, 223, 122, 0.88)"
    },
    relay_capacitor: {
      label: "Capacitor Relay",
      roleLabel: "Energy-generation support",
      family: "relay",
      cost: 92,
      rangeCells: 3.7,
      fireRate: 0.92,
      projectileSpeed: 500,
      damage: 8,
      impactRadiusCells: 0.54,
      markDuration: 2.5,
      scanReward: 2,
      energyPulse: 4,
      markEnergy: 2,
      color: "#fff0b3",
      glow: "rgba(255, 223, 122, 0.46)",
      trail: "rgba(255, 223, 122, 0.92)"
    },
    disrupt: {
      label: "Disrupt",
      roleLabel: "Shield breaker",
      family: "disrupt",
      cost: 62,
      rangeCells: 3.1,
      fireRate: 1.05,
      projectileSpeed: 440,
      damage: 7,
      impactRadiusCells: 0.5,
      shieldBreak: 14,
      exposeDuration: 1.2,
      markDuration: 1.35,
      color: "#d38cff",
      glow: "rgba(211, 140, 255, 0.34)",
      trail: "rgba(211, 140, 255, 0.82)"
    },
    disrupt_breaker: {
      label: "Breaker Disrupt",
      roleLabel: "Shield rupture",
      family: "disrupt",
      cost: 84,
      rangeCells: 3.45,
      fireRate: 1.12,
      projectileSpeed: 480,
      damage: 9,
      impactRadiusCells: 0.56,
      shieldBreak: 28,
      exposeDuration: 1.8,
      markDuration: 1.9,
      color: "#ecbbff",
      glow: "rgba(211, 140, 255, 0.4)",
      trail: "rgba(211, 140, 255, 0.88)"
    },
    disrupt_veil: {
      label: "Veil Disrupt",
      roleLabel: "Vulnerability veil",
      family: "disrupt",
      cost: 96,
      rangeCells: 3.65,
      fireRate: 1,
      projectileSpeed: 500,
      damage: 10,
      impactRadiusCells: 0.6,
      shieldBreak: 20,
      exposeDuration: 2.2,
      markDuration: 2.4,
      color: "#f1d0ff",
      glow: "rgba(211, 140, 255, 0.46)",
      trail: "rgba(211, 140, 255, 0.92)"
    }
  });
  var TOWER_UPGRADES = Object.freeze({
    splash: {
      label: "Splash",
      branches: [
        {
          id: "prism",
          label: "Prism Bloom",
          finalRole: "Fracture bloom",
          type: "splash_prism",
          cost: 82,
          note: "Wider radius and quicker follow-up shots."
        },
        {
          id: "breach",
          label: "Breach Lens",
          finalRole: "Siegebreaker",
          type: "splash_breach",
          cost: 94,
          note: "Harder hits with the largest blast."
        }
      ]
    },
    slow: {
      label: "Slow",
      branches: [
        {
          id: "fracture",
          label: "Fracture Net",
          finalRole: "Lockfield",
          type: "slow_fracture",
          cost: 68,
          note: "Stronger slow with a wider catch radius."
        },
        {
          id: "glacier",
          label: "Glacier Coil",
          finalRole: "Permafrost",
          type: "slow_glacier",
          cost: 88,
          note: "Longer lock and broader control range."
        }
      ]
    },
    burn: {
      label: "Burn",
      branches: [
        {
          id: "solar",
          label: "Solar Furnace",
          finalRole: "Incinerator",
          type: "burn_solar",
          cost: 92,
          note: "Higher uptime and stronger burn ticks."
        },
        {
          id: "inferno",
          label: "Inferno Crown",
          finalRole: "Ember crown",
          type: "burn_inferno",
          cost: 110,
          note: "Longest burn and the hardest edge damage."
        }
      ]
    },
    needle: {
      label: "Needle",
      branches: [
        {
          id: "quasar",
          label: "Quasar Spike",
          finalRole: "Rapid-fire single-target DPS",
          type: "needle_quasar",
          cost: 88,
          note: "Fastest fire cycle and the best mark chaining."
        },
        {
          id: "lance",
          label: "Lance Needle",
          finalRole: "Pierce cutter",
          type: "needle_lance",
          cost: 98,
          note: "Long range precision with stronger finish hits."
        }
      ]
    },
    relay: {
      label: "Relay",
      branches: [
        {
          id: "chain",
          label: "Chain Relay",
          finalRole: "Scan lattice",
          type: "relay_chain",
          cost: 76,
          note: "Better mark uptime and more scan rewards."
        },
        {
          id: "capacitor",
          label: "Capacitor Web",
          finalRole: "Energy-generation support",
          type: "relay_capacitor",
          cost: 92,
          note: "Highest energy pulse and the strongest chain reward."
        }
      ]
    },
    disrupt: {
      label: "Disrupt",
      branches: [
        {
          id: "breaker",
          label: "Breaker Core",
          finalRole: "Shield rupture",
          type: "disrupt_breaker",
          cost: 84,
          note: "Big shield strip and longer expose window."
        },
        {
          id: "veil",
          label: "Vulnerability Veil",
          finalRole: "Vulnerability veil",
          type: "disrupt_veil",
          cost: 96,
          note: "Best debuff uptime and strongest follow-up exposure."
        }
      ]
    }
  });

  // src/effects.js
  function createScreenLayer() {
    return {
      damage: 0,
      win: 0,
      gameOver: 0,
      spawn: 0,
      upgrade: 0,
      energy: 0,
      death: 0,
      boss: 0,
      disruption: 0
    };
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function createEffects() {
    return {
      particles: [],
      screen: createScreenLayer(),
      wobble: 0
    };
  }
  function triggerScreenFlash(effects, kind, amount = 1) {
    if (!effects?.screen || !Object.hasOwn(effects.screen, kind)) {
      return;
    }
    effects.screen[kind] = Math.max(effects.screen[kind], amount);
    effects.wobble = Math.max(effects.wobble, amount * 0.6);
  }
  function spawnBurst(effects, { x, y, color = "#7df3ff", count = 10, speed = 160, life = 0.45, spread = Math.PI * 2, size = 2.6, glow = 0.8, ring = false }) {
    if (!effects) {
      return;
    }
    const particles = effects.particles;
    for (let i = 0;i < count; i += 1) {
      const angle = rand(0, spread);
      const velocity = rand(speed * 0.45, speed);
      particles.push({
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        ttl: life,
        size: rand(size * 0.7, size * 1.2),
        color,
        glow,
        ring
      });
    }
  }
  function spawnShockwave(effects, { x, y, color = "#7df3ff", radius = 16, life = 0.4 }) {
    if (!effects) {
      return;
    }
    effects.particles.push({
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      life,
      ttl: life,
      size: radius,
      color,
      glow: 1,
      ring: true
    });
  }
  function spawnHologramPulse(effects, { x, y, color = "#bffcff", radius = 28, life = 0.55 }) {
    if (!effects) {
      return;
    }
    effects.particles.push({
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      life,
      ttl: life,
      size: radius,
      color,
      glow: 1.15,
      ring: true
    });
  }
  function updateEffects(effects, dt) {
    if (!effects) {
      return;
    }
    const fadeRate = 1.9;
    const screen = effects.screen;
    screen.damage = Math.max(0, screen.damage - dt * fadeRate);
    screen.win = Math.max(0, screen.win - dt * 0.9);
    screen.gameOver = Math.max(0, screen.gameOver - dt * 0.8);
    screen.spawn = Math.max(0, screen.spawn - dt * 1.6);
    screen.upgrade = Math.max(0, screen.upgrade - dt * 1.8);
    screen.energy = Math.max(0, screen.energy - dt * 1.4);
    screen.death = Math.max(0, screen.death - dt * 1.5);
    screen.boss = Math.max(0, screen.boss - dt * 1.3);
    screen.disruption = Math.max(0, screen.disruption - dt * 1.5);
    effects.wobble = Math.max(0, effects.wobble - dt * 1.4);
    for (const particle of effects.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.975;
      particle.vy *= 0.975;
    }
    effects.particles = effects.particles.filter((particle) => particle.life > 0);
  }
  function drawParticles(ctx, effects) {
    for (const particle of effects.particles) {
      const progress = 1 - particle.life / particle.ttl;
      ctx.save();
      ctx.globalAlpha = Math.max(0, particle.life / particle.ttl);
      ctx.translate(particle.x, particle.y);
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 18 * particle.glow;
      ctx.fillStyle = particle.color;
      if (particle.ring) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = particle.color;
        ctx.beginPath();
        ctx.arc(0, 0, particle.size + progress * 18, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, particle.size * (1 - progress * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  function overlayFlash(ctx, width, height, color, intensity, mode = "screen") {
    if (intensity <= 0) {
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.min(0.75, intensity);
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  function drawEffects(ctx, effects, width, height) {
    if (!effects) {
      return;
    }
    drawParticles(ctx, effects);
    overlayFlash(ctx, width, height, "rgba(255, 102, 118, 1)", effects.screen.damage * 0.28, "screen");
    overlayFlash(ctx, width, height, "rgba(125, 243, 255, 1)", effects.screen.spawn * 0.18, "screen");
    overlayFlash(ctx, width, height, "rgba(125, 141, 255, 1)", effects.screen.upgrade * 0.2, "screen");
    overlayFlash(ctx, width, height, "rgba(255, 223, 122, 1)", effects.screen.energy * 0.18, "screen");
    overlayFlash(ctx, width, height, "rgba(255, 255, 255, 1)", effects.screen.death * 0.16, "screen");
    overlayFlash(ctx, width, height, "rgba(191, 252, 255, 1)", effects.screen.boss * 0.24, "screen");
    overlayFlash(ctx, width, height, "rgba(125, 243, 255, 1)", effects.screen.disruption * 0.12, "screen");
    overlayFlash(ctx, width, height, "rgba(125, 243, 255, 1)", effects.screen.win * 0.22, "screen");
    overlayFlash(ctx, width, height, "rgba(255, 111, 125, 1)", effects.screen.gameOver * 0.28, "source-over");
    if (effects.screen.gameOver > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, effects.screen.gameOver * 0.35);
      ctx.fillStyle = "rgba(2, 4, 8, 0.55)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  // src/enemy-data.js
  function freeze(value) {
    return Object.freeze(value);
  }
  function makeTraits(traits = {}) {
    return freeze({ ...traits });
  }
  function makeEnemy(kind, data) {
    return freeze({
      kind,
      ...data,
      traits: makeTraits(data.traits ?? {})
    });
  }
  function actionBase(type, data = {}) {
    return freeze({ type, ...data });
  }
  function burst(kind, count, spawnPoint = "left-mid", data = {}) {
    return actionBase("burst", {
      kind,
      count,
      spawnPoint,
      ...data
    });
  }
  function interval(kind, count, every, spawnPoint = "left-mid", data = {}) {
    return actionBase("interval", {
      kind,
      count,
      every,
      spawnPoint,
      ...data
    });
  }
  function wait(duration) {
    return actionBase("wait", { duration });
  }
  function mix(groups, data = {}) {
    return actionBase("mix", {
      groups: groups.map((group) => freeze({ ...group })),
      ...data
    });
  }
  var ENEMY_TYPES = freeze({
    scout: makeEnemy("scout", {
      label: "Scout",
      maxHealth: 40,
      speedCells: 1.6,
      radius: 12,
      tint: "#7df3ff",
      reward: 6
    }),
    shell: makeEnemy("shell", {
      label: "Shell",
      maxHealth: 68,
      speedCells: 1.28,
      radius: 13,
      tint: "#7d8dff",
      reward: 8,
      traits: {
        splashResistance: 0.82,
        burnResistance: 1.08
      }
    }),
    brute: makeEnemy("brute", {
      label: "Brute",
      maxHealth: 110,
      speedCells: 1.05,
      radius: 15,
      tint: "#ffae57",
      reward: 12,
      traits: {
        slowWeak: 1.4,
        burnResistance: 1.2
      }
    }),
    warden: makeEnemy("warden", {
      label: "Warden",
      maxHealth: 170,
      speedCells: 0.92,
      radius: 17,
      tint: "#ffd580",
      reward: 20,
      traits: {
        shielded: true,
        slowResistance: 0.62,
        burnResistance: 0.92,
        disruptWeak: 1.28
      }
    }),
    overseer: makeEnemy("overseer", {
      label: "Overseer",
      maxHealth: 320,
      speedCells: 0.78,
      radius: 22,
      tint: "#bffcff",
      reward: 42,
      boss: true,
      traits: {
        shielded: true,
        slowImmune: true,
        burnResistance: 0.78,
        disruptWeak: 1.4
      }
    }),
    ember: makeEnemy("ember", {
      label: "Ember Shade",
      maxHealth: 52,
      speedCells: 1.5,
      radius: 11,
      tint: "#ff8c61",
      reward: 9,
      traits: {
        burnWeak: 1.7
      }
    }),
    husk: makeEnemy("husk", {
      label: "Glacier Husk",
      maxHealth: 98,
      speedCells: 1.12,
      radius: 14,
      tint: "#9cc6ff",
      reward: 11,
      traits: {
        slowImmune: true
      }
    }),
    prism: makeEnemy("prism", {
      label: "Prism Bulwark",
      maxHealth: 152,
      speedCells: 0.98,
      radius: 15,
      tint: "#a8f7ff",
      reward: 16,
      traits: {
        splashResistance: 0.55
      }
    }),
    breaker: makeEnemy("breaker", {
      label: "Breaker Node",
      maxHealth: 128,
      speedCells: 1.18,
      radius: 14,
      tint: "#ffd06f",
      reward: 18,
      traits: {
        shieldbreakerPriority: true,
        targetPriority: 4
      }
    }),
    flicker: makeEnemy("flicker", {
      label: "Flicker Shade",
      maxHealth: 88,
      speedCells: 1.3,
      radius: 12,
      tint: "#d5ffff",
      reward: 15,
      traits: {
        hidden: true,
        flicker: true,
        scanRequired: true
      }
    }),
    projector: makeEnemy("projector", {
      label: "Shield Projector",
      maxHealth: 94,
      speedCells: 1,
      radius: 13,
      tint: "#7df3ff",
      reward: 20,
      traits: {
        shieldProjector: true,
        splashResistance: 0.9
      },
      shieldAuraRadius: 92,
      shieldAuraStrength: 0.42
    }),
    carrier: makeEnemy("carrier", {
      label: "Carrier Drone",
      maxHealth: 136,
      speedCells: 1.04,
      radius: 15,
      tint: "#b3fbff",
      reward: 22,
      traits: {
        carrier: true
      },
      deathSpawn: [
        { kind: "ember", count: 4, spread: 0.35 },
        { kind: "flicker", count: 2, spread: 0.16 }
      ]
    }),
    phase_titan: makeEnemy("phase_titan", {
      label: "Phase Titan",
      maxHealth: 248,
      speedCells: 1.42,
      radius: 18,
      tint: "#9ce6ff",
      reward: 28,
      traits: {
        phaseShift: true,
        splashResistance: 0.34,
        burnResistance: 0.88,
        targetPriority: 5
      }
    }),
    echo_weaver: makeEnemy("echo_weaver", {
      label: "Echo Weaver",
      maxHealth: 122,
      speedCells: 1.26,
      radius: 14,
      tint: "#d7f7ff",
      reward: 20,
      traits: {
        hidden: true,
        flicker: true,
        scanRequired: true,
        splashResistance: 0.76,
        mirrorCaster: true
      },
      deathSpawn: [
        { kind: "flicker", count: 2, spread: 0.18 },
        { kind: "ember", count: 2, spread: 0.16 }
      ]
    }),
    mirror_archon: makeEnemy("mirror_archon", {
      label: "Mirror Archon",
      maxHealth: 560,
      speedCells: 0.98,
      radius: 24,
      tint: "#d8ffff",
      reward: 86,
      boss: true,
      traits: {
        boss: true,
        phaseShift: true,
        splashResistance: 0.4,
        shielded: true,
        slowResistance: 0.84,
        burnResistance: 0.82,
        disruptWeak: 1.28,
        targetPriority: 6
      },
      shieldAuraRadius: 104,
      shieldAuraStrength: 0.24,
      deathSpawn: [
        { kind: "phase_titan", count: 2, spread: 0.2 },
        { kind: "echo_weaver", count: 3, spread: 0.24 }
      ],
      disruption: {
        pulseSeconds: 2.2,
        fieldSeconds: 1.7,
        hardFieldWeight: 15,
        softFieldWeight: 10
      }
    }),
    lattice_overseer: makeEnemy("lattice_overseer", {
      label: "Lattice Crown",
      maxHealth: 780,
      speedCells: 0.72,
      radius: 26,
      tint: "#bffcff",
      reward: 120,
      boss: true,
      traits: {
        boss: true,
        hidden: false,
        shieldbreakerPriority: true,
        targetPriority: 6,
        slowImmune: true,
        burnResistance: 0.72,
        disruptWeak: 1.5
      },
      shieldAuraRadius: 118,
      shieldAuraStrength: 0.3,
      deathSpawn: [
        { kind: "carrier", count: 3, spread: 0.28 },
        { kind: "flicker", count: 8, spread: 0.45 },
        { kind: "ember", count: 6, spread: 0.4 }
      ],
      disruption: {
        pulseSeconds: 2.5,
        fieldSeconds: 2.1,
        hardFieldWeight: 18,
        softFieldWeight: 12
      }
    }),
    gap_colossus: makeEnemy("gap_colossus", {
      label: "Gap Colossus",
      maxHealth: 264,
      speedCells: 1.48,
      radius: 19,
      tint: "#aef8ff",
      reward: 30,
      traits: {
        phaseShift: true,
        splashResistance: 0.28,
        burnResistance: 0.92,
        targetPriority: 5
      }
    }),
    lattice_seraph: makeEnemy("lattice_seraph", {
      label: "Lattice Seraph",
      maxHealth: 176,
      speedCells: 1.18,
      radius: 16,
      tint: "#d8fcff",
      reward: 26,
      traits: {
        shieldProjector: true,
        mirrorCaster: true,
        hidden: true,
        scanRequired: true,
        splashResistance: 0.7,
        targetPriority: 5
      },
      shieldAuraRadius: 108,
      shieldAuraStrength: 0.26
    }),
    holo_regent: makeEnemy("holo_regent", {
      label: "Holo Regent",
      maxHealth: 980,
      speedCells: 0.84,
      radius: 30,
      tint: "#dffeff",
      reward: 150,
      boss: true,
      traits: {
        boss: true,
        phaseShift: true,
        shielded: true,
        mirrorCaster: true,
        splashResistance: 0.46,
        slowResistance: 0.78,
        burnResistance: 0.8,
        disruptWeak: 1.34,
        targetPriority: 7
      },
      shieldAuraRadius: 126,
      shieldAuraStrength: 0.32,
      deathSpawn: [
        { kind: "gap_colossus", count: 2, spread: 0.22 },
        { kind: "lattice_seraph", count: 3, spread: 0.28 },
        { kind: "echo_weaver", count: 4, spread: 0.34 }
      ],
      disruption: {
        pulseSeconds: 1.9,
        fieldSeconds: 2.3,
        hardFieldWeight: 20,
        softFieldWeight: 13
      }
    })
  });
  var DEFAULT_WAVES = freeze([
    freeze({
      name: "Signal",
      actions: [
        burst("scout", 6, "left-mid"),
        wait(1),
        interval("scout", 4, 0.18, "right-mid"),
        burst("shell", 2, "left-upper")
      ]
    }),
    freeze({
      name: "Pulse",
      actions: [
        interval("scout", 5, 0.2, "left-upper"),
        wait(0.75),
        mix([
          { kind: "scout", count: 3, every: 0.16 },
          { kind: "shell", count: 2, every: 0.22 }
        ], { spawnPoint: "right-lower" }),
        burst("shell", 3, "left-lower")
      ]
    }),
    freeze({
      name: "Rift",
      actions: [
        burst("scout", 4, "left-mid"),
        mix([
          { kind: "shell", count: 3, every: 0.18 },
          { kind: "ember", count: 2, every: 0.2 }
        ], { spawnPoint: "right-upper" }),
        wait(0.95),
        interval("brute", 3, 0.42, "left-upper"),
        burst("prism", 2, "right-mid")
      ]
    }),
    freeze({
      name: "Echo",
      actions: [
        mix([
          { kind: "shell", count: 4, every: 0.18 },
          { kind: "brute", count: 2, every: 0.28 }
        ], { spawnPoint: "left-lower" }),
        wait(1.2),
        burst("breaker", 2, "right-lower"),
        interval("scout", 6, 0.14, "left-upper")
      ]
    }),
    freeze({
      name: "Fracture",
      actions: [
        burst("ember", 4, "left-upper"),
        wait(0.6),
        mix([
          { kind: "shell", count: 4, every: 0.16 },
          { kind: "prism", count: 2, every: 0.3 }
        ], { spawnPoint: "right-upper" }),
        interval("brute", 5, 0.22, "left-mid")
      ]
    }),
    freeze({
      name: "Overload",
      actions: [
        interval("husk", 4, 0.22, "left-lower"),
        wait(0.8),
        burst("projector", 2, "right-upper"),
        mix([
          { kind: "breaker", count: 3, every: 0.16 },
          { kind: "shell", count: 4, every: 0.12 }
        ], { spawnPoint: "left-upper" })
      ]
    }),
    freeze({
      name: "Cascade",
      actions: [
        mix([
          { kind: "brute", count: 4, every: 0.2 },
          { kind: "prism", count: 2, every: 0.28 },
          { kind: "carrier", count: 2, every: 0.34 }
        ], { spawnPoint: "right-mid" }),
        wait(1),
        burst("flicker", 3, "left-mid"),
        interval("shell", 6, 0.16, "right-lower")
      ]
    }),
    freeze({
      name: "Crown",
      briefing: "First crown-class breach. Strip shields early so the Phase Titans do not sprint through the center lane.",
      actions: [
        wait(1),
        burst("overseer", 1, "right-mid"),
        burst("warden", 2, "left-upper"),
        interval("phase_titan", 3, 0.52, "left-mid"),
        mix([
          { kind: "projector", count: 2, every: 0.18 },
          { kind: "breaker", count: 3, every: 0.16 }
        ], { spawnPoint: "right-upper" })
      ]
    }),
    freeze({
      name: "Surge",
      actions: [
        burst("scout", 8, "left-upper"),
        wait(0.65),
        interval("shell", 8, 0.12, "right-upper"),
        burst("ember", 5, "left-mid"),
        burst("breaker", 2, "right-mid")
      ]
    }),
    freeze({
      name: "Anomaly",
      actions: [
        mix([
          { kind: "carrier", count: 3, every: 0.26 },
          { kind: "projector", count: 2, every: 0.2 }
        ], { spawnPoint: "left-lower" }),
        wait(1.1),
        burst("prism", 4, "right-lower"),
        interval("echo_weaver", 3, 0.36, "right-upper"),
        burst("flicker", 3, "left-mid")
      ]
    }),
    freeze({
      name: "Zenith",
      actions: [
        interval("breaker", 6, 0.18, "left-mid"),
        wait(0.7),
        mix([
          { kind: "ember", count: 5, every: 0.14 },
          { kind: "husk", count: 4, every: 0.18 }
        ], { spawnPoint: "right-mid" }),
        burst("warden", 3, "left-upper")
      ]
    }),
    freeze({
      name: "Mirage",
      actions: [
        burst("flicker", 4, "left-upper"),
        wait(0.5),
        mix([
          { kind: "shell", count: 4, every: 0.14 },
          { kind: "flicker", count: 4, every: 0.12 },
          { kind: "breaker", count: 2, every: 0.2 }
        ], { spawnPoint: "right-upper" }),
        interval("carrier", 3, 0.34, "left-lower")
      ]
    }),
    freeze({
      name: "Bastion",
      actions: [
        mix([
          { kind: "husk", count: 6, every: 0.18 },
          { kind: "prism", count: 4, every: 0.22 }
        ], { spawnPoint: "left-mid" }),
        wait(1),
        burst("projector", 3, "right-mid"),
        interval("phase_titan", 4, 0.58, "right-lower"),
        burst("breaker", 3, "left-upper")
      ]
    }),
    freeze({
      name: "Halo",
      actions: [
        burst("ember", 6, "left-upper"),
        wait(0.45),
        interval("breaker", 7, 0.14, "right-upper"),
        mix([
          { kind: "projector", count: 2, every: 0.16 },
          { kind: "carrier", count: 2, every: 0.22 }
        ], { spawnPoint: "left-lower" })
      ]
    }),
    freeze({
      name: "Eclipse",
      actions: [
        mix([
          { kind: "carrier", count: 4, every: 0.2 },
          { kind: "flicker", count: 5, every: 0.12 },
          { kind: "prism", count: 4, every: 0.18 }
        ], { spawnPoint: "right-mid" }),
        wait(0.8),
        interval("husk", 6, 0.16, "left-upper"),
        burst("overseer", 1, "right-lower")
      ]
    }),
    freeze({
      name: "Parallax",
      actions: [
        burst("echo_weaver", 3, "left-upper"),
        wait(0.55),
        interval("phase_titan", 4, 0.62, "right-mid"),
        mix([
          { kind: "projector", count: 3, every: 0.18 },
          { kind: "carrier", count: 3, every: 0.24 }
        ], { spawnPoint: "left-lower" }),
        burst("breaker", 4, "right-upper")
      ]
    }),
    freeze({
      name: "Mirrorfall",
      boss: true,
      briefing: "Mirror Archon folds false walls across the field. Keep reveal towers online before the boss anchors.",
      actions: [
        wait(0.9),
        burst("projector", 3, "left-upper"),
        mix([
          { kind: "echo_weaver", count: 4, every: 0.18 },
          { kind: "breaker", count: 4, every: 0.16 }
        ], { spawnPoint: "right-upper" }),
        wait(1),
        burst("mirror_archon", 1, "left-mid", { kind: "mirror_archon" }),
        interval("phase_titan", 3, 0.7, "right-mid"),
        burst("carrier", 2, "left-lower")
      ]
    }),
    freeze({
      name: "Hardlight",
      briefing: "Hardlight waves stack bruisers from opposite rails. Save one fast lane answer for the right-mid breach.",
      actions: [
        mix([
          { kind: "phase_titan", count: 4, every: 0.58 },
          { kind: "prism", count: 5, every: 0.16 }
        ], { spawnPoint: "right-mid" }),
        wait(0.7),
        burst("echo_weaver", 4, "left-upper"),
        interval("husk", 5, 0.16, "left-lower"),
        mix([
          { kind: "projector", count: 2, every: 0.16 },
          { kind: "breaker", count: 5, every: 0.14 }
        ], { spawnPoint: "right-upper" })
      ]
    }),
    freeze({
      name: "Lattice Crown",
      boss: true,
      briefing: "The lattice crown floods the board with fake pressure. Stabilize center-left before the crown core arrives.",
      actions: [
        wait(1.2),
        burst("projector", 4, "left-upper"),
        wait(0.9),
        mix([
          { kind: "carrier", count: 4, every: 0.22 },
          { kind: "breaker", count: 5, every: 0.16 }
        ], { spawnPoint: "right-upper" }),
        wait(1.25),
        burst("lattice_overseer", 1, "right-mid", { kind: "lattice_overseer" }),
        interval("flicker", 6, 0.16, "left-mid"),
        wait(0.85),
        mix([
          { kind: "ember", count: 6, every: 0.12 },
          { kind: "prism", count: 4, every: 0.18 }
        ], { spawnPoint: "center-left" })
      ]
    }),
    freeze({
      name: "Ghost Columns",
      briefing: "Gap Colossi sprint in long intervals. Use the breathing room between drops to retarget and rebuild.",
      actions: [
        interval("gap_colossus", 4, 1.15, "left-mid"),
        wait(0.65),
        mix([
          { kind: "echo_weaver", count: 4, every: 0.2 },
          { kind: "breaker", count: 3, every: 0.2 }
        ], { spawnPoint: "right-upper" }),
        burst("carrier", 2, "left-lower")
      ]
    }),
    freeze({
      name: "Seraph Net",
      briefing: "Lattice Seraphs cast mirrored shield webs while fast tanks punch the open route.",
      actions: [
        mix([
          { kind: "lattice_seraph", count: 3, every: 0.45 },
          { kind: "gap_colossus", count: 3, every: 0.9 }
        ], { spawnPoint: "right-mid" }),
        wait(0.8),
        burst("projector", 3, "left-upper"),
        interval("flicker", 5, 0.14, "left-lower")
      ]
    }),
    freeze({
      name: "Regent Broadcast",
      boss: true,
      briefing: "Holo Regent seeds phase walls and shield lattices. Break the shell, then burn the exposed core before the next pulse.",
      actions: [
        wait(1),
        burst("lattice_seraph", 2, "left-upper"),
        mix([
          { kind: "gap_colossus", count: 3, every: 0.88 },
          { kind: "breaker", count: 4, every: 0.18 }
        ], { spawnPoint: "right-upper" }),
        wait(1),
        burst("holo_regent", 1, "left-mid", { kind: "holo_regent" }),
        interval("carrier", 3, 0.28, "right-lower"),
        burst("echo_weaver", 4, "left-lower")
      ]
    })
  ]);

  // src/TowerLogic.js
  var DEFAULT_CELL_SIZE = 64;
  var EPSILON = 0.0001;
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function hypot(dx, dy) {
    return Math.hypot(dx, dy);
  }
  function isLayoutLike(value) {
    return Boolean(value && typeof value === "object" && Number.isFinite(value.cellSize));
  }
  function getLayoutCellSize(layout) {
    return isLayoutLike(layout) ? layout.cellSize : DEFAULT_CELL_SIZE;
  }
  function getCenterFromCell(cell, layout) {
    const cellSize = getLayoutCellSize(layout);
    const originX = layout?.originX ?? 0;
    const originY = layout?.originY ?? 0;
    return {
      x: originX + (cell.x + 0.5) * cellSize,
      y: originY + (cell.y + 0.5) * cellSize
    };
  }
  function normalizePointLike(x, y, layout) {
    if (typeof x === "object" && x !== null) {
      if ("cell" in x && x.cell && Number.isFinite(x.cell.x) && Number.isFinite(x.cell.y)) {
        return {
          cell: { x: x.cell.x, y: x.cell.y },
          x: x.x,
          y: x.y,
          cellSize: x.cellSize ?? getLayoutCellSize(layout)
        };
      }
      if (Number.isFinite(x.x) && Number.isFinite(x.y)) {
        return {
          cell: { x: x.x, y: x.y },
          ...getCenterFromCell(x, layout),
          cellSize: getLayoutCellSize(layout)
        };
      }
    }
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return {
        x,
        y,
        cell: null,
        cellSize: getLayoutCellSize(layout)
      };
    }
    return {
      x: 0,
      y: 0,
      cell: null,
      cellSize: getLayoutCellSize(layout)
    };
  }
  function lookupTowerDefinition(type) {
    return TOWER_TYPES[type] ?? TOWER_TYPES.splash;
  }
  function lookupTowerUpgradeTree(type) {
    return TOWER_UPGRADES[type] ?? null;
  }
  function getEnemyDefinition(enemy) {
    return enemy?.kind ? ENEMY_TYPES[enemy.kind] ?? null : null;
  }
  function getEnemyTraits(enemy) {
    return enemy?.traits ?? getEnemyDefinition(enemy)?.traits ?? {};
  }
  function canTowerDetectEnemy(definition, enemy) {
    if (!enemy) {
      return false;
    }
    if (!getEnemyTraits(enemy).hidden) {
      return true;
    }
    return Boolean(definition?.revealHidden || definition?.scanRadiusCells > 0);
  }
  function enemyTargetPriority(enemy) {
    const traits = getEnemyTraits(enemy);
    if (traits.shieldbreakerPriority) {
      return 4;
    }
    return Number.isFinite(traits.targetPriority) ? Number(traits.targetPriority) : 0;
  }
  function getBaseType(type) {
    if (typeof type !== "string") {
      return "splash";
    }
    return type.split("_")[0] || type;
  }
  function getTowerFamily(type) {
    return lookupTowerDefinition(type).family ?? getBaseType(type);
  }
  function getEnemyTraitValue(enemy, family) {
    const traits = enemy?.traits ?? enemy?.profile?.traits ?? null;
    if (traits && typeof traits === "object") {
      if (family === "slow" && traits.slowImmune) {
        return 1;
      }
      if (family === "burn" && Number.isFinite(traits.burnWeak)) {
        return clamp(traits.burnWeak, 0, 2.5);
      }
      if (family === "splash" && Number.isFinite(traits.splashResistance)) {
        return clamp(traits.splashResistance, 0, 2.5);
      }
      if (family === "disrupt" && traits.shieldbreakerPriority) {
        return 1.2;
      }
    }
    const profile = enemy?.profile ?? enemy?.traitsProfile ?? null;
    if (!profile || typeof profile !== "object") {
      return 1;
    }
    const resistances = profile.resistances ?? enemy?.resistances ?? null;
    if (resistances && Number.isFinite(resistances[family])) {
      return clamp(resistances[family], 0, 2.5);
    }
    const weakness = profile.weaknesses ?? enemy?.weaknesses ?? null;
    if (weakness && Number.isFinite(weakness[family])) {
      return clamp(weakness[family], 0, 2.5);
    }
    return 1;
  }
  function isEffectImmune(enemy, family) {
    const traits = enemy?.traits ?? null;
    if (family === "slow" && traits?.slowImmune) {
      return true;
    }
    if (family === "burn" && traits?.burnImmune) {
      return true;
    }
    const immuneFamilies = enemy?.immuneFamilies ?? enemy?.profile?.immuneFamilies ?? [];
    if (Array.isArray(immuneFamilies) && immuneFamilies.includes(family)) {
      return true;
    }
    if (family === "slow" && enemy?.slowImmune) {
      return true;
    }
    if (family === "burn" && enemy?.burnImmune) {
      return true;
    }
    return false;
  }
  function getShieldValue(enemy) {
    const shield = Number.isFinite(enemy?.shield) ? enemy.shield : 0;
    const auraShield = Number.isFinite(enemy?.auraShield) ? enemy.auraShield : 0;
    return Math.max(0, shield + auraShield);
  }
  function setShieldValue(enemy, nextShield) {
    if (!Number.isFinite(enemy?.shield)) {
      enemy.shield = Math.max(0, nextShield);
      enemy.maxShield = Math.max(enemy.maxShield ?? 0, enemy.shield);
      return;
    }
    enemy.shield = Math.max(0, nextShield);
    enemy.maxShield = Math.max(enemy.maxShield ?? 0, enemy.shield);
  }
  function applyExposed(enemy, duration, sourceId) {
    const effects = ensureEnemyEffects(enemy);
    const current = effects.exposed;
    const next = {
      type: "exposed",
      sourceId,
      duration,
      timeLeft: duration
    };
    if (!current) {
      effects.exposed = next;
    } else {
      current.duration = Math.max(current.duration, next.duration);
      current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
      current.sourceId = sourceId;
    }
    enemy.exposedTimer = Math.max(enemy.exposedTimer ?? 0, effects.exposed.timeLeft);
  }
  function applyMark(enemy, definition, sourceId, context = {}) {
    const effects = ensureEnemyEffects(enemy);
    const current = effects.mark;
    const markDuration = definition.markDuration ?? 0;
    const next = {
      type: "mark",
      sourceId,
      duration: markDuration,
      timeLeft: markDuration,
      scanHits: 0
    };
    if (!current) {
      effects.mark = next;
    } else {
      current.duration = Math.max(current.duration, next.duration);
      current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
      current.sourceId = sourceId;
    }
    enemy.markTimer = Math.max(enemy.markTimer ?? 0, effects.mark.timeLeft);
    if (definition.markEnergy > 0 && context?.onEnergyGain) {
      context.onEnergyGain(definition.markEnergy * 0.35);
    }
  }
  function registerScanHit(enemy, definition, context = {}) {
    const effects = ensureEnemyEffects(enemy);
    const mark = effects.mark;
    if (!mark || mark.timeLeft <= 0) {
      return;
    }
    mark.scanHits += 1;
    const chainThreshold = definition.scanThreshold ?? 2;
    if (mark.scanHits >= chainThreshold) {
      mark.scanHits = 0;
      const energyGain = definition.scanReward ?? 1;
      if (context?.onEnergyGain) {
        context.onEnergyGain(energyGain);
      }
      if (context?.effects) {
        triggerScreenFlash(context.effects, "energy", 0.18 + energyGain * 0.08);
      }
    }
  }
  function getCombatMultiplier(enemy, definition, family) {
    let multiplier = getEnemyTraitValue(enemy, family);
    if (multiplier <= 0) {
      return 0;
    }
    const effects = enemy?.effects ?? {};
    const mark = effects.mark;
    const exposed = effects.exposed;
    if (mark?.timeLeft > 0) {
      if (family === "burn") {
        multiplier *= definition.burnAmplify ?? 1.18;
      } else if (family === "splash") {
        multiplier *= 1.08;
      } else if (family === "needle") {
        multiplier *= definition.critBonus ?? 1.18;
      } else if (family === "relay") {
        multiplier *= 1.05;
      }
    }
    if (exposed?.timeLeft > 0) {
      multiplier *= family === "disrupt" ? 1.1 : 1.15;
    }
    if (enemy?.shield > 0 && family === "disrupt") {
      multiplier *= 1.6;
    }
    return multiplier;
  }
  function inflictShieldDamage(enemy, amount, family) {
    if (!(amount > 0)) {
      return 0;
    }
    const auraShield = Number.isFinite(enemy?.auraShield) ? enemy.auraShield : 0;
    const shield = Math.max(0, getShieldValue(enemy) - auraShield);
    if (shield <= 0) {
      return amount;
    }
    const shieldEfficiency = family === "disrupt" ? 1.5 : family === "splash" ? 0.5 : 0.25;
    const damageToShield = Math.min(shield, amount * shieldEfficiency);
    setShieldValue(enemy, shield - damageToShield);
    const remaining = amount - damageToShield / Math.max(0.001, shieldEfficiency);
    return Math.max(0, remaining);
  }
  function getTowerCenter(tower, layout) {
    if (tower?.cell) {
      return getCenterFromCell(tower.cell, layout ?? { cellSize: tower.cellSize ?? DEFAULT_CELL_SIZE });
    }
    return {
      x: tower?.x ?? 0,
      y: tower?.y ?? 0
    };
  }
  function ensureEnemyEffects(enemy) {
    if (!enemy.effects || typeof enemy.effects !== "object") {
      enemy.effects = {};
    }
    if (!enemy.effects.slow) {
      enemy.effects.slow = null;
    }
    if (!enemy.effects.burn) {
      enemy.effects.burn = null;
    }
    if (!enemy.effects.mark) {
      enemy.effects.mark = null;
    }
    if (!enemy.effects.exposed) {
      enemy.effects.exposed = null;
    }
    return enemy.effects;
  }
  function enemyIsActive(enemy) {
    return Boolean(enemy) && !enemy.dead && enemy.alive !== false && enemy.reachedGoal !== true;
  }
  function enemyPosition(enemy) {
    return {
      x: Number.isFinite(enemy?.x) ? enemy.x : 0,
      y: Number.isFinite(enemy?.y) ? enemy.y : 0
    };
  }
  function enemyRadius(enemy) {
    return Number.isFinite(enemy?.radius) ? enemy.radius : 12;
  }
  function enemyHealthValue(enemy) {
    if (Number.isFinite(enemy?.health)) {
      return enemy.health;
    }
    if (Number.isFinite(enemy?.hp)) {
      return enemy.hp;
    }
    return 0;
  }
  function setEnemyHealth(enemy, nextHealth) {
    const value = Math.max(0, nextHealth);
    if (Number.isFinite(enemy.health)) {
      enemy.health = value;
    }
    if (Number.isFinite(enemy.hp)) {
      enemy.hp = value;
    }
    if (!Number.isFinite(enemy.health) && !Number.isFinite(enemy.hp)) {
      enemy.health = value;
    }
  }
  function dealDamage(enemy, amount, context = {}) {
    if (!enemyIsActive(enemy) || !(amount > 0)) {
      return 0;
    }
    const before = enemyHealthValue(enemy);
    const after = before - amount;
    setEnemyHealth(enemy, after);
    enemy.hitFlash = Math.max(enemy.hitFlash ?? 0, 0.18);
    const dealt = before - Math.max(0, after);
    const overkill = Math.max(0, amount - dealt);
    if (overkill > 0 && context?.onEnergyGain) {
      context.onEnergyGain(overkill * 0.2);
    }
    if (dealt > 0 && enemy.effects?.mark?.timeLeft > 0 && context?.onEnergyGain) {
      const chainEnergy = (context.chainEnergy ?? 0) > 0 ? context.chainEnergy : 0.5;
      if (chainEnergy > 0) {
        context.onEnergyGain(chainEnergy * 0.15);
      }
    }
    return dealt;
  }
  function setSlowEffect(enemy, definition, sourceId) {
    const effects = ensureEnemyEffects(enemy);
    if (isEffectImmune(enemy, "slow")) {
      enemy.slowTimer = 0;
      return;
    }
    const resistant = getEnemyTraitValue(enemy, "slow");
    const adjustedDuration = Math.max(0.3, definition.slowDuration * resistant);
    const adjustedFactor = Math.min(0.98, definition.slowFactor + (1 - resistant) * 0.08);
    const current = effects.slow;
    const next = {
      type: "slow",
      sourceId,
      multiplier: adjustedFactor,
      duration: adjustedDuration,
      timeLeft: adjustedDuration
    };
    if (!current) {
      effects.slow = next;
    } else {
      current.multiplier = Math.min(current.multiplier, next.multiplier);
      current.duration = Math.max(current.duration, next.duration);
      current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
      current.sourceId = sourceId;
    }
    enemy.slowFactor = effects.slow.multiplier;
    enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, effects.slow.timeLeft);
  }
  function setBurnEffect(enemy, definition, sourceId) {
    const effects = ensureEnemyEffects(enemy);
    if (isEffectImmune(enemy, "burn")) {
      enemy.burnTimer = 0;
      return;
    }
    const resist = getEnemyTraitValue(enemy, "burn");
    const burnAmplify = enemy?.effects?.mark?.timeLeft > 0 ? definition.burnAmplify ?? 1.18 : 1;
    const current = effects.burn;
    const next = {
      type: "burn",
      sourceId,
      dps: definition.burnDps * resist * burnAmplify,
      duration: Math.max(0.4, definition.burnDuration * resist),
      timeLeft: Math.max(0.4, definition.burnDuration * resist),
      tickInterval: definition.burnTickInterval,
      tickCarry: 0
    };
    if (!current) {
      effects.burn = next;
    } else {
      current.dps = Math.max(current.dps, next.dps);
      current.duration = Math.max(current.duration, next.duration);
      current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
      current.tickInterval = Math.min(current.tickInterval, next.tickInterval);
      current.sourceId = sourceId;
    }
    enemy.burnTimer = Math.max(enemy.burnTimer ?? 0, effects.burn.timeLeft);
    enemy.burnDps = Math.max(enemy.burnDps ?? 0, effects.burn.dps);
  }
  function pickTarget(enemies, tower, layout) {
    const definition = lookupTowerDefinition(tower.type);
    const family = getTowerFamily(tower.type);
    const cellSize = tower.cellSize ?? getLayoutCellSize(layout);
    const maxRange = definition.rangeCells * cellSize;
    let bestEnemy = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      if (!enemyIsActive(enemy)) {
        continue;
      }
      if (!canTowerDetectEnemy(definition, enemy)) {
        continue;
      }
      const { x, y } = enemyPosition(enemy);
      const distance = hypot(x - tower.x, y - tower.y);
      if (distance > maxRange) {
        continue;
      }
      let score = distance - enemyTargetPriority(enemy) * cellSize * 0.6;
      if (enemy?.traits?.hidden && definition.scanRadiusCells > 0) {
        score -= cellSize * 0.4;
      }
      if (distance <= maxRange) {
        if (family === "needle" && enemy.effects?.mark?.timeLeft > 0) {
          score -= cellSize * 0.28;
        }
        if (family === "relay" && enemy.effects?.mark?.timeLeft > 0) {
          score -= cellSize * 0.34;
        }
        if (family === "disrupt" && getShieldValue(enemy) > 0) {
          score -= cellSize * 0.26;
        }
        if (family === "burn" && enemy.effects?.burn?.timeLeft > 0) {
          score -= cellSize * 0.14;
        }
        if (score < bestScore) {
          bestEnemy = enemy;
          bestScore = score;
        }
      }
    }
    return bestEnemy;
  }
  function createProjectile(tower, target, layout) {
    const definition = lookupTowerDefinition(tower.type);
    const family = definition.family ?? tower.type.split("_")[0];
    const towerCenter = getTowerCenter(tower, layout);
    const targetPos = enemyPosition(target);
    const dx = targetPos.x - towerCenter.x;
    const dy = targetPos.y - towerCenter.y;
    const distance = hypot(dx, dy);
    const speed = definition.projectileSpeed;
    const dirX = distance > EPSILON ? dx / distance : 0;
    const dirY = distance > EPSILON ? dy / distance : 0;
    const travelTime = distance > EPSILON ? distance / speed : 0.15;
    return {
      id: `${tower.id}-shot-${tower.shotsFired + 1}`,
      type: tower.type,
      family,
      effectType: family,
      towerId: tower.id,
      targetId: target.id,
      x: towerCenter.x,
      y: towerCenter.y,
      prevX: towerCenter.x,
      prevY: towerCenter.y,
      vx: dirX * speed,
      vy: dirY * speed,
      speed,
      age: 0,
      travelTime,
      maxAge: travelTime + 0.85,
      targetX: targetPos.x,
      targetY: targetPos.y,
      impactRadius: definition.impactRadiusCells * getLayoutCellSize(layout),
      damage: definition.damage,
      color: definition.color,
      glow: definition.glow,
      trail: definition.trail,
      arcHeight: definition.arcHeight ?? 0,
      markDuration: definition.markDuration ?? 0,
      markEnergy: definition.markEnergy ?? 0,
      energyPulse: definition.energyPulse ?? 0,
      scanReward: definition.scanReward ?? 0,
      shieldBreak: definition.shieldBreak ?? 0,
      exposeDuration: definition.exposeDuration ?? 0,
      burnAmplify: definition.burnAmplify ?? 1,
      alive: true,
      resolved: false,
      spawnedAt: 0
    };
  }
  function applyImpact(projectile, enemies, context = {}) {
    const definition = lookupTowerDefinition(projectile.type);
    const family = projectile.family ?? definition.family ?? projectile.type.split("_")[0];
    const target = enemies.find((enemy) => enemy.id === projectile.targetId && enemyIsActive(enemy));
    const impactPoint = target ? enemyPosition(target) : { x: projectile.x, y: projectile.y };
    const bursts = [];
    if (family === "splash") {
      for (const enemy of enemies) {
        if (!enemyIsActive(enemy)) {
          continue;
        }
        const { x, y } = enemyPosition(enemy);
        const distance = hypot(x - impactPoint.x, y - impactPoint.y);
        if (distance <= projectile.impactRadius + enemyRadius(enemy)) {
          const falloff = clamp(1 - distance / (projectile.impactRadius || 1), 0.45, 1);
          const amount = projectile.damage * falloff * getCombatMultiplier(enemy, definition, family);
          const resolved = inflictShieldDamage(enemy, amount, family);
          dealDamage(enemy, resolved, context);
          bursts.push(enemy.id);
        }
      }
    } else if (target) {
      let damage = projectile.damage * getCombatMultiplier(target, definition, family);
      if (family === "disrupt") {
        const shieldBreak = projectile.shieldBreak ?? definition.shieldBreak ?? 0;
        if (shieldBreak > 0) {
          setShieldValue(target, getShieldValue(target) - shieldBreak);
          applyExposed(target, projectile.exposeDuration ?? definition.exposeDuration ?? 0, projectile.id);
          registerScanHit(target, definition, context);
        }
      }
      if (family === "relay" || family === "needle") {
        applyMark(target, definition, projectile.id, context);
        registerScanHit(target, definition, context);
      }
      if (family === "burn" && target.effects?.mark?.timeLeft > 0) {
        damage *= projectile.burnAmplify ?? definition.burnAmplify ?? 1.18;
      }
      const resolved = inflictShieldDamage(target, damage, family);
      const dealt = dealDamage(target, resolved, context);
      if (dealt > 0 && family === "relay") {
        const pulse = projectile.energyPulse ?? definition.energyPulse ?? 0;
        if (pulse > 0 && context?.onEnergyGain) {
          context.onEnergyGain(pulse * 0.5);
        }
      }
      if (family === "slow") {
        setSlowEffect(target, definition, projectile.id);
      }
      if (family === "burn") {
        setBurnEffect(target, definition, projectile.id);
      }
      if (family === "disrupt" && projectile.exposeDuration > 0) {
        applyExposed(target, projectile.exposeDuration, projectile.id);
      }
      if (family === "needle") {
        registerScanHit(target, definition, context);
      }
      bursts.push(target.id);
    }
    projectile.resolved = true;
    return {
      x: impactPoint.x,
      y: impactPoint.y,
      color: definition.color,
      type: family,
      radius: projectile.impactRadius,
      effects: bursts
    };
  }
  function getTowerDefinition(type) {
    return lookupTowerDefinition(type);
  }
  function getUpgradeOptions(tower) {
    const baseType = getBaseType(tower?.baseType ?? tower?.type);
    const tree = lookupTowerUpgradeTree(baseType);
    if (!tree || tower?.upgradeStage >= 1) {
      return [];
    }
    return tree.branches.map((branch) => ({
      ...branch,
      definition: getTowerDefinition(branch.type)
    }));
  }
  function canUpgradeTower(state, tower, branchId = null) {
    if (!state || !tower) {
      return false;
    }
    if (tower.upgradeStage >= 1) {
      return false;
    }
    const options = getUpgradeOptions(tower);
    if (branchId) {
      const branch = options.find((item) => item.id === branchId || item.type === branchId);
      return Boolean(branch && state.energy >= branch.cost);
    }
    return options.some((branch) => state.energy >= branch.cost);
  }
  function upgradeTower(state, tower, branchId) {
    if (!canUpgradeTower(state, tower, branchId)) {
      return null;
    }
    const branch = getUpgradeOptions(tower).find((item) => item.id === branchId || item.type === branchId);
    if (!branch) {
      return null;
    }
    const nextDefinition = getTowerDefinition(branch.type);
    state.energy -= branch.cost;
    tower.type = branch.type;
    tower.definition = nextDefinition;
    tower.upgradeBranch = branch.id;
    tower.upgradeStage = 1;
    tower.roleLabel = nextDefinition.roleLabel ?? branch.finalRole ?? nextDefinition.label;
    tower.baseType = getBaseType(tower.baseType ?? tower.type);
    tower.cooldown = Math.min(tower.cooldown ?? 0, 0.1);
    return {
      tower,
      branch,
      definition: nextDefinition,
      spent: branch.cost
    };
  }
  function createTower(type, x, y, layout) {
    const definition = lookupTowerDefinition(type);
    const point = normalizePointLike(x, y, layout);
    const tower = {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      baseType: getBaseType(type),
      cell: point.cell ? { ...point.cell } : null,
      x: point.x,
      y: point.y,
      cellSize: point.cellSize ?? getLayoutCellSize(layout),
      cooldown: 0,
      shotsFired: 0,
      pulse: Math.random() * Math.PI * 2,
      selected: false,
      definition,
      upgradeStage: 0,
      upgradeBranch: null,
      roleLabel: definition.roleLabel ?? definition.label
    };
    return tower;
  }
  function updateTowers(towers, enemies, projectiles, dt, assets = {}, context = {}) {
    const layout = assets?.layout ?? null;
    const spawned = [];
    for (const tower of towers) {
      const definition = lookupTowerDefinition(tower.type);
      tower.definition = definition;
      tower.cooldown = Math.max(0, (tower.cooldown ?? 0) - dt);
      tower.pulse = (tower.pulse ?? 0) + dt * 2.6;
      if (tower.cooldown > 0) {
        continue;
      }
      const target = pickTarget(enemies, tower, layout);
      if (!target) {
        continue;
      }
      const projectile = createProjectile(tower, target, layout);
      spawned.push(projectile);
      if (Array.isArray(projectiles)) {
        projectiles.push(projectile);
      }
      tower.shotsFired = (tower.shotsFired ?? 0) + 1;
      tower.cooldown = 1 / definition.fireRate;
      if (context?.onTowerFire && projectile) {
        context.onTowerFire(tower, projectile);
      }
    }
    return spawned;
  }
  function updateProjectiles(projectiles, enemies, dt, layout = null, context = {}) {
    const bursts = [];
    const enemyById = new Map;
    for (const enemy of enemies) {
      enemyById.set(enemy.id, enemy);
    }
    for (const projectile of projectiles) {
      if (!projectile.alive) {
        continue;
      }
      projectile.age = (projectile.age ?? 0) + dt;
      projectile.prevX = projectile.x;
      projectile.prevY = projectile.y;
      const target = enemyById.get(projectile.targetId);
      const hasLiveTarget = enemyIsActive(target);
      const targetX = hasLiveTarget ? target.x : projectile.targetX;
      const targetY = hasLiveTarget ? target.y : projectile.targetY;
      const dx = targetX - projectile.x;
      const dy = targetY - projectile.y;
      const distance = hypot(dx, dy);
      const step = projectile.speed * dt;
      const directHitRadius = projectile.impactRadius * 0.42 + enemyRadius(target) * 0.35;
      const reachedTarget = hasLiveTarget && distance <= step + directHitRadius;
      const expired = projectile.age >= projectile.maxAge;
      if (distance <= EPSILON) {
        projectile.vx = 0;
        projectile.vy = 0;
      } else {
        projectile.vx = dx / distance * projectile.speed;
        projectile.vy = dy / distance * projectile.speed;
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
      }
      if (reachedTarget) {
        projectile.x = targetX;
        projectile.y = targetY;
      }
      if (reachedTarget || expired) {
        projectile.alive = false;
        if (projectile.type === "splash" || reachedTarget) {
          bursts.push(applyImpact(projectile, enemies, context));
        }
      }
    }
    return bursts;
  }
  function drawTowers(ctx, towers, assetsOrLayout = null) {
    const layout = isLayoutLike(assetsOrLayout) ? assetsOrLayout : assetsOrLayout?.layout ?? null;
    const hologramCore = assetsOrLayout?.hologramCore ?? null;
    for (const tower of towers) {
      const definition = lookupTowerDefinition(tower.type);
      const cellSize = tower.cellSize ?? getLayoutCellSize(layout);
      const center = getTowerCenter(tower, layout);
      const pulse = tower.pulse ?? 0;
      const glowRadius = cellSize * 0.42;
      const ringRadius = cellSize * 0.28 + Math.sin(pulse) * 1.5;
      ctx.save();
      ctx.translate(center.x, center.y + Math.sin(pulse * 1.6) * 2.2);
      ctx.fillStyle = definition.glow;
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = definition.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(5, 12, 22, 0.92)";
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius + 2, 0, Math.PI * 2);
      ctx.fill();
      if (hologramCore) {
        ctx.globalAlpha = 0.88;
        const coreSize = cellSize * 0.42;
        ctx.drawImage(hologramCore, -coreSize * 0.5, -coreSize * 0.5, coreSize, coreSize);
      } else {
        ctx.fillStyle = definition.color;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius - 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius - 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawProjectileTrail(ctx, projectile) {
    const dx = projectile.x - projectile.prevX;
    const dy = projectile.y - projectile.prevY;
    const distance = hypot(dx, dy);
    const normalX = distance > EPSILON ? -dy / distance : 0;
    const normalY = distance > EPSILON ? dx / distance : 0;
    const arc = projectile.arcHeight * Math.sin(Math.min(1, projectile.age / projectile.travelTime) * Math.PI);
    const controlX = (projectile.prevX + projectile.x) * 0.5 + normalX * arc * 44;
    const controlY = (projectile.prevY + projectile.y) * 0.5 + normalY * arc * 44 - arc * 10;
    ctx.beginPath();
    ctx.moveTo(projectile.prevX, projectile.prevY);
    ctx.quadraticCurveTo(controlX, controlY, projectile.x, projectile.y);
    ctx.stroke();
  }
  function drawProjectiles(ctx, projectiles, assets = null) {
    for (const projectile of projectiles) {
      if (!projectile.alive) {
        continue;
      }
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = projectile.trail;
      ctx.lineWidth = projectile.family === "splash" ? 6 : 5;
      ctx.shadowColor = projectile.glow;
      ctx.shadowBlur = 12;
      drawProjectileTrail(ctx, projectile);
      ctx.shadowBlur = 0;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.type === "splash" ? 4.8 : 4.2, 0, Math.PI * 2);
      ctx.fill();
      if (projectile.family === "splash") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  function updateTowerFire(dt, towers, enemies, layout, context = {}) {
    return updateTowers(towers, enemies, [], dt, { layout }, context);
  }
  function advanceProjectiles(dt, projectiles, enemies, layout = null, context = {}) {
    return updateProjectiles(projectiles, enemies, dt, layout, context);
  }

  // src/WaveManager.js
  function clonePoint2(point) {
    return { x: point.x, y: point.y };
  }
  function getKindDefinition(kind) {
    return ENEMY_TYPES[kind] ?? ENEMY_TYPES.scout;
  }
  function buildResistanceProfile(kind, traits = {}) {
    const profile = {
      splash: 1,
      slow: 1,
      burn: 1,
      needle: 1,
      relay: 1,
      disrupt: 1
    };
    if (Number.isFinite(traits.splashResistance)) {
      profile.splash = Math.max(0.15, Math.min(2.5, traits.splashResistance));
    }
    if (traits.burnWeak) {
      profile.burn = Math.max(0.25, 1 / traits.burnWeak);
    }
    if (traits.slowWeak) {
      profile.slow = Math.max(0.25, 1 / traits.slowWeak);
    }
    if (traits.slowResistance) {
      profile.slow = Math.max(0.25, Math.min(2.5, traits.slowResistance));
    }
    if (traits.burnResistance) {
      profile.burn = Math.max(0.25, Math.min(2.5, traits.burnResistance));
    }
    if (traits.disruptWeak) {
      profile.disrupt = Math.max(0.25, traits.disruptWeak);
    }
    return profile;
  }
  function deriveShield(kind, data, traits = {}) {
    if (Number.isFinite(data.shield)) {
      return data.shield;
    }
    if (traits.shieldProjector) {
      return 28;
    }
    if (traits.shielded) {
      return 36;
    }
    if (kind === "shell") {
      return 22;
    }
    if (kind === "warden") {
      return 42;
    }
    if (kind === "overseer") {
      return 70;
    }
    if (kind === "projector") {
      return 30;
    }
    if (kind === "lattice_overseer") {
      return 88;
    }
    if (kind === "mirror_archon") {
      return 64;
    }
    return 0;
  }
  function deriveTraits(data) {
    const traits = data.traits ?? {};
    const list = [];
    if (traits.hidden) {
      list.push("hidden");
    }
    if (traits.flicker) {
      list.push("flicker");
    }
    if (traits.scanRequired) {
      list.push("scan");
    }
    if (traits.carrier) {
      list.push("carrier");
    }
    if (traits.phaseShift) {
      list.push("phase");
    }
    if (traits.mirrorCaster) {
      list.push("mirror");
    }
    if (traits.shieldProjector) {
      list.push("projector");
    }
    if (traits.shieldbreakerPriority) {
      list.push("breaker");
    }
    if (traits.boss || data.boss) {
      list.push("boss");
    }
    return list;
  }
  function getSpawnAnchor(pathfinder) {
    const layout = pathfinder?.layout ?? null;
    if (layout && Number.isFinite(layout.originX) && Number.isFinite(layout.originY) && Number.isFinite(layout.width) && Number.isFinite(layout.height)) {
      return layout;
    }
    return {
      originX: 0,
      originY: 0,
      width: Number.isFinite(pathfinder?.width) ? Number(pathfinder.width) : 900,
      height: Number.isFinite(pathfinder?.height) ? Number(pathfinder.height) : 540
    };
  }
  function distanceBetween(a, b) {
    if (!a || !b) {
      return 0;
    }
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function resolveSpawnPoint(pathfinder, spawnPointName) {
    const layout = getSpawnAnchor(pathfinder);
    const padX = Math.max(24, layout.width * 0.06);
    const padY = Math.max(24, layout.height * 0.08);
    const leftX = layout.originX + padX;
    const rightX = layout.originX + layout.width - padX;
    const centerX = layout.originX + layout.width * 0.5;
    const upperY = layout.originY + layout.height * 0.24;
    const midY = layout.originY + layout.height * 0.5;
    const lowerY = layout.originY + layout.height * 0.76;
    const laneOffsetY = layout.height * 0.18;
    const topY = layout.originY + padY;
    const bottomY = layout.originY + layout.height - padY;
    const goal = pathfinder?.goalPoint ?? { x: rightX, y: midY };
    const minGoalDistance = Math.min(Math.max(750, layout.width * 0.68), Math.max(750, layout.width - padX * 2));
    const presets = {
      "left-upper": { x: leftX, y: upperY },
      "left-mid": { x: leftX, y: midY },
      "left-lower": { x: leftX, y: lowerY },
      "right-upper": { x: rightX, y: upperY },
      "right-mid": { x: rightX, y: midY },
      "right-lower": { x: rightX, y: lowerY },
      "center-left": { x: leftX, y: Math.max(topY, midY - laneOffsetY) },
      "center-right": { x: rightX, y: Math.min(bottomY, midY + laneOffsetY) },
      "top-mid": { x: centerX, y: topY },
      "bottom-mid": { x: centerX, y: bottomY }
    };
    const fallbackAliases = {
      "right-upper": "left-upper",
      "right-mid": "left-mid",
      "right-lower": "left-lower",
      "center-right": "center-left",
      "top-mid": "left-upper",
      "bottom-mid": "left-lower"
    };
    const spawn = presets[spawnPointName] ?? null;
    if (!spawn) {
      return null;
    }
    if (distanceBetween(spawn, goal) >= minGoalDistance) {
      return spawn;
    }
    const fallbackName = fallbackAliases[spawnPointName] ?? "left-mid";
    return presets[fallbackName] ?? presets["left-mid"];
  }
  function collectWaveSpawnPoints(actions = []) {
    const points = [];
    for (const action of actions) {
      if (!action || action.type === "wait") {
        continue;
      }
      if (action.type === "mix") {
        const basePoint = action.spawnPoint ?? "left-mid";
        for (const group of action.groups ?? []) {
          points.push(group.spawnPoint ?? basePoint);
        }
        continue;
      }
      points.push(action.spawnPoint ?? "left-mid");
    }
    return [...new Set(points.filter(Boolean))];
  }
  function isBossKind(kind) {
    return Boolean(kind && ENEMY_TYPES[kind]?.boss);
  }
  function findWaveBossAction(wave) {
    if (!wave) {
      return null;
    }
    return (wave.actions ?? []).find((action) => isBossKind(action.kind)) ?? null;
  }
  function buildBossFields(pathfinder, source, boss, waveTimer) {
    if (!source || !boss && !source.kind) {
      return [];
    }
    const layout = getSpawnAnchor(pathfinder);
    const phaseSeconds = Math.max(1, source.pulseSeconds ?? 2.5);
    const phase = Math.floor(waveTimer / phaseSeconds) % 4;
    const midX = layout.originX + layout.width * 0.5;
    const leftX = layout.originX + layout.width * 0.32;
    const rightX = layout.originX + layout.width * 0.68;
    const upperY = layout.originY + layout.height * 0.28;
    const midY = layout.originY + layout.height * 0.5;
    const lowerY = layout.originY + layout.height * 0.72;
    const softWeight = source.softFieldWeight ?? 12;
    const hardWeight = source.hardFieldWeight ?? 18;
    const bossRadius = boss?.radius ?? 24;
    const fields = [
      {
        x: boss?.x ?? midX,
        y: boss?.y ?? midY,
        radius: Math.max(42, bossRadius * 2),
        margin: 0,
        weight: softWeight * 0.4,
        hard: false,
        kind: "boss-aura"
      }
    ];
    if (phase === 0) {
      fields.push({ x: midX, y: midY, radius: layout.height * 0.16, margin: 0, weight: softWeight, hard: false, kind: "phase-gate" });
      fields.push({ x: leftX, y: upperY, radius: layout.height * 0.1, margin: 8, weight: hardWeight, hard: true, kind: "false-wall" });
    } else if (phase === 1) {
      fields.push({ x: midX, y: upperY, radius: layout.height * 0.13, margin: 0, weight: softWeight + 4, hard: false, kind: "phase-gate" });
      fields.push({ x: rightX, y: lowerY, radius: layout.height * 0.1, margin: 8, weight: hardWeight, hard: true, kind: "false-wall" });
    } else if (phase === 2) {
      fields.push({ x: midX, y: lowerY, radius: layout.height * 0.14, margin: 0, weight: softWeight + 2, hard: false, kind: "phase-gate" });
      fields.push({ x: midX, y: midY, radius: layout.height * 0.09, margin: 10, weight: hardWeight + 4, hard: true, kind: "false-wall" });
    } else {
      fields.push({ x: leftX, y: midY, radius: layout.height * 0.12, margin: 0, weight: softWeight + 1, hard: false, kind: "phase-gate" });
      fields.push({ x: rightX, y: midY, radius: layout.height * 0.12, margin: 0, weight: softWeight + 1, hard: false, kind: "phase-gate" });
      fields.push({ x: midX, y: upperY, radius: layout.height * 0.08, margin: 10, weight: hardWeight + 4, hard: true, kind: "false-wall" });
    }
    return fields;
  }
  function makeEnemy2(kind) {
    const data = getKindDefinition(kind);
    const traits = data.traits ?? {};
    return {
      id: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      label: data.label,
      maxHealth: data.maxHealth,
      health: data.maxHealth,
      speedCells: data.speedCells,
      radius: data.radius,
      tint: data.tint,
      reward: data.reward,
      shardEnergy: data.shardEnergy ?? (data.boss ? 4 : data.reward >= 20 ? 2 : 0),
      isBoss: Boolean(data.boss),
      shield: deriveShield(kind, data, traits),
      maxShield: deriveShield(kind, data, traits),
      resistances: buildResistanceProfile(kind, traits),
      immuneFamilies: [
        ...traits.slowImmune ? ["slow"] : [],
        ...traits.burnImmune ? ["burn"] : []
      ],
      traits: { ...traits },
      traitTags: deriveTraits(data),
      deathSpawn: Array.isArray(data.deathSpawn) ? data.deathSpawn.map((entry) => ({ ...entry })) : [],
      shieldAuraRadius: data.shieldAuraRadius ?? 0,
      shieldAuraStrength: data.shieldAuraStrength ?? 0,
      disruption: data.disruption ? { ...data.disruption } : null,
      x: 0,
      y: 0,
      path: [],
      pathIndex: 0,
      pathRevision: -1,
      pathAge: 0,
      slowTimer: 0,
      slowFactor: 1,
      burnTimer: 0,
      burnDps: 0,
      markTimer: 0,
      exposedTimer: 0,
      hitFlash: 0,
      dead: false
    };
  }
  function queueAction(queue, action, waveIndex, cursor) {
    if (!action) {
      return cursor;
    }
    if (action.type === "wait") {
      return cursor + Math.max(0, action.duration ?? 0);
    }
    if (action.type === "burst") {
      const count = Math.max(1, action.count ?? 1);
      const cadence = Math.max(0.06, action.every ?? Math.max(0.08, 0.18 - waveIndex * 0.005));
      for (let index = 0;index < count; index += 1) {
        queue.push({
          kind: action.kind,
          spawnPoint: action.spawnPoint ?? "left-mid",
          at: cursor + index * cadence,
          cadence
        });
      }
      return cursor + count * cadence;
    }
    if (action.type === "interval") {
      const count = Math.max(1, action.count ?? 1);
      const every = Math.max(0.04, action.every ?? 0.2);
      for (let index = 0;index < count; index += 1) {
        queue.push({
          kind: action.kind,
          spawnPoint: action.spawnPoint ?? "left-mid",
          at: cursor + index * every,
          cadence: every
        });
      }
      return cursor + count * every;
    }
    if (action.type === "mix") {
      const basePoint = action.spawnPoint ?? "left-mid";
      for (const group of action.groups ?? []) {
        const count = Math.max(1, group.count ?? 1);
        const every = Math.max(0.05, group.every ?? 0.2);
        for (let index = 0;index < count; index += 1) {
          queue.push({
            kind: group.kind,
            spawnPoint: group.spawnPoint ?? basePoint,
            at: cursor + index * every,
            cadence: every
          });
        }
      }
      return cursor + Math.max(...(action.groups ?? []).map((group) => (group.count ?? 1) * Math.max(0.05, group.every ?? 0.2)), 0);
    }
    return cursor;
  }
  function buildSpawnQueue(wave, waveIndex) {
    const queue = [];
    let cursor = 0.4;
    for (const action of wave.actions ?? []) {
      cursor = queueAction(queue, action, waveIndex, cursor);
    }
    queue.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
    return queue;
  }
  function pathPointAtSpawn(pathfinder, spawnPointName) {
    const spawn = pathfinder?.spawn ?? pathfinder?.start ?? { x: 0, y: 0 };
    const goal = pathfinder?.goalPoint ?? pathfinder?.goal ?? spawn;
    if (typeof spawnPointName === "string") {
      const point = resolveSpawnPoint(pathfinder, spawnPointName);
      if (point) {
        return { spawn: point, goal };
      }
    }
    return { spawn: clonePoint2(spawn), goal };
  }

  class WaveManager {
    constructor({ waves = DEFAULT_WAVES, lives = 10 } = {}) {
      this.waves = waves.map((wave) => ({
        ...wave,
        actions: Array.isArray(wave.actions) ? wave.actions.map((action) => ({ ...action })) : []
      }));
      this.maxLives = lives;
      this.reset();
    }
    reset() {
      this.running = false;
      this.complete = false;
      this.failed = false;
      this.lives = this.maxLives;
      this.waveIndex = 0;
      this.waveTimer = 0;
      this.spawnIndex = 0;
      this.spawnQueue = [];
      this.enemies = [];
      this.kills = 0;
      this.clearedWaves = 0;
      this.waveCountdown = 0;
      this.pendingWaveIndex = null;
      this.waveState = "idle";
      this.bossWaveActive = false;
      this.waveLeakCount = 0;
      this.waveClearBonus = 0;
      this.spawnedThisWave = 0;
      this.disruptionPhase = -1;
    }
    start() {
      this.reset();
      this.running = true;
      this._primeWave(0);
    }
    _primeWave(index) {
      const wave = this.waves[index];
      if (!wave) {
        this.complete = true;
        this.running = false;
        this.waveState = "complete";
        return;
      }
      this.waveIndex = index;
      this.spawnQueue = buildSpawnQueue(wave, index);
      this.spawnIndex = 0;
      this.waveTimer = 0;
      this.waveCountdown = 0;
      this.pendingWaveIndex = null;
      this.waveState = "spawning";
      this.bossWaveActive = false;
      this.waveLeakCount = 0;
      this.waveClearBonus = 0;
      this.spawnedThisWave = 0;
      this.disruptionPhase = -1;
    }
    _spawnEnemy(pathfinder, command) {
      const enemy = makeEnemy2(command.kind);
      const entry = pathPointAtSpawn(pathfinder, command.spawnPoint);
      const path = pathfinder.findPath(entry.spawn, entry.goal);
      if (!path.length) {
        return null;
      }
      const first = path[0];
      enemy.x = first.x;
      enemy.y = first.y;
      enemy.path = path;
      enemy.pathIndex = 0;
      enemy.pathRevision = pathfinder.getRevision();
      enemy.pathAge = 0;
      enemy.spawnPoint = command.spawnPoint ?? "left-mid";
      enemy.currentCell = first.cell ? { ...first.cell } : null;
      this.enemies.push(enemy);
      return enemy;
    }
    _repathEnemy(enemy, pathfinder) {
      const path = pathfinder.findPathFromPoint({ x: enemy.x, y: enemy.y }, pathfinder.goal);
      if (!path.length) {
        return false;
      }
      enemy.path = path;
      enemy.pathRevision = pathfinder.getRevision();
      enemy.pathIndex = 0;
      enemy.pathAge = 0;
      enemy.currentCell = path[0].cell ? { ...path[0].cell } : null;
      return true;
    }
    _moveEnemy(enemy, dt, pathfinder) {
      const speedPx = enemy.speedCells * pathfinder.getCellSize();
      const slowFactor = enemy.slowTimer > 0 ? enemy.slowFactor : 1;
      let remaining = speedPx * slowFactor * dt;
      while (remaining > 0 && !enemy.dead) {
        const nextPoint = enemy.path[enemy.pathIndex + 1];
        if (!nextPoint) {
          enemy.dead = true;
          this.lives = Math.max(0, this.lives - 1);
          break;
        }
        const dx = nextPoint.x - enemy.x;
        const dy = nextPoint.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= remaining) {
          enemy.x = nextPoint.x;
          enemy.y = nextPoint.y;
          enemy.pathIndex += 1;
          remaining -= distance;
          continue;
        }
        const scale = remaining / (distance || 1);
        enemy.x += dx * scale;
        enemy.y += dy * scale;
        remaining = 0;
      }
    }
    update(dt, pathfinder) {
      const events = {
        spawned: 0,
        destroyed: 0,
        leaked: 0,
        energyGain: 0,
        waveComplete: false,
        waveAdvanced: false,
        spawnedEnemies: [],
        destroyedEnemies: [],
        leakedEnemies: [],
        waveCountdown: this.waveCountdown,
        waveState: this.waveState,
        bossActive: this.bossWaveActive,
        waveClearBonus: this.waveClearBonus,
        bossPulse: false
      };
      if (this.waveState === "countdown") {
        this.waveCountdown = Math.max(0, this.waveCountdown - dt);
        events.waveCountdown = this.waveCountdown;
        if (this.waveCountdown <= 0) {
          const nextIndex = this.pendingWaveIndex ?? this.waveIndex + 1;
          this._primeWave(nextIndex);
          events.waveAdvanced = true;
          events.waveState = this.waveState;
        }
        return events;
      }
      if (!this.running || this.complete || this.failed) {
        return events;
      }
      this.waveTimer += dt;
      const bossEnemy = this.enemies.find((enemy) => !enemy.dead && enemy.isBoss) ?? null;
      const currentWave = this.waves[this.waveIndex] ?? null;
      const disruptionSource = bossEnemy?.disruption ?? findWaveBossAction(currentWave)?.disruption ?? null;
      const bossFields = buildBossFields(pathfinder, disruptionSource, bossEnemy, this.waveTimer);
      if (pathfinder?.setTransientFields) {
        pathfinder.setTransientFields(bossFields);
      }
      this.bossWaveActive = Boolean(bossEnemy);
      if (bossEnemy && disruptionSource) {
        const phaseSeconds = Math.max(1, disruptionSource.pulseSeconds ?? 2.5);
        const phase = Math.floor(this.waveTimer / phaseSeconds) % 4;
        if (this.disruptionPhase !== phase) {
          events.bossPulse = this.disruptionPhase >= 0;
          this.disruptionPhase = phase;
        }
      } else {
        this.disruptionPhase = -1;
      }
      while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.waveTimer + 0.000001) {
        const command = this.spawnQueue.shift();
        const spawned = this._spawnEnemy(pathfinder, command);
        if (spawned) {
          events.spawned += 1;
          events.spawnedEnemies.push(spawned);
          this.spawnedThisWave += 1;
        }
      }
      for (const enemy of this.enemies) {
        enemy.auraShield = 0;
      }
      const projectors = this.enemies.filter((enemy) => !enemy.dead && enemy.shieldAuraRadius > 0);
      for (const projector of projectors) {
        for (const enemy of this.enemies) {
          if (enemy.dead) {
            continue;
          }
          const distance = Math.hypot(projector.x - enemy.x, projector.y - enemy.y);
          if (distance > projector.shieldAuraRadius) {
            continue;
          }
          const falloff = Math.max(0.15, 1 - distance / projector.shieldAuraRadius);
          const aura = (projector.shieldAuraStrength ?? 0) * 40 * falloff;
          enemy.auraShield = Math.max(enemy.auraShield ?? 0, aura);
        }
      }
      for (const enemy of this.enemies) {
        if (enemy.dead) {
          continue;
        }
        enemy.pathAge += dt;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
        if (enemy.markTimer > 0) {
          enemy.markTimer = Math.max(0, enemy.markTimer - dt);
          if (enemy.markTimer === 0 && enemy.effects?.mark) {
            enemy.effects.mark = null;
          }
        }
        if (enemy.exposedTimer > 0) {
          enemy.exposedTimer = Math.max(0, enemy.exposedTimer - dt);
          if (enemy.exposedTimer === 0 && enemy.effects?.exposed) {
            enemy.effects.exposed = null;
          }
        }
        if (enemy.slowTimer > 0) {
          enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
          if (enemy.slowTimer === 0) {
            enemy.slowFactor = 1;
          }
        }
        if (enemy.burnTimer > 0) {
          const tick = Math.min(enemy.burnTimer, dt);
          enemy.burnTimer = Math.max(0, enemy.burnTimer - dt);
          enemy.health -= enemy.burnDps * tick;
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.1);
        }
        if (enemy.shield > 0 && enemy.exposedTimer > 0) {
          enemy.shield = Math.max(0, enemy.shield - dt * 2.5);
        }
        if (enemy.health <= 0) {
          enemy.dead = true;
          this.kills += 1;
          events.destroyed += 1;
          events.destroyedEnemies.push(enemy);
          events.energyGain += enemy.reward ?? 0;
          events.energyGain += enemy.shardEnergy ?? 0;
          if (Array.isArray(enemy.deathSpawn) && enemy.deathSpawn.length > 0) {
            let orbitIndex = 0;
            for (const entry of enemy.deathSpawn) {
              const count = Math.max(0, entry.count ?? 0);
              for (let index = 0;index < count; index += 1) {
                const angle = (orbitIndex + index) / Math.max(1, count) * Math.PI * 2;
                const radius = 8 + index * 1.4;
                const childPoint = {
                  x: enemy.x + Math.cos(angle) * radius,
                  y: enemy.y + Math.sin(angle) * radius
                };
                const spawned = this._spawnEnemy(pathfinder, {
                  kind: entry.kind,
                  spawnPoint: null
                });
                if (spawned) {
                  spawned.x = childPoint.x;
                  spawned.y = childPoint.y;
                  spawned.path = pathfinder.findPathFromPoint(childPoint, pathfinder.goal);
                  if (spawned.path.length > 0) {
                    spawned.pathRevision = pathfinder.getRevision();
                    spawned.pathIndex = 0;
                    spawned.pathAge = 0;
                    spawned.currentCell = spawned.path[0].cell ? { ...spawned.path[0].cell } : null;
                    events.spawned += 1;
                    events.spawnedEnemies.push(spawned);
                  } else {
                    spawned.dead = true;
                  }
                }
              }
              orbitIndex += count;
            }
          }
          continue;
        }
        if (enemy.pathRevision !== pathfinder.getRevision() || enemy.pathAge > 1.35 || enemy.pathIndex >= enemy.path.length - 1) {
          this._repathEnemy(enemy, pathfinder);
        }
        this._moveEnemy(enemy, dt, pathfinder);
        if (!enemy.dead && enemy.pathIndex >= enemy.path.length - 1) {
          const endPoint = enemy.path[enemy.path.length - 1];
          const distanceToEnd = Math.hypot(enemy.x - endPoint.x, enemy.y - endPoint.y);
          if (distanceToEnd <= pathfinder.getCellSize() * 0.1) {
            enemy.dead = true;
            this.lives = Math.max(0, this.lives - 1);
            this.waveLeakCount += 1;
            events.leaked += 1;
            events.leakedEnemies.push(enemy);
          }
        }
      }
      this.enemies = this.enemies.filter((enemy) => !enemy.dead);
      const waveFinished = this.spawnQueue.length === 0 && this.enemies.length === 0;
      if (waveFinished) {
        events.waveComplete = true;
        this.clearedWaves = Math.max(this.clearedWaves, this.waveIndex + 1);
        if (this.waveLeakCount === 0) {
          const clearBonus = 10 + this.waveIndex * 2;
          this.waveClearBonus = clearBonus;
          events.energyGain += clearBonus;
        }
        const nextIndex = this.waveIndex + 1;
        if (nextIndex >= this.waves.length) {
          this.complete = true;
          this.running = false;
          this.waveState = "complete";
        } else {
          this.pendingWaveIndex = nextIndex;
          this.waveCountdown = 5;
          this.waveState = "countdown";
          events.waveCountdown = this.waveCountdown;
        }
      }
      events.waveState = this.waveState;
      events.bossActive = Boolean(bossEnemy);
      events.waveClearBonus = this.waveClearBonus;
      return events;
    }
    draw(ctx, assets) {
      for (const enemy of this.enemies) {
        const size = enemy.radius * 2;
        const drawX = enemy.x - enemy.radius;
        const drawY = enemy.y - enemy.radius;
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.fillStyle = enemy.tint;
        ctx.globalAlpha = enemy.isBoss ? 0.28 : 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * (enemy.isBoss ? 2.1 : 1.65), 0, Math.PI * 2);
        ctx.fill();
        if (enemy.shield > 0) {
          const shieldRatio = enemy.maxShield > 0 ? enemy.shield / enemy.maxShield : 1;
          ctx.strokeStyle = `rgba(255, 223, 122, ${0.25 + shieldRatio * 0.5})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 8 + shieldRatio * 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (enemy.isBoss) {
          ctx.strokeStyle = "rgba(191, 252, 255, 0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (enemy.traits?.phaseShift) {
          ctx.strokeStyle = "rgba(156, 230, 255, 0.72)";
          ctx.lineWidth = enemy.isBoss ? 2.4 : 1.5;
          ctx.setLineDash(enemy.isBoss ? [12, 8] : [8, 6]);
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + (enemy.isBoss ? 20 : 11), 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (enemy.traits?.mirrorCaster) {
          ctx.strokeStyle = "rgba(215, 247, 255, 0.56)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(0, -enemy.radius - 7);
          ctx.lineTo(enemy.radius + 7, 0);
          ctx.lineTo(0, enemy.radius + 7);
          ctx.lineTo(-enemy.radius - 7, 0);
          ctx.closePath();
          ctx.stroke();
        }
        if (assets?.hologramCore) {
          ctx.globalAlpha = 0.95;
          ctx.drawImage(assets.hologramCore, -size * 0.45, -size * 0.45, size * 0.9, size * 0.9);
        } else {
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        if (enemy.burnTimer > 0) {
          ctx.strokeStyle = "rgba(255, 174, 87, 0.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + (enemy.isBoss ? 8 : 4), 0, Math.PI * 2);
          ctx.stroke();
        }
        if (enemy.slowTimer > 0) {
          ctx.strokeStyle = "rgba(125, 141, 255, 0.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + (enemy.isBoss ? 12 : 8), 0, Math.PI * 2);
          ctx.stroke();
        }
        if (enemy.effects?.mark) {
          ctx.strokeStyle = "rgba(255, 223, 122, 0.82)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (enemy.exposedTimer > 0) {
          ctx.strokeStyle = "rgba(211, 140, 255, 0.9)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (enemy.hitFlash > 0) {
          ctx.globalAlpha = Math.min(1, enemy.hitFlash * 4);
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        const barWidth = enemy.radius * 2.2;
        const barHeight = 5;
        const healthRatio = Math.max(0, enemy.health) / enemy.maxHealth;
        ctx.save();
        ctx.translate(drawX, drawY - 12);
        ctx.fillStyle = "rgba(4, 10, 18, 0.72)";
        ctx.fillRect(0, 0, barWidth, barHeight);
        ctx.fillStyle = healthRatio > 0.5 ? "#7df3ff" : healthRatio > 0.25 ? "#ffae57" : "#ff6f7d";
        ctx.fillRect(0, 0, barWidth * healthRatio, barHeight);
        ctx.restore();
      }
    }
    getEnemies() {
      return this.enemies;
    }
    isComplete() {
      return this.complete;
    }
    getWaveInfo() {
      const currentWave = this.waves[this.waveIndex] ?? null;
      const nextWave = this.waves[this.waveIndex + 1] ?? null;
      const bossActive = this.enemies.some((enemy) => enemy.isBoss);
      const previewWave = this.waveState === "countdown" ? nextWave : currentWave;
      const enemyTraits = [...new Set([
        ...this.enemies.map((enemy) => enemy.label),
        ...(previewWave?.actions ?? []).flatMap((action) => {
          if (action.type === "mix") {
            return (action.groups ?? []).map((group) => getKindDefinition(group.kind).label ?? group.kind);
          }
          if (action.kind) {
            return [getKindDefinition(action.kind).label ?? action.kind];
          }
          return [];
        })
      ])].slice(0, 5);
      return {
        wave: Math.min(this.waveIndex + 1, this.waves.length),
        totalWaves: this.waves.length,
        waveName: currentWave?.name ?? "Complete",
        nextWaveName: nextWave?.name ?? null,
        remainingInWave: this.spawnQueue.length + this.enemies.length,
        spawnedThisWave: this.spawnedThisWave,
        lives: this.lives,
        maxLives: this.maxLives,
        clearedWaves: this.clearedWaves,
        kills: this.kills,
        complete: this.complete,
        waveState: this.waveState,
        countdown: this.waveState === "countdown" ? this.waveCountdown : 0,
        bossActive,
        bossWave: Boolean(currentWave?.boss || (currentWave?.actions ?? []).some((action) => isBossKind(action.kind))),
        briefing: currentWave?.briefing ?? null,
        nextBriefing: nextWave?.briefing ?? null,
        enemyTraits,
        spawnPoints: collectWaveSpawnPoints(previewWave?.actions ?? []),
        waveClearBonus: this.waveClearBonus
      };
    }
    getPreviewPaths(pathfinder) {
      const previewWave = this.waveState === "countdown" ? this.waves[this.pendingWaveIndex ?? this.waveIndex + 1] ?? null : this.waves[this.waveIndex] ?? null;
      return collectWaveSpawnPoints(previewWave?.actions ?? []).map((spawnPoint) => {
        const entry = pathPointAtSpawn(pathfinder, spawnPoint);
        return {
          spawnPoint,
          spawn: entry.spawn,
          path: pathfinder.findPath(entry.spawn, entry.goal)
        };
      }).filter((entry) => entry.path.length > 0);
    }
  }

  // src/main.js
  var INITIAL_ENERGY = 260;
  var DEFAULT_FAST_MULTIPLIER = 2;
  var BOARD_ASPECT = 1.65;
  var VIEW_WIDTH = 1440;
  var VIEW_HEIGHT = 900;
  var TOWER_RADIUS = 28;
  var TOWER_CLEARANCE = 12;
  var app = document.getElementById("app");
  var canvas = document.getElementById("game-canvas");
  var ctx = canvas.getContext("2d");
  var menuScreen = document.getElementById("menu-screen");
  var hud = document.getElementById("hud");
  var winScreen = document.getElementById("win-screen");
  var startButton = document.getElementById("start-button");
  var menuRestartButton = document.getElementById("menu-restart-button");
  var restartButton = document.getElementById("restart-button");
  var winRestartButton = document.getElementById("win-restart-button");
  var pauseButton = document.getElementById("pause-button");
  var fastToggle = document.getElementById("fast-toggle");
  var waveValue = document.getElementById("wave-value");
  var waveNameValue = document.getElementById("wave-name-value");
  var waveStateValue = document.getElementById("wave-state-value");
  var energyValue = document.getElementById("energy-value");
  var livesValue = document.getElementById("lives-value");
  var countdownValue = document.getElementById("countdown-value");
  var bossValue = document.getElementById("boss-value");
  var enemyTraitsValue = document.getElementById("enemy-traits-value");
  var signalFeedTitle = document.getElementById("signal-feed-title");
  var signalFeedBody = document.getElementById("signal-feed-body");
  var winWavesValue = document.getElementById("win-waves-value");
  var gameoverWavesValue = document.getElementById("gameover-waves-value");
  var gameoverScreen = document.getElementById("gameover-screen");
  var gameoverRestartButton = document.getElementById("gameover-restart-button");
  var selectedTowerTitle = document.getElementById("selected-tower-title");
  var selectedTowerRole = document.getElementById("selected-tower-role");
  var selectedTowerStats = document.getElementById("selected-tower-stats");
  var towerPanel = hud.querySelector(".tower-panel");
  var towerUpgradeChoices = document.getElementById("tower-upgrade-choices");
  var towerUpgradeNote = document.getElementById("tower-upgrade-note");
  var statusMessage = document.createElement("p");
  statusMessage.id = "status-message";
  statusMessage.className = "hud__notice";
  statusMessage.setAttribute("aria-live", "polite");
  statusMessage.hidden = true;
  hud.insertBefore(statusMessage, hud.querySelector(".hud__bar--bottom"));
  var towerButtons = new Map([
    ["splash", document.getElementById("tower-splash")],
    ["slow", document.getElementById("tower-slow")],
    ["burn", document.getElementById("tower-burn")],
    ["needle", document.getElementById("tower-needle")],
    ["relay", document.getElementById("tower-relay")],
    ["disrupt", document.getElementById("tower-disrupt")]
  ]);
  var pathfinder = new Pathfinder({
    width: 900,
    height: 540,
    spawn: { x: 60, y: 270 },
    goal: { x: 840, y: 270 },
    sampleStep: 46,
    margin: 12
  });
  var waveManager = new WaveManager({ lives: 10 });
  var state = {
    phase: "menu",
    selectedTowerType: "splash",
    selectedTowerId: null,
    fastMode: false,
    energy: INITIAL_ENERGY,
    towers: [],
    projectiles: [],
    impacts: [],
    effects: createEffects(),
    hoverPoint: null,
    layout: {
      originX: 0,
      originY: 0,
      cellSize: 54,
      width: 900,
      height: 540
    },
    viewWidth: 0,
    viewHeight: 0,
    inputScaleX: 1,
    inputScaleY: 1,
    messageUntil: 0,
    messageTone: "info",
    messageText: "",
    lastFrame: 0
  };
  function setPhase(phase) {
    state.phase = phase;
    app.dataset.state = phase;
    menuScreen.setAttribute("aria-hidden", String(phase !== "menu"));
    hud.setAttribute("aria-hidden", String(phase !== "playing" && phase !== "paused"));
    winScreen.setAttribute("aria-hidden", String(phase !== "win"));
    gameoverScreen.setAttribute("aria-hidden", String(phase !== "gameover"));
    pauseButton.textContent = phase === "paused" ? "Resume" : "Pause";
  }
  function updatePlacementTower(type) {
    state.selectedTowerType = type;
    for (const [towerType, button] of towerButtons) {
      if (!button) {
        continue;
      }
      button.setAttribute("aria-pressed", String(towerType === type));
    }
  }
  function selectedTower() {
    return state.towers.find((tower) => tower.id === state.selectedTowerId) ?? null;
  }
  function setSelectedTower(tower) {
    state.selectedTowerId = tower?.id ?? null;
    for (const item of state.towers) {
      item.selected = item.id === state.selectedTowerId;
    }
    renderTowerPanel();
  }
  function computeLayout(width, height) {
    const marginX = Math.max(52, Math.floor(width * 0.07));
    const marginTop = Math.max(72, Math.floor(height * 0.09));
    const marginBottom = Math.max(86, Math.floor(height * 0.11));
    const availableWidth = width - marginX * 2;
    const availableHeight = height - marginTop - marginBottom;
    let boardWidth = availableWidth;
    let boardHeight = boardWidth / BOARD_ASPECT;
    if (boardHeight > availableHeight) {
      boardHeight = availableHeight;
      boardWidth = boardHeight * BOARD_ASPECT;
    }
    const originX = Math.floor((width - boardWidth) / 2);
    const originY = Math.floor(Math.max(marginTop, (height - boardHeight) / 2 + 22));
    return {
      originX,
      originY,
      cellSize: Math.max(36, Math.min(68, Math.floor(boardHeight / 10))),
      width: boardWidth,
      height: boardHeight,
      spawn: { x: originX + Math.max(42, boardWidth * 0.06), y: originY + boardHeight * 0.5 },
      goal: { x: originX + boardWidth - Math.max(42, boardWidth * 0.06), y: originY + boardHeight * 0.5 }
    };
  }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(VIEW_WIDTH * dpr));
    canvas.height = Math.max(1, Math.round(VIEW_HEIGHT * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.viewWidth = VIEW_WIDTH;
    state.viewHeight = VIEW_HEIGHT;
    state.inputScaleX = rect.width > 0 ? VIEW_WIDTH / rect.width : 1;
    state.inputScaleY = rect.height > 0 ? VIEW_HEIGHT / rect.height : 1;
    state.layout = computeLayout(VIEW_WIDTH, VIEW_HEIGHT);
    pathfinder.setWorld({
      width: state.layout.width,
      height: state.layout.height,
      spawn: state.layout.spawn,
      goal: state.layout.goal,
      sampleStep: Math.max(34, Math.floor(state.layout.cellSize * 0.78)),
      margin: TOWER_CLEARANCE,
      layout: state.layout
    });
    refreshBlockers();
  }
  function showMessage(text, tone = "info", duration = 1700) {
    state.messageText = text;
    state.messageTone = tone;
    state.messageUntil = performance.now() + duration;
    statusMessage.textContent = text;
    statusMessage.dataset.tone = tone;
    statusMessage.hidden = false;
  }
  function hideMessageIfExpired(now) {
    if (state.messageUntil && now >= state.messageUntil) {
      state.messageUntil = 0;
      statusMessage.hidden = true;
      statusMessage.textContent = "";
    }
  }
  function addEnergy(amount, source = "energy") {
    if (!(amount > 0)) {
      return 0;
    }
    state.energy += amount;
    triggerScreenFlash(state.effects, "energy", Math.min(0.55, 0.12 + amount * 0.03));
    if (source === "wave") {
      showMessage(`Wave bonus +${Math.round(amount)} energy`, "success", 1200);
    }
    return amount;
  }
  function resetRun() {
    state.energy = INITIAL_ENERGY;
    state.towers = [];
    state.projectiles = [];
    state.impacts = [];
    state.effects = createEffects();
    state.hoverPoint = null;
    state.selectedTowerId = null;
    waveManager.reset();
    refreshBlockers();
    updateHud();
    updatePlacementTower(state.selectedTowerType);
    renderTowerPanel();
  }
  function startRun() {
    resetRun();
    waveManager.start();
    setPhase("playing");
    showMessage("Wave 1 primed", "info");
  }
  function restartRun() {
    startRun();
  }
  function goToWin() {
    triggerScreenFlash(state.effects, "win", 1);
    setPhase("win");
    const info = waveManager.getWaveInfo();
    winWavesValue.textContent = `${info.clearedWaves} / ${info.totalWaves}`;
  }
  function goToGameOver() {
    triggerScreenFlash(state.effects, "gameOver", 1);
    setPhase("gameover");
    const info = waveManager.getWaveInfo();
    gameoverWavesValue.textContent = `${info.clearedWaves} / ${info.totalWaves}`;
  }
  function updateHud() {
    const info = waveManager.getWaveInfo();
    waveValue.textContent = `${info.wave} / ${info.totalWaves}`;
    waveNameValue.textContent = info.waveName;
    waveStateValue.textContent = info.waveState === "countdown" ? `Countdown ${info.countdown.toFixed(1)}s` : info.waveState === "complete" ? "Victory path" : info.waveState === "idle" ? "Ready" : "Active";
    energyValue.textContent = String(Math.max(0, Math.floor(state.energy)));
    livesValue.textContent = String(info.lives);
    countdownValue.textContent = info.waveState === "countdown" ? `${Math.max(0, info.countdown).toFixed(1)}s` : "0.0s";
    bossValue.textContent = info.bossActive ? info.waveState === "countdown" ? "Incoming" : "Live" : info.bossWave ? "Queued" : "None";
    enemyTraitsValue.textContent = (info.enemyTraits && info.enemyTraits.length > 0 ? info.enemyTraits.join(" / ") : "Quiet").slice(0, 36);
    updateSignalFeed(info);
    if (fastToggle) {
      fastToggle.textContent = state.fastMode ? "Fast x2" : "Fast x1";
      fastToggle.setAttribute("aria-pressed", String(state.fastMode));
    }
    pauseButton.textContent = state.phase === "paused" ? "Resume" : "Pause";
    if (gameoverScreen) {
      gameoverScreen.setAttribute("aria-hidden", String(state.phase !== "gameover"));
    }
    renderTowerPanel();
  }
  function defaultWaveBriefing(info) {
    const threats = info.enemyTraits?.slice(0, 3).join(", ");
    if (info.waveState === "countdown") {
      return info.nextBriefing ?? `Next wave ${info.nextWaveName ?? "broadcast"} is lining up across ${Math.max(1, info.spawnPoints?.length ?? 1)} breach routes.`;
    }
    if (info.bossActive || info.bossWave) {
      return info.briefing ?? `Boss pressure is active. Hold one clean route, strip shields, and answer the focal lane before the next phase wall forms.`;
    }
    if (threats) {
      return info.briefing ?? `Current pressure mix: ${threats}. Keep the center route readable and punish gaps between spawn bursts.`;
    }
    return info.briefing ?? "Routes are stable. Build off the center lane and prepare for split entries.";
  }
  function updateSignalFeed(info) {
    if (!signalFeedTitle || !signalFeedBody) {
      return;
    }
    if (info.waveState === "countdown") {
      signalFeedTitle.textContent = `Next: ${info.nextWaveName ?? "Complete"}`;
      signalFeedBody.textContent = defaultWaveBriefing(info);
      return;
    }
    signalFeedTitle.textContent = `Wave ${info.wave}: ${info.waveName}`;
    signalFeedBody.textContent = defaultWaveBriefing(info);
  }
  function currentBlockers() {
    return state.towers.map((tower) => ({
      x: tower.x,
      y: tower.y,
      radius: tower.radius ?? TOWER_RADIUS,
      margin: TOWER_CLEARANCE
    }));
  }
  function refreshBlockers() {
    pathfinder.updateBlockers(currentBlockers());
  }
  function pointInBoard(point) {
    const { originX, originY, width, height } = state.layout;
    return point && point.x >= originX + TOWER_RADIUS && point.y >= originY + TOWER_RADIUS && point.x <= originX + width - TOWER_RADIUS && point.y <= originY + height - TOWER_RADIUS;
  }
  function towerAtPoint(point) {
    return state.towers.find((tower) => Math.hypot(tower.x - point.x, tower.y - point.y) < TOWER_RADIUS * 2 + 8) ?? null;
  }
  function placementBlocker(point) {
    return {
      x: point.x,
      y: point.y,
      radius: TOWER_RADIUS,
      margin: TOWER_CLEARANCE
    };
  }
  function canPlaceAt(point) {
    const definition = TOWER_TYPES[state.selectedTowerType];
    return Boolean(pointInBoard(point) && definition && state.energy >= definition.cost && !towerAtPoint(point) && pathfinder.canPlaceBlocker(placementBlocker(point)));
  }
  function placeTowerAt(point) {
    if (!pointInBoard(point)) {
      return;
    }
    if (towerAtPoint(point)) {
      showMessage("Tower field overlaps", "error");
      return;
    }
    const definition = TOWER_TYPES[state.selectedTowerType];
    if (!definition) {
      showMessage("Tower type unavailable", "error");
      return;
    }
    if (state.energy < definition.cost) {
      showMessage("Not enough energy", "error");
      return;
    }
    if (!pathfinder.canPlaceBlocker(placementBlocker(point))) {
      showMessage("Route blocked. Placement rejected.", "error", 2200);
      state.impacts.push({
        x: point.x,
        y: point.y,
        color: "#ff6f7d",
        life: 0.5
      });
      return;
    }
    const tower = createTower(state.selectedTowerType, point.x, point.y, state.layout);
    tower.radius = TOWER_RADIUS;
    tower.baseType = state.selectedTowerType;
    tower.upgradeStage = 0;
    tower.upgradeBranch = null;
    tower.roleLabel = definition.roleLabel ?? definition.label;
    state.towers.push(tower);
    state.energy -= definition.cost;
    refreshBlockers();
    playPlacementSound();
    spawnBurst(state.effects, { x: tower.x, y: tower.y, color: definition.color, count: 12, speed: 120, life: 0.35, size: 2.4, glow: 0.9 });
    triggerScreenFlash(state.effects, "spawn", 0.5);
    setSelectedTower(tower);
    showMessage(`${definition.label} placed`, "success");
    updateHud();
  }
  function upgradeChoicesForTower(tower) {
    return getUpgradeOptions(tower);
  }
  function effectSummary(definition) {
    if (definition.family === "needle") {
      return `Marks targets ${definition.markDuration.toFixed(1)}s`;
    }
    if (definition.family === "relay") {
      return `Scan energy +${definition.scanReward ?? 0}`;
    }
    if (definition.family === "disrupt") {
      return `Shield break ${Math.round(definition.shieldBreak ?? 0)}`;
    }
    if (definition.burnDps) {
      return `Burn ${definition.burnDps.toFixed(0)} DPS`;
    }
    if (definition.slowFactor) {
      return `Slow ${(100 - definition.slowFactor * 100).toFixed(0)}%`;
    }
    return `Blast radius ${definition.impactRadiusCells.toFixed(2)} cells`;
  }
  function currentTowerStats(tower) {
    const definition = getTowerDefinition(tower?.type ?? state.selectedTowerType);
    return {
      damage: `${Math.round(definition.damage)}`,
      range: `${definition.rangeCells.toFixed(1)} cells`,
      rate: `${definition.fireRate.toFixed(2)}/s`,
      effect: effectSummary(definition)
    };
  }
  function towerPanelSignature() {
    const tower = selectedTower();
    const energy = Math.max(0, Math.floor(state.energy));
    if (!tower) {
      return `browse|${state.selectedTowerType}|${energy}`;
    }
    const branches = upgradeChoicesForTower(tower).map((branch) => `${branch.id}:${canUpgradeTower(state, tower, branch.id) ? 1 : 0}`).join("|");
    return [
      "tower",
      tower.id,
      tower.type,
      tower.baseType ?? "",
      tower.upgradeStage ?? 0,
      tower.upgradeBranch ?? "",
      tower.roleLabel ?? "",
      energy,
      branches
    ].join("|");
  }
  function renderTowerPanel() {
    const signature = towerPanelSignature();
    if (state.towerPanelSignature === signature) {
      return;
    }
    state.towerPanelSignature = signature;
    const tower = selectedTower();
    const isTower = Boolean(tower);
    const baseType = tower?.baseType ?? tower?.type?.split("_")[0] ?? state.selectedTowerType;
    const definition = getTowerDefinition(tower?.type ?? state.selectedTowerType);
    const tree = TOWER_UPGRADES[baseType] ?? null;
    const label = tower ? definition.label : definition.label;
    if (towerPanel) {
      towerPanel.dataset.mode = isTower ? "selected" : "browse";
    }
    if (selectedTowerTitle) {
      selectedTowerTitle.textContent = label;
    }
    if (selectedTowerRole) {
      selectedTowerRole.textContent = tower ? tower.roleLabel ?? definition.roleLabel ?? definition.label : definition.roleLabel ?? definition.label;
    }
    if (selectedTowerStats) {
      selectedTowerStats.innerHTML = "";
      const stats = tower ? currentTowerStats(tower) : currentTowerStats({ type: state.selectedTowerType });
      for (const [key, value] of Object.entries(stats)) {
        const wrap = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = key;
        dd.textContent = value;
        wrap.append(dt, dd);
        selectedTowerStats.append(wrap);
      }
    }
    if (towerUpgradeChoices) {
      towerUpgradeChoices.innerHTML = "";
      const branches = upgradeChoicesForTower(tower);
      if (isTower && branches.length === 0) {
        const done = document.createElement("button");
        done.type = "button";
        done.disabled = true;
        done.innerHTML = "<strong>Max role</strong><span>Final form reached.</span>";
        towerUpgradeChoices.append(done);
      } else if (isTower) {
        for (const branch of branches) {
          const upgradeDefinition = branch.definition ?? getTowerDefinition(branch.type);
          const button = document.createElement("button");
          button.type = "button";
          button.disabled = !canUpgradeTower(state, tower, branch.id);
          button.innerHTML = `
          <strong>${branch.label}</strong>
          <span>Cost ${branch.cost} energy</span>
          <span>${branch.finalRole}</span>
          <span>D ${Math.round(upgradeDefinition.damage)} / R ${upgradeDefinition.rangeCells.toFixed(1)}</span>
          <span>${effectSummary(upgradeDefinition)}</span>
        `;
          button.addEventListener("click", () => applyTowerUpgrade(tower, branch));
          towerUpgradeChoices.append(button);
        }
      }
    }
    if (towerUpgradeNote) {
      if (!isTower) {
        towerUpgradeNote.textContent = tree ? `Place ${tree.label} towers to unlock branches.` : "Place a tower to inspect upgrade paths.";
      } else if (upgradeChoicesForTower(tower).length === 0) {
        towerUpgradeNote.textContent = "This tower is at its final role.";
      } else {
        towerUpgradeNote.textContent = "Choose a branch. Disabled buttons mean energy is short.";
      }
    }
  }
  function applyTowerUpgrade(tower, branch) {
    if (!tower || !branch) {
      return;
    }
    if (!canUpgradeTower(state, tower, branch.id)) {
      showMessage("Not enough energy", "error");
      triggerScreenFlash(state.effects, "damage", 0.15);
      return;
    }
    const result = upgradeTower(state, tower, branch.id);
    if (!result) {
      showMessage("Upgrade failed", "error");
      return;
    }
    const nextDefinition = result.definition;
    triggerScreenFlash(state.effects, "upgrade", 0.65);
    spawnBurst(state.effects, { x: tower.x, y: tower.y, color: nextDefinition.color, count: 16, speed: 150, life: 0.4, size: 2.8, glow: 1, ring: true });
    spawnShockwave(state.effects, { x: tower.x, y: tower.y, color: nextDefinition.color, radius: TOWER_RADIUS + 10, life: 0.45 });
    showMessage(`${branch.finalRole} online`, "success");
    updateHud();
  }
  function playPlacementSound() {
    if (!assets?.place) {
      return;
    }
    const sound = assets.place.cloneNode();
    sound.volume = 0.55;
    sound.play().catch(() => {});
  }
  function updatePointerCell(event) {
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) * state.inputScaleX,
      y: (event.clientY - rect.top) * state.inputScaleY
    };
    state.hoverPoint = pointInBoard(point) ? point : null;
  }
  function handleBoardClick(event) {
    if (state.phase !== "playing") {
      return;
    }
    updatePointerCell(event);
    if (!state.hoverPoint) {
      return;
    }
    const tower = towerAtPoint(state.hoverPoint);
    if (tower) {
      setSelectedTower(tower);
      return;
    }
    placeTowerAt(state.hoverPoint);
  }
  function getPathPoints() {
    return pathfinder.findPath(pathfinder.spawn, pathfinder.goalPoint);
  }
  function getPreviewPaths() {
    if (typeof waveManager.getPreviewPaths === "function") {
      return waveManager.getPreviewPaths(pathfinder);
    }
    const fallbackPath = getPathPoints();
    return fallbackPath.length > 0 ? [{ spawnPoint: "default", spawn: state.layout.spawn, path: fallbackPath }] : [];
  }
  function drawBackground() {
    const { width, height } = state.viewWidth > 0 ? { width: state.viewWidth, height: state.viewHeight } : canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(4, 13, 24, 1)");
    gradient.addColorStop(1, "rgba(1, 5, 10, 1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "rgba(125, 243, 255, 0.03)";
    for (let x = 0;x < width; x += 56) {
      ctx.fillRect(x, 0, 1, height);
    }
    for (let y = 0;y < height; y += 56) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
  }
  function drawBoard() {
    const { originX, originY, cellSize, width, height } = state.layout;
    const previewPaths = getPreviewPaths();
    const start = state.layout.spawn;
    const goal = state.layout.goal;
    ctx.save();
    ctx.fillStyle = "rgba(8, 18, 32, 0.72)";
    ctx.strokeStyle = "rgba(125, 243, 255, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(originX - 8, originY - 8, width + 16, height + 16, 18);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(125, 243, 255, 0.12)";
    for (let ring = 1;ring <= 3; ring += 1) {
      const inset = ring * cellSize * 0.9;
      if (inset * 2 >= width || inset * 2 >= height) {
        break;
      }
      ctx.beginPath();
      ctx.roundRect(originX + inset, originY + inset, width - inset * 2, height - inset * 2, 24);
      ctx.stroke();
    }
    if (previewPaths.length > 0) {
      previewPaths.forEach(({ path, spawn }, index) => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = index === 0 ? "rgba(125, 243, 255, 0.3)" : "rgba(125, 243, 255, 0.18)";
        ctx.lineWidth = index === 0 ? 5 : 3;
        ctx.setLineDash(index === 0 ? [] : [8, 10]);
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1;i < path.length; i += 1) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (spawn) {
          ctx.fillStyle = "rgba(125, 243, 255, 0.08)";
          ctx.beginPath();
          ctx.arc(spawn.x, spawn.y, cellSize * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }
    if (start) {
      ctx.save();
      ctx.fillStyle = "rgba(125, 243, 255, 0.12)";
      ctx.beginPath();
      ctx.arc(start.x, start.y, cellSize * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(125, 243, 255, 0.65)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    if (goal) {
      ctx.save();
      ctx.fillStyle = "rgba(255, 174, 87, 0.12)";
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, cellSize * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 174, 87, 0.72)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    for (const tower of state.towers) {
      ctx.save();
      ctx.fillStyle = "rgba(8, 18, 32, 0.42)";
      ctx.strokeStyle = TOWER_TYPES[tower.type].color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, TOWER_RADIUS + TOWER_CLEARANCE, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (tower.id === state.selectedTowerId) {
        ctx.strokeStyle = "rgba(125, 243, 255, 0.92)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, TOWER_RADIUS + TOWER_CLEARANCE + 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (tower.upgradeStage > 0) {
        ctx.strokeStyle = "rgba(255, 174, 87, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, TOWER_RADIUS + TOWER_CLEARANCE + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (state.phase === "playing" && state.hoverPoint) {
      const valid = canPlaceAt(state.hoverPoint);
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = valid ? "rgba(125, 243, 255, 0.8)" : "rgba(255, 111, 125, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(state.hoverPoint.x, state.hoverPoint.y, TOWER_RADIUS + TOWER_CLEARANCE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = valid ? "rgba(125, 243, 255, 0.12)" : "rgba(255, 111, 125, 0.12)";
      ctx.fill();
      ctx.restore();
    }
  }
  function drawImpacts(dt) {
    for (const impact of state.impacts) {
      impact.life -= dt;
    }
    state.impacts = state.impacts.filter((impact) => impact.life > 0);
    for (const impact of state.impacts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, impact.life / 0.5));
      ctx.strokeStyle = impact.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, 16 + (1 - impact.life / 0.5) * 54, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  function update(dt) {
    if (state.phase !== "playing") {
      updateHud();
      return;
    }
    updateEffects(state.effects, dt);
    const events = waveManager.update(dt, pathfinder);
    const enemies = waveManager.getEnemies();
    if (events.energyGain > 0) {
      addEnergy(events.energyGain, "wave");
    }
    const combatContext = {
      effects: state.effects,
      onEnergyGain: (amount) => addEnergy(amount, "combat")
    };
    const fired = updateTowerFire(dt, state.towers, enemies, state.layout, combatContext);
    state.projectiles.push(...fired);
    const bursts = advanceProjectiles(dt, state.projectiles, enemies, state.layout, combatContext);
    state.impacts.push(...bursts.map((burst2) => ({
      x: burst2.x,
      y: burst2.y,
      color: burst2.color,
      life: 0.22
    })));
    state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
    for (const enemy of events.spawnedEnemies) {
      spawnBurst(state.effects, { x: enemy.x, y: enemy.y, color: enemy.tint, count: enemy.isBoss ? 16 : 8, speed: enemy.isBoss ? 180 : 120, life: enemy.isBoss ? 0.5 : 0.3, size: enemy.isBoss ? 3.2 : 2.4, glow: 0.8, ring: enemy.isBoss });
      if (enemy.isBoss) {
        triggerScreenFlash(state.effects, "boss", 1);
        spawnHologramPulse(state.effects, { x: enemy.x, y: enemy.y, color: enemy.tint, radius: enemy.radius + 18, life: 0.7 });
      }
    }
    for (const enemy of events.destroyedEnemies) {
      spawnBurst(state.effects, { x: enemy.x, y: enemy.y, color: "#ffffff", count: enemy.isBoss ? 20 : 10, speed: enemy.isBoss ? 200 : 140, life: 0.35, size: enemy.isBoss ? 3.4 : 2.5, glow: 0.9, ring: true });
      spawnShockwave(state.effects, { x: enemy.x, y: enemy.y, color: enemy.tint, radius: enemy.radius + 14, life: 0.28 });
      triggerScreenFlash(state.effects, "death", enemy.isBoss ? 0.55 : 0.25);
      if (enemy.isBoss) {
        triggerScreenFlash(state.effects, "boss", 1.2);
        spawnHologramPulse(state.effects, { x: enemy.x, y: enemy.y, color: "#bffcff", radius: enemy.radius + 26, life: 0.8 });
      }
    }
    if (events.bossPulse) {
      const boss = enemies.find((enemy) => enemy.isBoss && !enemy.dead) ?? events.spawnedEnemies.find((enemy) => enemy.isBoss) ?? null;
      if (boss) {
        triggerScreenFlash(state.effects, "disruption", 0.9);
        spawnHologramPulse(state.effects, { x: boss.x, y: boss.y, color: boss.tint, radius: boss.radius + 30, life: 0.45 });
      }
    }
    for (const enemy of events.leakedEnemies) {
      triggerScreenFlash(state.effects, "damage", 0.7);
      spawnBurst(state.effects, { x: enemy.x, y: enemy.y, color: "#ff6f7d", count: 10, speed: 180, life: 0.32, size: 2.8, glow: 0.9, ring: true });
    }
    if (events.waveAdvanced) {
      showMessage(`Wave ${waveManager.getWaveInfo().wave} deployed`, "info");
    }
    if (events.leaked > 0) {
      showMessage("Leak registered", "error");
    }
    updateHud();
    if (waveManager.getWaveInfo().lives <= 0) {
      goToGameOver();
      return;
    }
    if (waveManager.isComplete()) {
      goToWin();
    }
  }
  function draw(now, dt) {
    hideMessageIfExpired(now);
    drawBackground();
    drawBoard();
    drawImpacts(dt);
    waveManager.draw(ctx, assets);
    drawProjectiles(ctx, state.projectiles);
    drawTowers(ctx, state.towers, state.layout);
    drawEffects(ctx, state.effects, state.viewWidth, state.viewHeight);
    if (state.phase === "paused") {
      ctx.save();
      ctx.fillStyle = "rgba(2, 6, 12, 0.32)";
      ctx.fillRect(0, 0, state.viewWidth, state.viewHeight);
      ctx.restore();
    }
  }
  function frame(now) {
    const last = state.lastFrame || now;
    const dt = Math.min(0.033, (now - last) / 1000);
    const simDt = dt * (state.fastMode ? DEFAULT_FAST_MULTIPLIER : 1);
    state.lastFrame = now;
    state.lastDt = dt;
    if (state.phase === "playing") {
      update(simDt);
    } else {
      updateHud();
      updateEffects(state.effects, dt);
    }
    draw(now, dt);
    requestAnimationFrame(frame);
  }
  function togglePause() {
    if (state.phase === "playing") {
      setPhase("paused");
      showMessage("Paused", "info", 900);
    } else if (state.phase === "paused") {
      setPhase("playing");
      showMessage("Resumed", "info", 900);
    }
  }
  function toggleFastMode() {
    state.fastMode = !state.fastMode;
    showMessage(state.fastMode ? "Fast mode x2" : "Fast mode x1", "info", 900);
    updateHud();
  }
  function bindEvents() {
    startButton.addEventListener("click", startRun);
    menuRestartButton.addEventListener("click", restartRun);
    restartButton.addEventListener("click", restartRun);
    winRestartButton.addEventListener("click", restartRun);
    gameoverRestartButton.addEventListener("click", restartRun);
    pauseButton.addEventListener("click", togglePause);
    fastToggle.addEventListener("click", toggleFastMode);
    for (const [type, button] of towerButtons) {
      if (!button) {
        continue;
      }
      button.addEventListener("click", () => updatePlacementTower(type));
    }
    canvas.addEventListener("mousemove", updatePointerCell);
    canvas.addEventListener("mouseleave", () => {
      state.hoverPoint = null;
    });
    canvas.addEventListener("click", handleBoardClick);
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (state.phase === "playing") {
          setPhase("paused");
        } else if (state.phase === "paused") {
          setPhase("playing");
        }
      }
      if (event.key === "1") {
        updatePlacementTower("splash");
      } else if (event.key === "2") {
        updatePlacementTower("slow");
      } else if (event.key === "3") {
        updatePlacementTower("burn");
      } else if (event.key === "4") {
        updatePlacementTower("needle");
      } else if (event.key === "5") {
        updatePlacementTower("relay");
      } else if (event.key === "6") {
        updatePlacementTower("disrupt");
      } else if (event.key === "f") {
        toggleFastMode();
      }
      if (event.key === "r") {
        restartRun();
      }
    });
  }
  var assets;
  async function boot() {
    bindEvents();
    updatePlacementTower("splash");
    resizeCanvas();
    setPhase("menu");
    try {
      assets = await loadAssets();
    } catch (error) {
      console.error(error);
      showMessage("Asset load failed, using vector fallback.", "error", 2600);
    }
    updateHud();
    renderTowerPanel();
    requestAnimationFrame(frame);
  }
  boot();
})();
