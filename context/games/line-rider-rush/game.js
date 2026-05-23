(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hudMode = document.getElementById('hud-mode');
  const hudStatus = document.getElementById('hud-status');
  const hudInk = document.getElementById('hud-ink');
  const hudGoal = document.getElementById('hud-goal');

  const menuScreen = document.getElementById('menu-screen');
  const resultScreen = document.getElementById('result-screen');
  const resultBanner = document.getElementById('result-banner');
  const resultTitle = document.getElementById('result-title');
  const resultCopy = document.getElementById('result-copy');

  const startButton = document.getElementById('start-button');
  const menuDemoButton = document.getElementById('menu-demo-button');
  const stageStrip = document.getElementById('stage-strip');
  const actionBar = document.getElementById('action-bar');
  const rideButton = document.getElementById('ride-button');
  const clearButton = document.getElementById('clear-button');
  const demoButton = document.getElementById('demo-button');
  const retryButton = document.getElementById('retry-button');
  const redrawButton = document.getElementById('redraw-button');

  const WORLD = Object.freeze({ width: 1600, height: 900 });
  const MIN_POINT_STEP = 10;
  const GATE_RADIUS = 42;
  const CRASH_HISTORY = 20;
  const STORAGE_KEY = 'line-rider-rush-progress-v3';

  const levels = [
    {
      name: 'Glacier Drop',
      intro: 'A clean opener. Learn the flow, thread the gates, and trust the downhill.',
      palette: {
        skyTop: '#dff3ff',
        skyBottom: '#edf8ff',
        sun: 'rgba(255,255,255,0.72)',
        mountainFar: '#bfd5ea',
        mountainNear: '#a0bed8'
      },
      start: { x: 120, y: 168 },
      finish: { x: 1430, y: 668 },
      maxInk: 1920,
      parTime: 7.8,
      checkpoints: [
        { x: 360, y: 438, label: 'Gate 1' },
        { x: 760, y: 628, label: 'Gate 2' },
        { x: 1085, y: 358, label: 'Gate 3' }
      ],
      hazards: [
        { x: 560, y: 470, r: 64, type: 'rock' },
        { x: 930, y: 565, r: 74, type: 'rock' },
        { x: 1235, y: 460, r: 58, type: 'rock' },
        { x: 640, y: 260, r: 48, type: 'wind' }
      ],
      demoTrack: [
        { x: 120, y: 168 },
        { x: 152, y: 182 },
        { x: 194, y: 236 },
        { x: 254, y: 320 },
        { x: 324, y: 406 },
        { x: 372, y: 438 },
        { x: 438, y: 496 },
        { x: 526, y: 608 },
        { x: 636, y: 664 },
        { x: 760, y: 628 },
        { x: 834, y: 548 },
        { x: 900, y: 454 },
        { x: 1042, y: 358 },
        { x: 1120, y: 314 },
        { x: 1224, y: 330 },
        { x: 1296, y: 388 },
        { x: 1368, y: 584 },
        { x: 1430, y: 668 }
      ]
    },
    {
      name: 'Switchback Basin',
      intro: 'Longer line, deeper basin, tighter speed control. Spend ink with intent.',
      palette: {
        skyTop: '#e6f1ff',
        skyBottom: '#f9fbff',
        sun: 'rgba(255,250,240,0.7)',
        mountainFar: '#d7c7bb',
        mountainNear: '#b49d91'
      },
      start: { x: 132, y: 164 },
      finish: { x: 1440, y: 708 },
      maxInk: 2280,
      parTime: 9.4,
      checkpoints: [
        { x: 320, y: 372, label: 'Gate 1' },
        { x: 650, y: 708, label: 'Gate 2' },
        { x: 980, y: 520, label: 'Gate 3' },
        { x: 1230, y: 300, label: 'Gate 4' }
      ],
      hazards: [
        { x: 456, y: 516, r: 56, type: 'rock' },
        { x: 842, y: 752, r: 44, type: 'wind' },
        { x: 1085, y: 406, r: 66, type: 'rock' },
        { x: 1320, y: 530, r: 72, type: 'rock' }
      ],
      demoTrack: [
        { x: 132, y: 164 },
        { x: 184, y: 206 },
        { x: 238, y: 286 },
        { x: 300, y: 354 },
        { x: 344, y: 380 },
        { x: 370, y: 416 },
        { x: 412, y: 604 },
        { x: 520, y: 642 },
        { x: 610, y: 704 },
        { x: 654, y: 708 },
        { x: 736, y: 664 },
        { x: 828, y: 586 },
        { x: 938, y: 522 },
        { x: 1028, y: 448 },
        { x: 1110, y: 366 },
        { x: 1228, y: 300 },
        { x: 1322, y: 378 },
        { x: 1386, y: 560 },
        { x: 1440, y: 708 }
      ]
    },
    {
      name: 'Avalanche Spine',
      intro: 'The ridge gets hostile here. Read the gust rings early and flatten panic turns.',
      palette: {
        skyTop: '#d4ebff',
        skyBottom: '#eef7ff',
        sun: 'rgba(255,255,255,0.6)',
        mountainFar: '#91b4d1',
        mountainNear: '#6f95b7'
      },
      start: { x: 130, y: 126 },
      finish: { x: 1442, y: 752 },
      maxInk: 2460,
      parTime: 10.8,
      checkpoints: [
        { x: 286, y: 252, label: 'Gate 1' },
        { x: 520, y: 470, label: 'Gate 2' },
        { x: 860, y: 714, label: 'Gate 3' },
        { x: 1128, y: 428, label: 'Gate 4' },
        { x: 1322, y: 590, label: 'Gate 5' }
      ],
      hazards: [
        { x: 386, y: 300, r: 42, type: 'wind' },
        { x: 648, y: 760, r: 58, type: 'rock' },
        { x: 968, y: 618, r: 56, type: 'wind' },
        { x: 1210, y: 512, r: 70, type: 'rock' },
        { x: 1374, y: 668, r: 60, type: 'rock' }
      ],
      demoTrack: [
        { x: 130, y: 126 },
        { x: 184, y: 160 },
        { x: 232, y: 206 },
        { x: 286, y: 252 },
        { x: 330, y: 340 },
        { x: 446, y: 420 },
        { x: 520, y: 470 },
        { x: 600, y: 520 },
        { x: 736, y: 676 },
        { x: 860, y: 714 },
        { x: 944, y: 654 },
        { x: 1036, y: 514 },
        { x: 1128, y: 428 },
        { x: 1204, y: 470 },
        { x: 1264, y: 542 },
        { x: 1322, y: 590 },
        { x: 1388, y: 668 },
        { x: 1442, y: 752 }
      ]
    },
    {
      name: 'Beacon Descent',
      intro: 'Final run. Longer course, late-stage compression, and one last dive to the beacon.',
      palette: {
        skyTop: '#c9e4ff',
        skyBottom: '#f4fbff',
        sun: 'rgba(255,246,214,0.66)',
        mountainFar: '#cad6e2',
        mountainNear: '#8eabc4'
      },
      start: { x: 122, y: 126 },
      finish: { x: 1460, y: 784 },
      maxInk: 2720,
      parTime: 12.6,
      checkpoints: [
        { x: 254, y: 238, label: 'Gate 1' },
        { x: 468, y: 446, label: 'Gate 2' },
        { x: 748, y: 742, label: 'Gate 3' },
        { x: 1016, y: 600, label: 'Gate 4' },
        { x: 1188, y: 334, label: 'Gate 5' },
        { x: 1362, y: 560, label: 'Gate 6' }
      ],
      hazards: [
        { x: 332, y: 272, r: 40, type: 'wind' },
        { x: 612, y: 804, r: 56, type: 'rock' },
        { x: 890, y: 720, r: 62, type: 'wind' },
        { x: 1096, y: 426, r: 56, type: 'rock' },
        { x: 1266, y: 442, r: 58, type: 'wind' },
        { x: 1468, y: 634, r: 54, type: 'rock' }
      ],
      demoTrack: [
        { x: 122, y: 126 },
        { x: 178, y: 164 },
        { x: 224, y: 212 },
        { x: 254, y: 238 },
        { x: 252, y: 338 },
        { x: 404, y: 390 },
        { x: 468, y: 446 },
        { x: 550, y: 538 },
        { x: 644, y: 678 },
        { x: 748, y: 742 },
        { x: 846, y: 704 },
        { x: 948, y: 644 },
        { x: 1016, y: 600 },
        { x: 1096, y: 504 },
        { x: 1188, y: 334 },
        { x: 1260, y: 404 },
        { x: 1320, y: 500 },
        { x: 1362, y: 560 },
        { x: 1418, y: 682 },
        { x: 1460, y: 784 }
      ]
    },
    {
      name: 'Nightfall Traverse',
      intro: 'Dusk drops in. Carry speed through the valley, then stitch the rising bridge cleanly.',
      palette: {
        skyTop: '#9dbce9',
        skyBottom: '#e9f3ff',
        sun: 'rgba(255,228,195,0.52)',
        mountainFar: '#7f93b3',
        mountainNear: '#596f93'
      },
      start: { x: 112, y: 134 },
      finish: { x: 1474, y: 768 },
      maxInk: 2960,
      parTime: 13.6,
      checkpoints: [
        { x: 248, y: 252, label: 'Gate 1' },
        { x: 452, y: 470, label: 'Gate 2' },
        { x: 676, y: 696, label: 'Gate 3' },
        { x: 928, y: 616, label: 'Gate 4' },
        { x: 1172, y: 366, label: 'Gate 5' },
        { x: 1364, y: 458, label: 'Gate 6' }
      ],
      hazards: [
        { x: 350, y: 328, r: 48, type: 'wind' },
        { x: 558, y: 774, r: 62, type: 'rock' },
        { x: 820, y: 694, r: 56, type: 'wind' },
        { x: 1048, y: 492, r: 68, type: 'rock' },
        { x: 1262, y: 536, r: 54, type: 'wind' },
        { x: 1422, y: 612, r: 58, type: 'rock' }
      ],
      demoTrack: [
        { x: 112, y: 134 },
        { x: 160, y: 172 },
        { x: 208, y: 216 },
        { x: 248, y: 252 },
        { x: 328, y: 328 },
        { x: 402, y: 418 },
        { x: 452, y: 470 },
        { x: 516, y: 556 },
        { x: 594, y: 646 },
        { x: 676, y: 696 },
        { x: 776, y: 690 },
        { x: 860, y: 648 },
        { x: 928, y: 616 },
        { x: 1020, y: 540 },
        { x: 1098, y: 432 },
        { x: 1172, y: 366 },
        { x: 1240, y: 390 },
        { x: 1310, y: 424 },
        { x: 1364, y: 458 },
        { x: 1422, y: 586 },
        { x: 1474, y: 768 }
      ]
    },
    {
      name: 'Stormglass Hollow',
      intro: 'The basin opens wide, then snaps shut. Build a patient line before the final drop.',
      palette: {
        skyTop: '#9cc8d4',
        skyBottom: '#eefcff',
        sun: 'rgba(244,255,255,0.55)',
        mountainFar: '#88a8ae',
        mountainNear: '#5b7f87'
      },
      start: { x: 118, y: 128 },
      finish: { x: 1458, y: 806 },
      maxInk: 3240,
      parTime: 15.1,
      checkpoints: [
        { x: 236, y: 220, label: 'Gate 1' },
        { x: 390, y: 412, label: 'Gate 2' },
        { x: 604, y: 684, label: 'Gate 3' },
        { x: 856, y: 768, label: 'Gate 4' },
        { x: 1088, y: 520, label: 'Gate 5' },
        { x: 1268, y: 336, label: 'Gate 6' },
        { x: 1392, y: 586, label: 'Gate 7' }
      ],
      hazards: [
        { x: 314, y: 290, r: 46, type: 'wind' },
        { x: 486, y: 530, r: 60, type: 'rock' },
        { x: 702, y: 760, r: 52, type: 'wind' },
        { x: 962, y: 664, r: 72, type: 'rock' },
        { x: 1152, y: 434, r: 48, type: 'wind' },
        { x: 1328, y: 452, r: 70, type: 'rock' }
      ],
      demoTrack: [
        { x: 118, y: 128 },
        { x: 170, y: 158 },
        { x: 212, y: 198 },
        { x: 236, y: 220 },
        { x: 278, y: 282 },
        { x: 340, y: 352 },
        { x: 390, y: 412 },
        { x: 452, y: 498 },
        { x: 526, y: 616 },
        { x: 604, y: 684 },
        { x: 704, y: 750 },
        { x: 804, y: 774 },
        { x: 856, y: 768 },
        { x: 944, y: 700 },
        { x: 1018, y: 612 },
        { x: 1088, y: 520 },
        { x: 1174, y: 418 },
        { x: 1268, y: 336 },
        { x: 1330, y: 418 },
        { x: 1392, y: 586 },
        { x: 1458, y: 806 }
      ]
    },
    {
      name: 'Summit Relay',
      intro: 'Last mountain. Seven gates, steep relay ridges, and no room for panic at the beacon.',
      palette: {
        skyTop: '#88b5ef',
        skyBottom: '#f5fbff',
        sun: 'rgba(255,240,214,0.58)',
        mountainFar: '#9babc7',
        mountainNear: '#586b8d'
      },
      start: { x: 108, y: 118 },
      finish: { x: 1482, y: 816 },
      maxInk: 3480,
      parTime: 16.9,
      checkpoints: [
        { x: 210, y: 202, label: 'Gate 1' },
        { x: 356, y: 372, label: 'Gate 2' },
        { x: 548, y: 620, label: 'Gate 3' },
        { x: 770, y: 784, label: 'Gate 4' },
        { x: 1008, y: 606, label: 'Gate 5' },
        { x: 1206, y: 332, label: 'Gate 6' },
        { x: 1398, y: 520, label: 'Gate 7' }
      ],
      hazards: [
        { x: 280, y: 254, r: 42, type: 'wind' },
        { x: 444, y: 478, r: 64, type: 'rock' },
        { x: 640, y: 736, r: 50, type: 'wind' },
        { x: 884, y: 736, r: 70, type: 'rock' },
        { x: 1098, y: 470, r: 56, type: 'wind' },
        { x: 1270, y: 454, r: 64, type: 'rock' },
        { x: 1440, y: 662, r: 54, type: 'wind' }
      ],
      demoTrack: [
        { x: 108, y: 118 },
        { x: 154, y: 148 },
        { x: 188, y: 182 },
        { x: 210, y: 202 },
        { x: 260, y: 254 },
        { x: 316, y: 324 },
        { x: 356, y: 372 },
        { x: 414, y: 450 },
        { x: 482, y: 554 },
        { x: 548, y: 620 },
        { x: 642, y: 738 },
        { x: 718, y: 788 },
        { x: 770, y: 784 },
        { x: 868, y: 726 },
        { x: 958, y: 644 },
        { x: 1008, y: 606 },
        { x: 1096, y: 510 },
        { x: 1206, y: 332 },
        { x: 1282, y: 372 },
        { x: 1350, y: 448 },
        { x: 1398, y: 520 },
        { x: 1446, y: 650 },
        { x: 1482, y: 816 }
      ]
    }
  ];

  const state = {
    mode: 'menu',
    levelIndex: 0,
    unlockedLevelCount: 1,
    bestTimes: {},
    track: [],
    metrics: null,
    pointerDown: false,
    inkUsed: 0,
    invalidReason: 'Draw a route that reaches the finish beacon.',
    nextGateIndex: 0,
    rider: null,
    elapsed: 0,
    crashTrail: [],
    particles: [],
    flash: 0,
    speedGlow: 0,
    shake: 0,
    lastFrame: 0,
    resultAction: 'retry',
    result: {
      banner: 'Crash report',
      title: 'Track failed',
      copy: 'Sharp turn at speed. Retry instantly or redraw.'
    }
  };

  let audio = null;

  function level() {
    return levels[state.levelIndex];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function pointLineDistance(point, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq <= 0.0001) {
      return distance(point, a);
    }
    const t = clamp(((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq, 0, 1);
    const closest = { x: a.x + abx * t, y: a.y + aby * t };
    return distance(point, closest);
  }

  function normalize(x, y) {
    const mag = Math.hypot(x, y) || 1;
    return { x: x / mag, y: y / mag };
  }

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function readProgress() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      state.unlockedLevelCount = clamp(Number(parsed.unlockedLevelCount) || 1, 1, levels.length);
      state.bestTimes = parsed.bestTimes && typeof parsed.bestTimes === 'object' ? parsed.bestTimes : {};
    } catch (_error) {
      state.unlockedLevelCount = 1;
      state.bestTimes = {};
    }
  }

  function saveProgress() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          unlockedLevelCount: state.unlockedLevelCount,
          bestTimes: state.bestTimes
        })
      );
    } catch (_error) {
      // Storage failure should not block play.
    }
  }

  function ensureAudio() {
    if (audio) {
      if (audio.context.state === 'suspended') {
        audio.context.resume().catch(() => {});
      }
      return audio;
    }
    if (typeof window.AudioContext !== 'function') {
      return audio;
    }
    const context = new window.AudioContext();
    const master = context.createGain();
    const musicBus = context.createGain();
    const sfxBus = context.createGain();
    const droneOsc = context.createOscillator();
    const airOsc = context.createOscillator();
    const pulseOsc = context.createOscillator();
    const airFilter = context.createBiquadFilter();
    const droneGain = context.createGain();
    const airGain = context.createGain();
    const pulseGain = context.createGain();
    master.gain.value = 0.11;
    musicBus.gain.value = 0.0001;
    sfxBus.gain.value = 1;
    droneOsc.type = 'triangle';
    airOsc.type = 'sawtooth';
    pulseOsc.type = 'sine';
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 940;
    droneGain.gain.value = 0.0001;
    airGain.gain.value = 0.0001;
    pulseGain.gain.value = 0.0001;
    droneOsc.connect(droneGain);
    airOsc.connect(airFilter);
    airFilter.connect(airGain);
    pulseOsc.connect(pulseGain);
    droneGain.connect(musicBus);
    airGain.connect(musicBus);
    pulseGain.connect(musicBus);
    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(context.destination);
    droneOsc.start();
    airOsc.start();
    pulseOsc.start();
    audio = {
      context,
      master,
      musicBus,
      sfxBus,
      droneOsc,
      airOsc,
      pulseOsc,
      airFilter,
      droneGain,
      airGain,
      pulseGain
    };
    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }
    return audio;
  }

  function playTone(type, frequency, duration, gain, offset) {
    const rig = ensureAudio();
    if (!rig) {
      return;
    }
    const startAt = rig.context.currentTime + (offset || 0);
    const oscillator = rig.context.createOscillator();
    const amp = rig.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    amp.gain.setValueAtTime(gain, startAt);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(amp);
    amp.connect(rig.sfxBus);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  }

  function playSfx(kind) {
    if (kind === 'gate') {
      playTone('triangle', 660, 0.12, 0.09, 0);
      playTone('triangle', 880, 0.15, 0.06, 0.04);
      return;
    }
    if (kind === 'crash') {
      playTone('sawtooth', 160, 0.22, 0.08, 0);
      playTone('square', 100, 0.18, 0.05, 0.03);
      return;
    }
    if (kind === 'clear') {
      playTone('triangle', 540, 0.12, 0.08, 0);
      playTone('triangle', 720, 0.14, 0.07, 0.08);
      playTone('triangle', 960, 0.18, 0.06, 0.16);
      playTone('sine', 1180, 0.24, 0.04, 0.18);
      return;
    }
    if (kind === 'draw') {
      playTone('sine', 420, 0.06, 0.025, 0);
      return;
    }
    if (kind === 'boost') {
      playTone('triangle', 300, 0.08, 0.03, 0);
      playTone('sine', 540, 0.16, 0.04, 0.05);
    }
  }

  function nudgeFlash(amount) {
    state.flash = Math.max(state.flash, amount);
  }

  function nudgeShake(amount) {
    state.shake = Math.max(state.shake, amount);
  }

  function spawnBurst(x, y, options = {}) {
    const {
      count = 10,
      color = '#ffffff',
      drift = 14,
      lifeMin = 0.2,
      lifeMax = 0.6,
      sizeMin = 3,
      sizeMax = 8,
      speedMin = 80,
      speedMax = 260
    } = options;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.8;
      const speed = lerp(speedMin, speedMax, Math.random());
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * drift,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * drift,
        life: lerp(lifeMin, lifeMax, Math.random()),
        age: 0,
        size: lerp(sizeMin, sizeMax, Math.random()),
        color
      });
    }
  }

  function updateParticles(dt) {
    if (!state.particles.length) {
      return;
    }
    state.particles = state.particles.filter((particle) => {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.985;
      particle.vy = particle.vy * 0.985 + 18 * dt;
      return particle.age < particle.life;
    });
  }

  function updateAudioMix() {
    if (!audio) {
      return;
    }
    const time = audio.context.currentTime;
    const speedRatio = state.rider ? clamp((state.rider.speed - 70) / 690, 0, 1) : 0;
    const gateRatio = level().checkpoints.length > 0 ? state.nextGateIndex / level().checkpoints.length : 1;
    const riding = state.mode === 'riding';
    const targetMusic =
      state.mode === 'menu' ? 0.012
      : state.mode === 'edit' ? 0.02
      : state.mode === 'clear' ? 0.034
      : state.mode === 'crashed' ? 0.01
      : 0.04 + speedRatio * 0.028;

    audio.musicBus.gain.setTargetAtTime(targetMusic, time, 0.12);
    audio.droneOsc.frequency.setTargetAtTime(84 + state.levelIndex * 9 + gateRatio * 18 + speedRatio * 24, time, 0.16);
    audio.airOsc.frequency.setTargetAtTime(180 + speedRatio * 210 + state.levelIndex * 8, time, 0.16);
    audio.pulseOsc.frequency.setTargetAtTime(2.1 + gateRatio * 1.6 + (riding ? speedRatio * 1.4 : 0), time, 0.22);
    audio.airFilter.frequency.setTargetAtTime(780 + speedRatio * 1500, time, 0.18);
    audio.droneGain.gain.setTargetAtTime(0.009 + gateRatio * 0.004, time, 0.18);
    audio.airGain.gain.setTargetAtTime(0.004 + speedRatio * 0.018, time, 0.18);
    audio.pulseGain.gain.setTargetAtTime(
      state.mode === 'clear' ? 0.016 : state.mode === 'crashed' ? 0.003 : 0.005 + speedRatio * 0.006,
      time,
      0.22
    );
  }

  function stageStatusText(index) {
    if (index >= state.unlockedLevelCount) {
      return 'locked';
    }
    const best = state.bestTimes[levels[index].name];
    return best ? `${best.toFixed(1)}s best` : 'open';
  }

  function renderStageStrip() {
    stageStrip.innerHTML = '';
    levels.forEach((entry, index) => {
      const chip = document.createElement('button');
      const locked = index >= state.unlockedLevelCount;
      chip.type = 'button';
      chip.className = `stage-chip${index === state.levelIndex ? ' active' : ''}${locked ? ' locked' : ''}`;
      chip.disabled = locked;
      chip.innerHTML = `<strong>${index + 1}. ${entry.name}</strong><span>${stageStatusText(index)}</span>`;
      chip.addEventListener('click', () => {
        if (!locked) {
          setLevel(index, { keepMenu: true });
        }
      });
      stageStrip.appendChild(chip);
    });
  }

  function smoothTrack(points) {
    if (points.length < 4) {
      return points.map(clonePoint);
    }
    let working = points.map(clonePoint);
    for (let pass = 0; pass < 2; pass += 1) {
      const next = [clonePoint(working[0])];
      for (let i = 1; i < working.length - 1; i += 1) {
        next.push({
          x: (working[i - 1].x + working[i].x * 2 + working[i + 1].x) / 4,
          y: (working[i - 1].y + working[i].y * 2 + working[i + 1].y) / 4
        });
      }
      next.push(clonePoint(working[working.length - 1]));
      working = next;
    }
    working[0] = clonePoint(points[0]);
    working[working.length - 1] = clonePoint(points[points.length - 1]);
    return working;
  }

  function recalcInk(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += distance(points[i - 1], points[i]);
    }
    return total;
  }

  function trackHitsHazard(points) {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      for (const hazard of level().hazards) {
        const margin = hazard.type === 'wind' ? 8 : 2;
        if (pointLineDistance({ x: hazard.x, y: hazard.y }, a, b) < hazard.r + margin) {
          return hazard.type === 'wind'
            ? 'Route cut through the gust ring. Go under or outside it.'
            : 'Route clipped a rock hazard. Pull the line wider.';
        }
      }
    }
    return '';
  }

  function trackCheckpointStatus(points) {
    const hit = level().checkpoints.map(() => false);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      level().checkpoints.forEach((checkpoint, index) => {
        if (!hit[index] && pointLineDistance(checkpoint, a, b) <= GATE_RADIUS) {
          hit[index] = true;
        }
      });
    }
    return hit;
  }

  function analyzeTrack(points) {
    if (points.length < 2) {
      return { valid: false, reason: 'Draw a route that reaches the finish beacon.', gates: [] };
    }
    if (distance(points[0], level().start) > 1) {
      return { valid: false, reason: 'Route must start at the left launch flag.', gates: [] };
    }
    if (distance(points[points.length - 1], level().finish) > 2) {
      return { valid: false, reason: 'Route must end on the finish beacon.', gates: [] };
    }
    if (state.inkUsed > level().maxInk) {
      return { valid: false, reason: 'Ink ran dry before the finish. Draw a tighter route.', gates: [] };
    }
    const hazardReason = trackHitsHazard(points);
    if (hazardReason) {
      return { valid: false, reason: hazardReason, gates: [] };
    }
    const gates = trackCheckpointStatus(points);
    const missed = gates.findIndex((entry) => !entry);
    if (missed >= 0) {
      return {
        valid: false,
        reason: `Route missed ${level().checkpoints[missed].label}. Keep the next goal inside the line.`,
        gates
      };
    }
    return { valid: true, reason: 'Track ready. Press Enter or Ride.', gates };
  }

  function buildTrackMetrics(points) {
    const segments = [];
    let totalLength = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const len = distance(a, b);
      if (len < 0.001) {
        continue;
      }
      const tangent = normalize(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(tangent.y, tangent.x);
      segments.push({
        a,
        b,
        len,
        tangent,
        angle,
        startDistance: totalLength,
        endDistance: totalLength + len
      });
      totalLength += len;
    }
    for (let i = 0; i < segments.length; i += 1) {
      const current = segments[i];
      const next = segments[i + 1];
      current.turn = next ? Math.abs(next.angle - current.angle) : 0;
      if (current.turn > Math.PI) {
        current.turn = Math.abs(current.turn - Math.PI * 2);
      }
    }
    return { segments, totalLength };
  }

  function pointAtDistance(metrics, travel) {
    const safeTravel = clamp(travel, 0, metrics.totalLength);
    let segment = metrics.segments[metrics.segments.length - 1];
    for (const candidate of metrics.segments) {
      if (safeTravel <= candidate.endDistance) {
        segment = candidate;
        break;
      }
    }
    const local = safeTravel - segment.startDistance;
    const t = clamp(local / segment.len, 0, 1);
    return {
      x: lerp(segment.a.x, segment.b.x, t),
      y: lerp(segment.a.y, segment.b.y, t),
      tangent: segment.tangent,
      turn: segment.turn || 0,
      segment
    };
  }

  function setMode(mode) {
    state.mode = mode;
    const showMenu = mode === 'menu';
    const showResult = mode === 'crashed' || mode === 'clear';
    menuScreen.classList.toggle('hidden', !showMenu);
    resultScreen.classList.toggle('hidden', !showResult);
  }

  function levelBestText() {
    const best = state.bestTimes[level().name];
    return best ? `Best ${best.toFixed(1)}s` : 'No clear yet';
  }

  function syncButtons() {
    actionBar.classList.toggle('hidden', state.mode === 'menu' || state.mode === 'riding' || state.mode === 'crashed' || state.mode === 'clear');

    const analysis = analyzeTrack(state.track);
    const rideReady = state.mode === 'edit' && analysis.valid;
    rideButton.disabled = state.mode !== 'edit';
    rideButton.textContent = rideReady ? 'Ride' : 'Finish route to ride';

    const canClear = state.mode === 'edit' && state.track.length > 1;
    clearButton.disabled = !canClear;

    if (state.mode === 'clear') {
      if (state.levelIndex < levels.length - 1) {
        retryButton.textContent = 'Next stage';
        redrawButton.textContent = 'Replay stage';
      } else {
        retryButton.textContent = 'Replay finale';
        redrawButton.textContent = 'Back to stage 1';
      }
      return;
    }
    retryButton.textContent = 'Retry ride';
    redrawButton.textContent = 'Redraw track';
  }

  function syncHud() {
    syncButtons();

    const inkRatio = clamp(state.inkUsed / level().maxInk, 0, 1);
    hudInk.textContent = `Stage ${state.levelIndex + 1}/${levels.length} | Ink ${Math.round(inkRatio * 100)}%`;
    const nextGate = level().checkpoints[state.nextGateIndex];
    hudGoal.textContent = nextGate
      ? `${level().name} | Next: ${nextGate.label} | ${levelBestText()}`
      : `${level().name} | Finish | ${levelBestText()}`;

    if (state.mode === 'menu') {
      hudMode.textContent = `Stage ${state.levelIndex + 1}: ${level().name}`;
      hudStatus.textContent = level().intro;
      return;
    }
    if (state.mode === 'riding') {
      hudMode.textContent = 'Ride live';
      hudStatus.textContent = `Speed ${Math.round(state.rider?.speed || 0)} | Par ${level().parTime.toFixed(1)}s`;
      return;
    }
    if (state.mode === 'crashed') {
      hudMode.textContent = 'Crash reset ready';
      hudStatus.textContent = state.result.copy;
      return;
    }
    if (state.mode === 'clear') {
      hudMode.textContent = 'Run clear';
      hudStatus.textContent = `Clear ${state.elapsed.toFixed(1)}s | Par ${level().parTime.toFixed(1)}s`;
      return;
    }

    hudMode.textContent = 'Draw a route';
    hudStatus.textContent = state.invalidReason;
  }

  function syncMenu() {
    if (state.mode !== 'menu') {
      return;
    }
    syncButtons();
    resultBanner.textContent = state.levelIndex + 1 >= state.unlockedLevelCount ? 'Stage briefing' : 'Unlocked stage';
    resultTitle.textContent = level().name;
    resultCopy.textContent = level().intro;
    startButton.textContent = `Start stage ${state.levelIndex + 1}`;
    menuDemoButton.textContent = `Load ${level().name} demo`;
    renderStageStrip();
  }

  function setResult(banner, title, copy, action) {
    state.result = { banner, title, copy };
    state.resultAction = action || 'retry';
    resultBanner.textContent = banner;
    resultTitle.textContent = title;
    resultCopy.textContent = copy;
    syncButtons();
  }

  function resetTrack() {
    state.track = [clonePoint(level().start)];
    state.metrics = null;
    state.pointerDown = false;
    state.inkUsed = 0;
    state.nextGateIndex = 0;
    state.rider = null;
    state.elapsed = 0;
    state.crashTrail = [];
    state.invalidReason = 'Drag from the start flag to the finish beacon.';
    setMode('edit');
    syncHud();
  }

  function loadTrack(points) {
    state.track = points.map(clonePoint);
    state.track[0] = clonePoint(level().start);
    state.track[state.track.length - 1] = clonePoint(level().finish);
    state.inkUsed = recalcInk(state.track);
    const analysis = analyzeTrack(state.track);
    state.invalidReason = analysis.reason;
    state.metrics = analysis.valid ? buildTrackMetrics(state.track) : null;
    state.nextGateIndex = 0;
    state.rider = null;
    state.elapsed = 0;
    state.crashTrail = [];
    setMode('edit');
    syncHud();
  }

  function beginRide() {
    const analysis = analyzeTrack(state.track);
    state.invalidReason = analysis.reason;
    if (!analysis.valid) {
      setMode('edit');
      syncHud();
      return false;
    }

    state.metrics = buildTrackMetrics(state.track);
    state.rider = {
      travel: 0,
      speed: 190,
      x: level().start.x,
      y: level().start.y,
      rotation: 0,
      gateIndex: 0
    };
    state.nextGateIndex = 0;
    state.elapsed = 0;
    state.crashTrail = [];
    state.particles = [];
    state.flash = 0;
    state.speedGlow = 0;
    state.shake = 0;
    setMode('riding');
    syncHud();
    return true;
  }

  function attemptRide() {
    if (state.mode !== 'edit') {
      return false;
    }
    const analysis = analyzeTrack(state.track);
    if (!analysis.valid) {
      state.invalidReason =
        state.track.length > 1
          ? `${analysis.reason} Need a quick example? Load the demo track.`
          : analysis.reason;
      syncHud();
      return false;
    }
    return beginRide();
  }

  function crash(copy, point = state.rider) {
    playSfx('crash');
    if (point) {
      spawnBurst(point.x, point.y, {
        color: '#e24869',
        count: 18,
        lifeMin: 0.24,
        lifeMax: 0.7,
        sizeMin: 4,
        sizeMax: 10,
        speedMin: 90,
        speedMax: 300
      });
    }
    nudgeFlash(0.95);
    nudgeShake(14);
    setResult('Crash report', 'Track failed', copy, 'retry');
    setMode('crashed');
    syncHud();
  }

  function unlockNextLevel() {
    state.unlockedLevelCount = Math.max(state.unlockedLevelCount, Math.min(levels.length, state.levelIndex + 2));
    saveProgress();
  }

  function completeStage() {
    const levelName = level().name;
    const best = state.bestTimes[levelName];
    if (!best || state.elapsed < best) {
      state.bestTimes[levelName] = state.elapsed;
    }
    unlockNextLevel();
    saveProgress();

    const beatPar = state.elapsed <= level().parTime;
    const isFinal = state.levelIndex === levels.length - 1;
    const clearCopy = beatPar
      ? `Par beaten. ${state.elapsed.toFixed(1)}s on ${levelName}.`
      : `Stage clear in ${state.elapsed.toFixed(1)}s. Push lower than ${level().parTime.toFixed(1)}s next run.`;

    if (isFinal) {
      setResult('Circuit clear', 'Full descent finished', `${clearCopy} All seven mountains are now unlocked.`, 'campaign-reset');
    } else {
      setResult(
        'Course clear',
        `${levelName} cleared`,
        `${clearCopy} Stage ${state.levelIndex + 2} unlocked.`,
        'next'
      );
    }
    playSfx('clear');
    spawnBurst(level().finish.x, level().finish.y - 30, {
      color: '#ffd9ad',
      count: 24,
      lifeMin: 0.35,
      lifeMax: 0.9,
      sizeMin: 4,
      sizeMax: 12,
      speedMin: 120,
      speedMax: 340
    });
    nudgeFlash(0.85);
    nudgeShake(8);
    setMode('clear');
    syncHud();
  }

  function addTrackPoint(x, y) {
    const point = {
      x: clamp(x, 90, WORLD.width - 90),
      y: clamp(y, 90, WORLD.height - 90)
    };
    const last = state.track[state.track.length - 1];
    if (distance(last, point) < MIN_POINT_STEP) {
      return;
    }
    const nextTrack = state.track.concat(point);
    const nextInk = recalcInk(nextTrack);
    if (nextInk > level().maxInk + 40) {
      return;
    }
    state.track = nextTrack;
    state.inkUsed = nextInk;
    state.invalidReason = analyzeTrack(state.track).reason;
    playSfx('draw');
    syncHud();
  }

  function finishTrack() {
    if (state.track.length <= 1) {
      state.invalidReason = 'Draw a route that reaches the finish beacon.';
      syncHud();
      return;
    }
    const last = state.track[state.track.length - 1];
    if (distance(last, level().finish) < 70) {
      state.track[state.track.length - 1] = clonePoint(level().finish);
    }
    state.track = smoothTrack(state.track);
    state.track[0] = clonePoint(level().start);
    if (distance(state.track[state.track.length - 1], level().finish) < 70) {
      state.track[state.track.length - 1] = clonePoint(level().finish);
    }
    state.inkUsed = recalcInk(state.track);
    state.invalidReason = analyzeTrack(state.track).reason;
    syncHud();
  }

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function onPointerDown(event) {
    if (state.mode === 'riding') {
      return;
    }
    ensureAudio();
    const point = toCanvasPoint(event);
    if (distance(point, level().start) > 70 && state.mode === 'menu') {
      setMode('edit');
    }
    resetTrack();
    state.pointerDown = true;
    addTrackPoint(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!state.pointerDown || state.mode === 'riding') {
      return;
    }
    const point = toCanvasPoint(event);
    addTrackPoint(point.x, point.y);
  }

  function onPointerUp(event) {
    if (!state.pointerDown) {
      return;
    }
    const point = toCanvasPoint(event);
    addTrackPoint(point.x, point.y);
    state.pointerDown = false;
    finishTrack();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function advanceRide(dt) {
    if (!state.rider || !state.metrics) {
      return;
    }

    state.elapsed += dt;
    const ridePoint = pointAtDistance(state.metrics, state.rider.travel);
    const downhillForce = ridePoint.tangent.y * 560;
    const friction = 126;
    state.rider.speed += (downhillForce - friction) * dt;
    if (ridePoint.segment.turn > 1.02 && state.rider.speed > 520) {
      state.crashTrail.push({ x: ridePoint.x, y: ridePoint.y, age: 0 });
      if (state.crashTrail.length > CRASH_HISTORY) {
        state.crashTrail.shift();
      }
      crash('Sharp corner at too much speed. Flatten the turn or bleed speed earlier.');
      return;
    }
    state.rider.speed = clamp(state.rider.speed, 70, 760);
    state.rider.travel += state.rider.speed * dt;

    const nextPoint = pointAtDistance(state.metrics, state.rider.travel);
    state.rider.x = nextPoint.x;
    state.rider.y = nextPoint.y;
    state.rider.rotation = Math.atan2(nextPoint.tangent.y, nextPoint.tangent.x);

    const checkpoint = level().checkpoints[state.rider.gateIndex];
    if (checkpoint && distance(nextPoint, checkpoint) <= GATE_RADIUS + 18) {
      state.rider.gateIndex += 1;
      state.nextGateIndex = state.rider.gateIndex;
      playSfx('gate');
      syncHud();
    }

    if (state.rider.travel >= state.metrics.totalLength - 6) {
      if (state.rider.gateIndex >= level().checkpoints.length) {
        completeStage();
      } else {
        crash('Finish reached without every gate. Route the line through each lit marker.');
      }
    }
  }

  function drawBackground() {
    const palette = level().palette;
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = palette.sun;
    ctx.beginPath();
    ctx.arc(220, 140, 84, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.mountainFar;
    ctx.beginPath();
    ctx.moveTo(0, 900);
    ctx.lineTo(0, 520);
    ctx.lineTo(250, 410);
    ctx.lineTo(520, 620);
    ctx.lineTo(800, 460);
    ctx.lineTo(1080, 660);
    ctx.lineTo(1360, 390);
    ctx.lineTo(1600, 540);
    ctx.lineTo(1600, 900);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.mountainNear;
    ctx.beginPath();
    ctx.moveTo(0, 900);
    ctx.lineTo(0, 620);
    ctx.lineTo(180, 720);
    ctx.lineTo(420, 520);
    ctx.lineTo(680, 730);
    ctx.lineTo(900, 560);
    ctx.lineTo(1220, 760);
    ctx.lineTo(1600, 560);
    ctx.lineTo(1600, 900);
    ctx.closePath();
    ctx.fill();
  }

  function drawHazards() {
    level().hazards.forEach((hazard) => {
      if (hazard.type === 'wind') {
        ctx.strokeStyle = 'rgba(130, 196, 255, 0.85)';
        ctx.lineWidth = 5;
        ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(130, 196, 255, 0.12)';
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.fillStyle = '#4a5869';
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(hazard.x - hazard.r * 0.25, hazard.y - hazard.r * 0.28, hazard.r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFlags() {
    const start = level().start;
    const finish = level().finish;
    ctx.strokeStyle = '#17395e';
    ctx.lineWidth = 6;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 46);
    ctx.lineTo(start.x, start.y + 32);
    ctx.stroke();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 44);
    ctx.lineTo(start.x + 46, start.y - 28);
    ctx.lineTo(start.x, start.y - 10);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(finish.x, finish.y - 60);
    ctx.lineTo(finish.x, finish.y + 36);
    ctx.stroke();
    ctx.fillStyle = '#31c26d';
    ctx.beginPath();
    ctx.moveTo(finish.x, finish.y - 58);
    ctx.lineTo(finish.x + 56, finish.y - 36);
    ctx.lineTo(finish.x, finish.y - 14);
    ctx.closePath();
    ctx.fill();
  }

  function drawCheckpoints() {
    level().checkpoints.forEach((checkpoint, index) => {
      const active = index === state.nextGateIndex;
      const cleared = index < state.nextGateIndex;
      ctx.strokeStyle = cleared ? 'rgba(49, 194, 109, 0.9)' : active ? '#f3c53f' : 'rgba(243, 197, 63, 0.35)';
      ctx.lineWidth = active ? 7 : 4;
      ctx.setLineDash(active ? [] : [8, 12]);
      ctx.beginPath();
      ctx.arc(checkpoint.x, checkpoint.y, GATE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = active ? '#7a5700' : 'rgba(16, 35, 56, 0.58)';
      ctx.font = 'bold 16px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText(checkpoint.label, checkpoint.x, checkpoint.y - 58);
    });
  }

  function drawTrack() {
    if (state.track.length < 2) {
      return;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(143, 211, 255, 0.62)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(state.track[0].x, state.track[0].y);
    for (let i = 1; i < state.track.length; i += 1) {
      ctx.lineTo(state.track[i].x, state.track[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#17395e';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(state.track[0].x, state.track[0].y);
    for (let i = 1; i < state.track.length; i += 1) {
      ctx.lineTo(state.track[i].x, state.track[i].y);
    }
    ctx.stroke();
  }

  function drawSled() {
    if (!state.rider) {
      return;
    }
    ctx.save();
    ctx.translate(state.rider.x, state.rider.y);
    ctx.rotate(state.rider.rotation);
    ctx.fillStyle = '#c73654';
    ctx.fillRect(-26, -10, 46, 14);
    ctx.fillStyle = '#1f2c3b';
    ctx.beginPath();
    ctx.arc(2, -14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#60341f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-28, 8);
    ctx.lineTo(18, 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrashTrail(dt) {
    if (!state.crashTrail.length) {
      return;
    }
    for (const spark of state.crashTrail) {
      spark.age += dt;
      const alpha = clamp(1 - spark.age * 2.2, 0, 1);
      ctx.fillStyle = `rgba(226, 72, 105, ${alpha})`;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, 18 * alpha + 8, 0, Math.PI * 2);
      ctx.fill();
    }
    state.crashTrail = state.crashTrail.filter((spark) => spark.age < 0.45);
  }

  function render(dt) {
    drawBackground();
    drawHazards();
    drawCheckpoints();
    drawFlags();
    drawTrack();
    drawSled();
    drawCrashTrail(dt);
  }

  function loop(now) {
    const dt = clamp((now - (state.lastFrame || now)) / 1000, 0, 0.033);
    state.lastFrame = now;
    if (state.mode === 'riding') {
      advanceRide(dt);
    }
    render(dt);
    requestAnimationFrame(loop);
  }

  function setLevel(index, options) {
    const nextIndex = clamp(index, 0, Math.max(0, state.unlockedLevelCount - 1));
    state.levelIndex = nextIndex;
    state.pointerDown = false;
    state.track = [clonePoint(level().start)];
    state.metrics = null;
    state.inkUsed = 0;
    state.invalidReason = 'Drag from the start flag to the finish beacon.';
    state.nextGateIndex = 0;
    state.rider = null;
    state.elapsed = 0;
    state.crashTrail = [];
    setMode(options && options.keepMenu ? 'menu' : 'edit');
    syncMenu();
    syncHud();
  }

  function advanceResultAction() {
    if (state.mode === 'clear' && state.resultAction === 'next' && state.levelIndex < levels.length - 1) {
      setLevel(state.levelIndex + 1, { keepMenu: false });
      return;
    }
    if (state.mode === 'clear' && state.resultAction === 'campaign-reset') {
      setLevel(0, { keepMenu: true });
      return;
    }
    beginRide();
  }

  function handleSecondaryAction() {
    if (state.mode === 'clear' && state.resultAction === 'next') {
      resetTrack();
      return;
    }
    if (state.mode === 'clear' && state.resultAction === 'campaign-reset') {
      setLevel(0, { keepMenu: false });
      return;
    }
    resetTrack();
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        ensureAudio();
        if (state.mode === 'menu') {
          resetTrack();
          return;
        }
        if (state.mode === 'edit') {
          attemptRide();
          return;
        }
        if (state.mode === 'crashed' || state.mode === 'clear') {
          advanceResultAction();
        }
      }
      if (event.key === 'c' || event.key === 'C') {
        resetTrack();
      }
      if (event.key === '[') {
        setLevel(state.levelIndex - 1, { keepMenu: state.mode === 'menu' });
      }
      if (event.key === ']') {
        setLevel(state.levelIndex + 1, { keepMenu: state.mode === 'menu' });
      }
    });

    startButton.addEventListener('click', () => {
      ensureAudio();
      resetTrack();
    });
    rideButton.addEventListener('click', () => {
      ensureAudio();
      attemptRide();
    });
    clearButton.addEventListener('click', resetTrack);
    demoButton.addEventListener('click', () => loadTrack(level().demoTrack));
    menuDemoButton.addEventListener('click', () => loadTrack(level().demoTrack));
    retryButton.addEventListener('click', () => {
      ensureAudio();
      advanceResultAction();
    });
    redrawButton.addEventListener('click', handleSecondaryAction);
  }

  function exposeDebugApi() {
    window.__lineRiderRush = {
      getState() {
        return {
          mode: state.mode,
          levelIndex: state.levelIndex,
          levelName: level().name,
          unlockedLevelCount: state.unlockedLevelCount,
          inkUsed: state.inkUsed,
          nextGateIndex: state.nextGateIndex,
          elapsed: state.elapsed,
          invalidReason: state.invalidReason,
          hasTrack: state.track.length > 1,
          rider: state.rider
            ? {
                x: state.rider.x,
                y: state.rider.y,
                speed: state.rider.speed,
                gateIndex: state.rider.gateIndex
              }
            : null
        };
      },
      setLevel(index) {
        setLevel(index, { keepMenu: false });
      },
      goToMenu(index) {
        setLevel(typeof index === 'number' ? index : state.levelIndex, { keepMenu: true });
      },
      loadDemoTrack(index) {
        if (typeof index === 'number') {
          setLevel(index, { keepMenu: false });
        }
        loadTrack(level().demoTrack);
      },
      startRide() {
        return beginRide();
      },
      forceRideDemo(index) {
        if (typeof index === 'number') {
          setLevel(index, { keepMenu: false });
        }
        state.track = level().demoTrack.map(clonePoint);
        state.inkUsed = recalcInk(state.track);
        state.metrics = buildTrackMetrics(state.track);
        state.rider = {
          travel: 0,
          speed: 190,
          x: level().start.x,
          y: level().start.y,
          rotation: 0,
          gateIndex: 0
        };
        state.nextGateIndex = 0;
        state.elapsed = 0;
        state.crashTrail = [];
        setMode('riding');
        syncHud();
        return true;
      },
      resetTrack() {
        resetTrack();
      },
      clearStorage() {
        window.localStorage.removeItem(STORAGE_KEY);
        state.unlockedLevelCount = 1;
        state.bestTimes = {};
        setLevel(0, { keepMenu: true });
      },
      getProgress() {
        return {
          unlockedLevelCount: state.unlockedLevelCount,
          bestTimes: state.bestTimes
        };
      },
      getLevelCount() {
        return levels.length;
      }
    };
  }

  function boot() {
    readProgress();
    setLevel(0, { keepMenu: true });
    bindEvents();
    exposeDebugApi();
    syncMenu();
    syncButtons();
    syncHud();
    requestAnimationFrame(loop);
  }

  boot();
})();
