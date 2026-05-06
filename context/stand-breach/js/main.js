const { ZombieLogic, WeaponSystem, DayCycle } = window.StandBreach ?? {};

if (!ZombieLogic || !WeaponSystem || !DayCycle) {
  throw new Error("Stand Breach dependencies failed to load.");
}

const shell = document.getElementById("game-shell");
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const menuScreen = document.getElementById("menu-screen");
const hudScreen = document.getElementById("hud");
const gameoverScreen = document.getElementById("gameover-screen");
const startButton = document.getElementById("start-button");
const menuRestartButton = document.getElementById("menu-restart-button");
const restartButton = document.getElementById("restart-button");
const menuButton = document.getElementById("menu-button");

const dayValue = document.getElementById("day-value");
const scoreValue = document.getElementById("score-value");
const scrapValue = document.getElementById("scrap-value");
const breachValue = document.getElementById("breach-value");
const weaponValue = document.getElementById("weapon-value");
const weaponStrip = document.getElementById("weapon-strip");
const upgradeList = document.getElementById("upgrade-list");
const upgradeNote = document.getElementById("upgrade-note");
const gameoverSummary = document.getElementById("gameover-summary");
const weaponCards = [];
const upgradeCards = [];

const world = {
  width: 1600,
  height: 900
};

const zombieLogic = new ZombieLogic();
const weaponSystem = new WeaponSystem();
const dayCycle = new DayCycle();

const state = {
  mode: "menu",
  time: 0,
  day: 1,
  dayCycleNight: 0,
  score: 0,
  scrap: 0,
  kills: 0,
  playerHp: 100,
  barricade: [],
  zombies: [],
  bullets: [],
  sparks: [],
  damageFloats: [],
  fireHeld: false,
  lastPointer: { x: world.width * 0.65, y: world.height * 0.48 },
  upgrades: {
    weaponDamage: 0,
    weaponRate: 0,
    barricadeStrength: 0,
    repair: 0
  },
  spawnTimer: 0,
  shake: 0,
  summary: ""
};

const barricadeX = 1060;
const barricadeSegments = 7;
const segmentGap = 16;
const segmentHeight = 86;

