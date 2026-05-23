const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  ammo: document.getElementById("ammo"),
  day: document.getElementById("day"),
  food: document.getElementById("food"),
  goal: document.getElementById("goal"),
  health: document.getElementById("health"),
  huntBtn: document.getElementById("hunt-btn"),
  log: document.getElementById("log"),
  miles: document.getElementById("miles"),
  morale: document.getElementById("morale"),
  pace: document.getElementById("pace"),
  paceBtn: document.getElementById("pace-btn"),
  rations: document.getElementById("rations"),
  rationsBtn: document.getElementById("rations-btn"),
  actionHint: document.getElementById("action-hint"),
  restartBtn: document.getElementById("restart-btn"),
  restBtn: document.getElementById("rest-btn"),
  river: document.getElementById("river"),
  stageBanner: document.getElementById("stage-banner"),
  travelBtn: document.getElementById("travel-btn"),
  weather: document.getElementById("weather"),
};

const paceOrder = ["steady", "brisk", "push"];
const rationOrder = ["bare", "filling", "hearty"];
const paceData = {
  steady: { label: "Steady", miles: 34, wear: 0 },
  brisk: { label: "Brisk", miles: 45, wear: 1 },
  push: { label: "Push", miles: 58, wear: 2 },
};
const rationData = {
  bare: { food: 8, health: -0.08, morale: -0.12, label: "Bare" },
  filling: { food: 12, health: 0.03, morale: 0.02, label: "Filling" },
  hearty: { food: 17, health: 0.12, morale: 0.14, label: "Hearty" },
};
const weatherTable = [
  { label: "Clear", miles: 1.08, tint: "#f3d9a3" },
  { label: "Dry Wind", miles: 0.96, tint: "#d7c095" },
  { label: "Cold Rain", miles: 0.86, tint: "#92afc8" },
  { label: "Mud", miles: 0.74, tint: "#8b6f58" },
];
const riverMilestones = [180, 405, 650, 860];
const trailLength = 960;

let state;
let lastFrame = performance.now();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chooseWeather() {
  return weatherTable[Math.floor(Math.random() * weatherTable.length)];
}

function initialState() {
  return {
    day: 1,
    food: 128,
    ammo: 10,
    miles: 0,
    morale: 5,
    health: 5,
    oxen: 5,
    pace: "steady",
    rations: "filling",
    weather: chooseWeather(),
    mode: "travel",
    nextRiverIndex: 0,
    log: [
      "Valley is 960 miles east. Travel first, but watch the food burn each day.",
      "The wagon crew wants simple orders: enough food, fast restarts, and readable danger.",
    ],
    banner: "Reach the valley. Rivers will interrupt the trail with a timing test.",
    bannerUntil: performance.now() + 4200,
    hunt: null,
    crossing: null,
  };
}

function pushLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 8);
}

function setBanner(message, duration = 2400) {
  state.banner = message;
  state.bannerUntil = performance.now() + duration;
}

function getActionHint() {
  if (state.mode === "crossing") {
    return "River live. Stop the marker in the bright band with click or Space.";
  }
  if (state.mode === "hunt") {
    return "Hunt live. Click deer before the clock or ammo runs out.";
  }
  if (state.mode === "win") {
    return "Valley reached. Restart for a clean rerun.";
  }
  if (state.mode === "lose") {
    return "The wagon failed. Restart and tighten the supply line.";
  }
  return "Travel pushes miles. Hunt refills food. Rest buys back health and morale.";
}

