function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

function getRhythmLabel(frameState) {
  const cadence = frameState.runner?.cadenceMeter ?? 0;
  const chain = Math.round(frameState.runner?.strideChain ?? 0);
  if (cadence >= 0.85) return `locked x${Math.max(1, chain)}`;
  if (cadence >= 0.45) return "building";
  return "flat";
}

function renderMenu(root, frameState) {
  root.innerHTML = "";
  if ((frameState.phase ?? "menu") !== "menu") return;

  const card = document.createElement("section");
  card.className = "overlay__panel menu-card";
  card.innerHTML = `
    <div class="menu-kicker">Ragdoll training</div>
    <h1 class="title">QWOP <strong>Ragdoll</strong></h1>
    <p class="copy">Keep the runner upright, cover distance, and recover fast after a wipeout.</p>
    <p class="copy">Use the leg pairs to shift weight, but real speed comes from alternating left and right on a steady beat.</p>
    <div class="menu-meta">
      <span class="menu-chip">Q/W left leg</span>
      <span class="menu-chip">O/P right leg</span>
      <span class="menu-chip">Enter or Space starts</span>
      <span class="menu-chip">R restarts</span>
    </div>
  `;
  root.append(card);
}

function renderStatus(root, frameState) {
  root.innerHTML = "";
  const phase = frameState.phase ?? "menu";
  if (phase === "menu") return;

  const card = document.createElement("section");
  card.className = "overlay__panel status-card";
  const title = phase === "finished" ? "Finish" : phase === "fallen" ? "Fail" : "Run";
  card.innerHTML = `
    <div class="status-label">Session</div>
    <h2 class="status-title">${title === "Fail" ? `<span>${title}</span>` : `<strong>${title}</strong>`}</h2>
    <p class="status-note">${frameState.message ?? frameState.status ?? "Keep moving."}</p>
  `;
  root.append(card);
}

export function renderHud(dom, frameState = {}) {
  const hud = frameState.hud ?? {};
  const phase = frameState.phase ?? "menu";
  const status = frameState.status ?? phase;

  if (dom.menuRoot) renderMenu(dom.menuRoot, frameState);
  if (dom.statusRoot) renderStatus(dom.statusRoot, frameState);

  if (!dom.hudRoot) return;
  dom.hudRoot.innerHTML = "";
  if (phase === "menu") return;

  const card = document.createElement("section");
  card.className = "overlay__panel hud-card";
  card.innerHTML = `
    <div class="hud-label">Live</div>
    <div class="hud-grid">
      <div class="hud-row"><span>Distance</span><span class="hud-value">${Math.round(hud.distance ?? frameState.distance ?? 0)}</span></div>
      <div class="hud-row"><span>Time</span><span class="hud-value">${Math.round(hud.time ?? frameState.time ?? 0)}s</span></div>
      <div class="hud-row"><span>Rhythm</span><span class="hud-value">${getRhythmLabel(frameState)}</span></div>
      <div class="hud-row"><span>Status</span><span class="hud-value hud-value--accent">${String(status)}</span></div>
    </div>
  `;
  dom.hudRoot.append(card);
}
