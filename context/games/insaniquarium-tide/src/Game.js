import { ALIEN_TYPES, FISH_TYPES, GAME, WAVE_DEFS, VIEW } from "./data.js";
import { createInitialState, resetRuntimeState, makeFishState } from "./state.js";

export class Game {
  constructor(config = {}) {
    this.config = config;
    this.state = createInitialState(config);
    this.running = false;
    this.pointer = { x: 0.5, y: 0.5, down: false, type: "", active: false };
    this.accum = 0;
    this.spawnClock = 0;
    this.coinClock = 0;
    this.alienClock = 0;
  }

  start() {
    this.running = true;
    this.state.phase = "playing";
    this.state.overlay = {
      eyebrow: "Run live",
      title: "Insaniquarium Tide",
      copy: "Press on the water to drop food, sweep through coins to collect sun, and release near aliens to fire.",
      button: "Restart",
    };
    this.state.hud.status = "Tank live";
    this.state.hud.threat = "Calm";
    this.state.hud.tip = "Press on the water to feed fish, then sweep through coins to collect sun and fill the egg meter.";
    if (!this.state.fish.length) this.seedFish(3);
    this.syncFrameState();
  }

  restart() {
    resetRuntimeState(this.state, this.config);
    this.running = false;
    this.accum = 0;
    this.spawnClock = 0;
    this.coinClock = 0;
    this.alienClock = 0;
    this.syncFrameState();
  }

  resize(width, height) {
    this.state.width = width;
    this.state.height = height;
    this.state.tank = {
      x: Math.round((width - width * VIEW.tankWidth) * 0.5),
      y: Math.round(height * VIEW.tankTop),
      width: Math.round(width * VIEW.tankWidth),
      height: Math.round(height * VIEW.tankHeight),
    };
  }

  handlePointer(typeOrEvent, x, y) {
    const event = typeof typeOrEvent === "object" ? typeOrEvent : { type: typeOrEvent, x, y, down: typeOrEvent === "pointerdown" };
    const px = event.x ?? x ?? this.state.width * 0.5;
    const py = event.y ?? y ?? this.state.height * 0.5;
    const nx = this.toTankX(px);
    const ny = this.toTankY(py);
    this.pointer = { x: nx, y: ny, down: !!event.down, type: event.type ?? "", active: true };
    if ((event.type ?? "").includes("down") || event.down) this.dropFood(this.pointer.x, this.pointer.y);
    if ((event.type ?? "") === "pointerup") this.fireShot(this.pointer.x, this.pointer.y);
    this.collectCoinsAt(this.pointer.x, this.pointer.y);
    this.state.cursor = { ...this.pointer, radius: 18 };
    this.syncFrameState();
  }

  handlePointerMove(event) {
    const px = event.x ?? this.state.width * 0.5;
    const py = event.y ?? this.state.height * 0.5;
    const nx = this.toTankX(px);
    const ny = this.toTankY(py);
    this.pointer = { x: nx, y: ny, down: this.pointer.down, type: event.type ?? "pointermove", active: true };
    this.collectCoinsAt(nx, ny);
    this.state.cursor = { ...this.pointer, radius: 18 };
    this.syncFrameState();
  }

  update(dt) {
    this.state.time += dt;
    if (!this.running) {
      this.updateHud();
      this.syncFrameState();
      return;
    }
    this.state.elapsed += dt;
    this.spawnClock += dt;
    this.coinClock += dt;
    this.alienClock += dt;
    this.advanceFish(dt);
    this.advanceFood(dt);
    this.advanceCoins(dt);
    this.advanceShots(dt);
    this.advanceAliens(dt);
    this.advanceEggs(dt);
    this.spawnFromTimers();
    this.resolveWinLose();
    this.updateHud();
    this.syncFrameState();
  }

  getFrameState() {
    return this.frameState ?? this.buildFrameState();
  }

  seedFish(count) {
    for (let i = 0; i < count; i += 1) this.state.fish.push(makeFishState(FISH_TYPES[i % FISH_TYPES.length], 0.28 + i * 0.12, 0.58 + (i % 2) * 0.05));
  }

