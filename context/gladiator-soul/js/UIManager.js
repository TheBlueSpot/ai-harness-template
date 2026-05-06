const SCREEN_IDS = Object.freeze({
  menu: "menu-screen",
  arena: "arena-screen",
  marketplace: "marketplace-screen",
  training: "training-screen",
  champion: "champion-screen",
});

function byId(id) {
  return document.getElementById(id);
}

function asText(value, fallback = "--") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function fighterRows(fighter = {}) {
  return [
    ["Health", `${asText(fighter.health)}/${asText(fighter.maxHealth)}`],
    ["Stamina", `${asText(fighter.stamina)}/${asText(fighter.maxStamina)}`],
    ["Strength", asText(fighter.strength)],
    ["Agility", asText(fighter.agility)],
    ["Defense", asText(fighter.defense)],
    ["Crowd Favor", asText(fighter.crowdFavor ?? fighter.favor ?? 0)],
    ["Status", asText(fighter.status ?? "READY")],
  ];
}

function renderStatList(rows = []) {
  return rows
    .map(([label, value]) => `<div class="detail-row"><span class="muted">${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function shortStatLabel(key) {
  const labels = {
    healthBonus: "HP",
    staminaBonus: "STA",
    strengthBonus: "STR",
    agilityBonus: "AGI",
    defenseBonus: "DEF",
    favorBonus: "FAV",
  };
  return labels[key] ?? key.replace("Bonus", "").toUpperCase();
}

const MODIFIER_KEYS = Object.freeze([
  "healthBonus",
  "staminaBonus",
  "strengthBonus",
  "agilityBonus",
  "defenseBonus",
  "favorBonus",
]);

function modifierNumber(modifiers = {}, key) {
  return Number(modifiers?.[key] ?? 0);
}

function mergeModifierSets(...modifierSets) {
  return MODIFIER_KEYS.reduce((totals, key) => {
    totals[key] = modifierSets.reduce((sum, entry) => sum + modifierNumber(entry, key), 0);
    return totals;
  }, {});
}

function buildPreviewFighter(fighter = {}, modifierDelta = {}) {
  const next = { ...fighter };
  next.maxHealth = Number(fighter.maxHealth ?? 0) + modifierNumber(modifierDelta, "healthBonus");
  next.maxStamina = Number(fighter.maxStamina ?? 0) + modifierNumber(modifierDelta, "staminaBonus");
  next.strength = Number(fighter.strength ?? 0) + modifierNumber(modifierDelta, "strengthBonus");
  next.agility = Number(fighter.agility ?? 0) + modifierNumber(modifierDelta, "agilityBonus");
  next.defense = Number(fighter.defense ?? 0) + modifierNumber(modifierDelta, "defenseBonus");
  next.favorBonus = Number(fighter.favorBonus ?? 0) + modifierNumber(modifierDelta, "favorBonus");
  next.crowdFavor = Number(fighter.crowdFavor ?? fighter.favor ?? 0);
  next.favor = next.crowdFavor;
  return next;
}

function formatSignedStatDelta(delta) {
  if (delta === 0) return null;
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function formatModifierTradeoff(itemModifiers = {}, equippedModifiers = {}) {
  const rows = MODIFIER_KEYS.map((key) => {
    const delta = modifierNumber(itemModifiers, key) - modifierNumber(equippedModifiers, key);
    const label = shortStatLabel(key);
    const signed = formatSignedStatDelta(delta);
    return signed ? `${label} ${signed}` : null;
  }).filter(Boolean);

  return rows.length ? rows.join(" | ") : "Same stat lane as current gear.";
}

function formatProjectedStats(modifiers = {}, fighter = {}) {
  const projections = [
    ["healthBonus", fighter.maxHealth],
    ["staminaBonus", fighter.maxStamina],
    ["strengthBonus", fighter.strength],
    ["agilityBonus", fighter.agility],
    ["defenseBonus", fighter.defense],
    ["favorBonus", fighter.favorBonus ?? fighter.crowdFavor ?? fighter.favor ?? 0],
  ]
    .filter(([key]) => Number(modifiers[key]))
    .map(([key, current]) => `${shortStatLabel(key)} ${asText(current, 0)} -> ${Number(current ?? 0) + Number(modifiers[key])}`);

  return projections.length ? projections.join(" | ") : "No stat change";
}

function formatMoveSheetDelta(currentFighter = {}, nextFighter = {}, rival = { defense: 9, agility: 9, level: 1 }) {
  const currentSwing = estimateAttack("swing", currentFighter, rival).damage;
  const currentJab = estimateAttack("jab", currentFighter, rival).damage;
  const currentPower = estimateAttack("powerAttack", currentFighter, rival).damage;
  const nextSwing = estimateAttack("swing", nextFighter, rival).damage;
  const nextJab = estimateAttack("jab", nextFighter, rival).damage;
  const nextPower = estimateAttack("powerAttack", nextFighter, rival).damage;
  return `Swing ${currentSwing}->${nextSwing} | Jab ${currentJab}->${nextJab} | Power ${currentPower}->${nextPower}`;
}

function describeModifierUse(modifiers = {}) {
  if (Number(modifiers.strengthBonus) >= 4) return "Strength route: heavier Swing and Power Attack turns.";
  if (Number(modifiers.defenseBonus) >= 4) return "Defense route: stronger blocks and less incoming damage.";
  if (Number(modifiers.agilityBonus) >= 3) return "Agility route: sharper Jabs and better dodge pressure.";
  if (Number(modifiers.favorBonus) >= 4) return "Showmanship route: faster crowd buffs and taunt spikes.";
  if (Number(modifiers.staminaBonus) >= 6) return "Endurance route: more actions before TIRED recovery.";
  return "Rounds out your build without locking you into one move.";
}

function describeTrainingUse(trainingId) {
  if (trainingId === "strength") return "Raises raw damage first, then adds a little armor.";
  if (trainingId === "agility") return "Helps jab plans and makes enemy pressure easier to answer.";
  if (trainingId === "stamina") return "Buys extra actions before the arena forces a recovery turn.";
  if (trainingId === "showmanship") return "Speeds crowd-buff access for swingy momentum turns.";
  return "Improves your next arena run.";
}

function formatTrainingProjection(entry = {}, fighter = {}) {
  if (entry.id === "strength") {
    return `STR ${asText(fighter.strength, 0)} -> ${Number(fighter.strength ?? 0) + 2} | DEF ${asText(fighter.defense, 0)} -> ${Number(fighter.defense ?? 0) + 1}`;
  }
  if (entry.id === "agility") {
    return `AGI ${asText(fighter.agility, 0)} -> ${Number(fighter.agility ?? 0) + 2} | DEF ${asText(fighter.defense, 0)} -> ${Number(fighter.defense ?? 0) + 1}`;
  }
  if (entry.id === "stamina") {
    return `STA ${asText(fighter.maxStamina, 0)} -> ${Number(fighter.maxStamina ?? 0) + 10}`;
  }
  if (entry.id === "showmanship") {
    return `AGI ${asText(fighter.agility, 0)} -> ${Number(fighter.agility ?? 0) + 1} | Favor ${asText(fighter.crowdFavor ?? fighter.favor, 0)} -> ${Number(fighter.crowdFavor ?? fighter.favor ?? 0) + 4}`;
  }
  return "Check yard effects in arena.";
}

function previewTrainingFighter(entry = {}, fighter = {}) {
  const next = { ...fighter };
  if (entry.id === "strength") {
    next.strength = Number(fighter.strength ?? 0) + 2;
    next.defense = Number(fighter.defense ?? 0) + 1;
  }
  if (entry.id === "agility") {
    next.agility = Number(fighter.agility ?? 0) + 2;
    next.defense = Number(fighter.defense ?? 0) + 1;
  }
  if (entry.id === "stamina") {
    next.maxStamina = Number(fighter.maxStamina ?? 0) + 10;
  }
  if (entry.id === "showmanship") {
    next.agility = Number(fighter.agility ?? 0) + 1;
    next.crowdFavor = Number(fighter.crowdFavor ?? fighter.favor ?? 0) + 4;
    next.favor = next.crowdFavor;
  }
  return next;
}

function describeBuild(fighter = {}) {
  const tracks = [
    { key: "strength", value: Number(fighter.strength ?? 0), title: "Power route", text: "Lean on Swing and Power Attack when you can afford the stamina." },
    { key: "agility", value: Number(fighter.agility ?? 0), title: "Tempo route", text: "Use Jab pressure and react quickly once the enemy starts to fade." },
    { key: "defense", value: Number(fighter.defense ?? 0), title: "Guard route", text: "Block big turns, then cash the safer health lead into counter-hits." },
  ].sort((left, right) => right.value - left.value);

  const lead = tracks[0];
  const support = tracks[1];
  return {
    title: lead?.title ?? "Balanced route",
    text: `${lead?.text ?? "Stay adaptable."} Backup edge: ${support?.key ?? "none"} keeps the plan stable.`,
  };
}

function routeTone(routeKey) {
  if (routeKey === "strength") return "power";
  if (routeKey === "agility") return "tempo";
  if (routeKey === "defense") return "guard";
  if (routeKey === "stamina") return "endurance";
  if (routeKey === "showmanship") return "showmanship";
  return "balanced";
}

function routeFitForModifiers(routeKey, modifiers = {}) {
  if (routeKey === "strength") return Number(modifiers.strengthBonus ?? 0) * 2 + Number(modifiers.defenseBonus ?? 0);
  if (routeKey === "agility") return Number(modifiers.agilityBonus ?? 0) * 2 + Number(modifiers.staminaBonus ?? 0);
  if (routeKey === "defense") return Number(modifiers.defenseBonus ?? 0) * 2 + Number(modifiers.healthBonus ?? 0) / 4;
  if (routeKey === "stamina") return Number(modifiers.staminaBonus ?? 0) * 2 + Number(modifiers.agilityBonus ?? 0);
  if (routeKey === "showmanship") return Number(modifiers.favorBonus ?? 0) * 2 + Number(modifiers.agilityBonus ?? 0);
  return 0;
}

function itemRouteStatus(item = {}, routePlan = {}) {
  if (!item?.id) {
    return { label: "Utility pick", tone: "balanced", reason: "Keeps the build flexible." };
  }

  if (item.id === routePlan.preferredItemId) {
    return {
      label: "Best next buy",
      tone: "best",
      reason: `This is the cleanest ${routePlan.title?.toLowerCase() ?? "build"} upgrade for your current fighter.`,
    };
  }

  const fit = routeFitForModifiers(routePlan.key, item.modifiers);
  if (fit > 0) {
    return {
      label: `${routePlan.title ?? "Build"} support`,
      tone: routeTone(routePlan.key),
      reason: "Supports the same route, but the recommended buy cashes out sooner.",
    };
  }

  return {
    label: "Pivot option",
    tone: "pivot",
    reason: "Useful if you want to change plans instead of reinforcing the current route.",
  };
}

function trainingRouteStatus(entry = {}, routePlan = {}) {
  if (!entry?.id) {
    return { label: "Utility drill", tone: "balanced", reason: "Keeps the next bout flexible." };
  }

  if (entry.id === routePlan.preferredTrainingId) {
    return {
      label: "Best next drill",
      tone: "best",
      reason: `Most direct training lane for the current ${routePlan.title?.toLowerCase() ?? "build"}.`,
    };
  }

  if (
    (routePlan.key === "strength" && entry.id === "strength") ||
    (routePlan.key === "agility" && entry.id === "agility") ||
    (routePlan.key === "stamina" && entry.id === "stamina") ||
    (routePlan.key === "showmanship" && entry.id === "showmanship") ||
    (routePlan.key === "defense" && (entry.id === "strength" || entry.id === "agility"))
  ) {
    return {
      label: `${routePlan.title ?? "Build"} support`,
      tone: routeTone(routePlan.key),
      reason: "Still feeds the same plan, just not as efficiently as the recommended drill.",
    };
  }

  return {
    label: "Pivot drill",
    tone: "pivot",
    reason: "Changes direction instead of sharpening the route you already have.",
  };
}

function findItemById(items = [], itemId) {
  return items.find((item) => item.id === itemId) ?? null;
}

function findTrainingById(options = [], trainingId) {
  return options.find((option) => option.id === trainingId) ?? null;
}

function buildRoutePlan(fighter = {}, inventory = {}, surface = "menu") {
  const routeScores = [
    {
      key: "strength",
      score: Number(fighter.strength ?? 0),
      title: "Power route",
      itemPriority: ["iron-gladius", "bronze-shield", "victor-wreath"],
      trainingId: "strength",
      why: "You already lean toward heavy turns, so the best spend is the one that makes Swing and Power Attack cash out faster.",
    },
    {
      key: "agility",
      score: Number(fighter.agility ?? 0),
      title: "Tempo route",
      itemPriority: ["arena-trident", "sand-greaves", "victor-wreath"],
      trainingId: "agility",
      why: "Your fastest win lane is repeated jab pressure, so buys should keep initiative and evasive answers ahead of raw bulk.",
    },
    {
      key: "defense",
      score: Number(fighter.defense ?? 0),
      title: "Guard route",
      itemPriority: ["bronze-shield", "iron-gladius", "sand-greaves"],
      trainingId: Number(fighter.strength ?? 0) >= Number(fighter.agility ?? 0) ? "strength" : "agility",
      why: "The build already survives well, so the next spend should turn that health lead into safer counter-damage instead of generic stat padding.",
    },
    {
      key: "stamina",
      score: Number(fighter.maxStamina ?? 0) / 10,
      title: "Endurance route",
      itemPriority: ["sand-greaves", "victor-wreath", "bronze-shield"],
      trainingId: "stamina",
      why: "Longer rounds are your edge, so the most valuable upgrades are the ones that buy extra actions before TIRED forces a blank turn.",
    },
    {
      key: "showmanship",
      score: Number(fighter.favorBonus ?? 0) + Number(fighter.crowdFavor ?? fighter.favor ?? 0) / 5,
      title: "Showmanship route",
      itemPriority: ["victor-wreath", "arena-trident", "iron-gladius"],
      trainingId: "showmanship",
      why: "Crowd spikes matter most when they arrive early, so the best next pick is the one that accelerates favor gain into damage buffs.",
    },
  ].sort((left, right) => right.score - left.score);

  const lead = routeScores[0] ?? routeScores[1];
  const owned = new Set(fighter.inventory?.owned ?? []);
  const preferredItem = lead ? lead.itemPriority.map((itemId) => findItemById(inventory.shopItems, itemId)).find((item) => item && !owned.has(item.id)) : null;
  const preferredTraining = lead ? findTrainingById(inventory.training, lead.trainingId) : null;
  const affordableItem = preferredItem && Number(fighter.gold ?? 0) >= Number(preferredItem.price ?? 0);
  const affordableTraining = preferredTraining && Number(fighter.gold ?? 0) >= Number(preferredTraining.cost ?? 0);

  const describePreferredItem = () =>
    preferredItem
      ? {
          affordable: affordableItem,
          label: affordableItem ? `Buy ${preferredItem.name} now` : `Save ${Math.max(0, Number(preferredItem.price ?? 0) - Number(fighter.gold ?? 0))} more gold for ${preferredItem.name}`,
          reason: affordableItem
            ? `${describeModifierUse(preferredItem.modifiers)} ${lead?.why ?? ""}`.trim()
            : `${describeModifierUse(preferredItem.modifiers)} Buy it once you can afford the route-defining gear.`,
        }
      : null;
  const describePreferredTraining = () =>
    preferredTraining
      ? {
          affordable: affordableTraining,
          label: affordableTraining ? `Train ${preferredTraining.title} now` : `Train ${preferredTraining.title} next`,
          reason: affordableTraining
            ? `${describeTrainingUse(preferredTraining.id)} ${lead?.why ?? ""}`.trim()
            : describeTrainingUse(preferredTraining.id),
        }
      : null;

  const itemPlan = describePreferredItem();
  const trainingPlan = describePreferredTraining();
  const prefersTrainingSurface = surface === "training";
  const primaryPlan =
    prefersTrainingSurface
      ? trainingPlan ?? itemPlan ?? { label: "No upgrade unlocked", reason: "Fight one more bout to earn the next meaningful choice." }
      : itemPlan ?? trainingPlan ?? { label: "No upgrade unlocked", reason: "Fight one more bout to earn the next meaningful choice." };
  const fallbackPlan =
    prefersTrainingSurface
      ? itemPlan ?? null
      : trainingPlan ?? null;

  const primaryLabel = primaryPlan.label;
  const primaryReason = primaryPlan.reason;
  const fallbackLabel = fallbackPlan
    ? `${prefersTrainingSurface ? "If you leave the yard" : "If you skip gear"}: ${fallbackPlan.label.replace(/ now$| next$/, "")}`
    : "After that: enter the arena";
  const fallbackReason = fallbackPlan
    ? fallbackPlan.reason
    : "Use the next fight to earn a clearer spend.";

  return {
    key: lead?.key ?? "balanced",
    title: lead?.title ?? "Balanced route",
    why: lead?.why ?? "Use the next spend to reinforce one visible plan.",
    preferredItemId: preferredItem?.id ?? null,
    preferredTrainingId: preferredTraining?.id ?? null,
    primaryLabel,
    primaryReason,
    fallbackLabel,
    fallbackReason,
  };
}

function estimateAttack(action, fighter = {}, rival = { defense: 9, agility: 9, level: 1 }) {
  const attackSpecs = {
    swing: { baseDamage: 16, offenseStat: "strength", responseStat: "defense", attackWeight: 1.1, defenseWeight: 0.85, defenseMitigation: 0.35, critChance: 0.12, critScale: 0.01 },
    jab: { baseDamage: 10, offenseStat: "agility", responseStat: "agility", attackWeight: 1.05, defenseWeight: 0.8, defenseMitigation: 0.18, critChance: 0.22, critScale: 0.015 },
    powerAttack: { baseDamage: 23, offenseStat: "strength", responseStat: "defense", attackWeight: 0.95, defenseWeight: 0.9, defenseMitigation: 0.42, critChance: 0.18, critScale: 0.012 },
  };
  const spec = attackSpecs[action];
  if (!spec) return { damage: 0, critChance: 0 };

  const offense = Number(fighter?.[spec.offenseStat] ?? 0);
  const response = Number(rival?.[spec.responseStat] ?? 0);
  const pressure = Math.max(
    0,
    offense * spec.attackWeight - response * spec.defenseWeight + (Number(fighter?.level ?? 1) - Number(rival?.level ?? 1)),
  );
  const critChance = Math.max(0.05, Math.min(0.45, spec.critChance + pressure * spec.critScale));
  const damage = Math.max(2, Math.round(spec.baseDamage + pressure - Number(rival?.defense ?? 0) * spec.defenseMitigation));
  return { damage, critChance };
}

function blockReductionPercent(fighter = {}) {
  const guardMultiplier = Math.max(0.2, Math.min(0.42, 0.5 - Number(fighter?.defense ?? 0) * 0.02));
  return Math.round((1 - guardMultiplier) * 100);
}

function buildStatGuideRows(fighter = {}) {
  const swing = estimateAttack("swing", fighter);
  const jab = estimateAttack("jab", fighter);
  const powerAttack = estimateAttack("powerAttack", fighter);
  const passiveFavor = Number(((Number(fighter?.favorBonus ?? 0) || 0) * 0.4).toFixed(1));
  const swings = Math.max(1, Math.floor(Number(fighter?.maxStamina ?? 0) / 12));
  const powerSwings = Math.max(1, Math.floor(Number(fighter?.maxStamina ?? 0) / 18));
  return [
    ["STR", `Swing ~${swing.damage}, Power ~${powerAttack.damage} vs a standard rival.`],
    ["AGI", `Jab ~${jab.damage} with ~${Math.round(jab.critChance * 100)}% crit pressure and better evasion.`],
    ["DEF", `Incoming hits shrink and blocks cut about ${blockReductionPercent(fighter)}% at current defense.`],
    ["STA", `Full bar supports about ${swings} swings or ${powerSwings} power attacks before TIRED.`],
    ["FAV", `${passiveFavor > 0 ? `Current gear adds +${passiveFavor} favor per action.` : "Favor mostly comes from moves and taunts."} At 20 favor you gain +20% damage for 3 turns.`],
  ];
}

function renderGuideRows(rows = []) {
  return rows
    .map(([label, text]) => `<div class="guide-row"><span class="guide-tag">${label}</span><span>${text}</span></div>`)
    .join("");
}

export class UIManager {
  constructor({ root = document } = {}) {
    this.root = root;
    this.handlers = {};
    this.currentScreen = "menu";
    this.logEntries = [];
    this.nodes = {
      hud: byId("hud"),
      statusLine: byId("status-line"),
      menuSummary: byId("menu-summary"),
      menuArt: byId("menu-art"),
      arenaArt: byId("arena-art"),
      championArt: byId("champion-art"),
      playerCard: byId("player-card"),
      enemyCard: byId("enemy-card"),
      combatLog: byId("combat-log"),
      marketplaceBody: byId("marketplace-body"),
      trainingBody: byId("training-body"),
      championBody: byId("champion-body"),
      menuActions: this.root.querySelector('[data-role="menu-actions"]'),
      combatActions: this.root.querySelector('[data-role="combat-actions"]'),
    };
    this.boundClick = (event) => this.handleClick(event);
    this.root.addEventListener("click", this.boundClick);
  }

  bindActions(handlers = {}) {
    this.handlers = handlers;
    this.renderShellActions();
  }

  setScreen(screen) {
    this.currentScreen = screen;
    Object.entries(SCREEN_IDS).forEach(([key, id]) => {
      const node = byId(id);
      if (node) node.classList.toggle("screen--active", key === screen);
    });
  }

  setStatusLine(message) {
    if (this.nodes.statusLine) this.nodes.statusLine.textContent = message;
  }

  updateHUD(snapshot = {}) {
    if (!this.nodes.hud) return;

    const rows = [
      ["Health", `${asText(snapshot.health)}/${asText(snapshot.maxHealth)}`],
      ["Stamina", `${asText(snapshot.stamina)}/${asText(snapshot.maxStamina)}`],
      ["Crowd Favor", asText(snapshot.crowdFavor)],
      ["Buff Turns", asText(snapshot.buffTurns)],
      ["Gold", asText(snapshot.gold)],
      ["Status", asText(snapshot.status)],
    ];

    this.nodes.hud.innerHTML = rows
      .map(([label, value]) => `<div class="stat"><span class="muted">${label}</span><b>${value}</b></div>`)
      .join("");
  }

  appendCombatLog(entries = []) {
    const list = Array.isArray(entries) ? entries : [entries];
    this.logEntries = list.filter(Boolean).slice();
    if (!this.nodes.combatLog) return;
    this.nodes.combatLog.innerHTML = this.logEntries
      .map((entry) => `<div class="log-entry">${asText(entry.text ?? entry)}</div>`)
      .join("");
  }

  renderMenu(state = {}) {
    this.setScreen("menu");
    const visual = state.inventory?.visual ?? {};
    const buildPlan = describeBuild(state.fighter);
    const routePlan = buildRoutePlan(state.fighter, state.inventory ?? {}, "menu");
    this.renderImage(this.nodes.menuArt, visual.menuArt ?? visual.player ?? state.fighter?.portrait);
    if (this.nodes.menuSummary) {
      this.nodes.menuSummary.innerHTML = `
        <div class="panel">
          <h3>Fighter</h3>
          ${renderStatList(fighterRows(state.fighter))}
        </div>
        <div class="panel">
          <h3>Loadout</h3>
          <p>${asText(visual.player?.label ?? visual.labels?.join(", "), "Bare steel")}</p>
          <p class="muted">Use the market to push strength, agility, defense, and favor.</p>
          <div class="plan-note">
            <strong>${buildPlan.title}</strong>
            <p>${buildPlan.text}</p>
          </div>
        </div>
        <div class="panel">
          <h3>Route</h3>
          <p>Train, trade, then enter the arena. Win the bout to reach the champion screen.</p>
        </div>
        <div class="panel">
          <h3>Next Spend</h3>
          <div class="plan-note">
            <strong>${routePlan.primaryLabel}</strong>
            <p>${routePlan.primaryReason}</p>
          </div>
          <div class="guide-list">
            ${renderGuideRows([
              ["PLAN", `${routePlan.title}. ${routePlan.why}`],
              ["NEXT", routePlan.fallbackLabel],
              ["READ", routePlan.fallbackReason],
            ])}
          </div>
        </div>
        <div class="panel">
          <h3>Stat Philosophy</h3>
          <div class="guide-list">
            ${renderGuideRows(buildStatGuideRows(state.fighter))}
          </div>
        </div>
      `;
    }
    this.renderShellActions();
    this.setStatusLine("Menu ready.");
  }

  renderArena(state = {}) {
    this.setScreen("arena");
    const visual = state.inventory?.visual ?? {};
    if (this.nodes.arenaArt) {
      this.nodes.arenaArt.innerHTML = `
        <div class="arena-portrait">
          <div class="arena-label">You</div>
          ${this.renderImageMarkup(visual.player ?? state.fighter?.portrait)}
        </div>
        <div class="arena-portrait">
          <div class="arena-label">${asText(state.combat?.enemy?.name, "Enemy")}</div>
          ${this.renderImageMarkup(visual.enemy ?? state.combat?.enemy?.portrait)}
        </div>
      `;
    }
    this.renderCharacterCard(this.nodes.playerCard, state.fighter?.name ?? "Player", state.fighter);
    this.renderCharacterCard(this.nodes.enemyCard, state.combat?.enemy?.name ?? "Enemy", state.combat?.enemy);
    this.appendCombatLog(state.combat?.turnLog?.length ? state.combat.turnLog : state.combat?.log ?? []);
    if (this.nodes.combatLog && !this.nodes.combatLog.querySelector(".arena-tip")) {
      const tip = document.createElement("div");
      tip.className = "log-entry arena-tip";
      tip.textContent = "Pick one move, watch the turn log for the enemy's intent, then answer the next swing.";
      this.nodes.combatLog.prepend(tip);
    }
    this.renderShellActions(state);
    this.setStatusLine("Arena live. Watch the turn log for the next threat.");
  }

  renderMarketplace(state = {}) {
    this.setScreen("marketplace");
    const owned = new Set(state.fighter?.inventory?.owned ?? []);
    const equipped = state.fighter?.inventory?.equipped ?? {};
    const items = state.inventory?.shopItems ?? [];
    const equippedBySlot = new Map((state.inventory?.equippedItems ?? []).map((item) => [item.slot, item]));
    const routePlan = buildRoutePlan(state.fighter, state.inventory ?? {}, "marketplace");

    if (this.nodes.marketplaceBody) {
      this.nodes.marketplaceBody.innerHTML = `
          <article class="market-item market-item--guide">
            <h3>${routePlan.primaryLabel}</h3>
            <p class="muted">${routePlan.primaryReason}</p>
            <div class="guide-list">
              ${renderGuideRows([
                ["PLAN", `${routePlan.title}. ${routePlan.why}`],
                ["NEXT", `${routePlan.fallbackLabel}. ${routePlan.fallbackReason}`],
              ])}
            </div>
          </article>
        ` + items
        .map((item) => {
          const routeStatus = itemRouteStatus(item, routePlan);
          const itemOwned = owned.has(item.id);
          const itemEquipped = equipped[item.slot] === item.id;
          const equippedItem = equippedBySlot.get(item.slot) ?? null;
          const previewDelta = {
            healthBonus: modifierNumber(item.modifiers, "healthBonus") - modifierNumber(equippedItem?.modifiers, "healthBonus"),
            staminaBonus: modifierNumber(item.modifiers, "staminaBonus") - modifierNumber(equippedItem?.modifiers, "staminaBonus"),
            strengthBonus: modifierNumber(item.modifiers, "strengthBonus") - modifierNumber(equippedItem?.modifiers, "strengthBonus"),
            agilityBonus: modifierNumber(item.modifiers, "agilityBonus") - modifierNumber(equippedItem?.modifiers, "agilityBonus"),
            defenseBonus: modifierNumber(item.modifiers, "defenseBonus") - modifierNumber(equippedItem?.modifiers, "defenseBonus"),
            favorBonus: modifierNumber(item.modifiers, "favorBonus") - modifierNumber(equippedItem?.modifiers, "favorBonus"),
          };
          const previewFighter = buildPreviewFighter(
            state.fighter,
            previewDelta,
          );
          const buttonLabel = itemOwned ? (itemEquipped ? "Equipped" : "Equip") : `Buy ${item.price}`;
          const buttonAttr = itemOwned ? `data-equip="${item.id}" data-slot="${item.slot}"` : `data-buy="${item.id}"`;
          return `
            <article class="market-item">
              <div class="tag-row">
                <span class="status-pill">${asText(item.slot)}</span>
                <span class="status-pill status-pill--${routeStatus.tone}">${routeStatus.label}</span>
                ${itemEquipped ? '<span class="status-pill status-pill--active">active</span>' : ""}
              </div>
              <h3>${asText(item.name)}</h3>
              <p>${asText(item.description)}</p>
              <div class="detail-row"><span class="muted">Stats</span><strong>${this.formatModifiers(item.modifiers)}</strong></div>
              <div class="detail-row"><span class="muted">Projected</span><strong>${formatProjectedStats(previewDelta, state.fighter)}</strong></div>
              <div class="detail-row"><span class="muted">Tradeoff</span><strong>${formatModifierTradeoff(item.modifiers, equippedItem?.modifiers)}</strong></div>
              <div class="detail-row"><span class="muted">Arena Payoff</span><strong>${formatMoveSheetDelta(state.fighter, previewFighter)}</strong></div>
              <div class="detail-row"><span class="muted">Why Now</span><strong>${routeStatus.reason}</strong></div>
              <p class="muted card-note">${describeModifierUse(item.modifiers)}</p>
              <button ${buttonAttr}>${buttonLabel}</button>
            </article>
          `;
        })
        .join("") + `
          <article class="market-item market-item--nav">
            <h3>Exit Market</h3>
            <p>Return to the main menu with your current gear.</p>
            <button data-nav="menu">Back to Menu</button>
          </article>`;
    }

    this.renderShellActions();
    this.setStatusLine("Marketplace open.");
  }

  renderTraining(state = {}) {
    this.setScreen("training");
    const options = state.inventory?.training ?? [];
    const routePlan = buildRoutePlan(state.fighter, state.inventory ?? {}, "training");
    if (this.nodes.trainingBody) {
      this.nodes.trainingBody.innerHTML = `
          <article class="training-item training-item--guide">
            <h3>${routePlan.primaryLabel}</h3>
            <p class="muted">${routePlan.primaryReason}</p>
            <div class="guide-list">
              ${renderGuideRows([
                ["PLAN", `${routePlan.title}. ${routePlan.why}`],
                ["NEXT", `${routePlan.fallbackLabel}. ${routePlan.fallbackReason}`],
              ])}
            </div>
          </article>
        ` + options
        .map(
          (entry) => {
            const routeStatus = trainingRouteStatus(entry, routePlan);
            return `
            <article class="training-item">
              <div class="tag-row">
                <span class="status-pill">${asText(entry.stat)}</span>
                <span class="status-pill">${entry.cost} gold</span>
                <span class="status-pill status-pill--${routeStatus.tone}">${routeStatus.label}</span>
              </div>
              <h3>${asText(entry.title)}</h3>
              <p>${asText(entry.description)}</p>
              <div class="detail-row"><span class="muted">Projected</span><strong>${formatTrainingProjection(entry, state.fighter)}</strong></div>
              <div class="detail-row"><span class="muted">Next Bout</span><strong>${formatMoveSheetDelta(state.fighter, previewTrainingFighter(entry, state.fighter))}</strong></div>
              <div class="detail-row"><span class="muted">Why Now</span><strong>${routeStatus.reason}</strong></div>
              <p class="muted card-note">${describeTrainingUse(entry.id)}</p>
              <button data-train="${entry.id}">Train</button>
            </article>
          `;
          },
        )
        .join("") + `
          <article class="training-item training-item--nav">
            <h3>Enough sweat</h3>
            <p>Return to the main menu and cash in the work.</p>
            <button data-nav="menu">Back to Menu</button>
          </article>`;
    }
    this.renderShellActions();
    this.setStatusLine("Training yard open.");
  }

  renderChampion(state = {}) {
    this.setScreen("champion");
    const visual = state.inventory?.visual ?? {};
    this.renderImage(this.nodes.championArt, visual.championArt ?? visual.player ?? state.fighter?.portrait);
    if (this.nodes.championBody) {
      this.nodes.championBody.innerHTML = `
        <h2>${state.result?.victory ? "Champion" : "Defiant Return"}</h2>
        <p>${asText(state.result?.message, "The bout is recorded.")}</p>
        <div class="detail-row"><span class="muted">Gold</span><strong>${asText(state.fighter?.gold)}</strong></div>
        <div class="detail-row"><span class="muted">Wins</span><strong>${asText(state.fighter?.wins)}</strong></div>
        <div class="detail-row"><span class="muted">Crowd Favor</span><strong>${asText(state.fighter?.crowdFavor)}</strong></div>
        <div class="action-stack">
          <button data-nav="menu">Return to Menu</button>
        </div>
      `;
    }
    this.renderShellActions();
    this.setStatusLine(state.result?.victory ? "Champion screen. Return to the menu for another bout." : "Defeat screen. Rebuild and try again.");
  }

  renderShellActions(state = {}) {
    if (this.nodes.menuActions) {
      this.nodes.menuActions.innerHTML = `
        <button data-nav="arena">Enter Arena</button>
        <button data-nav="training">Training Yard</button>
        <button data-nav="marketplace">Marketplace</button>
      `;
    }

    if (this.nodes.combatActions) {
      const fighter = state.fighter ?? {};
      const rival = state.combat?.enemy ?? { defense: 9, agility: 9, level: 1 };
      const swing = estimateAttack("swing", fighter, rival);
      const jab = estimateAttack("jab", fighter, rival);
      const powerAttack = estimateAttack("powerAttack", fighter, rival);
      this.nodes.combatActions.innerHTML = `
        <button data-action="swing">Swing · 12 STA · ~${swing.damage} dmg</button>
        <button data-action="jab">Jab · 8 STA · ~${jab.damage} dmg</button>
        <button data-action="block">Block · 6 STA · ~${blockReductionPercent(fighter)}% cut</button>
        <button data-action="taunt">Taunt · 9 STA · +10 favor</button>
        <button data-action="powerAttack" data-variant="danger">Power · 18 STA · ~${powerAttack.damage} dmg</button>
      `;
    }
  }

  renderCharacterCard(node, title, fighter = {}) {
    if (!node) return;
    node.innerHTML = `
      <h3>${asText(title)}</h3>
      <div class="status-pill ${fighter.status === "TIRED" ? "status-pill--danger" : ""}">${asText(fighter.status ?? "READY")}</div>
      ${renderStatList(fighterRows(fighter))}
    `;
  }

  renderImage(node, source) {
    if (!node || !source) return;
    const payload = typeof source === "string" ? { src: source, alt: "Gladiator art" } : source;
    if (node.tagName === "IMG") {
      node.src = payload.src;
      node.alt = payload.alt ?? "Gladiator art";
      return;
    }
    node.innerHTML = this.renderImageMarkup(payload);
  }

  renderImageMarkup(source) {
    const payload = typeof source === "string" ? { src: source, alt: "Gladiator art" } : source;
    return `<img src="${payload.src}" alt="${asText(payload.alt, "Gladiator art")}" />`;
  }

  formatModifiers(modifiers = {}) {
    return Object.entries(modifiers)
      .filter(([, value]) => Number(value))
      .map(([key, value]) => `${key.replace("Bonus", "")} +${value}`)
      .join(", ");
  }

  handleClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.nav === "arena") this.handlers.onStartArena?.();
    if (button.dataset.nav === "training") this.handlers.onTrain?.();
    if (button.dataset.nav === "marketplace") this.handlers.onMarket?.();
    if (button.dataset.nav === "menu") this.handlers.onBackToMenu?.();
    if (button.dataset.action) this.handlers.onPlayerAction?.(button.dataset.action);
    if (button.dataset.buy) this.handlers.onBuyItem?.(button.dataset.buy);
    if (button.dataset.equip) this.handlers.onEquipItem?.(button.dataset.slot, button.dataset.equip);
    if (button.dataset.train) this.handlers.onTrainStat?.(button.dataset.train);
    if (button.dataset.champion) this.handlers.onChampion?.();
  }
}