const upgradeDefinitions = [
  {
    id: "weaponDamage",
    label: "Weapon Damage",
    description: "Raise all weapon impact and punch through tougher zombies.",
    cost: () => 28 + state.upgrades.weaponDamage * 10
  },
  {
    id: "weaponRate",
    label: "Weapon Rate",
    description: "Cut weapon delay and keep the line covered.",
    cost: () => 26 + state.upgrades.weaponRate * 9
  },
  {
    id: "barricadeStrength",
    label: "Barricade Strength",
    description: "Increase every segment's maximum health and repair ceiling.",
    cost: () => 34 + state.upgrades.barricadeStrength * 12
  },
  {
    id: "repair",
    label: "Wall Repair",
    description: "Restore one damaged or broken segment immediately.",
    cost: () => 22 + state.upgrades.repair * 8
  }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeBarricade() {
  const totalHeight = barricadeSegments * segmentHeight + (barricadeSegments - 1) * segmentGap;
  const startY = (world.height - totalHeight) / 2;
  return Array.from({ length: barricadeSegments }, (_, index) => ({
    id: `segment-${index}`,
    x: barricadeX,
    y: startY + index * (segmentHeight + segmentGap),
    width: 34,
    height: segmentHeight,
    hp: 100,
    maxHp: 100,
    broken: false,
    repairedAt: 0
  }));
}

function damageSegment(segment, amount) {
  if (!segment || segment.broken) {
    return;
  }
  segment.hp = clamp(segment.hp - amount, 0, segment.maxHp);
  if (segment.hp <= 0) {
    segment.broken = true;
    segment.repairedAt = 0;
  }
}

function repairSegment(segment, amount) {
  if (!segment) {
    return;
  }
  segment.hp = clamp(segment.hp + amount, 0, segment.maxHp);
  segment.broken = segment.hp <= 0;
}

function resetRun() {
  state.time = 0;
  state.day = 1;
  state.dayCycleNight = 0;
  state.score = 0;
  state.scrap = 0;
  state.kills = 0;
  state.playerHp = 100;
  state.zombies = [];
  state.bullets = [];
  state.sparks = [];
  state.damageFloats = [];
  state.fireHeld = false;
  state.spawnTimer = 0.3;
  state.shake = 0;
  state.summary = "";
  state.barricade = makeBarricade();
  state.upgrades = {
    weaponDamage: 0,
    weaponRate: 0,
    barricadeStrength: 0,
    repair: 0
  };
  zombieLogic.clear();
  weaponSystem.switchWeapon(0);
  weaponSystem.cooldown = 0;
  dayCycle.reset();
  syncUi();
}

function setMode(mode) {
  state.mode = mode;
  shell.dataset.state = mode;
  menuScreen.setAttribute("aria-hidden", String(mode !== "menu"));
  hudScreen.setAttribute("aria-hidden", String(mode !== "playing"));
  gameoverScreen.setAttribute("aria-hidden", String(mode !== "gameover"));
  syncUi();
}

function startGame() {
  resetRun();
  setMode("playing");
}

function backToMenu() {
  resetRun();
  setMode("menu");
}

function gameOver(reason) {
  state.mode = "gameover";
  state.summary = reason;
  gameoverSummary.textContent = `Score ${state.score}, scrap ${state.scrap}, kills ${state.kills}. ${reason}`;
  setMode("gameover");
}

function getBreachPercent() {
  const broken = state.barricade.filter((segment) => segment.broken).length;
  return Math.round((broken / state.barricade.length) * 100);
}

function buildWeaponStrip() {
  if (!weaponCards.length) {
    weaponStrip.innerHTML = "";
    weaponSystem.getCardData(state.upgrades, state.dayCycleNight ?? 0).forEach((card, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "weapon-card";
      button.dataset.weaponId = card.id;
      button.addEventListener("click", () => {
        weaponSystem.switchWeapon(index);
        syncUi();
      });
      button.innerHTML = `
        <p class="weapon-card__name"></p>
        <p class="weapon-card__meta"></p>
        <p class="weapon-card__hint"></p>
      `;
      weaponCards.push({
        button,
        name: button.querySelector(".weapon-card__name"),
        meta: button.querySelector(".weapon-card__meta"),
        hint: button.querySelector(".weapon-card__hint")
      });
      weaponStrip.appendChild(button);
    });
  }

  weaponSystem.getCardData(state.upgrades, state.dayCycleNight ?? 0).forEach((card, index) => {
    const node = weaponCards[index];
    if (!node) {
      return;
    }
    node.button.dataset.active = String(card.active);
    node.name.textContent = `${index + 1}. ${card.label}`;
    node.meta.textContent = `Damage ${card.damage} | Cooldown ${card.cooldown.toFixed(2)}s | ${card.pellets} round${card.pellets > 1 ? "s" : ""}`;
    node.hint.textContent = card.hint;
  });
}

function buildUpgradeList() {
  if (!upgradeCards.length) {
    upgradeList.innerHTML = "";
    upgradeDefinitions.forEach((entry) => {
      const row = document.createElement("article");
      row.className = "upgrade-item";
      row.innerHTML = `
        <div>
          <div class="upgrade-item__title"></div>
          <div class="upgrade-item__meta"></div>
        </div>
        <button class="upgrade-item__action" type="button" data-upgrade="${entry.id}"></button>
      `;
      const button = row.querySelector("button");
      button.addEventListener("click", () => buyUpgrade(entry.id, entry.cost()));
      upgradeCards.push({
        row,
        title: row.querySelector(".upgrade-item__title"),
        meta: row.querySelector(".upgrade-item__meta"),
        button
      });
      upgradeList.appendChild(row);
    });
  }

  upgradeDefinitions.forEach((entry, index) => {
    const node = upgradeCards[index];
    if (!node) {
      return;
    }
    const cost = entry.cost();
    node.title.textContent = entry.label;
    node.meta.textContent = entry.description;
    node.button.textContent = `Buy ${cost} scrap`;
    node.button.disabled = state.scrap < cost || state.mode !== "playing";
  });
}

function applyBarricadeStrength() {
  state.barricade.forEach((segment) => {
    segment.maxHp += 14;
    segment.hp += 14;
    segment.broken = false;
  });
}

function buyUpgrade(id, cost) {
  if (state.scrap < cost || state.mode !== "playing") {
    return;
  }
  state.scrap -= cost;
  if (id === "weaponDamage") {
    state.upgrades.weaponDamage += 1;
  } else if (id === "weaponRate") {
    state.upgrades.weaponRate += 1;
  } else if (id === "barricadeStrength") {
    state.upgrades.barricadeStrength += 1;
    applyBarricadeStrength();
  } else if (id === "repair") {
    state.upgrades.repair += 1;
    const target = [...state.barricade].sort((a, b) => a.hp - b.hp)[0];
    if (target) {
      repairSegment(target, 56 + state.upgrades.repair * 6);
      target.broken = false;
    }
  }
  syncUi();
}

function syncUi() {
  const ammo = weaponSystem.getAmmoState();
  dayValue.textContent = String(state.day);
  scoreValue.textContent = String(state.score);
  scrapValue.textContent = String(state.scrap);
  breachValue.textContent = `${getBreachPercent()}%`;
  weaponValue.textContent = `${weaponSystem.current.label} ${ammo.clip}/${ammo.reserve}`;
  buildWeaponStrip();
  buildUpgradeList();
  upgradeNote.textContent = state.mode === "menu"
    ? "Start the defense to spend scrap on damage, rate, wall strength, or direct repairs."
    : `Weapon ${weaponSystem.current.label}. Scrap ${state.scrap}. Hold the breach and keep the wall alive.`;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
}

function toWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * world.width,
    y: ((clientY - rect.top) / rect.height) * world.height
  };
}

