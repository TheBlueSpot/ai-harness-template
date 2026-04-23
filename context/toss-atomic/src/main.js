import { WORLD, PHYSICS, LAUNCH, DEFAULT_RUN_STATS } from "./constants.js";
import { createHero, buildCourseEntities } from "./entities.js";
import LaunchDynamics from "./LaunchDynamics.js";
import CollisionManager from "./CollisionManager.js";
import { ParticleSystem } from "./ParticleSystem.js";
import { Renderer } from "./Renderer.js";
import UIController from "./UIController.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const shell = document.getElementById("shell");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (x, y) => Math.hypot(x, y);

function terrainHeight(x) {
  const waveA = Math.sin(x / 430) * 72;
  const waveB = Math.sin(x / 970 + 0.55) * 122;
  const waveC = Math.cos(x / 2160 - 0.3) * 48;
  const crater = Math.sin(x / 115 + 1.75) * Math.cos(x / 280) * 30;
  return WORLD.groundBase + waveA + waveB + waveC + crater;
}

function makeStats() {
  return { ...DEFAULT_RUN_STATS };
}

const particles = new ParticleSystem();
const renderer = new Renderer(ctx);
let ui = null;

const game = {
  mode: "menu",
  width: canvas.width,
  height: canvas.height,
  time: 0,
  cameraX: 0,
  terrain: terrainHeight,
  launcher: { x: 170, y: terrainHeight(170) - 42 },
  pointer: { x: 560, y: terrainHeight(170) - 340, active: false, down: false },
  controls: { left: false, right: false, up: false, down: false },
  projectile: createHero({ x: 170, y: terrainHeight(170) - 66 }),
  hazards: [],
  bombs: [],
  stats: makeStats(),
  message: "Charge the launcher, then steer midair with WASD or arrows.",
  hasAwarded: false,

  canLaunch() {
    return this.mode === "playing" && !this.projectile.active && !this.projectile.launched;
  },

  startRun() {
    startRun();
  },

  restartRun() {
    startRun();
  },

  resumeRun() {
    if (this.mode === "paused") {
      this.mode = "playing";
      ui.showGameplay();
    }
  },

  goToMenu() {
    this.mode = "menu";
    ui.showMenu();
  },

  openShop() {
    this.mode = this.mode === "playing" ? "paused" : this.mode;
    ui.showShop();
  },

  closeShop() {
    if (this.mode === "paused") {
      this.mode = "playing";
      ui.showGameplay();
      return;
    }
    ui.showMenu();
  },

  resetUpgrades() {
    if (ui) applyUpgradeTuning();
  },

  setUpgradeTuning() {
    if (ui) applyUpgradeTuning();
  },
};

const launch = new LaunchDynamics(game, particles);
const collisions = new CollisionManager(game);
ui = new UIController({
  root: shell,
  game,
  mode: "menu",
  hooks: {
    start: "startRun",
    retry: "restartRun",
    menu: "goToMenu",
    shop: "openShop",
    "close-shop": "closeShop",
    "reset-upgrades": "resetUpgrades",
  },
});

ui.on("upgrade", () => applyUpgradeTuning());

function resetEntities() {
  const course = buildCourseEntities();
  game.hazards = course.hazards;
  game.bombs = course.bombs;
  for (const hazard of game.hazards) {
    hazard.y = terrainHeight(hazard.x) - hazard.radius + 7;
  }
  for (const bomb of game.bombs) {
    bomb.y = terrainHeight(bomb.x) - bomb.radius - 12;
  }
}

function resetProjectile() {
  game.launcher.x = 170;
  game.launcher.y = terrainHeight(game.launcher.x) - 42;
  game.projectile = createHero({
    x: game.launcher.x,
    y: game.launcher.y - 28,
    launchOriginX: game.launcher.x,
    launchOriginY: game.launcher.y - 28,
  });
}

function startRun() {
  game.mode = "playing";
  game.time = 0;
  game.cameraX = 0;
  game.stats = makeStats();
  game.hasAwarded = false;
  game.message = "Launch armed. Space or Launch fires; steer midair.";
  resetProjectile();
  resetEntities();
  particles.clear();
  launch.reset();
  collisions.resetRound();
  applyUpgradeTuning();
  ui.showGameplay();
  ui.setMessage("");
}

