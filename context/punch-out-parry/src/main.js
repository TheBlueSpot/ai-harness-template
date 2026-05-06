import { Game } from "./Game.js";

class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.droneGain = null;
    this.droneOsc = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.phase = 1;
    this.danger = false;
    this.counterOpen = false;
  }

  ensureContext() {
    if (this.context) {
      return this.context;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    const context = new AudioContextClass();
    const master = context.createGain();
    const musicGain = context.createGain();
    const sfxGain = context.createGain();
    const droneGain = context.createGain();
    const compressor = context.createDynamicsCompressor();

    master.gain.value = 0.22;
    musicGain.gain.value = 0.1;
    sfxGain.gain.value = 0.18;
    droneGain.gain.value = 0.016;

    musicGain.connect(master);
    sfxGain.connect(master);
    droneGain.connect(master);
    master.connect(compressor);
    compressor.connect(context.destination);

    const droneOsc = context.createOscillator();
    const droneFilter = context.createBiquadFilter();
    droneOsc.type = "triangle";
    droneOsc.frequency.value = 58;
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 180;
    droneOsc.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneOsc.start();

    this.context = context;
    this.master = master;
    this.musicGain = musicGain;
    this.sfxGain = sfxGain;
    this.droneGain = droneGain;
    this.droneOsc = droneOsc;
    this.startMusicLoop();
    return context;
  }

  startMusicLoop() {
    if (this.musicTimer !== null) {
      return;
    }
    this.musicTimer = window.setInterval(() => this.tickMusic(), 320);
  }

  async unlock() {
    const context = this.ensureContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return;
      }
    }
  }

  voice({ duration, frequency, gain, sweep = frequency, type = "sine" }) {
    const context = this.context;
    if (!context || context.state !== "running") {
      return;
    }
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, sweep), context.currentTime + duration);
    envelope.gain.setValueAtTime(0.0001, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(gain, context.currentTime + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(this.sfxGain);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  musicVoice(frequency, duration, gain, type = "square") {
    const context = this.context;
    if (!context || context.state !== "running") {
      return;
    }
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = 520;
    envelope.gain.setValueAtTime(0.0001, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(gain, context.currentTime + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.musicGain);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  tickMusic() {
    const context = this.context;
    if (!context || context.state !== "running") {
      return;
    }
    const root = this.phase === 1 ? 92 : this.phase === 2 ? 104 : 116;
    const pattern = this.phase === 1 ? [0, 3, 7, 10] : this.phase === 2 ? [0, 5, 7, 12] : [0, 7, 10, 14];
    const interval = pattern[this.musicStep % pattern.length];
    const frequency = root * 2 ** (interval / 12);
    const accent = this.counterOpen ? 0.06 : this.danger ? 0.048 : 0.034;

    this.musicVoice(frequency, 0.19, accent, "square");
    if (this.musicStep % 2 === 0 || this.counterOpen) {
      this.musicVoice(root * 0.5, 0.22, accent * 0.9, "triangle");
    }

    this.droneOsc.frequency.setTargetAtTime(root * 0.62, context.currentTime, 0.16);
    this.droneGain.gain.setTargetAtTime(this.counterOpen ? 0.024 : this.danger ? 0.02 : 0.015, context.currentTime, 0.18);
    this.musicStep += 1;
  }

  sync(game) {
    this.phase = game.opponent.phase;
    this.danger = game.mode === "playing" && game.player.hp <= 2;
    this.counterOpen = game.mode === "playing" && game.opponent.counterWindow > 0;

    if (!this.context || this.context.state !== "running") {
      return;
    }
    this.musicGain.gain.setTargetAtTime(game.mode === "playing" ? 0.14 : 0.05, this.context.currentTime, 0.12);
    this.master.gain.setTargetAtTime(this.danger ? 0.25 : 0.22, this.context.currentTime, 0.2);
  }

  handle(event) {
    if (event.type === "start") {
      this.unlock();
      this.voice({ duration: 0.18, frequency: 140, gain: 0.11, sweep: 220, type: "triangle" });
      return;
    }
    if (!this.context || this.context.state !== "running") {
      return;
    }

    switch (event.type) {
      case "cue":
        this.voice({
          duration: 0.09,
          frequency: event.cue === "duck" ? 240 : 300,
          gain: 0.05,
          sweep: event.cue === "duck" ? 190 : 360,
          type: "square",
        });
        break;
      case "parry":
        this.voice({ duration: 0.1, frequency: 720, gain: 0.12, sweep: 880, type: "square" });
        this.voice({ duration: 0.18, frequency: 420, gain: 0.06, sweep: 660, type: "triangle" });
        break;
      case "guard":
        this.voice({ duration: 0.08, frequency: 170, gain: 0.05, sweep: 140, type: "sawtooth" });
        break;
      case "hit":
        this.voice({
          duration: event.heavy ? 0.2 : 0.14,
          frequency: event.attackType === "star" ? 140 : event.heavy ? 120 : 180,
          gain: event.attackType === "star" ? 0.16 : event.heavy ? 0.12 : 0.08,
          sweep: event.attackType === "star" ? 70 : 90,
          type: event.attackType === "star" ? "sawtooth" : "triangle",
        });
        break;
      case "playerHit":
        this.voice({ duration: 0.22, frequency: 220, gain: 0.12, sweep: 70, type: "sawtooth" });
        break;
      case "phase":
        this.voice({ duration: 0.18, frequency: 480, gain: 0.09, sweep: 620, type: "triangle" });
        this.voice({ duration: 0.24, frequency: 240, gain: 0.06, sweep: 300, type: "square" });
        break;
      case "win":
        window.setTimeout(() => this.voice({ duration: 0.18, frequency: 330, gain: 0.08, sweep: 420, type: "triangle" }), 0);
        window.setTimeout(() => this.voice({ duration: 0.18, frequency: 440, gain: 0.08, sweep: 540, type: "triangle" }), 120);
        window.setTimeout(() => this.voice({ duration: 0.24, frequency: 660, gain: 0.1, sweep: 780, type: "triangle" }), 240);
        break;
      case "lose":
        this.voice({ duration: 0.4, frequency: 210, gain: 0.11, sweep: 48, type: "sawtooth" });
        break;
      default:
        break;
    }
  }
}

const canvas = document.getElementById("game");
const hud = document.getElementById("hud");
const overlay = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const audio = new AudioEngine();

const input = {
  down: new Set(),
  pressed: new Set(),
  isDown(key) {
    return this.down.has(key);
  },
  consumePressed(key) {
    if (!this.pressed.has(key)) {
      return false;
    }
    this.pressed.delete(key);
    return true;
  },
  clearPressed() {
    this.pressed.clear();
  },
  reset() {
    this.down.clear();
    this.pressed.clear();
  },
};

window.addEventListener("keydown", (event) => {
  const { key } = event;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter", "x", "X", "z", "Z"].includes(key)) {
    event.preventDefault();
  }
  audio.unlock();
  if (!input.down.has(key)) {
    input.pressed.add(key);
  }
  input.down.add(key);
});

window.addEventListener("keyup", (event) => {
  input.down.delete(event.key);
});

window.addEventListener("blur", () => {
  input.reset();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    input.reset();
  }
});

const game = new Game({
  onEvent(event) {
    audio.handle(event);
  },
});

function renderShell() {
  hud.innerHTML = game.getHUDHTML();
  overlay.innerHTML = game.isOverlayVisible() ? game.getOverlayHTML() : "";
}

let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  game.update(input, dt);
  audio.sync(game);
  ctx.save();
  game.draw(ctx);
  ctx.restore();
  renderShell();
  input.clearPressed();
  requestAnimationFrame(frame);
}

renderShell();
requestAnimationFrame(frame);
