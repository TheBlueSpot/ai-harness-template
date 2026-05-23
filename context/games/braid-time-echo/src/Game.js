(() => {
  const LEVEL = window.BraidTimeEchoData;
  const {
    GRAVITY,
    MAX_ECHOES,
    MAX_HISTORY,
    REWIND_RATE,
    VIEW_WIDTH,
    WORLD_HEIGHT,
    WORLD_WIDTH
  } = LEVEL;

  const PLAYER_WIDTH = 22;
  const PLAYER_HEIGHT = 34;
  const MOVE_SPEED = 273;
  const AIR_CONTROL = 0.72;
  const JUMP_SPEED = 650;
  const EFFECTIVE_GRAVITY = GRAVITY * 0.9;
  const COYOTE_TIME = 0.09;
  const JUMP_BUFFER = 0.12;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function makePlayer(x, y) {
    return {
      x,
      y,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      rewinding: false,
      coyoteTimer: 0,
      jumpBuffer: 0
    };
  }

  class Game {
    constructor() {
      this.restart();
    }

    restart() {
      this.mode = "menu";
      this.time = 0;
      this.player = makePlayer(LEVEL.start.x, LEVEL.start.y);
      this.history = [this.makeSnapshot(this.player)];
      this.echoes = [];
      this.nextEchoId = 1;
      this.rewindCursor = 0;
      this.rewindAnchor = 0;
      this.rewinding = false;
      this.collected = new Set();
      this.statusText = "Press Enter. Doors open when a replay stands on its switch.";
      this.switches = LEVEL.switches.map((plate) => ({ ...plate, active: false }));
      this.doors = LEVEL.doors.map((door) => ({ ...door, open: false }));
      this.cameraX = 0;
    }

    start() {
      if (this.mode === "menu") {
        this.mode = "playing";
        this.statusText = "Collect every shard, then let echoes hold the last switch for you.";
      } else if (this.mode === "win" || this.mode === "lose") {
        this.restart();
        this.mode = "playing";
        this.statusText = "Collect every shard, then let echoes hold the last switch for you.";
      }
    }

    update(dt, input) {
      const step = clamp(dt, 1 / 120, 1 / 24);
      this.time += step * 1000;

      if ((this.mode === "menu" || this.mode === "win" || this.mode === "lose") && input.startPressed) {
        this.start();
      }
      if (input.restartPressed) {
        this.restart();
        this.start();
      }
      if (this.mode !== "playing") {
        this.updateCamera();
        return;
      }

      if (input.rewindHeld && this.history.length > 2) {
        if (!this.rewinding) {
          this.rewinding = true;
          this.rewindAnchor = this.history.length - 1;
          this.rewindCursor = this.rewindAnchor;
          this.player.rewinding = true;
        }
        this.stepRewind(step);
      } else {
        if (this.rewinding) {
          this.releaseRewind();
        }
        this.stepEchoes(step);
        this.stepPlayer(step, input);
        this.resolveSwitches();
        this.resolveShards();
        this.resolveExit();
        this.checkFailures();
        this.recordSnapshot();
      }

      this.updateCamera();
    }

    makeSnapshot(actor) {
      return {
        x: actor.x,
        y: actor.y,
        vx: actor.vx,
        vy: actor.vy,
        facing: actor.facing
      };
    }

    applySnapshot(snapshot) {
      this.player.x = snapshot.x;
      this.player.y = snapshot.y;
      this.player.vx = snapshot.vx;
      this.player.vy = snapshot.vy;
      this.player.facing = snapshot.facing;
      this.player.onGround = false;
    }

    stepRewind(step) {
      const frames = Math.max(1, Math.round(step * 60 * REWIND_RATE));
      this.rewindCursor = Math.max(0, this.rewindCursor - frames);
      this.applySnapshot(this.history[this.rewindCursor]);
      this.resolveSwitches();
      this.statusText = "Rewinding. Release R to leave an echo on your old path.";
    }

    releaseRewind() {
      const travelled = this.rewindAnchor - this.rewindCursor;
      if (travelled > 8) {
        const frames = this.history
          .slice(this.rewindCursor, this.rewindAnchor + 1)
          .map((snapshot) => ({ ...snapshot, w: PLAYER_WIDTH, h: PLAYER_HEIGHT }));
        this.echoes.push({
          id: this.nextEchoId,
          index: 0,
          frames,
          x: frames[0].x,
          y: frames[0].y,
          w: PLAYER_WIDTH,
          h: PLAYER_HEIGHT,
          tint: ["#7cf2ff", "#f3a8ff", "#a9ff92"][(this.nextEchoId - 1) % 3]
        });
        this.nextEchoId += 1;
        while (this.echoes.length > MAX_ECHOES) {
          this.echoes.shift();
        }
      }
      this.history = this.history.slice(0, this.rewindCursor + 1);
      this.player.rewinding = false;
      this.rewinding = false;
      this.resolveSwitches();
      this.statusText = this.echoes.length > 0
        ? "Echo released. Route ahead while it repeats your old move."
        : "Rewind shorter for a quick correction or longer to plant an echo.";
    }

    stepEchoes(step) {
      const frameAdvance = Math.max(1, Math.round(step * 60));
      const survivors = [];
      for (const echo of this.echoes) {
        echo.index += frameAdvance;
        if (echo.index >= echo.frames.length) {
          continue;
        }
        const frame = echo.frames[echo.index];
        echo.x = frame.x;
        echo.y = frame.y;
        survivors.push(echo);
      }
      this.echoes = survivors;
    }

    stepPlayer(step, input) {
      const moveAxis = (input.leftHeld ? -1 : 0) + (input.rightHeld ? 1 : 0);
      const groundedFactor = this.player.onGround ? 1 : AIR_CONTROL;
      this.player.vx = moveAxis * MOVE_SPEED * groundedFactor;
      if (moveAxis !== 0) {
        this.player.facing = moveAxis;
      }
      if (input.jumpPressed) {
        this.player.jumpBuffer = JUMP_BUFFER;
      } else {
        this.player.jumpBuffer = Math.max(0, this.player.jumpBuffer - step);
      }
      if (this.player.jumpBuffer > 0 && this.player.coyoteTimer > 0) {
        this.player.vy = -JUMP_SPEED;
        this.player.onGround = false;
        this.player.coyoteTimer = 0;
        this.player.jumpBuffer = 0;
      }

      this.player.vy += EFFECTIVE_GRAVITY * step;
      this.moveActor(this.player, step);
    }

    moveActor(actor, step) {
      actor.x += actor.vx * step;
      this.resolveSolids(actor, "x");
      actor.y += actor.vy * step;
      const groundedAtStart = actor.onGround;
      actor.onGround = false;
      this.resolveSolids(actor, "y");
      if (actor.onGround) {
        actor.coyoteTimer = COYOTE_TIME;
      } else if (groundedAtStart) {
        actor.coyoteTimer = Math.max(actor.coyoteTimer, COYOTE_TIME);
      } else {
        actor.coyoteTimer = Math.max(0, actor.coyoteTimer - step);
      }
      actor.x = clamp(actor.x, 0, WORLD_WIDTH - actor.w);
    }

    resolveSolids(actor, axis) {
      const solids = [...LEVEL.platforms];
      for (const door of this.doors) {
        if (!door.open) {
          solids.push(door);
        }
      }

      for (const solid of solids) {
        if (!rectsOverlap(actor, solid)) {
          continue;
        }
        if (axis === "x") {
          if (actor.vx > 0) {
            actor.x = solid.x - actor.w;
          } else if (actor.vx < 0) {
            actor.x = solid.x + solid.w;
          }
          actor.vx = 0;
        } else {
          if (actor.vy > 0) {
            actor.y = solid.y - actor.h;
            actor.vy = 0;
            actor.onGround = true;
          } else if (actor.vy < 0) {
            actor.y = solid.y + solid.h;
            actor.vy = 0;
          }
        }
      }
    }

    resolveSwitches() {
      for (const plate of this.switches) {
        plate.active = false;
        const zone = { x: plate.x, y: plate.y - 8, w: plate.w, h: 22 };
        if (rectsOverlap(this.player, zone)) {
          plate.active = true;
        } else {
          for (const echo of this.echoes) {
            if (rectsOverlap(echo, zone)) {
              plate.active = true;
              break;
            }
          }
        }
      }

      for (const door of this.doors) {
        const plate = this.switches.find((entry) => entry.id === door.switchId);
        door.open = Boolean(plate?.active);
      }
    }

    resolveShards() {
      for (const shard of LEVEL.shards) {
        if (this.collected.has(shard.id)) {
          continue;
        }
        const hitbox = { x: shard.x - shard.r, y: shard.y - shard.r, w: shard.r * 2, h: shard.r * 2 };
        if (rectsOverlap(this.player, hitbox)) {
          this.collected.add(shard.id);
          this.statusText = `${this.collected.size}/3 memory shards recovered.`;
        }
      }
    }

    resolveExit() {
      const exitReady = this.collected.size === LEVEL.shards.length;
      if (!exitReady) {
        return;
      }
      if (rectsOverlap(this.player, LEVEL.exit)) {
        this.mode = "win";
        this.statusText = "Loop closed. Echoes stable. Press Enter to run it again.";
      }
    }

    checkFailures() {
      if (this.player.y > WORLD_HEIGHT + 80) {
        this.mode = "lose";
        this.statusText = "Time fractured. Press Enter to retry.";
        return;
      }
      for (const spike of LEVEL.spikes) {
        if (rectsOverlap(this.player, spike)) {
          this.mode = "lose";
          this.statusText = "Time fractured. Press Enter to retry.";
          return;
        }
      }
    }

    recordSnapshot() {
      this.history.push(this.makeSnapshot(this.player));
      if (this.history.length > MAX_HISTORY) {
        this.history.shift();
      }
    }

    updateCamera() {
      const target = this.player.x - (VIEW_WIDTH * 0.33);
      this.cameraX = clamp(target, 0, WORLD_WIDTH - VIEW_WIDTH);
    }

    getFrameState() {
      return {
        mode: this.mode,
        time: this.time,
        cameraX: this.cameraX,
        player: { ...this.player },
        echoes: this.echoes.map((echo) => ({
          x: echo.x,
          y: echo.y,
          w: echo.w,
          h: echo.h,
          tint: echo.tint
        })),
        switches: this.switches.map((plate) => ({ ...plate })),
        doors: this.doors.map((door) => ({ ...door })),
        shards: LEVEL.shards.map((shard) => ({ ...shard, collected: this.collected.has(shard.id) })),
        collectedCount: this.collected.size,
        rewindRatio: this.history.length / MAX_HISTORY,
        rewindSeconds: (this.history.length / 60).toFixed(1),
        rewinding: this.rewinding,
        exitReady: this.collected.size === LEVEL.shards.length,
        statusText: this.statusText
      };
    }
  }

  window.BraidTimeEchoGame = { Game };
})();
