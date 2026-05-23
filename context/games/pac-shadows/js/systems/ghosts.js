export const createGhostSystem = (config) => ({
  config,
  ghosts: [],
  threatLevel: 0,
  update(dt, { player, maze, lighting, fx }) {
    let highestThreat = 0;
    const events = [];

    for (const ghost of this.ghosts) {
      updateGhost(ghost, dt, { player, maze, lighting, config: this.config, fx, events });
      highestThreat = Math.max(highestThreat, ghost.awareness);

      const captureDistance = Math.hypot(player.x - ghost.x, player.y - ghost.y);
      if (captureDistance <= this.config.captureRadius) {
        this.threatLevel = highestThreat;
        return {
          capture: true,
          events,
          ghostId: ghost.id,
          state: ghost.state,
          x: ghost.x,
          y: ghost.y
        };
      }
    }

    this.threatLevel = highestThreat;
    return { capture: false, events };
  },
  render(ctx, maze, assets) {
    for (const ghost of this.ghosts) {
      drawGhost(ctx, ghost, maze, this.config, assets);
    }
  },
  reset(maze) {
    this.ghosts = this.config.spawnCells.map((cell, index) => spawnGhost(cell, index, maze, this.config));
    this.threatLevel = 0;
  }
});

const updateGhost = (ghost, dt, { player, maze, lighting, config, fx, events }) => {
  const exposure = lighting.getExposureAt(ghost.x, ghost.y, maze);
  const playerCell = maze.cellFromWorld(player.x, player.y);
  const playerVisible = maze.hasLineOfSight(ghost.x, ghost.y, player.x, player.y);
  const playerDistance = Math.hypot(player.x - ghost.x, player.y - ghost.y);
  const previousAwareness = ghost.awareness;

  ghost.stateTime += dt;
  ghost.awareness = clamp(
    ghost.awareness + exposure * config.awarenessGain * dt - config.awarenessDecay * dt,
    0,
    1
  );

  if (playerVisible && playerDistance < config.sightRadius) {
    ghost.awareness = clamp(ghost.awareness + 0.3 * dt, 0, 1);
    ghost.memory = config.memoryDuration;
    ghost.lastSeenCell = { ...playerCell };
  } else {
    ghost.memory = Math.max(0, ghost.memory - dt);
    if (exposure > 0.01) {
      ghost.lastSeenCell = { ...playerCell };
      ghost.memory = config.memoryDuration;
    }
  }

  const nextState = ghost.awareness >= config.huntThreshold
    ? "hunt"
    : ghost.awareness >= config.searchThreshold || ghost.memory > 0
      ? "search"
      : "patrol";

  if (nextState !== ghost.state) {
    ghost.state = nextState;
    ghost.stateTime = 0;
    ghost.path = [];
    ghost.pathIndex = 0;
    ghost.repathTimer = 0;
    events.push({
      type: "ghost-state",
      ghostId: ghost.id,
      state: ghost.state,
      x: ghost.x,
      y: ghost.y
    });
    if (fx && (ghost.state === "search" || ghost.state === "hunt")) {
      fx.spawn(ghost.x, ghost.y, ghost.state === "hunt" ? "#ff7b7b" : "#ffb46b", 10);
    }
  }

  const wasLit = ghost.lastExposure > 0.16;
  const isLit = exposure > 0.16;
  if (!wasLit && isLit) {
    events.push({
      type: "ghost-lit",
      ghostId: ghost.id,
      exposure,
      x: ghost.x,
      y: ghost.y
    });
    if (fx) {
      fx.spawn(ghost.x, ghost.y, "#a0ffef", 8);
    }
  }

  if (previousAwareness < config.searchThreshold && ghost.awareness >= config.searchThreshold) {
    events.push({
      type: "ghost-search",
      ghostId: ghost.id,
      exposure,
      x: ghost.x,
      y: ghost.y
    });
  }

  const targetCell = selectTargetCell(ghost, playerCell, maze, config);
  if (targetCell) {
    if (!ghost.path.length || ghost.repathTimer <= 0 || targetChanged(ghost, targetCell)) {
      ghost.path = maze.findPath(maze.cellFromWorld(ghost.x, ghost.y), targetCell);
      ghost.pathIndex = ghost.path.length > 1 ? 1 : 0;
      ghost.targetCell = { ...targetCell };
      ghost.repathTimer = config.repathInterval;
    } else {
      ghost.repathTimer -= dt;
    }
  }

  const speed = ghost.state === "hunt"
    ? config.huntSpeed
    : ghost.state === "search"
      ? config.searchSpeed
      : config.patrolSpeed;

  followPath(ghost, maze, speed, dt, config);

  if (playerVisible && exposure > 0.05) {
    ghost.lastSeenCell = { ...playerCell };
  }

  ghost.lastExposure = exposure;
};

const followPath = (ghost, maze, speed, dt, config) => {
  if (!ghost.path.length) {
    return;
  }

  while (ghost.pathIndex < ghost.path.length) {
    const cell = ghost.path[ghost.pathIndex];
    const target = maze.centerOfCell(cell.col, cell.row);
    const distance = Math.hypot(target.x - ghost.x, target.y - ghost.y);
    if (distance > config.waypointReach) {
      moveTowards(ghost, target.x, target.y, speed, dt, maze);
      return;
    }
    ghost.pathIndex += 1;
  }

  if (ghost.state === "patrol") {
    ghost.path = [];
    ghost.pathIndex = 0;
  }
};