function finishRun() {
  if (game.hasAwarded) {
    return;
  }
  game.hasAwarded = true;
  game.mode = "results";
  const award = ui.store.awardRun(game.stats);
  ui.setResults({
    ...game.stats,
    coinsEarned: award.reward,
    message: "Run complete. Coins awarded from distance, airtime, bounces, and score.",
  });
  ui.showResults();
}

function applyUpgradeTuning() {
  const tuning = ui.store.getTuning();
  launch.config.maxSpeed = PHYSICS.maxSpeed * tuning.launchSpeedScale;
  launch.config.airDrag = PHYSICS.airDrag * tuning.airDrag;
  launch.config.midairThrust = LAUNCH.midairThrust * tuning.controlForce;
  launch.config.midairLift = LAUNCH.midairLift * tuning.lift;
  launch.config.midairFuelMax = LAUNCH.midairFuelMax * tuning.controlFuel;
  launch.config.linearDamping = clamp(PHYSICS.linearDamping + (tuning.glide - 1) * 0.01, 0.986, 1.006);
  collisions.config.groundRestitution = clamp(PHYSICS.groundRestitution * tuning.bounceEnergy, 0.18, 0.92);
  collisions.config.hazardRestitution = clamp(PHYSICS.hazardRestitution * tuning.hazardBounce, 0.2, 0.98);
  collisions.config.bombBlastImpulse = 1140 * tuning.bombBounce;
}

function aimPointerFromScreen(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = (clientX - rect.left) * (canvas.width / rect.width);
  const sy = (clientY - rect.top) * (canvas.height / rect.height);
  game.pointer.x = game.cameraX + sx;
  game.pointer.y = sy;
  game.pointer.active = true;
}

function launchFromPointer() {
  if (game.mode !== "playing") {
    return;
  }
  const tuning = ui.store.getTuning();
  const origin = game.launcher;
  const dx = game.pointer.x - origin.x;
  const dy = game.pointer.y - origin.y;
  const mag = Math.max(distance(dx, dy), 1);
  const power = clamp(mag / 620, 0.38, 1) * tuning.launchImpulseScale;
  const angle = clamp(Math.atan2(-dy, dx), LAUNCH.releaseAngleMin, LAUNCH.releaseAngleMax);
  launch.primeLaunch(game.projectile, { power, angle, spin: 8 });
  game.message = "In flight. Hold arrows/WASD or drag for active midair control.";
}

function readInput() {
  const input = ui.getInputState();
  game.controls.left = input.leftPressed || input.controlVector.x < -0.2;
  game.controls.right = input.rightPressed || input.controlVector.x > 0.2;
  game.controls.up = input.upPressed || input.controlVector.y < -0.2;
  game.controls.down = input.downPressed || input.controlVector.y > 0.2;
  if (input.pointer.active) {
    aimPointerFromScreen(input.pointer.x, input.pointer.y);
  }
  if (input.launchPressed && game.canLaunch()) {
    launchFromPointer();
  }
  if (input.retryPressed && game.mode === "results") {
    startRun();
  }
}

function updateStats() {
  const hero = game.projectile;
  game.stats.distance = Math.max(game.stats.distance, hero.distance ?? Math.max(0, hero.x - game.launcher.x));
  game.stats.altitude = hero.altitude ?? 0;
  game.stats.maxAltitude = Math.max(game.stats.maxAltitude, hero.maxAltitude ?? 0);
  game.stats.maxSpeed = Math.max(game.stats.maxSpeed, hero.maxSpeed ?? hero.speed ?? 0);
  game.stats.airtime = Math.max(game.stats.airtime, hero.airtime ?? 0);
  game.stats.bounces = Math.max(game.stats.bounces, hero.bounceCount ?? 0);
  game.stats.bombs = Math.max(game.stats.bombs, hero.bombHits ?? 0);
  game.stats.hazards = Math.max(game.stats.hazards, hero.hazardHits ?? 0);
  game.stats.combo = Math.max(game.stats.combo, hero.combo ?? 0);
}

