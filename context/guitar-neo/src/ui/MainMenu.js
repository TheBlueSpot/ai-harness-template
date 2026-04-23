export class MainMenu {
  constructor({ onSelectTrack, onStart }) {
    this.onSelectTrack = onSelectTrack;
    this.onStart = onStart;
    this.element = document.createElement("section");
    this.element.className = "panel panel-menu";
    this.element.innerHTML = `
      <div class="panel-head">
        <p class="eyebrow">guitar-neo</p>
        <h1>Arcade rhythm runner</h1>
        <p class="lede">Pick a track, arm the lane, and launch into the set.</p>
        <p class="menu-status" data-field="status"></p>
      </div>
      <div class="track-list" role="list"></div>
      <button class="primary-action" type="button">Start Set</button>
    `;
    this.trackList = this.element.querySelector(".track-list");
    this.startButton = this.element.querySelector(".primary-action");
    this.status = this.element.querySelector('[data-field="status"]');
    this.startButton.addEventListener("click", () => this.onStart?.());
  }

  render({ tracks = [], selectedTrackId, state = "menu", error = null } = {}) {
    const loading = state === "loading";
    const statusText =
      state === "loading"
        ? "Loading track..."
        : state === "paused"
          ? "Paused."
          : state === "error"
            ? `Track load failed.${error?.message ? ` ${error.message}` : ""}`
            : "";
    this.element.classList.toggle("is-hidden", !["menu", "loading", "paused", "error"].includes(state));
    this.startButton.disabled = loading;
    this.startButton.textContent = loading ? "Loading..." : "Start Set";
    this.status.textContent = statusText;
    this.trackList.replaceChildren();
    const list = Array.isArray(tracks) ? tracks : [];
    this.trackList.replaceChildren(
      ...list.map((track) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `track-card${track.id === selectedTrackId ? " is-selected" : ""}`;
        button.disabled = loading;
        button.setAttribute("role", "listitem");
        button.innerHTML = `
          <strong>${track.title}</strong>
          <span>${track.artist}</span>
          <span>${track.difficulty} | ${track.bpm} BPM</span>
          <small>${track.provenance ?? "Procedural fallback"}</small>
        `;
        button.addEventListener("click", () => this.onSelectTrack?.(track.id));
        return button;
      })
    );
    this.element.dataset.state = state ?? "boot";
    this.element.dataset.selectedTrackId = selectedTrackId ?? "";
  }
}