function spawnZombie() {
  const lane = Math.floor(Math.random() * state.barricade.length);
  const segment = state.barricade[lane];
  const x = world.width + 80 + Math.random() * 120;
  const y = segment.y + segment.height / 2 + (Math.random() * 28 - 14);
  const zombie = zombieLogic.createZombie({
    x,
    y,
    lane,
    day: state.day,
    night: state.dayCycleNight ?? 0,
    difficulty: 1 + state.day * 0.08 + (state.dayCycleNight ?? 0) * 0.85
  });
  zombie.attackTimer = 0;
  zombie.pushTimer = 0;
  zombie.wobble = Math.random() * Math.PI * 2;
  state.zombies = zombieLogic.getZombies();
}

function fireWeapon(dt, aim) {
  if (!state.fireHeld || state.mode !== "playing") {
    return;
  }
  const payload = weaponSystem.tryFire(
    { x: 280, y: world.height * 0.56 },
    aim,
    {
      upgrades: state.upgrades,
      night: state.dayCycleNight ?? 0,
      timestamp: Math.round(state.time * 1000)
    }
  );
  if (!payload.fired) {
    return;
  }
  state.bullets.push(...payload.shots);
  state.shake = Math.min(8, state.shake + 1.5);
}

function pushFloat(text, x, y, color = "#ffffff") {
  state.damageFloats.push({
    text,
    x,
    y,
    life: 0.9,
    color
  });
}

function handleZombieDeath(zombie) {
  state.kills += 1;
  state.score += 100 + zombie.reward * 2;
  state.scrap += zombie.reward;
  pushFloat(`+${zombie.reward} scrap`, zombie.x, zombie.y - 34, "#7fe0b0");
}

function hitZombie(zombie, damage, x, y) {
  const hit = zombieLogic.applyDamage(zombie.id, damage);
  zombie.rage = Math.min(1, zombie.rage + 0.18);
  state.shake = Math.min(10, state.shake + damage * 0.03);
  pushFloat(`-${damage}`, x, y, "#ffb86b");
  if (hit.killed) {
    handleZombieDeath(zombie);
  }
}