function update(dt) {
  game.time += dt;
  readInput();

  if (game.mode === "playing") {
    const dynamics = launch.update(dt);
    if (dynamics?.events) {
      for (const event of dynamics.events) {
        if (event.type === "thrust") {
          particles.emitTrail(event.x, event.y, -event.vx, -event.vy);
        }
      }
    }

    const impact = collisions.update(dt);
    if (impact?.events) {
      for (const event of impact.events) {
        particles.emit(event);
        if (event.type === "terrainContact") game.stats.bounces += 1;
        if (event.type === "hazardHit") game.stats.hazards += 1;
        if (event.type === "bombDetonation") game.stats.bombs += 1;
      }
    }

    if (game.projectile.active || game.projectile.launched) {
      game.cameraX = clamp(game.projectile.x - game.width * 0.33, 0, WORLD.width - game.width);
    }
    updateStats();

    if ((game.projectile.settled && game.projectile.airtime > 0.8) || game.projectile.x >= WORLD.width - 80) {
      finishRun();
    }
  }

  particles.update(dt);
  ui.setHUD({
    distance: game.stats.distance,
    speed: game.projectile.speed ?? 0,
    altitude: game.projectile.altitude ?? 0,
    bounces: game.stats.bounces,
  });
  ui.setLaunchState({
    fuel: game.projectile.fuel ?? 1,
    message: game.message,
  });
}

function projectEntity(entity) {
  return { ...entity, x: entity.x - game.cameraX };
}

function buildTrajectory() {
  if (game.projectile.launched) {
    return null;
  }
  const origin = { x: game.launcher.x, y: game.launcher.y - 28, vx: 0, vy: 0 };
  const dx = game.pointer.x - game.launcher.x;
  const dy = game.pointer.y - game.launcher.y;
  const mag = Math.max(distance(dx, dy), 1);
  const speed = LAUNCH.releasePowerMin + (LAUNCH.releasePowerMax - LAUNCH.releasePowerMin) * clamp(mag / 620, 0.38, 1);
  origin.vx = (dx / mag) * speed;
  origin.vy = (dy / mag) * speed - 120;
  const scaleY = game.height / WORLD.height;
  return launch.peekTrajectory(origin, 1.3, 1 / 18).map((point) => ({
    ...point,
    x: point.x - game.cameraX,
    y: point.y * scaleY,
  }));
}

function render() {
  const scaleY = game.height / WORLD.height;
  const toScreenY = (y) => y * scaleY;
  const floorY = toScreenY(terrainHeight(game.cameraX + game.width * 0.45));
  const project = (entity) => ({
    ...projectEntity(entity),
    y: toScreenY(entity.y),
    radius: Math.max(10, (entity.radius ?? 20) * Math.sqrt(scaleY)),
  });
  renderer.render({
    width: game.width,
    height: game.height,
    time: game.time,
    horizonY: WORLD.horizonY,
    floorY,
    projectile: project(game.projectile),
    hazards: game.hazards.map(project),
    bombs: game.bombs.map(project),
    target: { x: WORLD.width - game.cameraX - 160, y: floorY - 220, radius: 80 },
    trajectory: buildTrajectory(),
    overlay: game.mode === "menu" || game.mode === "results" || game.mode === "paused"
      ? { alpha: 0.18, fill: "rgba(0,0,0,.55)" }
      : null,
  });
  ctx.save();
  ctx.translate(-game.cameraX, 0);
  ctx.scale(1, scaleY);
  particles.draw(ctx);
  ctx.restore();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  game.width = Math.round(rect.width * dpr);
  game.height = Math.round(rect.height * dpr);
  canvas.width = game.width;
  canvas.height = game.height;
  renderer.resize(game.width, game.height);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000 || 0);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointermove", (event) => aimPointerFromScreen(event.clientX, event.clientY));
canvas.addEventListener("pointerdown", (event) => {
  aimPointerFromScreen(event.clientX, event.clientY);
  if (game.mode === "playing" && game.canLaunch()) {
    launchFromPointer();
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetProjectile();
resetEntities();
applyUpgradeTuning();
ui.sync({ mode: "menu", message: game.message });
requestAnimationFrame(frame);
