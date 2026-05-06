const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const state = {
  w: 0,
  h: 0,
  lanes: 6,
  laneY: [],
  player: { lane: 3, x: 0, y: 0, shotCooldown: 0, alive: true, respawn: 0 },
  shots: [],
  segments: [],
  splats: [],
  score: 0,
  best: Number(localStorage.getItem("centipede-webline-best") || 0),
  over: false,
  spawnTimer: 0,
  wave: 1,
  waveDelay: 0,
  keys: new Set(),
  fireHeld: false,
};

class Game {
  start() {
    this.resize();
    this.reset();
    addEventListener("resize", () => this.resize());
    addEventListener("keydown", (event) => this.onKeyDown(event));
    addEventListener("keyup", (event) => state.keys.delete(event.key));
    requestAnimationFrame((time) => this.loop(time));
  }

  resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    state.w = innerWidth;
    state.h = innerHeight;
    state.laneY = Array.from({ length: state.lanes }, (_, index) => {
      const top = state.h * 0.18;
      const bottom = state.h * 0.88;
      return top + ((bottom - top) * index) / (state.lanes - 1);
    });
    state.player.x = state.w * 0.5;
    this.snapPlayer();
  }

  reset() {
    state.player.lane = Math.floor(state.lanes / 2);
    state.player.shotCooldown = 0;
    state.player.alive = true;
    state.player.respawn = 0;
    state.shots = [];
    state.segments = this.makeCentipede();
    state.splats = [];
    state.score = 0;
    state.over = false;
    state.spawnTimer = 0;
    state.wave = 1;
    state.waveDelay = 0;
  }

  makeCentipede() {
    const body = [];
    for (let index = 0; index < 10; index += 1) {
      body.push({ lane: 0, x: 80 - index * 34, dir: 1, alive: true, head: index === 0 });
    }
    return body;
  }

  snapPlayer() {
    state.player.y = state.laneY[state.player.lane] || state.h * 0.6;
  }

  onKeyDown(event) {
    const key = event.key.toLowerCase();
    state.keys.add(event.key);
    if ((key === " " || key === "enter") && (state.over || state.player.respawn > 0)) {
      this.reset();
      return;
    }
    if (!state.player.alive || state.over) {
      return;
    }
    if (key === "arrowup" || key === "w") {
      state.player.lane = Math.max(0, state.player.lane - 1);
    }
    if (key === "arrowdown" || key === "s") {
      state.player.lane = Math.min(state.lanes - 1, state.player.lane + 1);
    }
    this.snapPlayer();
    if (key === " " || key === "enter") {
      state.fireHeld = true;
    }
  }

  loop(time) {
    if (!this.last) {
      this.last = time;
    }
    const dt = Math.min(0.033, (time - this.last) / 1000);
    this.last = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(dt) {
    if (state.over) {
      return;
    }
    state.player.shotCooldown = Math.max(0, state.player.shotCooldown - dt);
    state.waveDelay = Math.max(0, state.waveDelay - dt);
    if (state.player.respawn > 0) {
      state.player.respawn = Math.max(0, state.player.respawn - dt);
    }
    if (state.fireHeld && state.player.shotCooldown === 0 && state.player.respawn === 0) {
      state.shots.push({ x: state.player.x + 18, y: state.player.y, vx: 640 });
      state.player.shotCooldown = 0.18;
      state.fireHeld = false;
    }
    this.moveCentipede(dt);
    this.moveShots(dt);
    this.updateSplats(dt);
    this.checkCollisions();
    if (state.segments.length === 0 && state.waveDelay === 0) {
      state.wave += 1;
      state.waveDelay = 1.0;
      state.segments = this.makeCentipede().map((segment, index) => ({
        ...segment,
        x: 80 - index * 34,
        lane: Math.floor(Math.random() * state.lanes),
        dir: 1,
      }));
      state.segments.forEach((segment, index) => {
        segment.head = index === 0;
      });
    }
    if (state.player.respawn === 0 && !state.player.alive) {
      state.over = true;
      localStorage.setItem("centipede-webline-best", String(state.best));
    }
  }

  moveCentipede(dt) {
    const speed = 78 + state.wave * 10;
    const lanes = state.lanes;
    for (let index = 0; index < state.segments.length; index += 1) {
      const segment = state.segments[index];
      if (!segment.alive) {
        continue;
      }
      segment.x += segment.dir * speed * dt;
      if (segment.x < 34 || segment.x > state.w - 34) {
        segment.dir *= -1;
        segment.x = Math.max(34, Math.min(state.w - 34, segment.x));
        segment.lane = Math.min(lanes - 1, Math.max(0, segment.lane + (Math.random() > 0.5 ? 1 : -1)));
      }
      if (Math.random() < 0.007 * dt * 60) {
        segment.lane = Math.min(lanes - 1, Math.max(0, segment.lane + (Math.random() > 0.5 ? 1 : -1)));
      }
    }
    state.segments.sort((left, right) => left.x - right.x);
    state.segments.forEach((segment, index) => {
      segment.head = index === 0;
    });
  }

  moveShots(dt) {
    for (const shot of state.shots) {
      shot.x += shot.vx * dt;
    }
    state.shots = state.shots.filter((shot) => shot.x < state.w + 30);
  }

  updateSplats(dt) {
    for (const splat of state.splats) {
      splat.life -= dt;
    }
    state.splats = state.splats.filter((splat) => splat.life > 0);
  }

  checkCollisions() {
    const shots = state.shots;
    const segments = state.segments;
    for (let shotIndex = shots.length - 1; shotIndex >= 0; shotIndex -= 1) {
      const shot = shots[shotIndex];
      for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
        const segment = segments[segmentIndex];
        if (!segment.alive) {
          continue;
        }
        const dy = Math.abs(this.laneY(segment.lane) - shot.y);
        if (dy < 16 && Math.abs(segment.x - shot.x) < 18) {
          shots.splice(shotIndex, 1);
          segments.splice(segmentIndex, 1);
          state.splats.push({ x: segment.x, y: this.laneY(segment.lane), life: 0.5 });
          state.score += segment.head ? 120 : 40;
          if (state.score > state.best) {
            state.best = state.score;
          }
          if (segment.head && segments.length > 0) {
            const trail = segments.filter((entry) => !entry.head);
            trail.forEach((entry, index) => {
              entry.head = index === 0;
            });
          }
          break;
        }
      }
    }
    for (const segment of segments) {
      if (Math.abs(segment.x - state.player.x) < 20 && Math.abs(this.laneY(segment.lane) - state.player.y) < 18) {
        state.player.alive = false;
        state.player.respawn = 1.2;
      }
    }
    if (segments.some((segment) => segment.x < 0 && Math.abs(this.laneY(segment.lane) - state.player.y) < 26)) {
      state.player.alive = false;
      state.player.respawn = 1.2;
    }
  }

  laneY(lane) {
    return state.laneY[lane] || state.h * 0.6;
  }

  render() {
    ctx.clearRect(0, 0, state.w, state.h);
    this.drawBackground();
    this.drawLanes();
    this.drawWeb();
    this.drawPlayer();
    this.drawShots();
    this.drawSegments();
    this.drawSplats();
    this.drawHud();
  }

  drawBackground() {
    ctx.fillStyle = "#06100b";
    ctx.fillRect(0, 0, state.w, state.h);
  }

  drawLanes() {
    for (const y of state.laneY) {
      ctx.strokeStyle = "rgba(140, 255, 122, 0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(state.w - 24, y);
      ctx.stroke();
    }
  }

  drawWeb() {
    ctx.strokeStyle = "rgba(140, 255, 122, 0.05)";
    for (let x = 60; x < state.w; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, state.h * 0.12);
      ctx.lineTo(x - 60, state.h * 0.9);
      ctx.stroke();
    }
  }

  drawPlayer() {
    const x = state.player.x;
    const y = state.player.y;
    ctx.fillStyle = state.player.alive ? "#8cff7a" : "#ff7a7a";
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
    ctx.fillStyle = "#d7ffe8";
    ctx.fillRect(x + 8, y - 2, 22, 4);
  }

  drawShots() {
    ctx.fillStyle = "#f7ffb6";
    for (const shot of state.shots) {
      ctx.fillRect(shot.x, shot.y - 2, 10, 4);
    }
  }

  drawSegments() {
    for (const segment of state.segments) {
      const y = this.laneY(segment.lane);
      ctx.fillStyle = segment.head ? "#8cff7a" : "#3cbf66";
      ctx.beginPath();
      ctx.roundRect(segment.x - 16, y - 11, 32, 22, 8);
      ctx.fill();
      ctx.fillStyle = "#06100b";
      ctx.beginPath();
      ctx.arc(segment.x + (segment.dir > 0 ? 6 : -6), y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSplats() {
    for (const splat of state.splats) {
      const alpha = splat.life / 0.5;
      ctx.strokeStyle = `rgba(255, 122, 122, ${alpha})`;
      ctx.beginPath();
      ctx.arc(splat.x, splat.y, 16 * (1 - alpha * 0.3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawHud() {
    ctx.fillStyle = "rgba(8, 24, 16, 0.82)";
    ctx.fillRect(16, 16, 250, 72);
    ctx.fillStyle = "#d7ffe8";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`Score ${state.score}`, 28, 42);
    ctx.font = "14px Arial";
    ctx.fillStyle = "#87b79b";
    ctx.fillText(`Best ${state.best}`, 28, 62);
    ctx.fillText(`Lane ${state.player.lane + 1}/${state.lanes}`, 28, 82);
    ctx.fillStyle = "rgba(8, 24, 16, 0.9)";
    ctx.fillRect(state.w - 260, 16, 244, 72);
    ctx.fillStyle = "#d7ffe8";
    ctx.fillText("W/S move lane", state.w - 244, 42);
    ctx.fillText("Space fire", state.w - 244, 62);
    ctx.fillText("Destroy the head first", state.w - 244, 82);
    if (state.over) {
      ctx.fillStyle = "rgba(0,0,0,0.56)";
      ctx.fillRect(0, 0, state.w, state.h);
      ctx.fillStyle = "#d7ffe8";
      ctx.textAlign = "center";
      ctx.font = "bold 34px Arial";
      ctx.fillText("Webline broken", state.w / 2, state.h / 2 - 18);
      ctx.font = "18px Arial";
      ctx.fillStyle = "#87b79b";
      ctx.fillText("Press Space or Enter to restart", state.w / 2, state.h / 2 + 18);
      ctx.textAlign = "start";
    }
  }
}

new Game().start();