function updateBullets(dt) {
  state.bullets = state.bullets.filter((bullet) => {
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.life <= 0) {
      return false;
    }
    if (bullet.x < -50 || bullet.x > world.width + 50 || bullet.y < -40 || bullet.y > world.height + 40) {
      return false;
    }

    for (const zombie of state.zombies) {
      if (zombie.dead) {
        continue;
      }
      const dx = bullet.x - zombie.x;
      const dy = bullet.y - zombie.y;
      const hitRadius = (zombie.width + bullet.radius) * 0.5;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        hitZombie(zombie, bullet.damage, bullet.x, bullet.y);
        bullet.life = 0;
        break;
      }
    }

    return bullet.life > 0;
  });
}

function nearestBarricadeSegment(zombie) {
  const lane = clamp(zombie.lane, 0, state.barricade.length - 1);
  return state.barricade[lane];
}

function updateZombies(dt, lighting) {
  const playerX = 280;
  state.dayCycleNight = lighting.night;
  const barricadeApi = {
    segments: state.barricade,
    damageSegment: (segment, amount) => damageSegment(segment, amount)
  };
  const result = zombieLogic.update(
    dt,
    { x: playerX, y: world.height * 0.56 },
    barricadeApi,
    dayCycle
  );
  result.attacks.forEach((attack) => {
    const segment = state.barricade.find((entry) => entry.id === attack.segmentId);
    state.shake = Math.min(10, state.shake + 0.8);
    if (segment) {
      pushFloat(`-${Math.round(attack.damage)}`, segment.x, segment.y - 12, "#ff6a5c");
    }
  });
  state.zombies = zombieLogic.getZombies().filter((zombie) => {
    if (zombie.dead) {
      return false;
    }
    if (zombie.x <= playerX + 40) {
      state.playerHp -= zombie.attack * dt * (1 + lighting.night * 0.5);
      return state.playerHp > 0;
    }
    return zombie.x > -100;
  });
  zombieLogic.zombies = state.zombies;
}

function updateFloats(dt) {
  state.damageFloats = state.damageFloats.filter((float) => {
    float.life -= dt;
    float.y -= dt * 42;
    return float.life > 0;
  });
}

function updateRepair(dt) {
  state.barricade.forEach((segment, index) => {
    if (!segment.broken && segment.hp < segment.maxHp) {
      const pulse = index % 2 === 0 ? 1 : 0.6;
      segment.hp = clamp(segment.hp + dt * (1.5 + state.upgrades.repair * 0.25) * pulse, 0, segment.maxHp);
    }
    if (segment.hp <= 0) {
      segment.broken = true;
    }
  });
}

function maybeSpawnZombie(dt, lighting) {
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) {
    return;
  }
  state.spawnTimer = zombieLogic.getSpawnInterval({
    day: state.day,
    night: lighting.night,
    pressure: state.zombies.length
  }) * (0.8 + Math.random() * 0.4);
  spawnZombie();
}

function updateDayNight(dt, lighting) {
  const tension = state.zombies.length * 0.015;
  const next = dayCycle.update(dt * (1 + tension), state.zombies.length);
  return next;
}

