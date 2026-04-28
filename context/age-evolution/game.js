const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const summaryEl = document.getElementById("summary");
const resourcesEl = document.getElementById("resources");
const eraInfoEl = document.getElementById("eraInfo");
const helpEl = document.getElementById("help");
const techTextEl = document.getElementById("techText");
const laneControlsEl = document.getElementById("laneControls");
const unitControlsEl = document.getElementById("unitControls");
const techControlsEl = document.getElementById("techControls");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayTextEl = document.getElementById("overlayText");
const overlayCtaEl = document.getElementById("overlayCta");

const view = { width: 1280, height: 720 };
const battlefield = { leftBase: 120, rightBase: 1160 };
const lanes = [200, 360, 520];

const eras = [
  {
    name: "Stone",
    cost: 0,
    income: 7,
    tint: "#6f8c8c",
    enemyTint: "#8d5f3f",
    baseHp: 100,
    note: "Stone age favors cheap rushes, slingers, brute beasts.",
    units: [
      { key: "Q", name: "Clubber", role: "swarm", cost: 30, hp: 34, speed: 42, range: 18, damage: 8, cooldown: 0.74, color: "#8fd29a" },
      { key: "W", name: "Slinger", role: "ranged", cost: 42, hp: 24, speed: 30, range: 138, damage: 7, cooldown: 1.05, projectileSpeed: 240, color: "#a5daf7" },
      { key: "E", name: "Mammoth", role: "tank", cost: 74, hp: 86, speed: 22, range: 24, damage: 16, cooldown: 1.2, color: "#f0c776" },
    ],
  },
  {
    name: "Bronze",
    cost: 170,
    income: 8.8,
    tint: "#7798c9",
    enemyTint: "#a56b48",
    baseHp: 120,
    note: "Bronze age adds shield walls, bows, chariot counters.",
    units: [
      { key: "Q", name: "Spearman", role: "anti-cavalry", cost: 44, hp: 46, speed: 34, range: 22, damage: 10, cooldown: 0.72, color: "#b6dc9a" },
      { key: "W", name: "Archer", role: "ranged", cost: 54, hp: 28, speed: 28, range: 160, damage: 9, cooldown: 0.95, projectileSpeed: 290, color: "#c0ddff" },
      { key: "E", name: "Chariot", role: "cavalry", cost: 88, hp: 70, speed: 58, range: 26, damage: 18, cooldown: 0.84, color: "#ffd37a" },
    ],
  },
  {
    name: "Iron",
    cost: 260,
    income: 10.4,
    tint: "#9ba2b1",
    enemyTint: "#89535c",
    baseHp: 145,
    note: "Iron age leans on armored knights, muskets, siege cannons.",
    units: [
      { key: "Q", name: "Knight", role: "tank", cost: 60, hp: 74, speed: 40, range: 24, damage: 14, cooldown: 0.7, color: "#dde3f2" },
      { key: "W", name: "Musketeer", role: "ranged", cost: 72, hp: 34, speed: 26, range: 198, damage: 13, cooldown: 1.1, projectileSpeed: 340, color: "#9fd1ff" },
      { key: "E", name: "Cannon", role: "siege", cost: 112, hp: 58, speed: 18, range: 224, damage: 22, cooldown: 1.55, projectileSpeed: 250, splash: 24, color: "#ffba74" },
    ],
  },
  {
    name: "Future",
    cost: 360,
    income: 12.6,
    tint: "#65d8d3",
    enemyTint: "#ff6f66",
    baseHp: 170,
    note: "Future age unlocks mechs, drones, titan push finishers.",
    units: [
      { key: "Q", name: "Mech", role: "tank", cost: 82, hp: 104, speed: 38, range: 28, damage: 19, cooldown: 0.62, color: "#98fff2" },
      { key: "W", name: "Drone", role: "ranged", cost: 92, hp: 42, speed: 52, range: 214, damage: 15, cooldown: 0.78, projectileSpeed: 380, color: "#c8e2ff" },
      { key: "E", name: "Titan", role: "siege", cost: 148, hp: 146, speed: 24, range: 38, damage: 34, cooldown: 1.0, color: "#fff087" },
    ],
  },
];

const game = {
  state: "ready",
  selectedLane: 1,
  player: createSide("player"),
  enemy: createSide("enemy"),
  units: [],
  projectiles: [],
  particles: [],
  message: "",
  lastTime: performance.now(),
  aiSpawnTimer: 1,
  aiTechTimer: 8,
  lanePulse: 0,
};

