export class HUD {
  constructor(rootDocument) {
    this.root = rootDocument;
    this.nodes = {
      gold: rootDocument.getElementById("gold-value"),
      goldRate: rootDocument.getElementById("gold-rate-value"),
      pop: rootDocument.getElementById("pop-value"),
      popCap: rootDocument.getElementById("pop-cap-value"),
      selection: rootDocument.getElementById("selection-value"),
      possession: rootDocument.getElementById("possession-value"),
      status: rootDocument.getElementById("status-value"),
      buildMenu: rootDocument.getElementById("base-build-menu"),
      commandMenu: rootDocument.getElementById("unit-command-menu"),
      feed: rootDocument.getElementById("event-feed"),
      overlay: rootDocument.getElementById("result-overlay"),
      overlayTitle: rootDocument.getElementById("overlay-title"),
      overlayBody: rootDocument.getElementById("overlay-body"),
      overlayButton: rootDocument.getElementById("overlay-button"),
    };
    this.handlers = {
      onAction: () => {},
      onRestart: () => {},
    };
  }

  setHandlers(handlers) {
    this.handlers = {
      ...this.handlers,
      ...handlers,
    };

    this.nodes.overlayButton.onclick = () => {
      this.handlers.onRestart();
    };
  }

  render(state) {
    this.nodes.gold.textContent = Math.floor(state.economy.gold).toString();
    this.nodes.goldRate.textContent = state.economy.goldRate.toFixed(2);
    this.nodes.pop.textContent = String(state.economy.population);
    this.nodes.popCap.textContent = String(state.economy.popCap);
    this.nodes.selection.textContent = state.selection.selectedIds.length
      ? `${state.selection.selectedIds.length} unit(s)`
      : "None";

    const possessionId = state.selection.possessionTargetId ?? "None";
    this.nodes.possession.textContent = possessionId;
    this.nodes.status.textContent = state.ui.statusText;

    this.renderActionMenu(
      this.nodes.buildMenu,
      state.ui.buildMenu,
      state.ui.activeBuildId ?? null,
      "build",
    );
    this.renderActionMenu(
      this.nodes.commandMenu,
      state.ui.commandMenu,
      state.ui.activeCommandId,
      "command",
    );

    this.nodes.feed.innerHTML = "";
    for (const item of state.ui.eventFeed) {
      const line = document.createElement("p");
      line.className = "feed-item";
      line.textContent = item;
      this.nodes.feed.append(line);
    }

    this.nodes.overlay.classList.toggle("is-visible", state.ui.overlay.visible);
    this.nodes.overlay.setAttribute("aria-hidden", String(!state.ui.overlay.visible));
    this.nodes.overlayTitle.textContent = state.ui.overlay.title;
    this.nodes.overlayBody.textContent = state.ui.overlay.body;
  }

  renderActionMenu(container, actions, activeId, scope) {
    if (container.dataset.signature === `${scope}:${activeId}:${actions.length}`) {
      for (const button of container.querySelectorAll("button")) {
        button.classList.toggle("is-active", button.dataset.actionId === activeId);
      }
      return;
    }

    container.dataset.signature = `${scope}:${activeId}:${actions.length}`;
    container.innerHTML = "";

    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-button";
      button.dataset.actionId = action.id;
      button.classList.toggle("is-active", action.id === activeId);
      button.innerHTML = `<strong>${action.label}</strong><small>${action.detail}</small>`;
      button.addEventListener("click", () => {
        this.handlers.onAction(scope, action.id);
      });
      container.append(button);
    }
  }
}