const moveTowards = (ghost, targetX, targetY, speed, dt, maze) => {
  const dx = targetX - ghost.x;
  const dy = targetY - ghost.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-4) {
    return true;
  }

  const step = speed * dt;
  const moveX = (dx / distance) * step;
  const moveY = (dy / distance) * step;
  ghost.facingX = dx / distance;
  ghost.facingY = dy / distance;
  ghost.facingAngle = Math.atan2(ghost.facingY, ghost.facingX);

  const nextX = ghost.x + moveX;
  const nextY = ghost.y + moveY;

  if (!maze.collideCircle(nextX, ghost.y, ghost.radius)) {
    ghost.x = nextX;
  }

  if (!maze.collideCircle(ghost.x, nextY, ghost.radius)) {
    ghost.y = nextY;
  }

  return distance <= step;
};

const selectTargetCell = (ghost, playerCell, maze, config) => {
  if (ghost.state === "hunt") {
    return playerCell;
  }

  if (ghost.state === "search") {
    return ghost.lastSeenCell ?? playerCell;
  }

  if (!ghost.patrolTarget || ghost.pathIndex >= ghost.path.length) {
    ghost.patrolTarget = pickPatrolCell(ghost, maze, config);
  }

  return ghost.patrolTarget;
};

const pickPatrolCell = (ghost, maze, config) => {
  const current = maze.cellFromWorld(ghost.x, ghost.y);
  const matches = maze.getOpenCells().filter((cell) => {
    if (cell.row === current.row && cell.col === current.col) {
      return false;
    }
    const targetDistance = Math.hypot(cell.col - current.col, cell.row - current.row);
    return targetDistance > 2;
  });

  if (!matches.length) {
    return maze.randomOpenCell();
  }

  const preferred = matches.filter((cell) => {
    const spawnDistance = Math.hypot(cell.col - ghost.homeCell.col, cell.row - ghost.homeCell.row);
    return spawnDistance > 1;
  });

  const source = preferred.length ? preferred : matches;
  return { ...source[(Math.random() * source.length) | 0] };
};

const spawnGhost = (cell, index, maze, config) => {
  const spawn = maze.centerOfCell(cell.col, cell.row);
  return {
    id: `ghost-${index}`,
    x: spawn.x,
    y: spawn.y,
    homeCell: { ...cell },
    patrolTarget: null,
    lastSeenCell: { ...cell },
    path: [],
    pathIndex: 0,
    awareness: 0,
    memory: 0,
    state: "patrol",
    stateTime: 0,
    repathTimer: 0,
    radius: config.radius,
    color: index % 2 === 0 ? "#ff7b7b" : "#9ecbff",
    facingX: 1,
    facingY: 0,
    facingAngle: 0,
    lastExposure: 0
  };
};

const drawGhost = (ctx, ghost, maze, config, assets) => {
  const stateColor = {
    patrol: "#8fb5ff",
    search: "#ffb46b",
    hunt: "#ff6d6d"
  }[ghost.state] ?? ghost.color;

  ctx.save();
  ctx.translate(ghost.x, ghost.y);

  const sprite = assets?.images?.ghost;
  if (sprite) {
    const size = ghost.radius * 2.8;
    ctx.shadowColor = stateColor;
    ctx.shadowBlur = 12 + ghost.awareness * 18;
    ctx.drawImage(sprite, -size * 0.5, -size * 0.5, size, size);
  } else {
    ctx.shadowColor = stateColor;
    ctx.shadowBlur = 12 + ghost.awareness * 18;
    ctx.fillStyle = stateColor;
    ctx.beginPath();
    ctx.arc(0, 0, ghost.radius, Math.PI, 0);
    ctx.lineTo(ghost.radius, ghost.radius);
    const skirtWidth = ghost.radius * 0.72;
    ctx.bezierCurveTo(skirtWidth, ghost.radius * 0.15, skirtWidth * 0.64, ghost.radius * 0.56, 0, ghost.radius * 0.18);
    ctx.bezierCurveTo(-skirtWidth * 0.64, ghost.radius * 0.56, -skirtWidth, ghost.radius * 0.15, -ghost.radius, ghost.radius);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.arc(-ghost.radius * 0.32, -ghost.radius * 0.12, ghost.radius * 0.16, 0, Math.PI * 2);
    ctx.arc(ghost.radius * 0.32, -ghost.radius * 0.12, ghost.radius * 0.16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ghost.state === "hunt" ? "#1b1020" : "#102134";
    ctx.beginPath();
    ctx.arc(-ghost.radius * 0.32, -ghost.radius * 0.12, ghost.radius * 0.07, 0, Math.PI * 2);
    ctx.arc(ghost.radius * 0.32, -ghost.radius * 0.12, ghost.radius * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  if (config.debugLabels) {
    ctx.fillStyle = "rgba(247,244,234,0.9)";
    ctx.font = "600 10px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(
      `${ghost.state.toUpperCase()} ${(ghost.awareness * 100).toFixed(0)}%`,
      0,
      -ghost.radius - 8
    );
  }

  if ((config.debug?.showPaths ?? config.showPaths) && ghost.path.length > 1) {
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let index = ghost.pathIndex; index < ghost.path.length; index += 1) {
      const cell = ghost.path[index];
      const point = maze.centerOfCell(cell.col, cell.row);
      ctx.lineTo(point.x - ghost.x, point.y - ghost.y);
    }
    ctx.stroke();
  }

  ctx.restore();
};

const targetChanged = (ghost, targetCell) =>
  !ghost.targetCell || ghost.targetCell.col !== targetCell.col || ghost.targetCell.row !== targetCell.row;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
