function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function documentCard(doc, active) {
  return `
    <article class="doc-card ${active ? "active" : ""}">
      <div class="doc-head">
        <span>${escapeHtml(doc.label)}</span>
        <span class="doc-pill">${escapeHtml(doc.status)}</span>
      </div>
      <div class="doc-value">${escapeHtml(doc.value)}</div>
    </article>
  `;
}

function ruleCard(rule) {
  return `
    <article class="rule-card">
      <strong>${escapeHtml(rule.label)}</strong>
      <span>${escapeHtml(rule.note)}</span>
    </article>
  `;
}

export function renderFrame(root, frameState) {
  root.meta.textContent = `Day ${frameState.day} | Score ${frameState.score} | Strikes ${frameState.strikes}`;
  root.hud.innerHTML = `
    <div class="hud-stat"><span>Clock</span><strong>${frameState.timeRemaining.toFixed(1)}</strong></div>
    <div class="hud-stat"><span>Queue</span><strong>${frameState.queueIndex + 1}/${frameState.queue.length}</strong></div>
    <div class="hud-stat"><span>Status</span><strong>${escapeHtml(frameState.message)}</strong></div>
  `;
  root.documents.innerHTML = frameState.documents
    .map((doc, index) => documentCard(doc, index === frameState.focusIndex))
    .join("");
  root.rules.innerHTML = frameState.rules.map(ruleCard).join("");
  root.decision.innerHTML = `
    <p>${escapeHtml(frameState.message)}</p>
    <p class="decision-copy">Use the buttons or keys to approve, reject, and cycle the focus without leaving the booth.</p>
  `;
  root.hint.textContent = "Enter start or restart. A/D move focus. Space approves. Backspace rejects.";
  root.overlay.innerHTML = frameState.mode === "menu"
    ? `<div class="overlay-card"><h2>Shift briefing</h2><p>Read the stack, compare the rules, then decide.</p><p>Press Enter to open the booth.</p></div>`
    : frameState.mode === "clear"
      ? `<div class="overlay-card success"><h2>Shift clear</h2><p>You processed enough visitors.</p><p>Press Enter to run another shift.</p></div>`
      : frameState.mode === "fail"
        ? `<div class="overlay-card danger"><h2>Shift failed</h2><p>The line broke your run.</p><p>Press Enter to restart.</p></div>`
        : "";
}
