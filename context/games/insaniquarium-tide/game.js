(function () {
  const VIEW = {
    tankWidth: 0.72,
    tankHeight: 0.68,
    tankTop: 0.18,
  };

  const GAME = {
    maxFood: 24,
    maxShots: 14,
    foodCost: 5,
    shotCost: 12,
    startSun: 40,
    sunFromFood: 3,
    sunFromCoin: 15,
    loseFish: 0,
    spawnFishEvery: 9,
    spawnCoinEvery: 8,
    spawnAlienEvery: 22,
    eggProgress: 100,
  };

  const FISH_TYPES = [
    { id: "common", label: "Common", speed: 0.18, hungerRate: 0.058, eatTime: 0.8, eatRadius: 0.022, color: "#ffb35a", finColor: "#ff8e4e" },
    { id: "swift", label: "Swift", speed: 0.24, hungerRate: 0.07, eatTime: 0.68, eatRadius: 0.024, color: "#7ddfff", finColor: "#4fc4f1" },
    { id: "guardian", label: "Guardian", speed: 0.16, hungerRate: 0.045, eatTime: 0.92, eatRadius: 0.03, color: "#ff8bb7", finColor: "#d5648f" },
  ];

  const ALIEN_TYPES = [
    { id: "scout", label: "Scout", speed: 0.14, damage: 1, stun: 1.4, color: "#b9ff6e" },
    { id: "snatcher", label: "Snatcher", speed: 0.11, damage: 2, stun: 1.8, color: "#8fdc5c" },
  ];

  const WAVE_DEFS = [
    { at: 0, fish: 3, aliens: 0 },
    { at: 22, fish: 4, aliens: 1 },
    { at: 48, fish: 5, aliens: 1 },
    { at: 80, fish: 6, aliens: 2 },
  ];

  function makeTank(width, height) {
    const w = Math.round(width * VIEW.tankWidth);
    const h = Math.round(height * VIEW.tankHeight);
    return {
      x: Math.round((width - w) * 0.5),
      y: Math.round(height * VIEW.tankTop),
      width: w,
      height: h,
    };
  }

  function createInitialState(width, height) {
    return {
      phase: "menu",
      time: 0,
      elapsed: 0,
      width,
      height,
      tank: makeTank(width, height),
      sun: GAME.startSun,
      score: GAME.startSun,
      fish: [],
      food: [],
      coins: [],
      eggs: [],
      aliens: [],
      shots: [],
      pets: [{ id: 1, type: "snail", support: 0.05 }],
      progression: { eggs: 0 },
      tutorial: { fed: false, collected: false, fired: false },
      cursor: { x: 0.5, y: 0.5, active: false, radius: 18 },
      hud: { status: "Tank idle", threat: "Calm", tip: "Start the tank and feed fish to build sun." },
      overlay: {
        eyebrow: "Tank start",
        title: "Insaniquarium Tide",
        copy: "Feed fish, bank sun, unlock eggs, and keep aliens off the tank.",
        button: "Start",
      },
      win: false,
      lose: false,
      nextFoodId: 1,
      nextCoinId: 1,
      nextEggId: 1,
      nextAlienId: 1,
      nextShotId: 1,
    };
  }

  function makeFishState(type, x, y) {
    return { type, x, y, vx: 0, vy: 0, hunger: 0, facing: 1, alive: true, eating: 0, stunned: 0 };
  }

  class Game {
    constructor() {
      this.state = createInitialState(1600, 900);
      this.running = false;
      this.spawnClock = 0;
      this.coinClock = 0;
      this.alienClock = 0;
      this.frameState = null;
      this.syncFrameState();
    }

    start() {
      this.running = true;
      this.state.phase = "playing";
      this.state.overlay = {
        eyebrow: "Run live",
        title: "Insaniquarium Tide",
        copy: "Click water to feed fish, sweep coins to bank sun, and release near aliens to fire.",
        button: "Restart",
      };
      this.state.hud.status = "Tank live";
      this.state.hud.threat = "Calm";
      this.state.hud.tip = "Click water to feed fish, then sweep coins to fill the egg meter.";
      if (!this.state.fish.length) {
        for (let i = 0; i < 3; i += 1) {
          this.state.fish.push(makeFishState(FISH_TYPES[i % FISH_TYPES.length], 0.28 + i * 0.12, 0.58 + (i % 2) * 0.05));
        }
      }
      this.syncFrameState();
    }

    restart() {
      const width = this.state.width;
      const height = this.state.height;
      this.state = createInitialState(width, height);
      this.running = false;
      this.spawnClock = 0;
      this.coinClock = 0;
      this.alienClock = 0;
      this.syncFrameState();
    }

    resize(width, height) {
      this.state.width = width;
      this.state.height = height;
      this.state.tank = makeTank(width, height);
      this.syncFrameState();
    }

    handlePointer(event) {
      const x = this.toTankX(event.x);
      const y = this.toTankY(event.y);
      this.state.cursor = { x, y, active: true, radius: 18 };
      if (event.type === "pointerdown") {
        this.dropFood(x, y);
      }
      if (event.type === "pointerup") {
        this.fireShot(x, y);
      }
      this.collectCoinsAt(x, y);
      this.syncFrameState();
    }

    handlePointerMove(event) {
      const x = this.toTankX(event.x);
      const y = this.toTankY(event.y);
      this.state.cursor = { x, y, active: true, radius: 18 };
      this.collectCoinsAt(x, y);
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
      return this.frameState;
    }

    dropFood(x, y) {
      if (this.state.food.length >= GAME.maxFood || this.state.sun < GAME.foodCost) return;
      this.state.sun -= GAME.foodCost;
      this.state.food.push({ id: this.state.nextFoodId++, x, y, vy: 0.14, radius: 8, alive: true });
      this.state.tutorial.fed = true;
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
        vx: (dx / distance) * speed,
        vy: (dy / distance) * speed,
        ttl: 1.8,
        alive: true,
      });
      this.state.tutorial.fired = true;
    }

    advanceFish(dt) {
      for (const fish of this.state.fish) {
        if (!fish.alive) continue;
        const petSupport = this.state.pets.reduce((sum, pet) => sum + (pet.support || 0), 0);
        fish.hunger = Math.min(1, fish.hunger + dt * fish.type.hungerRate);
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
          const speed = fish.type.speed * (0.75 + fish.hunger * 0.5);
          fish.vx = (dx / dist) * speed;
          fish.vy = (dy / dist) * speed;
          fish.facing = Math.sign(dx) || fish.facing;
          fish.x += fish.vx * dt;
          fish.y += fish.vy * dt;
          if (dist < fish.type.eatRadius) {
            fish.eating = fish.type.eatTime;
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
        coin.y += (coin.vy || 0.04) * dt;
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
          prey.alive = false;
          prey.hunger = 1;
          prey.stunned = alien.stun;
          alien.hp -= alien.damage;
          this.spawnCoin(prey.x, prey.y, 1);
        }
      }
      this.state.aliens = this.state.aliens.filter((alien) => alien.alive !== false && alien.y < 1.05 && alien.hp > 0);
    }

    advanceEggs(dt) {
      const target = this.state.progression.eggs;
      if (target >= GAME.eggProgress && !this.state.eggs.length) {
        this.state.eggs.push({ id: this.state.nextEggId++, x: 0.5, y: 0.63, pulse: 0 });
        this.state.win = true;
        this.state.phase = "win";
        this.running = false;
      }
      for (const egg of this.state.eggs) egg.pulse += dt;
    }

    spawnFromTimers() {
      const wave = this.getWave();
      if (this.spawnClock >= GAME.spawnFishEvery && this.state.fish.filter((fish) => fish.alive).length < wave.fish) {
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
          this.state.sun += GAME.sunFromCoin * (coin.value || 1);
          collected += 1;
        }
      }
      if (collected) {
        this.state.tutorial.collected = true;
      }
      return collected;
    }

    getWave() {
      return WAVE_DEFS.slice().reverse().find((item) => this.state.elapsed >= item.at) || WAVE_DEFS[0];
    }

    spawnCoin(x, y, value) {
      this.state.coins.push({ id: this.state.nextCoinId++, x, y, value, vy: 0.08, alive: true });
    }

    spawnAlien() {
      const kind = ALIEN_TYPES[this.state.aliens.length % ALIEN_TYPES.length];
      this.state.aliens.push({
        id: this.state.nextAlienId++,
        type: kind,
        x: 0.82,
        y: 0.12,
        vy: 0.03 + kind.speed * 0.1,
        hp: 2 + kind.damage,
        damage: kind.damage,
        stun: kind.stun,
        phase: 0,
        alive: true,
        color: kind.color,
      });
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
      const aliveFish = this.state.fish.filter((fish) => fish.alive).length;
      this.state.hud.status =
        this.state.phase === "win" ? "Egg secure" :
        this.state.phase === "lose" ? "Tank overrun" :
        this.running ? "Tank live" : "Tank idle";
      this.state.hud.threat = this.state.aliens.length ? `${this.state.aliens.length} alien${this.state.aliens.length === 1 ? "" : "s"}` : "Calm";
      this.state.hud.tip =
        this.state.phase === "win" ? "Egg secured. Restart to run another tank." :
        this.state.phase === "lose" ? "Tank empty. Restart fast and keep fish fed." :
        this.state.coins.length ? "Sweep over coins to bank sun and keep the egg meter climbing." :
        this.state.aliens.length ? "Release near aliens to fire before they reach the fish." :
        this.state.progression.eggs < 28 ? "Click water to feed fish and start building the egg meter." :
        aliveFish < 3 ? "Feed fish and rebuild the tank before the next alien wave." :
        "Keep fish fed so coins and egg progress keep flowing.";
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

    syncFrameState() {
      const aliveFish = this.state.fish.filter((fish) => fish.alive).length;
      const wave = this.getWave();
      const nextWave = WAVE_DEFS.find((item) => item.at > this.state.elapsed) || null;
      const nextFishIn = aliveFish < wave.fish ? Math.max(0, GAME.spawnFishEvery - this.spawnClock) : 0;
      this.frameState = {
        state: this.state.phase,
        phase: this.state.phase,
        time: this.state.time,
        sun: this.state.sun,
        score: this.state.score,
        fishCount: aliveFish,
        threat: this.state.hud.threat,
        status: this.state.hud.status,
        message: this.state.hud.status,
        hint: this.state.hud.tip,
        warning: this.state.aliens.length ? "Release to fire" : this.state.coins.length ? "Sweep coins to collect" : "",
        eggProgress: this.state.progression.eggs,
        eggTarget: GAME.eggProgress,
        goalText: `Egg ${Math.round(this.state.progression.eggs)} / ${GAME.eggProgress}`,
        coach: {
          visible: this.state.phase === "playing",
          feed: {
            complete: this.state.tutorial.fed,
            text: this.state.tutorial.fed ? "Food live. Fish can now grow sun and egg progress." : "Click water to drop food for fish.",
          },
          collect: {
            complete: this.state.tutorial.collected,
            text: this.state.tutorial.collected ? "Sun banking live. Sweep coins with cursor to collect." : "Sweep through coin icons to collect money.",
          },
          goal: {
            complete: this.state.phase === "win",
            text: `Win at Egg ${Math.round(this.state.progression.eggs)} / ${GAME.eggProgress}. Lose if fish hits 0.`,
          },
          school: {
            complete: aliveFish >= wave.fish,
            text:
              aliveFish >= wave.fish
                ? nextWave
                  ? `School ${aliveFish} live. Wave grows to ${nextWave.fish} at ${Math.round(nextWave.at)}s.`
                  : `School ${aliveFish} live. Final wave cap reached.`
                : `School ${aliveFish} live. Next fish joins in ${nextFishIn.toFixed(1)}s.`,
          },
        },
        tank: this.state.tank,
        fish: this.state.fish.filter((fish) => fish.alive).map((fish) => ({
          x: fish.x,
          y: fish.y,
          facing: fish.facing,
          scale: 1,
          color: fish.type.color,
          finColor: fish.type.finColor,
          hungry: fish.hunger > 0.7,
        })),
        food: this.state.food.filter((item) => item.alive !== false).map((item) => ({ ...item })),
        coins: this.state.coins.filter((item) => item.alive !== false).map((item) => ({ ...item })),
        eggs: this.state.eggs.map((egg) => ({ ...egg })),
        aliens: this.state.aliens.filter((alien) => alien.alive !== false).map((alien) => ({ ...alien })),
        shots: this.state.shots.filter((shot) => shot.alive !== false).map((shot) => ({ ...shot })),
        overlayTitle: this.state.overlay.title,
        overlayCopy: this.state.overlay.copy,
        overlayEyebrow: this.state.overlay.eyebrow,
        overlayButton: this.state.overlay.button,
        cursor: this.state.cursor,
      };
    }

    clamp01(value) {
      return Math.max(0, Math.min(1, value));
    }

    toTankX(pixelX) {
      const tank = this.state.tank;
      return this.clamp01((pixelX - tank.x) / Math.max(1, tank.width));
    }

    toTankY(pixelY) {
      const tank = this.state.tank;
      return this.clamp01((pixelY - tank.y) / Math.max(1, tank.height));
    }
  }

  const SKY_TOP = "#071620";
  const SKY_BOTTOM = "#0d3348";
  const SAND = "#b89d63";

  function renderGame(ctx, frameState, viewport) {
    const width = viewport.width;
    const height = viewport.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawBackdrop(ctx, width, height, frameState);
    drawAquarium(ctx, width, height, frameState);
    drawEntities(ctx, frameState, width, height);
    drawHudOverlay(ctx, frameState, width, height);
  }

  function drawBackdrop(ctx, width, height, frameState) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(0.55, SKY_BOTTOM);
    sky.addColorStop(1, "#051019");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const water = ctx.createLinearGradient(0, height * 0.1, 0, height);
    water.addColorStop(0, "rgba(109, 226, 255, 0.20)");
    water.addColorStop(1, "rgba(9, 29, 39, 0.64)");
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let i = 0; i < 24; i += 1) {
      const x = (i * 97 + (frameState.time || 0) * 12) % (width + 140) - 70;
      const y = 40 + (i % 6) * 58;
      ctx.beginPath();
      ctx.ellipse(x, y, 18, 7, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAquarium(ctx, width, height, frameState) {
    const tank = getTank(frameState, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.strokeStyle = "rgba(180, 240, 255, 0.28)";
    ctx.lineWidth = Math.max(2, Math.round(width * 0.002));
    roundRect(ctx, tank.x, tank.y, tank.w, tank.h, 26);
    ctx.fill();
    ctx.stroke();

    const water = ctx.createLinearGradient(0, tank.y, 0, tank.y + tank.h);
    water.addColorStop(0, "rgba(104, 219, 255, 0.22)");
    water.addColorStop(1, "rgba(7, 32, 47, 0.68)");
    ctx.fillStyle = water;
    roundRect(ctx, tank.x + 8, tank.y + 8, tank.w - 16, tank.h - 16, 20);
    ctx.fill();

    ctx.fillStyle = SAND;
    ctx.fillRect(tank.x + 18, tank.y + tank.h - 88, tank.w - 36, 68);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (let i = 0; i < 16; i += 1) {
      const x = tank.x + 24 + i * ((tank.w - 48) / 16);
      ctx.fillRect(x, tank.y + tank.h - 98, 5, 10);
    }
  }

  function drawEntities(ctx, frameState, width, height) {
    const tank = getTank(frameState, width, height);
    for (const item of frameState.food || []) drawPellet(ctx, tank.x + item.x * tank.w, tank.y + item.y * tank.h, item.radius || 8, "#ffd86a");
    for (const coin of frameState.coins || []) drawCoin(ctx, tank.x + coin.x * tank.w, tank.y + coin.y * tank.h, coin);
    for (const shot of frameState.shots || []) drawShot(ctx, tank.x + shot.x * tank.w, tank.y + shot.y * tank.h, shot);
    for (const fish of frameState.fish || []) drawFish(ctx, tank, fish);
    for (const alien of frameState.aliens || []) drawAlien(ctx, tank, alien);
    for (const egg of frameState.eggs || []) drawEgg(ctx, tank, egg);
    drawCursor(ctx, frameState.cursor, tank);
    drawThreatWarning(ctx, frameState, tank);
  }

  function drawPellet(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCoin(ctx, x, y, coin) {
    const radius = 10 + (coin.value || 1) * 2;
    ctx.fillStyle = "#ffe27a";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(140, 88, 12, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(104, 65, 6, 0.9)";
    ctx.font = "700 12px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", x, y + 1);
  }

  function drawShot(ctx, x, y, shot) {
    ctx.fillStyle = "#fff9df";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 241, 184, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - (shot.vx || 0) * 22, y - (shot.vy || 0) * 22);
    ctx.stroke();
  }

  function drawFish(ctx, tank, fish) {
    const x = tank.x + tank.w * fish.x;
    const y = tank.y + tank.h * fish.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(fish.facing || 1, 1);
    ctx.fillStyle = fish.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 29, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff4dd";
    ctx.beginPath();
    ctx.arc(14, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2c1f17";
    ctx.beginPath();
    ctx.arc(16, -4, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fish.finColor;
    ctx.beginPath();
    ctx.moveTo(-32, 0);
    ctx.lineTo(-46, -14);
    ctx.lineTo(-46, 14);
    ctx.closePath();
    ctx.fill();
    if (fish.hungry) {
      ctx.strokeStyle = "rgba(255, 214, 102, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -34, 14, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAlien(ctx, tank, alien) {
    const x = tank.x + tank.w * alien.x;
    const y = tank.y + tank.h * alien.y;
    const pulse = 0.5 + Math.sin((alien.phase || 0) * 6) * 0.5;
    ctx.fillStyle = "rgba(120, 255, 164, 0.16)";
    ctx.beginPath();
    ctx.arc(x, y, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = alien.color;
    ctx.beginPath();
    ctx.ellipse(x, y, 28, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#102019";
    ctx.fillRect(x - 14, y - 2, 10, 4);
    ctx.fillRect(x + 4, y - 2, 10, 4);
    ctx.strokeStyle = "rgba(255, 82, 82, " + (0.35 + pulse * 0.45) + ")";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 48, y - 46);
    ctx.lineTo(x - 12, y - 16);
    ctx.lineTo(x + 20, y - 16);
    ctx.stroke();
  }

  function drawEgg(ctx, tank, egg) {
    const x = tank.x + tank.w * egg.x;
    const y = tank.y + tank.h * egg.y;
    const pulse = 1 + Math.sin((egg.pulse || 0) * 4) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#f4f2ff";
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(122, 224, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawCursor(ctx, cursor, tank) {
    if (!cursor || cursor.x == null || cursor.y == null) return;
    ctx.strokeStyle = cursor.active ? "rgba(255, 232, 165, 0.95)" : "rgba(255, 232, 165, 0.38)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tank.x + cursor.x * tank.w, tank.y + cursor.y * tank.h, cursor.radius || 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawThreatWarning(ctx, frameState, tank) {
    if (!(frameState.aliens || []).length || !frameState.warning) return;
    const alien = frameState.aliens[0];
    const x = tank.x + tank.w * alien.x;
    const y = tank.y + tank.h * Math.max(0.08, alien.y - 0.12);
    ctx.fillStyle = "rgba(255, 84, 84, 0.92)";
    ctx.font = "700 13px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(frameState.warning, x, y);
    ctx.strokeStyle = "rgba(255, 84, 84, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(tank.x + tank.w * alien.x, tank.y + tank.h * alien.y - 18);
    ctx.stroke();
  }

  function drawHudOverlay(ctx, frameState, width, height) {
    if (frameState.state === "playing") return;
    ctx.fillStyle = "rgba(4, 10, 14, 0.46)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#f8fdff";
    ctx.font = "700 28px Georgia, serif";
    ctx.fillText(frameState.overlayTitle || "Insaniquarium Tide", 40, height * 0.78);
    ctx.font = "500 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(240, 248, 252, 0.82)";
    ctx.fillText(frameState.overlayCopy || "Press Start to begin.", 40, height * 0.78 + 28);
  }

  function getTank(frameState, width, height) {
    const tank = frameState.tank || {};
    const w = tank.width || width * 0.72;
    const h = tank.height || height * 0.68;
    return { x: tank.x || (width - w) * 0.5, y: tank.y || height * 0.18, w, h };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  const canvas = document.getElementById("game-canvas");
  const overlayPanel = document.getElementById("overlay-panel");
  const overlayEyebrow = document.getElementById("overlay-eyebrow");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayCopy = document.getElementById("overlay-copy");
  const overlayButton = document.getElementById("overlay-button");
  const hudSun = document.getElementById("hud-sun");
  const hudFish = document.getElementById("hud-fish");
  const hudThreat = document.getElementById("hud-threat");
  const hudGoal = document.getElementById("hud-goal");
  const hudTip = document.getElementById("hud-tip");
  const coachPanel = document.getElementById("coach-panel");
  const coachFeed = document.getElementById("coach-feed");
  const coachCollect = document.getElementById("coach-collect");
  const coachGoal = document.getElementById("coach-goal");
  const coachSchool = document.getElementById("coach-school");
  const ctx = canvas.getContext("2d");
  const game = new Game();
  let lastTime = performance.now();

  function resizeCanvas() {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    game.resize(width, height);
  }

  function pointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
  }

  function syncHud(frameState) {
    hudSun.textContent = String(Math.max(0, Math.round(frameState.sun || 0)));
    hudFish.textContent = String(Math.max(0, Math.round(frameState.fishCount || 0)));
    hudThreat.textContent = String(frameState.threat || "Calm");
    if (hudGoal) {
      hudGoal.textContent = String(frameState.goalText || "Egg 0 / 100");
    }
    hudTip.textContent = frameState.hint || "Keep the next attack in view and react before it reaches the tank.";
    const coach = frameState.coach || {};
    if (coachPanel) {
      coachPanel.hidden = !coach.visible;
    }
    if (coachFeed) {
      coachFeed.textContent = coach.feed?.text || "Click water to drop food for fish.";
      coachFeed.dataset.complete = coach.feed?.complete ? "true" : "false";
    }
    if (coachCollect) {
      coachCollect.textContent = coach.collect?.text || "Sweep through coins to collect money.";
      coachCollect.dataset.complete = coach.collect?.complete ? "true" : "false";
    }
    if (coachGoal) {
      coachGoal.textContent = coach.goal?.text || "Win at Egg 100. Lose at 0 fish.";
      coachGoal.dataset.complete = coach.goal?.complete ? "true" : "false";
    }
    if (coachSchool) {
      coachSchool.textContent = coach.school?.text || "School 0 live.";
      coachSchool.dataset.complete = coach.school?.complete ? "true" : "false";
    }
    overlayPanel.hidden = frameState.state === "playing";
    overlayEyebrow.textContent = frameState.overlayEyebrow || "Tank start";
    overlayTitle.textContent = frameState.overlayTitle || "Insaniquarium Tide";
    overlayCopy.textContent = frameState.overlayCopy || "Feed the tank, watch the warning line, and restart fast when the aliens win.";
    overlayButton.textContent = frameState.overlayButton || (frameState.state === "menu" ? "Start" : "Restart");
  }

  function step(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    game.update(dt);
    const frameState = game.getFrameState();
    renderGame(ctx, frameState, { width: canvas.width, height: canvas.height });
    syncHud(frameState);
    requestAnimationFrame(step);
  }

  canvas.addEventListener("pointermove", function (event) {
    const pos = pointerFromEvent(event);
    game.handlePointerMove({ type: "pointermove", x: pos.x, y: pos.y });
  });
  canvas.addEventListener("pointerdown", function (event) {
    const pos = pointerFromEvent(event);
    game.handlePointer({ type: "pointerdown", x: pos.x, y: pos.y });
  });
  canvas.addEventListener("pointerup", function (event) {
    const pos = pointerFromEvent(event);
    game.handlePointer({ type: "pointerup", x: pos.x, y: pos.y });
  });

  overlayButton.addEventListener("click", function () {
    const state = game.getFrameState().state;
    if (state === "menu") {
      game.start();
      return;
    }
    if (state === "win" || state === "lose") {
      game.restart();
      game.start();
    }
  });

  window.addEventListener("keydown", function (event) {
    if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();
      overlayButton.click();
    }
  });
  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  syncHud(game.getFrameState());
  requestAnimationFrame(step);
})();
