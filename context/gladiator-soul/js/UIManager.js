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
        </div>
        <div class="panel">
          <h3>Route</h3>
          <p>Train, trade, then enter the arena. Win the bout to reach the champion screen.</p>
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
    this.renderShellActions();
    this.setStatusLine("Arena live.");
  }

  renderMarketplace(state = {}) {
    this.setScreen("marketplace");
    const owned = new Set(state.fighter?.inventory?.owned ?? []);
    const equipped = state.fighter?.inventory?.equipped ?? {};
    const items = state.inventory?.shopItems ?? [];

    if (this.nodes.marketplaceBody) {
      this.nodes.marketplaceBody.innerHTML = items
        .map((item) => {
          const itemOwned = owned.has(item.id);
          const itemEquipped = equipped[item.slot] === item.id;
          const buttonLabel = itemOwned ? (itemEquipped ? "Equipped" : "Equip") : `Buy ${item.price}`;
          const buttonAttr = itemOwned ? `data-equip="${item.id}" data-slot="${item.slot}"` : `data-buy="${item.id}"`;
          return `
            <article class="market-item">
              <div class="tag-row">
                <span class="status-pill">${asText(item.slot)}</span>
                ${itemEquipped ? '<span class="status-pill status-pill--active">active</span>' : ""}
              </div>
              <h3>${asText(item.name)}</h3>
              <p>${asText(item.description)}</p>
              <div class="detail-row"><span class="muted">Stats</span><strong>${this.formatModifiers(item.modifiers)}</strong></div>
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
    if (this.nodes.trainingBody) {
      this.nodes.trainingBody.innerHTML = options
        .map(
          (entry) => `
            <article class="training-item">
              <div class="tag-row">
                <span class="status-pill">${asText(entry.stat)}</span>
                <span class="status-pill">${entry.cost} gold</span>
              </div>
              <h3>${asText(entry.title)}</h3>
              <p>${asText(entry.description)}</p>
              <button data-train="${entry.id}">Train</button>
            </article>
          `,
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
    this.setStatusLine(state.result?.victory ? "Champion screen." : "Defeat screen.");
  }

  renderShellActions() {
    if (this.nodes.menuActions) {
      this.nodes.menuActions.innerHTML = `
        <button data-nav="arena">Enter Arena</button>
        <button data-nav="training">Training Yard</button>
        <button data-nav="marketplace">Marketplace</button>
      `;
    }

    if (this.nodes.combatActions) {
      this.nodes.combatActions.innerHTML = `
        <button data-action="swing">Swing</button>
        <button data-action="jab">Jab</button>
        <button data-action="block">Block</button>
        <button data-action="taunt">Taunt</button>
        <button data-action="powerAttack" data-variant="danger">Power Attack</button>
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
