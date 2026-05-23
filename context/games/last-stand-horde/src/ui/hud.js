export function syncHud(frame = {}, refs = {}) {
  setText(refs.phaseValue, formatPhase(frame.phase ?? "menu"));
  setText(refs.dayValue, `${formatCount(frame.day ?? 1)} / 4`);
  setText(refs.nightValue, formatPercent(frame.clockRatio ?? frame.night ?? 0));
  setText(refs.scrapValue, formatCount(frame.scrap ?? 0));
  setText(refs.ammoValue, formatCount(frame.ammo ?? 0));
  setText(refs.barricadeValue, formatPercent(frame.barricade?.hpRatio ?? 1));
  setText(refs.survivorsValue, `${formatPopulation(frame.survivorsAlive ?? 0, frame.survivorsTotal ?? 0)} | Score ${formatCount(frame.score ?? 0)}`);
  setText(refs.statusValue, frame.status ?? frame.message ?? "Hold the line.");

  if (refs.restartEyebrow) {
    refs.restartEyebrow.textContent = frame.phase === "win" ? "victory" : "run ended";
  }
  if (refs.restartTitle) {
    refs.restartTitle.textContent = frame.phase === "win" ? "Dawn broke." : "The barricade fell.";
  }
  if (refs.restartCopy) {
    refs.restartCopy.textContent = frame.message ?? "Restart and try again.";
  }
}

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function formatPhase(phase) {
  return String(phase).replace(/^\w/, (char) => char.toUpperCase());
}

function formatCount(value) {
  return String(Math.max(0, Math.round(Number(value) || 0)));
}

function formatPercent(value) {
  return `${Math.max(0, Math.round((Number(value) || 0) * 100))}%`;
}

function formatPopulation(alive, total) {
  return `${formatCount(alive)} / ${formatCount(total)}`;
}