function updateHud() {
  ui.day.textContent = String(state.day);
  ui.miles.textContent = `${Math.floor(state.miles)} / ${trailLength}`;
  ui.food.textContent = `${Math.max(0, Math.floor(state.food))} lb`;
  ui.ammo.textContent = `${state.ammo} shot`;
  ui.health.textContent = `${state.health.toFixed(1)} / 5`;
  ui.morale.textContent = `${state.morale.toFixed(1)} / 5`;
  ui.weather.textContent = state.weather.label;
  ui.pace.textContent = paceData[state.pace].label;
  ui.rations.textContent = rationData[state.rations].label;
  ui.actionHint.textContent = getActionHint();
  ui.goal.textContent =
    state.mode === "crossing"
      ? "River live"
      : state.mode === "hunt"
        ? "Hunt live"
        : `Need ${Math.max(0, Math.ceil(trailLength - state.miles))} miles`;

  const nextRiver = riverMilestones[state.nextRiverIndex];
  ui.river.textContent = nextRiver ? `${Math.max(0, Math.ceil(nextRiver - state.miles))} miles` : "No more";

  ui.stageBanner.textContent = state.banner ?? "";
  const visible = state.banner && performance.now() < state.bannerUntil;
  ui.stageBanner.classList.toggle("visible", Boolean(visible));

  ui.log.replaceChildren(
    ...state.log.map((entry) => {
      const li = document.createElement("li");
      li.textContent = entry;
      return li;
    }),
  );

  const actionLocked = state.mode === "hunt" || state.mode === "crossing" || state.mode === "win" || state.mode === "lose";
  ui.travelBtn.disabled = actionLocked;
  ui.huntBtn.disabled = actionLocked || state.ammo <= 0;
  ui.restBtn.disabled = actionLocked;
  ui.paceBtn.disabled = actionLocked;
  ui.rationsBtn.disabled = actionLocked;
}

function cyclePace() {
  const current = paceOrder.indexOf(state.pace);
  state.pace = paceOrder[(current + 1) % paceOrder.length];
  pushLog(`Pace set to ${paceData[state.pace].label}.`);
  updateHud();
}

function cycleRations() {
  const current = rationOrder.indexOf(state.rations);
  state.rations = rationOrder[(current + 1) % rationOrder.length];
  pushLog(`Rations set to ${rationData[state.rations].label}.`);
  updateHud();
}

function applyDailySupplies(multiplier = 1) {
  const ration = rationData[state.rations];
  state.food -= ration.food * multiplier;
  state.health = clamp(state.health + ration.health * multiplier, 0, 5);
  state.morale = clamp(state.morale + ration.morale * multiplier, 0, 5);

  if (state.food < 0) {
    const shortage = Math.abs(state.food);
    state.food = 0;
    state.health = clamp(state.health - 0.35 - shortage * 0.01, 0, 5);
    state.morale = clamp(state.morale - 0.45, 0, 5);
    pushLog("Food bins ran empty. The crew is fading.");
  }
}

function maybeRandomEvent() {
  const roll = Math.random();
  if (roll < 0.12) {
    state.food += 10;
    pushLog("Wild onions and berries padded the food bins.");
    return;
  }
  if (roll < 0.24) {
    state.morale = clamp(state.morale + 0.35, 0, 5);
    pushLog("A clean sunset steadied the crew.");
    return;
  }
  if (roll < 0.34) {
    state.oxen = clamp(state.oxen - 0.4, 0, 5);
    pushLog("A wheel rut shook the wagon. Oxen lost some pull.");
  }
}

function advanceTrail() {
  if (state.mode !== "travel") {
    return;
  }

  state.day += 1;
  applyDailySupplies(1);
  state.weather = chooseWeather();

  const pace = paceData[state.pace];
  const miles = pace.miles * state.weather.miles * (0.88 + state.oxen * 0.035);
  state.miles = clamp(state.miles + miles, 0, trailLength);
  state.oxen = clamp(state.oxen - 0.06 * pace.wear, 0, 5);
  maybeRandomEvent();

  pushLog(`${pace.label} travel covered ${Math.round(miles)} miles through ${state.weather.label.toLowerCase()}.`);

  const nextRiver = riverMilestones[state.nextRiverIndex];
  if (nextRiver && state.miles >= nextRiver) {
    startCrossing();
    return;
  }

  if (state.miles >= trailLength) {
    state.mode = "win";
    setBanner("Valley reached. The wagon made it across the whole trail.", 7000);
    pushLog("You reached the valley with a living crew.");
  } else {
    checkLoss();
  }

  updateHud();
}

function restDay() {
  if (state.mode !== "travel") {
    return;
  }

  state.day += 1;
  applyDailySupplies(0.8);
  state.health = clamp(state.health + 0.6, 0, 5);
  state.morale = clamp(state.morale + 0.45, 0, 5);
  state.weather = chooseWeather();
  pushLog("The crew rested, patched canvas, and slowed the panic.");
  setBanner("Rest recovered health and morale, but the food burn never stops.");
  checkLoss();
  updateHud();
}

