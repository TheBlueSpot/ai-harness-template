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
const laneLabels = ["Top", "Mid", "Bot"];
const campaignBeats = [
  "Opening clash: hold 2 lanes to earn tribute and accelerate your first age jump.",
  "Mid-war pivot: use the new roster to break one lane instead of flooding every front.",
  "Final siege: reach the future age, then stack lane pressure into one finishing collapse.",
];
const warActs = [
  {
    name: "Border Raid",
    playerBaseBonus: 0,
    enemyBaseBonus: 0,
    playerGrant: 0,
    enemyGrant: 0,
    playerRepair: 0,
    enemyMinEra: 0,
    beat: "Break the border wall, then use the spoils to reach Bronze before the enemy settles in.",
  },
  {
    name: "Citadel Push",
    playerBaseBonus: 24,
    enemyBaseBonus: 62,
    playerGrant: 118,
    enemyGrant: 126,
    playerRepair: 48,
    enemyMinEra: 1,
    beat: "Outer wall down. Keep your tech lead and crack the citadel before Iron cannons stall the run.",
  },
  {
    name: "Capital Siege",
    playerBaseBonus: 48,
    enemyBaseBonus: 108,
    playerGrant: 156,
    enemyGrant: 168,
    playerRepair: 62,
    enemyMinEra: 2,
    beat: "Final push. Preserve two lanes, hit Future fast, and finish the capital with stacked pressure.",
  },
];

const aiWaveFormations = [
  {
    name: "probe",
    minAct: 0,
    roles: ["frontline", "ranged", "frontline"],
    weights: { steady: 3, behind: 4, ahead: 1 },
  },
  {
    name: "counterline",
    minAct: 0,
    roles: ["counter", "ranged", "frontline"],
    weights: { steady: 3, behind: 3, ahead: 2 },
  },
  {
    name: "shieldwall",
    minAct: 1,
    roles: ["frontline", "frontline", "ranged", "counter"],
    weights: { steady: 3, behind: 4, ahead: 2 },
  },
  {
    name: "breaker",
    minAct: 1,
    roles: ["frontline", "ranged", "siege", "support"],
    weights: { steady: 2, behind: 4, ahead: 3 },
  },
  {
    name: "flank",
    minAct: 2,
    roles: ["counter", "ranged", "siege", "support"],
    weights: { steady: 2, behind: 2, ahead: 4 },
  },
];