  dropFood(x, y) {
    if (this.state.food.length >= GAME.maxFood || this.state.sun < GAME.foodCost) return;
    this.state.sun -= GAME.foodCost;
    this.state.food.push({ id: this.state.nextFoodId++, x, y, vy: 0.14, radius: 8, value: 1, alive: true });
  }

  fireShot(x, y) {
    if (this.state.shots.length >= GAME.maxShots || this.state.sun < GAME.shotCost) return;
    this.state.sun -= GAME.shotCost;
    const originX = 0.5;
    const originY = 0.94;
    const dx = x - originX;
    const dy = y - originY;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = 0.95;
    this.state.shots.push({
      id: this.state.nextShotId++,
      x: originX,
      y: originY,
      tx: x,
      ty: y,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      ttl: 1.8,
      alive: true,
    });
  }

  advanceFish(dt) {
    for (const fish of this.state.fish) {
      if (!fish.alive) continue;
      const type = fish.type ?? FISH_TYPES[0];
      const petSupport = this.state.pets.reduce((sum, pet) => sum + (pet.support ?? 0), 0);
      fish.hunger = Math.min(1, fish.hunger + dt * type.hungerRate);
      fish.hunger = Math.max(0, fish.hunger - dt * petSupport * 0.2);
      fish.stunned = Math.max(0, fish.stunned - dt);
      if (fish.eating > 0) {
        fish.eating -= dt;
        continue;
      }
      const target = this.findNearestFood(fish);
      if (target) {
        const dx = target.x - fish.x;
        const dy = target.y - fish.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = type.speed * (0.75 + fish.hunger * 0.5);
        fish.vx = dx / dist * speed;
        fish.vy = dy / dist * speed;
        fish.facing = Math.sign(dx) || fish.facing;
        fish.x += fish.vx * dt;
        fish.y += fish.vy * dt;
        if (dist < type.eatRadius) {
          fish.eating = type.eatTime;
          target.alive = false;
          this.state.sun += GAME.sunFromFood + Math.round(petSupport * 10);
          this.spawnCoin(fish.x, fish.y, 1);
          fish.hunger = Math.max(0, fish.hunger - 0.45);
          this.state.progression.eggs = Math.min(GAME.eggProgress, this.state.progression.eggs + 7);
        }
      } else {
        fish.x += Math.sin(this.state.time * 0.7 + fish.x * 11) * dt * 0.04;
        fish.y += Math.cos(this.state.time * 0.9 + fish.y * 8) * dt * 0.02;
      }
      fish.x = this.clamp01(0.08 + fish.x * 0.84);
      fish.y = this.clamp01(0.28 + fish.y * 0.52);
    }
  }

  advanceFood(dt) {
    for (const item of this.state.food) item.y += item.vy * dt;
    this.state.food = this.state.food.filter((item) => item.alive !== false && item.y < 0.96);
  }

  advanceCoins(dt) {
    for (const coin of this.state.coins) {
      coin.y += (coin.vy ?? 0.04) * dt;
      coin.x += Math.sin((coin.id + this.state.time) * 3) * dt * 0.01;
    }
    this.state.coins = this.state.coins.filter((coin) => coin.alive !== false && coin.y < 1);
  }

  advanceShots(dt) {
    for (const shot of this.state.shots) {
      shot.y += shot.vy * dt;
      shot.x += shot.vx * dt;
      shot.ttl -= dt;
      const hit = this.state.aliens.find((alien) => alien.alive && Math.hypot(alien.x - shot.x, alien.y - shot.y) < 0.06);
      if (hit) {
        hit.hp -= 1;
        shot.alive = false;
        if (hit.hp <= 0) {
          hit.alive = false;
          this.spawnCoin(hit.x, hit.y, 2);
        }
      }
    }
    this.state.shots = this.state.shots.filter((shot) => shot.alive !== false && shot.ttl > 0 && shot.y > 0);
  }

