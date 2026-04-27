import { EconomyManager } from "./EconomyManager.js";
import { EnemySpawner } from "./EnemySpawner.js";
import { SiegeEngine } from "./SiegeEngine.js";
import { UpgradeTree } from "./UpgradeTree.js";

const ASSET_PATHS = {
  house: "./assets/house.png",
  sniper: "./assets/sniper.png",
  craftsman: "./assets/craftsman.png",
  stickman: "./assets/stickman.png",
  turret: "./assets/turret.png",
  barricade: "./assets/barricade.png",
};

const loadImage = (src) =>
  new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

const loadAssets = async () => {
  const loaded = await Promise.all(
    Object.entries(ASSET_PATHS).map(async ([key, src]) => [key, await loadImage(src)]),
  );
  return Object.fromEntries(loaded);
};

const drawSprite = (ctx, image, x, y, width, height, fallbackColor) => {
  if (image) {
    ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
    return;
  }
  ctx.fillStyle = fallbackColor;
  ctx.fillRect(x - width / 2, y - height / 2, width, height);
};

const drawHealthBar = (ctx, x, y, width, ratio, color) => {
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(x, y, width, 8);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * clamp(ratio, 0, 1), 8);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function bootstrapStormDefense() {
  const canvas = document.getElementById("game-canvas");
  const shell = document.getElementById("game-shell");
  const startButton = document.getElementById("start-button");
  const advanceButton = document.getElementById("advance-button");
  const restartButton = document.getElementById("restart-button");
  const offersRoot = document.getElementById("shop-offers");
  const healthValue = document.getElementById("health-value");
  const goldValue = document.getElementById("gold-value");
  const ammoValue = document.getElementById("ammo-value");
  const waveValue = document.getElementById("wave-value");
  const intermissionStatus = document.getElementById("intermission-status");
  const gameoverWave = document.getElementById("gameover-wave");
  const gameoverStats = document.getElementById("gameover-stats");

  if (!canvas || !shell) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const economyManager = new EconomyManager();
  const enemySpawner = new EnemySpawner();
  const upgradeTree = new UpgradeTree();
  const engine = new SiegeEngine({
    canvas,
    economyManager,
    enemySpawner,
    upgradeTree,
    assets: {},
  });

  const assets = {};
  loadAssets().then((loadedAssets) => {
    Object.assign(assets, loadedAssets);
    engine.setAssets(assets);
  });

  const renderOffers = (snapshot) => {
    if (!offersRoot) return;
    offersRoot.innerHTML = "";
    for (const offer of snapshot.offers) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "offer";
      button.disabled = snapshot.state !== "intermission" || offer.maxed || !offer.affordable;
      button.setAttribute("aria-disabled", String(button.disabled));
      button.innerHTML = `
        <span class="offer__title">${offer.label}</span>
        <span class="offer__meta">Lv ${offer.level}/${offer.maxPurchases}</span>
        <span class="offer__desc">${offer.description}</span>
        <span class="offer__cost">${offer.maxed ? "MAXED" : `${offer.cost} gold`}</span>
      `;
      button.addEventListener("click", () => {
        if (engine.purchaseOffer(offer.id)) {
          renderUI(engine.getSnapshot());
        }
      });
      offersRoot.appendChild(button);
    }
  };

  const renderUI = (snapshot) => {
    shell.dataset.state = snapshot.state;
    healthValue.textContent = `${Math.max(0, Math.ceil(snapshot.houseHealth))}`;
    goldValue.textContent = `${snapshot.gold}`;
    ammoValue.textContent = snapshot.reloading ? "Reloading" : `${snapshot.ammo} / ${snapshot.maxAmmo}`;
    waveValue.textContent = `${Math.max(1, snapshot.wave || 1)}`;

    if (intermissionStatus) {
      intermissionStatus.textContent = `Wave ${snapshot.wave} clear. Snipers ${snapshot.allies.sniper}, craftsmen ${snapshot.allies.craftsman}, turrets ${snapshot.turrets}.`;
    }

    if (gameoverWave) {
      gameoverWave.textContent = `Final wave reached: ${snapshot.finalWaveReached || snapshot.wave}`;
    }

    if (gameoverStats) {
      gameoverStats.textContent = `Kills ${snapshot.kills} | Gold earned ${snapshot.earned} | Gold spent ${snapshot.spent}`;
    }

    renderOffers(snapshot);
  };

  const renderScene = (snapshot) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#08111b");
    sky.addColorStop(0.5, "#1a2534");
    sky.addColorStop(1, "#22130d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 5; i += 1) {
      const offset = ((snapshot.time * 45 + i * 170) % (canvas.width + 240)) - 120;
      ctx.beginPath();
      ctx.ellipse(offset, 110 + i * 18, 140, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#49311c";
    ctx.fillRect(0, 560, canvas.width, 160);
    ctx.fillStyle = "#2d2215";
    ctx.fillRect(0, 530, canvas.width, 36);

    drawSprite(ctx, assets.barricade, 980, 505, 180, 110, "#6d4522");
    drawSprite(ctx, assets.house, snapshot.house.x, snapshot.house.y, snapshot.house.width, snapshot.house.height, "#c9b18a");
    drawHealthBar(ctx, snapshot.house.x - 80, snapshot.house.y - 120, 160, snapshot.houseHealth / snapshot.houseMaxHealth, "#5bdb78");

    for (const trace of snapshot.traces) {
      ctx.strokeStyle = trace.hit ? "rgba(255, 196, 94, 0.9)" : "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = trace.hit ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(trace.x1, trace.y1);
      ctx.lineTo(trace.x2, trace.y2);
      ctx.stroke();
    }

    for (const turret of snapshot.turretEntities) {
      drawSprite(ctx, assets.turret, turret.x, turret.y, 82, 82, "#91a4b8");
    }

    for (const ally of snapshot.allyEntities) {
      if (ally.role === "sniper") {
        drawSprite(ctx, assets.sniper, ally.x, ally.y, 70, 108, "#74c3ff");
      } else {
        drawSprite(ctx, assets.craftsman, ally.x, ally.y, 74, 112, "#ffc574");
      }
    }

    for (const enemy of snapshot.enemies) {
      drawSprite(ctx, assets.stickman, enemy.x, enemy.y, enemy.radius * 3.6, enemy.radius * 4.1, "#ff7d59");
      drawHealthBar(ctx, enemy.x - 20, enemy.y - enemy.radius - 20, 40, enemy.health / enemy.maxHealth, "#ff6a6a");
    }

    const pulse = Math.sin(snapshot.time * 6) * 0.5 + 0.5;
    ctx.strokeStyle = `rgba(255, 199, 112, ${0.35 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(snapshot.aimTarget.x, snapshot.aimTarget.y, 12 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(snapshot.aimTarget.x - 18, snapshot.aimTarget.y);
    ctx.lineTo(snapshot.aimTarget.x + 18, snapshot.aimTarget.y);
    ctx.moveTo(snapshot.aimTarget.x, snapshot.aimTarget.y - 18);
    ctx.lineTo(snapshot.aimTarget.x, snapshot.aimTarget.y + 18);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 20px Impact, Arial Black, sans-serif";
    ctx.fillText(`Enemies ${snapshot.waveStatus.active}/${snapshot.waveStatus.totalSpawns}`, 32, 682);
  };

  const toCanvasPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  startButton?.addEventListener("click", () => engine.startRun());
  advanceButton?.addEventListener("click", () => engine.advanceIntermission());
  restartButton?.addEventListener("click", () => engine.restartRun());

  canvas.addEventListener("pointermove", (event) => engine.setAimTarget(toCanvasPoint(event)));
  canvas.addEventListener("pointerdown", (event) => {
    engine.setAimTarget(toCanvasPoint(event));
    engine.setTriggerHeld(true);
  });
  canvas.addEventListener("pointerup", () => engine.setTriggerHeld(false));
  canvas.addEventListener("pointerleave", () => engine.setTriggerHeld(false));

  let last = performance.now();
  const frame = (now) => {
    const delta = now - last;
    last = now;
    engine.tick(delta);
    const snapshot = engine.getSnapshot();
    renderUI(snapshot);
    renderScene(snapshot);
    requestAnimationFrame(frame);
  };

  const initialSnapshot = engine.getSnapshot();
  renderUI(initialSnapshot);
  renderScene(initialSnapshot);
  requestAnimationFrame(frame);

  return engine;
}

if (typeof window !== "undefined") {
  window.bootstrapStormDefense = bootstrapStormDefense;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapStormDefense, { once: true });
  } else {
    bootstrapStormDefense();
  }
}
