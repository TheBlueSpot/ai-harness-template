(() => {
  // katamari-clump/src/data.js
  var WORLD = {
    bounds: { minX: 0, minY: 0, maxX: 2400, maxY: 1600 }
  };
  var DATA = {
    player: {
      startMass: 8,
      baseRadius: 18,
      radiusScale: 4.5
    },
    movement: {
      baseAcceleration: 980,
      baseSpeed: 252,
      massSpeed: 36,
      drag: 0.84
    },
    districts: [
      { id: "pavement", label: "Pavement", massThreshold: 18, winTarget: 18, band: { x: 60, y: 120, w: 640, h: 1360, tint: "rgba(28, 42, 68, 0.52)" } },
      { id: "market", label: "Market", massThreshold: 42, winTarget: 42, band: { x: 820, y: 120, w: 640, h: 1360, tint: "rgba(42, 28, 56, 0.52)" } },
      { id: "harbor", label: "Harbor", massThreshold: 82, winTarget: 82, band: { x: 1580, y: 120, w: 640, h: 1360, tint: "rgba(20, 58, 64, 0.5)" } }
    ],
    collectibleClasses: [
      { type: "paper", label: "Paper", mass: 0.8, radius: 6, district: 0 },
      { type: "cone", label: "Traffic Cone", mass: 2.2, radius: 9, district: 0 },
      { type: "crate", label: "Crate", mass: 4.6, radius: 12, district: 1 },
      { type: "bench", label: "Bench", mass: 8.2, radius: 16, district: 1 },
      { type: "car", label: "Car", mass: 14.5, radius: 21, district: 2 },
      { type: "billboard", label: "Billboard", mass: 24, radius: 28, district: 2 }
    ],
    hazardClasses: [
      { type: "spike", label: "Spike Cart", mass: 0, radius: 48, damage: "lose" },
      { type: "void", label: "Red Hazard", mass: 0, radius: 60, damage: "lose" }
    ]
  };

  // katamari-clump/src/state.js
  function makeRng(seed) {
    let value = seed >>> 0;
    return () => {
      value = 1664525 * value + 1013904223 >>> 0;
      return value / 4294967296;
    };
  }
  function choose(list, index) {
    return list[index % list.length];
  }
  function buildObject(id, template, x, y, districtIndex, variant) {
    return {
      id,
      type: template.type,
      label: template.label,
      mass: template.mass * (1 + variant * 0.06),
      radius: template.radius,
      districtIndex,
      absorbMass: template.mass * (0.92 + districtIndex * 0.18),
      position: { x, y }
    };
  }
  function createGameState() {
    return {
      mode: "menu",
      time: 0,
      districtIndex: 0,
      collectedCount: 0,
      pulse: 0,
      overlayVisible: true,
      overlay: {
        eyebrow: "Mission",
        title: "Katamari Clump Rollup",
        copy: "Roll small props, grow through gates, and dodge red hazards.",
        button: "Start"
      },
      player: {
        position: { x: 220, y: 900 },
        velocity: { x: 0, y: 0 },
        heading: 0,
        rotation: 0,
        spin: 0,
        mass: DATA.player.startMass,
        radius: DATA.player.baseRadius + Math.sqrt(DATA.player.startMass) * DATA.player.radiusScale
      },
      attachedItems: [],
      hud: { mass: DATA.player.startMass, elapsed: 0, score: 0, message: "Roll small props first." },
      camera: { x: 0, y: 0, width: 0, height: 0 }
    };
  }
  function resetGameState(state) {
    const fresh = createGameState();
    Object.assign(state, fresh);
    state.player.position = { ...fresh.player.position };
    state.player.velocity = { ...fresh.player.velocity };
    state.attachedItems = [];
    return state;
  }
  function createWorld(seed = 1337) {
    const rng = makeRng(seed);
    const objects = [];
    const hazards = [];
    const gates = [];
    let id = 1;
    DATA.districts.forEach((district, districtIndex) => {
      const x0 = 120 + districtIndex * 760;
      const x1 = x0 + 620;
      const laneYs = [320, 520, 720, 940, 1180, 1360];
      const collectibleCount = 10 + districtIndex * 4;
      for (let i = 0;i < collectibleCount; i += 1) {
        const template = choose(DATA.collectibleClasses, i + districtIndex * 2);
        const variant = 1 + (i + districtIndex) % 3 * 0.5;
        objects.push(buildObject(id++, template, x0 + rng() * (x1 - x0), choose(laneYs, i) + rng() * 60 - 30, districtIndex, variant));
      }
      const hazardTemplate = choose(DATA.hazardClasses, districtIndex);
      hazards.push({
        id: `h-${districtIndex}`,
        type: hazardTemplate.type,
        label: hazardTemplate.label,
        radius: hazardTemplate.radius,
        position: { x: x0 + 300 + districtIndex * 80, y: 420 + districtIndex * 320 },
        districtIndex
      });
      gates.push({
        id: `g-${districtIndex}`,
        districtIndex,
        x: x1 - 40,
        y: 160,
        width: 120,
        height: 54,
        exitX: x1 + 60,
        open: districtIndex === 0,
        massThreshold: district.massThreshold
      });
    });
    return {
      bounds: WORLD.bounds,
      objects,
      hazards,
      gates
    };
  }
  function createFrameState(state, world, viewport) {
    const attachedItems = state.attachedItems.map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      mass: item.mass,
      x: item.position?.x ?? state.player.position.x,
      y: item.position?.y ?? state.player.position.y,
      radius: 8 + Math.sqrt(item.mass) * 2
    }));
    const groupedObjects = world.objects.reduce((groups, object) => {
      const key = object.type;
      (groups[key] ||= []).push({
        id: object.id,
        type: object.type,
        label: object.label,
        x: object.position.x,
        y: object.position.y,
        radius: object.radius,
        mass: object.mass,
        districtIndex: object.districtIndex,
        absorbable: state.player.mass >= object.absorbMass
      });
      return groups;
    }, {});
    return {
      mode: state.mode,
      camera: state.camera,
      world: world.bounds,
      player: {
        x: state.player.position.x,
        y: state.player.position.y,
        rotation: state.player.rotation,
        heading: state.player.heading,
        mass: state.player.mass,
        radius: state.player.radius,
        velocity: { ...state.player.velocity }
      },
      attachedItems,
      objects: groupedObjects,
      collectibles: groupedObjects,
      hazards: world.hazards.map((hazard) => ({
        id: hazard.id,
        type: hazard.type,
        label: hazard.label,
        x: hazard.position.x,
        y: hazard.position.y,
        radius: hazard.radius,
        districtIndex: hazard.districtIndex
      })),
      gates: world.gates.map((gate) => ({
        id: gate.id,
        districtIndex: gate.districtIndex,
        x: gate.x,
        y: gate.y,
        width: gate.width,
        height: gate.height,
        open: gate.open,
        massThreshold: gate.massThreshold
      })),
      hud: {
        mass: state.hud.mass,
        elapsed: state.hud.elapsed,
        score: state.hud.score,
        message: state.hud.message,
        districtLabel: DATA.districts[state.districtIndex]?.label ?? "Complete",
        districtIndex: state.districtIndex,
        districtTotal: DATA.districts.length,
        nextTarget: DATA.districts[state.districtIndex]?.winTarget ?? DATA.districts[DATA.districts.length - 1].winTarget
      },
      cameraExtents: {
        x: state.camera.x,
        y: state.camera.y,
        width: state.camera.width || viewport.width,
        height: state.camera.height || viewport.height
      },
      overlay: {
        visible: state.overlayVisible,
        eyebrow: state.overlay.eyebrow,
        title: state.overlay.title,
        copy: state.overlay.copy,
        button: state.overlay.button
      },
      districtBands: DATA.districts.map((district) => district.band)
    };
  }

  // katamari-clump/src/Game.js
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function hypot2(x, y) {
    return Math.hypot(x, y);
  }
  function keyDown(input, code) {
    return Boolean(input?.held?.[code] || input?.pressed?.[code]);
  }

  class Game {
    constructor() {
      this.viewport = { width: 1280, height: 720, dpr: 1 };
      this.state = createGameState();
      this.world = createWorld();
      this.frame = createFrameState(this.state, this.world, this.viewport);
    }
    start() {
      if (this.state.mode === "menu" || this.state.mode === "win" || this.state.mode === "lose") {
        this.state.mode = "playing";
        this.state.overlayVisible = false;
      }
    }
    restart() {
      resetGameState(this.state);
      this.world = createWorld();
      this.frame = createFrameState(this.state, this.world, this.viewport);
    }
    resize(width, height, dpr = 1) {
      if (typeof width === "object" && width) {
        const box = width;
        this.viewport = {
          width: box.width ?? this.viewport.width,
          height: box.height ?? this.viewport.height,
          dpr: box.dpr ?? this.viewport.dpr ?? 1
        };
      } else {
        this.viewport = { width, height, dpr };
      }
      this.frame = createFrameState(this.state, this.world, this.viewport);
    }
    update(dt, input) {
      if (keyDown(input, "Enter") || keyDown(input, "Space")) {
        if (this.state.mode !== "playing") {
          this.restart();
          this.start();
        }
      }
      if (keyDown(input, "KeyR")) {
        this.restart();
        this.start();
      }
      if (this.state.mode !== "playing") {
        this.frame = createFrameState(this.state, this.world, this.viewport);
        return;
      }
      const player = this.state.player;
      const thrust = {
        x: (keyDown(input, "ArrowRight") || keyDown(input, "d") || keyDown(input, "D") ? 1 : 0) - (keyDown(input, "ArrowLeft") || keyDown(input, "a") || keyDown(input, "A") ? 1 : 0),
        y: (keyDown(input, "ArrowDown") || keyDown(input, "s") || keyDown(input, "S") ? 1 : 0) - (keyDown(input, "ArrowUp") || keyDown(input, "w") || keyDown(input, "W") ? 1 : 0)
      };
      const thrustMag = hypot2(thrust.x, thrust.y);
      if (thrustMag > 0) {
        thrust.x /= thrustMag;
        thrust.y /= thrustMag;
      }
      const turn = thrust.x;
      const drive = thrust.y;
      const massFactor = 1 + Math.sqrt(player.mass) * 0.14;
      player.spin = clamp(player.spin + turn * dt * 5.5, -2.4, 2.4);
      player.heading += player.spin * dt;
      const accel = DATA.movement.baseAcceleration / massFactor;
      player.velocity.x += Math.cos(player.heading) * drive * accel * dt;
      player.velocity.y += Math.sin(player.heading) * drive * accel * dt;
      player.velocity.x *= Math.pow(DATA.movement.drag, dt * 60);
      player.velocity.y *= Math.pow(DATA.movement.drag, dt * 60);
      const speed = hypot2(player.velocity.x, player.velocity.y);
      const maxSpeed = DATA.movement.baseSpeed + Math.sqrt(player.mass) * DATA.movement.massSpeed;
      if (speed > maxSpeed) {
        player.velocity.x = player.velocity.x / speed * maxSpeed;
        player.velocity.y = player.velocity.y / speed * maxSpeed;
      }
      player.position.x = clamp(player.position.x + player.velocity.x * dt, WORLD.bounds.minX + 48, WORLD.bounds.maxX - 48);
      player.position.y = clamp(player.position.y + player.velocity.y * dt, WORLD.bounds.minY + 48, WORLD.bounds.maxY - 48);
      player.rotation = Math.atan2(player.velocity.y, player.velocity.x) || player.heading;
      this.state.time += dt;
      this.resolveObjects(dt);
      this.resolveHazards();
      this.advanceDistricts();
      this.updateFollowers(dt);
      this.state.hud.mass = player.mass;
      this.state.hud.elapsed = this.state.time;
      this.state.hud.score = Math.round(player.mass * 100 + this.state.time * 10 + this.state.collectedCount * 35);
      this.state.camera = this.buildCamera();
      this.frame = createFrameState(this.state, this.world, this.viewport);
    }
    resolveObjects(dt) {
      const player = this.state.player;
      const pickupRadius = player.radius;
      const remaining = [];
      let gained = 0;
      for (const object of this.world.objects) {
        const dx = object.position.x - player.position.x;
        const dy = object.position.y - player.position.y;
        const reach = pickupRadius + object.radius;
        const distance = Math.hypot(dx, dy);
        if (distance > reach) {
          remaining.push(object);
          continue;
        }
        if (object.type === "hazard") {
          this.fail("Hazard clipped the clump.");
          return;
        }
        if (player.mass >= object.absorbMass) {
          gained += object.mass;
          this.state.collectedCount += 1;
          this.attachItem(object);
          continue;
        }
        remaining.push(object);
      }
      this.world.objects = remaining;
      if (gained > 0) {
        player.mass += gained;
        player.radius = DATA.player.baseRadius + Math.sqrt(player.mass) * DATA.player.radiusScale;
        this.state.pulse = Math.max(this.state.pulse, 0.2 + gained * 0.01);
        this.state.hud.message = player.mass >= DATA.districts[this.state.districtIndex].massThreshold ? "Gate open. Push into next district." : "Safe clumps absorbed.";
      }
    }
    resolveHazards() {
      const player = this.state.player;
      for (const hazard of this.world.hazards) {
        const dx = hazard.position.x - player.position.x;
        const dy = hazard.position.y - player.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < player.radius + hazard.radius * 0.78) {
          this.fail("Red hazard shredded the roll.");
          return;
        }
      }
    }
    advanceDistricts() {
      const district = DATA.districts[this.state.districtIndex];
      if (!district) {
        this.win();
        return;
      }
      if (this.state.player.mass < district.massThreshold) {
        return;
      }
      const gate = this.world.gates[this.state.districtIndex];
      if (gate) {
        gate.open = true;
        if (this.state.player.position.x >= gate.exitX) {
          this.state.districtIndex += 1;
          if (this.state.districtIndex >= DATA.districts.length) {
            this.win();
          } else {
            this.state.hud.message = DATA.districts[this.state.districtIndex].label + " unlocked.";
          }
        }
      }
    }
    attachItem(object) {
      this.state.attachedItems.push({
        id: object.id,
        type: object.type,
        label: object.label,
        mass: object.mass,
        angle: object.position.angle ?? 0,
        distance: this.state.player.radius + object.radius + 8 + this.state.attachedItems.length * 2,
        phase: this.state.attachedItems.length % 8 * 0.78
      });
    }
    updateFollowers(dt) {
      const player = this.state.player;
      const items = this.state.attachedItems;
      for (let i = 0;i < items.length; i += 1) {
        const item = items[i];
        item.phase += dt * 2.3;
        const offset = item.distance + Math.sin(item.phase) * 4;
        const angle = player.rotation + item.angle + i * 0.45;
        item.position = {
          x: player.position.x - Math.cos(angle) * offset,
          y: player.position.y - Math.sin(angle) * offset
        };
      }
    }
    buildCamera() {
      const viewWidth = this.viewport.width / Math.max(1, this.viewport.dpr);
      const viewHeight = this.viewport.height / Math.max(1, this.viewport.dpr);
      return {
        x: clamp(this.state.player.position.x - viewWidth / 2, WORLD.bounds.minX, WORLD.bounds.maxX - viewWidth),
        y: clamp(this.state.player.position.y - viewHeight / 2, WORLD.bounds.minY, WORLD.bounds.maxY - viewHeight),
        width: viewWidth,
        height: viewHeight
      };
    }
    fail(message) {
      this.state.mode = "lose";
      this.state.overlayVisible = true;
      this.state.hud.message = message;
      this.state.overlay = {
        eyebrow: "Crash",
        title: "Clump shattered",
        copy: "Hit restart and roll again.",
        button: "Restart"
      };
    }
    win() {
      this.state.mode = "win";
      this.state.overlayVisible = true;
      this.state.hud.message = "All districts cleared.";
      this.state.overlay = {
        eyebrow: "Clear",
        title: "Districts rolled",
        copy: "City cleared. Press Start to roll again.",
        button: "Start"
      };
    }
    getFrameState() {
      return this.frame;
    }
  }

  // katamari-clump/src/render.js
  var COLORS = {
    sky: "#9fe3ff",
    street: "#152338",
    glow: "#7cffc4",
    warm: "#ffbf5f",
    danger: "#ff6d7a",
    text: "#eef4ff",
    muted: "#9ab0ce"
  };
  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function massToRadius(mass) {
    return 18 + Math.sqrt(mass) * 4.5;
  }
  function districtTint(index) {
    return ["#132033", "#1b1c35", "#2c1c2d"][index % 3];
  }
  function drawFrame(ctx, frame) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    const bg = districtTint(frame.districtIndex);
    const skylineGlow = frame.mode === "win" ? "rgba(124, 255, 196, 0.22)" : "rgba(159, 227, 255, 0.14)";
    const cam = frame.cameraExtents ?? { x: 0, y: 0, width, height };
    const scaleX = width / Math.max(1, cam.width);
    const scaleY = height / Math.max(1, cam.height);
    const toScreenX = (x) => (x - cam.x) * scaleX;
    const toScreenY = (y) => (y - cam.y) * scaleY;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, skylineGlow);
    grad.addColorStop(1, "rgba(0, 0, 0, 0.36)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    for (const band of frame.districtBands ?? []) {
      ctx.fillStyle = band.fill;
      ctx.fillRect(toScreenX(band.x), toScreenY(band.y), band.w * scaleX, band.h * scaleY);
    }
    for (const prop of Object.values(frame.objects ?? {}).flat()) {
      ctx.save();
      ctx.translate(toScreenX(prop.x), toScreenY(prop.y));
      const size = Math.max(8, prop.radius * 2) * Math.min(scaleX, scaleY);
      ctx.fillStyle = prop.absorbable ? "rgba(124, 255, 196, 0.88)" : "rgba(255, 109, 122, 0.9)";
      ctx.strokeStyle = prop.absorbable ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 2;
      drawRoundRect(ctx, -size / 2, -size / 2, size, size, size * 0.24);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (const hazard of frame.hazards ?? []) {
      ctx.save();
      ctx.translate(toScreenX(hazard.x), toScreenY(hazard.y));
      ctx.strokeStyle = "rgba(255, 109, 122, 0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, hazard.radius * Math.min(scaleX, scaleY), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 109, 122, 0.18)";
      ctx.fill();
      ctx.restore();
    }
    for (const gate of frame.gates ?? []) {
      ctx.save();
      ctx.translate(toScreenX(gate.x), toScreenY(gate.y));
      ctx.fillStyle = gate.open ? "rgba(124, 255, 196, 0.16)" : "rgba(255, 191, 95, 0.16)";
      ctx.strokeStyle = gate.open ? "rgba(124, 255, 196, 0.9)" : "rgba(255, 191, 95, 0.9)";
      ctx.lineWidth = 3;
      drawRoundRect(ctx, -gate.width / 2, -gate.height / 2, gate.width, gate.height, 10);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (const item of frame.attachedItems ?? []) {
      ctx.save();
      ctx.translate(toScreenX(item.x), toScreenY(item.y));
      const size = item.radius * 2 * Math.min(scaleX, scaleY);
      ctx.fillStyle = "rgba(124, 255, 196, 0.58)";
      drawRoundRect(ctx, -size / 2, -size / 2, size, size, 8);
      ctx.fill();
      ctx.restore();
    }
    const playerRadius = frame.player?.radius ?? massToRadius(frame.player?.mass ?? 1);
    ctx.save();
    ctx.translate(toScreenX(frame.player.x), toScreenY(frame.player.y));
    ctx.rotate(frame.player.rotation || frame.player.angle || 0);
    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.beginPath();
    ctx.arc(0, 0, playerRadius * Math.min(scaleX, scaleY), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(124, 255, 196, 0.3)";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(8, playerRadius * 0.55) * Math.min(scaleX, scaleY), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 18px Trebuchet MS, sans-serif";
    ctx.fillText("Katamari Clump Rollup", 20, 32);
    if (frame.hud?.message) {
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(frame.hud.message, 20, 56);
    }
    if (frame.mode !== "playing") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(0, 0, width, height);
    }
  }

  // katamari-clump/src/main.js
  var canvas = document.getElementById("gameCanvas");
  var hudMass = document.getElementById("hudMass");
  var hudDistrict = document.getElementById("hudDistrict");
  var hudTarget = document.getElementById("hudTarget");
  var hudThreat = document.getElementById("hudThreat");
  var hudHint = document.getElementById("hudHint");
  var overlay = document.getElementById("overlay");
  var overlayEyebrow = document.getElementById("overlayEyebrow");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayCopy = document.getElementById("overlayCopy");
  var overlayButton = document.getElementById("overlayButton");
  if (!canvas)
    throw new Error("Missing #gameCanvas");
  var ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("Canvas context unavailable");
  var game = new Game;
  var input = { held: Object.create(null), pressed: Object.create(null) };
  function queuePressed(code) {
    input.pressed[code] = true;
  }
  function resizeCanvas() {
    const width = Math.max(320, Math.floor(window.innerWidth));
    const height = Math.max(240, Math.floor(window.innerHeight));
    const scale = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    game.resize({ width: canvas.width, height: canvas.height, dpr: scale });
  }
  window.addEventListener("keydown", (event) => {
    input.held[event.code] = true;
    if (!event.repeat)
      queuePressed(event.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code))
      event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    input.held[event.code] = false;
  });
  window.addEventListener("blur", () => {
    input.held = Object.create(null);
    input.pressed = Object.create(null);
  });
  overlayButton.addEventListener("click", () => queuePressed("Enter"));
  window.addEventListener("resize", resizeCanvas);
  function syncUi(frame) {
    const hud = frame.hud ?? {};
    hudMass.textContent = (hud.mass ?? 0).toFixed(1);
    hudDistrict.textContent = `${(hud.districtIndex ?? 0) + 1} / ${hud.districtTotal ?? 1}`;
    hudTarget.textContent = (hud.nextTarget ?? 0).toFixed(1);
    hudThreat.textContent = hud.message ?? "Clear";
    hudHint.textContent = hud.message ?? "Reach the next district gate.";
    overlay.hidden = !(frame.overlay?.visible ?? frame.mode === "playing");
    if (!overlay.hidden) {
      overlayEyebrow.textContent = frame.overlay?.eyebrow ?? "Mission";
      overlayTitle.textContent = frame.overlay?.title ?? "Katamari Clump Rollup";
      overlayCopy.textContent = frame.overlay?.copy ?? "Press Start to begin the roll.";
      overlayButton.textContent = frame.overlay?.button ?? "Start";
    }
  }
  var last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt, input);
    const frameState = game.getFrameState();
    drawFrame(ctx, frameState);
    syncUi(frameState);
    input.pressed = Object.create(null);
    requestAnimationFrame(frame);
  }
  resizeCanvas();
  syncUi(game.getFrameState());
  requestAnimationFrame(frame);
})();
