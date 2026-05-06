(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const hud = {
    speed: document.getElementById("speed"),
    timer: document.getElementById("timer"),
    checkpoint: document.getElementById("checkpoint"),
    integrity: document.getElementById("integrity"),
    heat: document.getElementById("heat"),
    score: document.getElementById("score"),
    message: document.getElementById("message"),
  };

  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");

  const keys = new Set();
  const TOTAL_CHECKPOINTS = 5;
  const CHECKPOINT_SPACING = 1350;
  const DRAW_DISTANCE = 2200;
  const TRAFFIC_TARGET = 14;
  const RIVAL_TARGET = 5;
  const ROAD_HALF_WIDTH = 0.48;
  const PLAYER_Y = 596;

  function createPlayer() {
    return {
      z: 0,
      lateral: 0,
      speed: 220,
      integrity: 100,
      attackTimer: 0,
      attackCooldown: 0,
      recentHitTimer: 0,
      combo: 0,
      comboTimer: 0,
    };
  }

  const state = {
    screen: "start",
    timer: 28,
    checkpoint: 0,
    nextCheckpointZ: CHECKPOINT_SPACING,
    score: 0,
    player: createPlayer(),
    traffic: [],
    particles: [],
    message: "Weave traffic, swipe rivals, reach the next gate.",
    messageTimer: 0,
    lastTime: 0,
    pulse: 0,
  };

  function curveAt(z) {
    return (
      Math.sin(z * 0.0021) * 120 +
      Math.sin(z * 0.00083 + 0.9) * 90 +
      Math.sin(z * 0.00021 + 1.7) * 60
    );
  }

  function setMessage(text, duration) {
    state.message = text;
    state.messageTimer = duration;
    hud.message.textContent = text;
  }

  function resetGame() {
    state.screen = "running";
    state.timer = 28;
    state.checkpoint = 0;
    state.nextCheckpointZ = CHECKPOINT_SPACING;
    state.score = 0;
    state.traffic = [];
    state.particles = [];
    state.player = createPlayer();
    overlay.classList.add("overlay--hidden");
    setMessage("Thread traffic first. Swipe when a rival settles beside you.", 5);
    seedVehicles();
    updateHud();
  }

  function seedVehicles() {
    for (let i = 0; i < TRAFFIC_TARGET; i += 1) {
      spawnVehicle("traffic", 300 + i * 150);
    }
    for (let i = 0; i < RIVAL_TARGET; i += 1) {
      spawnVehicle("rival", 460 + i * 220);
    }
  }

  function spawnVehicle(kind, baseAhead) {
    const player = state.player;
    const z = player.z + baseAhead + Math.random() * 320;
    const laneBias = Math.random() * 2 - 1;
    state.traffic.push({
      kind,
      z,
      lateral: laneBias * 0.6,
      drift: Math.random() * Math.PI * 2,
      speed:
        kind === "rival"
          ? 165 + Math.random() * 55
          : 110 + Math.random() * 75,
      width: kind === "rival" ? 54 : 46,
      attackReady: 0,
    });
  }

  function recycleVehicle(vehicle) {
    const kind = vehicle.kind;
    const index = state.traffic.indexOf(vehicle);
    if (index >= 0) {
      state.traffic.splice(index, 1);
    }
    spawnVehicle(kind, 1300 + Math.random() * 500);
  }

  function failRun(text) {
    state.screen = "lose";
    overlay.classList.remove("overlay--hidden");
    overlayText.textContent = text;
  }

  function winRun() {
    state.screen = "win";
    overlay.classList.remove("overlay--hidden");
    overlayText.textContent =
      "You punched through the last checkpoint run. Traffic never stopped, but the sprint did.";
  }

  function hitPlayer(amount, text) {
    const player = state.player;
    if (player.recentHitTimer > 0) {
      return;
    }
    player.integrity = Math.max(0, player.integrity - amount);
    player.speed = Math.max(120, player.speed - 65);
    player.recentHitTimer = 0.65;
    setMessage(text, 1.5);
    emitBurst(canvas.width * 0.5 + player.lateral * 250, PLAYER_Y - 12, "#ff8a5b", 14);
    if (player.integrity <= 0) {
      failRun("Your bike folded under the traffic pressure. Press R to restart.");
    }
  }

  function emitBurst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() * 2 - 1) * 240,
        vy: -30 - Math.random() * 140,
        life: 0.45 + Math.random() * 0.35,
        color,
      });
    }
  }

  function project(z, lateral) {
    const dz = z - state.player.z;
    if (dz <= 0 || dz > DRAW_DISTANCE) {
      return null;
    }
    const depth = dz / DRAW_DISTANCE;
    const t = Math.pow(1 - depth, 1.55);
    const y = 120 + t * 525;
    const width = 74 + t * 470;
    const center = canvas.width * 0.5 + curveAt(z) - curveAt(state.player.z) * 0.38;
    return {
      x: center + lateral * width * 0.72,
      y,
      width,
      scale: 0.28 + t * 1.08,
      depth,
    };
  }

  function updateRunning(dt) {
    const player = state.player;

    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) {
        setMessage("Weave traffic, swipe rivals, reach the next gate.", 0);
      }
    }

    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.attackTimer = Math.max(0, player.attackTimer - dt);
    player.recentHitTimer = Math.max(0, player.recentHitTimer - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    if (player.comboTimer <= 0) {
      player.combo = 0;
    }

    const turnInput = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
    const throttle = keys.has("ArrowUp") || keys.has("w");
    const brake = keys.has("ArrowDown") || keys.has("s");

    const targetSpeed = throttle ? 340 : 240;
    const accel = throttle ? 135 : -90;
    player.speed += accel * dt;
    if (brake) {
      player.speed -= 180 * dt;
    }
    const roadGrip = Math.max(0.8, 1 - Math.abs(player.lateral) * 0.34);
    player.speed += (targetSpeed - player.speed) * dt * 0.45 * roadGrip;
    player.speed = Math.max(100, Math.min(360, player.speed));

    player.lateral += turnInput * dt * (1.18 - player.speed / 520);
    player.lateral *= 1 - Math.min(0.9, dt * 1.7);

    if (Math.abs(player.lateral) > ROAD_HALF_WIDTH) {
      player.speed -= 130 * dt;
      player.integrity = Math.max(0, player.integrity - 12 * dt);
      if (state.pulse <= 0) {
        setMessage("Shoulder dust. Pull back onto the lane.", 0.8);
      }
    }

    player.z += player.speed * dt;
    state.timer -= dt;
    state.pulse += dt;

    if (state.timer <= 0) {
      failRun("The sprint clock ran dry before the next checkpoint. Press R to restart.");
      return;
    }

    if (player.integrity <= 0) {
      failRun("Your bike broke apart. Press R to restart.");
      return;
    }

    if (player.z >= state.nextCheckpointZ) {
      state.checkpoint += 1;
      state.score += 600;
      state.timer += 8.5;
      player.integrity = Math.min(100, player.integrity + 12);
      state.nextCheckpointZ += CHECKPOINT_SPACING;
      if (state.checkpoint >= TOTAL_CHECKPOINTS) {
        winRun();
        return;
      }
      setMessage("Checkpoint hit. Sprint the next bend before traffic closes in.", 2.2);
    }

    for (const vehicle of [...state.traffic]) {
      vehicle.z += vehicle.speed * dt;
      vehicle.drift += dt * (vehicle.kind === "rival" ? 1.7 : 1.1);
      vehicle.lateral += Math.sin(vehicle.drift) * dt * (vehicle.kind === "rival" ? 0.2 : 0.12);
      vehicle.lateral = Math.max(-0.68, Math.min(0.68, vehicle.lateral));

      const dz = vehicle.z - player.z;
      if (vehicle.kind === "rival" && dz < 240 && dz > -40) {
        const seek = Math.sign(player.lateral - vehicle.lateral);
        vehicle.lateral += seek * dt * 0.44;
        if (Math.abs(vehicle.lateral - player.lateral) < 0.18 && dz < 120) {
          vehicle.attackReady = Math.min(1.2, vehicle.attackReady + dt);
        } else {
          vehicle.attackReady = Math.max(0, vehicle.attackReady - dt * 2);
        }
      } else {
        vehicle.attackReady = Math.max(0, vehicle.attackReady - dt);
      }

      if (dz < -120) {
        recycleVehicle(vehicle);
        continue;
      }

      const lateralGap = Math.abs(vehicle.lateral - player.lateral);
      if (Math.abs(dz) < 52 && lateralGap < 0.16) {
        hitPlayer(vehicle.kind === "rival" ? 26 : 18, vehicle.kind === "rival" ? "Rival clipped your flank." : "Traffic impact. Reset your line.");
        vehicle.z += 180;
        vehicle.lateral += (Math.random() * 2 - 1) * 0.26;
      } else if (vehicle.kind === "rival" && vehicle.attackReady > 0.85 && dz < 95 && lateralGap < 0.22) {
        hitPlayer(16, "Late swipe. Rival shoulder-checks your lane.");
        vehicle.attackReady = 0;
        vehicle.z += 110;
      }
    }

    for (const particle of [...state.particles]) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 240 * dt;
      if (particle.life <= 0) {
        state.particles.splice(state.particles.indexOf(particle), 1);
      }
    }

    updateHud();
  }

  function swipe() {
    if (state.screen !== "running") {
      return;
    }
    const player = state.player;
    if (player.attackCooldown > 0) {
      return;
    }

    player.attackCooldown = 0.4;
    player.attackTimer = 0.18;
    let bestTarget = null;
    let bestDistance = Infinity;

    for (const vehicle of state.traffic) {
      const dz = vehicle.z - player.z;
      const lateralGap = Math.abs(vehicle.lateral - player.lateral);
      if (dz > -30 && dz < 115 && lateralGap < 0.28) {
        const score = Math.abs(dz) + lateralGap * 200 - (vehicle.kind === "rival" ? 40 : 0);
        if (score < bestDistance) {
          bestDistance = score;
          bestTarget = vehicle;
        }
      }
    }

    if (!bestTarget) {
      setMessage("Air swing. Hold the line until a rider settles beside you.", 0.9);
      return;
    }

    const bonus = bestTarget.kind === "rival" ? 220 : 110;
    player.combo = Math.min(5, player.combo + 1);
    player.comboTimer = 2.4;
    state.score += bonus * player.combo;
    state.timer += bestTarget.kind === "rival" ? 1.1 : 0.45;
    emitBurst(canvas.width * 0.5 + player.lateral * 250, PLAYER_Y - 18, "#ffd977", 18);
    recycleVehicle(bestTarget);
    if (bestTarget.kind === "rival") {
      setMessage("Clean swipe. Rival down, clock breathing again.", 1.2);
    } else {
      setMessage("Handlebar check. Traffic cracked open for a moment.", 1.2);
    }
    updateHud();
  }

  function updateHud() {
    const player = state.player;
    hud.speed.textContent = `${Math.round(player.speed)} mph`;
    hud.timer.textContent = `${Math.max(0, state.timer).toFixed(1)}s`;
    hud.checkpoint.textContent = `CP ${state.checkpoint}/${TOTAL_CHECKPOINTS}`;
    hud.integrity.textContent = `Bike ${Math.max(0, Math.round(player.integrity))}%`;
    hud.score.textContent = `Score ${state.score}`;

    const nearbyCount = state.traffic.filter((vehicle) => {
      const dz = vehicle.z - player.z;
      return dz > 0 && dz < 230 && Math.abs(vehicle.lateral - player.lateral) < 0.24;
    }).length;
    const pressure = nearbyCount >= 3 ? "Pressure high" : nearbyCount === 2 ? "Pressure rising" : nearbyCount === 1 ? "Pressure live" : "Pressure low";
    hud.heat.textContent = pressure;
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#2d1733");
    sky.addColorStop(0.42, "#c66b3d");
    sky.addColorStop(0.58, "#1a2a3f");
    sky.addColorStop(1, "#071019");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255, 215, 138, 0.14)";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.18, 120, 74, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 12; i += 1) {
      const x = (i / 11) * canvas.width;
      const height = 60 + ((i * 29) % 120);
      ctx.fillStyle = "rgba(15, 19, 28, 0.55)";
      ctx.fillRect(x - 16, 190 - height, 32, height);
    }
  }

  function drawRoad() {
    const strips = 68;
    for (let i = strips; i > 0; i -= 1) {
      const nearT = i / strips;
      const farT = (i - 1) / strips;
      const zNear = state.player.z + (1 - nearT) * DRAW_DISTANCE;
      const zFar = state.player.z + (1 - farT) * DRAW_DISTANCE;
      const yNear = 120 + Math.pow(nearT, 1.55) * 525;
      const yFar = 120 + Math.pow(farT, 1.55) * 525;
      const centerNear = canvas.width * 0.5 + curveAt(zNear) - curveAt(state.player.z) * 0.38;
      const centerFar = canvas.width * 0.5 + curveAt(zFar) - curveAt(state.player.z) * 0.38;
      const roadNear = 74 + Math.pow(nearT, 1.55) * 470;
      const roadFar = 74 + Math.pow(farT, 1.55) * 470;

      ctx.fillStyle = i % 2 === 0 ? "#405033" : "#35452a";
      ctx.beginPath();
      ctx.moveTo(centerFar - roadFar * 0.9, yFar);
      ctx.lineTo(centerFar + roadFar * 0.9, yFar);
      ctx.lineTo(centerNear + roadNear * 0.9, yNear);
      ctx.lineTo(centerNear - roadNear * 0.9, yNear);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = i % 3 === 0 ? "#7f807b" : "#6f706c";
      ctx.beginPath();
      ctx.moveTo(centerFar - roadFar * 0.72, yFar);
      ctx.lineTo(centerFar + roadFar * 0.72, yFar);
      ctx.lineTo(centerNear + roadNear * 0.72, yNear);
      ctx.lineTo(centerNear - roadNear * 0.72, yNear);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = i % 2 === 0 ? "#1d1e24" : "#14161c";
      ctx.beginPath();
      ctx.moveTo(centerFar - roadFar * 0.66, yFar);
      ctx.lineTo(centerFar + roadFar * 0.66, yFar);
      ctx.lineTo(centerNear + roadNear * 0.66, yNear);
      ctx.lineTo(centerNear - roadNear * 0.66, yNear);
      ctx.closePath();
      ctx.fill();

      if (i % 6 < 3) {
        ctx.fillStyle = "#f5e7a2";
        ctx.beginPath();
        ctx.moveTo(centerFar - roadFar * 0.02, yFar);
        ctx.lineTo(centerFar + roadFar * 0.02, yFar);
        ctx.lineTo(centerNear + roadNear * 0.02, yNear);
        ctx.lineTo(centerNear - roadNear * 0.02, yNear);
        ctx.closePath();
        ctx.fill();
      }
    }

    const dz = state.nextCheckpointZ - state.player.z;
    if (dz > 0 && dz < DRAW_DISTANCE) {
      const gate = project(state.nextCheckpointZ, 0);
      if (gate) {
        const gateWidth = gate.width * 0.9;
        const gateHeight = 80 * gate.scale;
        ctx.strokeStyle = "rgba(255, 218, 126, 0.95)";
        ctx.lineWidth = Math.max(2, 8 * gate.scale);
        ctx.beginPath();
        ctx.moveTo(gate.x - gateWidth * 0.5, gate.y);
        ctx.lineTo(gate.x - gateWidth * 0.5, gate.y - gateHeight);
        ctx.lineTo(gate.x + gateWidth * 0.5, gate.y - gateHeight);
        ctx.lineTo(gate.x + gateWidth * 0.5, gate.y);
        ctx.stroke();
      }
    }
  }

  function drawVehicle(vehicle) {
    const p = project(vehicle.z, vehicle.lateral);
    if (!p) {
      return;
    }

    const width = vehicle.width * p.scale;
    const height = width * 1.7;
    const x = p.x;
    const y = p.y;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = vehicle.kind === "rival" ? "#db4848" : "#63a1ff";
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.62);
    ctx.lineTo(width * 0.58, -height * 0.12);
    ctx.lineTo(width * 0.46, height * 0.62);
    ctx.lineTo(-width * 0.46, height * 0.62);
    ctx.lineTo(-width * 0.58, -height * 0.12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(-width * 0.22, -height * 0.18, width * 0.44, height * 0.3);
    ctx.fillStyle = "#14161c";
    ctx.fillRect(-width * 0.26, height * 0.26, width * 0.52, height * 0.12);

    if (vehicle.kind === "rival" && vehicle.attackReady > 0.4) {
      ctx.strokeStyle = `rgba(255, 122, 92, ${Math.min(0.9, vehicle.attackReady)})`;
      ctx.lineWidth = Math.max(2, 5 * p.scale);
      ctx.beginPath();
      ctx.arc(0, 0, width * 0.95, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const player = state.player;
    const bottomCenter = canvas.width * 0.5 + player.lateral * 255;
    const recentAlpha = player.recentHitTimer > 0 ? 0.45 + Math.sin(state.pulse * 36) * 0.2 : 0;

    if (player.attackTimer > 0) {
      const direction = player.lateral >= 0 ? 1 : -1;
      ctx.strokeStyle = "#ffd977";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(bottomCenter, PLAYER_Y - 16, 48, direction < 0 ? Math.PI * 0.15 : Math.PI * 0.85, direction < 0 ? Math.PI * 1.08 : Math.PI * 1.78);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(bottomCenter, PLAYER_Y);
    ctx.fillStyle = "#f0f2f5";
    ctx.beginPath();
    ctx.moveTo(0, -56);
    ctx.lineTo(26, -10);
    ctx.lineTo(18, 44);
    ctx.lineTo(-18, 44);
    ctx.lineTo(-26, -10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1c2330";
    ctx.fillRect(-12, -6, 24, 26);
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(-6, -46, 12, 16);

    if (recentAlpha > 0) {
      ctx.fillStyle = `rgba(255, 94, 91, ${recentAlpha})`;
      ctx.fillRect(-34, -60, 68, 116);
    }
    ctx.restore();

    for (const vehicle of state.traffic) {
      const dz = vehicle.z - player.z;
      const lateralGap = vehicle.lateral - player.lateral;
      if (vehicle.kind === "rival" && dz > 10 && dz < 150 && Math.abs(lateralGap) < 0.25) {
        const side = Math.sign(lateralGap) || 1;
        ctx.strokeStyle = "rgba(255, 94, 91, 0.85)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(bottomCenter, PLAYER_Y - 6, 68, side < 0 ? Math.PI * 0.9 : Math.PI * 0.1, side < 0 ? Math.PI * 1.38 : Math.PI * 0.62);
        ctx.stroke();
      }
    }
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = Math.max(0, particle.life * 1.2);
      ctx.fillRect(particle.x, particle.y, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawRunning() {
    drawBackground();
    drawRoad();

    const sorted = [...state.traffic].sort((a, b) => b.z - a.z);
    for (const vehicle of sorted) {
      drawVehicle(vehicle);
    }

    drawPlayer();
    drawParticles();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.screen === "running") {
      drawRunning();
    } else {
      drawBackground();
      drawRoad();
      if (state.player) {
        drawPlayer();
      }
    }
  }

  function frame(time) {
    const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0.016);
    state.lastTime = time;

    if (state.screen === "running") {
      updateRunning(dt);
    }

    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.add(key);

    if (event.code === "Space") {
      event.preventDefault();
      swipe();
    }

    if (event.key === "Enter" && state.screen === "start") {
      resetGame();
    }

    if (event.key.toLowerCase() === "r" && state.screen !== "running") {
      resetGame();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  });

  render();
  requestAnimationFrame(frame);
})();