function startHunt() {
  if (state.mode !== "travel" || state.ammo <= 0) {
    return;
  }

  state.mode = "hunt";
  state.hunt = {
    animals: Array.from({ length: 5 }, (_, index) => ({
      alive: true,
      lane: index % 3,
      speed: 100 + Math.random() * 65,
      value: 14 + Math.floor(Math.random() * 15),
      x: 1020 + index * 120,
      y: 180 + (index % 3) * 90 + Math.random() * 12,
    })),
    foodWon: 0,
    misses: 0,
    timeLeft: 8.5,
  };
  setBanner("Hunt live: click deer to trade ammo for food.", 5000);
  pushLog("Hunt started. Every shot matters.");
  updateHud();
}

function finishHunt() {
  const hunt = state.hunt;
  if (!hunt) {
    return;
  }

  state.food += hunt.foodWon;
  state.mode = "travel";
  state.hunt = null;
  state.day += 1;
  applyDailySupplies(0.65);
  state.weather = chooseWeather();

  if (hunt.foodWon > 0) {
    pushLog(`Hunt ended with ${hunt.foodWon} lb of food.`);
  } else {
    pushLog("Hunt ended empty-handed. The trail keeps its pressure.");
  }
  if (hunt.misses >= 3) {
    state.morale = clamp(state.morale - 0.25, 0, 5);
    pushLog("Too many missed shots shook the crew.");
  }

  checkLoss();
  updateHud();
}

function startCrossing() {
  state.mode = "crossing";
  state.crossing = {
    marker: 0.08 + Math.random() * 0.2,
    markerVelocity: 0.82 + Math.random() * 0.55,
    resolved: false,
    safeCenter: 0.52 + (Math.random() - 0.5) * 0.14,
    safeWidth: state.weather.label === "Mud" ? 0.13 : 0.18,
  };
  setBanner("River live: click or press Space when the marker is inside the bright band.", 7000);
  pushLog("River crossing ahead. Timing now decides what survives.");
  updateHud();
}

function resolveCrossing() {
  const crossing = state.crossing;
  if (!crossing || crossing.resolved) {
    return;
  }

  crossing.resolved = true;
  const distance = Math.abs(crossing.marker - crossing.safeCenter);
  const success = distance <= crossing.safeWidth * 0.5;
  if (success) {
    state.food += 8;
    state.morale = clamp(state.morale + 0.4, 0, 5);
    pushLog("Clean crossing. The wagon held, and morale jumped.");
    setBanner("River cleared. Travel reopened with supplies intact.");
  } else {
    const loss = 12 + Math.round(distance * 50);
    state.food = Math.max(0, state.food - loss);
    state.health = clamp(state.health - 0.8, 0, 5);
    state.morale = clamp(state.morale - 0.65, 0, 5);
    state.ammo = Math.max(0, state.ammo - 1);
    pushLog(`Bad crossing. Water took ${loss} food and one shot.`);
    setBanner("Crossing failed. The wagon survived, but the trail got meaner.");
  }

  state.nextRiverIndex += 1;
  state.mode = state.miles >= trailLength ? "win" : "travel";
  state.crossing = null;

  if (state.miles >= trailLength) {
    state.mode = "win";
    pushLog("That last crossing opened the final valley.");
  } else {
    checkLoss();
  }

  updateHud();
}

function checkLoss() {
  if (state.health <= 0 || state.morale <= 0 || state.oxen <= 0) {
    state.mode = "lose";
    setBanner("Run lost. Restart and try a tighter supply line.", 7000);
    pushLog("The wagon broke before the valley.");
  }
}

function handleCanvasClick(event) {
  if (state.mode === "crossing") {
    resolveCrossing();
    return;
  }
  if (state.mode !== "hunt" || !state.hunt || state.ammo <= 0) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  state.ammo -= 1;
  let hit = false;
  for (const animal of state.hunt.animals) {
    if (!animal.alive) {
      continue;
    }
    if (x >= animal.x - 34 && x <= animal.x + 34 && y >= animal.y - 20 && y <= animal.y + 20) {
      animal.alive = false;
      hit = true;
      state.hunt.foodWon += animal.value;
      pushLog(`Hunt hit for ${animal.value} food.`);
      break;
    }
  }

  if (!hit) {
    state.hunt.misses += 1;
    pushLog("Shot missed. Ammo is thinning.");
  }

  if (state.ammo <= 0 || state.hunt.animals.every((animal) => !animal.alive)) {
    finishHunt();
  } else {
    updateHud();
  }
}