const eras = [
  {
    name: "Stone",
    cost: 0,
    income: 12.8,
    tint: "#6f8c8c",
    enemyTint: "#8d5f3f",
    baseHp: 150,
    note: "Stone age favors cheap rushes, slingers, brute beasts.",
    units: [
      { key: "Q", name: "Clubber", role: "swarm", cost: 30, hp: 34, speed: 42, range: 18, damage: 8, cooldown: 0.74, color: "#8fd29a" },
      { key: "W", name: "Slinger", role: "ranged", cost: 42, hp: 24, speed: 30, range: 138, damage: 7, cooldown: 1.05, projectileSpeed: 240, color: "#a5daf7" },
      { key: "E", name: "Mammoth", role: "tank", cost: 74, hp: 86, speed: 22, range: 24, damage: 16, cooldown: 1.2, color: "#f0c776" },
    ],
  },
  {
    name: "Bronze",
    cost: 118,
    income: 15.2,
    tint: "#7798c9",
    enemyTint: "#a56b48",
    baseHp: 182,
    note: "Bronze age adds shield walls, bows, chariot counters.",
    units: [
      { key: "Q", name: "Spearman", role: "anti-cavalry", cost: 44, hp: 46, speed: 34, range: 22, damage: 10, cooldown: 0.72, color: "#b6dc9a" },
      { key: "W", name: "Archer", role: "ranged", cost: 54, hp: 28, speed: 28, range: 160, damage: 9, cooldown: 0.95, projectileSpeed: 290, color: "#c0ddff" },
      { key: "E", name: "Chariot", role: "cavalry", cost: 88, hp: 70, speed: 58, range: 26, damage: 18, cooldown: 0.84, color: "#ffd37a" },
    ],
  },
  {
    name: "Iron",
    cost: 186,
    income: 17.8,
    tint: "#9ba2b1",
    enemyTint: "#89535c",
    baseHp: 220,
    note: "Iron age leans on armored knights, muskets, siege cannons.",
    units: [
      { key: "Q", name: "Knight", role: "tank", cost: 60, hp: 74, speed: 40, range: 24, damage: 14, cooldown: 0.7, color: "#dde3f2" },
      { key: "W", name: "Musketeer", role: "ranged", cost: 72, hp: 34, speed: 26, range: 198, damage: 13, cooldown: 1.1, projectileSpeed: 340, color: "#9fd1ff" },
      { key: "E", name: "Cannon", role: "siege", cost: 112, hp: 58, speed: 18, range: 224, damage: 22, cooldown: 1.55, projectileSpeed: 250, splash: 24, color: "#ffba74" },
    ],
  },
  {
    name: "Future",
    cost: 258,
    income: 20.6,
    tint: "#65d8d3",
    enemyTint: "#ff6f66",
    baseHp: 265,
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
  actIndex: 0,
  selectedLane: 1,
  player: createSide("player"),
  enemy: createSide("enemy"),
  units: [],
  projectiles: [],
  particles: [],
  message: "",
  objective: campaignBeats[0],
  runTime: 0,
  lastTime: performance.now(),
  aiSpawnTimer: 1,
  aiTechTimer: 8,
  aiWaveTimer: 0,
  aiWaveLane: 1,
  aiPlan: [],
  aiRecentSlots: [],
  controlTimer: 0,
  storyTimer: 14,
  lastBeatIndex: 0,
  lanePulse: 0,
};

function createSide(side) {
  return {
    side,
    era: 0,
    gold: side === "player" ? 168 : 176,
    incomeBank: 0,
    tributeBank: 0,
    hp: eras[0].baseHp,
    maxHp: eras[0].baseHp,
    cooldowns: [0, 0, 0],
    flash: 0,
    storyIndex: 0,
  };
}

function getAct() {
  return warActs[game.actIndex];
}

function getBaseBonus(sideName, actIndex = game.actIndex) {
  const act = warActs[actIndex];
  return sideName === "player" ? act.playerBaseBonus : act.enemyBaseBonus;
}

function syncBaseStats(sideName, options = {}) {
  const side = game[sideName];
  const era = eras[side.era];
  side.maxHp = era.baseHp + getBaseBonus(sideName);
  if (options.fullHeal) {
    side.hp = side.maxHp;
  } else {
    const heal = options.heal ?? 0;
    side.hp = Math.min(side.maxHp, side.hp + heal);
  }
}

function updateObjective() {
  const act = getAct();
  const beatIndex = Math.min(campaignBeats.length - 1, Math.max(game.player.era, game.actIndex));
  const beat = game.player.era >= eras.length - 1 && game.actIndex < warActs.length - 1 ? act.beat : campaignBeats[beatIndex];
  game.objective = `Act ${game.actIndex + 1}/${warActs.length} ${act.name}. ${beat}`;
}

function resetGame() {
  game.state = "ready";
  game.actIndex = 0;
  game.selectedLane = 1;
  game.player = createSide("player");
  game.enemy = createSide("enemy");
  game.units = [];
  game.projectiles = [];
  game.particles = [];
  game.message = "Space or tap starts war.";
  game.objective = "";
  game.runTime = 0;
  game.aiSpawnTimer = 0.9;
  game.aiTechTimer = 8;
  game.aiWaveTimer = 1.8;
  game.aiWaveLane = 1;
  game.aiPlan = [];
  game.aiRecentSlots = [];
  game.controlTimer = 2.6;
  game.storyTimer = 12;
  game.lastBeatIndex = 0;
  game.lanePulse = 0;
  syncBaseStats("player", { fullHeal: true });
  syncBaseStats("enemy", { fullHeal: true });
  updateObjective();
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
  syncBaseStats(sideName, { heal: 28 });
  side.gold += sideName === "player" ? 42 : 32;
  side.storyIndex = Math.min(campaignBeats.length - 1, side.era);
  game.message = `${sideName === "player" ? "Player" : "Enemy"} reached ${nextEra.name} age.`;
  if (sideName === "player") {
    updateObjective();
  }
  burst(sideName === "player" ? battlefield.leftBase : battlefield.rightBase, lanes[1], sideName === "player" ? nextEra.tint : nextEra.enemyTint, 20);
  return true;
}

function update(dt) {
  if (game.state !== "playing") return;

  game.runTime += dt;
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

  updateControlIncome(dt);
  updateStoryBeat(dt);
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

function updateControlIncome(dt) {
  game.controlTimer -= dt;
  if (game.controlTimer > 0) return;
  game.controlTimer = 2.6;
  awardTribute(game.player);
  awardTribute(game.enemy);
}

function awardTribute(side) {
  const heldLanes = countControlledLanes(side.side);
  if (heldLanes <= 0) return;
  const bonus = heldLanes * 16 + side.era * 7 + game.actIndex * 5;
  side.gold += bonus;
  side.tributeBank += bonus;
  if (side.side === "player") {
    const laneWord = heldLanes === 1 ? "lane" : "lanes";
    game.message = `Front tribute +${bonus} gold for holding ${heldLanes} ${laneWord}.`;
  }
}

function countControlledLanes(sideName) {
  let held = 0;
  for (let lane = 0; lane < lanes.length; lane++) {
    const margin = lanePressure(sideName, lane) - lanePressure(sideName === "player" ? "enemy" : "player", lane);
    if (margin >= 22) held += 1;
  }
  return held;
}

function updateStoryBeat(dt) {
  game.storyTimer -= dt;
  const playerBeat = Math.min(campaignBeats.length - 1, Math.max(game.player.era, game.actIndex, Math.floor(game.runTime / 55)));
  if (playerBeat !== game.lastBeatIndex) {
    game.lastBeatIndex = playerBeat;
    updateObjective();
  }
  if (game.storyTimer <= 0 && game.player.era < eras.length - 1) {
    game.storyTimer = 12;
    const heldLanes = countControlledLanes("player");
    if (heldLanes === 0) {
      game.message = "You need 2 strong lanes to farm tribute and unlock the next age.";
    } else if (heldLanes === 1) {
      game.message = "One lane is yours. Take a second lane for bigger tribute bursts.";
    } else {
      game.message = "Two-lane control is live. Bank tribute, then spend into the next age.";
    }
  }
}

function advanceAct() {
  game.actIndex += 1;
  game.units = [];
  game.projectiles = [];
  game.particles = [];

  const act = getAct();
  const playerMinEra = Math.min(eras.length - 2, game.actIndex);
  game.player.era = Math.max(game.player.era, playerMinEra);
  game.enemy.era = Math.max(game.enemy.era, act.enemyMinEra);
  game.player.gold += act.playerGrant;
  game.enemy.gold += act.enemyGrant;
  syncBaseStats("player", { heal: act.playerRepair });
  syncBaseStats("enemy", { fullHeal: true });
  game.storyTimer = 9;
  game.aiSpawnTimer = 0.85;
  game.aiTechTimer = 5.4;
  game.aiWaveTimer = 1.4;
  game.aiPlan = [];
  updateObjective();
  game.message = `Act ${game.actIndex + 1} ${act.name}. ${act.beat}`;
  burst(battlefield.leftBase, lanes[1], eras[game.player.era].tint, 18);
  burst(battlefield.rightBase, lanes[1], eras[game.enemy.era].enemyTint, 22);
}

function updateAI(dt) {
  game.aiSpawnTimer -= dt;
  game.aiTechTimer -= dt;
  game.aiWaveTimer = Math.max(0, game.aiWaveTimer - dt);
  const director = getAiDirector();
  if (game.aiTechTimer <= 0) {
    const need = eras[Math.min(game.enemy.era + 1, eras.length - 1)];
    if (game.enemy.era < eras.length - 1 && game.enemy.gold >= need.cost + 28) {
      tryAdvanceEra("enemy");
    }
    game.aiTechTimer = 7 + Math.random() * 3.4;
  }

  if (game.aiSpawnTimer > 0) return;
  if (!game.aiPlan.length) {
    if (game.aiWaveTimer > 0) {
      game.aiSpawnTimer = 0.18;
      return;
    }
    buildAiWavePlan();
  }

  const order = game.aiPlan[0];
  const slotIndex = order.slotIndex;
  const laneIndex = order.laneIndex;
  const laneCrowd = countLaneUnits("enemy", laneIndex);
  if (laneCrowd >= director.maxLaneCrowd && lanePressure("enemy", laneIndex) > lanePressure("player", laneIndex) + director.crowdPressureLead) {
    game.aiPlan = [];
    game.aiWaveTimer = 0.8 + Math.random() * 0.5;
    game.aiSpawnTimer = 0.24;
    return;
  }

  const spawned = spawnUnit("enemy", laneIndex, slotIndex);
  if (spawned) {
    game.aiRecentSlots.push(slotIndex);
    if (game.aiRecentSlots.length > 6) game.aiRecentSlots.shift();
    game.aiPlan.shift();
  }
  game.aiSpawnTimer = getAiSpawnDelay(spawned, laneIndex, slotIndex);
  if (!game.aiPlan.length) {
    game.aiWaveTimer = director.waveReset + Math.random() * director.waveResetVariance;
  }
}

function chooseAiLane() {
  let bestLane = 1;
  let bestScore = -Infinity;
  for (let lane = 0; lane < lanes.length; lane++) {
    const pressure = lanePressure("player", lane) - lanePressure("enemy", lane);
    const nearBase = nearestThreat("player", lane, "enemy");
    const enemyCount = countLaneUnits("enemy", lane);
    const playerCount = countLaneUnits("player", lane);
    const score = pressure * 1.1 + nearBase * 0.018 + playerCount * 12 - enemyCount * 16 + Math.random() * 6;
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }
  return bestLane;
}

function chooseAiSlot(laneIndex, excluded = []) {
  const roster = eras[game.enemy.era].units;
  const dominant = dominantPlayerRole(laneIndex);
  let wanted = lanePressure("enemy", laneIndex) + 10 < lanePressure("player", laneIndex) ? "tank" : "ranged";
  if (dominant === "cavalry") wanted = "anti-cavalry";
  if (dominant === "tank") wanted = "ranged";
  if (dominant === "ranged") wanted = "cavalry";
  if (dominant === "siege") wanted = "tank";
  return chooseRoleIndex(roster, wanted, excluded, findAvailableSlot(roster, excluded, 0));
}

function buildAiWavePlan() {
  const laneIndex = chooseAiLane();
  const formation = chooseAiFormation(laneIndex);
  const plan = buildAiOrders(laneIndex, formation.roles);
  game.aiWaveLane = laneIndex;
  game.aiPlan = diversifyAiPlan(plan, eras[game.enemy.era].units.length);
}

function chooseAiFormation(laneIndex) {
  const deficit = lanePressure("enemy", laneIndex) + 18 < lanePressure("player", laneIndex);
  const surplus = lanePressure("enemy", laneIndex) > lanePressure("player", laneIndex) + 24;
  const phase = deficit ? "behind" : surplus ? "ahead" : "steady";
  const formations = aiWaveFormations.filter((formation) => formation.minAct <= game.actIndex);
  let totalWeight = 0;
  for (const formation of formations) {
    totalWeight += formation.weights[phase] ?? 1;
  }
  let roll = Math.random() * totalWeight;
  for (const formation of formations) {
    roll -= formation.weights[phase] ?? 1;
    if (roll <= 0) return formation;
  }
  return formations[0];
}

function buildAiOrders(primaryLane, roles) {
  const roster = eras[game.enemy.era].units;
  const excluded = [];
  const orders = [];
  const alternateLane = chooseHarassLane(primaryLane);
  roles.forEach((role, index) => {
    const laneIndex = alternateLane !== -1 && index === roles.length - 1 ? alternateLane : primaryLane;
    const fallback = chooseAiSlot(laneIndex, excluded);
    const slotIndex = chooseRoleIndex(roster, resolveAiWantedRole(role, laneIndex), excluded, fallback);
    excluded.push(slotIndex);
    orders.push({ slotIndex, laneIndex });
  });
  return orders;
}

function chooseHarassLane(primaryLane) {
  if (game.actIndex < 1) return -1;
  if (Math.random() > (game.actIndex === 1 ? 0.22 : 0.36)) return -1;
  const options = [];
  for (let lane = 0; lane < lanes.length; lane++) {
    if (lane === primaryLane) continue;
    const enemyPressure = lanePressure("enemy", lane);
    const playerPressure = lanePressure("player", lane);
    if (enemyPressure + 24 >= playerPressure) {
      options.push({ lane, score: playerPressure - enemyPressure + Math.random() * 10 });
    }
  }
  if (!options.length) return -1;
  options.sort((a, b) => b.score - a.score);
  return options[0].lane;
}

function resolveAiWantedRole(role, laneIndex) {
  const dominant = dominantPlayerRole(laneIndex);
  if (role === "counter") {
    if (dominant === "cavalry") return "anti-cavalry";
    if (dominant === "tank") return "ranged";
    if (dominant === "ranged") return "cavalry";
    if (dominant === "siege") return "tank";
    return "tank";
  }
  if (role === "frontline") {
    return lanePressure("enemy", laneIndex) + 8 < lanePressure("player", laneIndex) ? "tank" : "cavalry";
  }
  if (role === "support") {
    return game.enemy.era >= 2 ? "ranged" : "cavalry";
  }
  return role;
}

function diversifyAiPlan(plan, rosterLength) {
  const diversified = [];
  for (const order of plan) {
    let nextSlot = order.slotIndex;
    const previous = diversified[diversified.length - 1];
    const recent = game.aiRecentSlots.slice(-2);
    const repeatedRecent = recent.length === 2 && recent.every((recentSlot) => recentSlot === order.slotIndex);
    if ((previous && previous.slotIndex === order.slotIndex) || repeatedRecent) {
      if (rosterLength > 1) {
        nextSlot = findAvailableSlot([], diversified.map((item) => item.slotIndex).concat(recent), (order.slotIndex + 1) % rosterLength, rosterLength);
      }
    }
    diversified.push({ ...order, slotIndex: nextSlot });
  }
  return diversified;
}

function chooseRoleIndex(roster, wanted, excluded, fallback) {
  const direct = roster.findIndex((unit, index) => unit.role === wanted && !excluded.includes(index));
  if (direct !== -1) return direct;
  return findAvailableSlot(roster, excluded, fallback);
}

function findAvailableSlot(roster, excluded, fallback, explicitLength) {
  const length = explicitLength ?? roster.length;
  const recent = game.aiRecentSlots.slice(-2);
  for (let offset = 0; offset < length; offset++) {
    const index = (fallback + offset) % length;
    if (excluded.includes(index)) continue;
    if (recent.includes(index) && length > recent.length) continue;
    return index;
  }
  for (let offset = 0; offset < length; offset++) {
    const index = (fallback + offset) % length;
    if (!excluded.includes(index)) return index;
  }
  return Math.max(0, Math.min(length - 1, fallback));
}

function getAiSpawnDelay(spawned, laneIndex, slotIndex) {
  const director = getAiDirector();
  if (!spawned) return 0.28;
  const laneCrowd = countLaneUnits("enemy", laneIndex);
  const pressureLead = lanePressure("enemy", laneIndex) - lanePressure("player", laneIndex);
  const unit = eras[game.enemy.era].units[slotIndex];
  let delay = director.baseSpawn + Math.random() * director.baseSpawnVariance;
  if (game.runTime < director.openingGrace) delay += director.openingSlowdown;
  delay += Math.min(director.crowdDelayCap, laneCrowd * director.crowdDelayStep);
  if (pressureLead > 24) delay += Math.min(director.leadDelayCap, pressureLead * director.leadDelayFactor);
  if (unit.role === "tank" || unit.role === "siege") delay += director.heavyUnitDelay;
  if (!game.aiPlan.length) delay += director.endWaveDelay;
  return delay;
}

function getAiDirector() {
  if (game.actIndex === 0) {
    return {
      openingGrace: 26,
      openingSlowdown: 0.28,
      baseSpawn: 0.86,
      baseSpawnVariance: 0.24,
      crowdDelayStep: 0.13,
      crowdDelayCap: 0.72,
      crowdPressureLead: 28,
      leadDelayFactor: 0.0032,
      leadDelayCap: 0.44,
      heavyUnitDelay: 0.18,
      endWaveDelay: 0.46,
      waveReset: 1.55,
      waveResetVariance: 0.72,
      maxLaneCrowd: 5,
    };
  }
  if (game.actIndex === 1) {
    return {
      openingGrace: 18,
      openingSlowdown: 0.18,
      baseSpawn: 0.72,
      baseSpawnVariance: 0.22,
      crowdDelayStep: 0.1,
      crowdDelayCap: 0.58,
      crowdPressureLead: 34,
      leadDelayFactor: 0.0024,
      leadDelayCap: 0.34,
      heavyUnitDelay: 0.14,
      endWaveDelay: 0.36,
      waveReset: 1.18,
      waveResetVariance: 0.52,
      maxLaneCrowd: 6,
    };
  }
  return {
    openingGrace: 12,
    openingSlowdown: 0.12,
    baseSpawn: 0.62,
    baseSpawnVariance: 0.18,
    crowdDelayStep: 0.08,
    crowdDelayCap: 0.42,
    crowdPressureLead: 42,
    leadDelayFactor: 0.0016,
    leadDelayCap: 0.22,
    heavyUnitDelay: 0.1,
    endWaveDelay: 0.24,
    waveReset: 0.9,
    waveResetVariance: 0.38,
    maxLaneCrowd: 7,
  };
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
    if (game.actIndex < warActs.length - 1) {
      advanceAct();
    } else {
      game.state = "won";
      game.message = "Enemy capital collapsed.";
      syncOverlay();
    }
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
  const act = getAct();
  const laneName = laneLabels[game.selectedLane];
  summaryEl.textContent = `Act ${game.actIndex + 1}/${warActs.length} ${act.name} | Gold ${Math.floor(game.player.gold)} | Era ${game.player.era + 1} ${playerEra.name} | ${laneName} lane`;
  const pressureDelta = lanePressure("player", game.selectedLane) - lanePressure("enemy", game.selectedLane);
  const pressureText = pressureDelta > 20 ? "pressure yours" : pressureDelta < -20 ? "pressure enemy" : "pressure even";
  const heldLanes = countControlledLanes("player");
  resourcesEl.textContent = `Base ${Math.max(0, Math.ceil(game.player.hp))}/${game.player.maxHp} | Enemy ${Math.max(0, Math.ceil(game.enemy.hp))}/${game.enemy.maxHp} | ${pressureText} | Tribute ${game.player.tributeBank}`;
  eraInfoEl.textContent = `${playerEra.name} age live. ${playerEra.note} Enemy age: ${enemyEra.name}. Held lanes: ${heldLanes}/3. Current act: ${act.name}.`;
  helpEl.textContent = "Keys 1-3 pick a lane. Q/W/E spawn the current roster. F techs up. Hold lanes for tribute, then convert each fallen wall into a bigger war chest.";
  if (game.state === "playing") {
    helpEl.textContent = "Keys 1-3 pick a lane. Q/W/E spawn the current roster. F techs up. Enemy pushes now arrive in short waves, so use the reset window to tech or reinforce a weak lane.";
  }
  const nextEra = eras[game.player.era + 1];
  techTextEl.textContent = nextEra
    ? `Objective: ${game.objective} Next era: ${nextEra.name}. Cost ${nextEra.cost}. ${nextEra.note}`
    : `Objective: ${game.objective} Max era reached. Spend gold on final push and lane counters.`;
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
    button.textContent = `${i + 1} ${laneLabels[i]}`;
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
      ? "Enemy capital shattered after a three-act siege. Restart for another tech race."
      : game.state === "lost"
        ? "Your base fell first. Rebuild, counter lanes earlier, tech cleaner."
        : "Three-act lane-war siege. Spawn counters, hold lanes for tribute, cash in each broken wall, then time era jumps before the enemy snowballs.";
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
