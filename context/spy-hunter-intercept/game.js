(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    armor: document.getElementById("armor"),
    sector: document.getElementById("sector"),
    kills: document.getElementById("kills"),
    weapon: document.getElementById("weapon"),
    score: document.getElementById("score"),
    banner: document.getElementById("banner"),
    overlay: document.getElementById("overlay"),
    title: document.getElementById("title"),
    message: document.getElementById("message"),
  };

  const ROAD = {
    center: canvas.width * 0.5,
    width: 420,
    shoulder: 52,
  };

  const sectors = [
    { target: 12, name: "Convoy South", rate: 1 },
    { target: 18, name: "Convoy North", rate: 1.2 },
    { target: 1, name: "Command Truck", rate: 1.35 },
  ];

  const keys = new Set();

  const game = {
    mode: "menu",
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    mines: [],
    sparks: [],
    warnings: [],
    bannerTimer: 0,
    bannerText: "",
    roadOffset: 0,
    score: 0,
    sectorIndex: 0,
    sectorKills: 0,
    globalKills: 0,
    spawnTimer: 0,
    bossSpawned: false,
    supportVan: null,
    supportCooldown: 8,
    time: 0,
  };

  function resetGame() {
    game.mode = "menu";
    game.player = {
      x: ROAD.center,
      y: canvas.height - 110,
      w: 42,
      h: 78,
      speed: 305,
      fireCooldown: 0,
      armor: 100,
      weaponMode: "cannon",
      weaponTimer: 0,
      dockWindow: 0,
      hitFlash: 0,
    };
    game.bullets = [];
    game.enemyBullets = [];
    game.enemies = [];
    game.mines = [];
    game.sparks = [];
    game.warnings = [];
    game.bannerTimer = 0;
    game.bannerText = "";
    game.roadOffset = 0;
    game.score = 0;
    game.sectorIndex = 0;
    game.sectorKills = 0;
    game.globalKills = 0;
    game.spawnTimer = 1.2;
    game.bossSpawned = false;
    game.supportVan = null;
    game.supportCooldown = 6;
    game.time = 0;
    setBanner("Press Enter to start the intercept.");
    syncUi();
    showOverlay("Spy Hunter Intercept", "Break the convoy, dock with support vans for missile bursts, then stop the command truck.");
  }

  function startRun() {
    game.mode = "playing";
    game.spawnTimer = 0.6;
    game.bannerTimer = 2.4;
    game.bannerText = "Sector 1: Break Convoy South.";
    ui.overlay.classList.add("hidden");
  }

  function showOverlay(title, message) {
    ui.title.textContent = title;
    ui.message.textContent = message;
    ui.overlay.classList.remove("hidden");
  }

  function setBanner(text, duration) {
    game.bannerText = text;
    game.bannerTimer = duration || 2.5;
  }

  function roadBounds() {
    return {
      left: ROAD.center - ROAD.width * 0.5,
      right: ROAD.center + ROAD.width * 0.5,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rnd(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnWarning(x, type) {
    game.warnings.push({ x, y: -40, type, timer: 0.75 });
  }

  function spawnEnemy(kind) {
    const bounds = roadBounds();
    const x = rnd(bounds.left + 38, bounds.right - 38);
    spawnWarning(x, kind);
    const base = {
      x,
      y: -120,
      w: 44,
      h: 82,
      hp: 3,
      speed: 180,
      kind,
      sway: rnd(-1, 1),
      fireCooldown: rnd(1.1, 2.2),
      mineCooldown: rnd(1.8, 3.1),
      value: 120,
    };
    if (kind === "bike") {
      base.w = 28;
      base.h = 62;
      base.hp = 1;
      base.speed = 290;
      base.value = 90;
    } else if (kind === "gunner") {
      base.hp = 4;
      base.speed = 205;
      base.value = 170;
    } else if (kind === "miner") {
      base.hp = 5;
      base.speed = 170;
      base.value = 220;
    }
    game.enemies.push(base);
  }

  function spawnBoss() {
    if (game.bossSpawned) {
      return;
    }
    game.bossSpawned = true;
    spawnWarning(ROAD.center, "boss");
    game.enemies.push({
      kind: "boss",
      x: ROAD.center,
      y: -220,
      w: 126,
      h: 208,
      hp: 42,
      speed: 140,
      fireCooldown: 0.75,
      mineCooldown: 1.45,
      value: 2500,
    });
    setBanner("Command truck inbound. Break the escort and hit the cab.", 3.2);
  }

  function spawnSupportVan() {
    if (game.supportVan || game.supportCooldown > 0 || game.mode !== "playing") {
      return;
    }
    const bounds = roadBounds();
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? bounds.left - ROAD.shoulder * 0.5 : bounds.right + ROAD.shoulder * 0.5;
    game.supportVan = {
      x,
      y: canvas.height - 120,
      w: 48,
      h: 96,
      side,
      timer: 8,
    };
    setBanner("Support van nearby. Press Shift while aligned to dock.", 2.4);
  }

  function firePlayer() {
    if (game.player.fireCooldown > 0 || game.mode !== "playing") {
      return;
    }
    const missile = game.player.weaponMode === "missile";
    game.player.fireCooldown = missile ? 0.18 : 0.11;
    const spread = missile ? 10 : 6;
    game.bullets.push({
      x: game.player.x - spread,
      y: game.player.y - 18,
      vy: missile ? -620 : -760,
      r: missile ? 6 : 4,
      damage: missile ? 3 : 1,
      missile,
    });
    game.bullets.push({
      x: game.player.x + spread,
      y: game.player.y - 18,
      vy: missile ? -620 : -760,
      r: missile ? 6 : 4,
      damage: missile ? 3 : 1,
      missile,
    });
  }

  function fireEnemy(enemy) {
    game.enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.h * 0.42,
      vy: enemy.kind === "boss" ? 320 : 420,
      r: enemy.kind === "boss" ? 7 : 4,
      damage: enemy.kind === "boss" ? 10 : 8,
    });
  }

  function dropMine(enemy) {
    game.mines.push({
      x: enemy.x,
      y: enemy.y + enemy.h * 0.45,
      r: enemy.kind === "boss" ? 17 : 13,
      vy: 230,
      damage: enemy.kind === "boss" ? 15 : 12,
    });
  }

  function explode(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rnd(60, 260);
      game.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rnd(0.25, 0.7),
        color,
      });
    }
  }

  function damagePlayer(amount, message) {
    game.player.armor = Math.max(0, game.player.armor - amount);
    game.player.hitFlash = 0.18;
    explode(game.player.x, game.player.y, "#ff8f7a", 10);
    if (message) {
      setBanner(message, 1.6);
    }
    if (game.player.armor <= 0) {
      game.mode = "lose";
      showOverlay("Intercept Failed", "Your interceptor is wrecked. Press Enter to run the highway again.");
    }
  }

  function destroyEnemy(enemy) {
    if (enemy.dead) {
      return;
    }
    enemy.dead = true;
    game.score += enemy.value;
    if (enemy.kind === "boss") {
      game.sectorKills += 1;
      explode(enemy.x, enemy.y, "#ffd86b", 48);
      game.mode = "clear";
      showOverlay("Highway Secure", "The command truck is down and the convoy route is clear. Press Enter to rerun the mission.");
      return;
    }
    game.globalKills += 1;
    game.sectorKills += 1;
    explode(enemy.x, enemy.y, enemy.kind === "bike" ? "#8fd9ff" : "#ffc96d", 22);
    if (game.sectorIndex < 2 && game.sectorKills >= sectors[game.sectorIndex].target) {
      game.sectorIndex += 1;
      game.sectorKills = 0;
      setBanner("Sector cleared. Push north into the next convoy.", 2.8);
      if (game.sectorIndex === 2) {
        spawnBoss();
      }
    }
  }

  function dockSupportVan() {
    if (!game.supportVan || game.mode !== "playing") {
      return;
    }
    const van = game.supportVan;
    const dx = Math.abs(game.player.x - van.x);
    const dy = Math.abs(game.player.y - van.y);
    if (dx < 56 && dy < 76) {
      game.player.weaponMode = "missile";
      game.player.weaponTimer = 12;
      game.player.armor = Math.min(100, game.player.armor + 18);
      game.supportVan = null;
      game.supportCooldown = 16;
      setBanner("Missile rack loaded. Armor patched.", 2.8);
    } else {
      setBanner("Align with the support van before docking.", 1.4);
    }
  }

  function updatePlayer(dt) {
    const bounds = roadBounds();
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowLeft") || keys.has("a")) {
      dx -= 1;
    }
    if (keys.has("ArrowRight") || keys.has("d")) {
      dx += 1;
    }
    if (keys.has("ArrowUp") || keys.has("w")) {
      dy -= 1;
    }
    if (keys.has("ArrowDown") || keys.has("s")) {
      dy += 1;
    }
    const len = Math.hypot(dx, dy) || 1;
    game.player.x += (dx / len) * game.player.speed * dt;
    game.player.y += (dy / len) * game.player.speed * dt;
    game.player.x = clamp(game.player.x, bounds.left - 28, bounds.right + 28);
    game.player.y = clamp(game.player.y, 280, canvas.height - 56);

    if (keys.has(" ")) {
      firePlayer();
    }

    game.player.fireCooldown = Math.max(0, game.player.fireCooldown - dt);
    game.player.hitFlash = Math.max(0, game.player.hitFlash - dt);
    if (game.player.weaponTimer > 0) {
      game.player.weaponTimer -= dt;
      if (game.player.weaponTimer <= 0) {
        game.player.weaponMode = "cannon";
        setBanner("Missile rack spent. Cannon restored.", 1.8);
      }
    }
  }

  function updateEnemies(dt) {
    const bounds = roadBounds();
    for (const enemy of game.enemies) {
      if (enemy.dead) {
        continue;
      }
      if (enemy.kind === "bike") {
        enemy.y += (enemy.speed + 60) * dt;
        enemy.x += Math.sin(game.time * 4 + enemy.y * 0.02) * 90 * dt;
      } else if (enemy.kind === "boss") {
        enemy.y += enemy.y < 150 ? enemy.speed * dt : 0;
        enemy.x += Math.sin(game.time * 0.9) * 65 * dt;
        enemy.fireCooldown -= dt;
        enemy.mineCooldown -= dt;
        if (enemy.fireCooldown <= 0) {
          enemy.fireCooldown = 0.38;
          fireEnemy(enemy);
          game.enemyBullets.push({ x: enemy.x - 42, y: enemy.y + 20, vy: 360, r: 5, damage: 10 });
          game.enemyBullets.push({ x: enemy.x + 42, y: enemy.y + 20, vy: 360, r: 5, damage: 10 });
        }
        if (enemy.mineCooldown <= 0) {
          enemy.mineCooldown = 1.5;
          dropMine(enemy);
        }
      } else {
        enemy.y += enemy.speed * dt;
        enemy.x += Math.sin(game.time * 1.8 + enemy.sway * 8) * 70 * dt;
        enemy.fireCooldown -= dt;
        if (enemy.kind === "gunner" && enemy.fireCooldown <= 0 && enemy.y > -20) {
          enemy.fireCooldown = rnd(0.8, 1.6);
          fireEnemy(enemy);
        }
        if (enemy.kind === "miner") {
          enemy.mineCooldown -= dt;
          if (enemy.mineCooldown <= 0 && enemy.y > 80) {
            enemy.mineCooldown = rnd(1.8, 2.8);
            dropMine(enemy);
          }
        }
      }

      enemy.x = clamp(enemy.x, bounds.left + 24, bounds.right - 24);
      if (enemy.y > canvas.height + 140) {
        enemy.dead = true;
      }

      if (rectHit(game.player, enemy)) {
        destroyEnemy(enemy);
        damagePlayer(enemy.kind === "boss" ? 26 : 16, "Side impact.");
      }
    }
    game.enemies = game.enemies.filter((enemy) => !enemy.dead);
  }

  function rectHit(a, b) {
    return (
      Math.abs(a.x - b.x) * 2 < a.w + b.w &&
      Math.abs(a.y - b.y) * 2 < a.h + b.h
    );
  }

  function updateProjectiles(dt) {
    for (const bullet of game.bullets) {
      bullet.y += bullet.vy * dt;
      for (const enemy of game.enemies) {
        if (enemy.dead) {
          continue;
        }
        if (
          bullet.x > enemy.x - enemy.w * 0.5 &&
          bullet.x < enemy.x + enemy.w * 0.5 &&
          bullet.y > enemy.y - enemy.h * 0.5 &&
          bullet.y < enemy.y + enemy.h * 0.5
        ) {
          enemy.hp -= bullet.damage;
          bullet.hit = true;
          explode(bullet.x, bullet.y, bullet.missile ? "#ffd86b" : "#bce4ff", bullet.missile ? 10 : 6);
          if (enemy.hp <= 0) {
            destroyEnemy(enemy);
          }
          if (!bullet.missile) {
            break;
          }
        }
      }
    }
    for (const bullet of game.enemyBullets) {
      bullet.y += bullet.vy * dt;
      if (
        bullet.x > game.player.x - game.player.w * 0.5 &&
        bullet.x < game.player.x + game.player.w * 0.5 &&
        bullet.y > game.player.y - game.player.h * 0.5 &&
        bullet.y < game.player.y + game.player.h * 0.5
      ) {
        bullet.hit = true;
        damagePlayer(bullet.damage, "Enemy fire hit the cabin.");
      }
    }
    for (const mine of game.mines) {
      mine.y += mine.vy * dt;
      if (
        Math.abs(mine.x - game.player.x) < mine.r + game.player.w * 0.38 &&
        Math.abs(mine.y - game.player.y) < mine.r + game.player.h * 0.38
      ) {
        mine.hit = true;
        damagePlayer(mine.damage, "Mine impact.");
        explode(mine.x, mine.y, "#ff917f", 18);
      }
    }
    game.bullets = game.bullets.filter((bullet) => !bullet.hit && bullet.y > -40);
    game.enemyBullets = game.enemyBullets.filter((bullet) => !bullet.hit && bullet.y < canvas.height + 40);
    game.mines = game.mines.filter((mine) => !mine.hit && mine.y < canvas.height + 40);
  }

  function updateSupportVan(dt) {
    game.supportCooldown = Math.max(0, game.supportCooldown - dt);
    if (!game.supportVan && game.sectorIndex < 2) {
      spawnSupportVan();
    }
    if (!game.supportVan) {
      return;
    }
    game.supportVan.timer -= dt;
    if (game.supportVan.timer <= 0) {
      game.supportVan = null;
      game.supportCooldown = 10;
      return;
    }
    const targetY = canvas.height - 120;
    game.supportVan.y += (targetY - game.supportVan.y) * 2.2 * dt;
  }

  function updateEffects(dt) {
    for (const spark of game.sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= 0.98;
      spark.vy *= 0.98;
      spark.life -= dt;
    }
    for (const warning of game.warnings) {
      warning.timer -= dt;
      warning.y += 100 * dt;
    }
    game.sparks = game.sparks.filter((spark) => spark.life > 0);
    game.warnings = game.warnings.filter((warning) => warning.timer > 0);
    game.bannerTimer = Math.max(0, game.bannerTimer - dt);
  }

  function updateSpawns(dt) {
    if (game.sectorIndex >= 2) {
      return;
    }
    game.spawnTimer -= dt;
    if (game.spawnTimer > 0) {
      return;
    }
    const sector = sectors[game.sectorIndex];
    const roll = Math.random();
    if (roll < 0.36) {
      spawnEnemy("bike");
    } else if (roll < 0.76) {
      spawnEnemy("gunner");
    } else {
      spawnEnemy("miner");
    }
    game.spawnTimer = rnd(0.55, 1.1) / sector.rate;
  }

  function update(dt) {
    if (game.mode !== "playing") {
      syncUi();
      draw();
      return;
    }
    game.time += dt;
    game.roadOffset = (game.roadOffset + 420 * dt) % 80;
    updatePlayer(dt);
    updateSpawns(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateSupportVan(dt);
    updateEffects(dt);
    syncUi();
    draw();
  }

  function syncUi() {
    const sector = sectors[Math.min(game.sectorIndex, sectors.length - 1)];
    ui.armor.textContent = String(Math.max(0, Math.ceil(game.player.armor)));
    ui.sector.textContent = String(Math.min(game.sectorIndex + 1, 3));
    ui.kills.textContent = game.sectorIndex < 2
      ? `${game.sectorKills} / ${sector.target}`
      : `${Math.max(0, 42 - (game.enemies.find((enemy) => enemy.kind === "boss") || { hp: 0 }).hp)} / 42`;
    ui.weapon.textContent = game.player.weaponMode === "missile"
      ? `Missiles ${Math.ceil(game.player.weaponTimer)}s`
      : "Cannon";
    ui.score.textContent = String(game.score);
    ui.banner.textContent = game.bannerText;
    ui.banner.classList.toggle("show", game.bannerTimer > 0);
  }

  function drawRoad() {
    const bounds = roadBounds();
    ctx.fillStyle = "#345128";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#293522";
    ctx.fillRect(0, 0, bounds.left - ROAD.shoulder, canvas.height);
    ctx.fillRect(bounds.right + ROAD.shoulder, 0, canvas.width - (bounds.right + ROAD.shoulder), canvas.height);

    ctx.fillStyle = "#31363e";
    ctx.fillRect(bounds.left, 0, ROAD.width, canvas.height);

    ctx.fillStyle = "#636b76";
    ctx.fillRect(bounds.left - 8, 0, 8, canvas.height);
    ctx.fillRect(bounds.right, 0, 8, canvas.height);

    ctx.fillStyle = "#ffd86b";
    for (let y = -80 + game.roadOffset; y < canvas.height + 80; y += 80) {
      ctx.fillRect(ROAD.center - 6, y, 12, 40);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    for (let y = -60 + (game.roadOffset * 0.6); y < canvas.height + 60; y += 60) {
      ctx.beginPath();
      ctx.moveTo(bounds.left - 38, y);
      ctx.lineTo(bounds.left - 8, y + 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bounds.right + 8, y);
      ctx.lineTo(bounds.right + 38, y + 18);
      ctx.stroke();
    }
  }

  function drawVehicle(entity, palette) {
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.fillStyle = palette.shadow;
    ctx.fillRect(-entity.w * 0.42, -entity.h * 0.44, entity.w * 0.84, entity.h * 0.88);
    ctx.fillStyle = palette.body;
    ctx.fillRect(-entity.w * 0.34, -entity.h * 0.46, entity.w * 0.68, entity.h * 0.92);
    ctx.fillStyle = palette.cabin;
    ctx.fillRect(-entity.w * 0.22, -entity.h * 0.2, entity.w * 0.44, entity.h * 0.34);
    ctx.fillStyle = palette.trim;
    ctx.fillRect(-entity.w * 0.16, -entity.h * 0.4, entity.w * 0.32, entity.h * 0.14);
    ctx.fillRect(-entity.w * 0.16, entity.h * 0.24, entity.w * 0.32, entity.h * 0.12);
    ctx.restore();
  }

  function draw() {
    drawRoad();

    for (const warning of game.warnings) {
      ctx.save();
      ctx.translate(warning.x, warning.y);
      ctx.fillStyle = warning.type === "boss" ? "#ff796c" : "#ffd86b";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-18, -28);
      ctx.lineTo(18, -28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (game.supportVan) {
      drawVehicle(game.supportVan, {
        shadow: "#1f2430",
        body: "#cfd8e7",
        cabin: "#90c9ff",
        trim: "#ff796c",
      });
      ctx.strokeStyle = "#c2ecff";
      ctx.lineWidth = 2;
      ctx.strokeRect(game.supportVan.x - 34, game.supportVan.y - 64, 68, 128);
    }

    for (const enemy of game.enemies) {
      let palette = {
        shadow: "#1d2127",
        body: "#a34a4a",
        cabin: "#f0c0a6",
        trim: "#ffd86b",
      };
      if (enemy.kind === "bike") {
        palette = {
          shadow: "#1f2630",
          body: "#6ec3ff",
          cabin: "#dbf2ff",
          trim: "#cde56f",
        };
      } else if (enemy.kind === "miner") {
        palette = {
          shadow: "#2f2319",
          body: "#d58c41",
          cabin: "#ffe0aa",
          trim: "#ff796c",
        };
      } else if (enemy.kind === "boss") {
        palette = {
          shadow: "#251922",
          body: "#6f2434",
          cabin: "#b7dcff",
          trim: "#ffd86b",
        };
      }
      drawVehicle(enemy, palette);
      if (enemy.kind === "boss") {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(enemy.x - 80, enemy.y - 136, 160, 12);
        ctx.fillStyle = "#ff796c";
        ctx.fillRect(enemy.x - 78, enemy.y - 134, 156 * (enemy.hp / 42), 8);
      }
    }

    for (const bullet of game.bullets) {
      ctx.fillStyle = bullet.missile ? "#ffd86b" : "#d7efff";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const bullet of game.enemyBullets) {
      ctx.fillStyle = "#ff7f74";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const mine of game.mines) {
      ctx.fillStyle = "#231515";
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, mine.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff796c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, mine.r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const spark of game.sparks) {
      ctx.globalAlpha = Math.max(0, spark.life * 1.6);
      ctx.fillStyle = spark.color;
      ctx.fillRect(spark.x, spark.y, 3, 3);
      ctx.globalAlpha = 1;
    }

    drawVehicle(game.player, {
      shadow: "#0e1520",
      body: game.player.hitFlash > 0 ? "#ffb29a" : "#f7f9ff",
      cabin: "#9ad4ff",
      trim: game.player.weaponMode === "missile" ? "#ffd86b" : "#7ddf95",
    });

    if (game.player.weaponMode === "missile") {
      ctx.strokeStyle = "#ffd86b";
      ctx.lineWidth = 2;
      ctx.strokeRect(game.player.x - 30, game.player.y - 48, 60, 96);
    }
  }

  document.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.add(key);
    if (event.key === "Enter") {
      if (game.mode === "menu" || game.mode === "lose" || game.mode === "clear") {
        resetGame();
        startRun();
      }
    }
    if (event.key === "Shift") {
      dockSupportVan();
    }
    if (event.key === " ") {
      event.preventDefault();
      if (game.mode === "playing") {
        firePlayer();
      }
    }
    if (event.key.toLowerCase() === "r" && game.mode !== "playing") {
      resetGame();
    }
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  });

  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    requestAnimationFrame(frame);
  }

  resetGame();
  draw();
  requestAnimationFrame(frame);
}());
