(function () {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const WORLD_WIDTH = 2600;
  const WORLD_HEIGHT = 1800;
  const STAGE_COUNT = 3;
  const LEVELS = [
    { targetMass: 170, blooms: 2, food: 120, drifters: 14, hunters: 3, vortices: 2, tint: "#1f7ca8" },
    { targetMass: 245, blooms: 3, food: 140, drifters: 18, hunters: 5, vortices: 3, tint: "#20868c" },
    { targetMass: 325, blooms: 4, food: 165, drifters: 22, hunters: 7, vortices: 4, tint: "#228d74" },
  ];
  const PLAYER_START_MASS = 55;
  const PLAYER_STAGE_CARRY_FLOOR = 62;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalize(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length, length };
  }

  function radiusFromMass(mass) {
    return Math.sqrt(mass) * 2.55;
  }

  function massFromRadius(radius) {
    return (radius / 2.55) ** 2;
  }

  function clampMagnitude(x, y, max) {
    const magnitude = Math.hypot(x, y);
    if (!magnitude || magnitude <= max) {
      return { x, y, magnitude };
    }
    const scale = max / magnitude;
    return { x: x * scale, y: y * scale, magnitude: max };
  }

  function circleContains(a, b, cushion = 0) {
    return distance(a, b) < a.r + b.r + cushion;
  }

  function worldPoint(margin = 120) {
    return {
      x: rand(margin, WORLD_WIDTH - margin),
      y: rand(margin, WORLD_HEIGHT - margin),
    };
  }

  function makeFood() {
    const point = worldPoint(70);
    const radius = rand(5, 10);
    return {
      x: point.x,
      y: point.y,
      r: radius,
      vx: rand(-12, 12),
      vy: rand(-12, 12),
      hue: rand(150, 200),
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function makeCell(kind, minRadius, maxRadius) {
    const point = worldPoint(120);
    const radius = rand(minRadius, maxRadius);
    const angle = rand(0, Math.PI * 2);
    return {
      kind,
      x: point.x,
      y: point.y,
      r: radius,
      mass: massFromRadius(radius),
      vx: Math.cos(angle) * rand(25, 65),
      vy: Math.sin(angle) * rand(25, 65),
      hue: kind === "hunter" ? rand(8, 18) : rand(90, 130),
      wobble: Math.random() * Math.PI * 2,
      damageCooldown: 0,
    };
  }

  function makeVortex(index) {
    const point = worldPoint(300);
    return {
      x: point.x,
      y: point.y,
      r: rand(170, 260),
      strength: rand(38, 62),
      spin: index % 2 === 0 ? 1 : -1,
    };
  }

  function makeBloomAnchor() {
    const point = worldPoint(240);
    return {
      x: point.x,
      y: point.y,
      r: rand(24, 32),
      charged: false,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  class Game {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector("#game");
      this.ctx = this.canvas.getContext("2d");
      this.overlay = root.querySelector("#overlay");
      this.overlayEyebrow = root.querySelector("#overlay-eyebrow");
      this.overlayTitle = root.querySelector("#overlay-title");
      this.overlayCopy = root.querySelector("#overlay-copy");
      this.overlayButton = root.querySelector("#overlay-button");
      this.hud = {
        stage: root.querySelector("#stage-value"),
        mass: root.querySelector("#mass-value"),
        target: root.querySelector("#target-value"),
        bloom: root.querySelector("#bloom-value"),
        health: root.querySelector("#health-value"),
      };
      this.focus = {
        card: root.querySelector("#focus-card"),
        headline: root.querySelector("#focus-headline"),
        copy: root.querySelector("#focus-copy"),
        progressLabel: root.querySelector("#focus-progress-label"),
        progressValue: root.querySelector("#focus-progress-value"),
        progressFill: root.querySelector("#focus-progress-fill"),
        steps: {
          grow: root.querySelector("#focus-step-grow"),
          avoid: root.querySelector("#focus-step-avoid"),
          exit: root.querySelector("#focus-step-exit"),
        },
      };

      this.input = {
        up: false,
        down: false,
        left: false,
        right: false,
        pulse: false,
      };

      this.particles = [];
      this.particleTimers = {
        blooms: 0,
        gate: 0,
        vortices: 0,
      };
      this.camera = { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.5 };
      this.lastTime = 0;
      this.focusState = {
        headline: "Grow before you cross",
        copy: "Eat teal and lime cells first. Fill the meter, then cut right through the bloom gate.",
      };
      this.guideTarget = null;

      this.resetCampaign();
      this.bindEvents();
      this.syncOverlay();
      this.updateHud();
      this.resize();
      requestAnimationFrame((time) => this.frame(time));
    }

    resetCampaign() {
      this.mode = "menu";
      this.levelIndex = 0;
      this.scoreMass = 0;
      this.player = null;
      this.food = [];
      this.cells = [];
      this.blooms = [];
      this.vortices = [];
      this.gate = null;
      this.message = "Absorb smaller drift cells first.";
      this.stageFlash = 0;
      this.buildLevel(0, true);
    }

    buildLevel(index, freshRun = false) {
      const level = LEVELS[index];
      const startPoint = { x: 260, y: WORLD_HEIGHT * 0.5 };
      const baseMass = freshRun ? PLAYER_START_MASS : Math.max(PLAYER_STAGE_CARRY_FLOOR, this.player.mass * 0.7);
      this.player = {
        x: startPoint.x,
        y: startPoint.y,
        vx: 8,
        vy: 0,
        mass: baseMass,
        r: radiusFromMass(baseMass),
        health: 100,
        pulseCooldown: 0,
        hurtFlash: 0,
      };

      this.food = Array.from({ length: level.food }, () => makeFood());
      this.cells = [
        ...Array.from({ length: level.drifters }, () => makeCell("drifter", 11, 24)),
        ...Array.from({ length: level.hunters }, () => makeCell("hunter", 24, 39)),
      ];
      this.blooms = Array.from({ length: level.blooms }, () => makeBloomAnchor());
      this.vortices = Array.from({ length: level.vortices }, (_, idx) => makeVortex(idx));
      this.gate = {
        x: WORLD_WIDTH - 220,
        y: WORLD_HEIGHT * 0.5 + rand(-220, 220),
        r: 58,
        open: false,
      };
      this.message = `Stage ${index + 1}: build mass and charge each bloom anchor before crossing the gate.`;
      this.focusState.headline = "Eat smaller cells";
      this.focusState.copy = "Follow the green marker to safe prey, then charge the cyan bloom anchors before crossing the gate.";
      this.guideTarget = null;
      this.stageFlash = 1;
      this.camera.x = this.player.x;
      this.camera.y = this.player.y;
    }

    bindEvents() {
      const keyMap = {
        ArrowUp: "up",
        KeyW: "up",
        ArrowDown: "down",
        KeyS: "down",
        ArrowLeft: "left",
        KeyA: "left",
        ArrowRight: "right",
        KeyD: "right",
        Space: "pulse",
      };

      window.addEventListener("keydown", (event) => {
        if (event.code === "Enter") {
          if (this.mode === "menu" || this.mode === "win" || this.mode === "lose") {
            this.start();
          }
        }
        if (event.code === "KeyR") {
          this.resetCampaign();
          this.syncOverlay();
          return;
        }

        const action = keyMap[event.code];
        if (action) {
          this.input[action] = true;
          event.preventDefault();
        }
      });

      window.addEventListener("keyup", (event) => {
        const action = keyMap[event.code];
        if (action) {
          this.input[action] = false;
          event.preventDefault();
        }
      });

      this.overlayButton.addEventListener("click", () => this.start());
      window.addEventListener("resize", () => this.resize());

      if (window.location.search.includes("autostart=1")) {
        this.start();
      }
    }

    resize() {
      const ratio = WIDTH / HEIGHT;
      const bounds = this.canvas.getBoundingClientRect();
      if (Math.abs(bounds.width / bounds.height - ratio) > 0.02) {
        this.canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
      }
    }

    start() {
      if (this.mode === "menu" || this.mode === "win" || this.mode === "lose") {
        this.mode = "playing";
        this.syncOverlay();
      }
    }

    finishLose(copy) {
      this.mode = "lose";
      this.message = copy;
      this.overlayEyebrow.textContent = "pool collapse";
      this.overlayTitle.textContent = "Cell Membrane Ruptured";
      this.overlayCopy.textContent = copy;
      this.overlayButton.textContent = "Retry Drift";
      this.syncOverlay();
    }

    finishWin() {
      this.mode = "win";
      this.message = "All three pools cleared.";
      this.overlayEyebrow.textContent = "full bloom";
      this.overlayTitle.textContent = "Pool Dominated";
      this.overlayCopy.textContent =
        "You crossed every bloom gate with enough mass to hold shape under pressure. Restart and route a cleaner growth line.";
      this.overlayButton.textContent = "Run Again";
      this.syncOverlay();
    }

    syncOverlay() {
      const hidden = this.mode === "playing";
      this.overlay.setAttribute("aria-hidden", hidden ? "true" : "false");
      this.root.dataset.mode = this.mode;

      if (this.mode === "menu") {
        this.overlayEyebrow.textContent = "fluid predator playground";
        this.overlayTitle.textContent = "Osmos Drift Pool";
        this.overlayCopy.textContent =
          "Step 1: eat smaller teal and lime cells. Step 2: charge each cyan bloom anchor. Step 3: stay away from larger orange hunters and current wells. Step 4: once mass and bloom goals fill, follow the bright bloom gate on the far right.";
        this.overlayButton.textContent = "Start Drift";
      }
    }

    frame(time) {
      const dt = Math.min(0.033, (time - this.lastTime || 16.7) / 1000);
      this.lastTime = time;
      this.update(dt);
      this.render();
      requestAnimationFrame((next) => this.frame(next));
    }

    update(dt) {
      if (this.mode === "playing") {
        this.updatePlayer(dt);
        this.updateFood(dt);
        this.updateCells(dt);
        this.updateBlooms(dt);
        this.updateVortices(dt);
        this.updateGate(dt);
        this.emitAmbientParticles(dt);
        this.updateParticles(dt);
        this.updateGuidance();
        this.camera.x = lerp(this.camera.x, this.player.x, 0.08);
        this.camera.y = lerp(this.camera.y, this.player.y, 0.08);
      } else {
        this.updateParticles(dt);
      }

      this.updateHud();
    }

    updatePlayer(dt) {
      const dirX = Number(this.input.right) - Number(this.input.left);
      const dirY = Number(this.input.down) - Number(this.input.up);
      const direction = normalize(dirX, dirY);
      const moving = Boolean(dirX || dirY);
      const sizeRatio = clamp((this.player.r - 18) / 10, 0, 1);
      const thrustScalar = lerp(0.6, 1, sizeRatio);

      if (moving) {
        const thrust = (190 / Math.sqrt(this.player.r)) * thrustScalar;
        this.player.vx += direction.x * thrust * dt;
        this.player.vy += direction.y * thrust * dt;
        this.player.mass = Math.max(40, this.player.mass - dt * 1.9);
        for (let index = 0; index < 2; index += 1) {
          this.spawnParticle(this.player.x - direction.x * this.player.r, this.player.y - direction.y * this.player.r, {
            life: rand(0.32, 0.52),
            r: rand(2, 6),
            hue: 186 + rand(-8, 8),
            vx: -direction.x * rand(25, 70) + rand(-14, 14),
            vy: -direction.y * rand(25, 70) + rand(-14, 14),
            alpha: rand(0.3, 0.5),
          });
        }
      }

      if (this.input.pulse && this.player.pulseCooldown <= 0 && this.player.mass > 70) {
        this.player.pulseCooldown = 1.2;
        this.player.mass = Math.max(44, this.player.mass - 16);
        for (const cell of this.cells) {
          const dx = cell.x - this.player.x;
          const dy = cell.y - this.player.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < 240) {
            const push = (240 - dist) * 2.1;
            cell.vx += (dx / dist) * push;
            cell.vy += (dy / dist) * push;
          }
        }
        for (let index = 0; index < 18; index += 1) {
          const angle = (index / 18) * Math.PI * 2;
          this.spawnParticle(this.player.x, this.player.y, {
            life: 0.8,
            r: rand(4, 9),
            hue: 192,
            vx: Math.cos(angle) * rand(80, 220),
            vy: Math.sin(angle) * rand(80, 220),
            alpha: 0.65,
          });
        }
        this.message = "Burst pulse spends mass but clears hunter space.";
      }

      this.player.pulseCooldown = Math.max(0, this.player.pulseCooldown - dt);
      this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt * 2.4);

      this.player.r = radiusFromMass(this.player.mass);
      const drag = moving ? 0.984 : 0.968;
      this.player.vx *= drag;
      this.player.vy *= drag;
      const limitedVelocity = clampMagnitude(this.player.vx, this.player.vy, moving ? 138 : 124);
      this.player.vx = limitedVelocity.x;
      this.player.vy = limitedVelocity.y;
      this.player.x += this.player.vx * dt * 60;
      this.player.y += this.player.vy * dt * 60;
      this.keepInside(this.player, 28);

      if (this.player.health <= 0 || this.player.mass <= 42) {
        this.finishLose("A larger colony tore through the membrane before the bloom gate opened.");
      }
    }

    updateFood(dt) {
      for (let index = this.food.length - 1; index >= 0; index -= 1) {
        const orb = this.food[index];
        orb.pulse += dt * 2.2;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        orb.vx += Math.sin(orb.pulse + index) * 2.4 * dt;
        orb.vy += Math.cos(orb.pulse * 0.7 + index * 0.4) * 2.4 * dt;
        orb.vx *= 0.998;
        orb.vy *= 0.998;
        this.keepInside(orb, 18);

        if (circleContains(this.player, orb, -2)) {
          this.player.mass += orb.r * 1.3;
          this.scoreMass += orb.r * 0.8;
          this.food.splice(index, 1);
          this.spawnParticle(orb.x, orb.y, { life: 0.55, r: orb.r, hue: orb.hue, vx: 0, vy: 0, alpha: 0.7 });
          this.spawnBurst(orb.x, orb.y, orb.hue, 5);
        }
      }

      const desired = LEVELS[this.levelIndex].food;
      while (this.food.length < desired) {
        this.food.push(makeFood());
      }
    }

    updateCells(dt) {
      for (let index = this.cells.length - 1; index >= 0; index -= 1) {
        const cell = this.cells[index];
        cell.damageCooldown = Math.max(0, cell.damageCooldown - dt);
        cell.wobble += dt * (0.7 + cell.r * 0.02);

        const dx = this.player.x - cell.x;
        const dy = this.player.y - cell.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const playerIsBigger = this.player.r > cell.r * 1.08;
        const cellIsBigger = cell.r > this.player.r * 1.08;
        const fearRange = 280 + cell.r * 5;
        const huntRange = 360 + cell.r * 4;

        if (cell.kind === "hunter") {
          if (dist < huntRange) {
            cell.vx += nx * dt * 40;
            cell.vy += ny * dt * 40;
          }
        } else if (cellIsBigger && dist < fearRange) {
          cell.vx += nx * dt * 16;
          cell.vy += ny * dt * 16;
        } else if (playerIsBigger && dist < fearRange) {
          cell.vx -= nx * dt * 22;
          cell.vy -= ny * dt * 22;
        } else {
          cell.vx += Math.sin(cell.wobble + index) * dt * 8;
          cell.vy += Math.cos(cell.wobble * 0.9 + index) * dt * 8;
        }

        cell.vx = clamp(cell.vx, -90, 90);
        cell.vy = clamp(cell.vy, -90, 90);
        cell.x += cell.vx * dt;
        cell.y += cell.vy * dt;
        this.keepInside(cell, 28);

        if (!circleContains(this.player, cell)) {
          continue;
        }

        if (playerIsBigger) {
          this.player.mass += cell.mass * 0.3;
          this.scoreMass += cell.mass * 0.5;
          this.cells.splice(index, 1);
          this.spawnBurst(cell.x, cell.y, cell.hue, Math.max(8, Math.floor(cell.r / 3)));
          continue;
        }

        if (cellIsBigger && cell.damageCooldown <= 0) {
          cell.damageCooldown = 0.55;
          this.player.health = Math.max(0, this.player.health - 14);
          this.player.mass = Math.max(40, this.player.mass - 12);
          this.player.hurtFlash = 1;
          this.player.vx -= nx * 12;
          this.player.vy -= ny * 12;
          this.spawnBurst(this.player.x, this.player.y, 18, 10);
          this.message = "Hunter contact strips mass fast. Pulse or cut the line.";
        }
      }

      const level = LEVELS[this.levelIndex];
      const drifters = this.cells.filter((cell) => cell.kind === "drifter").length;
      const hunters = this.cells.filter((cell) => cell.kind === "hunter").length;
      while (drifters < level.drifters) {
        this.cells.push(makeCell("drifter", 11, 24));
        break;
      }
      while (hunters < level.hunters) {
        this.cells.push(makeCell("hunter", 24, 39));
        break;
      }
    }

    updateBlooms(dt) {
      for (const bloom of this.blooms) {
        bloom.pulse += dt * (bloom.charged ? 4.8 : 2.6);
        if (bloom.charged) {
          continue;
        }

        if (!circleContains(this.player, bloom, 6)) {
          continue;
        }

        bloom.charged = true;
        this.message = "Bloom anchor charged. Finish the rest so the gate can stabilize.";
        this.spawnBurst(bloom.x, bloom.y, 174, 18);
      }
    }

    updateVortices(dt) {
      for (const vortex of this.vortices) {
        this.applyVortex(this.player, vortex, dt, 0.72);
        for (const food of this.food) {
          this.applyVortex(food, vortex, dt, 0.42);
        }
        for (const cell of this.cells) {
          this.applyVortex(cell, vortex, dt, cell.kind === "hunter" ? 0.9 : 0.6);
        }
      }
    }

    applyVortex(body, vortex, dt, scale) {
      const dx = vortex.x - body.x;
      const dy = vortex.y - body.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > vortex.r) {
        return;
      }
      const t = 1 - dist / vortex.r;
      const nx = dx / dist;
      const ny = dy / dist;
      body.vx += nx * vortex.strength * t * dt * scale;
      body.vy += ny * vortex.strength * t * dt * scale;
      body.vx += -ny * vortex.spin * vortex.strength * 0.38 * t * dt * scale;
      body.vy += nx * vortex.spin * vortex.strength * 0.38 * t * dt * scale;
    }

    updateGate() {
      const level = LEVELS[this.levelIndex];
      const bloomsReady = this.blooms.every((bloom) => bloom.charged);
      this.gate.open = this.player.mass >= level.targetMass && bloomsReady;
      if (this.gate.open) {
        this.message = "Bloom gate open. Cross the bright ring.";
      }

      if (this.gate.open && circleContains(this.player, this.gate, 10)) {
        if (this.levelIndex === STAGE_COUNT - 1) {
          this.finishWin();
        } else {
          this.levelIndex += 1;
          this.buildLevel(this.levelIndex);
        }
      }
    }

    emitAmbientParticles(dt) {
      this.particleTimers.blooms = Math.max(0, this.particleTimers.blooms - dt);
      this.particleTimers.gate = Math.max(0, this.particleTimers.gate - dt);
      this.particleTimers.vortices = Math.max(0, this.particleTimers.vortices - dt);

      if (this.particleTimers.blooms <= 0) {
        this.particleTimers.blooms = 0.09;
        for (const bloom of this.blooms) {
          const angle = rand(0, Math.PI * 2);
          const orbitRadius = bloom.r * rand(0.72, 1.24);
          const outward = bloom.charged ? rand(18, 44) : rand(10, 24);
          this.spawnParticle(
            bloom.x + Math.cos(angle) * orbitRadius,
            bloom.y + Math.sin(angle) * orbitRadius,
            {
              life: bloom.charged ? rand(0.55, 0.95) : rand(0.36, 0.62),
              r: bloom.charged ? rand(2.4, 5.4) : rand(1.4, 3.1),
              hue: bloom.charged ? 156 + rand(-8, 12) : 188 + rand(-10, 8),
              vx: Math.cos(angle) * outward + rand(-10, 10),
              vy: Math.sin(angle) * outward + rand(-10, 10),
              alpha: bloom.charged ? rand(0.26, 0.52) : rand(0.14, 0.26),
            },
          );
        }
      }

      if (this.particleTimers.vortices <= 0) {
        this.particleTimers.vortices = 0.08;
        for (const vortex of this.vortices) {
          const angle = rand(0, Math.PI * 2);
          const ringRadius = vortex.r * rand(0.3, 0.92);
          const tangent = angle + Math.PI * 0.5 * vortex.spin;
          const swirlSpeed = rand(18, 56);
          this.spawnParticle(
            vortex.x + Math.cos(angle) * ringRadius,
            vortex.y + Math.sin(angle) * ringRadius,
            {
              life: rand(0.38, 0.72),
              r: rand(1.2, 3.6),
              hue: 184 + rand(-10, 10),
              vx: Math.cos(tangent) * swirlSpeed,
              vy: Math.sin(tangent) * swirlSpeed,
              alpha: rand(0.12, 0.24),
            },
          );
        }
      }

      if (this.particleTimers.gate <= 0 && this.gate) {
        this.particleTimers.gate = this.gate.open ? 0.045 : 0.08;
        const count = this.gate.open ? 3 : 1;
        for (let index = 0; index < count; index += 1) {
          const angle = rand(0, Math.PI * 2);
          const ringRadius = this.gate.r + rand(6, 24);
          const tangent = angle + Math.PI * 0.5;
          const hue = this.gate.open ? 156 + rand(-8, 12) : 194 + rand(-12, 8);
          const speed = this.gate.open ? rand(26, 82) : rand(12, 30);
          this.spawnParticle(
            this.gate.x + Math.cos(angle) * ringRadius,
            this.gate.y + Math.sin(angle) * ringRadius,
            {
              life: this.gate.open ? rand(0.45, 0.9) : rand(0.3, 0.5),
              r: this.gate.open ? rand(2.4, 5.6) : rand(1.6, 3.2),
              hue,
              vx: Math.cos(tangent) * speed + rand(-10, 10),
              vy: Math.sin(tangent) * speed + rand(-10, 10),
              alpha: this.gate.open ? rand(0.34, 0.58) : rand(0.12, 0.22),
            },
          );
        }
      }
    }

    updateGuidance() {
      const level = LEVELS[this.levelIndex];
      if (!level) {
        return;
      }

      const massGap = level.targetMass - this.player.mass;
      const massProgress = clamp(this.player.mass / level.targetMass, 0, 1);
      const bloomCount = this.blooms.filter((bloom) => bloom.charged).length;
      const bloomGap = level.blooms - bloomCount;
      const bloomsReady = bloomGap <= 0;
      const nearbyHunter = this.cells.find(
        (cell) => cell.kind === "hunter" && cell.r > this.player.r * 1.05 && distance(cell, this.player) < 220,
      );
      const nearbyFood = this.findNearestFoodTarget();
      const nearbyBloom = bloomsReady ? null : this.findNearestBloomAnchor();
      const stepStates = {
        grow: massProgress >= 1 ? "complete" : "active",
        avoid: bloomsReady ? "complete" : "active",
        exit: this.gate.open ? "active" : "locked",
      };
      let progressLabel = massProgress < 1 ? `Grow ${Math.max(0, Math.ceil(massGap))} more mass` : `Charge ${Math.max(0, bloomGap)} bloom anchors`;
      let progressValue = `${Math.round((massProgress < 1 ? massProgress : bloomCount / level.blooms) * 100)}%`;

      if (this.gate.open) {
        this.focusState.headline = "Gate open";
        this.focusState.copy = "The bloom gate is live. Follow the mint marker and cut through the right-side exit ring.";
        stepStates.grow = "complete";
        stepStates.avoid = "complete";
        stepStates.exit = "active";
        progressLabel = "Gate live on the right";
        progressValue = "100%";
        this.setGuideTarget(this.gate, "#9af8cf", "Exit");
      } else if (nearbyHunter) {
        this.focusState.headline = "Break away from the orange hunter";
        this.focusState.copy =
          massProgress < 1
            ? "The orange danger marker strips mass on contact. Cut away or pulse it back, then resume growing."
            : `The gate still needs ${Math.max(1, bloomGap)} charged bloom anchors. Break away, then touch the next cyan ring.`;
        this.setGuideTarget(nearbyHunter, "#ff8d5f", "Danger");
      } else if (massProgress < 1 && nearbyFood) {
        const direction = nearbyFood.kind === "drifter" ? "larger teal drifter" : "small glow cell";
        this.focusState.headline = `Eat the nearby ${direction}`;
        this.focusState.copy = `The green grow marker shows the next safe prey. You need ${Math.max(1, Math.ceil(massGap))} more mass, then ${level.blooms} charged bloom anchors before the right-side gate opens.`;
        this.setGuideTarget(nearbyFood, "#7ef7a3", "Grow");
      } else if (nearbyBloom) {
        this.focusState.headline = "Charge the cyan bloom anchors";
        this.focusState.copy = `The gate stays unstable until each cyan ring is touched. ${bloomCount}/${level.blooms} anchors charged so far.`;
        progressLabel = `Charge ${Math.max(0, bloomGap)} more bloom anchors`;
        progressValue = `${Math.round((bloomCount / level.blooms) * 100)}%`;
        this.setGuideTarget(nearbyBloom, "#7fefff", "Bloom");
      } else {
        this.focusState.headline = bloomsReady ? "Sweep for safe growth" : "Sweep for the remaining bloom anchors";
        this.focusState.copy = bloomsReady
          ? `Reach ${level.targetMass} mass, then cross the bloom gate on the right side of the pool.`
          : `Touch all ${level.blooms} cyan bloom anchors, then cross the bloom gate on the right side of the pool.`;
        this.guideTarget = null;
      }

      this.focus.headline.textContent = this.focusState.headline;
      this.focus.copy.textContent = this.focusState.copy;
      this.focus.progressLabel.textContent = progressLabel;
      this.focus.progressValue.textContent = progressValue;
      this.focus.progressFill.style.width = progressValue;
      this.setFocusStepState("grow", stepStates.grow);
      this.setFocusStepState("avoid", stepStates.avoid);
      this.setFocusStepState("exit", stepStates.exit);
    }

    setGuideTarget(entity, color, label) {
      if (!entity) {
        this.guideTarget = null;
        return;
      }

      this.guideTarget = { entity, color, label };
    }

    setFocusStepState(step, state) {
      const node = this.focus.steps[step];
      if (!node) {
        return;
      }

      node.dataset.state = state;
    }

    findNearestFoodTarget() {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const orb of this.food) {
        const orbDistance = distance(this.player, orb);
        if (orbDistance < bestDistance) {
          bestDistance = orbDistance;
          best = { ...orb, kind: "food" };
        }
      }

      for (const cell of this.cells) {
        if (cell.r >= this.player.r * 0.96) {
          continue;
        }
        const cellDistance = distance(this.player, cell);
        if (cellDistance < bestDistance) {
          bestDistance = cellDistance;
          best = cell;
        }
      }

      return best;
    }

    findNearestBloomAnchor() {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const bloom of this.blooms) {
        if (bloom.charged) {
          continue;
        }
        const bloomDistance = distance(this.player, bloom);
        if (bloomDistance < bestDistance) {
          bestDistance = bloomDistance;
          best = bloom;
        }
      }

      return best;
    }

    updateParticles(dt) {
      for (let index = this.particles.length - 1; index >= 0; index -= 1) {
        const particle = this.particles[index];
        particle.life -= dt;
        if (particle.life <= 0) {
          this.particles.splice(index, 1);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
      }
    }

    keepInside(body, padding) {
      if (body.x < padding) {
        body.x = padding;
        body.vx = Math.abs(body.vx) * 0.6;
      } else if (body.x > WORLD_WIDTH - padding) {
        body.x = WORLD_WIDTH - padding;
        body.vx = -Math.abs(body.vx) * 0.6;
      }

      if (body.y < padding) {
        body.y = padding;
        body.vy = Math.abs(body.vy) * 0.6;
      } else if (body.y > WORLD_HEIGHT - padding) {
        body.y = WORLD_HEIGHT - padding;
        body.vy = -Math.abs(body.vy) * 0.6;
      }
    }

    spawnParticle(x, y, options) {
      this.particles.push({
        x,
        y,
        life: options.life,
        r: options.r,
        hue: options.hue,
        vx: options.vx,
        vy: options.vy,
        alpha: options.alpha,
      });
    }

    spawnBurst(x, y, hue, count) {
      for (let index = 0; index < count; index += 1) {
        const angle = rand(0, Math.PI * 2);
        this.spawnParticle(x, y, {
          life: rand(0.3, 0.9),
          r: rand(2, 7),
          hue,
          vx: Math.cos(angle) * rand(30, 180),
          vy: Math.sin(angle) * rand(30, 180),
          alpha: rand(0.35, 0.78),
        });
      }
    }

    updateHud() {
      const level = LEVELS[this.levelIndex];
      this.hud.stage.textContent = `${Math.min(this.levelIndex + 1, STAGE_COUNT)} / ${STAGE_COUNT}`;
      this.hud.mass.textContent = Math.round(this.player.mass);
      this.hud.target.textContent = level ? `${Math.round(this.player.mass)}/${level.targetMass}` : "clear";
      this.hud.bloom.textContent = level ? `${this.blooms.filter((bloom) => bloom.charged).length} / ${level.blooms}` : "clear";
      this.hud.health.textContent = `${Math.round(this.player.health)}%`;
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      this.renderBackdrop(ctx);

      ctx.save();
      ctx.translate(WIDTH * 0.5 - this.camera.x, HEIGHT * 0.5 - this.camera.y);

      this.renderVortices(ctx);
      this.renderBlooms(ctx);
      this.renderGate(ctx);
      this.renderFood(ctx);
      this.renderCells(ctx);
      this.renderPlayer(ctx);
      this.renderParticles(ctx);
      this.renderGuides(ctx);

      ctx.restore();
      this.renderGateCompass(ctx);
      this.renderHudText(ctx);
    }

    renderGateCompass(ctx) {
      if (!this.gate) {
        return;
      }

      const screenX = this.gate.x - this.camera.x + WIDTH * 0.5;
      const screenY = this.gate.y - this.camera.y + HEIGHT * 0.5;
      const visible = screenX > 90 && screenX < WIDTH - 90 && screenY > 90 && screenY < HEIGHT - 90;
      if (visible) {
        return;
      }

      const anchorX = clamp(screenX, 86, WIDTH - 86);
      let anchorY = clamp(screenY, 118, HEIGHT - 118);
      if (screenX >= WIDTH - 86 && anchorY < 356) {
        anchorY = 356;
      }
      const color = this.gate.open ? "#9af8cf" : "#a9e2f4";
      const label = this.gate.open ? "Gate open" : "Gate locked";

      ctx.save();
      ctx.translate(anchorX, anchorY);
      ctx.fillStyle = "rgba(7, 17, 27, 0.9)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      this.roundRect(ctx, -54, -20, 108, 40, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = "12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, -2);
      ctx.fillStyle = "rgba(234, 252, 255, 0.72)";
      ctx.fillText("Right side", 0, 12);

      ctx.beginPath();
      if (screenX <= 86) {
        ctx.moveTo(-54, 0);
        ctx.lineTo(-68, -10);
        ctx.lineTo(-68, 10);
      } else if (screenX >= WIDTH - 86) {
        ctx.moveTo(54, 0);
        ctx.lineTo(68, -10);
        ctx.lineTo(68, 10);
      } else if (screenY <= 118) {
        ctx.moveTo(0, -20);
        ctx.lineTo(-10, -34);
        ctx.lineTo(10, -34);
      } else {
        ctx.moveTo(0, 20);
        ctx.lineTo(-10, 34);
        ctx.lineTo(10, 34);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    renderBackdrop(ctx) {
      const level = LEVELS[this.levelIndex];
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, "#08131d");
      gradient.addColorStop(1, "#071a24");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.globalAlpha = 0.16 + this.stageFlash * 0.12;
      ctx.fillStyle = level.tint;
      for (let index = 0; index < 9; index += 1) {
        ctx.beginPath();
        ctx.arc(
          ((index * 173) % WIDTH) + Math.sin(index * 19 + this.lastTime * 0.0002) * 80,
          ((index * 229) % HEIGHT) + Math.cos(index * 17 + this.lastTime * 0.00015) * 50,
          140 + (index % 3) * 50,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
      this.stageFlash = Math.max(0, this.stageFlash - 0.012);
    }

    renderVortices(ctx) {
      for (const vortex of this.vortices) {
        const ring = ctx.createRadialGradient(vortex.x, vortex.y, 0, vortex.x, vortex.y, vortex.r);
        ring.addColorStop(0, "rgba(105, 240, 216, 0.16)");
        ring.addColorStop(0.6, "rgba(105, 240, 216, 0.05)");
        ring.addColorStop(1, "rgba(105, 240, 216, 0)");
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(vortex.x, vortex.y, vortex.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(122, 225, 255, ${0.18 + Math.sin(this.lastTime * 0.002) * 0.06})`;
        ctx.lineWidth = 2;
        for (let index = 0; index < 3; index += 1) {
          ctx.beginPath();
          ctx.arc(vortex.x, vortex.y, vortex.r * (0.28 + index * 0.22), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    renderBlooms(ctx) {
      for (const bloom of this.blooms) {
        const pulse = 1 + Math.sin(bloom.pulse) * 0.08;
        const glow = ctx.createRadialGradient(bloom.x, bloom.y, 0, bloom.x, bloom.y, bloom.r * 2.8 * pulse);
        glow.addColorStop(0, bloom.charged ? "rgba(154, 248, 207, 0.9)" : "rgba(127, 239, 255, 0.9)");
        glow.addColorStop(0.55, bloom.charged ? "rgba(154, 248, 207, 0.22)" : "rgba(127, 239, 255, 0.18)");
        glow.addColorStop(1, "rgba(127, 239, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(bloom.x, bloom.y, bloom.r * 2.8 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = bloom.charged ? "#9af8cf" : "#7fefff";
        ctx.lineWidth = bloom.charged ? 5 : 3;
        ctx.beginPath();
        ctx.arc(bloom.x, bloom.y, bloom.r * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = bloom.charged ? "rgba(154, 248, 207, 0.24)" : "rgba(127, 239, 255, 0.1)";
        ctx.beginPath();
        ctx.arc(bloom.x, bloom.y, bloom.r * 0.68, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    renderGate(ctx) {
      ctx.save();
      ctx.strokeStyle = this.gate.open ? "#9af8cf" : "rgba(169, 226, 244, 0.28)";
      ctx.lineWidth = this.gate.open ? 10 : 5;
      ctx.beginPath();
      ctx.arc(this.gate.x, this.gate.y, this.gate.r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = this.gate.open ? "rgba(154, 248, 207, 0.18)" : "rgba(169, 226, 244, 0.06)";
      ctx.beginPath();
      ctx.arc(this.gate.x, this.gate.y, this.gate.r - 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    renderFood(ctx) {
      for (const orb of this.food) {
        const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r * 2.4);
        glow.addColorStop(0, `hsla(${orb.hue}, 90%, 68%, 0.95)`);
        glow.addColorStop(1, `hsla(${orb.hue}, 90%, 68%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    renderCells(ctx) {
      for (const cell of this.cells) {
        const alpha = cell.kind === "hunter" ? 0.92 : 0.82;
        const glow = ctx.createRadialGradient(cell.x, cell.y, 0, cell.x, cell.y, cell.r * 2.3);
        glow.addColorStop(0, `hsla(${cell.hue}, 85%, 60%, ${alpha})`);
        glow.addColorStop(1, `hsla(${cell.hue}, 85%, 60%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, cell.r * 2.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${cell.hue}, 78%, ${cell.kind === "hunter" ? "54%" : "62%"}, 0.92)`;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.26)";
        ctx.beginPath();
        ctx.arc(cell.x - cell.r * 0.28, cell.y - cell.r * 0.3, cell.r * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    renderPlayer(ctx) {
      const glow = ctx.createRadialGradient(this.player.x, this.player.y, 0, this.player.x, this.player.y, this.player.r * 2.5);
      const hurt = this.player.hurtFlash > 0 ? 18 : 190;
      glow.addColorStop(0, `hsla(${hurt}, 92%, 70%, 0.96)`);
      glow.addColorStop(1, `hsla(${hurt}, 92%, 70%, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.r * 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.player.hurtFlash > 0 ? "rgba(255, 129, 92, 0.95)" : "rgba(133, 233, 255, 0.96)";
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(this.player.x - this.player.r * 0.3, this.player.y - this.player.r * 0.34, this.player.r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }

    renderGuides(ctx) {
      if (!this.guideTarget?.entity) {
        return;
      }

      this.renderGuideMarker(ctx, this.guideTarget.entity, this.guideTarget.color, this.guideTarget.label);
      this.renderGuideArrow(ctx, this.guideTarget.entity, this.guideTarget.color, this.guideTarget.label);
    }

    renderGuideMarker(ctx, target, color, label) {
      const pulse = 0.82 + Math.sin(this.lastTime * 0.006) * 0.14;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.r + 18, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(7, 17, 27, 0.82)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.font = "12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = Math.max(48, ctx.measureText(label).width + 20);
      const tagX = target.x;
      const tagY = target.y - target.r - 34;
      this.roundRect(ctx, tagX - width * 0.5, tagY - 14, width, 28, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#eafcff";
      ctx.fillText(label, tagX, tagY);
      ctx.restore();
    }

    renderGuideArrow(ctx, target, color) {
      const dx = target.x - this.player.x;
      const dy = target.y - this.player.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 130) {
        return;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const anchorX = this.player.x + nx * Math.min(180, dist - 40);
      const anchorY = this.player.y + ny * Math.min(180, dist - 40);
      const angle = Math.atan2(ny, nx);

      ctx.save();
      ctx.translate(anchorX, anchorY);
      ctx.rotate(angle);
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}33`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-18, -10);
      ctx.lineTo(10, -10);
      ctx.lineTo(10, -18);
      ctx.lineTo(24, 0);
      ctx.lineTo(10, 18);
      ctx.lineTo(10, 10);
      ctx.lineTo(-18, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    roundRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    renderParticles(ctx) {
      for (const particle of this.particles) {
        const glowRadius = particle.r * (1.8 - particle.life * 0.45);
        const glow = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, glowRadius);
        glow.addColorStop(0, `hsla(${particle.hue}, 95%, 70%, ${particle.alpha * particle.life})`);
        glow.addColorStop(1, `hsla(${particle.hue}, 95%, 70%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${particle.hue}, 95%, 78%, ${Math.min(1, particle.alpha * particle.life * 1.2)})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r * particle.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    renderHudText(ctx) {
      ctx.fillStyle = "rgba(7, 17, 27, 0.72)";
      ctx.fillRect(24, HEIGHT - 74, WIDTH - 48, 50);
      ctx.strokeStyle = "rgba(174, 232, 255, 0.2)";
      ctx.strokeRect(24.5, HEIGHT - 73.5, WIDTH - 49, 49);

      ctx.fillStyle = "#eafcff";
      ctx.font = "15px Trebuchet MS, sans-serif";
      ctx.fillText(this.message, 40, HEIGHT - 43);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector("#app");
    if (!root) {
      return;
    }
    window.osmosDriftGame = new Game(root);
  });
})();
