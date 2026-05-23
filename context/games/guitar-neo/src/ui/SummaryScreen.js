export class SummaryScreen {
  constructor({ onReplay }) {
    this.onReplay = onReplay;
    this.element = document.createElement("section");
    this.element.className = "panel panel-summary";
    this.element.innerHTML = `
      <div class="panel-head">
        <p class="eyebrow">results</p>
        <h2>Set complete</h2>
      </div>
      <div class="summary-stats">
        <div><span>Score</span><strong data-field="score">0</strong></div>
        <div><span>Combo</span><strong data-field="combo">0</strong></div>
        <div><span>Best Combo</span><strong data-field="maxCombo">0</strong></div>
        <div><span>Accuracy</span><strong data-field="accuracy">0%</strong></div>
        <div><span>Perfect</span><strong data-field="perfect">0</strong></div>
        <div><span>Great</span><strong data-field="great">0</strong></div>
        <div><span>Miss</span><strong data-field="miss">0</strong></div>
      </div>
      <button class="primary-action" type="button">Replay</button>
    `;
    this.button = this.element.querySelector(".primary-action");
    this.button.addEventListener("click", () => this.onReplay?.());
    this.fields = {
      accuracy: this.element.querySelector('[data-field="accuracy"]'),
      perfect: this.element.querySelector('[data-field="perfect"]'),
      great: this.element.querySelector('[data-field="great"]'),
      miss: this.element.querySelector('[data-field="miss"]'),
      score: this.element.querySelector('[data-field="score"]'),
      combo: this.element.querySelector('[data-field="combo"]'),
      maxCombo: this.element.querySelector('[data-field="maxCombo"]'),
    };
  }

  render({ visible, track, results } = {}) {
    this.element.classList.toggle("is-hidden", !visible);
    this.element.dataset.track = track?.title ?? "";
    const stats = results ?? {};
    this.fields.accuracy.textContent = `${Math.round(stats.accuracy ?? 0)}%`;
    this.fields.perfect.textContent = String(stats.breakdown?.perfect ?? 0);
    this.fields.great.textContent = String(stats.breakdown?.great ?? 0);
    this.fields.miss.textContent = String(stats.breakdown?.miss ?? 0);
    this.fields.score.textContent = String(stats.score ?? 0);
    this.fields.combo.textContent = String(stats.combo ?? 0);
    this.fields.maxCombo.textContent = String(stats.maxCombo ?? 0);
    this.element.dataset.visible = visible ? "true" : "false";
  }
}
