export class SfxBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.unlocked = false;
  }

  unlock() {
    const ctx = this.#ensureContext();
    if (!ctx) {
      return false;
    }
    this.unlocked = true;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return true;
  }

  playDrill() {
    const ctx = this.#ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = "sawtooth";
    sub.type = "triangle";
    osc.frequency.setValueAtTime(96, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
    sub.frequency.setValueAtTime(48, now);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(180, now);
    filter.Q.value = 4.5;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    osc.start(now);
    sub.start(now);
    osc.stop(now + 0.18);
    sub.stop(now + 0.18);
    this.#burst(0.025, 0.06, 0.02, 0.14, "highpass", 1100);
  }

  playHit() {
    const ctx = this.#ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const ring = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = "square";
    ring.type = "triangle";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(74, now + 0.1);
    ring.frequency.setValueAtTime(252, now);
    ring.frequency.exponentialRampToValueAtTime(168, now + 0.12);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(520, now);
    filter.Q.value = 8;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(filter);
    ring.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    osc.start(now);
    ring.start(now);
    osc.stop(now + 0.2);
    ring.stop(now + 0.2);
    this.#burst(0.05, 0.12, 0.02, 0.12, "bandpass", 280);
  }

  playWarning() {
    const ctx = this.#ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "sine";
    osc.frequency.setValueAtTime(430, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.16);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.26);
    this.#burst(0.02, 0.05, 0.02, 0.18, "highpass", 1500);
  }

  playDeath() {
    const ctx = this.#ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const boom = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    boom.type = "sawtooth";
    sub.type = "sine";
    boom.frequency.setValueAtTime(98, now);
    boom.frequency.exponentialRampToValueAtTime(24, now + 0.44);
    sub.frequency.setValueAtTime(52, now);
    sub.frequency.exponentialRampToValueAtTime(18, now + 0.5);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(260, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.2);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    boom.connect(filter);
    sub.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    boom.start(now);
    sub.start(now);
    boom.stop(now + 0.74);
    sub.stop(now + 0.74);
    this.#burst(0.12, 0.24, 0.04, 0.42, "lowpass", 260);
  }

  uiAccept() {
    this.playWarning();
  }

  drill() {
    this.playDrill();
  }

  mine() {
    this.playHit();
  }

  warning() {
    this.playWarning();
  }

  death() {
    this.playDeath();
  }

  #ensureContext() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) {
        return null;
      }
      this.ctx = new AudioCtor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.36;
      this.master.connect(this.ctx.destination);
      this.noise = this.#createNoiseBuffer();
    }

    if (this.unlocked && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  #burst(attack, peak, sustain, release, filterType, cutoff) {
    const ctx = this.#ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise ?? this.#createNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.value = 0.9;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(peak, now + attack);
    amp.gain.exponentialRampToValueAtTime(sustain, now + attack + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(now);
    source.stop(now + attack + release + 0.04);
  }

  #createNoiseBuffer() {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * 1.2));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

export class SFX extends SfxBus {}
