const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function noteFrequency(semitone) {
  return 220 * 2 ** (semitone / 12);
}

function createNoiseBuffer(context) {
  const length = Math.floor(context.sampleRate * 0.2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createAudioEngine() {
  const mixProfiles = {
    full: { label: "Audio Full", master: 0.4, music: 0.76, ambience: 0.82 },
    low: { label: "Audio Low", master: 0.28, music: 0.62, ambience: 0.58 },
    mute: { label: "Audio Mute", master: 0.0001, music: 0, ambience: 0 },
  };
  let context = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let ambienceGain = null;
  let noiseBuffer = null;
  const lastShotAtByKey = new Map();
  const lastHeavyAtByType = new Map();
  let lastArmorAt = 0;
  let lastBlastAt = 0;
  let lastBombShotAt = 0;
  let nextMusicAt = 0;
  let musicStep = 0;
  let musicMode = "menu";
  let musicPulse = 0;
  let currentLeadFrequency = 220;
  let currentAmbienceMode = "";
  let ambienceSource = null;
  let mixProfileId = "full";
  let musicScalar = mixProfiles.full.music;
  let ambienceScalar = mixProfiles.full.ambience;
  let musicDuckUntil = 0;
  let musicDuckAmount = 1;
  let ambienceDuckUntil = 0;
  let ambienceDuckAmount = 1;

  function ensureContext() {
    if (context) {
      return context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return null;
    }
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = mixProfiles[mixProfileId].master;
    musicGain = context.createGain();
    musicGain.gain.value = 0.0001;
    sfxGain = context.createGain();
    sfxGain.gain.value = 1.92;
    ambienceGain = context.createGain();
    ambienceGain.gain.value = 0.0001;
    musicGain.connect(master);
    sfxGain.connect(master);
    ambienceGain.connect(master);
    master.connect(context.destination);
    noiseBuffer = createNoiseBuffer(context);
    return context;
  }

  function applyMixProfile(profileId, immediate = false) {
    const profile = mixProfiles[profileId] || mixProfiles.full;
    mixProfileId = mixProfiles[profileId] ? profileId : "full";
    musicScalar = profile.music;
    ambienceScalar = profile.ambience;
    if (context) {
      const at = context.currentTime;
      if (immediate) {
        master.gain.setValueAtTime(profile.master, at);
      } else {
        master.gain.cancelScheduledValues(at);
        master.gain.linearRampToValueAtTime(profile.master, at + 0.12);
      }
    }
    return { id: mixProfileId, ...mixProfiles[mixProfileId] };
  }

  function unlock() {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "suspended") {
      return;
    }
    ctx.resume().catch(() => {});
  }

  function tone({ at, duration, frequency, type = "sine", gain = 0.08, endGain = 0.0001, pan = 0 }) {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(endGain, at + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -0.85, 0.85), at);
    oscillator.connect(amp);
    amp.connect(panner);
    panner.connect(sfxGain);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  function sweepTone({
    at,
    duration,
    fromFrequency,
    toFrequency,
    type = "sine",
    gain = 0.08,
    endGain = 0.0001,
    pan = 0,
  }) {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, toFrequency), at + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(endGain, at + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -0.85, 0.85), at);
    oscillator.connect(amp);
    amp.connect(panner);
    panner.connect(sfxGain);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  function noise({ at, duration, gain = 0.07, filterType = "bandpass", frequency = 1000, q = 0.7, pan = 0 }) {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, at);
    filter.Q.setValueAtTime(q, at);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -0.85, 0.85), at);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(panner);
    panner.connect(sfxGain);
    source.start(at);
    source.stop(at + duration);
  }

  function blip(semitone, duration, gain, options = {}) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") {
      return;
    }
    tone({
      at: ctx.currentTime,
      duration,
      frequency: noteFrequency(semitone),
      gain,
      ...options,
    });
  }

  function chime(semitones, spacing, gain, options = {}) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") {
      return;
    }
    semitones.forEach((semitone, index) => {
      tone({
        at: ctx.currentTime + spacing * index,
        duration: options.duration || 0.14,
        frequency: noteFrequency(semitone),
        gain: gain * Math.max(0.45, 1 - index * 0.14),
        type: options.type || "triangle",
        pan: options.pan || 0,
      });
    });
  }

  function duckMix(duration = 0.18, musicAmount = 0.72, ambienceAmount = 0.84) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") {
      return;
    }
    musicDuckUntil = Math.max(musicDuckUntil, ctx.currentTime + duration);
    musicDuckAmount = Math.min(musicDuckAmount, musicAmount);
    ambienceDuckUntil = Math.max(ambienceDuckUntil, ctx.currentTime + duration);
    ambienceDuckAmount = Math.min(ambienceDuckAmount, ambienceAmount);
  }

  function densityScalar(now, lastAt, recovery, floor = 0.38) {
    if (!lastAt) {
      return 1;
    }
    return clamp((now - lastAt) / recovery, floor, 1);
  }

  function setAmbience(mode, routeIndex, urgency, duckAmount = 1) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") {
      return;
    }
    const ambienceMode = `${mode}:${routeIndex}`;
    if (ambienceSource && ambienceMode !== currentAmbienceMode) {
      ambienceSource.stop(ctx.currentTime + 0.06);
      ambienceSource.disconnect();
      ambienceSource = null;
    }
    currentAmbienceMode = ambienceMode;
    if (!ambienceSource) {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = mode === "combat" ? "bandpass" : "lowpass";
      const baseFrequency = mode === "combat" ? 230 + routeIndex * 45 : 150 + routeIndex * 35;
      filter.frequency.setValueAtTime(baseFrequency + urgency * 70, ctx.currentTime);
      filter.Q.setValueAtTime(mode === "combat" ? 1.5 : 0.6, ctx.currentTime);
      source.connect(filter);
      filter.connect(ambienceGain);
      source.start();
      ambienceSource = source;
    }
    ambienceGain.gain.linearRampToValueAtTime(
      (mode === "combat" ? 0.018 + urgency * 0.01 : mode === "build" ? 0.011 : 0.007) * ambienceScalar * duckAmount,
      ctx.currentTime + 0.25
    );
  }

  function playEvents(events) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") {
      return;
    }
    for (const event of events) {
      switch (event.type) {
        case "place":
          blip(-5, 0.11, 0.042, { type: "triangle", pan: event.pan });
          blip(2, 0.15, 0.032, { type: "sine", pan: event.pan * 0.45 });
          noise({ at: ctx.currentTime, duration: 0.045, gain: 0.015, filterType: "highpass", frequency: 1600, pan: event.pan * 0.35 });
          break;
        case "upgrade":
          chime([4, 9, 14], 0.065, 0.042, { duration: 0.18, type: "triangle", pan: event.pan * 0.25 });
          noise({ at: ctx.currentTime + 0.02, duration: 0.06, gain: 0.018, filterType: "bandpass", frequency: 2400, q: 1.6, pan: event.pan });
          break;
        case "wave":
          duckMix(0.34, 0.6, 0.76);
          {
            const routeLift = (event.routeIndex || 0) * 2;
            const intensityGain = 0.012 + (event.intensity || 0) * 0.018;
            tone({ at: ctx.currentTime, duration: 0.08, frequency: noteFrequency(-22 + routeLift), gain: 0.028 + intensityGain, type: "square" });
          }
          tone({ at: ctx.currentTime + 0.02, duration: 0.2, frequency: noteFrequency(-29 + (event.routeIndex || 0)), gain: 0.028, type: "sine" });
          sweepTone({
            at: ctx.currentTime,
            duration: 0.34,
            fromFrequency: noteFrequency(-14 + (event.routeIndex || 0)),
            toFrequency: noteFrequency(-3 + (event.routeIndex || 0) * 2),
            gain: 0.068,
            type: "sawtooth",
          });
          tone({ at: ctx.currentTime + 0.12, duration: 0.26, frequency: noteFrequency(2 + (event.routeIndex || 0) * 2), gain: 0.044, type: "triangle" });
          noise({ at: ctx.currentTime, duration: 0.1, gain: 0.03, filterType: "bandpass", frequency: 950 + (event.routeIndex || 0) * 120, q: 0.9 });
          tone({ at: ctx.currentTime + 0.06, duration: 0.08, frequency: noteFrequency(-22 + (event.routeIndex || 0)), gain: 0.034, type: "square" });
          tone({ at: ctx.currentTime + 0.18, duration: 0.12, frequency: noteFrequency(-10 + (event.routeIndex || 0)), gain: 0.03, type: "triangle" });
          break;
        case "clear":
          duckMix(0.26, 0.7, 0.86);
          chime([7, 12, 16 + (event.routeIndex || 0)], 0.045, event.perfect ? 0.042 : 0.036, { duration: 0.14, type: "triangle" });
          tone({ at: ctx.currentTime + 0.06, duration: 0.18, frequency: noteFrequency(14 + (event.routeIndex || 0)), gain: 0.024, type: "sine" });
          if (event.perfect) {
            tone({ at: ctx.currentTime + 0.16, duration: 0.24, frequency: noteFrequency(21), gain: 0.026, type: "sine" });
          }
          noise({ at: ctx.currentTime, duration: 0.06, gain: 0.014, filterType: "bandpass", frequency: 1800 + (event.routeIndex || 0) * 120, q: 1.1 });
          break;
        case "shot":
          {
            const shotKey = `${event.towerType}:${Math.round((event.pan || 0) * 8)}`;
            const lastShotAt = lastShotAtByKey.get(shotKey) || 0;
            if (ctx.currentTime - lastShotAt < 0.022) {
              break;
            }
            lastShotAtByKey.set(shotKey, ctx.currentTime);
          }
          if (event.towerType === "bomb") {
            const density = densityScalar(ctx.currentTime, lastBombShotAt, 0.12, 0.34);
            lastBombShotAt = ctx.currentTime;
            duckMix(0.05, 0.9, 0.95);
            tone({ at: ctx.currentTime, duration: 0.016, frequency: noteFrequency(9), gain: 0.008 + density * 0.003, type: "square", pan: event.pan * 0.18 });
            noise({
              at: ctx.currentTime,
              duration: 0.082 + density * 0.018,
              gain: 0.016 + density * 0.022,
              filterType: "lowpass",
              frequency: 300 + density * 105,
              q: 1.04 + density * 0.28,
              pan: event.pan,
            });
            sweepTone({
              at: ctx.currentTime,
              duration: 0.08,
              fromFrequency: noteFrequency(-11),
              toFrequency: noteFrequency(-17),
              gain: 0.012 + density * 0.018,
              type: "square",
              pan: event.pan,
            });
            tone({
              at: ctx.currentTime + 0.018,
              duration: 0.052,
              frequency: noteFrequency(-21),
              gain: 0.01 + density * 0.008,
              type: "sine",
              pan: event.pan * 0.35,
            });
          } else if (event.towerType === "glue") {
            tone({ at: ctx.currentTime, duration: 0.09, frequency: noteFrequency(-3), gain: 0.036, type: "triangle", pan: event.pan });
            sweepTone({
              at: ctx.currentTime + 0.015,
              duration: 0.08,
              fromFrequency: noteFrequency(6),
              toFrequency: noteFrequency(1),
              gain: 0.024,
              type: "sine",
              pan: event.pan * 0.6,
            });
            noise({ at: ctx.currentTime, duration: 0.075, gain: 0.024, frequency: 1550, q: 1.1, pan: event.pan });
            tone({ at: ctx.currentTime + 0.022, duration: 0.045, frequency: noteFrequency(-10), gain: 0.014, type: "triangle", pan: event.pan * 0.28 });
          } else {
            tone({ at: ctx.currentTime, duration: 0.05, frequency: noteFrequency(5), gain: 0.03, type: "square", pan: event.pan });
            tone({ at: ctx.currentTime + 0.008, duration: 0.032, frequency: noteFrequency(12), gain: 0.014, type: "triangle", pan: event.pan * 0.55 });
            noise({ at: ctx.currentTime, duration: 0.024, gain: 0.015, filterType: "highpass", frequency: 2850, q: 1.9, pan: event.pan * 0.6 });
          }
          break;
        case "pop":
          {
            const size = clamp(event.size ?? 1, 0.7, 1.18);
            const profile = event.profile || "normal";
            tone({
              at: ctx.currentTime,
              duration: 0.034 + size * 0.03,
              frequency: noteFrequency((event.pitch ?? 7) - (profile === "heavy" ? 4 : 0)),
              gain: 0.03 + size * 0.012,
              type: profile === "volatile" ? "sawtooth" : "square",
              pan: event.pan,
            });
            tone({
              at: ctx.currentTime + 0.008,
              duration: 0.028 + size * 0.02,
              frequency: noteFrequency((event.pitch ?? 7) + (profile === "split" ? 10 : 7)),
              gain: profile === "cash" ? 0.028 : 0.018 + size * 0.006,
              type: profile === "cash" ? "triangle" : "sine",
              pan: event.pan * 0.4,
            });
            noise({
              at: ctx.currentTime,
              duration: 0.03 + size * 0.025,
              gain: 0.022 + size * 0.008,
              filterType: "bandpass",
              frequency: profile === "heavy" ? 1600 : profile === "volatile" ? 1900 : 2450,
              q: profile === "heavy" ? 1.25 : 1.55,
              pan: event.pan,
            });
            if (profile === "split" || profile === "cash") {
              tone({ at: ctx.currentTime + 0.018, duration: 0.05, frequency: noteFrequency(18), gain: 0.012, type: "triangle", pan: event.pan * 0.28 });
            }
          }
          break;
        case "blast":
          {
            const density = densityScalar(ctx.currentTime, lastBlastAt, 0.11, 0.3);
            lastBlastAt = ctx.currentTime;
            duckMix(0.08, 0.84, 0.93);
            noise({
              at: ctx.currentTime,
              duration: 0.11 + density * 0.05,
              gain: 0.018 + density * 0.028,
              filterType: "lowpass",
              frequency: 290 + density * 110,
              q: 1.02 + density * 0.22,
              pan: event.pan,
            });
          sweepTone({
            at: ctx.currentTime,
            duration: 0.12,
            fromFrequency: noteFrequency(-8),
            toFrequency: noteFrequency(-15),
            gain: 0.011 + density * 0.018,
            type: "sawtooth",
            pan: event.pan,
          });
            tone({
              at: ctx.currentTime + 0.018,
              duration: 0.082,
              frequency: noteFrequency(-27),
              gain: 0.006 + density * 0.008,
              type: "triangle",
              pan: event.pan * 0.3,
            });
            noise({ at: ctx.currentTime + 0.012, duration: 0.03, gain: 0.008 + density * 0.01, filterType: "bandpass", frequency: 1240, q: 1.7, pan: event.pan * 0.45 });
          }
          break;
        case "armor":
          if (ctx.currentTime - lastArmorAt < 0.12) {
            break;
          }
          lastArmorAt = ctx.currentTime;
          tone({ at: ctx.currentTime, duration: 0.06, frequency: noteFrequency(-12), gain: 0.018, type: "square", pan: event.pan });
          noise({ at: ctx.currentTime, duration: 0.045, gain: 0.013, filterType: "bandpass", frequency: 1200, q: 3.8, pan: event.pan });
          break;
        case "heavy":
          {
            const heavyKey = event.bloonType || "heavy";
            const lastHeavyAt = lastHeavyAtByType.get(heavyKey) || 0;
            const density = densityScalar(ctx.currentTime, lastHeavyAt, event.bloonType === "marble" ? 0.22 : 0.12, 0.46);
            lastHeavyAtByType.set(heavyKey, ctx.currentTime);
            duckMix(event.bloonType === "marble" ? 0.2 : 0.12, event.bloonType === "marble" ? 0.7 : 0.8, 0.9);
            tone({
              at: ctx.currentTime,
              duration: 0.12,
              frequency: noteFrequency(event.bloonType === "marble" ? -22 : event.bloonType === "ember" ? -14 : -18),
              gain: 0.018 + density * 0.022,
              type: "sawtooth",
              pan: event.pan,
            });
            tone({
              at: ctx.currentTime + 0.018,
              duration: 0.16,
              frequency: noteFrequency(event.bloonType === "marble" ? -31 : -27),
              gain: 0.014 + density * 0.018,
              type: "sine",
              pan: event.pan * 0.4,
            });
          sweepTone({
            at: ctx.currentTime + 0.01,
            duration: 0.14,
            fromFrequency: noteFrequency(event.bloonType === "marble" ? -12 : -15),
            toFrequency: noteFrequency(event.bloonType === "ember" ? -20 : -23),
            gain: 0.018 + density * 0.022,
            type: "triangle",
            pan: event.pan,
          });
            tone({
              at: ctx.currentTime + 0.006,
              duration: 0.038,
              frequency: noteFrequency(event.bloonType === "marble" ? 0 : event.bloonType === "ember" ? 5 : 2),
              gain: 0.008 + density * 0.012,
              type: "square",
              pan: event.pan * 0.18,
            });
            noise({
              at: ctx.currentTime,
              duration: 0.054 + density * 0.024,
              gain: 0.012 + density * 0.016,
              filterType: "bandpass",
              frequency: (event.bloonType === "marble" ? 980 : 760) + (event.routeIndex || 0) * 80,
              q: 1.3 + density * 0.32,
              pan: event.pan * 0.45,
            });
          }
          break;
        case "cash":
          chime([11, 18], 0.04, 0.025, { duration: 0.11, type: "triangle", pan: event.pan * 0.35 });
          noise({ at: ctx.currentTime, duration: 0.03, gain: 0.007, filterType: "highpass", frequency: 2600, q: 1.2, pan: event.pan * 0.4 });
          break;
        case "leak":
          duckMix(0.3, 0.58, 0.7);
          sweepTone({
            at: ctx.currentTime,
            duration: 0.24,
            fromFrequency: noteFrequency(-8),
            toFrequency: noteFrequency(-18),
            gain: 0.046 + (event.severity || 0) * 0.005,
            type: "sawtooth",
            pan: event.pan,
          });
          tone({ at: ctx.currentTime + 0.04, duration: 0.18, frequency: noteFrequency(-23), gain: 0.026, type: "square", pan: event.pan * 0.35 });
          noise({ at: ctx.currentTime + 0.03, duration: 0.08, gain: 0.022, filterType: "bandpass", frequency: 720, q: 1.2, pan: event.pan * 0.5 });
          break;
        case "tier":
          duckMix(event.tier >= 5 ? 0.28 : 0.18, event.tier >= 5 ? 0.62 : 0.72, 0.82);
          chime([0, 7, 12, 16], 0.095, event.tier >= 5 ? 0.05 : 0.04, { duration: event.tier >= 5 ? 0.24 : 0.2, type: "triangle" });
          if (event.tier >= 5) {
            tone({ at: ctx.currentTime, duration: 0.16, frequency: noteFrequency(-17 + (event.routeIndex || 0)), gain: 0.026, type: "sawtooth" });
            tone({ at: ctx.currentTime + 0.08, duration: 0.28, frequency: noteFrequency(-5 + (event.routeIndex || 0)), gain: 0.022, type: "triangle" });
            noise({ at: ctx.currentTime + 0.02, duration: 0.12, gain: 0.016, filterType: "bandpass", frequency: 1680, q: 1.2 });
          }
          break;
        case "win":
          chime([4, 9, 16, 21], 0.16, 0.045, { duration: 0.26, type: "triangle" });
          break;
        case "lose":
          duckMix(0.45, 0.52, 0.64);
          sweepTone({
            at: ctx.currentTime,
            duration: 0.32,
            fromFrequency: noteFrequency(-10),
            toFrequency: noteFrequency(-20),
            gain: 0.036,
            type: "sawtooth",
          });
          tone({ at: ctx.currentTime + 0.16, duration: 0.28, frequency: noteFrequency(-17), gain: 0.028, type: "sawtooth" });
          break;
        case "ui":
          blip(0, 0.08, 0.025, { type: "triangle" });
          break;
        default:
          break;
      }
    }
  }

  function syncMusic(state) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") {
      return;
    }
    const mode = state.mode === "playing" ? (state.waveActive ? "combat" : "build") : state.mode;
    if (mode !== musicMode) {
      musicMode = mode;
      nextMusicAt = ctx.currentTime;
      musicStep = 0;
      musicPulse = 0;
      currentLeadFrequency = noteFrequency(-12);
    }
    const urgency = state.mode === "playing" ? 1 - clamp(state.lives / Math.max(1, state.startingLives || state.lives || 1), 0, 1) : 0;
    const routePressure = clamp(state.threatMetrics?.routePressure || 0, 0, 1);
    const activeHeavyCount = state.threatMetrics?.activeHeavyCount || 0;
    if (ctx.currentTime >= musicDuckUntil) {
      musicDuckAmount = 1;
    }
    if (ctx.currentTime >= ambienceDuckUntil) {
      ambienceDuckAmount = 1;
    }
    setAmbience(musicMode, state.operationIndex || 0, Math.max(urgency, routePressure * 0.78), ambienceDuckAmount);
    const targetGain =
      (musicMode === "combat"
        ? 0.084 + urgency * 0.02 + routePressure * 0.012
        : musicMode === "build"
          ? 0.058
          : musicMode === "win"
            ? 0.06
            : musicMode === "lose"
              ? 0.03
              : 0.044) *
      musicScalar *
      musicDuckAmount;
    musicGain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.2);

    const routeOffset = (state.operationIndex || 0) * 2;
    const patterns = {
      menu: { notes: [-12, -5, -8, -3], bass: [-24, -19], spacing: 0.4, gain: 0.019, bassGain: 0.014, type: "triangle", bassType: "sine" },
      build: { notes: [-7, -3, 0, 4, 7], bass: [-19, -15, -12], spacing: 0.23, gain: 0.024, bassGain: 0.018, type: "triangle", bassType: "sine" },
      combat: { notes: [-7, -2, 3, 7, 10, 3, -2], bass: [-19, -17, -14, -12], spacing: 0.16, gain: 0.03, bassGain: 0.022, type: "sawtooth", bassType: "triangle" },
      win: { notes: [0, 4, 7, 12], bass: [-12, -5], spacing: 0.22, gain: 0.024, bassGain: 0.013, type: "triangle", bassType: "sine" },
      lose: { notes: [-12, -10, -15, -17], bass: [-24, -22], spacing: 0.32, gain: 0.015, bassGain: 0.012, type: "sine", bassType: "triangle" },
    };
    const pattern = patterns[musicMode] || patterns.menu;
    while (nextMusicAt <= ctx.currentTime + 0.18) {
      const tierLift = Math.min(8, state.commandTier - 1);
      const semitone = pattern.notes[musicStep % pattern.notes.length] + tierLift + routeOffset;
      const leadFrequency = noteFrequency(semitone);
      const lead = ctx.createOscillator();
      lead.type = pattern.type;
      lead.frequency.setValueAtTime(leadFrequency, nextMusicAt);
      const leadAmp = ctx.createGain();
      leadAmp.gain.setValueAtTime(0.0001, nextMusicAt);
      leadAmp.gain.exponentialRampToValueAtTime(pattern.gain + urgency * 0.002 + routePressure * 0.002, nextMusicAt + 0.01);
      leadAmp.gain.exponentialRampToValueAtTime(0.0001, nextMusicAt + pattern.spacing * 0.88);
      lead.connect(leadAmp);
      leadAmp.connect(musicGain);
      lead.start(nextMusicAt);
      lead.stop(nextMusicAt + pattern.spacing * 0.93);

      if (musicStep % 2 === 0) {
        const bassSemitone = pattern.bass[musicPulse % pattern.bass.length] + routeOffset;
        const bass = ctx.createOscillator();
        bass.type = pattern.bassType;
        bass.frequency.setValueAtTime(noteFrequency(bassSemitone), nextMusicAt);
        const bassAmp = ctx.createGain();
        bassAmp.gain.setValueAtTime(0.0001, nextMusicAt);
        bassAmp.gain.exponentialRampToValueAtTime(pattern.bassGain + urgency * 0.002 + routePressure * 0.003, nextMusicAt + 0.02);
        bassAmp.gain.exponentialRampToValueAtTime(0.0001, nextMusicAt + pattern.spacing * 1.7);
        bass.connect(bassAmp);
        bassAmp.connect(musicGain);
        bass.start(nextMusicAt);
        bass.stop(nextMusicAt + pattern.spacing * 1.75);
        musicPulse += 1;
      }

      if (musicMode === "combat" && musicStep % 3 === 2) {
        const accent = ctx.createOscillator();
        accent.type = "square";
        accent.frequency.setValueAtTime(currentLeadFrequency * 0.5, nextMusicAt);
        const accentAmp = ctx.createGain();
        accentAmp.gain.setValueAtTime(0.0001, nextMusicAt);
        accentAmp.gain.exponentialRampToValueAtTime(0.007 + urgency * 0.004 + routePressure * 0.003, nextMusicAt + 0.008);
        accentAmp.gain.exponentialRampToValueAtTime(0.0001, nextMusicAt + pattern.spacing * 0.45);
        accent.connect(accentAmp);
        accentAmp.connect(musicGain);
        accent.start(nextMusicAt);
        accent.stop(nextMusicAt + pattern.spacing * 0.5);
      }

      if (musicMode === "combat" && musicStep % 4 === 0) {
        const kick = ctx.createOscillator();
        kick.type = "sine";
        kick.frequency.setValueAtTime(noteFrequency(-24 + routeOffset), nextMusicAt);
        kick.frequency.exponentialRampToValueAtTime(noteFrequency(-31 + routeOffset), nextMusicAt + pattern.spacing * 0.55);
        const kickAmp = ctx.createGain();
        kickAmp.gain.setValueAtTime(0.0001, nextMusicAt);
        kickAmp.gain.exponentialRampToValueAtTime(0.016 + urgency * 0.004 + routePressure * 0.006, nextMusicAt + 0.012);
        kickAmp.gain.exponentialRampToValueAtTime(0.0001, nextMusicAt + pattern.spacing * 0.6);
        kick.connect(kickAmp);
        kickAmp.connect(musicGain);
        kick.start(nextMusicAt);
        kick.stop(nextMusicAt + pattern.spacing * 0.65);
      }

      if (musicMode === "combat" && activeHeavyCount > 0 && musicStep % 4 === 1) {
        const brace = ctx.createOscillator();
        brace.type = "triangle";
        brace.frequency.setValueAtTime(noteFrequency(-28 + routeOffset), nextMusicAt);
        const braceAmp = ctx.createGain();
        braceAmp.gain.setValueAtTime(0.0001, nextMusicAt);
        braceAmp.gain.exponentialRampToValueAtTime(0.007 + routePressure * 0.006, nextMusicAt + 0.02);
        braceAmp.gain.exponentialRampToValueAtTime(0.0001, nextMusicAt + pattern.spacing * 1.2);
        brace.connect(braceAmp);
        braceAmp.connect(musicGain);
        brace.start(nextMusicAt);
        brace.stop(nextMusicAt + pattern.spacing * 1.24);
      }

      if ((musicMode === "combat" || musicMode === "build") && musicStep % 4 === 0) {
        noise({
          at: nextMusicAt,
          duration: musicMode === "combat" ? 0.08 : 0.05,
          gain: musicMode === "combat" ? 0.017 + urgency * 0.004 : 0.008,
          filterType: "bandpass",
          frequency: musicMode === "combat" ? 540 + routeOffset * 18 : 980,
          q: 1.1,
        });
      }

      currentLeadFrequency = leadFrequency;
      nextMusicAt += pattern.spacing;
      musicStep += 1;
    }
  }

  applyMixProfile(mixProfileId, true);

  function getMixProfile() {
    return { id: mixProfileId, ...mixProfiles[mixProfileId] };
  }

  function setMixProfile(profileId) {
    return applyMixProfile(profileId);
  }

  function cycleMixProfile() {
    const order = ["full", "low", "mute"];
    const nextId = order[(order.indexOf(mixProfileId) + 1) % order.length];
    return applyMixProfile(nextId);
  }

  return { unlock, playEvents, syncMusic, getMixProfile, setMixProfile, cycleMixProfile };
}
