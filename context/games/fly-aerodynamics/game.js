(() => {
  // fly-aerodynamics/src/ui.js
  function createHud(root) {
    root.innerHTML = `
    <div class="hud">
      <div class="status-card">
        <p class="label">Flight</p>
        <div class="stats" data-hud="flight"></div>
      </div>
      <div class="status-card">
        <p class="label">Upgrades</p>
        <div class="shop-grid" data-hud="shop"></div>
      </div>
      <div class="status-card wide">
        <p class="label">Menu</p>
        <div class="menu" data-hud="menu"></div>
      </div>
    </div>`;
    return {
      flight: root.querySelector('[data-hud="flight"]'),
      shop: root.querySelector('[data-hud="shop"]'),
      menu: root.querySelector('[data-hud="menu"]')
    };
  }
  function renderHud(frameState, hud) {
    hud.flight.innerHTML = [
      `<span>Alt ${Math.round(frameState.hud.altitude)}</span>`,
      `<span>Speed ${frameState.hud.speed.toFixed(1)}</span>`,
      `<span>Fuel ${Math.max(0, Math.round(frameState.hud.fuel))}</span>`,
      `<span>Coins ${Math.max(0, Math.round(frameState.hud.coins))}</span>`,
      `<span>Wind ${frameState.hud.wind.toFixed(1)}</span>`
    ].join("");
    hud.shop.innerHTML = frameState.shop.map((upgrade) => `
        <button class="shop-card ${upgrade.selected ? "selected" : ""}" data-upgrade="${upgrade.id}" data-action="purchase-${upgrade.id}">
          <strong>${upgrade.name}</strong>
          <span>${upgrade.description}</span>
          <em>${upgrade.price} c | owned ${upgrade.owned}</em>
        </button>`).join("");
    hud.menu.innerHTML = frameState.menuActions.map((action) => `<button class="menu-button" data-action="${action.id}">${action.label}</button>`).join("");
    if (frameState.outcome) {
      hud.menu.insertAdjacentHTML("afterbegin", `<p class="outcome">${frameState.outcome}</p>`);
    }
  }
  function bindMenuActions(handlers) {
    document.addEventListener("click", (event) => {
      const upgrade = event.target.closest("[data-upgrade]");
      const action = event.target.closest("[data-action]");
      if (upgrade)
        handlers.selectUpgrade?.(upgrade.dataset.upgrade);
      if (action) {
        const id = action.dataset.action;
        if (id === "startRun")
          handlers.startRun?.();
        if (id === "restart")
          handlers.restart?.();
        if (id?.startsWith("purchase-"))
          handlers.purchaseUpgrade?.(id.slice(9));
      }
    });
  }

  // fly-aerodynamics/src/render.js
  function renderScene(ctx, frameState, viewport) {
    const w = viewport.width;
    const h = viewport.height;
    const cameraX = frameState.distance;
    ctx.clearRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#83c8ff");
    sky.addColorStop(0.55, "#d9f0ff");
    sky.addColorStop(1, "#f8e8b2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0;i < 6; i += 1)
      ctx.fillRect((i * 180 + cameraX * 0.4) % w, 40 + i * 18, 96, 2);
    const terrainY = h * 0.78 + Math.sin(cameraX * 0.005) * 10;
    ctx.fillStyle = "#4b6a3d";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, terrainY);
    for (let x = 0;x <= w; x += 32) {
      ctx.lineTo(x, terrainY + Math.sin((x + cameraX) * 0.01) * 14);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    frameState.thermals.forEach((thermal) => {
      const screenX = w * 0.42 + (thermal.x - cameraX);
      if (screenX < -40 || screenX > w + 40)
        return;
      ctx.strokeStyle = `rgba(255, 154, 73, ${0.12 + thermal.strength * 0.02})`;
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(screenX, terrainY);
      ctx.lineTo(screenX, terrainY - Math.max(90, thermal.radius * 2.1));
      ctx.stroke();
    });
    const flyerX = w * 0.42;
    const flyerY = h * 0.74 - frameState.hud.altitude * 1.6;
    ctx.save();
    ctx.translate(flyerX, flyerY);
    ctx.rotate(frameState.pose.bank * 0.45 + frameState.pose.pitch * 0.35);
    ctx.fillStyle = "#2a2432";
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(18, -8);
    ctx.lineTo(28, 0);
    ctx.lineTo(18, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    frameState.hazards.forEach((hazard) => {
      const screenX = w * 0.42 + (hazard.x - cameraX);
      const screenY = h * 0.74 - hazard.y * 1.2;
      if (screenX < -40 || screenX > w + 40 || screenY < -40 || screenY > h + 40)
        return;
      ctx.fillStyle = hazard.kind === "updraft-shear" ? "rgba(150, 60, 255, 0.3)" : "rgba(255, 80, 80, 0.28)";
      ctx.beginPath();
      ctx.arc(screenX, screenY, hazard.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(`Target ${Math.round(frameState.targetDistance)}m`, 24, h - 28);
    ctx.fillText(`Phase ${frameState.phase}`, 24, 36);
  }

  // fly-aerodynamics/src/state/progression.js
  var UPGRADE_DEFINITIONS = [
    { id: "lift", name: "Wing Camber", description: "More lift at slow airspeed.", cost: 18 },
    { id: "thrust", name: "Fuel Mix", description: "Faster launch and stronger climb.", cost: 20 },
    { id: "glide", name: "Glide Slick", description: "Lower drag in cruise and descent.", cost: 22 },
    { id: "thermal", name: "Thermal Sense", description: "Better thermal pickup and hang time.", cost: 24 }
  ];
  function createProgression() {
    return {
      coins: 0,
      owned: { lift: 0, thrust: 0, glide: 0, thermal: 0 },
      selected: "lift"
    };
  }
  function applyRunPayout(progress, payout) {
    return { ...progress, coins: progress.coins + Math.max(0, payout) };
  }
  function selectUpgrade(progress, upgradeId) {
    if (!UPGRADE_DEFINITIONS.some((upgrade) => upgrade.id === upgradeId))
      return progress;
    return { ...progress, selected: upgradeId };
  }
  function purchaseUpgrade(progress, upgradeId) {
    const upgrade = UPGRADE_DEFINITIONS.find((item) => item.id === upgradeId);
    if (!upgrade)
      return { progress, purchased: false };
    const owned = progress.owned[upgradeId] || 0;
    const cost = upgrade.cost + owned * 8;
    if (progress.coins < cost)
      return { progress, purchased: false };
    return {
      purchased: true,
      progress: {
        ...progress,
        coins: progress.coins - cost,
        owned: { ...progress.owned, [upgradeId]: owned + 1 },
        selected: upgradeId
      }
    };
  }
  function getShopInventory(progress) {
    return UPGRADE_DEFINITIONS.map((upgrade) => ({
      ...upgrade,
      owned: progress.owned[upgrade.id] || 0,
      selected: progress.selected === upgrade.id,
      price: upgrade.cost + (progress.owned[upgrade.id] || 0) * 8
    }));
  }
  function deriveLoadout(progress) {
    return {
      lift: 1 + (progress.owned.lift || 0) * 0.08,
      thrust: 1 + (progress.owned.thrust || 0) * 0.1,
      glide: 1 - Math.min(0.28, (progress.owned.glide || 0) * 0.05),
      thermal: 1 + (progress.owned.thermal || 0) * 0.12
    };
  }

  // fly-aerodynamics/src/state/storage.js
  var STORAGE_KEY = "fly-aerodynamics.progress.v1";
  function loadProgress() {
    if (typeof localStorage === "undefined")
      return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function saveProgress(progress) {
    if (typeof localStorage === "undefined")
      return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      return true;
    } catch {
      return false;
    }
  }

  // fly-aerodynamics/src/sim/world.js
  var FNV_OFFSET = 2166136261;
  var FNV_PRIME = 16777619;
  function hashInt(seed, value) {
    let hash = seed ^ value;
    hash = Math.imul(hash, FNV_PRIME);
    return hash >>> 0;
  }
  function seededValue(seed, x, y = 0) {
    let hash = FNV_OFFSET;
    hash = hashInt(hash, seed);
    hash = hashInt(hash, x | 0);
    hash = hashInt(hash, y | 0);
    return hash % 1e4 / 1e4;
  }
  function sampleThermals(seed, distance, altitude) {
    const cell = Math.floor(distance / 220);
    const thermals = [];
    for (let i = -1;i <= 3; i += 1) {
      const index = cell + i;
      const chance = seededValue(seed, index, 17);
      if (chance < 0.42)
        continue;
      const x = index * 220 + 110 + seededValue(seed, index, 23) * 60;
      const centerY = 140 + seededValue(seed, index, 29) * 260;
      const strength = 4.5 + seededValue(seed, index, 31) * 7.5;
      const radius = 42 + seededValue(seed, index, 37) * 58;
      thermals.push({ id: `thermal-${index}`, x, centerY, strength, radius, active: altitude > 5 });
    }
    return thermals;
  }
  function sampleHazards(seed, distance) {
    const hazards = [];
    const cell = Math.floor(distance / 260);
    for (let i = 0;i < 4; i += 1) {
      const index = cell + i;
      const chance = seededValue(seed, index, 53);
      if (chance < 0.35)
        continue;
      hazards.push({
        id: `hazard-${index}`,
        x: index * 260 + 70 + seededValue(seed, index, 59) * 120,
        y: 220 + seededValue(seed, index, 61) * 210,
        radius: 18 + seededValue(seed, index, 67) * 18,
        kind: chance > 0.8 ? "updraft-shear" : "bird-shock"
      });
    }
    return hazards;
  }
  function generateRunTarget(seed, upgrades) {
    const bonus = (upgrades.lift || 0) * 40 + (upgrades.glide || 0) * 55 + (upgrades.thermal || 0) * 30;
    const baseline = 720 + Math.floor(seededValue(seed, 1, 2) * 260);
    return Math.round(baseline + bonus);
  }
  function sampleWind(seed, distance) {
    const band = Math.floor(distance / 180);
    return (seededValue(seed, band, 83) - 0.5) * 3.5;
  }

  // fly-aerodynamics/src/sim/flightModel.js
  var G = 9.81;
  var AIR_DENSITY = 1.225;
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function angleOfAttack(pitch, velocityAngle) {
    return normalizeAngle(pitch - velocityAngle);
  }
  function liftForce({ speed, liftCoefficient, wingArea, airDensity = AIR_DENSITY }) {
    return 0.5 * airDensity * speed * speed * wingArea * liftCoefficient;
  }
  function dragForce({ speed, dragCoefficient, wingArea, airDensity = AIR_DENSITY }) {
    return 0.5 * airDensity * speed * speed * wingArea * dragCoefficient;
  }
  function gravityForce(mass, gravity = G) {
    return mass * gravity;
  }
  function stallFactor(aoa, stallAngle = 0.24) {
    const abs = Math.abs(aoa);
    if (abs <= stallAngle)
      return 1;
    const fade = clamp(1 - (abs - stallAngle) / (stallAngle * 1.5), 0, 1);
    return fade * fade;
  }
  function thermalForce({ thermalStrength, altitude, radius, centerY, x, centerX }) {
    const dx = x - centerX;
    const dy = altitude - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > radius)
      return 0;
    const falloff = 1 - distance / radius;
    return thermalStrength * falloff * falloff;
  }
  function normalizeAngle(angle) {
    let result = angle;
    while (result > Math.PI)
      result -= Math.PI * 2;
    while (result < -Math.PI)
      result += Math.PI * 2;
    return result;
  }
  function integrateFlightStep(state, forces, dt) {
    const ax = forces.thrust / state.mass - forces.drag / state.mass;
    const ay = (forces.lift + forces.thermal - forces.weight) / state.mass;
    return {
      speedX: Math.max(0, state.speedX + ax * dt),
      speedY: state.speedY + ay * dt
    };
  }

  // fly-aerodynamics/src/Game.js
  function normalizeInput(input = {}) {
    return {
      left: Boolean(input.left),
      right: Boolean(input.right),
      up: Boolean(input.up),
      down: Boolean(input.down),
      start: Boolean(input.start),
      restart: Boolean(input.restart),
      purchase: input.purchase ?? null,
      select: input.select ?? null
    };
  }

  class Game {
    constructor() {
      this.progress = createProgression();
      this.loadout = deriveLoadout(this.progress);
      this.restart();
      this.hydrateProgress();
    }
    hydrateProgress() {
      const stored = loadProgress();
      if (stored)
        this.progress = { ...createProgression(), ...stored };
      this.loadout = deriveLoadout(this.progress);
      this.shop = getShopInventory(this.progress);
      return this.progress;
    }
    startRun(loadout) {
      this.loadout = loadout || deriveLoadout(this.progress);
      this.seed = Math.random() * 1e9 | 0;
      this.targetDistance = generateRunTarget(this.seed, this.progress.owned);
      this.phase = "launch";
      this.outcome = "Launch clean and find lift.";
      this.flight = {
        x: 0,
        y: 22,
        pitch: -0.04,
        speedX: 8,
        speedY: 0,
        mass: 1,
        fuel: 100,
        bank: 0,
        thrusting: true
      };
      this.trail = [];
      this.landing = null;
    }
    restart() {
      this.phase = "menu";
      this.seed = 1;
      this.targetDistance = 800;
      this.loadout = deriveLoadout(this.progress);
      this.flight = { x: 0, y: 0, pitch: 0, speedX: 0, speedY: 0, mass: 1, fuel: 100, bank: 0, thrusting: false };
      this.trail = [];
      this.landing = null;
      this.outcome = "Ready for launch.";
      this.shop = getShopInventory(this.progress);
      this.world = { thermals: [], hazards: [], wind: 0 };
    }
    selectUpgrade(upgradeId) {
      this.progress = selectUpgrade(this.progress, upgradeId);
      this.loadout = deriveLoadout(this.progress);
      this.shop = getShopInventory(this.progress);
      saveProgress(this.progress);
    }
    purchaseUpgrade(upgradeId) {
      const result = purchaseUpgrade(this.progress, upgradeId);
      this.progress = result.progress;
      this.loadout = deriveLoadout(this.progress);
      this.shop = getShopInventory(this.progress);
      if (result.purchased)
        saveProgress(this.progress);
      return result.purchased;
    }
    update(dt, input) {
      const control = normalizeInput(input);
      if (control.restart)
        this.restart();
      if (control.select)
        this.selectUpgrade(control.select);
      if (control.purchase)
        this.purchaseUpgrade(control.purchase);
      if (this.phase === "menu") {
        if (control.start)
          this.startRun();
        return;
      }
      if (this.phase === "shop") {
        if (control.start)
          this.startRun();
        return;
      }
      const liftBonus = this.loadout.lift;
      const thrustBonus = this.loadout.thrust;
      const glideBonus = this.loadout.glide;
      const thermalBonus = this.loadout.thermal;
      const steer = (control.right ? 1 : 0) - (control.left ? 1 : 0);
      const pitchInput = (control.up ? 1 : 0) - (control.down ? 1 : 0);
      this.flight.bank = clamp(this.flight.bank + steer * dt * 1.6, -1, 1);
      this.flight.pitch = clamp(this.flight.pitch + pitchInput * dt * 0.7, -0.65, 0.5);
      const worldX = this.flight.x;
      const worldY = Math.max(0, this.flight.y);
      const thermals = sampleThermals(this.seed, worldX, worldY);
      const hazards = sampleHazards(this.seed, worldX);
      const wind = sampleWind(this.seed, worldX);
      const aoa = angleOfAttack(this.flight.pitch, Math.atan2(this.flight.speedY, Math.max(0.01, this.flight.speedX)));
      const stall = stallFactor(aoa, 0.26);
      const speed = Math.hypot(this.flight.speedX, this.flight.speedY);
      const liftCoeff = (0.42 + liftBonus * 0.22 + Math.max(0, this.flight.pitch) * 0.18) * stall;
      const dragCoeff = 0.032 * glideBonus + 0.018 + Math.abs(this.flight.bank) * 0.01;
      const lift = liftForce({ speed, liftCoefficient: liftCoeff, wingArea: 1.15 });
      const drag = dragForce({ speed, dragCoefficient: dragCoeff, wingArea: 0.95 });
      const thermal = thermals.reduce((sum, item) => sum + thermalForce({
        thermalStrength: item.strength * thermalBonus,
        altitude: worldY,
        radius: item.radius,
        centerY: item.centerY,
        x: worldX,
        centerX: item.x
      }), 0);
      const weight = gravityForce(this.flight.mass);
      const next = integrateFlightStep({ ...this.flight, speedX: this.flight.speedX + wind * dt, mass: 1 }, { thrust: this.flight.fuel > 0 ? 7.5 * thrustBonus * (this.phase === "launch" ? 1 : 0.22) : 0, drag, lift, thermal, weight }, dt);
      this.flight.speedX = next.speedX;
      this.flight.speedY = next.speedY - (this.flight.bank * 1.6 + 0.14) * dt;
      this.flight.x += this.flight.speedX * 22 * dt;
      this.flight.y = Math.max(0, this.flight.y + this.flight.speedY * 18 * dt);
      this.flight.fuel = Math.max(0, this.flight.fuel - (this.phase === "launch" ? 18 : 5) * dt - Math.abs(this.flight.bank) * 2 * dt);
      this.world = { thermals, hazards, wind };
      this.trail.unshift({ x: this.flight.x, y: this.flight.y });
      this.trail.length = Math.min(30, this.trail.length);
      if (this.flight.x > this.targetDistance && this.phase === "launch")
        this.phase = "flight";
      if (this.flight.y <= 0 && this.flight.x > 40) {
        this.landing = { distance: this.flight.x, speed };
        const payout = Math.max(3, Math.round(this.flight.x / 18 + this.targetDistance / 45 + this.flight.fuel * 0.08));
        this.progress = applyRunPayout(this.progress, payout);
        saveProgress(this.progress);
        this.shop = getShopInventory(this.progress);
        this.phase = "shop";
        this.outcome = this.flight.x >= this.targetDistance ? `Made target. +${payout} coins.` : `Crash landing. +${payout} coins.`;
      }
      if (this.flight.fuel <= 0 && this.phase === "launch")
        this.phase = "flight";
    }
    getFrameState() {
      return {
        phase: this.phase,
        outcome: this.outcome,
        targetDistance: this.targetDistance,
        player: { ...this.flight },
        pose: {
          x: this.flight.x,
          y: this.flight.y,
          bank: this.flight.bank,
          pitch: this.flight.pitch
        },
        trail: this.trail,
        thermals: this.world.thermals,
        hazards: this.world.hazards,
        hud: {
          altitude: this.flight.y,
          speed: Math.hypot(this.flight.speedX, this.flight.speedY),
          fuel: this.flight.fuel,
          coins: this.progress.coins,
          wind: this.world.wind,
          distance: this.flight.x
        },
        shop: this.shop,
        upgrades: this.shop,
        overlayMode: this.phase,
        distance: this.flight.x,
        menuActions: [
          { id: "startRun", label: this.phase === "menu" ? "Launch" : "Fly Again" },
          { id: "restart", label: "Reset" }
        ]
      };
    }
  }
  var Game_default = Game;

  // fly-aerodynamics/src/main.js
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var hudRoot = document.getElementById("hud-root");
  var menuRoot = document.getElementById("menu-root");
  var hud = createHud(hudRoot);
  var game = new Game_default;
  var input = { left: false, right: false, up: false, down: false, start: false, restart: false, pointerStart: false };
  var pointerHeld = false;
  var lastTime = performance.now();
  bindMenuActions({
    startRun: () => game.startRun(),
    restart: () => game.restart(),
    purchaseUpgrade: (id) => game.purchaseUpgrade(id),
    selectUpgrade: (id) => game.selectUpgrade(id)
  });
  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }
  function applyInputEvents() {
    if (input.pointerStart)
      input.start = true;
  }
  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
    lastTime = now;
    resizeCanvas();
    applyInputEvents();
    game.update(dt, input);
    input.start = false;
    input.restart = false;
    input.pointerStart = false;
    const frameState = game.getFrameState();
    renderHud(frameState, hud);
    renderScene(ctx, frameState, { width: canvas.width, height: canvas.height, dpr: Math.max(1, window.devicePixelRatio || 1) });
    requestAnimationFrame(frame);
  }
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyA" || event.code === "ArrowLeft")
      input.left = true;
    if (event.code === "KeyD" || event.code === "ArrowRight")
      input.right = true;
    if (event.code === "KeyW" || event.code === "ArrowUp")
      input.up = true;
    if (event.code === "KeyS" || event.code === "ArrowDown")
      input.down = true;
    if (event.code === "Enter" || event.code === "Space") {
      input.start = true;
      event.preventDefault();
    }
    if (event.code === "KeyR")
      input.restart = true;
    if (event.code.startsWith("Digit")) {
      const upgradeIndex = Number(event.code.slice(5)) - 1;
      const upgradeId = game.getFrameState().shop[upgradeIndex]?.id;
      if (upgradeId)
        game.selectUpgrade(upgradeId);
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "KeyA" || event.code === "ArrowLeft")
      input.left = false;
    if (event.code === "KeyD" || event.code === "ArrowRight")
      input.right = false;
    if (event.code === "KeyW" || event.code === "ArrowUp")
      input.up = false;
    if (event.code === "KeyS" || event.code === "ArrowDown")
      input.down = false;
  });
  window.addEventListener("pointerdown", (event) => {
    pointerHeld = true;
    input.pointerStart = true;
    if (event.target instanceof HTMLElement)
      event.target.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener("pointerup", () => {
    pointerHeld = false;
    input.pointerStart = false;
    input.left = false;
    input.right = false;
  });
  window.addEventListener("pointermove", (event) => {
    const steer = Math.sign(event.clientX / Math.max(1, window.innerWidth) - 0.5);
    input.left = steer < 0 && pointerHeld;
    input.right = steer > 0 && pointerHeld;
  });
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  requestAnimationFrame(frame);
})();
