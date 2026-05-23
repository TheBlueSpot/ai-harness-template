import { createGameState, createWorld, createFrameState, resetGameState } from "./state.js";
import { DATA, WORLD } from "./data.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hypot2(x, y) {
  return Math.hypot(x, y);
}

function keyDown(input, code) {
  return Boolean(input?.held?.[code] || input?.pressed?.[code]);
}

export class Game {
  constructor() {
    this.viewport = { width: 1280, height: 720, dpr: 1 };
    this.state = createGameState();
    this.world = createWorld();
    this.frame = createFrameState(this.state, this.world, this.viewport);
  }

  start() {
    if (this.state.mode === "menu" || this.state.mode === "win" || this.state.mode === "lose") {
      this.state.mode = "playing";
      this.state.overlayVisible = false;
    }
  }

  restart() {
    resetGameState(this.state);
    this.world = createWorld();
    this.frame = createFrameState(this.state, this.world, this.viewport);
  }

  resize(width, height, dpr = 1) {
    if (typeof width === "object" && width) {
      const box = width;
      this.viewport = {
        width: box.width ?? this.viewport.width,
        height: box.height ?? this.viewport.height,
        dpr: box.dpr ?? this.viewport.dpr ?? 1,
      };
    } else {
      this.viewport = { width, height, dpr };
    }
    this.frame = createFrameState(this.state, this.world, this.viewport);
  }

  update(dt, input) {
    if (keyDown(input, "Enter") || keyDown(input, "Space")) {
      if (this.state.mode !== "playing") {
        this.restart();
        this.start();
      }
    }
    if (keyDown(input, "KeyR")) {
      this.restart();
      this.start();
    }
    if (this.state.mode !== "playing") {
      this.frame = createFrameState(this.state, this.world, this.viewport);
      return;
    }

    const player = this.state.player;
    const thrust = {
      x: (keyDown(input, "ArrowRight") || keyDown(input, "d") || keyDown(input, "D") ? 1 : 0) - (keyDown(input, "ArrowLeft") || keyDown(input, "a") || keyDown(input, "A") ? 1 : 0),
      y: (keyDown(input, "ArrowDown") || keyDown(input, "s") || keyDown(input, "S") ? 1 : 0) - (keyDown(input, "ArrowUp") || keyDown(input, "w") || keyDown(input, "W") ? 1 : 0),
    };

    const thrustMag = hypot2(thrust.x, thrust.y);
    if (thrustMag > 0) {
      thrust.x /= thrustMag;
      thrust.y /= thrustMag;
    }

    const massFactor = 1 + Math.sqrt(player.mass) * 0.14;
    const speed = hypot2(player.velocity.x, player.velocity.y);
    const moving = thrustMag > 0;
    const lowSpeedBoost = speed < DATA.movement.lowSpeedThreshold && moving ? DATA.movement.lowSpeedBoost : 1;
    const accel = (DATA.movement.baseAcceleration * lowSpeedBoost) / massFactor;
    player.velocity.x += thrust.x * accel * dt;
    player.velocity.y += thrust.y * accel * dt;
    player.velocity.x *= Math.pow(DATA.movement.drag, dt * 60);
    player.velocity.y *= Math.pow(DATA.movement.drag, dt * 60);
    const currentSpeed = hypot2(player.velocity.x, player.velocity.y);
    const maxSpeed = DATA.movement.baseSpeed + Math.sqrt(player.mass) * DATA.movement.massSpeed;
    if (currentSpeed > maxSpeed) {
      player.velocity.x = (player.velocity.x / currentSpeed) * maxSpeed;
      player.velocity.y = (player.velocity.y / currentSpeed) * maxSpeed;
    }

    player.position.x = clamp(player.position.x + player.velocity.x * dt, WORLD.bounds.minX + 48, WORLD.bounds.maxX - 48);
    player.position.y = clamp(player.position.y + player.velocity.y * dt, WORLD.bounds.minY + 48, WORLD.bounds.maxY - 48);
    if (moving) {
      player.heading = Math.atan2(thrust.y, thrust.x);
    } else if (currentSpeed > 8) {
      player.heading = Math.atan2(player.velocity.y, player.velocity.x);
    }
    player.spin = 0;
    player.rotation = player.heading;
    this.state.time += dt;

    this.resolveObjects(dt);
    this.resolveHazards();
    this.advanceDistricts();
    this.updateFollowers(dt);
    this.state.hud.mass = player.mass;
    this.state.hud.elapsed = this.state.time;
    this.state.hud.score = Math.round(player.mass * 100 + this.state.time * 10 + this.state.collectedCount * 35);
    this.state.camera = this.buildCamera();
    this.frame = createFrameState(this.state, this.world, this.viewport);
  }

