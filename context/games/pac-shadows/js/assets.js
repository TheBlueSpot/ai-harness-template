import { PAC_SHADOWS_ASSET_MANIFEST } from "./asset-manifest.js";

export const ASSET_MANIFEST = PAC_SHADOWS_ASSET_MANIFEST;

export const createAssetCatalog = async (manifest = ASSET_MANIFEST) => {
  const images = await loadImages(manifest.images ?? []);
  const sounds = await loadSounds(manifest.sfx ?? []);
  return { manifest, images, sounds };
};

const loadImages = async (entries) => {
  const pairs = await Promise.all(
    entries.map(async (entry) => [entry.id, await loadImage(entry)]),
  );
  return Object.fromEntries(pairs);
};

const loadSounds = async (entries) => {
  const pairs = await Promise.all(entries.map(async (entry) => [entry.id, await loadSound(entry)]));
  return Object.fromEntries(pairs);
};

const loadImage = (entry) =>
  new Promise((resolve) => {
    if (!entry.path) {
      resolve(createFallbackImage(entry));
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(createFallbackImage(entry));
    image.src = entry.path;
  });

const loadSound = async (entry) => {
  const element = createAudioElement(entry.path);
  return {
    id: entry.id,
    path: entry.path,
    label: entry.label,
    sourceUrl: entry.sourceUrl,
    element,
    play(audio, options = {}) {
      audio?.playClip(this, options);
    }
  };
};

const createAudioElement = (path) => {
  const audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  if (path) {
    audio.src = path;
  }
  return audio;
};

const createFallbackImage = (entry) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const palette = {
    "maze-floor": ["#141d34", "#0d1628"],
    "maze-wall": ["#25355f", "#0b1020"],
    player: ["#7ef8ff", "#18314a"],
    ghost: ["#ff7b7b", "#3d1220"],
    particle: ["#f7f4ea", "#52606d"],
    "spirit-smoke": ["#a0ffef", "#1c3142"],
    "ui-panel": ["#1d2744", "#0c1020"]
  };
  const [base, shadow] = palette[entry.id] ?? ["#8a8f9c", "#202634"];
  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, base);
  gradient.addColorStop(1, shadow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "700 14px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(entry.label, 64, 60);
  ctx.font = "400 11px Trebuchet MS";
  ctx.fillText("fallback", 64, 82);
  return canvas;
};

export class AudioFallback {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) {
        return null;
      }
      this.ctx = new AudioCtor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.08;
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    return this.ctx;
  }

  playClip(sound, options = {}) {
    this.ensureContext();
    const element = sound?.element;
    if (element) {
      const playback = element.cloneNode(true);
      playback.volume = clamp(options.volume ?? 1, 0, 1);
      const playResult = playback.play();
      if (playResult?.catch) {
        playResult.catch(() => this.playFallbackTone(sound.id, options));
      }
      return;
    }

    this.playFallbackTone(sound?.id ?? "fallback", options);
  }

  playFallbackTone(tag, options = {}) {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) {
      return;
    }

    const oscillator = ctx.createOscillator();
    const amp = ctx.createGain();
    const now = ctx.currentTime;
    const pitch = {
      "menu-start": 320,
      step: 180,
      alert: 120,
      win: 520,
      lose: 90,
      "ghost-alert": 270,
      "spirit-death": 420
    }[tag] ?? 260;
    const volume = clamp(options.volume ?? 0.12, 0, 0.22);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * 1.55, now + 0.16);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(amp);
    amp.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
