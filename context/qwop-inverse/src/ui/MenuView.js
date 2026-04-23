export function renderMenuView(root, model, actions) {
  root.className = "overlay overlay--menu";
  if (model.scene !== "menu") {
    if (root.childElementCount > 0) root.replaceChildren();
    root.dataset.scene = "hidden";
    return;
  }
  if (root.dataset.scene === "menu" && root.childElementCount > 0) return;
  const card = document.createElement("section");
  card.className = "overlay__panel menu-card";
  card.innerHTML = `
    <img class="menu-art" src="${model.art.runner}" alt="Public-domain runner icon" />
    <div class="menu-kicker">Inverse training module</div>
    <h1 class="title">QWOP <strong>in reverse</strong></h1>
    <p class="copy">Pace the runner, keep the lean under control, and try not to overcorrect into a spectacular fall.</p>
    <p class="copy copy--small">Q/A: left thigh. W/S: right thigh. O/K: left calf. P/L: right calf. Z/, and X/. drive the soles. Enter starts.</p>
  `;
  const row = document.createElement("div");
  row.className = "button-row";
  const start = document.createElement("button");
  start.className = "button";
  start.textContent = "Start run";
  start.addEventListener("click", actions.start);
  row.append(start);
  card.append(row);
  root.append(card);
  root.dataset.scene = "menu";
}
