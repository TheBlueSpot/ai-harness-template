import { GAME_CONFIG, WAVE_TYPES, WAVES } from "./data.js";
import { createGameState, resetDynamicState } from "./state.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(seed) {
  const x = Math.sin(seed * 999.1) * 10000;
  return x - Math.floor(x);
}

function nextWave(state) {
  return WAVES[Math.min(WAVES.length - 1, state.waveIndex)];
}

function spawnEnemy(state) {
  const wave = nextWave(state);
  const seed = state.time * 3.1 + state.score * 0.01 + state.airEnemies.length + state.groundTargets.length;
  const makeAir = rand(seed) < wave.airChance || state.groundTargets.length > state.airEnemies.length + 1;
  const x = 120 + rand(seed + 2) * (state.width - 240);
  if (makeAir) {
    const spec = WAVE_TYPES.air;
    state.airEnemies.push({
      kind: spec.kind,
      x,
      y: spec.yMin + rand(seed + 5) * (spec.yMax - spec.yMin),
      hp: spec.hp,
      score: spec.score,
      drift: spec.driftMin + rand(seed + 6) * (spec.driftMax - spec.driftMin),
    });
    return;
  }
  const spec = WAVE_TYPES.ground;
  state.groundTargets.push({
    kind: spec.kind,
    x,
    y: state.height * spec.yMin + rand(seed + 4) * state.height * (spec.yMax - spec.yMin),
    hp: spec.hp,
    score: spec.score,
    pulse: 0,
  });
}

function fireShot(state, kind) {
  const cooldownKey = kind === "air" ? "fireAir" : "fireGround";
  if (state.player[cooldownKey] > 0) return;
  state.player[cooldownKey] = GAME_CONFIG.fireCooldown;
  state.shots.push({
    kind,
    x: state.player.x,
    y: state.player.y - 18,
    vy: kind === "air" ? -720 : 820,
    life: GAME_CONFIG.shotLife,
  });
}

function buildFrame(state) {
  const ground = state.groundTargets.map((entity) => ({ ...entity }));
  const air = state.airEnemies.map((entity) => ({ ...entity }));
  return {
    width: state.width,
    height: state.height,
    mode: state.mode,
    score: state.score,
    lives: state.lives,
    radar: state.radar,
    scroll: state.scroll,
    banner: state.banner,
    alert: state.alert,
    overlayEyebrow: state.mode === "win" ? "Success" : state.mode === "lose" ? "Failure" : "Mission",
    overlayTitle: "Xevious Sky Assault",
    overlayCopy:
      state.mode === "menu"
        ? "Arrow keys move. Space or Z fires air targets. X or Ctrl fires ground targets."
        : state.mode === "win"
          ? "Run complete. Press Start to play again."
          : state.mode === "lose"
            ? "Ship lost. Press Start for an instant retry."
            : "Two fire modes. Keep radar pressure low and the trench readable.",
    overlayButton: state.mode === "menu" ? "Start" : "Restart",
    player: { ...state.player },
    airEnemies: air,
    groundTargets: ground,
    shots: state.shots.map((shot) => ({ ...shot })),
    bombs: state.bombs.map((bomb) => ({ ...bomb })),
    radarMarks: state.radarMarks.map((mark) => ({ ...mark })),
    trench: {
      top: state.height * GAME_CONFIG.trenchTopRatio,
    },
    hud: {
      score: state.score,
      lives: state.lives,
      radar: state.radar,
      alert: state.alert,
    },
    stripes: state.stripes.map((stripe) => ({ ...stripe })),
  };
}

export class Game {
  constructor() {
    this.state = createGameState();
  }

  resize(widthOrSize, height) {
    const width = typeof widthOrSize === "object" ? widthOrSize.width : widthOrSize;
    const nextHeight = typeof widthOrSize === "object" ? widthOrSize.height : height;
    this.state.width = width ?? this.state.width;
    this.state.height = nextHeight ?? this.state.height;
    this.state.player.x = clamp(this.state.player.x, 80, this.state.width - 80);
    this.state.player.y = clamp(this.state.player.y, 90, this.state.height - 70);
  }

  restart() {
    resetDynamicState(this.state);
  }

  start() {
    if (this.state.mode === "menu") {
      this.state.mode = "play";
      this.state.banner = "Air and ground targets live";
      this.state.alert = "Engage";
    } else if (this.state.mode === "lose" || this.state.mode === "win") {
      this.restart();
      this.state.mode = "play";
      this.state.banner = "Air and ground targets live";
      this.state.alert = "Engage";
    }
  }

