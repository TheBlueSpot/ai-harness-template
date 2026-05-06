import {
  LEVEL_BOUNDS,
  MAX_LIVES,
  BANANA_TARGET,
  PLAYER_RADIUS,
  createBarrelLaunchPads,
  createBananaPlacements,
  createLadders,
  createLevelPlatforms,
  createZingerOrbits,
} from "./level.js";

const MOVE_SPEED = 240;
const CLIMB_SPEED = 200;
const JUMP_SPEED = -460;
const GRAVITY = 1400;
const BARREL_SPEED = 210;
const BARREL_SPAWN_INTERVAL = 1.7;
const PLAYER_HALF_WIDTH = 16;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function describeDirection(fromX, toX) {
  const delta = toX - fromX;
  if (Math.abs(delta) < 80) return "straight up";
  return delta > 0 ? "up-right" : "up-left";
}

function getPlatformSurfaceY(platform, x) {
  const centerX = platform.x + platform.width / 2;
  const offset = x - centerX;
  return platform.y + platform.height / 2 + offset * platform.angle;
}

function isWithinPlatform(platform, x) {
  return x >= platform.x - PLAYER_HALF_WIDTH && x <= platform.x + platform.width + PLAYER_HALF_WIDTH;
}

function isOverlappingLadder(player, ladder) {
  return (
    Math.abs(player.x - ladder.x) <= ladder.width * 0.5 &&
    player.y + PLAYER_RADIUS >= ladder.yTop &&
    player.y - PLAYER_RADIUS <= ladder.yBottom
  );
}

function createPlayer() {
  return {
    x: 150,
    y: LEVEL_BOUNDS.height - 110,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    climbing: false,
    currentPlatform: null,
    launchGlow: 0,
  };
}

export class Game {
  constructor() {
    this.restart();
  }

  start() {
    if (this.state === "ready") {
      this.state = "playing";
      this.message = "Climb the ladders and time the blast barrels.";
    }
  }

  restart() {
    this.state = "ready";
    this.score = 0;
    this.lives = MAX_LIVES;
    this.stage = 1;
    this.elapsed = 0;
    this.progress = 0;
    this.message = "Press Enter or click Start Game.";
    this.player = createPlayer();
    this.platforms = createLevelPlatforms();
    this.ladders = createLadders();
    this.launchPads = createBarrelLaunchPads();
    this.zingers = createZingerOrbits();
    this.bananas = createBananaPlacements();
    this.landingZones = [{ x: 920, y: 118, width: 160, height: 46, label: "BANANA GOAL" }];
    this.barrels = [];
    this.spawnTimer = 0;
    this.stormGlow = false;
    this.winAwarded = false;
    this.respawnPlayer(false);
  }

  respawnPlayer(preserveLives) {
    if (!preserveLives) {
      this.player = createPlayer();
    } else {
      this.player.x = 150;
      this.player.y = LEVEL_BOUNDS.height - 110;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.facing = 1;
      this.player.climbing = false;
      this.player.launchGlow = 0;
    }
    this.player.currentPlatform = null;
    this.player.onGround = false;
    this.resolveGrounding(this.player, null);
  }

  loseLife(reason) {
    if (this.state !== "playing") return;
    this.lives -= 1;
    this.score = Math.max(0, this.score - 100);
    if (this.lives <= 0) {
      this.state = "lose";
      this.message = "Run lost. Press Enter or click Restart.";
      return;
    }
    this.message = reason;
    this.respawnPlayer(true);
  }

  spawnBarrel() {
    const topPlatform = this.platforms[this.platforms.length - 1];
    const direction = this.barrels.length % 2 === 0 ? 1 : -1;
    const startX = direction > 0 ? topPlatform.x + 48 : topPlatform.x + topPlatform.width - 48;
    this.barrels.push({
      x: startX,
      y: getPlatformSurfaceY(topPlatform, startX) - 18,
      vx: direction * BARREL_SPEED,
      vy: 0,
      radius: 18,
      spin: 0,
      platformIndex: this.platforms.length - 1,
    });
  }

  findLadder(player) {
    return this.ladders.find((ladder) => isOverlappingLadder(player, ladder)) ?? null;
  }

  resolveGrounding(player, previousY) {
    player.onGround = false;
    player.currentPlatform = null;

    for (let index = 0; index < this.platforms.length; index += 1) {
      const platform = this.platforms[index];
      if (!isWithinPlatform(platform, player.x)) continue;
      const surfaceY = getPlatformSurfaceY(platform, player.x) - PLAYER_RADIUS;
      const fallingOntoPlatform = previousY === null || previousY <= surfaceY + 8;

      if (player.y >= surfaceY - 6 && player.y <= surfaceY + 16 && player.vy >= 0 && fallingOntoPlatform) {
        player.y = surfaceY;
        player.vy = 0;
        player.onGround = true;
        player.currentPlatform = index;
        return;
      }
    }
  }