function createSide(side) {
  return {
    side,
    era: 0,
    gold: side === "player" ? 95 : 105,
    incomeBank: 0,
    hp: eras[0].baseHp,
    maxHp: eras[0].baseHp,
    cooldowns: [0, 0, 0],
    flash: 0,
  };
}

function resetGame() {
  game.state = "ready";
  game.selectedLane = 1;
  game.player = createSide("player");
  game.enemy = createSide("enemy");
  game.units = [];
  game.projectiles = [];
  game.particles = [];
  game.message = "Space or tap starts war.";
  game.aiSpawnTimer = 0.9;
  game.aiTechTimer = 8;
  game.lanePulse = 0;
  syncOverlay();
  refreshButtons();
  refreshHud();
}

function startGame() {
  if (game.state === "playing") return;
  resetGame();
  game.state = "playing";
  game.message = "War live. Counter lanes, tech smart.";
  syncOverlay();
}

function spawnUnit(sideName, laneIndex, slotIndex) {
  const side = game[sideName];
  const unitTemplate = eras[side.era].units[slotIndex];
  if (!unitTemplate) return false;
  if (side.gold < unitTemplate.cost || side.cooldowns[slotIndex] > 0) return false;

  side.gold -= unitTemplate.cost;
  side.cooldowns[slotIndex] = unitTemplate.role === "siege" ? 3.1 : unitTemplate.role === "tank" ? 2.1 : 1.25;

  const direction = sideName === "player" ? 1 : -1;
  const spawnX = sideName === "player" ? battlefield.leftBase + 30 : battlefield.rightBase - 30;
  const laneY = lanes[laneIndex];
  const rowOffset = (countLaneUnits(sideName, laneIndex) % 5 - 2) * 8;
  game.units.push({
    ...unitTemplate,
    side: sideName,
    lane: laneIndex,
    x: spawnX,
    y: laneY + rowOffset,
    hp: unitTemplate.hp,
    maxHp: unitTemplate.hp,
    direction,
    attackTimer: 0.1 + Math.random() * 0.25,
    flash: 0,
  });
  burst(spawnX, laneY, sideName === "player" ? eras[side.era].tint : eras[side.era].enemyTint, 8);
  return true;
}

function countLaneUnits(sideName, laneIndex) {
  let count = 0;
  for (const unit of game.units) {
    if (unit.side === sideName && unit.lane === laneIndex) count += 1;
  }
  return count;
}

function tryAdvanceEra(sideName) {
  const side = game[sideName];
  if (side.era >= eras.length - 1) return false;
  const nextEra = eras[side.era + 1];
  if (side.gold < nextEra.cost) return false;
  side.gold -= nextEra.cost;
  side.era += 1;
  side.maxHp = nextEra.baseHp;
  side.hp = Math.min(side.maxHp, side.hp + 18);
  game.message = `${sideName === "player" ? "Player" : "Enemy"} reached ${nextEra.name} age.`;
  burst(sideName === "player" ? battlefield.leftBase : battlefield.rightBase, lanes[1], sideName === "player" ? nextEra.tint : nextEra.enemyTint, 20);
  return true;
}

