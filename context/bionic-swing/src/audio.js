const AudioCtx = window.AudioContext || window.webkitAudioContext;

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.music = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.nextMusicTime = 0;
    this.musicMode = "";
    this.musicStage = -1;
    this.flowNoise = null;
    this.flowNoiseFilter = null;
    this.flowNoiseGain = null;
    this.flowTone = null;
    this.flowToneGain = null;
    this.musicDuckUntil = 0;
    this.musicDuckAmount = 0;
    this.lastFireAt = -Infinity;
    this.lastWindupAt = -Infinity;
  }

  unlock() {
    if (!AudioCtx) {
      return;
    }

    if (!this.context) {
      this.context = new AudioCtx();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.music = this.context.createGain();
      this.music.gain.value = 0.16;
      this.music.connect(this.master);
      this.master.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      this.noiseBuffer = createNoiseBuffer(this.context);
      this.installFlowBed();
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }
    this.unlocked = true;
  }

  sync(frame, events) {
    if (!this.unlocked || !this.context || !this.master || !this.music) {
      return;
    }

    this.handleFlowBed(frame);
    this.handleMusic(frame);
    for (const event of events) {
      this.handleEvent(event);
    }
  }

  handleMusic(frame) {
    const mode = frame.mode === "playing" ? "playing" : frame.mode;
    const stage = frame.stageIndex ?? 1;
    const now = this.context.currentTime;
    if (mode !== this.musicMode || stage !== this.musicStage) {
      this.musicMode = mode;
      this.musicStage = stage;
      this.nextMusicTime = now;
    }

    const playingGain = 0.13 + Math.min(0.05, (stage - 1) * 0.012);
    const targetGain = mode === "playing" ? playingGain : 0.09;
    const ducked =
      mode === "playing" && now < this.musicDuckUntil
        ? targetGain * Math.max(0.28, 1 - this.musicDuckAmount)
        : targetGain;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setValueAtTime(this.music.gain.value, now);
    this.music.gain.linearRampToValueAtTime(ducked, now + 0.08);

    if (mode !== "playing") {
      if (mode === "down" || mode === "win") {
        return;
      }
    }

    if (mode === "down" || mode === "win") {
      return;
    }

    const beat = mode === "menu" ? 0.54 : 0.36;
    const roots = [110, 123.47, 130.81, 146.83, 164.81];
    const root = roots[Math.max(0, Math.min(roots.length - 1, stage - 1))];
    while (this.nextMusicTime < now + 0.72) {
      if (mode === "menu") {
        this.pad(this.nextMusicTime, root * 0.5, 0.45, 0.045);
        this.pad(this.nextMusicTime + beat * 0.4, root * 0.75, 0.28, 0.03);
        this.musicPulse(this.nextMusicTime + beat * 0.2, root * 0.25, 0.18, 0.018, "triangle");
      } else {
        this.musicPulse(this.nextMusicTime, root * 0.25, 0.22, 0.038, "sine");
        this.musicPulse(this.nextMusicTime, root * 0.5, 0.19, 0.05, "triangle");
        this.musicPulse(this.nextMusicTime + beat * 0.5, root, 0.14, 0.038, "triangle");
        this.musicPulse(this.nextMusicTime + beat * 0.75, root * 1.5, 0.12, 0.024, "sine");
        this.noiseHat(this.nextMusicTime + beat * 0.25, 0.035, 0.012, 3200, 2.1, this.music);
        this.noiseHat(this.nextMusicTime + beat * 0.75, 0.03, 0.01, 3600, 2.4, this.music);
        if (stage >= 3) {
          this.musicPulse(this.nextMusicTime + beat * 0.25, root * 2, 0.1, 0.016, "square");
          this.musicPulse(this.nextMusicTime + beat * 0.125, root * 1.25, 0.11, 0.014, "sine");
        }
        if (stage >= 4) {
          this.musicPulse(this.nextMusicTime + beat * 0.625, root * 2.5, 0.08, 0.014, "square");
          this.noiseHat(this.nextMusicTime + beat * 0.875, 0.026, 0.012, 4200, 2.8, this.music);
        }
        if (frame.dangerLevel >= 0.6) {
          this.musicPulse(this.nextMusicTime + beat * 0.1, root * 0.25, 0.2, 0.018, "sawtooth");
          this.noiseHat(this.nextMusicTime + beat * 0.5, 0.055, 0.013, 2200, 1.6, this.music);
        }
      }
      this.nextMusicTime += beat;
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "start":
        this.duckMusic(0.12, 0.1);
        this.pulse(this.now(), 293.66, 0.08, 0.05, "triangle");
        this.pulse(this.now() + 0.05, 392, 0.1, 0.042, "triangle");
        break;
      case "restart":
        this.duckMusic(0.12, 0.12);
        this.pulse(this.now(), event.fullReset ? 261.63 : 329.63, 0.08, 0.05, "triangle");
        this.pulse(this.now() + 0.045, event.fullReset ? 392 : 440, 0.1, 0.038, "triangle");
        break;
      case "grapple-cast":
        this.sweep(this.now(), 280, 760, 0.09, 0.04, "square");
        this.noise(this.now(), 0.05, 0.014, 2400, 1.8);
        break;
      case "grapple-latch":
        this.sweep(this.now(), 640, 980, 0.07, 0.06, "triangle");
        this.pulse(this.now() + 0.02, 490, 0.08, 0.028, "sine");
        break;
      case "grapple-release":
        this.sweep(this.now(), 520, 260 + Math.min(460, event.speed ?? 0), 0.08, 0.055, "sine");
        break;
      case "boost":
        this.duckMusic(0.14, 0.12);
        this.sweep(this.now(), 340, 1120, 0.18, 0.085, "sawtooth");
        this.noise(this.now(), 0.14, 0.05, 1800, 0.7);
        this.pulse(this.now() + 0.045, 660, 0.08, 0.03, "triangle");
        break;
      case "flow-enter":
        this.duckMusic(0.08, 0.08);
        this.sweep(this.now(), 360, 920 + (event.strength ?? 0) * 280, 0.12, 0.032, "triangle");
        break;
      case "bounce":
        this.sweep(this.now(), 180, 720, 0.12, 0.07, "square");
        break;
      case "battery":
        this.duckMusic(0.12, 0.16);
        this.pulse(this.now(), 880, 0.1, 0.035, "triangle");
        this.pulse(this.now() + 0.04, 1108, 0.08, 0.028, "triangle");
        if ((event.count ?? 0) >= 10) {
          this.pulse(this.now() + 0.08, 1320, 0.12, 0.024, "triangle");
        }
        break;
      case "medkit":
        this.pulse(this.now(), 520, 0.12, 0.045, "sine");
        this.pulse(this.now() + 0.05, 660, 0.08, 0.035, "sine");
        break;
      case "checkpoint":
        this.duckMusic(0.16, 0.14);
        this.pulse(this.now(), 392, 0.13, 0.05, "triangle");
        this.pulse(this.now() + 0.06, 523.25, 0.12, 0.045, "triangle");
        this.pulse(this.now() + 0.12, 659.25, 0.1, 0.04, "triangle");
        this.pulse(this.now() + 0.18, 783.99, 0.08, 0.032, "triangle");
        break;
      case "turret-windup":
        if (this.now() - this.lastWindupAt > 0.12) {
          this.lastWindupAt = this.now();
          this.duckMusic(0.18, 0.32);
          this.sweep(this.now(), 220, 330, 0.14, 0.045, "sawtooth");
        }
        break;
      case "turret-ping":
        this.pulse(this.now(), 760 + (event.progress ?? 0) * 180, 0.05, 0.022, "triangle");
        this.noise(this.now(), 0.025, 0.008, 3000, 2.3);
        break;
      case "turret-fire":
        if (this.now() - this.lastFireAt > 0.04) {
          this.lastFireAt = this.now();
          this.duckMusic(0.2, 0.36);
          this.sweep(this.now(), 420, 120, 0.12, 0.06, "square");
          this.noise(this.now(), 0.12, 0.055, 1600, 1.2);
        }
        break;
      case "hit":
        this.duckMusic(0.28, 0.46);
        this.sweep(this.now(), 210, 90, 0.18, 0.08, "sawtooth");
        this.noise(this.now(), 0.18, 0.075, 900, 1.1);
        break;
      case "fall":
        this.duckMusic(0.24, 0.32);
        this.sweep(this.now(), 180, 70, 0.22, 0.09, "triangle");
        this.noise(this.now(), 0.16, 0.055, 700, 0.9);
        break;
      case "win":
        this.jingle([523.25, 659.25, 783.99, 1046.5], 0.11, 0.08, "triangle");
        break;
      case "lose":
        this.jingle([330, 246.94, 196, 146.83], 0.13, 0.07, "sawtooth");
        this.noise(this.now() + 0.16, 0.12, 0.05, 600, 0.7);
        break;
      default:
        break;
    }
  }

  jingle(notes, step, gain, type) {
    const start = this.now();
    for (let index = 0; index < notes.length; index += 1) {
      this.pulse(start + step * index, notes[index], step * 0.9, gain * (1 - index * 0.1), type);
    }
  }

  pulse(time, frequency, duration, gain, type) {
    this.voice(time, frequency, frequency, duration, gain, type);
  }

  musicPulse(time, frequency, duration, gain, type) {
    this.voice(time, frequency, frequency, duration, gain, type, this.music);
  }

  sweep(time, from, to, duration, gain, type) {
    this.voice(time, from, to, duration, gain, type);
  }

  pad(time, frequency, duration, gain) {
    if (!this.context || !this.music) {
      return;
    }

    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, time);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + 0.12);
    amp.gain.linearRampToValueAtTime(0.0001, time + duration);
    osc.connect(amp);
    amp.connect(this.music);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  voice(time, from, to, duration, gain, type, destination = this.master) {
    if (!this.context || !destination) {
      return;
    }

    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), time + duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.max(500, from * 3.5), time);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(amp);
    amp.connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  duckMusic(duration, amount) {
    if (!this.context) {
      return;
    }
    this.musicDuckUntil = Math.max(this.musicDuckUntil, this.context.currentTime + duration);
    this.musicDuckAmount = Math.max(this.musicDuckAmount * 0.82, amount);
  }

  installFlowBed() {
    if (!this.context || !this.master || !this.music || !this.noiseBuffer) {
      return;
    }

    this.flowNoiseFilter = this.context.createBiquadFilter();
    this.flowNoiseFilter.type = "bandpass";
    this.flowNoiseFilter.frequency.value = 680;
    this.flowNoiseFilter.Q.value = 0.9;

    this.flowNoiseGain = this.context.createGain();
    this.flowNoiseGain.gain.value = 0.0001;

    this.flowNoise = this.context.createBufferSource();
    this.flowNoise.buffer = this.noiseBuffer;
    this.flowNoise.loop = true;
    this.flowNoise.connect(this.flowNoiseFilter);
    this.flowNoiseFilter.connect(this.flowNoiseGain);
    this.flowNoiseGain.connect(this.master);
    this.flowNoise.start();

    this.flowTone = this.context.createOscillator();
    this.flowTone.type = "triangle";
    this.flowTone.frequency.value = 190;

    this.flowToneGain = this.context.createGain();
    this.flowToneGain.gain.value = 0.0001;

    this.flowTone.connect(this.flowToneGain);
    this.flowToneGain.connect(this.music);
    this.flowTone.start();
  }

  handleFlowBed(frame) {
    if (!this.context || !this.flowNoiseGain || !this.flowNoiseFilter || !this.flowTone || !this.flowToneGain) {
      return;
    }

    const now = this.context.currentTime;
    const flowStrength = frame.mode === "playing" ? Math.max(0, Math.min(1, frame.flow?.strength ?? 0)) : 0;
    const playerSpeed = frame.playerSpeed ?? 0;
    const noiseGain = 0.0001 + flowStrength * 0.052;
    const toneGain = 0.0001 + flowStrength * 0.018;
    const toneFrequency = 180 + flowStrength * 90 + Math.min(80, playerSpeed * 0.08);
    const filterFrequency = 640 + flowStrength * 1800 + Math.min(280, playerSpeed * 0.14);

    this.flowNoiseGain.gain.cancelScheduledValues(now);
    this.flowNoiseGain.gain.setValueAtTime(this.flowNoiseGain.gain.value, now);
    this.flowNoiseGain.gain.linearRampToValueAtTime(noiseGain, now + 0.08);

    this.flowToneGain.gain.cancelScheduledValues(now);
    this.flowToneGain.gain.setValueAtTime(this.flowToneGain.gain.value, now);
    this.flowToneGain.gain.linearRampToValueAtTime(toneGain, now + 0.1);

    this.flowTone.frequency.cancelScheduledValues(now);
    this.flowTone.frequency.setValueAtTime(this.flowTone.frequency.value, now);
    this.flowTone.frequency.linearRampToValueAtTime(toneFrequency, now + 0.08);

    this.flowNoiseFilter.frequency.cancelScheduledValues(now);
    this.flowNoiseFilter.frequency.setValueAtTime(this.flowNoiseFilter.frequency.value, now);
    this.flowNoiseFilter.frequency.linearRampToValueAtTime(filterFrequency, now + 0.08);
  }

  noise(time, duration, gain, filterFrequency, q) {
    if (!this.context || !this.master || !this.noiseBuffer) {
      return;
    }

    const source = this.context.createBufferSource();
    const amp = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterFrequency, time);
    filter.Q.value = q;
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(time);
    source.stop(time + duration + 0.04);
  }

  noiseHat(time, duration, gain, filterFrequency, q, destination = this.master) {
    if (!this.context || !destination || !this.noiseBuffer) {
      return;
    }

    const source = this.context.createBufferSource();
    const amp = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(filterFrequency, time);
    filter.Q.value = q;
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination);
    source.start(time);
    source.stop(time + duration + 0.03);
  }

  now() {
    return this.context ? this.context.currentTime : 0;
  }
}

function createNoiseBuffer(context) {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.4));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }
  return buffer;
}
