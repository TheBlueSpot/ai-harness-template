import { renderFrame } from "./render.js";
import { createWorldState, FLOOR_Y, ROOM_HEIGHT, ROOMS, ROOM_WIDTH, VIEW_HEIGHT, VIEW_WIDTH, ZOOMER_PATHS } from "./world.js";

const GRAVITY = 1850;
const MOVE_SPEED = 250;
const JUMP_SPEED = 700;
const HIGH_JUMP_SPEED = 870;
const MORPH_SPEED = 180;
const SHOT_SPEED = 580;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function createPlayer() {
  return {
    x: 120,
    y: FLOOR_Y - 88,
    width: 44,
    height: 88,
    vx: 0,
    vy: 0,
    facing: 1,
    form: "combat",
    hp: 99,
    onGround: false,
    invuln: 0,
    shotCooldown: 0,
  };
}

function createEnemy(roomId, blueprint) {
  if (blueprint.type === "zoomer") {
    const path = ZOOMER_PATHS[blueprint.path];
    const enemy = {
      kind: "zoomer",
      roomId,
      pathId: blueprint.path,
      path,
      progress: blueprint.startT ?? 0,
      speed: 0.18,
      hp: 3,
      x: path[0].x,
      y: path[0].y,
      width: 28,
      height: 28,
      damage: 14,
    };
    updateZoomer(enemy, 0);
    return enemy;
  }

  return {
    kind: "drone",
    roomId,
    x: blueprint.x,
    y: blueprint.y,
    originX: blueprint.x,
    originY: blueprint.y,
    width: 34,
    height: 34,
    vx: 0,
    hp: blueprint.hp ?? 4,
    damage: 12,
    shotCooldown: 1.1,
  };
}

function updateZoomer(enemy, dt) {
  enemy.progress = (enemy.progress + enemy.speed * dt) % 1;
  const path = enemy.path;
  const scaled = enemy.progress * path.length;
  const index = Math.floor(scaled);
  const next = (index + 1) % path.length;
  const t = scaled - index;
  const from = path[index];
  const to = path[next];
  enemy.x = from.x + (to.x - from.x) * t;
  enemy.y = from.y + (to.y - from.y) * t;
}