function update(dt) {
  if (game.state !== "playing") return;

  updateEconomy(game.player, dt);
  updateEconomy(game.enemy, dt);
  game.lanePulse += dt;
  game.player.flash = Math.max(0, game.player.flash - dt * 2);
  game.enemy.flash = Math.max(0, game.enemy.flash - dt * 2);

  for (const side of [game.player, game.enemy]) {
    for (let i = 0; i < side.cooldowns.length; i++) {
      side.cooldowns[i] = Math.max(0, side.cooldowns[i] - dt);
    }
  }

  updateAI(dt);
  updateUnits(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  resolveBaseEnds();
  refreshHud();
  refreshButtons();
}

function updateEconomy(side, dt) {
  const era = eras[side.era];
  side.incomeBank += era.income * dt;
  while (side.incomeBank >= 1) {
    side.gold += 1;
    side.incomeBank -= 1;
  }
}

function updateAI(dt) {
  game.aiSpawnTimer -= dt;
  game.aiTechTimer -= dt;
  if (game.aiTechTimer <= 0) {
    const need = eras[Math.min(game.enemy.era + 1, eras.length - 1)];
    if (game.enemy.era < eras.length - 1 && game.enemy.gold >= need.cost + 28) {
      tryAdvanceEra("enemy");
    }
    game.aiTechTimer = 7 + Math.random() * 3.4;
  }

  if (game.aiSpawnTimer > 0) return;
  const laneIndex = chooseAiLane();
  const slotIndex = chooseAiSlot(laneIndex);
  const spawned = spawnUnit("enemy", laneIndex, slotIndex);
  game.aiSpawnTimer = spawned ? 0.48 + Math.random() * 0.55 : 0.28;
}

function chooseAiLane() {
  let bestLane = 1;
  let bestScore = -Infinity;
  for (let lane = 0; lane < lanes.length; lane++) {
    const pressure = lanePressure("player", lane) - lanePressure("enemy", lane);
    const nearBase = nearestThreat("player", lane, "enemy");
    const score = pressure * 1.1 + nearBase * 0.018 + Math.random() * 8;
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }
  return bestLane;
}

function chooseAiSlot(laneIndex) {
  const roster = eras[game.enemy.era].units;
  const dominant = dominantPlayerRole(laneIndex);
  if (dominant === "cavalry") return findRoleIndex(roster, "anti-cavalry", 0);
  if (dominant === "tank") return findRoleIndex(roster, "ranged", 1);
  if (dominant === "ranged") return findRoleIndex(roster, "cavalry", 2);
  if (dominant === "siege") return findRoleIndex(roster, "tank", 0);
  return lanePressure("enemy", laneIndex) + 10 < lanePressure("player", laneIndex)
    ? findRoleIndex(roster, "tank", 0)
    : findRoleIndex(roster, "ranged", 1);
}

function dominantPlayerRole(laneIndex) {
  const scores = new Map();
  for (const unit of game.units) {
    if (unit.side !== "player" || unit.lane !== laneIndex) continue;
    scores.set(unit.role, (scores.get(unit.role) || 0) + unit.hp + unit.damage * 2);
  }
  let bestRole = "swarm";
  let bestScore = -1;
  for (const [role, score] of scores) {
    if (score > bestScore) {
      bestRole = role;
      bestScore = score;
    }
  }
  return bestRole;
}

function findRoleIndex(roster, wanted, fallback) {
  const index = roster.findIndex((unit) => unit.role === wanted);
  return index === -1 ? fallback : index;
}

function lanePressure(sideName, laneIndex) {
  let sum = 0;
  for (const unit of game.units) {
    if (unit.side !== sideName || unit.lane !== laneIndex) continue;
    sum += unit.hp + unit.damage * 1.8 + unit.range * 0.05;
  }
  return sum;
}

function nearestThreat(sideName, laneIndex, toward) {
  let value = 0;
  for (const unit of game.units) {
    if (unit.side !== sideName || unit.lane !== laneIndex) continue;
    const dist = toward === "enemy" ? battlefield.rightBase - unit.x : unit.x - battlefield.leftBase;
    value = Math.max(value, 800 - dist);
  }
  return value;
}

function updateUnits(dt) {
  for (let i = game.units.length - 1; i >= 0; i--) {
    const unit = game.units[i];
    unit.attackTimer -= dt;
    unit.flash = Math.max(0, unit.flash - dt * 3);
    const target = findTarget(unit);
    if (target) {
      const dist = Math.abs(target.x - unit.x);
      if (dist <= unit.range + target.r) {
        if (unit.attackTimer <= 0) {
          attack(unit, target);
          unit.attackTimer = unit.cooldown;
        }
      } else {
        unit.x += unit.direction * unit.speed * dt;
      }
    } else {
      unit.x += unit.direction * unit.speed * dt;
    }

    unit.y += Math.sin(game.lanePulse * 3 + i * 0.7) * 4 * dt;

    if (unit.hp <= 0) {
      burst(unit.x, unit.y, unit.side === "player" ? "#7df0af" : "#ff857a", 10);
      game.units.splice(i, 1);
    }
  }
}

function findTarget(unit) {
  let enemyTarget = null;
  let bestDist = Infinity;
  for (const other of game.units) {
    if (other.side === unit.side || other.lane !== unit.lane) continue;
    const dist = Math.abs(other.x - unit.x);
    if (dist < bestDist) {
      bestDist = dist;
      enemyTarget = other;
    }
  }
  if (enemyTarget) return { kind: "unit", x: enemyTarget.x, y: enemyTarget.y, r: 16, ref: enemyTarget };

  if (unit.side === "player") {
    return { kind: "base", x: battlefield.rightBase, y: lanes[unit.lane], r: 32, ref: game.enemy };
  }
  return { kind: "base", x: battlefield.leftBase, y: lanes[unit.lane], r: 32, ref: game.player };
}

function attack(unit, target) {
  if (unit.range > 60 && unit.projectileSpeed) {
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const mag = Math.hypot(dx, dy) || 1;
    game.projectiles.push({
      side: unit.side,
      x: unit.x + unit.direction * 14,
      y: unit.y,
      vx: dx / mag * unit.projectileSpeed,
      vy: dy / mag * unit.projectileSpeed,
      damage: unit.damage,
      splash: unit.splash || 0,
      lane: unit.lane,
      color: unit.color,
    });
  } else {
    dealDamage(target.ref, unit.damage);
    unit.flash = 1;
    burst(target.x, target.y, unit.color, 4);
  }
}

function dealDamage(target, damage) {
  target.hp -= damage;
  target.flash = 1;
}

function updateProjectiles(dt) {
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const shot = game.projectiles[i];
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    let hit = false;
    for (const unit of game.units) {
      if (unit.side === shot.side || unit.lane !== shot.lane) continue;
      if (Math.abs(unit.x - shot.x) < 16 && Math.abs(unit.y - shot.y) < 16) {
        hit = true;
        splashDamage(shot, unit);
        break;
      }
    }

    if (!hit) {
      const baseX = shot.side === "player" ? battlefield.rightBase : battlefield.leftBase;
      const baseY = lanes[shot.lane];
      if (Math.abs(shot.x - baseX) < 30 && Math.abs(shot.y - baseY) < 44) {
        hit = true;
        const base = shot.side === "player" ? game.enemy : game.player;
        dealDamage(base, shot.damage);
      }
    }

    if (hit || shot.x < 0 || shot.x > view.width || shot.y < 0 || shot.y > view.height) {
      burst(shot.x, shot.y, shot.color, shot.splash ? 10 : 5);
      game.projectiles.splice(i, 1);
    }
  }
}

