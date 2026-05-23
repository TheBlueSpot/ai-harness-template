const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class DrillPhysics {
  constructor({ startX = 360, startY = 52 } = {}) {
    this.reset({ startX, startY });
  }

  reset({ startX, startY }) {
    this.x = startX;
    this.y = startY;
    this.vx = 0;
    this.vy = 0;
    this.speed = 240;
    this.radius = 16;
    this.fuel = 100;
    this.heat = 0;
    this.oreValue = 0;
    this.maxDepth = 0;
    this.timeSurvived = 0;
    this.reason = "";
    this.dead = false;
    this.miningPulse = 0;
    this.pressureDamage = 0;
    this.digCount = 0;
    this.lastMineValue = 0;
  }

  update(dt, input, grid) {
    if (this.dead) {
      return this.snapshot(grid);
    }

    this.timeSurvived += dt;
    const steerX = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
    const steerY = (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0);
    const len = Math.hypot(steerX, steerY) || 1;
    const accel = this.speed * (input.isDown("boost") ? 1.35 : 1);
    this.vx += (steerX / len) * accel * dt * 3.6;
    this.vy += (steerY / len) * accel * dt * 3.6;
    this.vx *= Math.pow(0.002, dt);
    this.vy *= Math.pow(0.003, dt);

    const moveX = this.x + this.vx * dt;
    const moveY = this.y + this.vy * dt;
    const digRadius = this.radius + 5;
    const changes = grid.mineCircle(moveX, moveY, digRadius);
    if (changes.length) {
      const mined = grid.collectOre(changes);
      this.oreValue += mined.value;
      this.lastMineValue = mined.value;
      this.fuel += mined.fuelBonus;
      this.digCount += changes.length;
      this.heat = clamp(this.heat + 0.35 + changes.length * 0.06, 0, 100);
      this.miningPulse = 0.14;
      this.fuel -= dt * (1.4 + changes.length * 0.12);
    } else {
      this.lastMineValue = 0;
      this.heat = clamp(this.heat - dt * 12, 0, 100);
      this.fuel -= dt * 0.6;
    }

    this.x = moveX;
    this.y = moveY;
    this.maxDepth = Math.max(this.maxDepth, grid.depthOf(grid.cellFromWorld(this.x, this.y).row));

    const pressure = grid.samplePressure(this.x, this.y);
    if (pressure > 0.2) {
      this.pressureDamage += dt * pressure * 22;
      this.fuel -= dt * pressure * 0.9;
    } else {
      this.pressureDamage = Math.max(0, this.pressureDamage - dt * 8);
    }

    if (this.fuel <= 0) {
      this.dead = true;
      this.reason = "Fuel exhausted";
    } else if (this.pressureDamage >= 100) {
      this.dead = true;
      this.reason = "Crushed by pressure";
    } else if (this.y > grid.rows * grid.cellSize - 12) {
      this.dead = true;
      this.reason = "Buried too deep";
    }

    this.fuel = clamp(this.fuel, 0, 100);
    this.miningPulse = Math.max(0, this.miningPulse - dt);
    return this.snapshot(grid);
  }

  snapshot(grid) {
    return {
      x: this.x,
      y: this.y,
      fuel: this.fuel,
      heat: this.heat,
      oreValue: this.oreValue,
      maxDepth: this.maxDepth,
      timeSurvived: this.timeSurvived,
      reason: this.reason,
      dead: this.dead,
      pressure: grid ? grid.samplePressure(this.x, this.y) : 0,
      pressureDamage: this.pressureDamage,
      lastMineValue: this.lastMineValue,
      digCount: this.digCount
    };
  }
}