function handleKey(event) {
  if (event.code === "Space" && state.mode === "crossing") {
    event.preventDefault();
    resolveCrossing();
  }
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, "#40251b");
  gradient.addColorStop(1, state.weather.tint);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, 270);
}

function drawGround() {
  ctx.fillStyle = "#5f4a2f";
  ctx.fillRect(0, 270, canvas.width, 270);

  ctx.fillStyle = "#886640";
  for (let index = 0; index < 6; index += 1) {
    ctx.beginPath();
    ctx.ellipse(160 * index + 80, 320 + (index % 2) * 30, 140, 48, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#b18b58";
  ctx.fillRect(0, 394, canvas.width, 42);
  ctx.strokeStyle = "#714d31";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 404);
  ctx.lineTo(canvas.width, 404);
  ctx.moveTo(0, 426);
  ctx.lineTo(canvas.width, 426);
  ctx.stroke();
}

function drawTrailProgress() {
  const progress = clamp(state.miles / trailLength, 0, 1);
  const wagonX = 120 + progress * 720;
  const wagonY = 364;

  ctx.fillStyle = "#2d2018";
  ctx.fillRect(78, 320, 780, 6);
  ctx.fillStyle = "#f0c27a";
  ctx.fillRect(78, 320, 780 * progress, 6);

  ctx.fillStyle = "#2b1d14";
  ctx.fillRect(wagonX - 26, wagonY - 18, 48, 22);
  ctx.fillStyle = "#8c6137";
  ctx.fillRect(wagonX - 8, wagonY - 34, 38, 20);
  ctx.strokeStyle = "#ebc98f";
  ctx.lineWidth = 2;
  ctx.strokeRect(wagonX - 8, wagonY - 34, 38, 20);

  ctx.fillStyle = "#1b110d";
  ctx.beginPath();
  ctx.arc(wagonX - 12, wagonY + 8, 12, 0, Math.PI * 2);
  ctx.arc(wagonX + 18, wagonY + 8, 12, 0, Math.PI * 2);
  ctx.fill();

  for (let index = state.nextRiverIndex; index < riverMilestones.length; index += 1) {
    const x = 78 + (riverMilestones[index] / trailLength) * 780;
    ctx.strokeStyle = index === state.nextRiverIndex ? "#8fd8ff" : "rgba(143, 216, 255, 0.4)";
    ctx.lineWidth = index === state.nextRiverIndex ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(x, 330);
    ctx.lineTo(x, 450);
    ctx.stroke();
  }
}

function drawStatusBar() {
  ctx.fillStyle = "rgba(21, 14, 11, 0.66)";
  ctx.fillRect(22, 20, 420, 78);
  ctx.strokeStyle = "rgba(255, 220, 170, 0.15)";
  ctx.strokeRect(22, 20, 420, 78);
  ctx.fillStyle = "#f7ead7";
  ctx.font = "700 28px Georgia";
  ctx.fillText(`Day ${state.day}`, 38, 54);
  ctx.font = "18px Georgia";
  ctx.fillStyle = "#d8b98f";
  const hint =
    state.mode === "crossing"
      ? "Click or press Space to stop in the safe band."
      : state.mode === "hunt"
        ? "Click deer to cash ammo into food."
        : "Simple rule: keep food positive and river hits clean.";
  ctx.fillText(hint, 38, 82);
}

function drawHunt() {
  const hunt = state.hunt;
  if (!hunt) {
    return;
  }

  ctx.fillStyle = "rgba(16, 11, 8, 0.68)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#6d8b52";
  ctx.fillRect(0, 120, canvas.width, 260);

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  for (let lane = 0; lane < 3; lane += 1) {
    const y = 190 + lane * 90;
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(canvas.width - 60, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#f7ead7";
  ctx.font = "700 34px Georgia";
  ctx.fillText("Hunting stop", 58, 74);
  ctx.font = "18px Georgia";
  ctx.fillStyle = "#d6e3c6";
  ctx.fillText(`Time ${hunt.timeLeft.toFixed(1)}s  |  Food won ${hunt.foodWon}  |  Ammo ${state.ammo}`, 58, 104);

  for (const animal of hunt.animals) {
    if (!animal.alive) {
      continue;
    }
    ctx.fillStyle = "#3f2618";
    ctx.fillRect(animal.x - 34, animal.y - 18, 52, 26);
    ctx.fillRect(animal.x + 6, animal.y - 12, 18, 12);
    ctx.fillStyle = "#f0c27a";
    ctx.fillRect(animal.x + 18, animal.y - 18, 12, 4);
  }
}

function drawCrossing() {
  const crossing = state.crossing;
  if (!crossing) {
    return;
  }

  ctx.fillStyle = "rgba(8, 17, 30, 0.62)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const meterX = 120;
  const meterY = 250;
  const meterWidth = 720;
  const meterHeight = 26;

  ctx.fillStyle = "#dbeaf3";
  ctx.font = "700 36px Georgia";
  ctx.fillText("River crossing", 120, 172);
  ctx.font = "18px Georgia";
  ctx.fillStyle = "#b9d6e9";
  ctx.fillText("Stop the marker inside the bright band to keep supplies dry.", 120, 202);

  ctx.fillStyle = "#183852";
  ctx.fillRect(meterX, meterY, meterWidth, meterHeight);
  ctx.fillStyle = "#8ed56b";
  const safeLeft = meterX + (crossing.safeCenter - crossing.safeWidth * 0.5) * meterWidth;
  ctx.fillRect(safeLeft, meterY, crossing.safeWidth * meterWidth, meterHeight);
  ctx.fillStyle = "#f7ead7";
  ctx.fillRect(meterX + crossing.marker * meterWidth - 5, meterY - 14, 10, meterHeight + 28);

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);
}

function drawEndState() {
  if (state.mode !== "win" && state.mode !== "lose") {
    return;
  }

  ctx.fillStyle = "rgba(11, 8, 7, 0.62)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = state.mode === "win" ? "#9de58f" : "#ff9d8d";
  ctx.font = "700 48px Georgia";
  ctx.fillText(state.mode === "win" ? "You reached the valley" : "The wagon failed", 120, 220);
  ctx.fillStyle = "#f7ead7";
  ctx.font = "22px Georgia";
  ctx.fillText("Press Restart for a clean rerun.", 120, 264);
}

function tick(now) {
  const delta = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (state.mode === "hunt" && state.hunt) {
    state.hunt.timeLeft -= delta;
    for (const animal of state.hunt.animals) {
      if (!animal.alive) {
        continue;
      }
      animal.x -= animal.speed * delta;
      if (animal.x < -80) {
        animal.x = 1040 + Math.random() * 180;
        animal.y = 180 + animal.lane * 90 + Math.random() * 12;
      }
    }
    if (state.hunt.timeLeft <= 0) {
      finishHunt();
    }
  }

  if (state.mode === "crossing" && state.crossing) {
    state.crossing.marker += state.crossing.markerVelocity * delta;
    if (state.crossing.marker >= 0.98 || state.crossing.marker <= 0.02) {
      state.crossing.markerVelocity *= -1;
      state.crossing.marker = clamp(state.crossing.marker, 0.02, 0.98);
    }
  }

  drawSky();
  drawGround();
  drawTrailProgress();
  drawStatusBar();
  drawHunt();
  drawCrossing();
  drawEndState();

  requestAnimationFrame(tick);
}

function restart() {
  state = initialState();
  updateHud();
}

ui.travelBtn.addEventListener("click", advanceTrail);
ui.huntBtn.addEventListener("click", startHunt);
ui.restBtn.addEventListener("click", restDay);
ui.paceBtn.addEventListener("click", cyclePace);
ui.rationsBtn.addEventListener("click", cycleRations);
ui.restartBtn.addEventListener("click", restart);
canvas.addEventListener("click", handleCanvasClick);
window.addEventListener("keydown", handleKey);

restart();
requestAnimationFrame((time) => {
  lastFrame = time;
  requestAnimationFrame(tick);
});
