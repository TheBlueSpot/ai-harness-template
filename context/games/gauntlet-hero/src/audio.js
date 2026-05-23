const AudioCtx = window.AudioContext || window.webkitAudioContext;

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.2), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.nextBeatAt = 0;
    this.musicMode = "";
    this.musicFloor = 0;
  }

  unlock() {
    if (!AudioCtx) {
      return;
    }

    if (!this.context) {
      this.context = new AudioCtx();
      this.master = this.context.createGain();
      this.music = this.context.createGain();
      this.sfx = this.context.createGain();
      this.noiseBuffer = createNoiseBuffer(this.context);
      this.master.gain.value = 0.18;
      this.music.gain.value = 0.0001;
      this.sfx.gain.value = 1;
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    this.unlocked = true;
  }

  sync(frame, events) {
    if (!this.unlocked || !this.context || this.context.state !== "running") {
      return;
    }

    this.syncMusic(frame);
    for (const event of events) {
      this.handleEvent(event);
    }
  }

  syncMusic(frame) {
    const now = this.context.currentTime;
    const mode = frame.mode;
    const floor = Math.max(1, frame.floorNumber || 1);
    if (mode !== this.musicMode || floor !== this.musicFloor) {
      this.musicMode = mode;
      this.musicFloor = floor;
      this.nextBeatAt = now;
    }

    const targetGain = mode === "playing" ? 0.14 : mode === "intermission" ? 0.09 : 0.06;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.linearRampToValueAtTime(targetGain, now + 0.12);

    const beat = mode === "playing" ? Math.max(0.28, 0.42 - Math.min(0.1, floor * 0.02)) : 0.56;
    const root = 110 * 2 ** (Math.min(3, floor - 1) / 12);
    while (this.nextBeatAt < now + 0.8) {
      if (mode === "playing") {
        this.tone(this.nextBeatAt, root * 0.5, 0.16, 0.035, "triangle", 0, this.music);
        this.tone(this.nextBeatAt + beat * 0.48, root, 0.11, 0.025, "triangle", 0, this.music);
        this.tone(this.nextBeatAt + beat * 0.78, root * 1.5, 0.08, 0.018, "sine", 0, this.music);
      } else {
        this.tone(this.nextBeatAt, root * 0.5, 0.34, 0.026, "sine", 0, this.music);
        this.tone(this.nextBeatAt + beat * 0.45, root * 0.75, 0.22, 0.018, "triangle", 0, this.music);
      }
      this.nextBeatAt += beat;
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "attack-swing":
        this.sweep(260, 180, 0.08, 0.045, "triangle", event.pan);
        break;
      case "attack-shot":
        this.sweep(780, 420, 0.1, 0.04, "square", event.pan);
        break;
      case "attack-hit":
      case "projectile-hit":
        this.noise(0.05, 0.018, 1800, 1.2, event.pan);
        this.tone(this.now(), 320, 0.05, 0.024, "triangle", event.pan);
        break;
      case "enemy-down":
        this.sweep(240, 140, 0.12, 0.038, "sawtooth", event.pan);
        this.noise(0.08, 0.02, 1200, 0.8, event.pan);
        break;
      case "generator-pulse":
        this.tone(this.now(), 180, 0.08, 0.016, "sine", event.pan);
        break;
      case "generator-break":
        this.sweep(220, 820, 0.18, 0.06, "sawtooth", event.pan);
        this.noise(0.14, 0.035, 950, 1.1, event.pan);
        break;
      case "hero-hurt":
        this.sweep(200, 90, 0.16, 0.065, "sawtooth", event.pan);
        this.noise(0.12, 0.032, 700, 0.9, event.pan);
        break;
      case "key-grab":
        this.tone(this.now(), 660, 0.1, 0.04, "triangle", event.pan);
        this.tone(this.now() + 0.04, 990, 0.08, 0.032, "triangle", event.pan);
        break;
      case "door-open":
        this.sweep(180, 520, 0.12, 0.038, "sine", event.pan);
        break;
      case "floor-clear":
        this.tone(this.now(), 392, 0.12, 0.045, "triangle", 0);
        this.tone(this.now() + 0.06, 523.25, 0.12, 0.038, "triangle", 0);
        this.tone(this.now() + 0.12, 659.25, 0.13, 0.034, "triangle", 0);
        break;
      case "relic-pick":
        this.tone(this.now(), 523.25, 0.1, 0.03, "triangle", 0);
        this.tone(this.now() + 0.05, 783.99, 0.14, 0.038, "triangle", 0);
        break;
      case "hero-down":
        this.sweep(180, 55, 0.36, 0.085, "sawtooth", event.pan);
        this.noise(0.2, 0.03, 480, 0.7, event.pan);
        break;
      default:
        break;
    }
  }

  now() {
    return this.context.currentTime;
  }

  tone(at, frequency, duration, gain, type, pan = 0, destination = this.sfx) {
    if (!this.context || !destination) {
      return;
    }
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    const stereo = this.context.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    stereo.pan.setValueAtTime(clamp(pan || 0, -0.85, 0.85), at);
    osc.connect(amp);
    amp.connect(stereo);
    stereo.connect(destination);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  sweep(from, to, duration, gain, type, pan = 0) {
    if (!this.context) {
      return;
    }
    const at = this.now();
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    const stereo = this.context.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + duration);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    stereo.pan.setValueAtTime(clamp(pan || 0, -0.85, 0.85), at);
    osc.connect(amp);
    amp.connect(stereo);
    stereo.connect(this.sfx);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  noise(duration, gain, frequency, q, pan = 0) {
    if (!this.context || !this.noiseBuffer) {
      return;
    }
    const at = this.now();
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    const stereo = this.context.createStereoPanner();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, at);
    filter.Q.setValueAtTime(q, at);
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    stereo.pan.setValueAtTime(clamp(pan || 0, -0.85, 0.85), at);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(stereo);
    stereo.connect(this.sfx);
    source.start(at);
    source.stop(at + duration);
  }
}
