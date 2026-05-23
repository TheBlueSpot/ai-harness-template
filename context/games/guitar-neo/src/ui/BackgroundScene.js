export class BackgroundScene {
  constructor(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="bg-layer bg-layer-a"></div>
      <div class="bg-layer bg-layer-b"></div>
      <div class="bg-energy"></div>
    `;
    this.energy = this.root.querySelector(".bg-energy");
  }

  render({ state, track, snapshot = {} }) {
    this.root.dataset.state = state;
    this.root.dataset.track = track?.title ?? "";
    const intensity = Math.max(0, Math.min(1, snapshot.intensity ?? (state === "gameplay" ? 0.45 : 0.15)));
    this.root.style.setProperty("--bg-intensity", intensity.toFixed(3));
    const bins = snapshot.frequencyBins ?? [];
    const activeBins = bins.slice(0, 16);
    const energy = activeBins.length ? activeBins.reduce((sum, value) => sum + value, 0) / activeBins.length : intensity;
    this.energy.style.transform = `scale(${1 + energy * 0.3})`;
    this.energy.style.opacity = String(0.18 + energy * 0.35);
  }
}
