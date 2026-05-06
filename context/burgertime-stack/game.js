(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const pepperEl = document.getElementById("pepper");
  const stacksEl = document.getElementById("stacks");
  const overlayEl = document.getElementById("overlay");
  const overlayKickerEl = document.getElementById("overlay-kicker");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlayBodyEl = document.getElementById("overlay-body");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const LEVELS = [112, 200, 290, 380, 474];
  const PLAYER_SPEED = 180;
  const CLIMB_SPEED = 155;
  const ENEMY_SPEED = 118;
  const STUN_TIME = 2.6;
  const MAX_PEPPER = 5;
  const RESPAWN_DELAY = 1.1;

  const platforms = [
    { x1: 70, x2: 890, y: LEVELS[0] },
    { x1: 120, x2: 840, y: LEVELS[1] },
    { x1: 70, x2: 890, y: LEVELS[2] },
    { x1: 120, x2: 840, y: LEVELS[3] },
    { x1: 90, x2: 870, y: LEVELS[4] },
  ];

  const ladders = [
    { x: 168, top: LEVELS[0], bottom: LEVELS[1] },
    { x: 332, top: LEVELS[0], bottom: LEVELS[1] },
    { x: 520, top: LEVELS[0], bottom: LEVELS[1] },
    { x: 734, top: LEVELS[0], bottom: LEVELS[1] },
    { x: 260, top: LEVELS[1], bottom: LEVELS[2] },
    { x: 442, top: LEVELS[1], bottom: LEVELS[2] },
    { x: 686, top: LEVELS[1], bottom: LEVELS[2] },
    { x: 160, top: LEVELS[2], bottom: LEVELS[3] },
    { x: 360, top: LEVELS[2], bottom: LEVELS[3] },
    { x: 596, top: LEVELS[2], bottom: LEVELS[3] },
    { x: 760, top: LEVELS[2], bottom: LEVELS[3] },
    { x: 246, top: LEVELS[3], bottom: LEVELS[4] },
    { x: 460, top: LEVELS[3], bottom: LEVELS[4] },
    { x: 692, top: LEVELS[3], bottom: LEVELS[4] },
  ];

  const burgerSetups = [
    { x: 150, layers: [0, 1, 2, 3] },
    { x: 396, layers: [0, 1, 2, 3] },
    { x: 642, layers: [0, 1, 2, 3] },
  ];

  const ingredientColors = ["#f0c879", "#7fd05f", "#9d4f2d", "#f5da79"];
  const ingredientNames = ["bun-top", "lettuce", "patty", "bun-bottom"];
  const enemyColors = ["#ff5f74", "#85e4ff", "#ffb347"];

  const state = {
    mode: "menu",
    score: 0,
    lives: 3,
    pepper: MAX_PEPPER,
    player: null,
    enemies: [],
    peppers: [],
    ingredients: [],
    crushedText: [],
    spawnTimer: 0,
    enemiesSpawned: 0,
    totalEnemies: 10,
    respawnTimer: 0,
    invulnTimer: 0,
    flashTimer: 0,
    placedCount: 0,
    lastTime: 0,
  };

  const input = {
    left: false,
    right: false,
    up: false,
    down: false,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function createPlayer() {
    return {
      x: 170,
      y: LEVELS[0],
      w: 26,
      h: 34,
      facing: 1,
      onLadder: false,
    };
  }

  function createEnemy(spawnIndex) {
    const lane = spawnIndex % LEVELS.length;
    const leftSpawn = spawnIndex % 2 === 0;
    return {
      x: leftSpawn ? platforms[lane].x1 + 34 : platforms[lane].x2 - 34,
      y: LEVELS[lane],
      w: 26,
      h: 30,
      vx: 0,
      onLadder: false,
      stun: 0,
      color: enemyColors[spawnIndex % enemyColors.length],
    };
  }

  function buildIngredients() {
    const ingredients = [];
    burgerSetups.forEach((stack, stackIndex) => {
      stack.layers.forEach((levelIndex, layerIndex) => {
        const width = 118;
        const segmentCount = 4;
        const segmentWidth = width / segmentCount;
        ingredients.push({
          stackIndex,
          layerIndex,
          name: ingredientNames[layerIndex],
          color: ingredientColors[layerIndex],
          width,
          x: stack.x,
          y: LEVELS[levelIndex] - 10,
          levelIndex,
          floorIndex: levelIndex,
          segmentWidth,
          segments: new Array(segmentCount).fill(false),
          dropProgress: 0,
          dropFromY: LEVELS[levelIndex] - 10,
          dropToY: LEVELS[levelIndex] - 10,
          falling: false,
          landed: false,
        });
      });
    });
    return ingredients;
  }

  function resetRun(mode) {
    state.mode = mode || "menu";
    state.score = 0;
    state.lives = 3;
    state.pepper = MAX_PEPPER;
    state.player = createPlayer();
    state.enemies = [];
    state.peppers = [];
    state.ingredients = buildIngredients();
    state.crushedText = [];
    state.spawnTimer = 1.5;
    state.enemiesSpawned = 0;
    state.totalEnemies = 10;
    state.respawnTimer = 0;
    state.invulnTimer = 0;
    state.flashTimer = 0;
    state.placedCount = 0;
    syncHud();
    syncOverlay();
  }

  function startGame() {
    if (state.mode === "playing") {
      return;
    }
    resetRun("playing");
  }

  function nearestLadder(entity, direction) {
    const options = ladders.filter((ladder) => {
      const inside = entity.y >= ladder.top - 4 && entity.y <= ladder.bottom + 4;
      if (!inside) {
        return false;
      }
      if (direction < 0) {
        return ladder.top < entity.y - 12;
      }
      if (direction > 0) {
        return ladder.bottom > entity.y + 12;
      }
      return true;
    });
    if (!options.length) {
      return null;
    }
    return options.reduce((best, ladder) => (
      Math.abs(ladder.x - entity.x) < Math.abs(best.x - entity.x) ? ladder : best
    ));
  }

  function platformAt(y) {
    return platforms.find((platform) => Math.abs(platform.y - y) < 6) || null;
  }

  function entityOnLadder(entity) {
    return ladders.find((ladder) => (
      Math.abs(entity.x - ladder.x) < 18 &&
      entity.y >= ladder.top - 4 &&
      entity.y <= ladder.bottom + 4
    )) || null;
  }

  function resolveHorizontal(entity, direction, dt) {
    const platform = platformAt(entity.y);
    if (!platform) {
      return;
    }
    entity.x += direction * PLAYER_SPEED * dt;
    entity.x = clamp(entity.x, platform.x1 + entity.w * 0.5, platform.x2 - entity.w * 0.5);
  }

  function updatePlayer(dt) {
    if (state.respawnTimer > 0) {
      return;
    }
    const player = state.player;
    const ladder = entityOnLadder(player);
    const horizontal = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const vertical = (input.up ? -1 : 0) + (input.down ? 1 : 0);

    if (horizontal !== 0) {
      player.facing = Math.sign(horizontal);
    }

    if (ladder && vertical !== 0) {
      player.onLadder = true;
      player.x += (ladder.x - player.x) * 0.36;
      player.y += vertical * CLIMB_SPEED * dt;
      player.y = clamp(player.y, ladder.top, ladder.bottom);
      const snapped = LEVELS.find((level) => Math.abs(level - player.y) < 4);
      if (snapped !== undefined) {
        player.y = snapped;
      }
    } else {
      player.onLadder = false;
      if (horizontal !== 0) {
        resolveHorizontal(player, horizontal, dt);
      }
      const nearbyLadder = entityOnLadder(player);
      if (!nearbyLadder) {
        const support = platformAt(player.y);
        if (support) {
          player.y = support.y;
        }
      }
    }

    state.peppers = state.peppers.filter((pepper) => {
      pepper.ttl -= dt;
      return pepper.ttl > 0;
    });
  }

  function maybeSpawnEnemy(dt) {
    if (state.enemiesSpawned >= state.totalEnemies || state.mode !== "playing") {
      return;
    }
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) {
      return;
    }
    state.enemies.push(createEnemy(state.enemiesSpawned));
    state.enemiesSpawned += 1;
    state.spawnTimer = state.enemiesSpawned < 4 ? 2.6 : 3.2;
  }

  function moveEnemy(enemy, dt) {
    const player = state.player;
    if (enemy.stun > 0) {
      enemy.stun -= dt;
      return;
    }
    const sameLevel = Math.abs(enemy.y - player.y) < 5;
    if (sameLevel) {
      const dir = Math.sign(player.x - enemy.x) || 1;
      enemy.x += dir * ENEMY_SPEED * dt;
      enemy.facing = dir;
      const support = platformAt(enemy.y);
      if (support) {
        enemy.x = clamp(enemy.x, support.x1 + enemy.w * 0.5, support.x2 - enemy.w * 0.5);
      }
      return;
    }

    const verticalDir = player.y < enemy.y ? -1 : 1;
    const ladder = entityOnLadder(enemy) || nearestLadder(enemy, verticalDir);
    if (!ladder) {
      const dir = Math.sign(player.x - enemy.x) || 1;
      enemy.x += dir * ENEMY_SPEED * dt * 0.7;
      return;
    }

    if (Math.abs(enemy.x - ladder.x) > 6) {
      const dir = Math.sign(ladder.x - enemy.x);
      enemy.x += dir * ENEMY_SPEED * dt;
      enemy.facing = dir;
      return;
    }

    enemy.x += (ladder.x - enemy.x) * 0.25;
    enemy.y += verticalDir * ENEMY_SPEED * dt * 0.72;
    enemy.y = clamp(enemy.y, ladder.top, ladder.bottom);
    const snapped = LEVELS.find((level) => Math.abs(level - enemy.y) < 3);
    if (snapped !== undefined) {
      enemy.y = snapped;
    }
  }

  function usePepper() {
    if (state.mode !== "playing" || state.pepper <= 0 || state.respawnTimer > 0) {
      return;
    }
    state.pepper -= 1;
    state.peppers.push({
      x: state.player.x + state.player.facing * 30,
      y: state.player.y - 2,
      dir: state.player.facing,
      ttl: 0.28,
    });
    state.enemies.forEach((enemy) => {
      const inLane = Math.abs(enemy.y - state.player.y) < 28;
      const forward = (enemy.x - state.player.x) * state.player.facing > 0;
      const close = Math.abs(enemy.x - state.player.x) < 110;
      if (inLane && forward && close) {
        enemy.stun = STUN_TIME;
      }
    });
    syncHud();
  }

  function updateIngredients(dt) {
    state.ingredients.forEach((ingredient) => {
      if (ingredient.landed) {
        return;
      }

      if (ingredient.falling) {
        ingredient.dropProgress = clamp(ingredient.dropProgress + dt * 2.8, 0, 1);
        ingredient.y = ingredient.dropFromY + (ingredient.dropToY - ingredient.dropFromY) * ingredient.dropProgress;
        crushEnemies(ingredient);
        if (ingredient.dropProgress >= 1) {
          ingredient.falling = false;
          ingredient.floorIndex += 1;
          if (ingredient.floorIndex >= LEVELS.length - 1) {
            ingredient.landed = true;
            state.score += 350;
            state.placedCount += 1;
            syncHud();
            if (state.placedCount === state.ingredients.length) {
              state.mode = "win";
              syncOverlay();
            }
          } else {
            ingredient.y = LEVELS[ingredient.floorIndex] - 10;
            ingredient.segments.fill(false);
          }
        }
        return;
      }

      if (Math.abs(state.player.y - (ingredient.y + 10)) > 6) {
        return;
      }
      const left = ingredient.x;
      const right = ingredient.x + ingredient.width;
      if (state.player.x < left || state.player.x > right) {
        return;
      }
      const segmentIndex = clamp(Math.floor((state.player.x - left) / ingredient.segmentWidth), 0, ingredient.segments.length - 1);
      if (!ingredient.segments[segmentIndex]) {
        ingredient.segments[segmentIndex] = true;
        state.score += 10;
        syncHud();
      }
      if (ingredient.segments.every(Boolean)) {
        ingredient.falling = true;
        ingredient.dropProgress = 0;
        ingredient.dropFromY = ingredient.y;
        ingredient.dropToY = LEVELS[ingredient.floorIndex + 1] - 10;
      }
    });
  }

  function crushEnemies(ingredient) {
    state.enemies = state.enemies.filter((enemy) => {
      const overlapsX = enemy.x + enemy.w * 0.5 > ingredient.x && enemy.x - enemy.w * 0.5 < ingredient.x + ingredient.width;
      const overlapsY = enemy.y > ingredient.y - 4 && enemy.y < ingredient.y + 24;
      if (!overlapsX || !overlapsY) {
        return true;
      }
      state.score += 250;
      state.crushedText.push({ x: enemy.x, y: enemy.y - 12, text: "CRUSH", ttl: 0.9 });
      syncHud();
      return false;
    });
  }

  function updateFloatingText(dt) {
    state.crushedText = state.crushedText.filter((entry) => {
      entry.ttl -= dt;
      entry.y -= 18 * dt;
      return entry.ttl > 0;
    });
  }

  function checkCollisions() {
    if (state.mode !== "playing" || state.invulnTimer > 0 || state.respawnTimer > 0) {
      return;
    }
    const hit = state.enemies.find((enemy) => dist(enemy, state.player) < 24 && enemy.stun <= 0);
    if (!hit) {
      return;
    }
    state.lives -= 1;
    state.flashTimer = 0.8;
    syncHud();
    if (state.lives <= 0) {
      state.mode = "lose";
      syncOverlay();
      return;
    }
    state.respawnTimer = RESPAWN_DELAY;
    state.player = createPlayer();
    state.invulnTimer = 2;
  }

  function updateRespawn(dt) {
    if (state.respawnTimer > 0) {
      state.respawnTimer -= dt;
    }
    if (state.invulnTimer > 0) {
      state.invulnTimer -= dt;
    }
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
    }
  }

  function syncHud() {
    scoreEl.textContent = String(state.score);
    livesEl.textContent = String(state.lives);
    pepperEl.textContent = String(state.pepper);
    stacksEl.textContent = `${state.placedCount} / ${state.ingredients.length}`;
  }

  function syncOverlay() {
    if (state.mode === "playing") {
      overlayEl.hidden = true;
      return;
    }
    overlayEl.hidden = false;
    if (state.mode === "menu") {
      overlayKickerEl.textContent = "BurgerTime Stack";
      overlayTitleEl.textContent = "Drop every ingredient onto plate.";
      overlayBodyEl.textContent = "Route ladders, stamp full ingredient widths, and use pepper when enemy cooks pinch both exits.";
      return;
    }
    if (state.mode === "win") {
      overlayKickerEl.textContent = "Kitchen Cleared";
      overlayTitleEl.textContent = "Every burger stacked.";
      overlayBodyEl.textContent = `Score ${state.score}. Fast retry keeps route experiments cheap. Press Enter or R for another run.`;
      return;
    }
    overlayKickerEl.textContent = "Order Burned";
    overlayTitleEl.textContent = "Cooks boxed you in.";
    overlayBodyEl.textContent = `Score ${state.score}. Pepper earlier near ladder chokes, then restart and reroute.`;
  }

  function drawPlatform(platform) {
    ctx.strokeStyle = "#ffd779";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(platform.x1, platform.y + 8);
    ctx.lineTo(platform.x2, platform.y + 8);
    ctx.stroke();
  }

  function drawLadder(ladder) {
    ctx.strokeStyle = "#8ec1ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ladder.x - 10, ladder.top + 10);
    ctx.lineTo(ladder.x - 10, ladder.bottom + 8);
    ctx.moveTo(ladder.x + 10, ladder.top + 10);
    ctx.lineTo(ladder.x + 10, ladder.bottom + 8);
    ctx.stroke();
    for (let y = ladder.top + 18; y < ladder.bottom + 2; y += 14) {
      ctx.beginPath();
      ctx.moveTo(ladder.x - 10, y);
      ctx.lineTo(ladder.x + 10, y);
      ctx.stroke();
    }
  }

  function drawIngredient(ingredient) {
    const colors = {
      "bun-top": "#efc26b",
      lettuce: "#65d16d",
      patty: "#8a4428",
      "bun-bottom": "#f0d47e",
    };
    const color = colors[ingredient.name] || ingredient.color;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#2f1828";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(ingredient.x, ingredient.y, ingredient.width, 20, 8);
    ctx.fill();
    ctx.stroke();

    ingredient.segments.forEach((pressed, index) => {
      if (!pressed) {
        return;
      }
      ctx.fillStyle = "rgba(64, 20, 26, 0.28)";
      ctx.fillRect(ingredient.x + index * ingredient.segmentWidth, ingredient.y + 5, ingredient.segmentWidth, 15);
    });
  }

  function drawPlate(stack) {
    const plateY = LEVELS[4] + 22;
    ctx.fillStyle = "#f0f4ff";
    ctx.fillRect(stack.x - 14, plateY, 146, 10);
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(stack.x - 8, plateY - 4, 134, 5);
  }

  function drawPlayer() {
    const player = state.player;
    if (state.invulnTimer > 0 && Math.floor(state.invulnTimer * 14) % 2 === 0) {
      return;
    }
    ctx.save();
    ctx.translate(player.x, player.y - 18);
    ctx.fillStyle = "#f9f3dc";
    ctx.fillRect(-10, -16, 20, 26);
    ctx.fillStyle = "#ff8b4a";
    ctx.fillRect(-8, -28, 16, 12);
    ctx.fillStyle = "#2d1426";
    ctx.fillRect(player.facing > 0 ? 4 : -8, -18, 8, 5);
    ctx.strokeStyle = "#2d1426";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    ctx.lineTo(-7, 20);
    ctx.moveTo(4, 10);
    ctx.lineTo(7, 20);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemies() {
    state.enemies.forEach((enemy) => {
      ctx.save();
      ctx.translate(enemy.x, enemy.y - 16);
      ctx.fillStyle = enemy.stun > 0 ? "#d6f0ff" : enemy.color;
      ctx.fillRect(-11, -15, 22, 22);
      ctx.fillStyle = "#fff2df";
      ctx.fillRect(-8, -25, 16, 10);
      ctx.fillStyle = "#2f1828";
      ctx.fillRect(-6, -10, 4, 4);
      ctx.fillRect(2, -10, 4, 4);
      if (enemy.stun > 0) {
        ctx.strokeStyle = "#8ec1ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -20, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawPeppers() {
    state.peppers.forEach((pepper) => {
      ctx.fillStyle = "rgba(255, 244, 171, 0.92)";
      ctx.beginPath();
      ctx.ellipse(pepper.x, pepper.y, 28, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFloatingText() {
    ctx.fillStyle = "#fff2a6";
    ctx.font = "bold 16px Trebuchet MS";
    state.crushedText.forEach((entry) => {
      ctx.globalAlpha = Math.max(entry.ttl, 0);
      ctx.fillText(entry.text, entry.x - 24, entry.y);
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#2f1735";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#402047";
    for (let i = 0; i < 9; i += 1) {
      ctx.fillRect(0, i * 60 + 30, WIDTH, 1);
    }

    burgerSetups.forEach(drawPlate);
    platforms.forEach(drawPlatform);
    ladders.forEach(drawLadder);
    state.ingredients.forEach(drawIngredient);
    drawPeppers();
    drawEnemies();
    drawPlayer();
    drawFloatingText();

    if (state.flashTimer > 0) {
      ctx.fillStyle = `rgba(255, 79, 108, ${Math.min(state.flashTimer, 0.35)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    ctx.fillStyle = "#ffdca0";
    ctx.font = "14px Trebuchet MS";
    ctx.fillText("Walk full layer width to drop it one floor.", 18, 24);
    ctx.fillText("Keep ladders open. Falling layers crush enemies below.", 18, 44);
  }

  function update(dt) {
    if (state.mode !== "playing") {
      return;
    }
    updateRespawn(dt);
    updatePlayer(dt);
    maybeSpawnEnemy(dt);
    state.enemies.forEach((enemy) => moveEnemy(enemy, dt));
    updateIngredients(dt);
    updateFloatingText(dt);
    checkCollisions();
    syncHud();
  }

  function frame(time) {
    const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0);
    state.lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      input.left = true;
    } else if (event.key === "ArrowRight") {
      input.right = true;
    } else if (event.key === "ArrowUp") {
      input.up = true;
    } else if (event.key === "ArrowDown") {
      input.down = true;
    } else if (event.key === " ") {
      event.preventDefault();
      usePepper();
    } else if (event.key === "Enter") {
      startGame();
    } else if (event.key.toLowerCase() === "r") {
      resetRun("menu");
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft") {
      input.left = false;
    } else if (event.key === "ArrowRight") {
      input.right = false;
    } else if (event.key === "ArrowUp") {
      input.up = false;
    } else if (event.key === "ArrowDown") {
      input.down = false;
    }
  });

  resetRun("menu");
  requestAnimationFrame(frame);
}());
