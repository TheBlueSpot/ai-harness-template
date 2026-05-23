(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");

  var hud = {
    sector: document.getElementById("sectorValue"),
    shield: document.getElementById("shieldValue"),
    cells: document.getElementById("cellsValue"),
    goal: document.getElementById("goalValue"),
    status: document.getElementById("statusValue"),
    time: document.getElementById("timeValue")
  };

  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayBody = document.getElementById("overlayBody");
  var overlayButton = document.getElementById("overlayButton");

  var VIEW_WIDTH = canvas.width;
  var VIEW_HEIGHT = canvas.height;
  var DT_CAP = 1 / 30;
  var TAU = Math.PI * 2;

  var keys = Object.create(null);
  var levels = createLevels();
  var state = createRunState();
  var lastTime = performance.now();

  function createRunState() {
    return {
      mode: "ready",
      levelIndex: 0,
      timer: 0,
      cameraX: 0,
      cameraY: 0,
      shake: 0,
      flash: 0,
      message: "Stand by",
      player: null,
      cellsCollected: 0,
      cellsTotal: 0,
      level: null
    };
  }

  function createLevels() {
    return [
      {
        name: "Dust Intake",
        width: 1500,
        height: 980,
        start: { x: 160, y: 160 },
        exit: { x: 1290, y: 760, width: 120, height: 120 },
        pickups: [
          { x: 460, y: 182 },
          { x: 818, y: 498 },
          { x: 1180, y: 777 }
        ],
        walls: [
          rect(0, 0, 1500, 70),
          rect(0, 0, 70, 980),
          rect(0, 910, 1500, 70),
          rect(1430, 0, 70, 980),
          rect(250, 70, 70, 460),
          rect(250, 610, 70, 300),
          rect(320, 460, 380, 70),
          rect(780, 210, 70, 390),
          rect(700, 210, 340, 70),
          rect(1040, 210, 70, 520),
          rect(520, 690, 590, 70),
          rect(1160, 520, 220, 70)
        ],
        sparks: [
          {
            x1: 392,
            y1: 226,
            x2: 640,
            y2: 226,
            radius: 16,
            speed: 0.8
          }
        ]
      },
      {
        name: "Relay Chasm",
        width: 1780,
        height: 1180,
        start: { x: 180, y: 180 },
        exit: { x: 1520, y: 915, width: 150, height: 150 },
        pickups: [
          { x: 492, y: 290 },
          { x: 910, y: 206 },
          { x: 1018, y: 832 },
          { x: 1450, y: 500 }
        ],
        walls: [
          rect(0, 0, 1780, 80),
          rect(0, 0, 80, 1180),
          rect(0, 1100, 1780, 80),
          rect(1700, 0, 80, 1180),
          rect(280, 80, 70, 800),
          rect(280, 960, 70, 140),
          rect(350, 810, 440, 70),
          rect(350, 260, 350, 70),
          rect(780, 80, 70, 500),
          rect(780, 660, 70, 440),
          rect(850, 510, 350, 70),
          rect(1200, 220, 70, 720),
          rect(1270, 220, 280, 70),
          rect(960, 870, 420, 70),
          rect(1450, 580, 70, 290)
        ],
        sparks: [
          {
            x1: 390,
            y1: 925,
            x2: 720,
            y2: 925,
            radius: 18,
            speed: 1.2
          },
          {
            x1: 1080,
            y1: 352,
            x2: 1080,
            y2: 770,
            radius: 18,
            speed: 0.92
          }
        ]
      },
      {
        name: "Core Spiral",
        width: 1960,
        height: 1320,
        start: { x: 235, y: 205 },
        exit: { x: 1700, y: 1030, width: 150, height: 150 },
        pickups: [
          { x: 560, y: 210 },
          { x: 1490, y: 226 },
          { x: 1480, y: 970 },
          { x: 790, y: 980 },
          { x: 976, y: 632 }
        ],
        walls: [
          rect(0, 0, 1960, 90),
          rect(0, 0, 90, 1320),
          rect(0, 1230, 1960, 90),
          rect(1870, 0, 90, 1320),
          rect(330, 90, 70, 880),
          rect(330, 1050, 70, 180),
          rect(400, 900, 980, 70),
          rect(470, 300, 70, 530),
          rect(540, 300, 980, 70),
          rect(1450, 300, 70, 530),
          rect(760, 530, 620, 70),
          rect(760, 530, 70, 500),
          rect(760, 1030, 870, 70),
          rect(1560, 650, 70, 380),
          rect(1040, 650, 590, 70)
        ],
        sparks: [
          {
            x1: 420,
            y1: 1142,
            x2: 712,
            y2: 1142,
            radius: 18,
            speed: 1.15
          },
          {
            x1: 1640,
            y1: 420,
            x2: 1640,
            y2: 890,
            radius: 18,
            speed: 1.25
          },
          {
            x1: 935,
            y1: 705,
            x2: 1240,
            y2: 705,
            radius: 20,
            speed: 1.55
          }
        ]
      }
    ];
  }

  function rect(x, y, width, height) {
    return { x: x, y: y, width: width, height: height };
  }

  function startRun() {
    state.mode = "playing";
    state.levelIndex = 0;
    state.timer = 0;
    state.flash = 0;
    state.shake = 0;
    loadLevel(state.levelIndex, true);
    hideOverlay();
  }

  function loadLevel(index, resetTimer) {
    var level = cloneLevel(levels[index]);
    state.levelIndex = index;
    state.level = level;
    state.cellsCollected = 0;
    state.cellsTotal = level.pickups.length;
    state.player = {
      x: level.start.x,
      y: level.start.y,
      vx: 0,
      vy: 0,
      angle: 0,
      shield: Math.min(100, state.player ? state.player.shield + 22 : 100),
      invuln: 0,
      trail: []
    };
    if (resetTimer) {
      state.timer = 0;
    }
    state.message = "Collect battery cells";
    updateCamera(true);
    syncHud();
  }

  function cloneLevel(level) {
    return {
      name: level.name,
      width: level.width,
      height: level.height,
      start: { x: level.start.x, y: level.start.y },
      exit: {
        x: level.exit.x,
        y: level.exit.y,
        width: level.exit.width,
        height: level.exit.height
      },
      pickups: level.pickups.map(function (pickup) {
        return { x: pickup.x, y: pickup.y, collected: false, pulse: Math.random() * TAU };
      }),
      walls: level.walls.map(function (wall) {
        return rect(wall.x, wall.y, wall.width, wall.height);
      }),
      sparks: level.sparks.map(function (spark) {
        return {
          x1: spark.x1,
          y1: spark.y1,
          x2: spark.x2,
          y2: spark.y2,
          radius: spark.radius,
          speed: spark.speed,
          phase: Math.random()
        };
      })
    };
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function showOverlay(title, body, buttonLabel) {
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlayButton.textContent = buttonLabel;
    overlay.hidden = false;
  }

  function finishRun() {
    state.mode = "win";
    state.message = "Run clear";
    showOverlay(
      "Core route secured.",
      "You threaded every sector and got the full frame through the final gate. Press R or use the button to run it again.",
      "Run Again"
    );
  }

  function loseRun() {
    state.mode = "lose";
    state.message = "Shield collapsed";
    showOverlay(
      "Frame integrity lost.",
      "Wall grind or spark contact burned the shield to zero. Press R or use the button to restart the maze.",
      "Retry Run"
    );
  }

  function update(dt) {
    if (state.mode !== "playing") {
      state.flash = Math.max(0, state.flash - dt * 2.6);
      state.shake = Math.max(0, state.shake - dt * 4);
      return;
    }

    var player = state.player;
    state.timer += dt;
    player.invuln = Math.max(0, player.invuln - dt);
    state.flash = Math.max(0, state.flash - dt * 2.8);
    state.shake = Math.max(0, state.shake - dt * 3.8);

    var moveX = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    var moveY = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    var moveLength = Math.hypot(moveX, moveY) || 1;
    moveX /= moveLength;
    moveY /= moveLength;

    var precision = keys.ShiftLeft || keys.ShiftRight;
    var accel = precision ? 560 : 880;
    var maxSpeed = precision ? 170 : 250;
    var drag = precision ? 5.6 : 4.3;

    player.vx += moveX * accel * dt;
    player.vy += moveY * accel * dt;

    player.vx -= player.vx * Math.min(0.98, drag * dt);
    player.vy -= player.vy * Math.min(0.98, drag * dt);

    var speed = Math.hypot(player.vx, player.vy);
    if (speed > maxSpeed) {
      var ratio = maxSpeed / speed;
      player.vx *= ratio;
      player.vy *= ratio;
    }

    player.angle = wrapAngle(player.angle + dt * (precision ? 2.65 : 3.55));

    var previousX = player.x;
    var previousY = player.y;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    keepInsideBounds(player, state.level);

    if (rodHitsWall(player, state.level.walls)) {
      player.x = previousX;
      player.y = previousY;
      player.vx *= -0.18;
      player.vy *= -0.18;
      applyDamage(11, "Wall scrape");
    }

    updateTrail(player);
    collectPickups(player, state.level);
    handleSparks(player, state.level.sparks, state.level.walls, dt);
    checkExit(player, state.level.exit);
    updateCamera(false);
    syncHud();
  }

  function wrapAngle(angle) {
    if (angle > TAU) {
      angle -= TAU;
    }
    return angle;
  }

  function keepInsideBounds(player, level) {
    player.x = clamp(player.x, 98, level.width - 98);
    player.y = clamp(player.y, 98, level.height - 98);
  }

  function updateTrail(player) {
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > 14) {
      player.trail.shift();
    }
  }

  function collectPickups(player, level) {
    for (var i = 0; i < level.pickups.length; i += 1) {
      var pickup = level.pickups[i];
      if (pickup.collected) {
        continue;
      }
      if (distance(player.x, player.y, pickup.x, pickup.y) < 54) {
        pickup.collected = true;
        state.cellsCollected += 1;
        state.flash = 0.45;
        state.message = state.cellsCollected === state.cellsTotal ? "Exit gate unlocked" : "Battery secured";
      }
    }
  }

  function handleSparks(player, sparks, walls, dt) {
    for (var i = 0; i < sparks.length; i += 1) {
      var spark = sparks[i];
      spark.phase = (spark.phase + dt * spark.speed * 0.34) % 1;
      var pos = sparkPosition(spark);
      if (rodHitsCircle(player, pos.x, pos.y, spark.radius + 6)) {
        player.vx *= 0.84;
        player.vy *= 0.84;
        applyDamage(13, "Spark rail");
      }
      if (circleHitsWall(pos.x, pos.y, spark.radius, walls)) {
        spark.phase = (spark.phase + 0.5) % 1;
      }
    }
  }

  function checkExit(player, exit) {
    var ready = state.cellsCollected === state.cellsTotal;
    if (!ready) {
      return;
    }
    var margin = 36;
    if (
      player.x > exit.x + margin &&
      player.x < exit.x + exit.width - margin &&
      player.y > exit.y + margin &&
      player.y < exit.y + exit.height - margin
    ) {
      if (state.levelIndex >= levels.length - 1) {
        finishRun();
      } else {
        loadLevel(state.levelIndex + 1, false);
      }
    }
  }

  function applyDamage(amount, label) {
    var player = state.player;
    if (player.invuln > 0 || state.mode !== "playing") {
      return;
    }
    player.shield = Math.max(0, player.shield - amount);
    player.invuln = 0.55;
    state.flash = 0.85;
    state.shake = 0.95;
    state.message = label;
    if (player.shield <= 0) {
      loseRun();
    }
  }

  function updateCamera(forceSnap) {
    var level = state.level;
    var targetX = clamp(state.player.x - VIEW_WIDTH / 2, 0, Math.max(0, level.width - VIEW_WIDTH));
    var targetY = clamp(state.player.y - VIEW_HEIGHT / 2, 0, Math.max(0, level.height - VIEW_HEIGHT));
    if (forceSnap) {
      state.cameraX = targetX;
      state.cameraY = targetY;
      return;
    }
    state.cameraX += (targetX - state.cameraX) * 0.08;
    state.cameraY += (targetY - state.cameraY) * 0.08;
  }

  function syncHud() {
    if (!state.player) {
      return;
    }
    hud.sector.textContent = String(state.levelIndex + 1) + " / " + String(levels.length);
    hud.shield.textContent = String(Math.ceil(state.player.shield));
    hud.cells.textContent = String(state.cellsCollected) + " / " + String(state.cellsTotal);
    hud.goal.textContent = state.cellsCollected === state.cellsTotal ? "Exit gate" : String(state.cellsTotal - state.cellsCollected) + " cells left";
    hud.status.textContent = state.message;
    hud.time.textContent = state.timer.toFixed(1);
  }

  function render() {
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    if (!state.level || !state.player) {
      drawBackdrop();
      return;
    }

    var shakeX = state.shake > 0 ? Math.sin(performance.now() * 0.05) * 8 * state.shake : 0;
    var shakeY = state.shake > 0 ? Math.cos(performance.now() * 0.043) * 7 * state.shake : 0;

    ctx.save();
    ctx.translate(-state.cameraX + shakeX, -state.cameraY + shakeY);

    drawBackdrop();
    drawGrid(state.level);
    drawExit(state.level.exit);
    drawWalls(state.level.walls);
    drawPickups(state.level.pickups);
    drawSparks(state.level.sparks);
    drawPlayer(state.player);

    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = "rgba(255, 210, 120," + (state.flash * 0.2).toFixed(3) + ")";
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }
  }

  function drawBackdrop() {
    var gradient = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
    gradient.addColorStop(0, "#10273a");
    gradient.addColorStop(1, "#061018");
    ctx.fillStyle = gradient;
    ctx.fillRect(state.cameraX, state.cameraY, VIEW_WIDTH, VIEW_HEIGHT);
  }

  function drawGrid(level) {
    ctx.strokeStyle = "rgba(120, 200, 235, 0.08)";
    ctx.lineWidth = 1;
    for (var x = 0; x <= level.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, level.height);
      ctx.stroke();
    }
    for (var y = 0; y <= level.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(level.width, y);
      ctx.stroke();
    }
  }

  function drawWalls(walls) {
    for (var i = 0; i < walls.length; i += 1) {
      var wall = walls[i];
      ctx.fillStyle = "#123142";
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.strokeStyle = "rgba(150, 230, 255, 0.28)";
      ctx.lineWidth = 3;
      ctx.strokeRect(wall.x + 1.5, wall.y + 1.5, wall.width - 3, wall.height - 3);
    }
  }

  function drawPickups(pickups) {
    for (var i = 0; i < pickups.length; i += 1) {
      var pickup = pickups[i];
      if (pickup.collected) {
        continue;
      }
      var pulse = 0.7 + Math.sin(state.timer * 4 + pickup.pulse) * 0.22;
      ctx.beginPath();
      ctx.fillStyle = "rgba(160, 255, 170, 0.22)";
      ctx.arc(pickup.x, pickup.y, 30 + pulse * 5, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "#bcff9c";
      ctx.arc(pickup.x, pickup.y, 14, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = "#efffd8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pickup.x - 12, pickup.y);
      ctx.lineTo(pickup.x + 12, pickup.y);
      ctx.moveTo(pickup.x, pickup.y - 12);
      ctx.lineTo(pickup.x, pickup.y + 12);
      ctx.stroke();
    }
  }

  function drawSparks(sparks) {
    for (var i = 0; i < sparks.length; i += 1) {
      var spark = sparks[i];
      var pos = sparkPosition(spark);
      var pulse = 0.5 + Math.sin(state.timer * 5 + spark.phase * TAU) * 0.5;
      ctx.strokeStyle = "rgba(255, 136, 116, 0.3)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(spark.x1, spark.y1);
      ctx.lineTo(spark.x2, spark.y2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 173, 129, 0.12)";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(spark.x1, spark.y1);
      ctx.lineTo(spark.x2, spark.y2);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 196, 139, " + (0.12 + pulse * 0.18).toFixed(3) + ")";
      ctx.arc(pos.x, pos.y, spark.radius + 12, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "#ffcf6a";
      ctx.arc(pos.x, pos.y, spark.radius + pulse * 2, 0, TAU);
      ctx.fill();
    }
  }

  function drawExit(exit) {
    var unlocked = state.cellsCollected === state.cellsTotal;
    ctx.fillStyle = unlocked ? "rgba(116, 255, 208, 0.22)" : "rgba(80, 117, 135, 0.2)";
    ctx.fillRect(exit.x, exit.y, exit.width, exit.height);
    ctx.strokeStyle = unlocked ? "#7fffd5" : "#53758a";
    ctx.lineWidth = 5;
    ctx.strokeRect(exit.x + 2.5, exit.y + 2.5, exit.width - 5, exit.height - 5);

    ctx.fillStyle = unlocked ? "#dfffee" : "#89a9bb";
    ctx.font = "700 24px Trebuchet MS";
    ctx.fillText(unlocked ? "EXIT" : "LOCKED", exit.x + 24, exit.y + exit.height / 2 + 10);
  }

  function drawPlayer(player) {
    for (var i = 0; i < player.trail.length; i += 1) {
      var point = player.trail[i];
      var alpha = (i + 1) / player.trail.length * 0.18;
      ctx.beginPath();
      ctx.fillStyle = "rgba(130, 219, 255," + alpha.toFixed(3) + ")";
      ctx.arc(point.x, point.y, 9, 0, TAU);
      ctx.fill();
    }

    var rod = getRodEndpoints(player);
    ctx.strokeStyle = player.invuln > 0 ? "#ffd176" : "#b0f4ff";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rod.ax, rod.ay);
    ctx.lineTo(rod.bx, rod.by);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rod.ax, rod.ay);
    ctx.lineTo(rod.bx, rod.by);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = "#74e7ff";
    ctx.arc(player.x, player.y, 16, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(12, 39, 54, 0.85)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 16, 0, TAU);
    ctx.stroke();
  }

  function getRodEndpoints(player) {
    var half = 72;
    var dx = Math.cos(player.angle) * half;
    var dy = Math.sin(player.angle) * half;
    return {
      ax: player.x - dx,
      ay: player.y - dy,
      bx: player.x + dx,
      by: player.y + dy
    };
  }

  function rodHitsWall(player, walls) {
    var rod = getRodEndpoints(player);
    for (var i = 0; i <= 18; i += 1) {
      var t = i / 18;
      var sampleX = rod.ax + (rod.bx - rod.ax) * t;
      var sampleY = rod.ay + (rod.by - rod.ay) * t;
      if (circleHitsWall(sampleX, sampleY, 10, walls)) {
        return true;
      }
    }
    return circleHitsWall(player.x, player.y, 12, walls);
  }

  function rodHitsCircle(player, x, y, radius) {
    var rod = getRodEndpoints(player);
    for (var i = 0; i <= 18; i += 1) {
      var t = i / 18;
      var sampleX = rod.ax + (rod.bx - rod.ax) * t;
      var sampleY = rod.ay + (rod.by - rod.ay) * t;
      if (distance(sampleX, sampleY, x, y) <= radius) {
        return true;
      }
    }
    return distance(player.x, player.y, x, y) <= radius;
  }

  function circleHitsWall(x, y, radius, walls) {
    for (var i = 0; i < walls.length; i += 1) {
      var wall = walls[i];
      var nearestX = clamp(x, wall.x, wall.x + wall.width);
      var nearestY = clamp(y, wall.y, wall.y + wall.height);
      if (distance(x, y, nearestX, nearestY) < radius) {
        return true;
      }
    }
    return false;
  }

  function sparkPosition(spark) {
    var t = 0.5 + Math.sin(spark.phase * TAU) * 0.5;
    return {
      x: lerp(spark.x1, spark.x2, t),
      y: lerp(spark.y1, spark.y2, t)
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function frame(now) {
    var dt = Math.min(DT_CAP, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function onKeyDown(event) {
    keys[event.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(event.code) >= 0) {
      event.preventDefault();
    }

    if ((event.code === "Enter" || event.code === "Space") && state.mode === "ready") {
      startRun();
    } else if ((event.code === "Enter" || event.code === "Space") && (state.mode === "win" || state.mode === "lose")) {
      startRun();
    } else if (event.code === "KeyR" && (state.mode === "win" || state.mode === "lose")) {
      startRun();
    }
  }

  function onKeyUp(event) {
    keys[event.code] = false;
  }

  overlayButton.addEventListener("click", function () {
    startRun();
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  showOverlay(
    "Thread the spinning frame.",
    "Move with WASD or arrow keys. Hold Shift for precision drift. Grab every battery cell, then guide the rotating rod into the exit gate without grinding the walls or spark rails down to zero shield.",
    "Start Run"
  );

  loadLevel(0, true);
  syncHud();
  requestAnimationFrame(frame);
}());
