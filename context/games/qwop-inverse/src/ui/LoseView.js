export function renderLoseView(root, model, actions) {
  root.className = "overlay overlay--lose";
  const signature = `${model.scene}:${model.failReason ?? "none"}`;
  if (model.scene !== "lose") {
    if (root.childElementCount > 0) root.replaceChildren();
    root.dataset.signature = "hidden";
    return;
  }
  if (root.dataset.signature === signature && root.childElementCount > 0) return;
  root.replaceChildren();
  const card = document.createElement("section");
  card.className = "overlay__panel lose-card";
  card.innerHTML = `
    <img class="lose-art" src="${model.art.burst}" alt="Public-domain burst icon" />
    <div class="lose-note">Irreversible fall</div>
    <h2 class="lose-title"><span>Faceplant.</span> Trial over.</h2>
    <p class="copy">${model.lossCopy}</p>
  `;
  const row = document.createElement("div");
  row.className = "button-row";
  const restart = document.createElement("button");
  restart.className = "button";
  restart.textContent = "Restart";
  restart.addEventListener("click", actions.restart);
  row.append(restart);
  card.append(row);
  root.append(card);
  root.dataset.signature = signature;
}
