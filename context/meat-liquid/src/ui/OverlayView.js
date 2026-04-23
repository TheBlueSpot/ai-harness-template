function statBlock(label, value, emphasis = false) {
  return `
    <div class="stat">
      <span class="stat-label">${label}</span>
      <span class="stat-value${emphasis ? " is-emphasis" : ""}">${value}</span>
    </div>
  `;
}

function overlayPanel({ eyebrow, title, copy, stats, actionLabel, actionId, hint }) {
  return `
    <section class="overlay-panel">
      <span class="overlay-eyebrow">${eyebrow}</span>
      <h2 class="overlay-title">${title}</h2>
      <p class="overlay-copy">${copy}</p>
      <div class="overlay-stats">${stats}</div>
      <div class="overlay-actions">
        <button type="button" class="button primary" data-action="${actionId}">${actionLabel}</button>
      </div>
      <p class="overlay-hint">${hint}</p>
    </section>
  `;
}

export function renderMenuOverlay(viewModel = {}) {
  return overlayPanel({
    eyebrow: "Super Meat Boy: Liquid Velocity",
    title: "Learn the route. Follow the dead.",
    copy: "Each failed run stays behind as a ghost. Use wall-slides, frame-cut jumps, and corner kicks to outrun the pileup.",
    stats: [
      statBlock("Route", viewModel.currentLevel?.name ?? "First Drop"),
      statBlock("Total Deaths", viewModel.counters?.totalDeaths ?? 0, true),
    ].join(""),
    actionLabel: "Start Run",
    actionId: "start",
    hint: "Jump or Enter also starts the run.",
  });
}

export function renderLoseOverlay(viewModel = {}) {
  return overlayPanel({
    eyebrow: "Failure Recorded",
    title: "The swarm got thicker.",
    copy: "That death is now part of the route map. Restart and weave through your own bad line.",
    stats: [
      statBlock("Current Route", viewModel.currentLevel?.name ?? "Unknown"),
      statBlock("Total Deaths", viewModel.counters?.totalDeaths ?? 0, true),
    ].join(""),
    actionLabel: "Retry",
    actionId: "retry",
    hint: "Press jump, Enter, or click Retry.",
  });
}

export function renderWinOverlay(viewModel = {}) {
  return overlayPanel({
    eyebrow: "Run Complete",
    title: "The gate opened.",
    copy: "The campaign is clear, but every recorded death is still hanging in the cave behind you.",
    stats: [
      statBlock("Final Route", viewModel.currentLevel?.name ?? "Unknown"),
      statBlock("Total Deaths", viewModel.counters?.totalDeaths ?? 0, true),
    ].join(""),
    actionLabel: "Play Again",
    actionId: "play-again",
    hint: "Jump, Enter, or click Play Again to reset to route one.",
  });
}