  resolveObjects(dt) {
    const player = this.state.player;
    const pickupRadius = player.radius;
    const remaining = [];
    let gained = 0;
    for (const object of this.world.objects) {
      const dx = object.position.x - player.position.x;
      const dy = object.position.y - player.position.y;
      const reach = pickupRadius + object.radius;
      const distance = Math.hypot(dx, dy);
      if (distance > reach) {
        remaining.push(object);
        continue;
      }
        if (object.type === "hazard") {
          this.fail("Hazard clipped the clump.");
          return;
        }
        if (player.mass >= object.absorbMass) {
          gained += object.mass;
          this.state.collectedCount += 1;
          this.attachItem(object);
          continue;
        }
      remaining.push(object);
    }
    this.world.objects = remaining;
    if (gained > 0) {
      player.mass += gained;
      player.radius = DATA.player.baseRadius + Math.sqrt(player.mass) * DATA.player.radiusScale;
      this.state.pulse = Math.max(this.state.pulse, 0.2 + gained * 0.01);
      this.state.hud.message = player.mass >= DATA.districts[this.state.districtIndex].massThreshold ? "Gate open. Push into next district." : "Safe clumps absorbed.";
    }
  }

  resolveHazards() {
    const player = this.state.player;
    for (const hazard of this.world.hazards) {
      const dx = hazard.position.x - player.position.x;
      const dy = hazard.position.y - player.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < player.radius + hazard.radius * 0.78) {
        this.fail("Red hazard shredded the roll.");
        return;
      }
    }
  }

  advanceDistricts() {
    const district = DATA.districts[this.state.districtIndex];
    if (!district) {
      this.win();
      return;
    }
    if (this.state.player.mass < district.massThreshold) {
      return;
    }
    const gate = this.world.gates[this.state.districtIndex];
    if (gate) {
      gate.open = true;
      if (this.state.player.position.x >= gate.exitX) {
        this.state.districtIndex += 1;
        if (this.state.districtIndex >= DATA.districts.length) {
          this.win();
        } else {
          this.state.hud.message = DATA.districts[this.state.districtIndex].label + " unlocked.";
        }
      }
    }
  }

  attachItem(object) {
    this.state.attachedItems.push({
      id: object.id,
      type: object.type,
      label: object.label,
      mass: object.mass,
      angle: object.position.angle ?? 0,
      distance: this.state.player.radius + object.radius + 8 + this.state.attachedItems.length * 2,
      phase: (this.state.attachedItems.length % 8) * 0.78,
    });
  }

  updateFollowers(dt) {
    const player = this.state.player;
    const items = this.state.attachedItems;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      item.phase += dt * 2.3;
      const offset = item.distance + Math.sin(item.phase) * 4;
      const angle = player.rotation + item.angle + i * 0.45;
      item.position = {
        x: player.position.x - Math.cos(angle) * offset,
        y: player.position.y - Math.sin(angle) * offset,
      };
    }
  }

  buildCamera() {
    const viewWidth = this.viewport.width / Math.max(1, this.viewport.dpr);
    const viewHeight = this.viewport.height / Math.max(1, this.viewport.dpr);
    return {
      x: clamp(this.state.player.position.x - viewWidth / 2, WORLD.bounds.minX, WORLD.bounds.maxX - viewWidth),
      y: clamp(this.state.player.position.y - viewHeight / 2, WORLD.bounds.minY, WORLD.bounds.maxY - viewHeight),
      width: viewWidth,
      height: viewHeight,
    };
  }

  fail(message) {
    this.state.mode = "lose";
    this.state.overlayVisible = true;
    this.state.hud.message = message;
    this.state.overlay = {
      eyebrow: "Crash",
      title: "Clump shattered",
      copy: "Hit restart and roll again.",
      button: "Restart",
    };
  }

  win() {
    this.state.mode = "win";
    this.state.overlayVisible = true;
    this.state.hud.message = "All districts cleared.";
    this.state.overlay = {
      eyebrow: "Clear",
      title: "Districts rolled",
      copy: "City cleared. Press Start to roll again.",
      button: "Start",
    };
  }

  getFrameState() {
    return this.frame;
  }
}