function splashDamage(shot, firstTarget) {
  dealDamage(firstTarget, shot.damage);
  if (!shot.splash) return;
  for (const unit of game.units) {
    if (unit.side === shot.side || unit.lane !== shot.lane) continue;
    const dist = Math.hypot(unit.x - shot.x, unit.y - shot.y);
    if (dist <= shot.splash) {
      dealDamage(unit, Math.max(4, shot.damage * 0.5));
    }
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}

function resolveBaseEnds() {
  if (game.enemy.hp <= 0) {
    game.state = "won";
    game.message = "Enemy base collapsed.";
    syncOverlay();
  } else if (game.player.hp <= 0) {
    game.state = "lost";
    game.message = "Base ruined.";
    syncOverlay();
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 90;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.45,
      color,
    });
  }
}

function render() {
  resizeCanvas();
  ctx.save();
  ctx.scale(canvas.width / view.width, canvas.height / view.height);
  drawBackdrop();
  drawLanes();
  drawBases();
  drawUnits();
  drawProjectiles();
  drawParticles();
  drawLaneMarkers();
  ctx.restore();
}

function drawBackdrop() {
  const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, "#18273f");
  gradient.addColorStop(1, "#070b11");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);

  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.02)" : "rgba(247,191,88,0.025)";
    ctx.fillRect(i * 52, 0, 26, view.height);
  }
}

function drawLanes() {
  for (let lane = 0; lane < lanes.length; lane++) {
    const y = lanes[lane];
    ctx.fillStyle = lane === game.selectedLane ? "rgba(247,191,88,0.12)" : "rgba(255,255,255,0.03)";
    ctx.fillRect(90, y - 54, 1100, 108);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, y - 54);
    ctx.lineTo(1190, y - 54);
    ctx.moveTo(90, y + 54);
    ctx.lineTo(1190, y + 54);
    ctx.stroke();
  }
}

function drawBases() {
  drawBase(game.player, battlefield.leftBase, eras[game.player.era].tint, true);
  drawBase(game.enemy, battlefield.rightBase, eras[game.enemy.era].enemyTint, false);
}

