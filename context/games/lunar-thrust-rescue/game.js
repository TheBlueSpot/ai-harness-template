(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayBody = document.getElementById("overlayBody");
  var startButton = document.getElementById("startButton");

  var hud = {
    fuel: document.getElementById("fuelValue"),
    hull: document.getElementById("hullValue"),
    rescue: document.getElementById("rescueValue"),
    target: document.getElementById("targetValue"),
    speed: document.getElementById("speedValue"),
    altitude: document.getElementById("altitudeValue")
  };

  var WORLD_WIDTH = 5400;
  var CAMERA_AHEAD = 180;
  var MAX_FUEL = 148;
  var FUEL_DEPOT_REFILL = 55;
  var COMMAND_FUEL_BONUS = 23;
  var GRAVITY = 25;
  var TURN_SPEED = 2.5;
  var THRUST = 57;
  var FUEL_BURN = 16;
  var SAFE_ANGLE = 0.3;
  var LAND_SPEED_Y = 24;
  var LAND_SPEED_X = 14;
  var HAZARD_SPEED_Y = 30;
  var HAZARD_SPEED_X = 18;
  var SHIP_RADIUS = 14;
  var PAD_HEIGHT = 8;
  var VIEW_SCALE = 1;
  var keys = Object.create(null);
  var state = null;
  var lastTime = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function terrainBase(x) {
    var waveA = Math.sin(x * 0.0042) * 90;
    var waveB = Math.sin(x * 0.011 + 1.2) * 42;
    var waveC = Math.sin(x * 0.022 + 0.4) * 18;
    return 560 + waveA + waveB + waveC + (x / WORLD_WIDTH) * 80;
  }

  function createPads() {
    return [
      { id: "command", kind: "command", x: 420, width: 150, label: "Command" },
      { id: "survivor-a", kind: "pickup", x: 1320, width: 110, label: "Beacon A" },
      { id: "fuel", kind: "fuel", x: 2460, width: 150, label: "Fuel Depot" },
      { id: "survivor-b", kind: "pickup", x: 3360, width: 120, label: "Beacon B" },
      { id: "survivor-c", kind: "pickup", x: 4420, width: 105, label: "Beacon C" }
    ];
  }

  function getPadHeightMap(pads) {
    var map = Object.create(null);
    for (var i = 0; i < pads.length; i += 1) {
      var pad = pads[i];
      map[pad.id] = terrainBase(pad.x);
    }
    return map;
  }

  function surfaceYAt(x, padMap, pads) {
    x = clamp(x, 0, WORLD_WIDTH);
    for (var i = 0; i < pads.length; i += 1) {
      var pad = pads[i];
      var left = pad.x - pad.width / 2;
      var right = pad.x + pad.width / 2;
      if (x >= left && x <= right) {
        return padMap[pad.id];
      }
    }
    return terrainBase(x);
  }

  function resetGame() {
    var pads = createPads();
    var padMap = getPadHeightMap(pads);
    var survivors = [
      { id: "crew-a", padId: "survivor-a", status: "waiting", x: 1320, color: "#9be0ff" },
      { id: "crew-b", padId: "survivor-b", status: "waiting", x: 3360, color: "#ffe483" },
      { id: "crew-c", padId: "survivor-c", status: "waiting", x: 4420, color: "#ffb896" }
    ];

    state = {
      mode: "ready",
      pads: pads,
      padMap: padMap,
      survivors: survivors,
      stars: createStars(),
      messages: [],
      cameraX: 0,
      shake: 0,
      ship: {
        x: 420,
        y: padMap.command - 26,
        vx: 0,
        vy: 0,
        angle: 0,
        fuel: MAX_FUEL,
        hull: 100,
        carryingId: null,
        thrusting: false
      },
      rescuedCount: 0,
      totalSurvivors: survivors.length,
      touchdownTimer: 0,
      lastPadId: "command"
    };
    syncOverlay();
    updateHud();
  }

  function createStars() {
    var stars = [];
    for (var i = 0; i < 180; i += 1) {
      stars.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * 380,
        r: Math.random() * 2.2 + 0.4,
        a: Math.random() * 0.7 + 0.2
      });
    }
    return stars;
  }

  function addMessage(text, seconds) {
    state.messages.unshift({ text: text, life: seconds || 2.2 });
    state.messages = state.messages.slice(0, 4);
  }

  function getPadById(id) {
    for (var i = 0; i < state.pads.length; i += 1) {
      if (state.pads[i].id === id) {
        return state.pads[i];
      }
    }
    return null;
  }

  function getPrimaryTarget() {
    if (!state) {
      return null;
    }
    if (state.ship.carryingId) {
      return getPadById("command");
    }
    var nearest = null;
    var nearestDistance = Infinity;
    for (var i = 0; i < state.survivors.length; i += 1) {
      var survivor = state.survivors[i];
      if (survivor.status !== "waiting") {
        continue;
      }
      var pad = getPadById(survivor.padId);
      var testDistance = Math.abs(pad.x - state.ship.x);
      if (testDistance < nearestDistance) {
        nearestDistance = testDistance;
        nearest = pad;
      }
    }
    return nearest || getPadById("command");
  }

  function updateHud() {
    if (!state) {
      return;
    }
    var target = getPrimaryTarget();
    var speed = Math.sqrt(state.ship.vx * state.ship.vx + state.ship.vy * state.ship.vy);
    hud.fuel.textContent = state.ship.fuel.toFixed(1);
    hud.hull.textContent = state.ship.hull.toFixed(0) + "%";
    hud.rescue.textContent = state.rescuedCount + "/" + state.totalSurvivors;
    hud.target.textContent = target ? target.label : "Stand by";
    hud.speed.textContent = speed.toFixed(1);
    hud.altitude.textContent = Math.max(0, Math.round(getAltitude()));
  }

  function getAltitude() {
    var ground = surfaceYAt(state.ship.x, state.padMap, state.pads);
    return ground - state.ship.y - SHIP_RADIUS;
  }

  function syncOverlay() {
    if (!state) {
      return;
    }
    if (state.mode === "playing") {
      overlay.classList.add("hidden");
      return;
    }

    overlay.classList.remove("hidden");
    if (state.mode === "ready") {
      overlayTitle.textContent = "Route the survivors home.";
      overlayBody.textContent = "Land on beacon pads to pick up crew, return them to Command, and use the Fuel Depot if your route gets too expensive. Descend with low angle and low speed.";
      startButton.textContent = "Start Mission";
    } else if (state.mode === "win") {
      overlayTitle.textContent = "All survivors recovered.";
      overlayBody.textContent = "You brought every stranded crew member home. Press R or use the button to fly the route again.";
      startButton.textContent = "Fly Again";
    } else if (state.mode === "lose") {
      overlayTitle.textContent = "Mission lost.";
      overlayBody.textContent = state.lossReason || "The lander failed before the rescue route was complete. Press R or use the button to retry.";
      startButton.textContent = "Retry Mission";
    }
  }

  function startGame() {
    resetGame();
    state.mode = "playing";
    syncOverlay();
  }

  function restartGame() {
    resetGame();
    state.mode = "playing";
    syncOverlay();
  }

  function landOnPad(pad) {
    state.lastPadId = pad.id;
    state.ship.vx = 0;
    state.ship.vy = 0;
    state.ship.angle = 0;
    state.ship.y = state.padMap[pad.id] - SHIP_RADIUS - PAD_HEIGHT;
    state.touchdownTimer = 0.3;

    if (pad.kind === "fuel") {
      state.ship.fuel = Math.min(MAX_FUEL, state.ship.fuel + FUEL_DEPOT_REFILL);
      addMessage("Fuel depot refill", 2.1);
    }

    if (pad.kind === "pickup" && !state.ship.carryingId) {
      for (var i = 0; i < state.survivors.length; i += 1) {
        var survivor = state.survivors[i];
        if (survivor.padId === pad.id && survivor.status === "waiting") {
          survivor.status = "carried";
          state.ship.carryingId = survivor.id;
          addMessage("Crew aboard", 2);
          break;
        }
      }
    }

    if (pad.kind === "command" && state.ship.carryingId) {
      for (var j = 0; j < state.survivors.length; j += 1) {
        var carried = state.survivors[j];
        if (carried.id === state.ship.carryingId) {
          carried.status = "rescued";
          state.ship.carryingId = null;
          state.rescuedCount += 1;
          state.ship.fuel = Math.min(MAX_FUEL, state.ship.fuel + COMMAND_FUEL_BONUS);
          addMessage("Crew delivered", 2.2);
          if (state.rescuedCount === state.totalSurvivors) {
            state.mode = "win";
            syncOverlay();
          }
          break;
        }
      }
    }
  }

  function applyImpactDamage(amount, reason) {
    state.ship.hull = Math.max(0, state.ship.hull - amount);
    state.shake = Math.min(1, state.shake + amount / 100);
    addMessage(reason, 2);
    if (state.ship.hull <= 0) {
      failMission("Hull integrity collapsed.");
    }
  }

  function failMission(reason) {
    state.mode = "lose";
    state.lossReason = reason;
    syncOverlay();
  }

  function updateMessages(dt) {
    for (var i = state.messages.length - 1; i >= 0; i -= 1) {
      state.messages[i].life -= dt;
      if (state.messages[i].life <= 0) {
        state.messages.splice(i, 1);
      }
    }
  }

  function handleFlight(dt) {
    var ship = state.ship;
    ship.thrusting = false;

    if (state.touchdownTimer > 0) {
      state.touchdownTimer -= dt;
      if (state.touchdownTimer > 0) {
        return;
      }
    }

    if (keys.ArrowLeft) {
      ship.angle -= TURN_SPEED * dt;
    }
    if (keys.ArrowRight) {
      ship.angle += TURN_SPEED * dt;
    }
    ship.angle = clamp(ship.angle, -1.15, 1.15);

    if (keys.ArrowUp && ship.fuel > 0) {
      ship.thrusting = true;
      ship.vx += Math.sin(ship.angle) * THRUST * dt;
      ship.vy -= Math.cos(ship.angle) * THRUST * dt;
      ship.fuel = Math.max(0, ship.fuel - FUEL_BURN * dt);
    }

    ship.vy += GRAVITY * dt;
    ship.vx *= Math.pow(0.994, dt * 60);
    ship.vy *= Math.pow(0.998, dt * 60);
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    ship.x = clamp(ship.x, SHIP_RADIUS, WORLD_WIDTH - SHIP_RADIUS);

    if (ship.y < 70) {
      ship.y = 70;
      ship.vy = Math.max(ship.vy, 4);
    }

    if (ship.fuel <= 0 && ship.y < 120) {
      addMessage("Fuel dry", 1.3);
    }

    resolveTerrainCollision();

    if (ship.fuel <= 0 && getAltitude() > 400 && ship.vy > 18) {
      failMission("You drifted too high without enough fuel to recover.");
    }
  }

  function resolveTerrainCollision() {
    var ship = state.ship;
    var ground = surfaceYAt(ship.x, state.padMap, state.pads);
    var impactY = ship.y + SHIP_RADIUS;
    if (impactY < ground - PAD_HEIGHT) {
      return;
    }

    var pad = null;
    for (var i = 0; i < state.pads.length; i += 1) {
      var testPad = state.pads[i];
      var left = testPad.x - testPad.width / 2;
      var right = testPad.x + testPad.width / 2;
      if (ship.x >= left && ship.x <= right) {
        pad = testPad;
        break;
      }
    }

    var speedX = Math.abs(ship.vx);
    var speedY = Math.abs(ship.vy);
    var angleOff = Math.abs(ship.angle);

    if (pad && speedX <= LAND_SPEED_X && speedY <= LAND_SPEED_Y && angleOff <= SAFE_ANGLE) {
      landOnPad(pad);
      return;
    }

    ship.y = ground - SHIP_RADIUS - PAD_HEIGHT;
    ship.vy = -ship.vy * 0.18;
    ship.vx *= 0.45;
    ship.angle *= 0.4;

    if (pad && speedX <= HAZARD_SPEED_X && speedY <= HAZARD_SPEED_Y) {
      applyImpactDamage(18, "Hard landing");
      return;
    }

    failMission("The lander broke apart on impact.");
  }

  function updateSurvivors() {
    for (var i = 0; i < state.survivors.length; i += 1) {
      var survivor = state.survivors[i];
      if (survivor.status === "carried") {
        survivor.x = state.ship.x;
      }
    }
  }

  function updateCamera(dt) {
    var targetX = state.ship.x + state.ship.vx * 0.8 + CAMERA_AHEAD;
    var minCamera = canvas.width * 0.5 / VIEW_SCALE;
    var maxCamera = WORLD_WIDTH - minCamera;
    state.cameraX = clamp(lerp(state.cameraX, targetX, 2.2 * dt), minCamera, maxCamera);
    state.shake = Math.max(0, state.shake - dt * 1.7);
  }

  function update(dt) {
    if (!state) {
      return;
    }

    if (keys.KeyR) {
      keys.KeyR = false;
      restartGame();
      return;
    }

    if (state.mode !== "playing") {
      if (keys.Enter) {
        keys.Enter = false;
        if (state.mode === "ready") {
          startGame();
        } else {
          restartGame();
        }
      }
      updateMessages(dt);
      updateCamera(dt);
      updateHud();
      return;
    }

    handleFlight(dt);
    updateSurvivors();
    updateMessages(dt);
    updateCamera(dt);
    updateHud();
  }

  function worldToScreen(x, y) {
    var shakeX = (Math.random() - 0.5) * 18 * state.shake;
    var shakeY = (Math.random() - 0.5) * 18 * state.shake;
    return {
      x: (x - state.cameraX) * VIEW_SCALE + canvas.width / 2 + shakeX,
      y: y * VIEW_SCALE + shakeY
    };
  }

  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#132754");
    sky.addColorStop(0.45, "#081225");
    sky.addColorStop(1, "#02040a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < state.stars.length; i += 1) {
      var star = state.stars[i];
      var sx = ((star.x - state.cameraX * 0.16) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      sx = (sx / WORLD_WIDTH) * canvas.width;
      ctx.globalAlpha = star.a;
      ctx.fillStyle = "#f2f7ff";
      ctx.beginPath();
      ctx.arc(sx, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(141, 196, 255, 0.06)";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.82, 110, 52, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTerrain() {
    ctx.fillStyle = "#635c69";
    ctx.beginPath();
    var first = worldToScreen(0, surfaceYAt(0, state.padMap, state.pads));
    ctx.moveTo(first.x, first.y);
    for (var x = 0; x <= WORLD_WIDTH; x += 18) {
      var point = worldToScreen(x, surfaceYAt(x, state.padMap, state.pads));
      ctx.lineTo(point.x, point.y);
    }
    ctx.lineTo(canvas.width + 80, canvas.height + 80);
    ctx.lineTo(-80, canvas.height + 80);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#888095";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (var x2 = 0; x2 <= WORLD_WIDTH; x2 += 18) {
      var ridge = worldToScreen(x2, surfaceYAt(x2, state.padMap, state.pads));
      ctx.lineTo(ridge.x, ridge.y);
    }
    ctx.stroke();
  }

  function drawPads() {
    for (var i = 0; i < state.pads.length; i += 1) {
      var pad = state.pads[i];
      var left = worldToScreen(pad.x - pad.width / 2, state.padMap[pad.id]);
      var right = worldToScreen(pad.x + pad.width / 2, state.padMap[pad.id]);
      var color = "#9fd5ff";
      if (pad.kind === "fuel") {
        color = "#bff5a0";
      } else if (pad.kind === "pickup") {
        color = "#ffd27f";
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = "12px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(pad.label, (left.x + right.x) / 2, left.y - 14);
    }
  }

  function drawSurvivors() {
    for (var i = 0; i < state.survivors.length; i += 1) {
      var survivor = state.survivors[i];
      if (survivor.status !== "waiting") {
        continue;
      }
      var ground = state.padMap[survivor.padId];
      var pos = worldToScreen(survivor.x, ground - 14);
      ctx.fillStyle = survivor.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = survivor.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - 22);
      ctx.lineTo(pos.x, pos.y - 40 - Math.sin(performance.now() * 0.003 + i) * 6);
      ctx.stroke();
    }
  }

  function drawTargetMarker() {
    var target = getPrimaryTarget();
    if (!target || state.mode !== "playing") {
      return;
    }

    var targetScreen = worldToScreen(target.x, state.padMap[target.id] - 80);
    var shipScreen = worldToScreen(state.ship.x, state.ship.y - 30);
    ctx.strokeStyle = "rgba(180, 232, 255, 0.45)";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(shipScreen.x, shipScreen.y);
    ctx.lineTo(targetScreen.x, targetScreen.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#d7f5ff";
    ctx.beginPath();
    ctx.moveTo(targetScreen.x, targetScreen.y - 20);
    ctx.lineTo(targetScreen.x - 12, targetScreen.y - 40);
    ctx.lineTo(targetScreen.x + 12, targetScreen.y - 40);
    ctx.closePath();
    ctx.fill();
  }

  function drawShip() {
    var ship = state.ship;
    var pos = worldToScreen(ship.x, ship.y);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ship.angle);

    ctx.fillStyle = "#dce6f2";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(12, 12);
    ctx.lineTo(4, 9);
    ctx.lineTo(-4, 9);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#5a6f8b";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#8ac8ff";
    ctx.fillRect(-6, -6, 12, 8);

    if (ship.thrusting) {
      ctx.fillStyle = "#ffb95a";
      ctx.beginPath();
      ctx.moveTo(-6, 12);
      ctx.lineTo(0, 26 + Math.random() * 12);
      ctx.lineTo(6, 12);
      ctx.closePath();
      ctx.fill();
    }

    if (ship.carryingId) {
      ctx.fillStyle = "#fff5b4";
      ctx.beginPath();
      ctx.arc(0, 18, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGuidance() {
    if (state.mode !== "playing") {
      return;
    }
    var altitude = getAltitude();
    var ship = state.ship;
    var pos = worldToScreen(ship.x, ship.y - 58);
    ctx.fillStyle = "rgba(5, 12, 26, 0.82)";
    ctx.fillRect(pos.x - 64, pos.y - 22, 128, 44);
    ctx.strokeStyle = "rgba(151, 196, 255, 0.28)";
    ctx.strokeRect(pos.x - 64, pos.y - 22, 128, 44);

    var safeColor = Math.abs(ship.vy) <= LAND_SPEED_Y && Math.abs(ship.vx) <= LAND_SPEED_X && Math.abs(ship.angle) <= SAFE_ANGLE ? "#aef7b4" : "#ff9d8e";
    ctx.fillStyle = safeColor;
    ctx.font = "12px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("V " + ship.vy.toFixed(1) + "  H " + ship.vx.toFixed(1), pos.x, pos.y - 2);
    ctx.fillStyle = "#d2e6ff";
    ctx.fillText("ALT " + Math.max(0, Math.round(altitude)) + "  TILT " + Math.round(ship.angle * 57.3) + "°", pos.x, pos.y + 14);
  }

  function drawMessages() {
    if (!state.messages.length) {
      return;
    }
    for (var i = 0; i < state.messages.length; i += 1) {
      var msg = state.messages[i];
      var alpha = clamp(msg.life / 2, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(5, 12, 26, 0.78)";
      ctx.fillRect(26, 116 + i * 36, 260, 28);
      ctx.fillStyle = "#ecf5ff";
      ctx.font = "14px Trebuchet MS";
      ctx.textAlign = "left";
      ctx.fillText(msg.text, 40, 134 + i * 36);
    }
    ctx.globalAlpha = 1;
  }

  function drawWorld() {
    drawBackground();
    drawTerrain();
    drawPads();
    drawSurvivors();
    drawTargetMarker();
    drawShip();
    drawGuidance();
    drawMessages();
  }

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(640, Math.round(rect.width));
    var height = Math.max(420, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function frame(now) {
    resizeCanvas();
    if (!lastTime) {
      lastTime = now;
    }
    var dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    drawWorld();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", function (event) {
    if (event.code === "ArrowUp" || event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "Enter" || event.code === "KeyR" || event.code === "Space") {
      event.preventDefault();
    }
    keys[event.code] = true;
  });

  window.addEventListener("keyup", function (event) {
    keys[event.code] = false;
  });

  startButton.addEventListener("click", function () {
    if (!state || state.mode === "ready") {
      startGame();
    } else {
      restartGame();
    }
  });

  window.addEventListener("resize", resizeCanvas);

  resetGame();
  requestAnimationFrame(frame);
})();
