import { applyRunPayout, createProgression, deriveLoadout, getShopInventory, purchaseUpgrade, selectUpgrade } from "./state/progression.js";
import { loadProgress, saveProgress } from "./state/storage.js";
import { generateRunTarget, sampleHazards, sampleThermals, sampleWind } from "./sim/world.js";
import { angleOfAttack, clamp, dragForce, gravityForce, integrateFlightStep, liftForce, stallFactor, thermalForce } from "./sim/flightModel.js";

function normalizeInput(input = {}) {
  return {
    left: Boolean(input.left),
    right: Boolean(input.right),
    up: Boolean(input.up),
    down: Boolean(input.down),
    start: Boolean(input.start),
    restart: Boolean(input.restart),
    purchase: input.purchase ?? null,
    select: input.select ?? null,
  };
}

export class Game {
  constructor() {
    this.progress = createProgression();
    this.loadout = deriveLoadout(this.progress);
    this.restart();
    this.hydrateProgress();
  }

  hydrateProgress() {
    const stored = loadProgress();
    if (stored) this.progress = { ...createProgression(), ...stored };
    this.loadout = deriveLoadout(this.progress);
    this.shop = getShopInventory(this.progress);
    return this.progress;
  }

  startRun(loadout) {
    this.loadout = loadout || deriveLoadout(this.progress);
    this.seed = (Math.random() * 1e9) | 0;
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
      thrusting: true,
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
  }

  purchaseUpgrade(upgradeId) {
    const result = purchaseUpgrade(this.progress, upgradeId);
    this.progress = result.progress;
    this.loadout = deriveLoadout(this.progress);
    this.shop = getShopInventory(this.progress);
    if (result.purchased) saveProgress(this.progress);
    return result.purchased;
  }

  update(dt, input) {
    const control = normalizeInput(input);
    if (control.restart) this.restart();
    if (control.select) this.selectUpgrade(control.select);
    if (control.purchase) this.purchaseUpgrade(control.purchase);
    if (this.phase === "menu") {
      if (control.start) this.startRun();
      return;
    }
    if (this.phase === "shop") {
      if (control.start) this.startRun();
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
      centerX: item.x,
    }), 0);
    const weight = gravityForce(this.flight.mass);
    const next = integrateFlightStep(
      { ...this.flight, speedX: this.flight.speedX + wind * dt, mass: 1 },
      { thrust: this.flight.fuel > 0 ? 7.5 * thrustBonus * (this.phase === "launch" ? 1 : 0.22) : 0, drag, lift, thermal, weight },
      dt,
    );

    this.flight.speedX = next.speedX;
    this.flight.speedY = next.speedY - (this.flight.bank * 1.6 + 0.14) * dt;
    this.flight.x += this.flight.speedX * 22 * dt;
    this.flight.y = Math.max(0, this.flight.y + this.flight.speedY * 18 * dt);
    this.flight.fuel = Math.max(0, this.flight.fuel - (this.phase === "launch" ? 18 : 5) * dt - Math.abs(this.flight.bank) * 2 * dt);
    this.world = { thermals, hazards, wind };
    this.trail.unshift({ x: this.flight.x, y: this.flight.y });
    this.trail.length = Math.min(30, this.trail.length);

    if (this.flight.x > this.targetDistance && this.phase === "launch") this.phase = "flight";
    if (this.flight.y <= 0 && this.flight.x > 40) {
      this.landing = { distance: this.flight.x, speed: speed };
      const payout = Math.max(3, Math.round(this.flight.x / 18 + this.targetDistance / 45 + this.flight.fuel * 0.08));
      this.progress = applyRunPayout(this.progress, payout);
      saveProgress(this.progress);
      this.shop = getShopInventory(this.progress);
      this.phase = "shop";
      this.outcome = this.flight.x >= this.targetDistance ? `Made target. +${payout} coins.` : `Crash landing. +${payout} coins.` ;
    }
    if (this.flight.fuel <= 0 && this.phase === "launch") this.phase = "flight";
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
        pitch: this.flight.pitch,
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
        distance: this.flight.x,
      },
      shop: this.shop,
      upgrades: this.shop,
      overlayMode: this.phase,
      distance: this.flight.x,
      menuActions: [
        { id: "startRun", label: this.phase === "menu" ? "Launch" : "Fly Again" },
        { id: "restart", label: "Reset" },
      ],
    };
  }
}

export default Game;