  advanceAliens(dt) {
    for (const alien of this.state.aliens) {
      alien.phase += dt;
      alien.y += alien.vy * dt;
      alien.x += Math.sin(alien.phase * 4) * dt * 0.018;
      const prey = this.state.fish.find((fish) => fish.alive && Math.hypot(fish.x - alien.x, fish.y - alien.y) < 0.05);
      if (prey) {
        prey.hunger = 1;
        prey.stunned = alien.stun;
        prey.alive = false;
        alien.hp -= alien.damage;
        this.spawnCoin(prey.x, prey.y, 1);
      }
    }
    this.state.aliens = this.state.aliens.filter((alien) => alien.alive !== false && alien.y < 1.05 && alien.hp > 0);
  }

  advanceEggs(dt) {
    const target = this.state.progression.eggs;
    if (target >= GAME.eggProgress && !this.state.eggs.length) {
      this.state.eggs.push({ id: this.state.nextEggId++, x: 0.5, y: 0.63, unlocked: true, pulse: 0 });
      this.state.win = true;
      this.state.phase = "win";
      this.running = false;
    }
    for (const egg of this.state.eggs) egg.pulse += dt;
  }

  spawnFromTimers() {
    const wave = [...WAVE_DEFS].reverse().find((item) => this.state.elapsed >= item.at) ?? WAVE_DEFS[0];
    if (this.spawnClock >= GAME.spawnFishEvery && this.state.fish.length < wave.fish) {
      this.spawnClock = 0;
      this.state.fish.push(makeFishState(FISH_TYPES[this.state.fish.length % FISH_TYPES.length], 0.2 + Math.random() * 0.6, 0.45 + Math.random() * 0.16));
    }
    if (this.coinClock >= GAME.spawnCoinEvery && this.state.coins.length < 4) {
      this.coinClock = 0;
      this.spawnCoin(0.22 + Math.random() * 0.56, 0.24 + Math.random() * 0.4, 1);
    }
    if (this.state.elapsed > 8 && this.alienClock >= GAME.spawnAlienEvery && this.state.aliens.length < wave.aliens + 2) {
      this.alienClock = 0;
      this.spawnAlien();
    }
  }

  collectCoinsAt(x, y) {
    let collected = 0;
    for (const coin of this.state.coins) {
      if (coin.alive === false) continue;
      if (Math.hypot(coin.x - x, coin.y - y) < 0.06) {
        coin.alive = false;
        this.state.sun += GAME.sunFromCoin * (coin.value ?? 1);
        collected += 1;
      }
    }
    return collected;
  }

  spawnCoin(x, y, value) {
    this.state.coins.push({ id: this.state.nextCoinId++, x, y, value, vy: 0.08, alive: true });
  }

  spawnAlien() {
    const kind = ALIEN_TYPES[this.state.aliens.length % ALIEN_TYPES.length];
    this.state.aliens.push({ id: this.state.nextAlienId++, type: kind, x: 0.82, y: 0.12, vx: 0, vy: 0.03 + kind.speed * 0.1, hp: 2 + kind.damage, damage: kind.damage, stun: kind.stun, phase: 0, alive: true, color: kind.color, scale: 1 });
  }

