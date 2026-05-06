(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const hudScore = document.getElementById("hudScore");
  const hudLives = document.getElementById("hudLives");
  const hudCharge = document.getElementById("hudCharge");
  const hudPhase = document.getElementById("hudPhase");
  const hudHint = document.getElementById("hudHint");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const STAGE_LENGTH = 14200;
  const BOSS_X = 13400;
  const SCROLL_SPEED = 196;
  const keys = new Set();

  const ZONES = [
    {
      start: 0,
      label: "Ingress",
      message: "Scout drones probe the trench mouth. Build charge before the first organ gates.",
      sky: "#07131d",
      wall: "#102734",
      glow: "rgba(110, 230, 212, 0.16)",
    },
    {
      start: 3600,
      label: "Spore Reef",
      message: "Spore vents now rake the lane. Pre-position before each pulse instead of reacting late.",
      sky: "#08121a",
      wall: "#193229",
      glow: "rgba(167, 238, 124, 0.14)",
    },
    {
      start: 7600,
      label: "Muscle Weave",
      message: "Striker organisms bend toward you. Hold center longer, then break hard when they commit.",
      sky: "#11101c",
      wall: "#2d2135",
      glow: "rgba(255, 125, 113, 0.12)",
    },
    {
      start: 11200,
      label: "Hive Gate",
      message: "The trench locks down near the hive. Bank a full blast for the core windows.",
      sky: "#170d14",
      wall: "#3b1d29",
      glow: "rgba(255, 211, 106, 0.14)",
    },
  ];

  const spawnPlan = [
    { x: 600, type: "drone", y: 170 },
    { x: 900, type: "drone", y: 370 },
    { x: 1280, type: "turret", yBias: "top" },
    { x: 1820, type: "mine", y: 300 },
    { x: 2120, type: "drone", y: 330 },
    { x: 2400, type: "turret", yBias: "bottom" },
    { x: 2740, type: "pod", y: 290 },
    { x: 3060, type: "mine", y: 190 },
    { x: 3380, type: "drone", y: 160 },
    { x: 3700, type: "pod", y: 350 },
    { x: 4020, type: "turret", yBias: "top" },
    { x: 4350, type: "striker", y: 220 },
    { x: 4680, type: "mine", y: 260 },
    { x: 5010, type: "pod", y: 250 },
    { x: 5340, type: "turret", yBias: "bottom" },
    { x: 6000, type: "striker", y: 180 },
    { x: 6320, type: "pod", y: 300 },
    { x: 6660, type: "mine", y: 210 },
    { x: 7000, type: "turret", yBias: "top" },
    { x: 7340, type: "drone", y: 260 },
    { x: 7700, type: "striker", y: 220 },
    { x: 8400, type: "turret", yBias: "bottom" },
    { x: 8740, type: "mine", y: 320 },
    { x: 9080, type: "drone", y: 190 },
    { x: 9440, type: "striker", y: 340 },
    { x: 9780, type: "pod", y: 260 },
    { x: 10140, type: "turret", yBias: "top" },
    { x: 10820, type: "striker", y: 180 },
    { x: 11160, type: "pod", y: 320 },
    { x: 11510, type: "turret", yBias: "bottom" },
    { x: 11860, type: "drone", y: 210 },
    { x: 12180, type: "mine", y: 300 },
    { x: 12480, type: "striker", y: 250 },
    { x: 12790, type: "turret", yBias: "top" },
    { x: 13060, type: "pod", y: 280 },
  ];

  const ventPlan = [
    { x: 3900, side: "top" },
    { x: 4480, side: "bottom" },
    { x: 5480, side: "top" },
    { x: 6920, side: "bottom" },
    { x: 8200, side: "top" },
    { x: 9360, side: "bottom" },
    { x: 10880, side: "top" },
    { x: 11980, side: "bottom" },
  ];

  const cachePlan = [
    { x: 1680, side: "bottom", kind: "charge" },
    { x: 4580, side: "top", kind: "repair" },
    { x: 7160, side: "bottom", kind: "charge" },
    { x: 9620, side: "top", kind: "repair" },
    { x: 11780, side: "bottom", kind: "charge" },
  ];

  let game;

  function terrainTop(worldX) {
    const zoneLift = worldX > 7600 ? 18 : 0;
    const reef = worldX > 3600 && worldX < 7600 ? Math.sin(worldX * 0.017) * 16 : 0;
    const muscle = worldX > 7600 ? Math.sin(worldX * 0.022) * 18 : 0;
    const ridge =
      82 +
      Math.sin(worldX * 0.0048) * 34 +
      Math.sin(worldX * 0.011) * 18 +
      Math.max(0, Math.sin((worldX - 1600) * 0.0026)) * 50 +
      reef +
      muscle +
      zoneLift;
    return ridge;
  }

  function terrainBottom(worldX) {
    const reef = worldX > 3600 && worldX < 7600 ? Math.sin(worldX * 0.015 + 0.7) * 18 : 0;
    const muscle = worldX > 7600 ? Math.sin(worldX * 0.021 + 0.8) * 22 : 0;
    const trench =
      460 -
      Math.sin(worldX * 0.0054 + 1.1) * 42 -
      Math.sin(worldX * 0.013 + 0.9) * 20 -
      Math.max(0, Math.sin((worldX - 2500) * 0.0021)) * 62 -
      reef -
      muscle;
    return trench;
  }

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

  function circleHit(box, shot) {
    const nx = clamp(shot.x, box.x, box.x + box.w);
    const ny = clamp(shot.y, box.y, box.y + box.h);
    const dx = shot.x - nx;
    const dy = shot.y - ny;
    return dx * dx + dy * dy <= shot.r * shot.r;
  }

  function enemyHitBox(enemy) {
    return {
      x: enemy.x - enemy.w / 2,
      y: enemy.y - enemy.h / 2,
      w: enemy.w,
      h: enemy.h,
    };
  }

  function cacheHitBox(cache) {
    const x = cache.worldX - game.stageX;
    const y = cache.side === "top" ? terrainTop(cache.worldX) + 28 : terrainBottom(cache.worldX) - 28;
    return {
      x: x - 18,
      y: y - 18,
      w: 36,
      h: 36,
      centerX: x,
      centerY: y,
    };
  }

  function getZoneIndex(stageX) {
    let index = 0;
    for (let i = 0; i < ZONES.length; i += 1) {
      if (stageX >= ZONES[i].start) {
        index = i;
      }
    }
    return index;
  }

  function currentZone() {
    return ZONES[game.zoneIndex];
  }

  function makeState() {
    return {
      mode: "title",
      score: 0,
      stageX: 0,
      timer: 0,
      lives: 3,
      invuln: 0,
      fireCooldown: 0,
      charge: 0,
      charging: false,
      message: "Hold Space to route a blast through the first pinch.",
      player: {
        x: 180,
        y: HEIGHT / 2,
        w: 32,
        h: 18,
        speed: 290,
      },
      shots: [],
      enemies: [],
      enemyShots: [],
      vents: [],
      caches: [],
      pickups: [],
      particles: [],
      boss: null,
      spawnIndex: 0,
      ventIndex: 0,
      cacheIndex: 0,
      flash: 0,
      zoneIndex: 0,
      seenZones: new Set([0]),
    };
  }

  function startRun() {
    game = makeState();
    game.mode = "play";
    updateHud();
  }

  function releaseCharge() {
    if (game.mode !== "play" || game.charge <= 0.12) {
      game.charging = false;
      return;
    }
    const power = clamp(game.charge, 0.2, 1);
    game.shots.push({
      x: game.player.x + 22,
      y: game.player.y,
      vx: 560 + power * 200,
      vy: 0,
      r: 10 + power * 14,
      damage: 3 + power * 8,
      color: power > 0.8 ? "#ffd36a" : "#6ee6d4",
      life: 1.8,
      blast: true,
      pierce: power > 0.75 ? 2 : 1,
    });
    game.message =
      power > 0.8
        ? "Full charge pierces armor. Save it for stacked threats or the open core."
        : "Partial charge buys room. Build full charge before the hive core opens.";
    game.flash = 0.18;
    game.charge = 0;
    game.charging = false;
    updateHud();
  }

  function createBurst(x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) {
      const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.3;
      const speed = 50 + Math.random() * 160;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  function spawnEnemy(def) {
    const screenX = WIDTH + 50;
    if (def.type === "drone") {
      game.enemies.push({
        type: "drone",
        x: screenX,
        y: def.y,
        w: 26,
        h: 18,
        hp: 4,
        score: 70,
        speed: 220,
        seed: def.x * 0.01,
      });
      return;
    }
    if (def.type === "pod") {
      game.enemies.push({
        type: "pod",
        x: screenX,
        y: def.y,
        w: 34,
        h: 28,
        hp: 10,
        score: 130,
        speed: 185,
        cooldown: 1.1,
      });
      return;
    }
    if (def.type === "mine") {
      game.enemies.push({
        type: "mine",
        x: screenX,
        y: def.y,
        w: 22,
        h: 22,
        hp: 7,
        score: 120,
        speed: 175,
        seed: def.x * 0.02,
        cooldown: 0.8,
      });
      return;
    }
    if (def.type === "striker") {
      game.enemies.push({
        type: "striker",
        x: screenX,
        y: def.y,
        w: 38,
        h: 20,
        hp: 12,
        score: 190,
        speed: 240,
        cooldown: 1,
        drift: 0,
        seed: def.x * 0.013,
      });
      return;
    }
    const mountX = game.stageX + WIDTH + 20;
    const top = terrainTop(mountX);
    const bottom = terrainBottom(mountX);
    const turretY = def.yBias === "top" ? top + 24 : bottom - 24;
    game.enemies.push({
      type: "turret",
      x: screenX,
      y: turretY,
      w: 28,
      h: 28,
      hp: 14,
      score: 180,
      speed: 210,
      side: def.yBias,
      cooldown: 0.65,
    });
  }

  function spawnVent(def) {
    game.vents.push({
      worldX: def.x,
      side: def.side,
      cooldown: 0.2,
      phase: 0,
    });
  }

  function spawnCache(def) {
    game.caches.push({
      worldX: def.x,
      side: def.side,
      kind: def.kind,
      hp: 8,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  function spawnPickup(x, y, kind) {
    game.pickups.push({
      x,
      y,
      vx: -110,
      vy: kind === "repair" ? -12 : 10,
      kind,
      life: 6,
      bob: Math.random() * Math.PI * 2,
    });
  }

  function spawnBoss() {
    game.boss = {
      x: WIDTH + 140,
      y: HEIGHT / 2,
      w: 220,
      h: 220,
      hp: 230,
      maxHp: 230,
      phase: 1,
      pulse: 0,
      salvo: 0,
      beam: 1.6,
      spawn: 2.2,
      coreOpen: false,
      lastPhase: 1,
    };
    game.message = "Hive gate breached. Break the eyes, survive the escorts, then punish the open core.";
  }

  function updateHud() {
    hudScore.textContent = String(game.score);
    hudLives.textContent = String(game.lives);
    hudCharge.textContent = `${Math.round(game.charge * 100)}%`;
    const phase =
      game.mode === "title"
        ? "Standby"
        : game.boss
          ? game.boss.coreOpen
            ? "Core Open"
            : `Boss P${game.boss.phase}`
          : currentZone().label;
    hudPhase.textContent = phase;
    hudHint.textContent = game.message;
  }

  function firePrimary() {
    if (game.fireCooldown > 0 || game.mode !== "play") {
      return;
    }
    game.fireCooldown = 0.12;
    game.shots.push({
      x: game.player.x + 16,
      y: game.player.y,
      vx: 720,
      vy: 0,
      r: 4,
      damage: 2,
      color: "#c6fff7",
      life: 0.95,
      blast: false,
      pierce: 1,
    });
  }

  function fireEnemyShot(x, y, vx, vy, r, life, extras = {}) {
    game.enemyShots.push({
      x,
      y,
      vx,
      vy,
      r,
      life,
      ...extras,
    });
  }

  function mineBurst(enemy) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (-Math.PI * 0.8) + (Math.PI * 1.6 * i) / 7;
      fireEnemyShot(enemy.x, enemy.y, Math.cos(angle) * 170, Math.sin(angle) * 170, 4, 2.8);
    }
  }

  function destroyEnemy(enemy) {
    if (enemy.dead) {
      return;
    }
    enemy.dead = true;
    createBurst(enemy.x, enemy.y, enemy.type === "striker" ? "#ffd36a" : "#6ee6d4", 12);
    if (enemy.type === "mine") {
      mineBurst(enemy);
    }
    game.score += enemy.score;
  }

  function destroyCache(cache, hitBox) {
    if (cache.dead) {
      return;
    }
    cache.dead = true;
    createBurst(hitBox.centerX, hitBox.centerY, cache.kind === "repair" ? "#ff9b8f" : "#6ee6d4", 10);
    spawnPickup(hitBox.centerX, hitBox.centerY, cache.kind);
    game.score += 90;
    game.message =
      cache.kind === "repair"
        ? "Repair sac ruptured. Catch the med-core before the trench closes it off."
        : "Charge gland cracked. Grab the capacitor to bank a near-full blast.";
  }

  function damageBoss(amount, shot) {
    const boss = game.boss;
    if (!boss) {
      return;
    }
    boss.hp = Math.max(0, boss.hp - amount);
    createBurst(shot.x, shot.y, shot.color, shot.blast ? 12 : 5);
    game.score += boss.coreOpen ? 24 : 12;
    shot.pierce -= 1;
    if (shot.pierce <= 0) {
      shot.life = 0;
    }
  }

  function damageEnemy(enemy, shot) {
    enemy.hp -= shot.damage;
    createBurst(shot.x, shot.y, shot.color, shot.blast ? 10 : 4);
    shot.pierce -= 1;
    if (shot.pierce <= 0) {
      shot.life = 0;
    }
    if (enemy.hp <= 0) {
      destroyEnemy(enemy);
    }
  }

  function dealPlayerHit() {
    if (game.invuln > 0 || game.mode !== "play") {
      return;
    }
    game.lives -= 1;
    game.invuln = 2;
    game.flash = 0.35;
    createBurst(game.player.x, game.player.y, "#ff7d71", 16);
    if (game.lives <= 0) {
      game.mode = "lose";
      game.message =
        "Biofront lost. Read the next terrain kink sooner and keep one full charge for the heavy pattern.";
    } else {
      game.message = "Hull rupture. Reset to center, recover charge, then respect the next pattern swing.";
    }
    updateHud();
  }

  function collectPickup(pickup) {
    pickup.life = 0;
    if (pickup.kind === "repair") {
      const gainedLife = game.lives < 3;
      game.lives = Math.min(3, game.lives + 1);
      game.score += gainedLife ? 180 : 60;
      game.message = gainedLife
        ? "Repair core secured. One hull point restored."
        : "Repair core converted into score. Hull already full.";
    } else {
      game.charge = Math.max(game.charge, 0.82);
      game.score += 120;
      game.message = "Charge capacitor secured. Next release starts near full power.";
    }
    updateHud();
  }

  function syncZone() {
    const zoneIndex = getZoneIndex(game.stageX);
    if (zoneIndex !== game.zoneIndex) {
      game.zoneIndex = zoneIndex;
      if (!game.seenZones.has(zoneIndex)) {
        game.seenZones.add(zoneIndex);
        game.message = ZONES[zoneIndex].message;
      }
    }
  }

  function update(dt) {
    if (!game) {
      game = makeState();
      updateHud();
    }

    if (game.mode !== "play") {
      return;
    }

    game.timer += dt;
    game.stageX = Math.min(STAGE_LENGTH, game.stageX + SCROLL_SPEED * dt);
    game.fireCooldown = Math.max(0, game.fireCooldown - dt);
    game.invuln = Math.max(0, game.invuln - dt);
    game.flash = Math.max(0, game.flash - dt);
    syncZone();

    const moveY = (keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0);
    const moveX = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
    game.player.x = clamp(game.player.x + moveX * game.player.speed * dt, 110, 270);
    game.player.y += moveY * game.player.speed * dt;

    const topBound = terrainTop(game.stageX + game.player.x) + 18;
    const bottomBound = terrainBottom(game.stageX + game.player.x) - 18;
    game.player.y = clamp(game.player.y, topBound, bottomBound);

    if (keys.has("KeyZ")) {
      firePrimary();
    }

    if (game.charging) {
      game.charge = clamp(game.charge + dt * 0.7, 0, 1);
      if (game.charge > 0.98) {
        game.message = "Blast cannon primed. Release into armor, vents, or the core.";
      }
    }

    while (
      game.spawnIndex < spawnPlan.length &&
      game.stageX + WIDTH > spawnPlan[game.spawnIndex].x
    ) {
      spawnEnemy(spawnPlan[game.spawnIndex]);
      game.spawnIndex += 1;
    }

    while (
      game.ventIndex < ventPlan.length &&
      game.stageX + WIDTH > ventPlan[game.ventIndex].x
    ) {
      spawnVent(ventPlan[game.ventIndex]);
      game.ventIndex += 1;
    }

    while (
      game.cacheIndex < cachePlan.length &&
      game.stageX + WIDTH > cachePlan[game.cacheIndex].x
    ) {
      spawnCache(cachePlan[game.cacheIndex]);
      game.cacheIndex += 1;
    }

    if (!game.boss && game.stageX >= BOSS_X) {
      spawnBoss();
    }

    for (const shot of game.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
    }
    game.shots = game.shots.filter((shot) => shot.life > 0 && shot.x < WIDTH + 120);

    for (const shot of game.enemyShots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
    }
    game.enemyShots = game.enemyShots.filter(
      (shot) => shot.life > 0 && shot.x > -80 && shot.y > -60 && shot.y < HEIGHT + 60,
    );

    for (const vent of game.vents) {
      const screenX = vent.worldX - game.stageX;
      vent.phase += dt;
      vent.cooldown -= dt;
      if (screenX < WIDTH + 20 && screenX > 80 && vent.cooldown <= 0) {
        vent.cooldown = 1.45;
        const originY =
          vent.side === "top"
            ? terrainTop(vent.worldX) + 12
            : terrainBottom(vent.worldX) - 12;
        const baseVy = vent.side === "top" ? 110 : -110;
        for (let i = -1; i <= 1; i += 1) {
          fireEnemyShot(screenX, originY + i * 6, -220, baseVy + i * 48, 5, 2.7, {
            color: "#b9ef7a",
          });
        }
      }
    }
    game.vents = game.vents.filter((vent) => vent.worldX - game.stageX > -120);
    game.caches = game.caches.filter((cache) => cache.worldX - game.stageX > -120 && !cache.dead);

    for (const enemy of game.enemies) {
      enemy.x -= enemy.speed * dt;
      if (enemy.type === "drone") {
        enemy.y += Math.sin(game.timer * 3.5 + enemy.seed) * 42 * dt;
        if (enemy.x < WIDTH - 120 && Math.random() < dt * 0.85) {
          fireEnemyShot(
            enemy.x - 10,
            enemy.y,
            -260,
            Math.sin(enemy.seed + game.timer * 2) * 40,
            4,
            2.8,
          );
        }
      } else if (enemy.type === "pod") {
        enemy.cooldown -= dt;
        if (enemy.cooldown <= 0) {
          enemy.cooldown = 1.25;
          for (let i = -1; i <= 1; i += 1) {
            fireEnemyShot(enemy.x - 12, enemy.y + i * 8, -240, i * 70, 5, 3);
          }
        }
      } else if (enemy.type === "mine") {
        enemy.cooldown -= dt;
        enemy.y += Math.sin(game.timer * 2.8 + enemy.seed) * 28 * dt;
        if (enemy.cooldown <= 0 && enemy.x < WIDTH - 120) {
          enemy.cooldown = 1.8;
          for (let i = -1; i <= 1; i += 1) {
            fireEnemyShot(enemy.x - 8, enemy.y, -205, i * 92, 4, 2.4, { color: "#ffd36a" });
          }
        }
      } else if (enemy.type === "striker") {
        enemy.cooldown -= dt;
        const targetY = game.player.y + Math.sin(game.timer * 3 + enemy.seed) * 26;
        enemy.y += clamp(targetY - enemy.y, -90, 90) * dt * 1.4;
        if (enemy.x < WIDTH - 110 && enemy.cooldown <= 0) {
          enemy.cooldown = 1.05;
          const dx = game.player.x - enemy.x;
          const dy = game.player.y - enemy.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          fireEnemyShot(enemy.x - 12, enemy.y - 6, (dx / len) * 290, (dy / len) * 290, 5, 3.2);
          fireEnemyShot(enemy.x - 12, enemy.y + 6, (dx / len) * 250, (dy / len) * 250, 4, 3.1);
        }
      } else if (enemy.type === "turret") {
        const terrainY =
          enemy.side === "top"
            ? terrainTop(game.stageX + enemy.x) + 22
            : terrainBottom(game.stageX + enemy.x) - 22;
        enemy.y = terrainY;
        enemy.cooldown -= dt;
        if (enemy.cooldown <= 0 && enemy.x < WIDTH - 100) {
          enemy.cooldown = 1.25;
          const dx = game.player.x - enemy.x;
          const dy = game.player.y - enemy.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          fireEnemyShot(enemy.x - 10, enemy.y, (dx / len) * 300, (dy / len) * 300, 5, 3);
        }
      }
    }
    game.enemies = game.enemies.filter((enemy) => enemy.x > -100 && enemy.hp > 0 && !enemy.dead);

    for (const pickup of game.pickups) {
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt + Math.sin(game.timer * 5 + pickup.bob) * 10 * dt;
      pickup.life -= dt;
    }
    game.pickups = game.pickups.filter(
      (pickup) => pickup.life > 0 && pickup.x > -50 && pickup.x < WIDTH + 50 && pickup.y > -40 && pickup.y < HEIGHT + 40,
    );

    if (game.boss) {
      const boss = game.boss;
      boss.x = Math.max(WIDTH - 190, boss.x - 60 * dt);
      boss.y = HEIGHT / 2 + Math.sin(game.timer * 1.5) * 36;
      boss.pulse += dt;
      boss.salvo -= dt;
      boss.beam -= dt;
      boss.spawn -= dt;
      if (boss.hp < 155) {
        boss.phase = 2;
      }
      if (boss.hp < 78) {
        boss.phase = 3;
      }
      boss.coreOpen = Math.sin(boss.pulse * (boss.phase + 1.2)) > 0.18;

      if (boss.phase !== boss.lastPhase) {
        boss.lastPhase = boss.phase;
        game.message =
          boss.phase === 2
            ? "Hive pressure rising. Escorts now cover the core between pulses."
            : "Final rage pattern. Drift early, then counterpunch on the core flash.";
      }

      if (boss.salvo <= 0) {
        boss.salvo = Math.max(0.35, 1.1 - boss.phase * 0.16);
        for (let i = -boss.phase; i <= boss.phase; i += 1) {
          fireEnemyShot(boss.x - 90, boss.y + i * 16, -280, i * 38, 6, 4);
        }
      }
      if (boss.beam <= 0) {
        boss.beam = Math.max(1.15, 2 - boss.phase * 0.22);
        const dy = game.player.y - boss.y;
        fireEnemyShot(boss.x - 110, boss.y, -360, clamp(dy * 0.55, -160, 160), 9, 2.6, {
          beam: true,
        });
        game.message = boss.coreOpen
          ? "Core open. Slip under the beam line, then dump charge into the center."
          : "Eyes shut the core. Trim the spread and wait for the pulse.";
      }
      if (boss.spawn <= 0) {
        boss.spawn = Math.max(1.9, 2.9 - boss.phase * 0.35);
        const escortType = boss.phase >= 2 ? "striker" : "mine";
        spawnEnemy({ x: game.stageX + WIDTH + 80, type: escortType, y: clamp(boss.y, 150, 390) });
      }
      if (boss.hp <= 0) {
        createBurst(boss.x, boss.y, "#ffd36a", 42);
        game.score += 3200;
        game.mode = "win";
        game.message = "Biofront cleared. The longer trench held because each zone taught a new pressure read.";
      }
    }

    for (const shot of game.shots) {
      for (const cache of game.caches) {
        if (shot.life > 0) {
          const hitBox = cacheHitBox(cache);
          if (circleHit(hitBox, shot)) {
            cache.hp -= shot.damage;
            createBurst(shot.x, shot.y, shot.color, shot.blast ? 8 : 4);
            shot.pierce -= 1;
            if (shot.pierce <= 0) {
              shot.life = 0;
            }
            if (cache.hp <= 0) {
              destroyCache(cache, hitBox);
            }
          }
        }
      }
      for (const enemy of game.enemies) {
        if (shot.life > 0 && circleHit(enemyHitBox(enemy), shot)) {
          damageEnemy(enemy, shot);
        }
      }
      if (game.boss && shot.life > 0) {
        const boss = game.boss;
        const eyeTop = { x: boss.x - 80, y: boss.y - 56, w: 34, h: 30 };
        const eyeBottom = { x: boss.x - 80, y: boss.y + 26, w: 34, h: 30 };
        const core = { x: boss.x - 44, y: boss.y - 36, w: 64, h: 72 };
        if (circleHit(eyeTop, shot) || circleHit(eyeBottom, shot)) {
          damageBoss(shot.damage * 0.8, shot);
        } else if (boss.coreOpen && circleHit(core, shot)) {
          damageBoss(shot.damage * 1.45, shot);
        }
      }
    }

    const playerBox = {
      x: game.player.x - 18,
      y: game.player.y - 10,
      w: 36,
      h: 20,
    };

    for (const shot of game.enemyShots) {
      const shotBox = { x: shot.x - shot.r, y: shot.y - shot.r, w: shot.r * 2, h: shot.r * 2 };
      if (rectsOverlap(playerBox, shotBox)) {
        shot.life = 0;
        dealPlayerHit();
      }
    }

    for (const enemy of game.enemies) {
      const enemyBox = {
        x: enemy.x - enemy.w / 2,
        y: enemy.y - enemy.h / 2,
        w: enemy.w,
        h: enemy.h,
      };
      if (rectsOverlap(playerBox, enemyBox)) {
        enemy.hp = 0;
        destroyEnemy(enemy);
        dealPlayerHit();
      }
    }

    for (const pickup of game.pickups) {
      const pickupBox = { x: pickup.x - 12, y: pickup.y - 12, w: 24, h: 24 };
      if (rectsOverlap(playerBox, pickupBox)) {
        collectPickup(pickup);
      }
    }

    if (game.boss) {
      const bossBox = {
        x: game.boss.x - game.boss.w / 2,
        y: game.boss.y - game.boss.h / 2,
        w: game.boss.w,
        h: game.boss.h,
      };
      if (rectsOverlap(playerBox, bossBox)) {
        dealPlayerHit();
      }
    }

    if (game.player.y <= topBound + 1 || game.player.y >= bottomBound - 1) {
      dealPlayerHit();
    }

    for (const particle of game.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }
    game.particles = game.particles.filter((particle) => particle.life > 0);

    updateHud();
  }

  function drawTerrain() {
    const zone = currentZone();
    ctx.fillStyle = zone.sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = zone.glow;
    for (let i = 0; i < 6; i += 1) {
      const x = WIDTH - ((game.stageX * 0.4 + i * 180) % (WIDTH + 140));
      ctx.fillRect(x, 0, 18, HEIGHT);
    }

    ctx.fillStyle = zone.wall;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= WIDTH; x += 8) {
      ctx.lineTo(x, terrainTop(game.stageX + x));
    }
    ctx.lineTo(WIDTH, 0);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    for (let x = 0; x <= WIDTH; x += 8) {
      ctx.lineTo(x, terrainBottom(game.stageX + x));
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(110, 230, 212, 0.2)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += 12) {
      const y = terrainTop(game.stageX + x);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += 12) {
      const y = terrainBottom(game.stageX + x);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(game.player.x, game.player.y);
    if (game.invuln > 0 && Math.floor(game.timer * 18) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    ctx.fillStyle = "#c8fff8";
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6ee6d4";
    ctx.fillRect(-12, -4, 14, 8);

    if (game.charging) {
      ctx.strokeStyle = game.charge > 0.8 ? "#ffd36a" : "#6ee6d4";
      ctx.lineWidth = 2 + game.charge * 3;
      ctx.beginPath();
      ctx.arc(-8, 0, 10 + game.charge * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.type === "drone") {
      ctx.fillStyle = "#f48f7a";
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, -9);
      ctx.lineTo(14, 0);
      ctx.lineTo(10, 9);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.type === "pod") {
      ctx.fillStyle = "#cf7167";
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffd36a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -3);
      ctx.lineTo(8, 0);
      ctx.lineTo(-10, 3);
      ctx.stroke();
    } else if (enemy.type === "mine") {
      ctx.fillStyle = "#8fd26b";
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#dff8a7";
      ctx.beginPath();
      for (let i = 0; i < 4; i += 1) {
        const angle = (Math.PI / 2) * i;
        ctx.moveTo(Math.cos(angle) * 5, Math.sin(angle) * 5);
        ctx.lineTo(Math.cos(angle) * 14, Math.sin(angle) * 14);
      }
      ctx.stroke();
    } else if (enemy.type === "striker") {
      ctx.fillStyle = "#ffd36a";
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7a3329";
      ctx.fillRect(-8, -3, 10, 6);
    } else {
      ctx.fillStyle = "#b96259";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd36a";
      ctx.fillRect(-6, -3, 10, 6);
    }
    ctx.restore();
  }

  function drawVents() {
    for (const vent of game.vents) {
      const x = vent.worldX - game.stageX;
      const y =
        vent.side === "top"
          ? terrainTop(vent.worldX) + 6
          : terrainBottom(vent.worldX) - 6;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#8fd26b";
      ctx.beginPath();
      if (vent.side === "top") {
        ctx.moveTo(-18, -4);
        ctx.quadraticCurveTo(0, 24 + Math.sin(vent.phase * 4) * 3, 18, -4);
      } else {
        ctx.moveTo(-18, 4);
        ctx.quadraticCurveTo(0, -24 + Math.sin(vent.phase * 4) * 3, 18, 4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCaches() {
    for (const cache of game.caches) {
      const hitBox = cacheHitBox(cache);
      ctx.save();
      ctx.translate(hitBox.centerX, hitBox.centerY);
      ctx.fillStyle = cache.kind === "repair" ? "#cf7167" : "#6ee6d4";
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = cache.kind === "repair" ? "#ffd0ca" : "#d8fff8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (cache.side === "top") {
        ctx.moveTo(-4, -16);
        ctx.lineTo(0, -22);
        ctx.lineTo(4, -16);
      } else {
        ctx.moveTo(-4, 16);
        ctx.lineTo(0, 22);
        ctx.lineTo(4, 16);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(2, 8, 12, 0.42)";
      ctx.fillRect(-10, 16, 20, 4);
      ctx.fillStyle = cache.kind === "repair" ? "#ffb1a9" : "#ffd36a";
      ctx.fillRect(-10, 16, 20 * (cache.hp / 8), 4);
      ctx.restore();
    }
  }

  function drawPickups() {
    for (const pickup of game.pickups) {
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.fillStyle = pickup.kind === "repair" ? "#ff9b8f" : "#ffd36a";
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f5fff9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (pickup.kind === "repair") {
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 5);
      } else {
        ctx.moveTo(-4, -2);
        ctx.lineTo(0, -8);
        ctx.lineTo(4, -2);
        ctx.lineTo(0, 8);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBoss() {
    const boss = game.boss;
    if (!boss) {
      return;
    }
    ctx.save();
    ctx.translate(boss.x, boss.y);

    ctx.fillStyle = "#6d2e2c";
    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 92, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#9b544d";
    ctx.beginPath();
    ctx.ellipse(-24, 0, 74, 58, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = boss.coreOpen ? "#ffd36a" : "#3d1918";
    ctx.beginPath();
    ctx.ellipse(-10, 0, 28, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#cbe9e2";
    ctx.beginPath();
    ctx.arc(-68, -42, 16, 0, Math.PI * 2);
    ctx.arc(-68, 42, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0d1218";
    ctx.beginPath();
    ctx.arc(-68, -42, 8, 0, Math.PI * 2);
    ctx.arc(-68, 42, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 211, 106, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-100, -118, 160 * (boss.hp / boss.maxHp), 8);
    ctx.strokeRect(-100, -118, 160, 8);

    ctx.restore();
  }

  function drawOverlay(title, body) {
    ctx.fillStyle = "rgba(2, 8, 12, 0.72)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#d8f7ef";
    ctx.textAlign = "center";
    ctx.font = "bold 44px Trebuchet MS";
    ctx.fillText(title, WIDTH / 2, 170);
    ctx.font = "20px Trebuchet MS";
    const lines = body.split("\n");
    lines.forEach((line, index) => {
      ctx.fillText(line, WIDTH / 2, 240 + index * 32);
    });
  }

  function draw() {
    if (!game) {
      return;
    }

    drawTerrain();
    drawVents();
    drawCaches();

    for (const enemy of game.enemies) {
      drawEnemy(enemy);
    }

    for (const shot of game.shots) {
      ctx.fillStyle = shot.color;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const shot of game.enemyShots) {
      ctx.fillStyle = shot.color || (shot.beam ? "#ffd36a" : "#ff8d82");
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBoss();
    drawPickups();
    drawPlayer();

    for (const particle of game.particles) {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      ctx.globalAlpha = 1;
    }

    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${game.flash * 0.35})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    ctx.fillStyle = "rgba(216, 247, 239, 0.72)";
    ctx.font = "16px Trebuchet MS";
    const progress = Math.round((game.stageX / STAGE_LENGTH) * 100);
    ctx.fillText(`${currentZone().label} ${progress}%`, WIDTH - 160, 28);

    if (game.mode === "title") {
      drawOverlay(
        "R-Type Biofront",
        "Longer trench with shifting biomes.\nBreak glowing wall sacs for repair or charge pickups.\nPress Enter to deploy.",
      );
    } else if (game.mode === "win") {
      drawOverlay("Biofront Cleared", `${game.message}\nPress Enter to run it again.`);
    } else if (game.mode === "lose") {
      drawOverlay("Hull Lost", `${game.message}\nPress Enter to retry.`);
    }
  }

  let last = 0;
  function frame(timestamp) {
    const dt = Math.min(0.033, (timestamp - last) / 1000 || 0);
    last = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === "Enter") {
      if (!game || game.mode !== "play") {
        startRun();
      }
      return;
    }
    if (event.code === "Space") {
      if (!keys.has("Space") && game && game.mode === "play") {
        game.charging = true;
      }
      event.preventDefault();
    }
    keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
    if (event.code === "Space" && game && game.mode === "play") {
      releaseCharge();
    }
  });

  game = makeState();
  updateHud();
  requestAnimationFrame(frame);
})();
