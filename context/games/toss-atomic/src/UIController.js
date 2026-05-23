import { UpgradeStore } from "./UpgradeStore.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fmt = (value, digits = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return digits > 0 ? number.toFixed(digits) : String(Math.round(number));
};

const isDomAvailable = () => typeof document !== "undefined" && typeof window !== "undefined";

const defaultGameHooks = {
  start: "startRun",
  launch: "launch",
  shop: "openShop",
  "close-shop": "closeShop",
  retry: "restartRun",
  menu: "goToMenu",
  resume: "resumeRun",
  "reset-upgrades": "resetUpgrades",
};

const STYLE_ID = "toss-atomic-ui-style";

function ensureStyles() {
  if (!isDomAvailable()) {
    return;
  }
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .ta-ui-root {
      position: absolute;
      inset: 0;
      pointer-events: none;
      font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
      color: #f7f3ea;
      overflow: hidden;
      touch-action: none;
    }

    .ta-ui-shell {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-rows: 1fr auto;
    }

    .ta-screen {
      position: absolute;
      inset: 0;
      display: none;
      pointer-events: none;
    }

    .ta-screen.is-active {
      display: block;
      pointer-events: auto;
    }

    .ta-panel {
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: linear-gradient(180deg, rgba(15, 18, 26, 0.88), rgba(8, 10, 14, 0.74));
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
      border-radius: 22px;
    }

    .ta-menu-layout,
    .ta-results-layout,
    .ta-shop-layout {
      height: 100%;
      display: grid;
      align-items: center;
      justify-items: center;
      padding: clamp(16px, 3vw, 32px);
      pointer-events: auto;
    }

    .ta-card-grid {
      width: min(1100px, calc(100vw - 32px));
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .ta-title {
      font-size: clamp(36px, 5vw, 76px);
      font-weight: 800;
      letter-spacing: 0.04em;
      line-height: 0.94;
      margin: 0;
      text-transform: uppercase;
    }

    .ta-subtitle {
      max-width: 60ch;
      font-size: clamp(14px, 1.7vw, 20px);
      line-height: 1.5;
      color: rgba(247, 243, 234, 0.76);
      margin: 12px 0 0;
    }

    .ta-stack {
      display: grid;
      gap: 12px;
    }

    .ta-button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      background: linear-gradient(180deg, #f3a34f, #cf5e2f);
      color: #18120d;
      font-weight: 800;
      letter-spacing: 0.02em;
      cursor: pointer;
      pointer-events: auto;
      min-height: 44px;
      box-shadow: 0 10px 24px rgba(207, 94, 47, 0.28);
    }

    .ta-button[data-variant="ghost"] {
      background: rgba(255, 255, 255, 0.06);
      color: #f7f3ea;
      box-shadow: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .ta-button[data-variant="danger"] {
      background: linear-gradient(180deg, #f36f6f, #b63a3a);
      color: #fff6f5;
    }

    .ta-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .ta-toolbar {
      position: absolute;
      left: 16px;
      right: 16px;
      top: 16px;
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      pointer-events: none;
    }

    .ta-toolbar .ta-panel {
      pointer-events: auto;
    }

    .ta-hud {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 14px;
      padding: 16px;
      pointer-events: none;
    }

    .ta-hud-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      pointer-events: none;
    }

    .ta-stat {
      padding: 12px 14px;
      border-radius: 18px;
      background: rgba(8, 12, 18, 0.68);
      border: 1px solid rgba(255, 255, 255, 0.08);
      min-height: 64px;
    }

    .ta-stat-label {
      display: block;
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(247, 243, 234, 0.58);
      margin-bottom: 5px;
    }

    .ta-stat-value {
      font-size: 24px;
      font-weight: 800;
      line-height: 1;
    }

    .ta-hud-notice {
      align-self: end;
      justify-self: start;
      max-width: min(60ch, 100%);
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(8, 12, 18, 0.66);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: rgba(247, 243, 234, 0.82);
      pointer-events: none;
    }

    .ta-touchbar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      pointer-events: none;
    }

    .ta-touch-btn {
      display: none;
      min-height: 56px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(9, 12, 18, 0.72);
      color: #f7f3ea;
      font-weight: 800;
      pointer-events: auto;
      touch-action: none;
    }

    .ta-touch-btn.is-active {
      background: linear-gradient(180deg, rgba(243, 163, 79, 0.9), rgba(207, 94, 47, 0.9));
      color: #18120d;
    }

    .ta-shop-list {
      width: min(1200px, calc(100vw - 32px));
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
      pointer-events: auto;
    }

    .ta-shop-item {
      padding: 16px;
      border-radius: 20px;
      background: rgba(8, 12, 18, 0.76);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: grid;
      gap: 10px;
    }

    .ta-shop-item h3,
    .ta-shop-item p {
      margin: 0;
    }

    .ta-shop-item h3 {
      font-size: 20px;
    }

    .ta-shop-meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: rgba(247, 243, 234, 0.72);
      font-size: 14px;
    }

    .ta-meter {
      height: 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }

    .ta-meter > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #f3a34f, #ffde8a);
      transform-origin: left center;
    }

    .ta-results-summary {
      width: min(960px, calc(100vw - 32px));
      display: grid;
      gap: 16px;
      pointer-events: auto;
    }

    .ta-results-banner {
      padding: 18px 20px;
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(15, 18, 26, 0.9), rgba(8, 10, 14, 0.78));
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: grid;
      gap: 8px;
    }

    .ta-results-banner h2 {
      margin: 0;
      font-size: clamp(30px, 4.2vw, 54px);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .ta-results-banner p {
      margin: 0;
      color: rgba(247, 243, 234, 0.78);
      max-width: 70ch;
    }

    .ta-results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .ta-results-grid .ta-stat {
      min-height: 86px;
    }

    .ta-touchbar-wrap {
      pointer-events: none;
      display: grid;
      gap: 10px;
      padding: 0 16px 16px;
    }

    @media (pointer: coarse) {
      .ta-touch-btn {
        display: block;
      }
    }
  `;
  document.head.appendChild(style);
}

const defaultInputState = () => ({
  launchPressed: false,
  launchHeld: false,
  confirmPressed: false,
  cancelPressed: false,
  shopPressed: false,
  menuPressed: false,
  retryPressed: false,
  controlAxis: 0,
  controlVector: { x: 0, y: 0 },
  leftPressed: false,
  rightPressed: false,
  upPressed: false,
  downPressed: false,
  pointer: { x: 0, y: 0, down: false, active: false },
});

const statText = (value, suffix = "") => `${fmt(value)}${suffix}`;

export class UIController {
  constructor(options = {}) {
    const {
      root = null,
      upgradeStore = new UpgradeStore(),
      game = null,
      hooks = {},
      mode = "menu",
    } = options;

    this.store = upgradeStore;
    this.game = game;
    this.hooks = { ...defaultGameHooks, ...hooks };
    this.mode = mode;
    this.state = {
      run: {},
      launch: {},
      results: {},
      message: "",
      shopMessage: "",
      selectedUpgrade: null,
    };
    this.listeners = new Map();
    this.pendingActions = [];
    this.input = defaultInputState();
    this.dragState = { active: false, originX: 0, originY: 0, pointerId: null };
    this.destroyed = false;
    this.dom = null;

    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onStoreChange = this.onStoreChange.bind(this);
    this._onClick = this.onClick.bind(this);

    this.storeListener = this.store.onChange(this._onStoreChange);

    if (isDomAvailable()) {
      ensureStyles();
      this.mount(root ?? document.body);
      this.attachInput(window);
    }
    this.syncStoreTuning();
    this.setMode(mode);
    this.onStoreChange();
  }

  on(event, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    const bucket = this.listeners.get(event) ?? new Set();
    bucket.add(handler);
    this.listeners.set(event, bucket);
    return () => {
      bucket.delete(handler);
    };
  }

  emit(event, payload) {
    const bucket = this.listeners.get(event);
    if (bucket) {
      for (const handler of bucket) {
        handler(payload, this);
      }
    }
    const hookName = this.hooks[event];
    if (this.game && hookName && typeof this.game[hookName] === "function") {
      this.game[hookName](payload, this);
    }
  }

  mount(root = document.body) {
    if (!isDomAvailable() || !root) {
      return null;
    }

    if (this.dom?.root) {
      return this.dom.root;
    }

    const rootEl = document.createElement("div");
    rootEl.className = "ta-ui-root";
    rootEl.setAttribute("aria-hidden", "false");
    rootEl.innerHTML = `
      <div class="ta-ui-shell">
        <section class="ta-screen ta-menu-screen" data-screen="menu"></section>
        <section class="ta-screen ta-hud-screen" data-screen="hud"></section>
        <section class="ta-screen ta-shop-screen" data-screen="shop"></section>
        <section class="ta-screen ta-results-screen" data-screen="results"></section>
        <div class="ta-touchbar-wrap">
          <div class="ta-touchbar" aria-label="Touch controls">
            <button class="ta-touch-btn" data-touch="left" type="button">Left</button>
            <button class="ta-touch-btn" data-touch="launch" type="button">Launch</button>
            <button class="ta-touch-btn" data-touch="right" type="button">Right</button>
            <button class="ta-touch-btn" data-touch="shop" type="button">Shop</button>
          </div>
        </div>
      </div>
    `;
    root.appendChild(rootEl);

    this.dom = {
      root: rootEl,
      menu: rootEl.querySelector('[data-screen="menu"]'),
      hud: rootEl.querySelector('[data-screen="hud"]'),
      shop: rootEl.querySelector('[data-screen="shop"]'),
      results: rootEl.querySelector('[data-screen="results"]'),
      touch: {
        left: rootEl.querySelector('[data-touch="left"]'),
        launch: rootEl.querySelector('[data-touch="launch"]'),
        right: rootEl.querySelector('[data-touch="right"]'),
        shop: rootEl.querySelector('[data-touch="shop"]'),
      },
    };

    this.buildScreens();
    this.bindDomEvents();
    this.refresh();
    return rootEl;
  }

  bindDomEvents() {
    if (!this.dom?.root) {
      return;
    }

    this.dom.root.addEventListener("pointerdown", this._onPointerDown);
    this.dom.root.addEventListener("pointermove", this._onPointerMove);
    this.dom.root.addEventListener("pointerup", this._onPointerUp);
    this.dom.root.addEventListener("pointercancel", this._onPointerUp);
    this.dom.root.addEventListener("click", this._onClick);

    for (const button of Object.values(this.dom.touch)) {
      if (!button) {
        continue;
      }
      button.addEventListener("pointerdown", this._onPointerDown);
      button.addEventListener("pointerup", this._onPointerUp);
      button.addEventListener("pointercancel", this._onPointerUp);
    }
  }

  attachInput(target = window) {
    if (!target) {
      return;
    }
    this.inputTarget = target;
    target.addEventListener("keydown", this._onKeyDown);
    target.addEventListener("keyup", this._onKeyUp);
    target.addEventListener("blur", this.resetInput);
  }

  detachInput() {
    if (!this.inputTarget) {
      return;
    }
    this.inputTarget.removeEventListener("keydown", this._onKeyDown);
    this.inputTarget.removeEventListener("keyup", this._onKeyUp);
    this.inputTarget.removeEventListener("blur", this.resetInput);
    this.inputTarget = null;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.detachInput();
    if (this.dom?.root) {
      this.dom.root.removeEventListener("pointerdown", this._onPointerDown);
      this.dom.root.removeEventListener("pointermove", this._onPointerMove);
      this.dom.root.removeEventListener("pointerup", this._onPointerUp);
      this.dom.root.removeEventListener("pointercancel", this._onPointerUp);
      this.dom.root.removeEventListener("click", this._onClick);
      this.dom.root.remove();
    }
    this.storeListener?.();
    this.listeners.clear();
    this.pendingActions.length = 0;
  }

  buildScreens() {
    if (!this.dom) {
      return;
    }
    this.dom.menu.innerHTML = `
      <div class="ta-menu-layout">
        <div class="ta-panel" style="padding: clamp(18px, 3vw, 30px); width: min(960px, calc(100vw - 32px));">
          <h1 class="ta-title">Toss the Turtle: Atomic Blast</h1>
          <p class="ta-subtitle">
            Sling the turtle, steer mid-flight, bounce off hazards, and keep enough momentum to survive the impact trail.
            Upgrades persist locally and feed the launch, control, and rebound tuning that the physics module reads.
          </p>
          <div class="ta-card-grid" style="margin-top: 20px;">
            <div class="ta-panel" style="padding: 16px;">
              <h3 style="margin:0 0 8px;">How to play</h3>
              <p style="margin:0;color:rgba(247,243,234,0.76);line-height:1.5;">
                Hold launch, release to fire, then steer in midair with A/D, arrows, drag gestures, or touch buttons.
                Recover coins from distance and style points, then spend them in the shop.
              </p>
            </div>
            <div class="ta-panel" style="padding: 16px;">
              <h3 style="margin:0 0 8px;">Controls</h3>
              <p style="margin:0;color:rgba(247,243,234,0.76);line-height:1.5;">
                Enter or Space to launch/confirm. Esc opens or closes panels. Left/Right control steering.
              </p>
            </div>
            <div class="ta-panel" style="padding: 16px;">
              <h3 style="margin:0 0 8px;">Progress</h3>
              <p style="margin:0;color:rgba(247,243,234,0.76);line-height:1.5;" data-menu-progress>Saved upgrades loaded.</p>
            </div>
          </div>
          <div class="ta-stack" style="margin-top: 18px; max-width: 420px;">
            <button class="ta-button" data-action="start" type="button">Start Run</button>
            <button class="ta-button" data-action="shop" type="button" data-variant="ghost">Upgrade Shop</button>
            <button class="ta-button" data-action="reset-upgrades" type="button" data-variant="danger">Reset Upgrades</button>
          </div>
        </div>
      </div>
    `;

    this.dom.hud.innerHTML = `
      <div class="ta-hud">
        <div class="ta-hud-grid">
          <div class="ta-stat"><span class="ta-stat-label">distance</span><span class="ta-stat-value" data-stat="distance">0</span></div>
          <div class="ta-stat"><span class="ta-stat-label">speed</span><span class="ta-stat-value" data-stat="speed">0</span></div>
          <div class="ta-stat"><span class="ta-stat-label">altitude</span><span class="ta-stat-value" data-stat="altitude">0</span></div>
          <div class="ta-stat"><span class="ta-stat-label">bounces</span><span class="ta-stat-value" data-stat="bounces">0</span></div>
        </div>
        <div class="ta-hud-notice" data-hud-notice>Launch and steer to build speed.</div>
        <div class="ta-toolbar">
          <div class="ta-panel" style="padding: 10px 12px; display:flex; gap:10px; align-items:center;">
            <span data-stat="coins">0</span>
            <span style="color:rgba(247,243,234,0.6);">coins</span>
          </div>
          <div class="ta-stack" style="display:flex; gap:10px;">
            <button class="ta-button" data-action="launch" type="button">Launch</button>
            <button class="ta-button" data-action="shop" type="button" data-variant="ghost">Shop</button>
            <button class="ta-button" data-action="menu" type="button" data-variant="ghost">Menu</button>
          </div>
        </div>
      </div>
    `;

    this.dom.shop.innerHTML = `
      <div class="ta-shop-layout">
        <div class="ta-panel" style="padding: 18px; width: min(1200px, calc(100vw - 32px));">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px;">
            <div>
              <h2 style="margin:0;font-size:clamp(28px, 3vw, 44px);text-transform:uppercase;">Upgrade Shop</h2>
              <p style="margin:6px 0 0;color:rgba(247,243,234,0.72);max-width:70ch;">
                Buy permanent tuning for the launch, control, and bounce model. The store writes directly into the upgrade state used by the physics layer.
              </p>
            </div>
            <div class="ta-panel" style="padding:10px 14px; min-width: 140px; text-align:right;">
              <div style="font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:rgba(247,243,234,.58);">coins</div>
              <div style="font-size:28px; font-weight:800;" data-shop-coins>0</div>
            </div>
          </div>
          <div class="ta-panel" style="padding:12px 14px; margin-bottom:14px; color:rgba(247,243,234,.76);" data-shop-status>Spend coins to extend the run.</div>
          <div class="ta-shop-list" data-shop-list></div>
          <div class="ta-stack" style="display:flex; margin-top:16px; justify-content:flex-end;">
            <button class="ta-button" data-action="close-shop" type="button" data-variant="ghost">Back</button>
          </div>
        </div>
      </div>
    `;

    this.dom.results.innerHTML = `
      <div class="ta-results-layout">
        <div class="ta-results-summary">
          <div class="ta-results-banner">
            <h2 data-results-title>Run Complete</h2>
            <p data-results-message>Results appear here after the run ends.</p>
          </div>
          <div class="ta-results-grid">
            <div class="ta-stat"><span class="ta-stat-label">distance</span><span class="ta-stat-value" data-result="distance">0</span></div>
            <div class="ta-stat"><span class="ta-stat-label">airtime</span><span class="ta-stat-value" data-result="airtime">0</span></div>
            <div class="ta-stat"><span class="ta-stat-label">speed</span><span class="ta-stat-value" data-result="speed">0</span></div>
            <div class="ta-stat"><span class="ta-stat-label">bounces</span><span class="ta-stat-value" data-result="bounces">0</span></div>
            <div class="ta-stat"><span class="ta-stat-label">score</span><span class="ta-stat-value" data-result="score">0</span></div>
            <div class="ta-stat"><span class="ta-stat-label">coins earned</span><span class="ta-stat-value" data-result="coins">0</span></div>
          </div>
          <div class="ta-stack" style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="ta-button" data-action="retry" type="button">Retry</button>
            <button class="ta-button" data-action="shop" type="button" data-variant="ghost">Shop</button>
            <button class="ta-button" data-action="menu" type="button" data-variant="ghost">Menu</button>
          </div>
        </div>
      </div>
    `;

    this.bindButtonActions();
  }

  bindButtonActions() {
    if (!this.dom) {
      return;
    }
    this.dom.touch.left.addEventListener("pointerdown", () => this.setTouchSteer(-1));
    this.dom.touch.left.addEventListener("pointerup", () => this.clearTouchSteer());
    this.dom.touch.left.addEventListener("pointercancel", () => this.clearTouchSteer());
    this.dom.touch.right.addEventListener("pointerdown", () => this.setTouchSteer(1));
    this.dom.touch.right.addEventListener("pointerup", () => this.clearTouchSteer());
    this.dom.touch.right.addEventListener("pointercancel", () => this.clearTouchSteer());
    this.dom.touch.launch.addEventListener("pointerdown", () => this.dispatch("launch"));
    this.dom.touch.shop.addEventListener("pointerdown", () => this.dispatch("shop"));
  }

  onStoreChange() {
    this.syncStoreTuning();
    this.refreshShop();
    this.refresh();
  }

  setGame(game) {
    this.game = game;
    this.syncStoreTuning();
    return this;
  }

  setHooks(hooks = {}) {
    this.hooks = { ...this.hooks, ...hooks };
    return this;
  }

  setMode(mode) {
    this.mode = mode;
    this.refresh();
    return this;
  }

  showMenu() {
    return this.setMode("menu");
  }

  showGameplay() {
    return this.setMode("hud");
  }

  showShop() {
    return this.setMode("shop");
  }

  showResults() {
    return this.setMode("results");
  }

  setRunState(run = {}) {
    this.state.run = { ...this.state.run, ...run };
    this.refreshHUD();
    return this;
  }

  setHUD(run = {}) {
    return this.setRunState(run);
  }

  setLaunchState(launch = {}) {
    this.state.launch = { ...this.state.launch, ...launch };
    this.refreshHUD();
    return this;
  }

  setResults(results = {}) {
    this.state.results = { ...this.state.results, ...results };
    this.refreshResults();
    return this;
  }

  setResultsScreen(results = {}) {
    return this.setResults(results);
  }

  setMessage(message) {
    this.state.message = String(message ?? "");
    this.refreshHUD();
    this.refreshResults();
    return this;
  }

  setShopMessage(message) {
    this.state.shopMessage = String(message ?? "");
    this.refreshShop();
    return this;
  }

  setSelectedUpgrade(id) {
    this.state.selectedUpgrade = id ?? null;
    this.refreshShop();
    return this;
  }

  sync(gameState = {}) {
    if (gameState.mode) {
      this.mode = gameState.mode;
    }
    if (gameState.run) {
      this.state.run = { ...this.state.run, ...gameState.run };
    }
    if (gameState.launch) {
      this.state.launch = { ...this.state.launch, ...gameState.launch };
    }
    if (gameState.results) {
      this.state.results = { ...this.state.results, ...gameState.results };
    }
    if (gameState.message !== undefined) {
      this.state.message = String(gameState.message ?? "");
    }
    if (gameState.shopMessage !== undefined) {
      this.state.shopMessage = String(gameState.shopMessage ?? "");
    }
    if (gameState.selectedUpgrade !== undefined) {
      this.state.selectedUpgrade = gameState.selectedUpgrade;
    }
    this.refresh();
    return this;
  }

  render(gameState = null) {
    if (gameState) {
      this.sync(gameState);
    } else {
      this.refresh();
    }
    return this;
  }

  update(gameState = null) {
    return this.render(gameState);
  }

  refresh() {
    if (!this.dom) {
      return;
    }
    this.setActiveScreen();
    this.refreshMenu();
    this.refreshHUD();
    this.refreshShop();
    this.refreshResults();
  }

  setActiveScreen() {
    if (!this.dom) {
      return;
    }
    const mode = this.mode;
    const activeMap = {
      menu: this.dom.menu,
      hud: this.dom.hud,
      shop: this.dom.shop,
      results: this.dom.results,
    };
    for (const [screenName, element] of Object.entries(activeMap)) {
      element.classList.toggle("is-active", screenName === mode);
    }
  }

  refreshMenu() {
    if (!this.dom) {
      return;
    }
    const progress = this.dom.menu.querySelector("[data-menu-progress]");
    if (progress) {
      const snapshot = this.store.getSnapshot();
      progress.textContent = `Coins: ${fmt(snapshot.coins)} | best distance: ${fmt(snapshot.best.distance)} | upgrades saved locally.`;
    }
  }

  refreshHUD() {
    if (!this.dom) {
      return;
    }
    const run = this.state.run ?? {};
    const read = (keys, fallback = 0) => {
      for (const key of keys) {
        if (run[key] !== undefined) {
          return run[key];
        }
      }
      return fallback;
    };
    const values = {
      distance: statText(read(["distance", "totalDistance", "range"])),
      speed: statText(read(["speed", "velocity"])),
      altitude: statText(read(["altitude", "height"])),
      bounces: statText(read(["bounces", "bounceCount"])),
      coins: statText(this.store.getSnapshot().coins),
    };
    for (const [key, value] of Object.entries(values)) {
      const node = this.dom.hud.querySelector(`[data-stat="${key}"]`);
      if (node) {
        node.textContent = value;
      }
    }
    const notice = this.dom.hud.querySelector("[data-hud-notice]");
    if (notice) {
      const launch = this.state.launch ?? {};
      const message = this.state.message || launch.message || "Launch and steer to build speed.";
      notice.textContent = message;
    }
  }

  refreshShop() {
    if (!this.dom) {
      return;
    }
    const snapshot = this.store.getSnapshot();
    const coins = this.dom.shop.querySelector("[data-shop-coins]");
    if (coins) {
      coins.textContent = fmt(snapshot.coins);
    }
    const status = this.dom.shop.querySelector("[data-shop-status]");
    if (status) {
      status.textContent = this.state.shopMessage || "Spend coins to extend the run.";
    }

    const list = this.dom.shop.querySelector("[data-shop-list]");
    if (!list) {
      return;
    }
    const cards = this.store.getShopEntries();
    list.innerHTML = cards
      .map((entry) => {
        const ratio = entry.maxLevel > 0 ? entry.level / entry.maxLevel : 1;
        const costLabel = entry.cost === null ? "maxed" : `${fmt(entry.cost)} coins`;
        const buttonLabel = entry.cost === null ? "Maxed" : entry.affordable ? "Buy" : "Need coins";
        return `
          <article class="ta-shop-item" data-upgrade="${entry.id}">
            <div>
              <h3>${entry.label}</h3>
              <p style="color:rgba(247,243,234,.72);line-height:1.45;margin-top:6px;">${entry.summary}</p>
            </div>
            <p style="color:rgba(247,243,234,.64);font-size:14px;line-height:1.4;">${entry.effectText}</p>
            <div class="ta-shop-meta">
              <span>Level ${entry.level}/${entry.maxLevel}</span>
              <span>${costLabel}</span>
            </div>
            <div class="ta-meter"><span style="width:${Math.round(ratio * 100)}%;"></span></div>
            <button class="ta-button" type="button" data-buy="${entry.id}" ${entry.cost === null || !entry.affordable ? "disabled" : ""}>${buttonLabel}</button>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("[data-buy]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.buy;
        const result = this.store.buy(id);
        if (result.ok) {
          this.state.shopMessage = `${id} upgraded`;
          this.emit("upgrade", { id, result });
          this.refreshShop();
          this.refreshHUD();
        } else {
          this.state.shopMessage = result.reason === "insufficient-funds" ? "not enough coins" : "upgrade already maxed";
          this.refreshShop();
        }
      });
    });
  }

  refreshResults() {
    if (!this.dom) {
      return;
    }
    const results = this.state.results ?? {};
    const snapshot = this.store.getSnapshot();
    const titleNode = this.dom.results.querySelector("[data-results-title]");
    const messageNode = this.dom.results.querySelector("[data-results-message]");
    if (titleNode) {
      titleNode.textContent = results.win === false ? "Run Failed" : "Run Complete";
    }
    if (messageNode) {
      messageNode.textContent = results.message || this.state.message || "Results appear here after the run ends.";
    }
    const values = {
      distance: statText(results.distance ?? results.totalDistance ?? 0),
      airtime: statText(results.airtime ?? results.airTime ?? 0, "s"),
      speed: statText(results.speed ?? 0),
      bounces: statText(results.bounces ?? results.bounceCount ?? 0),
      score: statText(results.score ?? 0),
      coins: statText(results.coinsEarned ?? results.coins ?? 0),
    };
    for (const [key, value] of Object.entries(values)) {
      const node = this.dom.results.querySelector(`[data-result="${key}"]`);
      if (node) {
        node.textContent = value;
      }
    }
    const bestNode = this.dom.results.querySelector("[data-result='coins']");
    if (bestNode && snapshot) {
      bestNode.title = `Stored coins: ${snapshot.coins}`;
    }
  }

  consumeInput() {
    const snapshot = {
      ...this.input,
      controlVector: { ...this.input.controlVector },
      pointer: { ...this.input.pointer },
    };
    this.input.launchPressed = false;
    this.input.confirmPressed = false;
    this.input.cancelPressed = false;
    this.input.shopPressed = false;
    this.input.menuPressed = false;
    this.input.retryPressed = false;
    return snapshot;
  }

  getInputState() {
    return this.consumeInput();
  }

  pollInput() {
    return this.consumeInput();
  }

  readInput() {
    return this.consumeInput();
  }

  consumeControls() {
    return this.consumeInput();
  }

  getControlState() {
    return this.consumeInput();
  }

  getControls() {
    return this.consumeInput();
  }

  getSteerAxis() {
    return clamp(this.input.controlAxis, -1, 1);
  }

  setTouchSteer(axis) {
    this.input.controlAxis = clamp(axis, -1, 1);
    this.input.controlVector.x = this.input.controlAxis;
    this.input.controlVector.y = 0;
    this.input.leftPressed = this.input.controlAxis < -0.2;
    this.input.rightPressed = this.input.controlAxis > 0.2;
  }

  clearTouchSteer() {
    if (Math.abs(this.input.controlAxis) > 0.5) {
      this.input.controlAxis = 0;
      this.input.controlVector.x = 0;
      this.input.controlVector.y = 0;
    }
    this.input.leftPressed = false;
    this.input.rightPressed = false;
    this.input.upPressed = false;
    this.input.downPressed = false;
  }

  resetInput = () => {
    this.input = defaultInputState();
    this.dragState = { active: false, originX: 0, originY: 0, pointerId: null };
  };

  onKeyDown(event) {
    const code = event.code;
    if (!code) {
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyW", "KeyA", "KeyS", "KeyD", "Escape"].includes(code)) {
      event.preventDefault();
    }

    const firstPress = !this.keyDown?.has(code);
    this.keyDown ??= new Set();
    this.keyDown.add(code);

    if (firstPress && (code === "Space" || code === "Enter")) {
      this.input.launchPressed = true;
      this.input.confirmPressed = true;
    }
    if (firstPress && code === "Escape") {
      this.input.cancelPressed = true;
    }
    if (firstPress && (code === "KeyS" || code === "ArrowDown")) {
      this.input.shopPressed = this.mode === "hud" || this.mode === "menu";
    }
    this.updateKeyboardAxis();
    this.dispatchKeyboardShortcuts(code, firstPress);
  }

  onKeyUp(event) {
    const code = event.code;
    if (this.keyDown) {
      this.keyDown.delete(code);
    }
    this.updateKeyboardAxis();
  }

  updateKeyboardAxis() {
    const keys = this.keyDown ?? new Set();
    const axis =
      (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
      (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
    this.input.controlAxis = axis;
    this.input.controlVector.x = axis;
    this.input.controlVector.y =
      (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) -
      (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);
    this.input.launchHeld = keys.has("Space") || keys.has("Enter");
    this.input.leftPressed = keys.has("ArrowLeft") || keys.has("KeyA");
    this.input.rightPressed = keys.has("ArrowRight") || keys.has("KeyD");
    this.input.upPressed = keys.has("ArrowUp") || keys.has("KeyW");
    this.input.downPressed = keys.has("ArrowDown") || keys.has("KeyS");
  }

  dispatchKeyboardShortcuts(code, firstPress) {
    if (!firstPress) {
      return;
    }
    if (code === "Escape") {
      if (this.mode === "shop") {
        this.dispatch("close-shop");
      } else if (this.mode === "results") {
        this.dispatch("menu");
      } else {
        this.dispatch("menu");
      }
    }
    if (code === "KeyS" || code === "ArrowDown") {
      if (this.mode === "hud") {
        this.dispatch("shop");
      }
    }
  }

  onPointerDown(event) {
    const target = event.target;
    if (target instanceof HTMLButtonElement) {
      return;
    }
    this.dragState.active = true;
    this.dragState.pointerId = event.pointerId;
    this.dragState.originX = event.clientX;
    this.dragState.originY = event.clientY;
    this.input.pointer = {
      x: event.clientX,
      y: event.clientY,
      down: true,
      active: true,
    };
    this.input.leftPressed = false;
    this.input.rightPressed = false;
    this.input.upPressed = false;
    this.input.downPressed = false;
  }

  onPointerMove(event) {
    if (!this.dragState.active || this.dragState.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - this.dragState.originX;
    const dy = event.clientY - this.dragState.originY;
    this.input.pointer = {
      x: event.clientX,
      y: event.clientY,
      down: true,
      active: true,
    };
    this.input.controlAxis = clamp(dx / 90, -1, 1);
    this.input.controlVector.x = clamp(dx / 90, -1, 1);
    this.input.controlVector.y = clamp(-dy / 90, -1, 1);
    this.input.leftPressed = dx < -18;
    this.input.rightPressed = dx > 18;
    this.input.upPressed = dy < -18;
    this.input.downPressed = dy > 18;
  }

  onPointerUp(event) {
    if (this.dragState.pointerId !== null && this.dragState.pointerId !== event.pointerId) {
      return;
    }
    this.dragState.active = false;
    this.dragState.pointerId = null;
    this.input.pointer = {
      x: event.clientX,
      y: event.clientY,
      down: false,
      active: false,
    };
    if (Math.abs(this.input.controlAxis) < 0.05) {
      this.input.controlAxis = 0;
      this.input.controlVector.x = 0;
      this.input.controlVector.y = 0;
    }
  }

  onClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const action = target.dataset.action;
    if (action) {
      this.dispatch(action);
    }
  }

  dispatch(action, payload = null) {
    switch (action) {
      case "start":
        this.mode = "hud";
        break;
      case "shop":
        this.previousMode = this.mode;
        this.mode = "shop";
        break;
      case "close-shop":
        this.mode = this.previousMode && this.previousMode !== "shop" ? this.previousMode : "hud";
        break;
      case "retry":
        this.mode = "hud";
        break;
      case "menu":
        this.mode = "menu";
        break;
      case "launch":
        this.input.launchPressed = true;
        this.input.confirmPressed = true;
        break;
      case "reset-upgrades":
        this.store.reset();
        this.state.shopMessage = "upgrades reset";
        this.mode = "menu";
        break;
      default:
        break;
    }

    this.pendingActions.push({ action, payload });
    this.emit(action, payload);
    this.refresh();
    return { action, payload };
  }

  syncStoreTuning() {
    if (!this.store || typeof this.store.getSnapshot !== "function") {
      return null;
    }
    const tuning = this.store.getSnapshot().tuning ?? null;
    if (!tuning || !this.game) {
      return tuning;
    }

    const game = this.game;
    const methodNames = [
      "setUpgradeTuning",
      "setTuning",
      "setLaunchTuning",
      "applyUpgradeTuning",
      "applyTuning",
    ];
    for (const methodName of methodNames) {
      if (typeof game[methodName] === "function") {
        game[methodName](tuning, this);
        return tuning;
      }
    }

    const targetObjects = [
      game.launchDynamics?.config,
      game.launch?.config,
      game.physics?.config,
      game.config,
    ].filter((candidate) => candidate && typeof candidate === "object");
    for (const target of targetObjects) {
      Object.assign(target, tuning);
    }
    return tuning;
  }

  takePendingActions() {
    const actions = this.pendingActions.slice();
    this.pendingActions.length = 0;
    return actions;
  }

  requestLaunch(payload = null) {
    return this.dispatch("launch", payload);
  }

  requestStart(payload = null) {
    return this.dispatch("start", payload);
  }

  requestShop(payload = null) {
    return this.dispatch("shop", payload);
  }

  requestMenu(payload = null) {
    return this.dispatch("menu", payload);
  }

  requestRetry(payload = null) {
    return this.dispatch("retry", payload);
  }

  requestResetUpgrades(payload = null) {
    return this.dispatch("reset-upgrades", payload);
  }

  setRunSummary(summary = {}) {
    this.state.results = { ...this.state.results, ...summary };
    this.refreshResults();
  }

  setGameState(state = {}) {
    return this.sync(state);
  }

  setLaunchPrompt(message) {
    this.state.launch = { ...this.state.launch, message };
    this.refreshHUD();
  }

  setStatus(message) {
    this.setMessage(message);
  }

  getUpgradeSnapshot() {
    return this.store.getSnapshot();
  }
}

export default UIController;