function drawBase(side, x, color, left) {
  const hpRatio = Math.max(0, side.hp / side.maxHp);
  const stage = side.era;
  const width = 68 + stage * 18;
  const height = 100 + stage * 18;
  const baseY = lanes[1];
  ctx.save();
  ctx.translate(x, baseY);
  if (!left) ctx.scale(-1, 1);
  ctx.fillStyle = side.flash > 0 ? "#ffffff" : "rgba(0,0,0,0.26)";
  ctx.fillRect(-width / 2 + 10, -height / 2 + 10, width, height);
  ctx.fillStyle = side.flash > 0 ? "#ffffff" : color;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(-width / 2 + 8, -height / 2 + 8, width - 16, 12);
  for (let i = 0; i <= stage; i++) {
    ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.08)";
    ctx.fillRect(-width / 2 + 10 + i * 18, -height / 2 - 24, 12, 24 + i * 5);
  }
  ctx.fillStyle = "#071019";
  ctx.fillRect(-width / 2 + 12, height / 2 - 34, 28, 34);
  ctx.restore();

  ctx.fillStyle = "rgba(6,12,18,0.85)";
  ctx.fillRect(x - 60, baseY - height / 2 - 20, 120, 10);
  ctx.fillStyle = hpRatio > 0.35 ? "#7df0af" : "#ff857a";
  ctx.fillRect(x - 60, baseY - height / 2 - 20, 120 * hpRatio, 10);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.strokeRect(x - 59.5, baseY - height / 2 - 19.5, 119, 9);
}

