import { MainMenu } from "../ui/MainMenu.js";
import { HUD } from "../ui/HUD.js";
import { SummaryScreen } from "../ui/SummaryScreen.js";
import { BackgroundScene } from "../ui/BackgroundScene.js";
import { GameEngine } from "../game/GameEngine.js";

const defaultTracks = [
  { id: "neo-drive", title: "Neo Drive", artist: "System Static", difficulty: "Pulse", bpm: 168 },
  { id: "glass-rain", title: "Glass Rain", artist: "Arc Voltage", difficulty: "Orbit", bpm: 182 },
  { id: "afterburner", title: "Afterburner", artist: "Night Circuit", difficulty: "Hyper", bpm: 204 },
];

async function loadTracks() {
  try {
    const mod = await import("../data/tracks.js");
    return mod.tracks ?? mod.default ?? defaultTracks;
  } catch {
    return defaultTracks;
  }
}

export class App {
  constructor({ sceneRoot, uiRoot }) {
    this.sceneRoot = sceneRoot;
    this.uiRoot = uiRoot;
    this.state = "boot";
    this.tracks = null;
    this.selectedTrackId = null;
    this.lastSnapshot = {};
    this.lastResults = null;
    this.lastError = null;
    this.hud = new HUD();
    this.background = new BackgroundScene(sceneRoot);
    this.menu = new MainMenu({
      onSelectTrack: (trackId) => this.selectTrack(trackId),
      onStart: () => this.startGame(),
    });
    this.summary = new SummaryScreen({
      onReplay: () => this.showMenu(),
    });
    this.game = new GameEngine({
      sceneRoot,
      onSnapshot: (snapshot) => this.update(snapshot),
      onResults: (results) => this.update({ results }),
    });
    this.handleVisibilityChange = () => {
      if (document.hidden) {
        if (this.state === "gameplay") this.pauseGame();
        return;
      }
      if (this.state === "paused") this.resumeGame();
    };
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.mount();
    this.render();
  }

  async start() {
    this.state = "loading";
    this.render();
    try {
      this.tracks = await loadTracks();
      this.selectedTrackId = this.selectedTrackId ?? this.tracks?.[0]?.id ?? null;
      this.state = "menu";
      this.lastError = null;
    } catch (error) {
      this.tracks = [];
      this.selectedTrackId = null;
      this.lastError = error;
      this.state = "error";
    }
    this.render();
  }

  mount() {
    this.uiRoot.replaceChildren(this.menu.element, this.hud.element, this.summary.element);
  }

  selectTrack(trackId) {
    if (!trackId || ["boot", "loading"].includes(this.state)) return;
    if (this.tracks && !this.tracks.some((track) => track.id === trackId)) return;
    this.selectedTrackId = trackId;
    this.lastError = null;
    this.render();
  }

  async startGame() {
    if (!this.selectedTrackId || ["boot", "loading"].includes(this.state)) return;
    if (this.state === "gameplay") return;
    this.state = "loading";
    this.lastError = null;
    this.render();
    try {
      await this.game.loadTrack(this.selectedTrackId);
      await this.game.start();
      this.state = "gameplay";
      this.render();
    } catch (error) {
      this.lastError = error;
      this.state = "error";
      this.render();
    }
  }

  update(snapshot = {}) {
    this.lastSnapshot = { ...this.lastSnapshot, ...snapshot };
    if (snapshot.results) {
      this.lastResults = snapshot.results;
      this.state = "summary";
    }
    this.render();
  }

  showMenu() {
    this.state = "menu";
    this.lastSnapshot = {};
    this.lastResults = null;
    this.lastError = null;
    this.game.stop?.();
    this.render();
  }

  pauseGame() {
    if (this.state !== "gameplay") return;
    this.game.audio?.pause?.();
    this.game.pause?.();
    this.state = "paused";
    this.render();
  }

  resumeGame() {
    if (this.state !== "paused") return;
    this.game.audio?.play?.(this.lastSnapshot?.timeMicros ? this.lastSnapshot.timeMicros / 1000000 : 0);
    this.game.resume?.();
    this.state = "gameplay";
    this.render();
  }

  render() {
    const tracks = this.tracks ?? [];
    const track = tracks.find((item) => item.id === this.selectedTrackId) ?? tracks[0] ?? null;
    this.menu?.render({
      state: this.state,
      tracks,
      selectedTrackId: track?.id ?? null,
      error: this.lastError,
    });
    this.hud?.render({
      state: this.state,
      snapshot: this.lastSnapshot,
      track,
    });
    this.summary?.render({
      visible: this.state === "summary",
      track,
      results: this.lastResults,
    });
    this.background?.render({
      state: this.state,
      track,
      snapshot: this.lastSnapshot,
    });
    if (this.uiRoot?.dataset) {
      this.uiRoot.dataset.state = this.state;
      this.uiRoot.dataset.error = this.lastError ? "true" : "false";
    }
  }
}