function drawSky(lighting) {
  const { width, height } = world;
  const glow = ctx.createLinearGradient(0, 0, 0, height);
  glow.addColorStop(0, lighting.skyBlend);
  glow.addColorStop(1, "rgba(2, 4, 8, 1)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const moonX = width * (0.25 + 0.45 * lighting.phase);
  const moonY = height * (0.2 + 0.05 * Math.sin(lighting.phase * Math.PI * 2));
  ctx.save();
  ctx.globalAlpha = 0.28 + lighting.night * 0.42;
  ctx.fillStyle = "#dbeeff";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGround() {
  const { width, height } = world;
  const base = ctx.createLinearGradient(0, height * 0.54, 0, height);
  base.addColorStop(0, "rgba(21, 31, 27, 0.4)");
  base.addColorStop(1, "rgba(3, 5, 8, 1)");
  ctx.fillStyle = base;
  ctx.fillRect(0, height * 0.54, width, height * 0.46);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#87b7ff";
  ctx.lineWidth = 2;
  for (let index = 0; index < 11; index += 1) {
    const y = height * 0.64 + index * 46;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + Math.sin(index * 1.2) * 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBarricade(lighting) {
  state.barricade.forEach((segment) => {
    const ratio = segment.hp / segment.maxHp;
    const x = segment.x;
    const y = segment.y;
    ctx.save();
    ctx.fillStyle = segment.broken ? "rgba(60, 28, 24, 0.72)" : `rgba(${Math.round(80 + ratio * 70)}, ${Math.round(52 + ratio * 140)}, ${Math.round(38 + ratio * 56)}, 1)`;
    ctx.fillRect(x, y, segment.width, segment.height);
    ctx.strokeStyle = segment.broken ? "rgba(255, 107, 92, 0.65)" : "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, segment.width, segment.height);

    ctx.fillStyle = "rgba(255,255,255,0.09)";
    for (let rib = 0; rib < 3; rib += 1) {
      ctx.fillRect(x + 6, y + 12 + rib * 24, segment.width - 12, 4);
    }

    if (ratio < 0.35 && !segment.broken) {
      ctx.fillStyle = "rgba(255, 90, 78, 0.38)";
      ctx.fillRect(x, y, segment.width, segment.height);
    }

    if (segment.broken) {
      ctx.strokeStyle = "rgba(255, 90, 78, 0.75)";
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 8);
      ctx.lineTo(x + segment.width - 6, y + segment.height - 10);
      ctx.moveTo(x + 5, y + segment.height - 10);
      ctx.lineTo(x + segment.width - 7, y + 12);
      ctx.stroke();
    }

    ctx.restore();
  });

  ctx.save();
  ctx.globalAlpha = 0.24 + lighting.night * 0.16;
  ctx.fillStyle = "#2f8cff";
  ctx.fillRect(barricadeX - 18, 0, 4, world.height);
  ctx.restore();
}

function drawPlayer(lighting, aim) {
  const x = 280;
  const y = world.height * 0.56;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(127, 224, 176, 0.12)";
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d7f7ff";
  ctx.fillRect(-10, -24, 20, 46);
  ctx.fillStyle = "#7fe0b0";
  ctx.fillRect(-16, 12, 32, 12);
  const angle = Math.atan2(aim.y - y, aim.x - x);
  ctx.rotate(angle);
  ctx.strokeStyle = "#f9fbff";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(12, -4);
  ctx.lineTo(58, -4);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = `rgba(127, 224, 176, ${0.14 + lighting.night * 0.16})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 20, y);
  ctx.lineTo(aim.x, aim.y);
  ctx.stroke();
  ctx.restore();
}

function drawZombie(zombie) {
  const pulse = zombie.maxHp > 0 ? zombie.hp / zombie.maxHp : 0;
  ctx.save();
  ctx.translate(zombie.x, zombie.y);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.35 + zombie.rage * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(0, zombie.height * 0.26, zombie.width * 0.34, zombie.height * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = zombie.color;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(-zombie.width / 2, -zombie.height / 2, zombie.width, zombie.height);
  ctx.fillStyle = "rgba(10, 16, 22, 0.82)";
  ctx.fillRect(-zombie.width / 2 + 6, -zombie.height / 2 + 10, zombie.width - 12, zombie.height - 20);
  ctx.fillStyle = "rgba(247, 248, 255, 0.92)";
  ctx.fillRect(-zombie.width / 4, -zombie.height / 2 + 16, zombie.width / 8, 8);
  ctx.fillRect(zombie.width / 8, -zombie.height / 2 + 16, zombie.width / 8, 8);
  ctx.fillStyle = `rgba(255, 110, 92, ${0.2 + zombie.rage * 0.6})`;
  ctx.fillRect(-zombie.width / 2 + 8, -zombie.height / 2 + 6, zombie.width - 16, 4);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + pulse * 0.12})`;
  ctx.fillRect(-zombie.width / 2, zombie.height / 2 - 10, zombie.width * pulse, 4);
  ctx.restore();
}

function drawBullets() {
  state.bullets.forEach((bullet) => {
    ctx.save();
    ctx.fillStyle = bullet.color;
    ctx.shadowBlur = 18;
    ctx.shadowColor = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawFloats() {
  state.damageFloats.forEach((float) => {
    ctx.save();
    ctx.globalAlpha = clamp(float.life / 0.9, 0, 1);
    ctx.fillStyle = float.color;
    ctx.font = "700 18px Trebuchet MS";
    ctx.fillText(float.text, float.x, float.y);
    ctx.restore();
  });
}

function drawOverlayLighting(lighting) {
  ctx.save();
  ctx.fillStyle = `rgba(4, 8, 14, ${lighting.fog})`;
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.restore();
}

function render(lighting) {
  const aim = state.lastPointer;
  ctx.save();
  ctx.setTransform(canvas.width / world.width, 0, 0, canvas.height / world.height, 0, 0);
  if (state.shake > 0.01) {
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;
    ctx.translate(sx, sy);
    state.shake = Math.max(0, state.shake - 0.3);
  }

  drawSky(lighting);
  drawGround();
  drawBarricade(lighting);
  state.zombies.forEach(drawZombie);
  drawBullets();
  drawPlayer(lighting, aim);
  drawFloats();
  drawOverlayLighting(lighting);
  ctx.restore();
}

function update(dt) {
  if (state.mode !== "playing") {
    const idleLighting = dayCycle.update(dt * 0.35, 0);
    render(idleLighting);
    return;
  }

  state.time += dt;
  state.day = 1 + Math.floor(state.time / 50);
  const lighting = updateDayNight(dt, state.dayCycleNight ?? 0);
  weaponSystem.update(dt);
  maybeSpawnZombie(dt, lighting);
  fireWeapon(dt, state.lastPointer);
  updateBullets(dt);
  updateZombies(dt, lighting);
  updateFloats(dt);
  updateRepair(dt);

  if (state.playerHp <= 0) {
    gameOver("The line collapsed under the pressure.");
    return;
  }

  render(lighting);
  syncUi();
}

function tick(timestamp) {
  if (!tick.last) {
    tick.last = timestamp;
  }
  const dt = clamp((timestamp - tick.last) / 1000, 0, 0.033);
  tick.last = timestamp;
  update(dt);
  requestAnimationFrame(tick);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }
  if (event.key === "Escape") {
    if (state.mode === "playing") {
      backToMenu();
    } else if (state.mode === "gameover") {
      backToMenu();
    }
    return;
  }
  if (event.key === " " || event.key === "Enter") {
    if (state.mode === "menu") {
      startGame();
    } else if (state.mode === "gameover") {
      startGame();
    } else {
      state.fireHeld = true;
    }
    event.preventDefault();
    return;
  }
  if (event.key === "r" || event.key === "R") {
    if (state.mode === "playing") {
      const target = [...state.barricade].sort((a, b) => a.hp - b.hp)[0];
      if (target && state.scrap >= 14) {
        state.scrap -= 14;
        repairSegment(target, 48);
        syncUi();
      }
    }
    return;
  }
  if (event.key === "1") {
    weaponSystem.switchWeapon(0);
    syncUi();
  }
  if (event.key === "2") {
    weaponSystem.switchWeapon(1);
    syncUi();
  }
  if (event.key === "3") {
    weaponSystem.switchWeapon(2);
    syncUi();
  }
});

window.addEventListener("wheel", (event) => {
  if (state.mode !== "playing") {
    return;
  }
  if (event.deltaY > 0) {
    weaponSystem.nextWeapon();
  } else if (event.deltaY < 0) {
    weaponSystem.previousWeapon();
  }
  syncUi();
}, { passive: true });

window.addEventListener("keyup", (event) => {
  if (event.key === " " || event.key === "Enter") {
    state.fireHeld = false;
  }
});

canvas.addEventListener("pointermove", (event) => {
  state.lastPointer = toWorld(event.clientX, event.clientY);
});

canvas.addEventListener("pointerdown", (event) => {
  state.lastPointer = toWorld(event.clientX, event.clientY);
  state.fireHeld = true;
  canvas.setPointerCapture(event.pointerId);
  if (state.mode === "menu") {
    startGame();
  }
});

canvas.addEventListener("pointerup", () => {
  state.fireHeld = false;
});

canvas.addEventListener("pointercancel", () => {
  state.fireHeld = false;
});

startButton.addEventListener("click", startGame);
menuRestartButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
menuButton.addEventListener("click", backToMenu);

resizeCanvas();
resetRun();
setMode("menu");
requestAnimationFrame(tick);