  update(dt, input) {
    const state = this.state;
    state.time += dt;
    if (state.mode === "menu") {
      state.alert = "Press Start";
      if (input.pressed.Enter || input.pressed.Space) this.start();
      return;
    }
    if (state.mode === "lose" || state.mode === "win") {
      if (input.pressed.Enter || input.pressed.Space) this.start();
      return;
    }

    const held = input.held || {};
    const steer = (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
    const thrust = (held.ArrowDown || held.KeyS ? 1 : 0) - (held.ArrowUp || held.KeyW ? 1 : 0);
    state.player.x = clamp(state.player.x + steer * dt * GAME_CONFIG.playerSpeedX, 80, state.width - 80);
    state.player.y = clamp(state.player.y + thrust * dt * GAME_CONFIG.playerSpeedY, 90, state.height - 70);
    state.player.angle = steer * 0.18;
    state.player.fireAir = Math.max(0, state.player.fireAir - dt);
    state.player.fireGround = Math.max(0, state.player.fireGround - dt);

    if (input.pressed.Space || input.pressed.KeyZ || held.Space || held.KeyZ) fireShot(state, "air");
    if (input.pressed.KeyX || input.pressed.ControlLeft || held.KeyX || held.ControlLeft) fireShot(state, "ground");

    state.scroll += dt * GAME_CONFIG.scrollSpeed;
    state.radar = clamp(state.scroll / 1600, 0, 1);

    const wave = nextWave(state);
    state.nextSpawn -= dt;
    if (state.nextSpawn <= 0) {
      spawnEnemy(state);
      state.waveIndex = state.radar >= wave.afterRadar ? Math.min(WAVES.length - 1, state.waveIndex + 1) : state.waveIndex;
      state.nextSpawn = wave.interval;
      if (state.airEnemies.length + state.groundTargets.length >= wave.maxActive) {
        state.nextSpawn += 0.15;
      }
    }

    for (const enemy of state.airEnemies) {
      enemy.x += Math.sin(state.time * 1.8 + enemy.y) * dt * 60 + enemy.drift * dt * 90;
      enemy.y += dt * 20;
    }
    for (const target of state.groundTargets) target.pulse += dt;

    for (const shot of state.shots) {
      shot.y += shot.vy * dt;
      shot.life -= dt;
    }
    state.shots = state.shots.filter((shot) => shot.life > 0 && shot.y > -20 && shot.y < state.height + 20);

    for (const bomb of state.bombs) {
      bomb.y += bomb.vy * dt;
      bomb.life -= dt;
    }
    state.bombs = state.bombs.filter((bomb) => bomb.life > 0 && bomb.y < state.height + 30);

    for (const enemy of state.airEnemies) {
      if (rand(enemy.x + state.time) > 0.995) {
        state.bombs.push({ x: enemy.x, y: enemy.y, vy: 260, life: GAME_CONFIG.bombLife });
      }
    }

    for (let i = state.airEnemies.length - 1; i >= 0; i -= 1) {
      if (state.airEnemies[i].y > state.height + 30) state.airEnemies.splice(i, 1);
    }

    for (let s = state.shots.length - 1; s >= 0; s -= 1) {
      const shot = state.shots[s];
      const pool = shot.kind === "air" ? state.airEnemies : state.groundTargets;
      for (let e = pool.length - 1; e >= 0; e -= 1) {
        const enemy = pool[e];
        const yRange = enemy.kind === "ground" ? 30 : 22;
        if (Math.abs(shot.x - enemy.x) >= 24 || Math.abs(shot.y - enemy.y) >= yRange) continue;
        enemy.hp -= 1;
        shot.life = 0;
        if (enemy.hp <= 0) {
          state.score += enemy.score;
          pool.splice(e, 1);
          if (enemy.kind === "ground") state.banner = "Trench clear";
        }
        break;
      }
    }

    for (const bomb of state.bombs) {
      const hitPlayer = Math.abs(bomb.x - state.player.x) < 20 && Math.abs(bomb.y - state.player.y) < 18;
      if (!hitPlayer) continue;
      bomb.life = 0;
      state.lives -= 1;
      state.alert = "Hit!";
      if (state.lives <= 0) {
        state.over = true;
        state.mode = "lose";
        state.banner = "Retry fast";
        return;
      }
    }

    if (state.radar > GAME_CONFIG.winRadarThreshold && state.airEnemies.length + state.groundTargets.length < 4) {
      state.over = true;
      state.mode = "win";
      state.banner = "Mission clear";
      state.alert = "Base secured";
    }

    state.radarMarks = [...state.airEnemies, ...state.groundTargets].slice(0, 10).map((enemy) => ({
      x: enemy.x / state.width,
      y: enemy.y / state.height,
      threat: enemy.kind === "ground",
    }));
    state.stripes = Array.from({ length: 6 }, (_, index) => ({
      x: ((state.scroll * 1.6 + index * 220) % (state.width + 220)) - 110,
      y: state.height * 0.58 + (index % 2) * 10,
      w: 90,
      h: 4,
    }));
  }

  getFrameState() {
    return buildFrame(this.state);
  }
}