function drawUnits() {
  for (const unit of game.units) {
    ctx.save();
    ctx.translate(unit.x, unit.y);
    const fill = unit.side === "player" ? unit.color : tintEnemy(unit.color);
    ctx.fillStyle = unit.flash > 0 ? "#ffffff" : fill;
    if (unit.role === "ranged") {
      ctx.beginPath();
      ctx.moveTo(unit.direction * 14, 0);
      ctx.lineTo(-unit.direction * 10, -10);
      ctx.lineTo(-unit.direction * 6, 0);
      ctx.lineTo(-unit.direction * 10, 10);
      ctx.closePath();
      ctx.fill();
    } else if (unit.role === "cavalry") {
      ctx.fillRect(-12, -10, 28, 20);
      ctx.fillRect(8, -14, 8, 28);
    } else if (unit.role === "siege") {
      ctx.fillRect(-16, -12, 32, 24);
      ctx.fillRect(unit.direction * 16, -4, 14, 8);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, unit.role === "tank" ? 16 : 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(5,8,12,0.5)";
    ctx.fillRect(-18, -24, 36, 4);
    ctx.fillStyle = unit.hp / unit.maxHp > 0.35 ? "#7df0af" : "#ff857a";
    ctx.fillRect(-18, -24, 36 * Math.max(0, unit.hp / unit.maxHp), 4);
    ctx.restore();
  }
}

function tintEnemy(color) {
  return color === "#98fff2" ? "#ff8680" : color === "#fff087" ? "#ffbb84" : color === "#c8e2ff" ? "#ffc3c0" : color;
}

function drawProjectiles() {
  for (const shot of game.projectiles) {
    ctx.fillStyle = shot.side === "player" ? shot.color : "#ff9d8f";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.splash ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.6);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawLaneMarkers() {
  ctx.fillStyle = "#eff4ff";
  ctx.font = "16px Trebuchet MS";
  for (let i = 0; i < lanes.length; i++) {
    ctx.fillText(`Lane ${i + 1}`, 98, lanes[i] - 64);
  }
}

function refreshHud() {
  const playerEra = eras[game.player.era];
  const enemyEra = eras[game.enemy.era];
  const laneName = ["Top", "Mid", "Bot"][game.selectedLane];
  summaryEl.textContent = `Gold ${Math.floor(game.player.gold)} | Era ${game.player.era + 1} ${playerEra.name} | ${laneName} lane`;
  const pressureDelta = lanePressure("player", game.selectedLane) - lanePressure("enemy", game.selectedLane);
  const pressureText = pressureDelta > 20 ? "pressure yours" : pressureDelta < -20 ? "pressure enemy" : "pressure even";
  resourcesEl.textContent = `Base ${Math.max(0, Math.ceil(game.player.hp))}/${game.player.maxHp} | Enemy ${Math.max(0, Math.ceil(game.enemy.hp))}/${game.enemy.maxHp} | ${pressureText}`;
  eraInfoEl.textContent = `${playerEra.name} age live. ${playerEra.note} Enemy age: ${enemyEra.name}.`;
  helpEl.textContent = "1-3 lane. Q/W/E spawn roster. F tech up. Click panels works too.";
  const nextEra = eras[game.player.era + 1];
  techTextEl.textContent = nextEra
    ? `Next era: ${nextEra.name}. Cost ${nextEra.cost}. ${nextEra.note}`
    : "Max era reached. Spend gold on final push and lane counters.";
}

function refreshButtons() {
  buildLaneButtons();
  buildUnitButtons();
  buildTechButtons();
}

function buildLaneButtons() {
  laneControlsEl.innerHTML = "";
  for (let i = 0; i < lanes.length; i++) {
    const button = document.createElement("button");
    button.textContent = `${i + 1} ${["Top", "Mid", "Bot"][i]}`;
    if (i === game.selectedLane) button.classList.add("active");
    button.addEventListener("click", () => {
      game.selectedLane = i;
      refreshButtons();
      refreshHud();
    });
    laneControlsEl.appendChild(button);
  }
}

function buildUnitButtons() {
  unitControlsEl.innerHTML = "";
  const roster = eras[game.player.era].units;
  roster.forEach((unit, index) => {
    const button = document.createElement("button");
    const ready = game.player.gold >= unit.cost && game.player.cooldowns[index] <= 0 && game.state === "playing";
    button.textContent = `${unit.key} ${unit.name} ${unit.cost}`;
    if (ready) button.classList.add("active");
    button.disabled = game.state !== "playing";
    button.addEventListener("click", () => {
      spawnUnit("player", game.selectedLane, index);
      refreshButtons();
      refreshHud();
    });
    unitControlsEl.appendChild(button);
  });
}

function buildTechButtons() {
  techControlsEl.innerHTML = "";
  const button = document.createElement("button");
  const nextEra = eras[game.player.era + 1];
  button.textContent = nextEra ? `F Advance ${nextEra.name}` : "Max Era";
  button.disabled = !nextEra || game.state !== "playing";
  if (nextEra && game.player.gold >= nextEra.cost) button.classList.add("active");
  button.addEventListener("click", () => {
    tryAdvanceEra("player");
    refreshButtons();
    refreshHud();
  });
  techControlsEl.appendChild(button);
}

function syncOverlay() {
  const visible = game.state === "ready" || game.state === "won" || game.state === "lost";
  overlayEl.classList.toggle("hidden", !visible);
  overlayTitleEl.textContent = game.state === "won" ? "Victory" : game.state === "lost" ? "Defeat" : "Age Evolution";
  overlayTextEl.textContent =
    game.state === "won"
      ? "Enemy fortress shattered. Restart for new tech race."
      : game.state === "lost"
        ? "Your base fell first. Rebuild, counter lanes earlier, tech cleaner."
        : "Lane-war siege. Spawn counters, time era jumps, crack enemy fortress before theirs outscales yours.";
  overlayCtaEl.textContent = game.state === "ready" ? "Press Space, Enter, or tap to begin." : "Press Space, Enter, or tap to restart.";
}

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function frame(now) {
  const dt = Math.min(0.033, (now - game.lastTime) / 1000 || 0);
  game.lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "Space" || event.code === "Enter") {
    if (game.state === "playing") return;
    startGame();
    return;
  }

  if (game.state !== "playing") return;

  if (event.code === "Digit1") game.selectedLane = 0;
  if (event.code === "Digit2") game.selectedLane = 1;
  if (event.code === "Digit3") game.selectedLane = 2;
  if (event.code === "KeyQ") spawnUnit("player", game.selectedLane, 0);
  if (event.code === "KeyW") spawnUnit("player", game.selectedLane, 1);
  if (event.code === "KeyE") spawnUnit("player", game.selectedLane, 2);
  if (event.code === "KeyF") tryAdvanceEra("player");
  refreshButtons();
  refreshHud();
});

window.addEventListener("pointerdown", (event) => {
  if (game.state !== "playing") {
    startGame();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const y = (event.clientY - rect.top) * (view.height / rect.height);
  let nearestLane = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < lanes.length; i++) {
    const dist = Math.abs(y - lanes[i]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestLane = i;
    }
  }
  if (nearestDist < 70) {
    game.selectedLane = nearestLane;
    refreshButtons();
    refreshHud();
  }
});

window.addEventListener("resize", resizeCanvas);

resetGame();
requestAnimationFrame(frame);
