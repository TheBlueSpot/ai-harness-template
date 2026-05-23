function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function note(semitone) {
  return 196 * 2 ** (semitone / 12);
}

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.24), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createBubbleClusterAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noiseBuffer = null;
  let nextMusicAt = 0;
  let musicStep = 0;
  let musicMode = "ready";

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
    master.gain.value = 0.18;
    musicGain = context.createGain();
    musicGain.gain.value = 0.0001;
    sfxGain = context.createGain();
    sfxGain.gain.value = 0.88;
    musicGain.connect(master);
    sfxGain.connect(master);
    master.connect(context.destination);
    noiseBuffer = createNoiseBuffer(context);
    return context;
  }

  function unlock() {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "suspended") {
      return;
    }
    ctx.resume().catch(() => {});
  }

  function tone({
    at,
    duration,
    frequency,
    gain = 0.05,
    endGain = 0.0001,
    type = "sine",
    pan = 0,
    target = sfxGain,
  }) {
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
    panner.pan.setValueAtTime(clamp(pan, -0.92, 0.92), at);
    oscillator.connect(amp);
    amp.connect(panner);
    panner.connect(target);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.04);
  }

  function sweep({
    at,
    duration,
    fromFrequency,
    toFrequency,
    gain = 0.05,
    endGain = 0.0001,
    type = "sine",
    pan = 0,
    target = sfxGain,
  }) {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(32, fromFrequency), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(32, toFrequency), at + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(endGain, at + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -0.92, 0.92), at);
    oscillator.connect(amp);
    amp.connect(panner);
    panner.connect(target);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.04);
  }

  function noise({ at, duration, gain = 0.05, frequency = 1200, q = 0.8, type = "bandpass", pan = 0 }) {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, at);
    filter.Q.setValueAtTime(q, at);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -0.92, 0.92), at);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(panner);
    panner.connect(sfxGain);
    source.start(at);
    source.stop(at + duration);
  }

  function playEvents(events) {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") {
      return;
    }
    for (const event of events) {
      switch (event.type) {
        case "fire":
          tone({ at: ctx.currentTime, duration: 0.07, frequency: note(4 + event.round), gain: 0.03, type: "square", pan: event.pan });
          sweep({
            at: ctx.currentTime + 0.01,
            duration: 0.08,
            fromFrequency: note(11 + event.round),
            toFrequency: note(3 + event.round),
            gain: 0.02,
            type: "triangle",
            pan: event.pan * 0.65,
          });
          break;
        case "prism-fire":
          tone({ at: ctx.currentTime, duration: 0.09, frequency: note(11 + event.round), gain: 0.034, type: "triangle", pan: event.pan });
          tone({ at: ctx.currentTime + 0.02, duration: 0.1, frequency: note(18 + event.round), gain: 0.018, type: "sine", pan: -event.pan * 0.5 });
          noise({ at: ctx.currentTime, duration: 0.05, gain: 0.012, frequency: 2800, q: 1.6, pan: event.pan * 0.4 });
          break;
        case "bank":
          tone({ at: ctx.currentTime, duration: 0.05, frequency: note(10 + Math.min(event.count ?? 0, 4)), gain: 0.024, type: "triangle", pan: event.pan });
          noise({ at: ctx.currentTime, duration: 0.03, gain: 0.01, frequency: 1800, q: 1.8, type: "highpass", pan: event.pan });
          break;
        case "stick":
          tone({ at: ctx.currentTime, duration: 0.06, frequency: note(-2 - Math.min(event.bounces ?? 0, 2)), gain: 0.022, type: "triangle", pan: event.pan });
          break;
        case "pop": {
          const size = clamp(event.size ?? 3, 3, 10);
          tone({ at: ctx.currentTime, duration: 0.055, frequency: note(size + 2), gain: 0.024 + size * 0.002, type: "square", pan: event.pan });
          tone({ at: ctx.currentTime + 0.014, duration: 0.045, frequency: note(size + 9), gain: 0.013, type: "triangle", pan: event.pan * 0.45 });
          noise({ at: ctx.currentTime, duration: 0.04, gain: 0.012 + size * 0.0015, frequency: 2400, q: 1.4, pan: event.pan });
          break;
        }
        case "drop": {
          const size = clamp(event.size ?? 1, 1, 10);
          sweep({
            at: ctx.currentTime,
            duration: 0.18,
            fromFrequency: note(-5 + size),
            toFrequency: note(-14),
            gain: 0.028 + size * 0.002,
            type: "sawtooth",
            pan: event.pan,
          });
          noise({ at: ctx.currentTime + 0.03, duration: 0.09, gain: 0.018 + size * 0.001, frequency: 620, q: 1.1, type: "lowpass", pan: event.pan * 0.7 });
          break;
        }
        case "ceiling-drop":
          noise({ at: ctx.currentTime, duration: 0.16, gain: 0.036 + (event.danger ?? 0) * 0.018, frequency: 520, q: 0.9, type: "lowpass" });
          sweep({
            at: ctx.currentTime,
            duration: 0.22,
            fromFrequency: note(-8),
            toFrequency: note(-18),
            gain: 0.024,
            type: "sawtooth",
          });
          break;
        case "round-clear":
          [4, 9, 13].forEach((step, index) => {
            tone({ at: ctx.currentTime + index * 0.08, duration: 0.18, frequency: note(step + event.round), gain: 0.03, type: "triangle" });
          });
          break;
        case "power-ready":
          [7, 12, 19].forEach((step, index) => {
            tone({ at: ctx.currentTime + index * 0.05, duration: 0.12, frequency: note(step), gain: 0.02, type: "triangle" });
          });
          noise({ at: ctx.currentTime + 0.02, duration: 0.06, gain: 0.008, frequency: 3400, q: 1.2 });
          break;
        case "win":
          [0, 4, 7, 12].forEach((step, index) => {
            tone({ at: ctx.currentTime + index * 0.11, duration: 0.23, frequency: note(step + 10), gain: 0.032, type: "triangle" });
          });
          break;
        case "lose":
          sweep({ at: ctx.currentTime, duration: 0.35, fromFrequency: note(-2), toFrequency: note(-18), gain: 0.03, type: "sawtooth" });
          noise({ at: ctx.currentTime + 0.03, duration: 0.1, gain: 0.014, frequency: 480, q: 1.1, type: "lowpass" });
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
    const nextMode = state.mode === "playing" ? "playing" : state.mode;
    if (nextMode !== musicMode) {
      musicMode = nextMode;
      nextMusicAt = ctx.currentTime;
      musicStep = 0;
    }

    const targetGain =
      musicMode === "playing"
        ? 0.038 + state.danger * 0.02
        : musicMode === "win"
          ? 0.03
          : musicMode === "lose"
            ? 0.016
            : 0.023;
    musicGain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.2);

    const patterns = {
      ready: {
        bass: [-17, -12, -15],
        lead: [-5, -2, 2, 5],
        spacing: 0.32,
        bassGain: 0.011,
        leadGain: 0.008,
        bassType: "sine",
        leadType: "triangle",
      },
      playing: {
        bass: [-19, -15, -12, -10],
        lead: [-7, -3, 0, 4, 7, 4],
        spacing: 0.2,
        bassGain: 0.012,
        leadGain: 0.01,
        bassType: "triangle",
        leadType: "triangle",
      },
      win: {
        bass: [-12, -5],
        lead: [0, 4, 7, 12],
        spacing: 0.24,
        bassGain: 0.01,
        leadGain: 0.009,
        bassType: "sine",
        leadType: "triangle",
      },
      lose: {
        bass: [-22, -19],
        lead: [-12, -10, -15, -17],
        spacing: 0.3,
        bassGain: 0.01,
        leadGain: 0.007,
        bassType: "triangle",
        leadType: "sine",
      },
    };
    const pattern = patterns[musicMode] || patterns.ready;
    while (nextMusicAt <= ctx.currentTime + 0.18) {
      const roundLift = (state.round - 1) * 2;
      const dangerLift = state.mode === "playing" ? Math.round(state.danger * 5) : 0;
      const bassNote = pattern.bass[musicStep % pattern.bass.length];
      tone({
        at: nextMusicAt,
        duration: pattern.spacing * 1.7,
        frequency: note(bassNote),
        gain: pattern.bassGain + state.danger * 0.004,
        type: pattern.bassType,
        target: musicGain,
      });
      const leadNote = pattern.lead[musicStep % pattern.lead.length] + roundLift + dangerLift;
      tone({
        at: nextMusicAt,
        duration: pattern.spacing * 0.88,
        frequency: note(leadNote),
        gain: pattern.leadGain + state.danger * 0.003,
        type: pattern.leadType,
        target: musicGain,
        pan: Math.sin(musicStep * 0.6) * 0.2,
      });
      if (musicMode === "playing" && musicStep % 2 === 1) {
        tone({
          at: nextMusicAt + pattern.spacing * 0.5,
          duration: pattern.spacing * 0.32,
          frequency: note(leadNote + 7),
          gain: 0.004 + state.danger * 0.004,
          type: "square",
          target: musicGain,
          pan: -Math.sin(musicStep * 0.6) * 0.16,
        });
      }
      nextMusicAt += pattern.spacing;
      musicStep += 1;
    }
  }

  return { unlock, playEvents, syncMusic };
}

window.createBubbleClusterAudio = createBubbleClusterAudio;
