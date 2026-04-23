export class HUD {
  constructor() {
    this.element = document.createElement("section");
    this.element.className = "panel panel-hud";
    this.element.innerHTML = `
      <div class="hud-grid">
        <div><span>Score</span><strong data-field="score">0</strong></div>
        <div><span>Combo</span><strong data-field="combo">0</strong></div>
        <div><span>Judgement</span><strong data-field="judgement">-</strong></div>
        <div><span>Hyper-Speed</span><strong data-field="hyperSpeed">Idle</strong></div>
      </div>
    `;
    this.fields = {
      score: this.element.querySelector('[data-field="score"]'),
      combo: this.element.querySelector('[data-field="combo"]'),
      judgement: this.element.querySelector('[data-field="judgement"]'),
      hyperSpeed: this.element.querySelector('[data-field="hyperSpeed"]'),
    };
  }

  render({ state, snapshot = {}, track } = {}) {
    const safeSnapshot = snapshot ?? {};
    const score = safeSnapshot.score ?? 0;
    const combo = safeSnapshot.combo ?? 0;
    const judgement = safeSnapshot.judgement ?? "-";
    const hyperSpeed = safeSnapshot.hyperSpeed ?? "Idle";
    this.element.classList.toggle("is-hidden", state !== "gameplay");
    this.fields.score.textContent = String(score);
    this.fields.combo.textContent = String(combo);
    this.fields.judgement.textContent = judgement;
    this.fields.hyperSpeed.textContent = hyperSpeed;
    this.element.dataset.track = track?.title ?? "";
    this.element.dataset.state = state ?? "boot";
  }
}