function buildRoomEnemies() {
  const map = {};
  for (const room of Object.values(ROOMS)) {
    map[room.id] = room.enemies.map((enemy) => createEnemy(room.id, enemy));
  }
  return map;
}

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.world = createWorldState();
    this.player = createPlayer();
    this.roomEnemies = buildRoomEnemies();
    this.projectiles = [];
    this.effects = [];
    this.toast = "Survey the quarantine sector.";
    this.toastTimer = 4;
    this.frame = this.buildFrameState();
  }

  start() {
    this.mode = "playing";
    this.toast = this.currentRoom().notes;
    this.toastTimer = 4;
    this.frame = this.buildFrameState();
  }

  restart() {
    this.reset();
    this.mode = "playing";
    this.toast = this.currentRoom().notes;
    this.toastTimer = 4;
    this.frame = this.buildFrameState();
  }

  currentRoom() {
    return ROOMS[this.world.roomId];
  }

  activeEnemies() {
    return this.roomEnemies[this.world.roomId];
  }

  update(dt, input) {
    const seconds = Math.max(0, Math.min(0.05, Number(dt) || 0));

    if (this.mode === "menu") {
      if (input.pressed.start) this.start();
      this.frame = this.buildFrameState();
      return;
    }

    if (this.mode === "win" || this.mode === "lose") {
      if (input.pressed.restart || input.pressed.start) this.restart();
      this.frame = this.buildFrameState();
      return;
    }

    this.toastTimer = Math.max(0, this.toastTimer - seconds);
    this.player.invuln = Math.max(0, this.player.invuln - seconds);
    this.player.shotCooldown = Math.max(0, this.player.shotCooldown - seconds);

    this.handleMorph(input);
    this.handleMovement(seconds, input);
    this.handleShots(input);
    this.updateProjectiles(seconds);
    this.updateEnemies(seconds);
    this.collectPickups();
    this.checkHazards(seconds);
    this.checkTransitions();
    this.cleanupEffects(seconds);

    if (this.player.hp <= 0) {
      this.mode = "lose";
      this.toast = "Suit integrity failed.";
      this.toastTimer = 99;
    }

    if (this.world.pickupsTaken.has("reactorCore") && this.world.roomId === "dock") {
      this.mode = "win";
      this.toast = "Extraction tunnel secure.";
      this.toastTimer = 99;
    }

    this.frame = this.buildFrameState();
  }

  handleMorph(input) {
    if (!input.pressed.morph || !this.world.acquired.has("morphBall")) return;
    if (this.player.form === "combat") {
      this.player.form = "morph";
      this.player.width = 34;
      this.player.height = 34;
      this.player.y = Math.min(this.player.y + 54, FLOOR_Y - this.player.height);
      this.world.objectiveLog = "Roll through narrow hatches";
    } else {
      const standingHeight = 88;
      const room = this.currentRoom();
      const testRect = {
        x: this.player.x,
        y: this.player.y - (standingHeight - this.player.height),
        width: 44,
        height: standingHeight,
      };
      const blocked = room.solids.concat(room.platforms).some((solid) => intersects(testRect, solid));
      if (!blocked) {
        this.player.form = "combat";
        this.player.width = 44;
        this.player.height = standingHeight;
        this.player.y -= standingHeight - 34;
      } else {
        this.toast = "Not enough clearance to stand.";
        this.toastTimer = 2.2;
      }
    }
  }

  handleMovement(dt, input) {
    const player = this.player;
    const room = this.currentRoom();
    const moveSpeed = player.form === "morph" ? MORPH_SPEED : MOVE_SPEED;
    player.vx = 0;
    if (input.down.left) {
      player.vx = -moveSpeed;
      player.facing = -1;
    } else if (input.down.right) {
      player.vx = moveSpeed;
      player.facing = 1;
    }

    if (input.pressed.jump && player.form === "combat" && player.onGround) {
      player.vy = -(this.world.acquired.has("highJump") ? HIGH_JUMP_SPEED : JUMP_SPEED);
      player.onGround = false;
    }

    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.x = clamp(player.x, 0, ROOM_WIDTH - player.width);
    player.y += player.vy * dt;

    player.onGround = false;
    const surfaces = room.platforms.concat(room.solids, [{ x: 0, y: FLOOR_Y, width: ROOM_WIDTH, height: ROOM_HEIGHT - FLOOR_Y }]);
    for (const surface of surfaces) {
      if (player.vy >= 0 && player.x + player.width > surface.x && player.x < surface.x + surface.width) {
        const previousBottom = player.y + player.height - player.vy * dt;
        if (previousBottom <= surface.y && player.y + player.height >= surface.y) {
          player.y = surface.y - player.height;
          player.vy = 0;
          player.onGround = true;
        }
      }
    }

    for (const solid of room.solids) {
      if (!intersects(player, solid)) continue;
      if (player.x + player.width / 2 < solid.x + solid.width / 2) {
        player.x = solid.x - player.width;
      } else {
        player.x = solid.x + solid.width;
      }
    }

    player.y = clamp(player.y, 0, FLOOR_Y - player.height);
  }

  handleShots(input) {
    if (!input.pressed.shoot || this.player.form === "morph" || this.player.shotCooldown > 0) return;
    this.player.shotCooldown = 0.28;
    this.projectiles.push({
      owner: "player",
      x: this.player.x + (this.player.facing > 0 ? this.player.width + 8 : -8),
      y: this.player.y + 38,
      vx: this.player.facing * SHOT_SPEED,
      vy: 0,
      radius: 6,
      damage: 1,
      roomId: this.world.roomId,
      life: 1.1,
    });
  }

  updateProjectiles(dt) {
    const enemies = this.activeEnemies();
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;

      if (projectile.owner === "player" && projectile.roomId === this.world.roomId) {
        for (const enemy of enemies) {
          if (enemy.hp <= 0) continue;
          const hitbox = { x: enemy.x - enemy.width / 2, y: enemy.y - enemy.height / 2, width: enemy.width, height: enemy.height };
          if (pointInRect(projectile.x, projectile.y, hitbox)) {
            enemy.hp -= projectile.damage;
            projectile.life = 0;
            this.effects.push({ x: projectile.x, y: projectile.y, radius: 10, life: 0.22, maxLife: 0.22, color: "#8af8e0" });
            if (enemy.hp <= 0) {
              this.toast = enemy.kind === "drone" ? "Drone neutralized." : "Zoomer scrubbed from the wall.";
              this.toastTimer = 1.2;
            }
            break;
          }
        }
      } else if (projectile.owner === "enemy" && projectile.roomId === this.world.roomId) {
        if (pointInRect(projectile.x, projectile.y, this.player)) {
          projectile.life = 0;
          this.damagePlayer(projectile.damage, projectile.x, projectile.y);
        }
      }
    }

    this.projectiles = this.projectiles.filter(
      (projectile) =>
        projectile.life > 0 &&
        projectile.x > -40 &&
        projectile.x < ROOM_WIDTH + 40 &&
        projectile.y > -40 &&
        projectile.y < VIEW_HEIGHT + 40,
    );
  }

  updateEnemies(dt) {
    const enemies = this.activeEnemies();
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      if (enemy.kind === "zoomer") {
        updateZoomer(enemy, dt);
        const zoomerRect = { x: enemy.x - 14, y: enemy.y - 14, width: 28, height: 28 };
        if (intersects(this.player, zoomerRect)) {
          this.damagePlayer(enemy.damage, enemy.x, enemy.y);
        }
      } else {
        enemy.shotCooldown -= dt;
        enemy.y = enemy.originY + Math.sin(performance.now() / 360 + enemy.originX * 0.01) * 16;
        const direction = Math.sign(this.player.x - enemy.x) || 1;
        enemy.x += direction * 28 * dt;
        enemy.x = clamp(enemy.x, 80, ROOM_WIDTH - 80);

        if (enemy.shotCooldown <= 0 && Math.abs(this.player.x - enemy.x) < 330) {
          enemy.shotCooldown = 1.4;
          this.projectiles.push({
            owner: "enemy",
            x: enemy.x,
            y: enemy.y,
            vx: direction * 260,
            vy: 0,
            radius: 6,
            damage: 10,
            roomId: this.world.roomId,
            life: 2,
          });
        }

        const droneRect = { x: enemy.x - 16, y: enemy.y - 16, width: 32, height: 32 };
        if (intersects(this.player, droneRect)) {
          this.damagePlayer(enemy.damage, enemy.x, enemy.y);
        }
      }
    }
  }

  damagePlayer(amount, x, y) {
    if (this.player.invuln > 0) return;
    this.player.hp -= amount;
    this.player.invuln = 1;
    this.player.vx = this.player.facing * -140;
    this.player.vy = -240;
    this.effects.push({ x, y, radius: 14, life: 0.3, maxLife: 0.3, color: "#ff9d78" });
    this.toast = "Suit integrity dropping.";
    this.toastTimer = 1.4;
  }

  collectPickups() {
    const room = this.currentRoom();
    for (const pickup of room.pickups) {
      if (this.world.pickupsTaken.has(pickup.id)) continue;
      const hitbox = { x: pickup.x - 20, y: pickup.y - 20, width: 40, height: 40 };
      if (!intersects(this.player, hitbox)) continue;
      this.world.pickupsTaken.add(pickup.id);
      this.world.acquired.add(pickup.id);
      if (pickup.id === "morphBall") {
        this.toast = "Morph Ball recovered.";
        this.world.objectiveLog = "Use morph ball in Service Junction";
      } else if (pickup.id === "highJump") {
        this.toast = "High Jump servos online.";
        this.world.objectiveLog = "Reach the Reactor Nest";
      } else if (pickup.id === "reactorCore") {
        this.toast = "Containment core secured. Return to Dock.";
        this.world.objectiveLog = "Extract through Dock";
      }
      this.toastTimer = 3.2;
    }
  }

  checkHazards(dt) {
    for (const hazard of this.currentRoom().hazards) {
      if (intersects(this.player, hazard)) {
        this.damagePlayer(18 * dt * 5, this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
        break;
      }
    }
  }

  gateAllows(gate) {
    if (gate.requires && !this.world.acquired.has(gate.requires)) {
      this.toast = gate.note;
      this.toastTimer = 2;
      return false;
    }
    return true;
  }

  transitionTo(roomId, entrySide) {
    this.world.roomId = roomId;
    this.world.visited.add(roomId);
    const room = this.currentRoom();
    this.toast = room.notes;
    this.toastTimer = 3;

    if (entrySide === "left") this.player.x = 36;
    if (entrySide === "right") this.player.x = ROOM_WIDTH - this.player.width - 36;
    if (entrySide === "up") this.player.y = FLOOR_Y - this.player.height - 4;
    if (entrySide === "down") this.player.y = 80;
    this.player.vx = 0;
    this.player.vy = 0;
  }

  checkTransitions() {
    const room = this.currentRoom();

    for (const gate of room.gates) {
      const touchingGate = intersects(this.player, gate);
      if (!touchingGate) continue;
      if (gate.axis === "vertical" && !this.gateAllows(gate)) {
        if (this.player.x < gate.x) this.player.x = gate.x - this.player.width - 1;
        else this.player.x = gate.x + gate.width + 1;
      }
      if (gate.axis === "hatch" && !this.gateAllows(gate)) {
        this.player.y = gate.y - this.player.height;
        this.player.vy = 0;
      }
    }

    if (this.player.x <= 0 && room.connections.left) {
      this.transitionTo(room.connections.left, "right");
      return;
    }
    if (this.player.x + this.player.width >= ROOM_WIDTH && room.connections.right) {
      const blockingGate = room.gates.find((gate) => gate.axis === "vertical" && gate.x > ROOM_WIDTH - 140);
      if (!blockingGate || this.world.acquired.has(blockingGate.requires)) {
        this.transitionTo(room.connections.right, "left");
        return;
      }
    }
    if (this.player.y <= 0 && room.connections.up) {
      this.transitionTo(room.connections.up, "down");
      return;
    }
    if (this.player.y + this.player.height >= FLOOR_Y && room.connections.down) {
      const drop = (room.drops ?? []).find(
        (entry) =>
          this.player.x + this.player.width > entry.x &&
          this.player.x < entry.x + entry.width &&
          (!entry.requires || this.world.acquired.has(entry.requires)) &&
          (!entry.requires || this.player.form === "morph"),
      );
      if (drop) {
        this.transitionTo(drop.to, "up");
        return;
      }
      const blockedDrop = (room.drops ?? []).find(
        (entry) => this.player.x + this.player.width > entry.x && this.player.x < entry.x + entry.width,
      );
      if (blockedDrop && !this.gateAllows(blockedDrop)) {
        this.player.y = FLOOR_Y - this.player.height;
        this.player.vy = 0;
      }
    }
  }

  cleanupEffects(dt) {
    for (const effect of this.effects) {
      effect.life -= dt;
      effect.radius += 60 * dt;
    }
    this.effects = this.effects.filter((effect) => effect.life > 0);
  }

  buildFrameState() {
    return {
      appState: this.mode === "playing" ? "playing" : this.mode,
      roomId: this.world.roomId,
      room: this.currentRoom(),
      visited: new Set(this.world.visited),
      upgrades: new Set(this.world.acquired),
      pickupsTaken: new Set(this.world.pickupsTaken),
      coreRecovered: this.world.pickupsTaken.has("reactorCore"),
      player: { ...this.player },
      enemies: this.activeEnemies().map((enemy) => ({ ...enemy })),
      projectiles: this.projectiles.filter((projectile) => projectile.roomId === this.world.roomId).map((projectile) => ({ ...projectile })),
      effects: this.effects.map((effect) => ({ ...effect })),
      objectiveLog: this.world.objectiveLog,
      toast: this.toastTimer > 0 ? this.toast : "",
      result:
        this.mode === "win"
          ? { eyebrow: "mission complete", title: "Containment core extracted.", copy: "Press restart to run the bio-lab again." }
          : this.mode === "lose"
            ? { eyebrow: "suit failure", title: "The lab overran the hunter.", copy: "Press restart to redeploy." }
            : null,
    };
  }

  render(ctx) {
    renderFrame(ctx, this.frame);
  }

  getFrameState() {
    return this.frame;
  }
}
