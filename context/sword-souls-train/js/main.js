import { StatManager } from "./StatManager.js";
import { TrainingGames } from "./TrainingGames.js";
import { CombatEngine } from "./CombatEngine.js";

const shell = document.getElementById("app-shell");
const screens = Object.fromEntries(["training", "arena", "combat", "result"].map((name) => [name, document.getElementById(`${name}-screen`)]));
const nodes = {
  playerSummary: document.getElementById("player-summary"),
  trainingCards: document.getElementById("training-cards"),
  liveStats: document.getElementById("live-stats"),
  encounterList: document.getElementById("encounter-list"),
  arenaSummary: document.getElementById("arena-summary"),
  combatHud: document.getElementById("combat-hud"),
  combatActions: document.getElementById("combat-actions"),
  combatLog: document.getElementById("combat-log"),
  resultSummary: document.getElementById("result-summary"),
  resultMessage: document.getElementById("result-message"),
};

const stats = new StatManager();
const combat = new CombatEngine();
const training = new TrainingGames(handleTrainingComplete);
let mode = "training";
let selectedEncounter = combat.encounters[0];
let combatState = null;

stats.subscribe(() => {
  if (mode !== "training" || combatState) {
    render();
  }
});

function setMode(next) {
  mode = next;
  shell.dataset.state = next;
  for (const [name, screen] of Object.entries(screens)) screen.hidden = name !== next;
  render();
}

function handleTrainingComplete(gameType, payload) {
  stats.applyTrainingResult(gameType, payload);
  render();
}

function renderStats(target) {
  const s = stats.getSnapshot();
  target.innerHTML = [
    ["Level", s.level],
    ["Training", s.trainingPoints],
    ["Swing Speed", `${s.swingSpeed.toFixed(2)}x`],
    ["Crit Chance", `${Math.round(s.critChance * 100)}%`],
    ["Accuracy", `${Math.round(s.accuracy * 100)}%`],
    ["Attack", s.attack],
    ["Defense", s.defense],
    ["HP", s.hp],
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function render() {
  const s = stats.getSnapshot();
  nodes.playerSummary.innerHTML = `<div class="hud-pill"><span>Speed</span><strong>${s.swingSpeed.toFixed(2)}x</strong></div><div class="hud-pill"><span>Crit</span><strong>${Math.round(s.critChance * 100)}%</strong></div><div class="hud-pill"><span>Acc</span><strong>${Math.round(s.accuracy * 100)}%</strong></div>`;
  renderStats(nodes.liveStats);
  nodes.trainingCards.innerHTML = training.cards.map((card) => `<article class="card"><h3>${card.title}</h3><p>${card.description}</p><button type="button" data-train="${card.id}">Train</button></article>`).join("");
  nodes.encounterList.innerHTML = combat.encounters.map((encounter) => `<article class="encounter"><h3>${encounter.name}</h3><p>${encounter.note}</p><p>Threat: ${encounter.threat} | Reward: ${encounter.reward}</p><button type="button" data-encounter="${encounter.id}">Select</button></article>`).join("");
  nodes.arenaSummary.innerHTML = `<div class="summary-item"><span>Selected</span><strong>${selectedEncounter.name}</strong></div><div class="summary-item"><span>Speed</span><strong>${s.swingSpeed.toFixed(2)}x</strong></div><div class="summary-item"><span>Crit</span><strong>${Math.round(s.critChance * 100)}%</strong></div><div class="summary-item"><span>Attack</span><strong>${s.attack}</strong></div><div class="summary-item"><span>Defense</span><strong>${s.defense}</strong></div>`;
  if (combatState) {
    nodes.combatHud.innerHTML = `<div class="hud-pill"><span>Enemy</span><strong>${combatState.encounter.name}</strong></div><div class="hud-pill"><span>HP</span><strong>${combatState.enemyHp}</strong></div><div class="hud-pill"><span>Player</span><strong>${combatState.playerHp}</strong></div>`;
    nodes.combatLog.innerHTML = combatState.log.map((line) => `<div class="log-entry">${line.text ?? line}</div>`).join("");
  }
  nodes.combatActions.innerHTML = `<button type="button" data-action="light">Light Slash</button><button type="button" data-action="heavy">Heavy Slash</button><button type="button" data-action="guard">Guard</button>`;
  nodes.resultSummary.innerHTML = combatState ? `<div class="summary-item"><span>Outcome</span><strong>${combatState.result?.outcome ?? combatState.outcome ?? "Pending"}</strong></div><div class="summary-item"><span>Enemy</span><strong>${combatState.encounter.name}</strong></div><div class="summary-item"><span>Final HP</span><strong>${combatState.playerHp}</strong></div><div class="summary-item"><span>Rounds</span><strong>${combatState.result?.summary?.rounds ?? combatState.round ?? 0}</strong></div>` : "";
  nodes.resultMessage.textContent = combatState?.result?.victory ? "The enemy fell. Return to the forge." : "Training continues to shape the next duel.";
}

document.addEventListener("click", (event) => {
  const train = event.target.closest("[data-train]")?.dataset.train;
  const encounter = event.target.closest("[data-encounter]")?.dataset.encounter;
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (train) return training.complete(train);
  if (encounter) { selectedEncounter = combat.encounters.find((item) => item.id === encounter) ?? selectedEncounter; return render(); }
  if (action) { combatState = combat.action(action); if (combatState?.finished) setMode("result"); else render(); }
});

document.getElementById("go-arena-btn").addEventListener("click", () => setMode("arena"));
document.getElementById("back-training-btn").addEventListener("click", () => setMode("training"));
document.getElementById("start-combat-btn").addEventListener("click", () => { combatState = combat.createEncounter(stats.getDerivedCombatStats(), selectedEncounter); setMode("combat"); });
document.getElementById("result-training-btn").addEventListener("click", () => setMode("training"));
document.getElementById("result-arena-btn").addEventListener("click", () => setMode("arena"));

render();
