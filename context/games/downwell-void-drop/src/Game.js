import {
  MAX_AMMO,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  REQUIRED_RELAYS,
  SHAFT_WIDTH,
  START_HEALTH,
  VIEW_HEIGHT,
  WORLD_DEPTH,
  clamp,
  getBiome,
  lerp,
} from "./data.js";
import { buildWorld } from "./world.js";

function overlapsHorizontally(entity, platform) {
  return entity.x + entity.width * 0.5 > platform.x && entity.x - entity.width * 0.5 < platform.x + platform.width;
}

function circleRectHit(circle, rect) {
  const closestX = clamp(circle.x, rect.x - rect.width * 0.5, rect.x + rect.width * 0.5);
  const closestY = clamp(circle.y, rect.y - rect.height * 0.5, rect.y + rect.height * 0.5);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function rectRectHit(a, b) {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height
  );
}

export class Game {
  constructor() {
    this.restart();
  }

  restart() {
    this.world = buildWorld();
    this.mode = "menu";
    this.moveDirection = 0;
    this.fireHeld = false;
    this.jumpQueued = 0;
    this.time = 0;
    this.message = "";
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.depth = 0;
    this.cameraY = 0;
    this.bullets = [];
    this.enemyShots = [];
    this.particles = [];
    this.relaysActivated = 0;
    this.goalReady = false;
    this.player = {
      x: SHAFT_WIDTH * 0.5,
      y: 70,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      onGround: false,
      coyote: 0,
      invuln: 0,
      health: START_HEALTH,
      ammo: MAX_AMMO,
      facing: 1,
      fireCooldown: 0,
    };
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
      this.message = "Touch down to refill ammo. Wake all 3 relays.";
    }
  }

  setMoveDirection(value) {
    this.moveDirection = Math.sign(value);
  }

  queueJump() {
    this.jumpQueued = 0.18;
  }

  setFire(value) {
    this.fireHeld = value;
  }

  update(dt) {
    this.time += dt;
    this.jumpQueued = Math.max(0, this.jumpQueued - dt);

    if (this.mode !== "playing") {
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) {
      this.combo = 0;
    }

    const player = this.player;
    player.invuln = Math.max(0, player.invuln - dt);
    player.coyote = Math.max(0, player.coyote - dt);

    const wasOnGround = player.onGround;
    player.onGround = false;

    const accel = wasOnGround ? 1700 : 1100;
    player.vx += this.moveDirection * accel * dt;
    player.vx *= wasOnGround ? 0.82 : 0.97;
    player.vx = clamp(player.vx, -190, 190);

    if (this.moveDirection !== 0) {
      player.facing = this.moveDirection;
    }

    if (this.jumpQueued > 0 && (wasOnGround || player.coyote > 0)) {
      player.vy = -350;
      player.onGround = false;
      player.coyote = 0;
      this.jumpQueued = 0;
      this.message = "Use gunboots in midair.";
      this.spawnBurst(player.x, player.y + 16, "#b8f6ff", 10, 120, 210, 0.2);
    }

    player.vy += 880 * dt;
    player.vy = clamp(player.vy, -420, 530);

    const previousBottom = player.y + player.height * 0.5;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 24, SHAFT_WIDTH - 24);

    for (const platform of this.world.platforms) {
      if (!platform.active) {
        continue;
      }

      if (platform.type === "crumbly" && platform.fallTimer > 0) {
        platform.fallTimer -= dt;
        if (platform.fallTimer <= 0) {
          platform.active = false;
          this.spawnBurst(platform.x + platform.width * 0.5, platform.y, "#fca5a5", 12, 80, 210, 0.5);
        }
      }

      if (player.vy < 0) {
        continue;
      }

      if (!overlapsHorizontally(player, platform)) {
        continue;
      }

      const currentBottom = player.y + player.height * 0.5;
      if (previousBottom <= platform.y && currentBottom >= platform.y) {
        player.y = platform.y - player.height * 0.5;
        player.vy = 0;
        player.onGround = true;
        player.coyote = 0.12;

        if (!wasOnGround) {
          player.ammo = MAX_AMMO;
          this.message = platform.type === "spike" ? "Need a cleaner landing." : "Ammo refilled.";
          this.spawnBurst(player.x, platform.y, "#ffffff", 8, 40, 120, 0.18);
        }

        if (platform.type === "spike") {
          this.damagePlayer(1, "Spike ledge");
          player.vy = -180;
          player.onGround = false;
        } else if (platform.type === "crumbly" && platform.fallTimer <= 0) {
          platform.fallTimer = 0.42;
        }
      }
    }

    if (!player.onGround && wasOnGround) {
      player.coyote = 0.12;
    }

    this.depth = Math.max(this.depth, Math.floor(Math.max(0, player.y - 70)));
    this.updateBullets(dt);
    this.updateDrones(dt);
    this.updateSentries(dt);
    this.updateEnemyShots(dt);
    this.collectGems();
    this.collectHealthPacks();
    this.collectRelays();
    this.updateParticles(dt);
    this.updateCamera(dt);

    if (this.relaysActivated >= REQUIRED_RELAYS) {
      this.goalReady = true;
    }

    const goal = this.world.goal;
    const playerTop = player.y - player.height * 0.5;
    const playerBottom = player.y + player.height * 0.5;
    const insideGoalX = Math.abs(player.x - goal.x) <= goal.width * 0.5;
    const insideGoalY = playerBottom >= goal.y - goal.height * 0.5 && playerTop <= goal.y + goal.height * 0.5;
    if (insideGoalX && insideGoalY) {
      if (this.goalReady) {
        this.mode = "win";
        this.message = "Extraction locked in.";
      } else {
        this.message = `Gate locked. ${REQUIRED_RELAYS - this.relaysActivated} relays still dark.`;
      }
    }

    if (player.y > WORLD_DEPTH + 360) {
      this.mode = "lose";
      this.message = this.goalReady ? "You slipped past the gate." : "You missed the relay chain.";
    }
  }

  updateBullets(dt) {
    const player = this.player;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);

    if (this.mode === "playing" && this.fireHeld && !player.onGround && player.ammo > 0 && player.fireCooldown === 0) {
      player.ammo -= 1;
      player.vy -= 74;
      this.bullets.push({ x: player.x, y: player.y + 18, radius: 5, vy: 620 });
      this.spawnBurst(player.x, player.y + 18, "#7dd3fc", 6, 60, 150, 0.24);
      player.fireCooldown = 0.085;
    }

    const nextBullets = [];
    for (const bullet of this.bullets) {
      bullet.y += bullet.vy * dt;
      let spent = bullet.y > this.cameraY + VIEW_HEIGHT + 120;

      for (const drone of this.world.drones) {
        if (spent || drone.dead) {
          continue;
        }

        const dx = bullet.x - drone.x;
        const dy = bullet.y - drone.y;
        if (dx * dx + dy * dy <= (bullet.radius + drone.radius) * (bullet.radius + drone.radius)) {
          drone.hp -= 1;
          spent = true;
          this.spawnBurst(drone.x, drone.y, "#a5f3fc", 8, 50, 200, 0.28);
          if (drone.hp <= 0) {
            drone.dead = true;
            this.score += 120 + this.combo * 20;
            this.combo += 1;
            this.comboTimer = 2.2;
            this.message = this.combo > 1 ? `Streak x${this.combo}` : "Drone cleared.";
          }
        }
      }

      for (const sentry of this.world.sentries) {
        if (spent || sentry.dead) {
          continue;
        }

        const hit = rectRectHit(
          { x: bullet.x, y: bullet.y, width: bullet.radius * 2, height: bullet.radius * 2 },
          sentry,
        );
        if (hit) {
          sentry.hp -= 1;
          spent = true;
          this.spawnBurst(sentry.x, sentry.y, "#fca5a5", 7, 45, 160, 0.24);
          if (sentry.hp <= 0) {
            sentry.dead = true;
            this.score += 160 + this.combo * 24;
            this.combo += 1;
            this.comboTimer = 2.4;
            this.message = "Wall gun cracked.";
          }
        }
      }

      if (!spent) {
        nextBullets.push(bullet);
      }
    }

    this.bullets = nextBullets;
  }

  updateDrones(dt) {
    const playerRect = {
      x: this.player.x,
      y: this.player.y,
      width: this.player.width,
      height: this.player.height,
    };

    for (const drone of this.world.drones) {
      if (drone.dead) {
        continue;
      }

      if (drone.state === "idle") {
        drone.phase += dt * 2.2;
        drone.x = drone.anchorX + Math.sin(drone.phase) * drone.range;
        drone.cooldown -= dt;

        if (drone.cooldown <= 0 && Math.abs(this.player.y - drone.y) < 115) {
          drone.state = "telegraph";
          drone.telegraph = 0.68;
          drone.dashDir = this.player.x < drone.x ? -1 : 1;
          this.message = "Drone dash line up.";
        }
      } else if (drone.state === "telegraph") {
        drone.telegraph -= dt;
        if (drone.telegraph <= 0) {
          drone.state = "dash";
        }
      } else if (drone.state === "dash") {
        drone.x += drone.dashDir * 320 * dt;
        if (drone.x < 26 || drone.x > SHAFT_WIDTH - 26) {
          drone.x = clamp(drone.x, 26, SHAFT_WIDTH - 26);
          drone.state = "recover";
          drone.cooldown = 1.3;
          drone.dashDir *= -1;
        }
      } else if (drone.state === "recover") {
        drone.cooldown -= dt;
        drone.x = lerp(drone.x, drone.anchorX, 4 * dt);
        if (drone.cooldown <= 0) {
          drone.state = "idle";
          drone.phase += dt;
        }
      }

      const circle = { x: drone.x, y: drone.y, radius: drone.radius };
      if (circleRectHit(circle, playerRect)) {
        const stomp = this.player.vy > 180 && this.player.y < drone.y;
        if (stomp) {
          drone.dead = true;
          this.player.vy = -300;
          this.score += 150 + this.combo * 25;
          this.combo += 1;
          this.comboTimer = 2.2;
          this.message = "Stomp break.";
          this.spawnBurst(drone.x, drone.y, "#fde68a", 10, 80, 220, 0.24);
        } else {
          this.damagePlayer(1, "Drone impact");
          this.player.vx += drone.dashDir * 90;
        }
      }
    }
  }

  updateSentries(dt) {
    for (const sentry of this.world.sentries) {
      if (sentry.dead) {
        continue;
      }

      sentry.cooldown -= dt;
      const verticalClose = Math.abs(this.player.y - sentry.y) < 150;
      if (sentry.state === "idle" && sentry.cooldown <= 0 && verticalClose) {
        sentry.state = "telegraph";
        sentry.telegraph = 0.55;
        this.message = "Wall gun charging.";
      } else if (sentry.state === "telegraph") {
        sentry.telegraph -= dt;
        if (sentry.telegraph <= 0) {
          const dir = sentry.side === "left" ? 1 : -1;
          this.enemyShots.push({
            x: sentry.x + dir * 10,
            y: sentry.y,
            vx: dir * 340,
            radius: 7,
            life: 1.7,
          });
          sentry.state = "idle";
          sentry.cooldown = 1.4;
          this.spawnBurst(sentry.x, sentry.y, "#fb7185", 6, 50, 130, 0.18);
        }
      }

      if (rectRectHit(this.player, sentry)) {
        this.damagePlayer(1, "Wall gun ram");
        this.player.vx = sentry.side === "left" ? 120 : -120;
      }
    }
  }

  updateEnemyShots(dt) {
    const nextShots = [];
    for (const shot of this.enemyShots) {
      shot.life -= dt;
      if (shot.life <= 0) {
        continue;
      }

      shot.x += shot.vx * dt;
      if (shot.x < -20 || shot.x > SHAFT_WIDTH + 20) {
        continue;
      }

      const hitPlayer = circleRectHit(shot, this.player);
      if (hitPlayer) {
        this.damagePlayer(1, "Shock shot");
        this.player.vx += shot.vx > 0 ? 70 : -70;
        continue;
      }

      nextShots.push(shot);
    }
    this.enemyShots = nextShots;
  }

  collectGems() {
    for (const gem of this.world.gems) {
      if (gem.collected) {
        continue;
      }

      const dx = this.player.x - gem.x;
      const dy = this.player.y - gem.y;
      if (dx * dx + dy * dy <= 24 * 24) {
        gem.collected = true;
        this.score += 25 + this.combo * 5;
        this.spawnBurst(gem.x, gem.y, "#86efac", 7, 30, 120, 0.2);
      }
    }
  }

  collectHealthPacks() {
    for (const pack of this.world.healthPacks) {
      if (pack.collected) {
        continue;
      }

      const dx = this.player.x - pack.x;
      const dy = this.player.y - pack.y;
      if (dx * dx + dy * dy <= 26 * 26) {
        pack.collected = true;
        const healAmount = Math.min(pack.heal ?? 1, START_HEALTH - this.player.health);
        this.player.health = Math.min(START_HEALTH, this.player.health + (pack.heal ?? 1));
        this.score += healAmount > 0 ? 40 : 10;
        this.message = healAmount > 0 ? `Patch kit +${healAmount} hull.` : "Patch kit banked.";
        this.spawnBurst(pack.x, pack.y, "#fca5a5", 10, 35, 135, 0.24);
      }
    }
  }

  collectRelays() {
    for (const relay of this.world.relays) {
      if (relay.activated) {
        continue;
      }

      const dx = this.player.x - relay.x;
      const dy = this.player.y - relay.y;
      if (dx * dx + dy * dy <= 28 * 28) {
        relay.activated = true;
        this.relaysActivated += 1;
        this.score += 250;
        this.message =
          this.relaysActivated >= REQUIRED_RELAYS
            ? "All relays hot. Extraction gate unlocked."
            : `${relay.label} online. ${REQUIRED_RELAYS - this.relaysActivated} to go.`;
        this.spawnBurst(relay.x, relay.y, "#f9a8d4", 16, 70, 190, 0.34);
      }
    }
  }

  damagePlayer(amount, reason) {
    if (this.player.invuln > 0 || this.mode !== "playing") {
      return;
    }

    this.player.health -= amount;
    this.player.invuln = 1;
    this.player.vy = Math.min(this.player.vy, -120);
    this.combo = 0;
    this.comboTimer = 0;
    this.message = reason;
    this.spawnBurst(this.player.x, this.player.y, "#fca5a5", 12, 70, 220, 0.35);

    if (this.player.health <= 0) {
      this.mode = "lose";
      this.message = "Dive ended.";
    }
  }

  spawnBurst(x, y, color, count, minSpeed, maxSpeed, life) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.4;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life + Math.random() * 0.18,
        maxLife: life + Math.random() * 0.18,
        color,
      });
    }
  }

  updateParticles(dt) {
    const next = [];
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.life <= 0) {
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 120 * dt;
      next.push(particle);
    }
    this.particles = next;
  }

  updateCamera(dt) {
    const goalBottom = this.world.goal.y + this.world.goal.height * 0.5;
    const maxCameraY = Math.max(0, goalBottom + 60 - VIEW_HEIGHT);
    const targetLead = this.goalReady ? 0.48 : 0.38;
    const deepDive = this.player.y >= WORLD_DEPTH - 220;
    let target = clamp(this.player.y - VIEW_HEIGHT * (deepDive ? 0.5 : targetLead), 0, maxCameraY);

    if (deepDive) {
      target = Math.max(target, maxCameraY - 120);
    }

    if (this.player.y >= WORLD_DEPTH + 40) {
      target = maxCameraY;
    }

    this.cameraY = lerp(this.cameraY, target, Math.min(1, dt * (deepDive ? 7.8 : 4.4)));
  }

  getFrameState() {
    const biome = getBiome(this.depth);
    const overlay =
      this.mode === "menu"
        ? {
            eyebrow: "gunboots primed",
            title: "Downwell Void Drop",
            copy:
              "Run the longer shaft, wake all 3 relays on the way down, read drone dash lines and wall-gun telegraphs, then dive into the extraction gate once it powers open.",
            button: "Start Dive",
          }
        : this.mode === "win"
          ? {
              eyebrow: "extraction reached",
              title: "Dive Complete",
              copy: `Score ${this.score}. You stabilized ${this.relaysActivated} relays and cleared ${this.depth} meters alive.`,
              button: "Dive Again",
            }
          : this.mode === "lose"
            ? {
                eyebrow: "signal lost",
                title: "Run Over",
                copy: `Depth ${this.depth} meters. Refill on touch-downs, route through relays, and do not let the bottom gate outrun the camera.`,
                button: "Retry Dive",
              }
            : null;

    return {
      mode: this.mode,
      score: this.score,
      ammo: this.player.ammo,
      health: this.player.health,
      depth: this.depth,
      combo: this.combo,
      zone: biome.name,
      message: this.message,
      cameraY: this.cameraY,
      player: this.player,
      bullets: this.bullets,
      enemyShots: this.enemyShots,
      particles: this.particles,
      platforms: this.world.platforms,
      drones: this.world.drones,
      sentries: this.world.sentries,
      gems: this.world.gems,
      healthPacks: this.world.healthPacks,
      relays: this.world.relays,
      relaysActivated: this.relaysActivated,
      requiredRelays: REQUIRED_RELAYS,
      goalReady: this.goalReady,
      goal: this.world.goal,
      biome,
      overlay,
    };
  }
}
