export function createHud(root) {
  root.innerHTML = `
    <div class="hud">
      <div class="status-card">
        <p class="label">Flight</p>
        <div class="stats" data-hud="flight"></div>
      </div>
      <div class="status-card">
        <p class="label">Upgrades</p>
        <div class="shop-grid" data-hud="shop"></div>
      </div>
      <div class="status-card wide">
        <p class="label">Menu</p>
        <div class="menu" data-hud="menu"></div>
      </div>
    </div>`;
  return {
    flight: root.querySelector('[data-hud="flight"]'),
    shop: root.querySelector('[data-hud="shop"]'),
    menu: root.querySelector('[data-hud="menu"]'),
  };
}

export function renderHud(frameState, hud) {
  hud.flight.innerHTML = [
    `<span>Alt ${Math.round(frameState.hud.altitude)}</span>`,
    `<span>Speed ${frameState.hud.speed.toFixed(1)}</span>`,
    `<span>Fuel ${Math.max(0, Math.round(frameState.hud.fuel))}</span>`,
    `<span>Coins ${Math.max(0, Math.round(frameState.hud.coins))}</span>`,
    `<span>Wind ${frameState.hud.wind.toFixed(1)}</span>`,
  ].join("");
  hud.shop.innerHTML = frameState.shop
    .map(
      (upgrade) => `
        <button class="shop-card ${upgrade.selected ? "selected" : ""}" data-upgrade="${upgrade.id}" data-action="purchase-${upgrade.id}">
          <strong>${upgrade.name}</strong>
          <span>${upgrade.description}</span>
          <em>${upgrade.price} c | owned ${upgrade.owned}</em>
        </button>`,
    )
    .join("");
  hud.menu.innerHTML = frameState.menuActions
    .map((action) => `<button class="menu-button" data-action="${action.id}">${action.label}</button>`)
    .join("");
  if (frameState.outcome) {
    hud.menu.insertAdjacentHTML("afterbegin", `<p class="outcome">${frameState.outcome}</p>`);
  }
}

export function bindMenuActions(handlers) {
  document.addEventListener("click", (event) => {
    const upgrade = event.target.closest("[data-upgrade]");
    const action = event.target.closest("[data-action]");
    if (upgrade) handlers.selectUpgrade?.(upgrade.dataset.upgrade);
    if (action) {
      const id = action.dataset.action;
      if (id === "startRun") handlers.startRun?.();
      if (id === "restart") handlers.restart?.();
      if (id?.startsWith("purchase-")) handlers.purchaseUpgrade?.(id.slice(9));
    }
  });
}
