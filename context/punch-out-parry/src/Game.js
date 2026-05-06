const WIDTH = 960;
const HEIGHT = 540;

const cueVisuals = {
  slipLeft: { label: "SLIP LEFT", icon: "<" },
  slipRight: { label: "SLIP RIGHT", icon: ">" },
  duck: { label: "DUCK", icon: "V" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Game {
  constructor(options = {}) {
    this.width = WIDTH;
    this.height = HEIGHT;
    this.onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.player = {
      hp: 6,
      maxHp: 6,
      stars: 0,
      lane: 0,
      ducking: false,
      attackTimer: 0,
      attackDuration: 0,
      lastAttackType: "jab",
      dazedTimer: 0,
      flashTimer: 0,
      combo: 0,
      score: 0,
    };
    this.opponent = {
      hp: 100,
      maxHp: 100,
      windup: 1.4,
      cue: null,
      phase: 1,
      state: "idle",
      timer: 1.2,
      counterWindow: 0,
      hurtTimer: 0,
      tellPulse: 0,
    };
    this.elapsed = 0;
    this.message = "Wait for the tell.";
    this.cameraShake = 0;
    this.result = "";
    this.flash = 0;
    this.phaseFlash = 0;
    this.particles = [];
  }

  emit(type, payload = {}) {
    this.onEvent({ type, ...payload });
  }

  start() {
    this.reset();
    this.mode = "playing";
    this.emit("start");
  }

  isOverlayVisible() {
    return this.mode !== "playing";
  }

  getOverlayHTML() {
    if (this.mode === "menu") {
      return `
        <div class="overlay-card">
          <h1>Punch-Out Parry Counter</h1>
          <p>Read the cue near the rival's gloves, evade on time, then cash the orange opening into a hard counter string.</p>
          <p><strong>Move:</strong> Left / Right arrows to slip, Up to reset center, Down to duck.</p>
          <p><strong>Punch:</strong> Space for jab, X for hook, Z for star punch when the meter is full.</p>
          <p><strong>Goal:</strong> survive three pressure phases and drop the champ before your hearts are gone.</p>
          <p>Press <strong>Enter</strong> to start.</p>
        </div>
      `;
    }

    return `
      <div class="overlay-card">
        <h2>${this.result}</h2>
        <p>${this.opponent.hp <= 0 ? "Your counter string broke the guard and closed the bout." : "The champ read your rhythm and dropped you."}</p>
        <p>Score <strong>${Math.round(this.player.score)}</strong> | Phase <strong>${this.opponent.phase}</strong></p>
        <p>Press <strong>Enter</strong> to run it back.</p>
      </div>
    `;
  }

  getHUDHTML() {
    const hearts = "H".repeat(this.player.hp) + ".".repeat(this.player.maxHp - this.player.hp);
    const stars = "*".repeat(this.player.stars) + ".".repeat(3 - this.player.stars);
    return `
      <div class="hud-panel">Hearts ${hearts}</div>
      <div class="hud-panel">Phase ${this.opponent.phase} | ${this.message}</div>
      <div class="hud-panel">Stars ${stars} | Rival ${Math.max(0, Math.ceil(this.opponent.hp))}%</div>
    `;
  }

  update(input, dt) {
    const step = Math.min(dt, 1 / 30);
    if (input.consumePressed("Enter")) {
      if (this.mode === "playing") {
        return;
      }
      this.start();
    }
    if (this.mode !== "playing") {
      return;
    }

    this.elapsed += step;
    this.player.flashTimer = Math.max(0, this.player.flashTimer - step);
    this.player.attackTimer = Math.max(0, this.player.attackTimer - step);
    this.player.dazedTimer = Math.max(0, this.player.dazedTimer - step);
    this.opponent.hurtTimer = Math.max(0, this.opponent.hurtTimer - step);
    this.opponent.counterWindow = Math.max(0, this.opponent.counterWindow - step);
    this.cameraShake = Math.max(0, this.cameraShake - step * 2.5);
    this.flash = Math.max(0, this.flash - step * 1.8);
    this.phaseFlash = Math.max(0, this.phaseFlash - step * 1.4);
    this.opponent.tellPulse += step * 4;

    this.handleMovement(input);
    this.handleAttackInput(input);
    this.updateOpponent(step);
    this.updatePhase();
    this.updateParticles(step);
    this.updateMessage();
    this.checkEnd();
  }

  handleMovement(input) {
    if (this.player.dazedTimer > 0) {
      this.player.ducking = false;
      return;
    }
    if (input.consumePressed("ArrowLeft")) {
      this.player.lane = -1;
    }
    if (input.consumePressed("ArrowRight")) {
      this.player.lane = 1;
    }
    if (input.consumePressed("ArrowUp")) {
      this.player.lane = 0;
    }
    this.player.ducking = input.isDown("ArrowDown");
  }

  setAttack(type, duration) {
    this.player.lastAttackType = type;
    this.player.attackDuration = duration;
    this.player.attackTimer = duration;
  }

  handleAttackInput(input) {
    if (this.player.attackTimer > 0 || this.player.dazedTimer > 0) {
      return;
    }
    if (input.consumePressed("z") || input.consumePressed("Z")) {
      if (this.player.stars >= 3) {
        this.player.stars = 0;
        this.setAttack("star", 0.65);
        this.dealDamage(32, true, "star");
        this.player.score += 360;
        this.message = "Star punch lands clean.";
      } else {
        this.message = "Need 3 stars for a star punch.";
      }
      return;
    }
    if (input.consumePressed("x") || input.consumePressed("X")) {
      this.setAttack("hook", 0.5);
      const damage = this.opponent.counterWindow > 0 ? 18 : 4;
      this.dealDamage(damage, this.opponent.counterWindow > 0, "hook");
      this.player.score += damage * 12;
      return;
    }
    if (input.consumePressed(" ") || input.consumePressed("Space")) {
      this.setAttack("jab", 0.28);
      const damage = this.opponent.counterWindow > 0 ? 10 : 3;
      this.dealDamage(damage, this.opponent.counterWindow > 0, "jab");
      this.player.score += damage * 10;
    }
  }

  dealDamage(amount, trueCounter, attackType) {
    if (trueCounter) {
      const heavy = attackType !== "jab";
      this.opponent.hp = Math.max(0, this.opponent.hp - amount);
      this.opponent.hurtTimer = heavy ? 0.34 : 0.26;
      this.opponent.counterWindow = Math.max(0, this.opponent.counterWindow - (attackType === "star" ? 0.45 : 0.24));
      this.player.combo += 1;
      this.cameraShake = Math.max(this.cameraShake, heavy ? 0.62 : 0.45);
      this.flash = Math.max(this.flash, heavy ? 0.5 : 0.35);
      this.phaseFlash = Math.max(this.phaseFlash, heavy ? 0.24 : 0.14);
      this.spawnBurst(480, 244, {
        color: attackType === "star" ? "#fff2a8" : "#ffb347",
        count: attackType === "star" ? 22 : heavy ? 16 : 12,
        speedMin: heavy ? 140 : 110,
        speedMax: attackType === "star" ? 360 : 260,
        sizeMin: 3,
        sizeMax: attackType === "star" ? 11 : 8,
        lifeMin: 0.18,
        lifeMax: 0.42,
      });
      if (this.player.combo % 2 === 0 && this.player.stars < 3) {
        this.player.stars += 1;
      }
      this.emit("hit", { attackType, counter: true, heavy });
      return;
    }

    const blocked = this.opponent.state !== "recover" && Math.random() < 0.6;
    if (blocked) {
      this.message = "Guarded. Wait for the opening.";
      this.player.combo = 0;
      this.spawnBurst(480, 232, {
        color: "#dce7ff",
        count: 9,
        speedMin: 70,
        speedMax: 180,
        sizeMin: 2,
        sizeMax: 5,
        lifeMin: 0.12,
        lifeMax: 0.2,
        arc: Math.PI * 0.75,
        angle: -Math.PI / 2,
      });
      this.emit("guard", { attackType });
      return;
    }

    this.opponent.hp = Math.max(0, this.opponent.hp - amount);
    this.opponent.hurtTimer = 0.18;
    this.player.combo = 0;
    this.spawnBurst(480, 250, {
      color: "#ff7d6a",
      count: 8,
      speedMin: 90,
      speedMax: 200,
      sizeMin: 3,
      sizeMax: 6,
      lifeMin: 0.12,
      lifeMax: 0.22,
    });
    this.emit("hit", { attackType, counter: false, heavy: attackType === "hook" });
  }

  updateOpponent(dt) {
    switch (this.opponent.state) {
      case "idle":
        this.opponent.timer -= dt;
        if (this.opponent.timer <= 0) {
          this.beginCue();
        }
        break;
      case "tell":
        this.opponent.windup -= dt;
        if (this.opponent.windup <= 0) {
          this.resolveCue();
        }
        break;
      case "recover":
        this.opponent.timer -= dt;
        if (this.opponent.timer <= 0) {
          this.resetCycle(0.72, 1.12);
        }
        break;
      default:
        break;
    }
  }

  beginCue() {
    const phase = this.opponent.phase;
    const patterns = phase === 1
      ? ["slipLeft", "slipRight", "duck"]
      : phase === 2
        ? ["duck", "slipLeft", "slipRight", "duck"]
        : ["slipLeft", "duck", "slipRight", "duck", "slipLeft"];
    const choice = patterns[Math.floor(Math.random() * patterns.length)];
    this.opponent.cue = choice;
    this.opponent.windup = clamp(0.95 - phase * 0.12, 0.42, 0.9);
    this.opponent.state = "tell";
    this.phaseFlash = Math.max(this.phaseFlash, 0.08);
    this.emit("cue", { cue: choice, phase });
  }

  resolveCue() {
    const cue = this.opponent.cue;
    const success = this.readEvade();
    if (success) {
      this.opponent.counterWindow = clamp(0.98 - this.opponent.phase * 0.08, 0.52, 0.94);
      this.opponent.state = "recover";
      this.opponent.timer = 0.95;
      this.player.score += 120;
      this.player.combo += 1;
      this.cameraShake = Math.max(this.cameraShake, 0.24);
      this.phaseFlash = Math.max(this.phaseFlash, 0.18);
      this.message = `Counter now: ${cueVisuals[cue].label}.`;
      this.spawnBurst(480 + this.player.lane * 130, 324, {
        color: "#7ee6ff",
        count: 12,
        speedMin: 80,
        speedMax: 220,
        sizeMin: 2,
        sizeMax: 6,
        lifeMin: 0.16,
        lifeMax: 0.28,
        arc: Math.PI * 0.9,
        angle: -Math.PI / 2,
      });
      if (this.player.stars < 3) {
        this.player.stars += 1;
      }
      this.emit("parry", { cue, phase: this.opponent.phase });
    } else {
      this.player.hp = Math.max(0, this.player.hp - 1);
      this.player.flashTimer = 0.4;
      this.player.dazedTimer = 0.55;
      this.player.combo = 0;
      this.cameraShake = Math.max(this.cameraShake, 0.7);
      this.flash = Math.max(this.flash, 0.24);
      this.phaseFlash = Math.max(this.phaseFlash, 0.12);
      this.opponent.state = "recover";
      this.opponent.timer = 1.1;
      this.message = `${cueVisuals[cue].label} broke through.`;
      this.spawnBurst(480 + this.player.lane * 130, 340, {
        color: "#ff7d6a",
        count: 16,
        speedMin: 100,
        speedMax: 240,
        sizeMin: 3,
        sizeMax: 8,
        lifeMin: 0.18,
        lifeMax: 0.34,
      });
      this.emit("playerHit", { cue, phase: this.opponent.phase });
    }
    this.opponent.cue = null;
  }

  readEvade() {
    if (this.opponent.cue === "slipLeft") {
      return this.player.lane === -1;
    }
    if (this.opponent.cue === "slipRight") {
      return this.player.lane === 1;
    }
    return this.player.ducking;
  }

  resetCycle(min, max) {
    this.opponent.state = "idle";
    this.opponent.timer = lerp(min, max, Math.random());
  }

  updatePhase() {
    const hpRatio = this.opponent.hp / this.opponent.maxHp;
    const nextPhase = hpRatio <= 0.33 ? 3 : hpRatio <= 0.66 ? 2 : 1;
    if (nextPhase !== this.opponent.phase) {
      this.opponent.phase = nextPhase;
      this.phaseFlash = 0.42;
      this.spawnBurst(480, 116, {
        color: "#ffb347",
        count: 18,
        speedMin: 120,
        speedMax: 260,
        sizeMin: 3,
        sizeMax: 8,
        lifeMin: 0.18,
        lifeMax: 0.4,
      });
      this.emit("phase", { phase: nextPhase });
      return;
    }
    this.opponent.phase = nextPhase;
  }

  updateParticles(dt) {
    this.particles = this.particles.filter((particle) => {
      particle.life -= dt;
      if (particle.life <= 0) {
        return false;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.rotation += particle.spin * dt;
      return true;
    });
  }

  spawnBurst(x, y, options) {
    const {
      angle = -Math.PI / 2,
      arc = Math.PI * 2,
      color,
      count,
      lifeMin,
      lifeMax,
      sizeMin,
      sizeMax,
      speedMin,
      speedMax,
    } = options;
    for (let index = 0; index < count; index += 1) {
      const spread = angle + (Math.random() - 0.5) * arc;
      const speed = lerp(speedMin, speedMax, Math.random());
      const life = lerp(lifeMin, lifeMax, Math.random());
      const size = lerp(sizeMin, sizeMax, Math.random());
      this.particles.push({
        color,
        gravity: 280 + Math.random() * 120,
        life,
        maxLife: life,
        rotation: Math.random() * Math.PI * 2,
        size,
        spin: (Math.random() - 0.5) * 8,
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        x,
        y,
      });
    }
  }

  updateMessage() {
    if (this.mode !== "playing") {
      return;
    }
    if (this.opponent.counterWindow > 0) {
      this.message = "Counter window open.";
      return;
    }
    if (this.player.dazedTimer > 0) {
      this.message = "Reset your feet.";
      return;
    }
    if (this.opponent.cue) {
      this.message = cueVisuals[this.opponent.cue].label;
      return;
    }
    if (this.opponent.phase === 3) {
      this.message = "Final phase: tighter tells.";
      return;
    }
    this.message = "Probe or wait for the tell.";
  }

  checkEnd() {
    if (this.mode !== "playing") {
      return;
    }
    if (this.player.hp <= 0) {
      this.mode = "lose";
      this.result = "Knocked Out";
      this.emit("lose");
      return;
    }
    if (this.opponent.hp <= 0) {
      this.mode = "win";
      this.result = "Champion Down";
      this.emit("win");
    }
  }

  draw(ctx) {
    const shakeX = (Math.random() - 0.5) * 16 * this.cameraShake;
    const shakeY = (Math.random() - 0.5) * 10 * this.cameraShake;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackdrop(ctx);
    this.drawArena(ctx);
    this.drawOpponent(ctx);
    this.drawPlayer(ctx);
    this.drawParticles(ctx);
    this.drawCue(ctx);
    this.drawPostFx(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 245, 220, ${this.flash * 0.2})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    ctx.restore();
  }

  drawBackdrop(ctx) {
    const backdrop = ctx.createLinearGradient(0, 0, 0, 240);
    backdrop.addColorStop(0, "#1f2047");
    backdrop.addColorStop(1, "#0a1020");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, WIDTH, 240);

    for (let index = 0; index < 9; index += 1) {
      const x = 60 + index * 110;
      const glow = 0.16 + Math.sin(this.elapsed * 1.6 + index * 0.7) * 0.05 + this.phaseFlash * 0.18;
      const light = ctx.createRadialGradient(x, 66, 0, x, 66, 72);
      light.addColorStop(0, `rgba(255, 212, 120, ${glow})`);
      light.addColorStop(1, "rgba(255, 212, 120, 0)");
      ctx.fillStyle = light;
      ctx.fillRect(x - 72, 0, 144, 144);
    }

    ctx.fillStyle = "#071018";
    for (let index = 0; index < 22; index += 1) {
      const x = index * 46;
      const height = 20 + ((index * 17) % 26);
      ctx.fillRect(x, 198 - height, 30, height);
    }
  }

  drawArena(ctx) {
    const floor = ctx.createLinearGradient(0, 200, 0, HEIGHT);
    floor.addColorStop(0, "#3d719f");
    floor.addColorStop(0.55, "#234462");
    floor.addColorStop(1, "#131b31");
    ctx.fillStyle = floor;
    ctx.fillRect(120, 210, 720, 260);

    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(150, 244, 660, 28);
    ctx.fillRect(150, 306, 660, 24);

    ctx.strokeStyle = "#dce7ff";
    ctx.lineWidth = 8;
    ctx.strokeRect(140, 228, 680, 210);

    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.beginPath();
    ctx.moveTo(140, 278);
    ctx.lineTo(820, 278);
    ctx.moveTo(140, 340);
    ctx.lineTo(820, 340);
    ctx.stroke();

    ctx.fillStyle = "#081018";
    ctx.fillRect(0, 430, WIDTH, 110);
  }

  drawOpponent(ctx) {
    const hurt = this.opponent.hurtTimer > 0 ? Math.sin(this.opponent.hurtTimer * 50) * 12 : 0;
    const centerX = 480 + hurt;
    const bob = Math.sin(this.elapsed * 3) * 6;
    const bodyY = 212 + bob;

    ctx.save();
    ctx.translate(centerX, bodyY);

    if (this.opponent.counterWindow > 0) {
      const glow = ctx.createRadialGradient(0, 10, 16, 0, 10, 148);
      glow.addColorStop(0, "rgba(255, 195, 76, 0.34)");
      glow.addColorStop(1, "rgba(255, 195, 76, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-170, -160, 340, 320);
    }

    ctx.fillStyle = "#e5b596";
    ctx.beginPath();
    ctx.ellipse(0, -60, 44, 52, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#9c1c27";
    ctx.fillRect(-54, -12, 108, 140);
    ctx.fillStyle = "#61101a";
    ctx.fillRect(-18, 6, 36, 122);

    const pulse = 1 + Math.sin(this.opponent.tellPulse) * 0.05;
    const cueGlow = this.opponent.cue ? 1 : 0;
    ctx.fillStyle = this.opponent.cue ? "#ff8a5b" : "#f4f4f4";
    ctx.beginPath();
    ctx.ellipse(-88 * pulse, 18, 34 + cueGlow * 4, 28 + cueGlow * 2, 0.4, 0, Math.PI * 2);
    ctx.ellipse(88 * pulse, 18, 34 + cueGlow * 4, 28 + cueGlow * 2, -0.4, 0, Math.PI * 2);
    ctx.fill();

    if (this.opponent.cue) {
      ctx.strokeStyle = "rgba(255, 214, 117, 0.85)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    ctx.fillStyle = "#1a1424";
    ctx.fillRect(-16, -84, 32, 16);
    ctx.restore();

    const hpWidth = 240;
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.fillRect(360, 74, hpWidth, 16);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(360, 74, hpWidth * (this.opponent.hp / this.opponent.maxHp), 16);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.strokeRect(360, 74, hpWidth, 16);
  }

  drawPlayer(ctx) {
    const baseX = 480 + this.player.lane * 130;
    const crouch = this.player.ducking ? 28 : 0;
    const hitFlash = this.player.flashTimer > 0 ? "#ffe6de" : "#f7d2bf";
    const attackProgress = this.player.attackDuration > 0
      ? this.player.attackTimer / this.player.attackDuration
      : 0;
    const attackReach = this.player.attackTimer > 0
      ? this.player.lastAttackType === "star"
        ? 86 * attackProgress
        : this.player.lastAttackType === "hook"
          ? 58 * attackProgress
          : 42 * attackProgress
      : 0;
    const gloveColor = this.player.lastAttackType === "star" && this.player.attackTimer > 0 ? "#fff2a8" : "#ffd447";

    ctx.save();
    ctx.translate(baseX, 400 + crouch);

    ctx.fillStyle = "#202938";
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hitFlash;
    ctx.beginPath();
    ctx.ellipse(0, -92, 36, 42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2db2ff";
    ctx.fillRect(-48, -54, 96, 128);
    ctx.fillStyle = "#0d5f8b";
    ctx.fillRect(-18, -34, 36, 108);

    ctx.fillStyle = gloveColor;
    ctx.beginPath();
    ctx.ellipse(-72 - attackReach, -6, 26, 22, -0.6, 0, Math.PI * 2);
    ctx.ellipse(72 + attackReach, -6, 26, 22, 0.6, 0, Math.PI * 2);
    ctx.fill();

    if (this.player.lastAttackType === "star" && this.player.attackTimer > 0) {
      ctx.strokeStyle = "rgba(255, 244, 173, 0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -10, 94, -0.9, -0.2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      const alpha = particle.life / particle.maxLife;
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(-particle.size * 0.5, -particle.size * 0.18, particle.size, particle.size * 0.36);
      ctx.restore();
    }
  }

  drawCue(ctx) {
    if (!this.opponent.cue) {
      return;
    }
    const visual = cueVisuals[this.opponent.cue];
    const alpha = 0.72 + Math.sin(this.opponent.tellPulse * 2) * 0.18;
    ctx.fillStyle = `rgba(255, 179, 71, ${alpha})`;
    ctx.fillRect(336, 112, 288, 62);
    ctx.strokeStyle = "rgba(255,255,255,0.48)";
    ctx.lineWidth = 3;
    ctx.strokeRect(336, 112, 288, 62);
    ctx.fillStyle = "#120f19";
    ctx.font = "bold 18px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(visual.icon, 386, 149);
    ctx.fillText(visual.icon, 574, 149);
    ctx.font = "bold 28px Georgia";
    ctx.fillText(visual.label, 480, 149);
  }

  drawPostFx(ctx) {
    if (this.opponent.counterWindow > 0) {
      const windowAlpha = 0.08 + this.opponent.counterWindow * 0.12;
      ctx.fillStyle = `rgba(255, 179, 71, ${windowAlpha})`;
      ctx.fillRect(120, 210, 720, 260);
    }

    if (this.phaseFlash > 0) {
      ctx.fillStyle = `rgba(255, 204, 120, ${this.phaseFlash * 0.14})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 0; y < HEIGHT; y += 6) {
      ctx.fillRect(0, y, WIDTH, 1);
    }

    const vignette = ctx.createRadialGradient(480, 300, 180, 480, 300, 520);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
