const DEFAULTS = {
  gravity: 2500,
  maxRunSpeed: 330,
  groundAccel: 3800,
  airAccel: 1850,
  groundFriction: 3200,
  airFriction: 180,
  jumpSpeed: 880,
  jumpCutSpeed: 300,
  coyoteTime: 0.11,
  jumpBuffer: 0.14,
  maxFallSpeed: 1120,
  wallSlideSpeed: 150,
  wallJumpX: 370,
  wallJumpY: 860,
  playerWidth: 28,
  playerHeight: 38,
  cornerKick: 6,
  ledgePop: 6,
  wallProbe: 3,
  deathFloorPadding: 120,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export class PhysicsCore {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  spawn(level) {
    const spawn = level?.spawn ?? { x: 0, y: 0 };
    return {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: false,
      onWall: 0,
      wallSide: 0,
      jumpHold: 0,
      coyote: this.config.coyoteTime,
      bufferedJump: 0,
      alive: true,
      width: this.config.playerWidth,
      height: this.config.playerHeight,
      events: [],
      levelId: level?.id ?? null,
    };
  }

  step(state, inputFrame = {}, dt = 1 / 60, level = null) {
    const levelData = level ?? {};
    const solids = this.buildSolids(levelData);
    const hazards = this.buildHazards(levelData);
    const goal = levelData.goal ?? null;
    const cfg = this.config;
    const next = { ...state, events: [] };
    const wasGrounded = Boolean(state.grounded);

    const moveX = clamp(inputFrame.moveX ?? 0, -1, 1);
    const jumpHeld = Boolean(inputFrame.jump);
    const jumpPressed = Boolean(inputFrame.jumpPressed);
    const jumpReleased = Boolean(inputFrame.jumpReleased);

    next.bufferedJump = jumpPressed ? cfg.jumpBuffer : Math.max(0, (next.bufferedJump ?? 0) - dt);
    next.coyote = next.grounded ? cfg.coyoteTime : Math.max(0, (next.coyote ?? 0) - dt);
    next.jumpHold = jumpHeld ? (next.jumpHold ?? 0) + dt : 0;

    const targetSpeed = moveX * cfg.maxRunSpeed;
    const accel = next.grounded ? cfg.groundAccel : cfg.airAccel;
    const friction = next.grounded ? cfg.groundFriction : cfg.airFriction;

    if (moveX !== 0) {
      const delta = clamp(targetSpeed - next.vx, -accel * dt, accel * dt);
      next.vx += delta;
      next.facing = moveX > 0 ? 1 : -1;
    } else if (Math.abs(next.vx) > 0) {
      const drag = Math.min(Math.abs(next.vx), friction * dt);
      next.vx -= Math.sign(next.vx) * drag;
    }

    next.vy = Math.min(cfg.maxFallSpeed, next.vy + cfg.gravity * dt);

    const touchingWall = this.findWallSide(next, solids, cfg.wallProbe);
    next.onWall = touchingWall;
    next.wallSide = touchingWall;
    if (!next.grounded && touchingWall && next.vy > cfg.wallSlideSpeed) {
      next.vy = cfg.wallSlideSpeed;
      next.events.push({ type: "wall-slide", side: touchingWall });
    }

    const wantsJump = next.bufferedJump > 0 && (next.grounded || next.coyote > 0 || touchingWall !== 0);
    if (wantsJump) {
      if (touchingWall && !next.grounded) {
        next.vx = -touchingWall * cfg.wallJumpX;
        next.vy = -cfg.wallJumpY;
      } else {
        next.vy = -cfg.jumpSpeed;
      }
      next.grounded = false;
      next.coyote = 0;
      next.bufferedJump = 0;
      next.events.push({ type: "jump" });
    }

    if (jumpReleased && next.vy < -cfg.jumpCutSpeed) {
      next.vy = -cfg.jumpCutSpeed;
      next.events.push({ type: "jump-cut" });
    }

    const moved = this.resolveMove(next, solids, next.vx * dt, next.vy * dt, cfg);
    next.x = moved.x;
    next.y = moved.y;
    next.vx = moved.vx;
    next.vy = moved.vy;
    next.grounded = moved.grounded;
    next.onWall = moved.onWall;
    next.wallSide = moved.wallSide;

    if (!wasGrounded && next.grounded) {
      next.events.push({ type: "landed" });
    }

    const hitHazard = this.touchHazard(next, hazards);
    const fellOut =
      next.y - next.height * 0.5 > (levelData.render?.height ?? 0) + cfg.deathFloorPadding;
    if (hitHazard || fellOut) {
      next.alive = false;
      next.events.push({ type: "death", cause: hitHazard ? "hazard" : "abyss" });
    }

    let goalHit = false;
    if (goal) {
      const dxGoal = next.x - goal.x;
      const dyGoal = next.y - goal.y;
      goalHit = Math.hypot(dxGoal, dyGoal) <= (goal.radius ?? 24) + next.width * 0.35;
      if (goalHit) {
        next.events.push({ type: "goal" });
      }
    }

    return {
      player: next,
      events: next.events,
      sample: {
        x: next.x,
        y: next.y,
        vx: next.vx,
        vy: next.vy,
        facing: next.facing,
        grounded: next.grounded,
        wallSide: next.wallSide,
        alive: next.alive,
      },
      outcome: !next.alive ? "lose" : goalHit ? "win" : null,
      cause: next.events.find((event) => event.type === "death")?.cause ?? null,
    };
  }

  buildSolids(level) {
    const size = level?.tileSize ?? 48;
    return (level?.solids ?? []).map((cell) => ({
      left: cell.x * size,
      top: cell.y * size,
      right: (cell.x + 1) * size,
      bottom: (cell.y + 1) * size,
    }));
  }

  buildHazards(level) {
    const size = level?.tileSize ?? 48;
    return (level?.hazards ?? []).map((cell) => ({
      left: cell.x * size,
      top: cell.y * size,
      right: (cell.x + 1) * size,
      bottom: (cell.y + 1) * size,
    }));
  }

  resolveMove(player, solids, dx, dy, cfg) {
    let x = player.x;
    let y = player.y;
    let vx = player.vx;
    let vy = player.vy;
    let grounded = false;
    let wallSide = 0;
    const halfW = player.width * 0.5;
    const halfH = player.height * 0.5;

    const moveAxis = (axis, delta) => {
      if (delta === 0) return;
      if (axis === "x") {
        let nx = x + delta;
        for (const solid of solids) {
          const box = { left: nx - halfW, right: nx + halfW, top: y - halfH, bottom: y + halfH };
          if (!rectsOverlap(box, solid)) continue;
          nx = delta > 0 ? solid.left - halfW : solid.right + halfW;
          vx = 0;
          wallSide = delta > 0 ? 1 : -1;
        }
        x = nx;
        return;
      }

      let ny = y + delta;
      for (const solid of solids) {
        const box = { left: x - halfW, right: x + halfW, top: ny - halfH, bottom: ny + halfH };
        if (!rectsOverlap(box, solid)) continue;
        ny = delta > 0 ? solid.top - halfH : solid.bottom + halfH;
        vy = 0;
        if (delta > 0) grounded = true;
      }
      y = ny;
    };

    moveAxis("x", dx);
    if (!grounded && dy > 0 && Math.abs(dx) > 0.01) {
      const kick = this.cornerKickProbe(x, y, dx, solids, cfg);
      if (kick !== 0) {
        x += kick;
      }
    }
    moveAxis("y", dy);

    if (!grounded && dy > 0) {
      const feet = {
        left: x - halfW + cfg.cornerKick,
        right: x + halfW - cfg.cornerKick,
        top: y + halfH - 2,
        bottom: y + halfH + 2,
      };
      for (const solid of solids) {
        if (!rectsOverlap(feet, solid)) continue;
        y = solid.top - halfH;
        vy = 0;
        grounded = true;
      }
    }

    if (!wallSide) {
      wallSide = this.findWallSide({ x, y, width: player.width, height: player.height }, solids, cfg.wallProbe);
    }

    return { x, y, vx, vy, grounded, wallSide, onWall: wallSide };
  }

  cornerKickProbe(x, y, dx, solids, cfg) {
    const halfW = cfg.playerWidth * 0.5;
    const halfH = cfg.playerHeight * 0.5;
    const offsets = [
      { x: dx > 0 ? cfg.cornerKick : -cfg.cornerKick, y: 0 },
      { x: dx > 0 ? cfg.cornerKick : -cfg.cornerKick, y: -cfg.ledgePop },
    ];
    for (const offset of offsets) {
      const box = {
        left: x + offset.x - halfW,
        right: x + offset.x + halfW,
        top: y + offset.y - halfH,
        bottom: y + offset.y + halfH,
      };
      if (solids.some((solid) => rectsOverlap(box, solid))) continue;
      return offset.x;
    }
    return 0;
  }

  findWallSide(player, solids, probe = 2) {
    const halfW = (player.width ?? this.config.playerWidth) * 0.5;
    const halfH = (player.height ?? this.config.playerHeight) * 0.5;
    const top = player.y - halfH + 4;
    const bottom = player.y + halfH - 4;
    const leftProbe = {
      left: player.x - halfW - probe,
      right: player.x - halfW,
      top,
      bottom,
    };
    const rightProbe = {
      left: player.x + halfW,
      right: player.x + halfW + probe,
      top,
      bottom,
    };
    if (solids.some((solid) => rectsOverlap(leftProbe, solid))) {
      return -1;
    }
    if (solids.some((solid) => rectsOverlap(rightProbe, solid))) {
      return 1;
    }
    return 0;
  }

  touchHazard(player, hazards) {
    const halfW = player.width * 0.5;
    const halfH = player.height * 0.5;
    const box = { left: player.x - halfW, right: player.x + halfW, top: player.y - halfH, bottom: player.y + halfH };
    return hazards.some((hazard) => rectsOverlap(box, hazard));
  }
}
