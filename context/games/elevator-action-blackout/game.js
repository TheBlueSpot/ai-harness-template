(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const startButton = document.getElementById("startButton");
  const docsCount = document.getElementById("docsCount");
  const livesCount = document.getElementById("livesCount");
  const alertState = document.getElementById("alertState");
  const timeCount = document.getElementById("timeCount");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const FLOOR_Y = [480, 400, 320, 240, 160, 80];
  const SHAFT_X = [280, 680];
  const FLOOR_LEFT = 80;
  const FLOOR_RIGHT = 880;
  const PLAYER_SPEED = 180;
  const GUARD_SPEED = 86;
  const BULLET_SPEED = 400;
  const ELEVATOR_SPEED = 130;

  const keys = new Set();

  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
      event.preventDefault();
    }
    keys.add(event.key.toLowerCase());
    if (event.key === " ") {
      keys.add("space");
    }
    if (event.key.toLowerCase() === "r") {
      if (state.mode !== "menu") resetGame();
    }
    if ((event.key === "Enter" || event.key === " ") && (state.mode === "menu" || state.mode === "win" || state.mode === "lose")) {
      startMission();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
    if (event.key === " ") {
      keys.delete("space");
    }
  });

  startButton.addEventListener("click", () => startMission());

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function floorIndexFromY(y) {
    let best = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < FLOOR_Y.length; i += 1) {
      const delta = Math.abs(FLOOR_Y[i] - y);
      if (delta < bestDelta) {
        best = i;
        bestDelta = delta;
      }
    }
    return best;
  }

  function createState() {
    const intel = [
      { x: 150, floor: 4, collected: false },
      { x: 820, floor: 3, collected: false },
      { x: 150, floor: 2, collected: false },
      { x: 810, floor: 1, collected: false }
    ];

    return {
      mode: "menu",
      clock: 0,
      lives: 3,
      alertTimer: 0,
      message: "Steal every red file and reach the lobby exit.",
      player: {
        x: 130,
        floor: 0,
        y: FLOOR_Y[0],
        w: 18,
        h: 30,
        facing: 1,
        cooldown: 0,
        hiddenTimer: 0,
        elevatorId: null
      },
      elevators: [
        {
          shaft: 0,
          x: SHAFT_X[0],
          y: FLOOR_Y[0],
          targetFloor: 0,
          doors: 1,
          direction: 0
        },
        {
          shaft: 1,
          x: SHAFT_X[1],
          y: FLOOR_Y[3],
          targetFloor: 3,
          doors: 1,
          direction: 0
        }
      ],
      guards: [
        { x: 780, floor: 0, dir: -1, alert: 0, cooldown: 0, stunned: 0, patrol: [730, 850] },
        { x: 170, floor: 2, dir: 1, alert: 0, cooldown: 0, stunned: 0, patrol: [130, 250] },
        { x: 730, floor: 4, dir: -1, alert: 0, cooldown: 0, stunned: 0, patrol: [650, 840] },
        { x: 530, floor: 5, dir: -1, alert: 0, cooldown: 0, stunned: 0, patrol: [370, 760] }
      ],
      bullets: [],
      enemyBullets: [],
      intel,
      exitUnlocked: false
    };
  }

  let state = createState();
  let lastTime = performance.now();

  function resetGame() {
    state = createState();
    state.mode = "menu";
    showOverlay("Elevator Action Blackout", "Steal the red files, route the lifts, and escape through the lobby.", "Start Mission");
  }

  function startMission() {
    if (state.mode === "playing") return;
    if (state.mode === "win" || state.mode === "lose") {
      state = createState();
    }
    state.mode = "playing";
    hideOverlay();
  }

  function showOverlay(title, text, buttonText) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function press(key) {
    return keys.has(key);
  }

  function updatePlaying(dt) {
    state.clock += dt;
    state.player.cooldown = Math.max(0, state.player.cooldown - dt);
    state.player.hiddenTimer = Math.max(0, state.player.hiddenTimer - dt);
    state.alertTimer = Math.max(0, state.alertTimer - dt);

    handlePlayer(dt);
    updateElevators(dt);
    updateGuards(dt);
    updateBullets(dt);
    collectIntel();
    maybeEscape();
  }

  function handlePlayer(dt) {
    const player = state.player;
    if (player.elevatorId !== null) {
      const elevator = state.elevators[player.elevatorId];
      player.x = elevator.x;
      player.y = elevator.y - 6;
      player.floor = floorIndexFromY(elevator.y);
      if (elevator.doors >= 1 && (press("arrowleft") || press("a") || press("arrowright") || press("d"))) {
        player.elevatorId = null;
      }
      return;
    }

    let move = 0;
    if (press("arrowleft") || press("a")) move -= 1;
    if (press("arrowright") || press("d")) move += 1;
    if (move !== 0) {
      player.facing = move > 0 ? 1 : -1;
    }
    player.x = clamp(player.x + move * PLAYER_SPEED * dt, FLOOR_LEFT, FLOOR_RIGHT);
    player.y = FLOOR_Y[player.floor];

    if ((press("arrowup") || press("w") || press("arrowdown") || press("s"))) {
      tryElevator(press("arrowup") || press("w") ? -1 : 1);
    }

    if (press("space") && player.cooldown === 0) {
      state.bullets.push({
        x: player.x + player.facing * 14,
        y: player.y - 14,
        vx: player.facing * BULLET_SPEED,
        ttl: 0.9
      });
      player.cooldown = 0.32;
    }
  }

  function tryElevator(direction) {
    const player = state.player;
    state.elevators.forEach((elevator, index) => {
      const currentFloor = floorIndexFromY(elevator.y);
      const close = Math.abs(elevator.x - player.x) < 20 && currentFloor === player.floor && elevator.doors >= 0.95;
      if (!close) return;
      const nextFloor = clamp(currentFloor + direction, 0, FLOOR_Y.length - 1);
      if (nextFloor === currentFloor) return;
      elevator.targetFloor = nextFloor;
      elevator.direction = Math.sign(nextFloor - currentFloor);
      elevator.doors = 0;
      player.elevatorId = index;
      player.x = elevator.x;
      player.y = elevator.y - 6;
    });
  }

  function updateElevators(dt) {
    state.elevators.forEach((elevator) => {
      const targetY = FLOOR_Y[elevator.targetFloor];
      if (Math.abs(targetY - elevator.y) > 1) {
        elevator.doors = Math.max(0, elevator.doors - dt * 2.3);
        elevator.y += Math.sign(targetY - elevator.y) * ELEVATOR_SPEED * dt;
        if (Math.abs(targetY - elevator.y) <= ELEVATOR_SPEED * dt) {
          elevator.y = targetY;
          elevator.direction = 0;
        }
      } else {
        elevator.y = targetY;
        elevator.doors = Math.min(1, elevator.doors + dt * 2.8);
      }
    });
  }

  function updateGuards(dt) {
    const player = state.player;
    state.guards.forEach((guard) => {
      guard.cooldown = Math.max(0, guard.cooldown - dt);
      guard.alert = Math.max(0, guard.alert - dt);
      guard.stunned = Math.max(0, guard.stunned - dt);
      if (guard.stunned > 0) {
        return;
      }

      const sameFloor = guard.floor === player.floor && player.elevatorId === null;
      const dx = player.x - guard.x;
      const seesPlayer = sameFloor && Math.sign(dx || guard.dir) === guard.dir && Math.abs(dx) < 180 && player.hiddenTimer === 0;
      if (seesPlayer) {
        guard.alert = 1.5;
        state.alertTimer = 1.5;
        guard.dir = Math.sign(dx) || guard.dir;
        guard.x += guard.dir * GUARD_SPEED * 1.2 * dt;
        if (Math.abs(dx) < 150 && guard.cooldown === 0) {
          state.enemyBullets.push({
            x: guard.x + guard.dir * 12,
            y: FLOOR_Y[guard.floor] - 14,
            vx: guard.dir * BULLET_SPEED * 0.9,
            ttl: 1.2
          });
          guard.cooldown = 0.7;
        }
      } else {
        guard.x += guard.dir * GUARD_SPEED * dt;
        if (guard.x <= guard.patrol[0] || guard.x >= guard.patrol[1]) {
          guard.dir *= -1;
        }
      }
      guard.x = clamp(guard.x, FLOOR_LEFT + 20, FLOOR_RIGHT - 20);

      if (sameFloor && Math.abs(dx) < 22) {
        hitPlayer();
      }
    });
  }

  function updateBullets(dt) {
    const player = state.player;
    state.bullets = state.bullets.filter((bullet) => {
      bullet.x += bullet.vx * dt;
      bullet.ttl -= dt;
      let live = bullet.ttl > 0 && bullet.x > FLOOR_LEFT && bullet.x < FLOOR_RIGHT;
      state.guards.forEach((guard) => {
        if (guard.stunned > 0) return;
        if (guard.floor === floorIndexFromY(bullet.y + 14) && Math.abs(guard.x - bullet.x) < 16) {
          guard.stunned = 2.6;
          guard.alert = 0;
          live = false;
        }
      });
      return live;
    });

    state.enemyBullets = state.enemyBullets.filter((bullet) => {
      bullet.x += bullet.vx * dt;
      bullet.ttl -= dt;
      const live = bullet.ttl > 0 && bullet.x > FLOOR_LEFT && bullet.x < FLOOR_RIGHT;
      if (live && player.elevatorId === null && player.floor === floorIndexFromY(bullet.y + 14) && Math.abs(player.x - bullet.x) < 14) {
        hitPlayer();
        return false;
      }
      return live;
    });
  }

  function hitPlayer() {
    const player = state.player;
    if (player.hiddenTimer > 0 || state.mode !== "playing") return;
    state.lives -= 1;
    player.hiddenTimer = 1.4;
    player.elevatorId = null;
    player.x = 130;
    player.floor = 0;
    player.y = FLOOR_Y[0];
    state.enemyBullets = [];
    if (state.lives <= 0) {
      state.mode = "lose";
      showOverlay("Mission Failed", "Security locked the tower down. Press Enter or use the button for an instant retry.", "Retry");
    }
  }

  function collectIntel() {
    const player = state.player;
    state.intel.forEach((doc) => {
      if (doc.collected) return;
      if (doc.floor === player.floor && Math.abs(doc.x - player.x) < 18 && player.elevatorId === null) {
        doc.collected = true;
      }
    });
    state.exitUnlocked = state.intel.every((doc) => doc.collected);
  }

  function maybeEscape() {
    const player = state.player;
    if (state.exitUnlocked && player.floor === 0 && player.x > 820) {
      state.mode = "win";
      showOverlay("Blackout Complete", "Files secured. You slipped back into the lobby before reinforcements arrived.", "Run Again");
    }
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawFloors();
    drawElevators();
    drawIntel();
    drawExit();
    drawGuards();
    drawBullets();
    drawPlayer();
    drawPrompt();
    updateHud();
  }

  function drawBackground() {
    ctx.fillStyle = "#08111a";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(21, 55, 82, 0.35)";
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(30 + i * 78, 24, 34, HEIGHT - 48);
    }
  }

  function drawFloors() {
    FLOOR_Y.forEach((y, index) => {
      ctx.fillStyle = index === 0 ? "#23394f" : "#1a2b3b";
      ctx.fillRect(FLOOR_LEFT, y + 8, FLOOR_RIGHT - FLOOR_LEFT, 8);
      ctx.fillStyle = "#6b8ba3";
      ctx.fillRect(FLOOR_LEFT, y + 16, FLOOR_RIGHT - FLOOR_LEFT, 2);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let x = FLOOR_LEFT; x < FLOOR_RIGHT; x += 44) {
        ctx.fillRect(x, y - 18, 20, 18);
      }
    });
  }

  function drawElevators() {
    state.elevators.forEach((elevator) => {
      ctx.fillStyle = "#173046";
      ctx.fillRect(elevator.x - 24, 20, 48, HEIGHT - 40);

      const cabY = elevator.y - 26;
      ctx.fillStyle = "#c9d6e3";
      ctx.fillRect(elevator.x - 20, cabY, 40, 34);
      ctx.fillStyle = "#0d1823";
      ctx.fillRect(elevator.x - 18, cabY + 2, 36 * elevator.doors, 30);

      ctx.fillStyle = elevator.direction === 0 ? "#6fe39b" : "#ffcf5b";
      ctx.beginPath();
      if (elevator.direction >= 0) {
        ctx.moveTo(elevator.x - 8, cabY - 12);
        ctx.lineTo(elevator.x + 8, cabY - 12);
        ctx.lineTo(elevator.x, cabY - 24);
      } else {
        ctx.moveTo(elevator.x - 8, cabY - 24);
        ctx.lineTo(elevator.x + 8, cabY - 24);
        ctx.lineTo(elevator.x, cabY - 12);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawIntel() {
    state.intel.forEach((doc) => {
      if (doc.collected) return;
      const y = FLOOR_Y[doc.floor] - 18;
      ctx.fillStyle = "#f05454";
      ctx.fillRect(doc.x - 9, y - 10, 18, 20);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(doc.x - 5, y - 6, 10, 2);
    });
  }

  function drawExit() {
    const unlocked = state.exitUnlocked;
    ctx.fillStyle = unlocked ? "#6fe39b" : "#aa5066";
    ctx.fillRect(836, FLOOR_Y[0] - 34, 34, 42);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(842, FLOOR_Y[0] - 26, 10, 12);
  }

  function drawGuards() {
    const player = state.player;
    state.guards.forEach((guard) => {
      const y = FLOOR_Y[guard.floor] - 28;
      if (guard.stunned === 0) {
        const coneLength = guard.alert > 0 ? 180 : 110;
        ctx.fillStyle = guard.alert > 0 ? "rgba(240, 84, 84, 0.18)" : "rgba(255, 207, 91, 0.12)";
        ctx.beginPath();
        ctx.moveTo(guard.x, y + 14);
        ctx.lineTo(guard.x + guard.dir * coneLength, y - 14);
        ctx.lineTo(guard.x + guard.dir * coneLength, y + 42);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = guard.stunned > 0 ? "#5b748f" : "#ffcf5b";
      ctx.fillRect(guard.x - 9, y, 18, 28);
      ctx.fillStyle = "#0b1119";
      ctx.fillRect(guard.x - 5, y + 8, 10, 12);

      if (guard.stunned > 0) {
        ctx.fillStyle = "#b7d8ff";
        ctx.fillText("Zz", guard.x - 8, y - 8);
      } else if (guard.floor === player.floor && Math.abs(player.x - guard.x) < 180) {
        ctx.fillStyle = "#f05454";
        ctx.fillText("!", guard.x - 2, y - 8);
      }
    });
  }

  function drawBullets() {
    ctx.fillStyle = "#dbe7f3";
    state.bullets.forEach((bullet) => {
      ctx.fillRect(bullet.x - 4, bullet.y - 2, 8, 4);
    });
    ctx.fillStyle = "#f05454";
    state.enemyBullets.forEach((bullet) => {
      ctx.fillRect(bullet.x - 4, bullet.y - 2, 8, 4);
    });
  }

  function drawPlayer() {
    const player = state.player;
    const y = player.y - 30;
    ctx.save();
    if (player.hiddenTimer > 0) {
      ctx.globalAlpha = 0.45 + Math.sin(state.clock * 30) * 0.2;
    }
    ctx.fillStyle = "#6fe39b";
    ctx.fillRect(player.x - 9, y, 18, 30);
    ctx.fillStyle = "#0d1823";
    ctx.fillRect(player.x - 5, y + 7, 10, 14);
    ctx.restore();
  }

  function drawPrompt() {
    const player = state.player;
    ctx.fillStyle = "#dbe7f3";
    ctx.font = "14px Trebuchet MS";

    if (player.elevatorId === null) {
      state.elevators.forEach((elevator) => {
        const currentFloor = floorIndexFromY(elevator.y);
        if (currentFloor === player.floor && elevator.doors >= 0.95 && Math.abs(elevator.x - player.x) < 26) {
          ctx.fillText("Up/Down: ride lift", elevator.x - 52, elevator.y - 38);
        }
      });
    }

    if (state.exitUnlocked) {
      ctx.fillText("Exit unlocked. Reach lobby door.", 690, 34);
    } else {
      ctx.fillText("Collect red files before the lobby exit unlocks.", 612, 34);
    }
  }

  function updateHud() {
    const total = state.intel.length;
    const collected = state.intel.filter((doc) => doc.collected).length;
    docsCount.textContent = collected + " / " + total;
    livesCount.textContent = String(state.lives);
    alertState.textContent = state.alertTimer > 0 ? "Spotted" : "Calm";
    alertState.style.color = state.alertTimer > 0 ? "#f05454" : "#6fe39b";
    timeCount.textContent = state.clock.toFixed(1) + "s";
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    if (state.mode === "playing") {
      updatePlaying(dt);
    }
    render();
    requestAnimationFrame(loop);
  }

  resetGame();
  requestAnimationFrame(loop);
}());
