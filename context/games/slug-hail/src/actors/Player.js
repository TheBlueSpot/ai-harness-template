function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x, y, length = 1) {
  const mag = Math.hypot(x, y) || 1;
  return { x: (x / mag) * length, y: (y / mag) * length };
}

function rotate(x, y, angle) {
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
}

export class Player {
  constructor(world, weapons) {
    this.world = world;
    this.weapons = weapons;
    this.weaponIds = Object.keys(weapons);
    this.radius = 20;
    this.maxHp = 8;
    this.reset();
  }

  reset() {
    this.x = 260;
    this.y = this.world.height / 2;
    this.vx = 0;
    this.vy = 0;
    this.aimX = 1;
    this.aimY = 0;
    this.weaponIndex = 0;
    this.fireCooldown = 0;
    this.invuln = 0;
    this.hp = this.maxHp;
    this.recoilX = 0;
    this.recoilY = 0;
    this.heat = 0;
    this.switchLatch = false;
  }

  get bounds() {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2,
    };
  }

  get weapon() {
    return this.weapons[this.weaponIds[this.weaponIndex]];
  }

  switchWeapon(direction = 1) {
    const count = this.weaponIds.length;
    this.weaponIndex = (this.weaponIndex + direction + count) % count;
  }

  damage(amount) {
    if (this.invuln > 0) {
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 0.85;
    return true;
  }

  update(dt, input, terrain, emit) {
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const move = normalize(moveX, moveY, moveX || moveY ? 1 : 0);
    const accel = 980;
    this.vx += move.x * accel * dt;
    this.vy += move.y * accel * dt;
    this.vx *= Math.pow(0.0007, dt);
    this.vy *= Math.pow(0.0007, dt);

    const maxSpeed = input.slow ? 220 : 320;
    const mag = Math.hypot(this.vx, this.vy);
    if (mag > maxSpeed) {
      this.vx = (this.vx / mag) * maxSpeed;
      this.vy = (this.vy / mag) * maxSpeed;
    }

    this.x = clamp(this.x + this.vx * dt + this.recoilX * dt, this.radius, this.world.width - this.radius);
    this.y = clamp(this.y + this.vy * dt + this.recoilY * dt, this.radius, this.world.height - this.radius);

    terrain.resolveCircle(this, this.radius + 6);

    this.recoilX *= Math.pow(0.0002, dt);
    this.recoilY *= Math.pow(0.0002, dt);

    const aimTarget = input.aimWorld || { x: this.x + 1, y: this.y };
    const aim = normalize(aimTarget.x - this.x, aimTarget.y - this.y, 1);
    this.aimX = aim.x;
    this.aimY = aim.y;

    if (input.switchWeapon && !this.switchLatch) {
      this.switchWeapon(1);
      emit("weapon-switched", { weaponId: this.weapon.id });
    }
    this.switchLatch = input.switchWeapon;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.heat = Math.max(0, this.heat - dt * 0.22);
  }

  canFire() {
    return this.fireCooldown <= 0 && this.hp > 0;
  }

  buildShots() {
    const weapon = this.weapon;
    const shots = [];
    for (let i = 0; i < weapon.burst; i += 1) {
      const spreadOffset = weapon.burst === 1 ? 0 : ((i / (weapon.burst - 1)) - 0.5) * weapon.spread * 2;
      const dir = rotate(this.aimX, this.aimY, spreadOffset + (Math.random() - 0.5) * weapon.spread);
      shots.push({
        x: this.x + dir.x * 18,
        y: this.y + dir.y * 18,
        vx: dir.x * weapon.projectileSpeed,
        vy: dir.y * weapon.projectileSpeed,
        owner: "player",
        radius: weapon.id === "piercer" ? 4 : 3.2,
        damage: weapon.damage,
        terrainDamage: weapon.terrainDamage,
        color: weapon.color,
      });
    }
    this.fireCooldown = weapon.fireRate;
    this.heat = Math.min(1, this.heat + weapon.heat);
    this.recoilX -= this.aimX * weapon.recoil;
    this.recoilY -= this.aimY * weapon.recoil;
    return shots;
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.aimY, this.aimX));
    ctx.fillStyle = this.invuln > 0 ? "#7ff0b4" : "#dce8ff";
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-12, -12);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this.weapon.color;
    ctx.fillRect(1, -4, 18, 8);
    ctx.fillStyle = "#1a2736";
    ctx.fillRect(-8, -6, 8, 12);
    ctx.restore();
  }
}