  updatePlayer(input, dt) {
    const player = this.player;
    const previousY = player.y;
    const moveX = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const moveY = (input.up ? -1 : 0) + (input.down ? 1 : 0);
    const ladder = this.findLadder(player);

    player.launchGlow = Math.max(0, player.launchGlow - dt * 2.5);
    player.vx = moveX * MOVE_SPEED;
    if (moveX !== 0) player.facing = moveX;

    if (ladder && moveY !== 0) {
      player.climbing = true;
    } else if (!ladder && player.climbing) {
      player.climbing = false;
    }

    if (player.climbing && ladder) {
      player.x += (ladder.x - player.x) * Math.min(1, dt * 16);
      player.vy = moveY * CLIMB_SPEED;
      player.y += player.vy * dt;
      player.y = clamp(player.y, ladder.yTop + PLAYER_RADIUS - 4, ladder.yBottom - PLAYER_RADIUS + 4);
      player.onGround = false;
      if (input.jump) {
        player.climbing = false;
        player.vy = JUMP_SPEED * 0.9;
      }
      return;
    }

    if (input.jump && player.onGround) {
      player.vy = JUMP_SPEED;
      player.onGround = false;
    } else if (player.onGround) {
      player.vy = 0;
    } else {
      player.vy += GRAVITY * dt;
    }

    for (const pad of this.launchPads) {
      pad.cooldown = Math.max(0, (pad.cooldown ?? 0) - dt);
      if (
        pad.cooldown <= 0 &&
        distance(player, pad) < (pad.radius ?? 28) + PLAYER_RADIUS &&
        (input.jump || input.up) &&
        player.vy >= -80
      ) {
        player.vx = pad.vx;
        player.vy = pad.vy;
        player.facing = Math.sign(pad.vx) || player.facing;
        player.climbing = false;
        player.onGround = false;
        player.launchGlow = 1;
        pad.cooldown = 0.75;
        this.score += 75;
        this.message = "Blast barrel launch.";
        break;
      }
    }

    player.x = clamp(player.x + player.vx * dt, 42, LEVEL_BOUNDS.width - 42);
    player.y = clamp(player.y + player.vy * dt, 68, LEVEL_BOUNDS.height - PLAYER_RADIUS);

    this.resolveGrounding(player, previousY);

    if (player.y >= LEVEL_BOUNDS.height - PLAYER_RADIUS - 2) {
      this.loseLife("Fell off the climb. Resetting.");
    }
  }

  updateBarrels(dt) {
    for (const barrel of this.barrels) {
      barrel.spin += dt * 6 * Math.sign(barrel.vx);
      let platformIndex = barrel.platformIndex ?? 0;
      let platform = this.platforms[platformIndex];

      if (!platform) continue;

      barrel.x += barrel.vx * dt;
      const leftEdge = platform.x + 18;
      const rightEdge = platform.x + platform.width - 18;

      if (barrel.x < leftEdge || barrel.x > rightEdge) {
        const nextIndex = platformIndex - 1;
        if (nextIndex >= 0) {
          platformIndex = nextIndex;
          platform = this.platforms[platformIndex];
          barrel.platformIndex = platformIndex;
          barrel.x = clamp(barrel.x, platform.x + 18, platform.x + platform.width - 18);
          barrel.vx *= -1;
        } else {
          barrel.y = LEVEL_BOUNDS.height + 80;
        }
      }

      barrel.y = getPlatformSurfaceY(platform, barrel.x) - barrel.radius;
    }

    this.barrels = this.barrels.filter((barrel) => barrel.y < LEVEL_BOUNDS.height + 40);
  }

