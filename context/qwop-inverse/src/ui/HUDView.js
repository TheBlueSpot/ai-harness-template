export function renderHUDView(root, model) {
  root.replaceChildren();
  root.className = "overlay overlay--hud";
  if (model.scene !== "play") return;
  const card = document.createElement("section");
  card.className = "overlay__panel hud-card";
  card.innerHTML = `
    <div class="hud-label">Run state</div>
    <div class="hud-row"><span>Distance</span><strong class="hud-value">${model.distance.toFixed(1)} m</strong></div>
    <div class="hud-row"><span>Best lean</span><strong class="hud-value hud-value--accent">${model.bestLean.toFixed(2)}</strong></div>
    <div class="hud-row"><span>COM</span><strong class="hud-value">${model.centerOfMass.x.toFixed(1)}, ${model.centerOfMass.y.toFixed(1)}</strong></div>
    <div class="hud-row"><span>Lean angle</span><strong class="hud-value">${model.leanMetrics.angle.toFixed(2)}</strong></div>
    <div class="hud-row"><span>Hurdles</span><strong class="hud-value">${model.hurdles.length}</strong></div>
    <div class="hud-row"><span>Scene</span><strong class="hud-value">${model.status}</strong></div>
  `;
  root.append(card);
}