  findNearestFood(fish) {
    let best = null;
    let bestDist = Infinity;
    for (const item of this.state.food) {
      if (item.alive === false) continue;
      const dist = Math.hypot(item.x - fish.x, item.y - fish.y);
      if (dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    return best;
  }

  resolveWinLose() {
    const aliveFish = this.state.fish.filter((fish) => fish.alive).length;
    if (aliveFish <= GAME.loseFish) {
      this.state.lose = true;
      this.state.phase = "lose";
      this.running = false;
    }
    this.state.score = this.state.sun;
  }

  updateHud() {
    const activeFish = this.state.fish.filter((fish) => fish.alive).length;
    const loseThreshold = GAME.loseFish;
    this.state.hud.status =
      this.state.phase === "win"
        ? "Egg secure"
        : this.state.phase === "lose"
          ? "Tank overrun"
          : this.running
            ? "Tank live"
            : "Tank idle";
    this.state.hud.threat = this.state.aliens.length ? `${this.state.aliens.length} alien${this.state.aliens.length === 1 ? "" : "s"}` : "Calm";
    this.state.hud.tip =
      this.state.phase === "win"
        ? "Egg secured. Restart to run another tank."
        : this.state.phase === "lose"
          ? `Tank empty. Restart fast and keep more than ${loseThreshold} fish alive.`
          : this.state.coins.length
            ? "Sweep the cursor through coins to collect sun and keep the egg meter climbing."
            : this.state.aliens.length
              ? `Release near aliens to fire before they reach the fish. Lose if ${loseThreshold} fish remain.`
              : this.state.progression.eggs < 28
                ? `Press on the water to feed fish. Sweep coins to collect sun. Win at ${GAME.eggProgress} egg energy.`
                : activeFish < 3
                  ? "Feed fish and rebuild the tank before the next alien wave."
                  : `Keep fish fed, sweep coins fast, and hatch the egg before the tank drops to ${loseThreshold} fish.`;
  }

  syncFrameState() {
    this.frameState = this.buildFrameState();
  }

  buildFrameState() {
    const phase = this.state.phase;
    const frame = {
      time: this.state.time,
      state: phase,
      phase,
      sun: this.state.sun,
      score: this.state.score,
      fishCount: this.state.fish.filter((fish) => fish.alive).length,
      threat: this.state.hud.threat,
      status: this.state.hud.status,
      message: this.state.hud.status,
      hint: this.state.hud.tip,
      warning: this.state.aliens.length ? "Release to fire" : this.state.coins.length ? "Sweep coins to collect" : "",
      eggProgress: this.state.progression.eggs,
      eggTarget: GAME.eggProgress,
      goalText:
        this.state.phase === "win"
          ? `Win complete. Egg ${GAME.eggProgress} / ${GAME.eggProgress}.`
          : this.state.phase === "lose"
            ? `Lose state. Fish ${this.state.fish.filter((fish) => fish.alive).length} / ${GAME.loseFish + 1} needed.`
            : `Win: hatch egg ${Math.round(this.state.progression.eggs)} / ${GAME.eggProgress}. Lose: ${GAME.loseFish} fish left.`,
      tank: this.state.tank,
      fish: this.state.fish.filter((fish) => fish.alive).map((fish) => this.toRenderFish(fish)),
      food: this.state.food.filter((item) => item.alive !== false).map((item) => ({ ...item })),
      coins: this.state.coins.filter((item) => item.alive !== false).map((item) => ({ ...item })),
      eggs: this.state.eggs.map((egg) => ({ ...egg })),
      aliens: this.state.aliens.filter((alien) => alien.alive !== false).map((alien) => ({ ...alien })),
      shots: this.state.shots.filter((shot) => shot.alive !== false).map((shot) => ({ ...shot })),
      bubbles: this.state.bubbles,
      pets: this.state.pets,
      hud: this.state.hud,
      overlayTitle: this.state.overlay.title,
      overlayCopy: this.state.overlay.copy,
      overlayEyebrow: this.state.overlay.eyebrow,
      overlayButton: this.state.overlay.button,
      cursor: this.state.cursor,
    };
    this.frameState = frame;
    return frame;
  }

  toRenderFish(fish) {
    return {
      ...fish,
      type: fish.type?.label ?? fish.type?.id ?? "Fish",
      color: fish.type?.color,
      finColor: fish.type?.finColor,
      scale: 1,
      hungry: fish.hunger > 0.7,
    };
  }

  clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  toTankX(pixelX) {
    const { tank, width } = this.state;
    if (pixelX <= 1 && pixelX >= 0) return this.clamp01(pixelX);
    return this.clamp01((pixelX - tank.x) / Math.max(1, tank.width || width));
  }

  toTankY(pixelY) {
    const { tank, height } = this.state;
    if (pixelY <= 1 && pixelY >= 0) return this.clamp01(pixelY);
    return this.clamp01((pixelY - tank.y) / Math.max(1, tank.height || height));
  }
}