  updateHazards(dt) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= BARREL_SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      this.spawnBarrel();
    }

    this.updateBarrels(dt);

    for (const zinger of this.zingers) {
      zinger.phase += zinger.speed * dt;
      zinger.x = zinger.centerX + Math.cos(zinger.phase) * zinger.rx;
      zinger.y = zinger.centerY + Math.sin(zinger.phase) * zinger.ry;
    }
  }

  updateCollectibles() {
    for (const banana of this.bananas) {
      if (!banana.collected && distance(this.player, banana) < 34) {
        banana.collected = true;
        this.score += 250;
        this.message = "Golden banana collected.";
      }
    }
  }

  updateProgress() {
    const top = this.landingZones[0].y;
    const bottom = LEVEL_BOUNDS.height - 140;
    this.progress = clamp((bottom - this.player.y) / (bottom - top), 0, 1);
    this.stormGlow = this.elapsed % 3.6 < 0.22;
  }

  getObjectiveState() {
    const remainingBananas = this.bananas.filter((banana) => !banana.collected);
    if (remainingBananas.length > 0) {
      const nextBanana = remainingBananas.reduce((best, banana) => (banana.y > best.y ? banana : best));
      return {
        objective: `Next goal: grab the ${describeDirection(this.player.x, nextBanana.x)} banana.`,
        detail: "Use ladders for the safe route. Tap Up or jump inside a blast barrel when a shortcut line opens.",
        beacon: { x: nextBanana.x, y: nextBanana.y, label: "NEXT BANANA", kind: "banana" },
      };
    }

    const goal = this.landingZones[0];
    return {
      objective: `Next goal: finish at the ${describeDirection(this.player.x, goal.x + goal.width * 0.5)} goal zone.`,
      detail: "All bananas secured. Climb the last lane and land inside the gold finish box to cash out the run.",
      beacon: { x: goal.x + goal.width * 0.5, y: goal.y + goal.height * 0.5, label: goal.label ?? "GOAL", kind: "goal" },
    };
  }

  checkCollisions() {
    if (this.barrels.some((barrel) => distance(this.player, barrel) < barrel.radius + 18)) {
      this.loseLife("Barrel hit. Resetting the climb.");
      return;
    }
    if (this.zingers.some((zinger) => distance(this.player, zinger) < zinger.radius + 16)) {
      this.loseLife("Zinger shock. Resetting the climb.");
      return;
    }
  }

  checkWin() {
    const allBananasCollected = this.bananas.every((banana) => banana.collected);
    const goal = this.landingZones[0];
    const insideGoal =
      this.player.x >= goal.x &&
      this.player.x <= goal.x + goal.width &&
      this.player.y + PLAYER_RADIUS >= goal.y &&
      this.player.y - PLAYER_RADIUS <= goal.y + goal.height;

    if (!this.winAwarded && allBananasCollected && insideGoal) {
      this.state = "win";
      this.winAwarded = true;
      this.score += Math.max(0, 1800 - Math.floor(this.elapsed * 22));
      this.message = "Golden banana secured. Press Enter or click Restart.";
    }
  }

  update(input = {}, deltaTime = 0) {
    if (this.state === "ready") {
      if (input.start || input.restart) this.start();
      return;
    }

    if (this.state !== "playing") {
      if (input.start || input.restart) {
        this.restart();
        this.start();
      }
      return;
    }

    const dt = clamp(deltaTime, 0, 0.05);
    this.elapsed += dt;

    this.updatePlayer(input, dt);
    if (this.state !== "playing") return;

    this.updateHazards(dt);
    this.checkCollisions();
    if (this.state !== "playing") return;

    this.updateCollectibles();
    this.checkWin();
    this.updateProgress();
  }

  getFrameState() {
    const collectedBananas = this.bananas.filter((banana) => banana.collected).length;
    const activeBananas = this.bananas.filter((banana) => !banana.collected);
    const objectiveState =
      this.state === "playing"
        ? this.getObjectiveState()
        : {
            objective: "Next goal: collect every banana, then finish at the top-right goal zone.",
            detail: "Warm amber barrels roll the girders, blue rings mark zingers, and the bright gold box is the final landing zone.",
            beacon: null,
          };

    return {
      state: this.state,
      score: this.score,
      lives: this.lives,
      stage: this.stage,
      bananas: collectedBananas,
      bananaTarget: BANANA_TARGET,
      progress: this.progress,
      objective: objectiveState.objective,
      detail: objectiveState.detail,
      status: this.message,
      hint:
        this.state === "playing"
          ? `${objectiveState.objective} Climb ladders with Up or Down.`
          : "Press Enter or click Start Game.",
      targetBeacon: objectiveState.beacon,
      appState: {
        state: this.state,
        status: this.message,
      },
      hud: {
        score: this.score,
        lives: this.lives,
        stage: this.stage,
        bananas: collectedBananas,
        bananaTarget: BANANA_TARGET,
        progress: this.progress,
      },
      player: { ...this.player },
      hazards: {
        barrels: this.barrels.map((barrel) => ({ ...barrel })),
        zingers: this.zingers.map((zinger) => ({ ...zinger })),
        launchPads: this.launchPads.map((pad) => ({ ...pad })),
      },
      collectibles: {
        bananas: activeBananas.map((banana) => ({ ...banana })),
        collectedBananas,
        bananaTarget: BANANA_TARGET,
      },
      platforms: this.platforms.map((platform) => ({ ...platform })),
      ladders: this.ladders.map((ladder) => ({ ...ladder })),
      launchPads: this.launchPads.map((pad) => ({ ...pad })),
      landingZones: this.landingZones.map((zone) => ({ ...zone })),
      barrels: this.barrels.map((barrel) => ({ ...barrel })),
      zingers: this.zingers.map((zinger) => ({ ...zinger })),
      bananaItems: activeBananas.map((banana) => ({ ...banana })),
      actors: [{ ...this.player }],
      stormGlow: this.stormGlow,
    };
  }
}

export default Game;
