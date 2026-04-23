import { PALETTE, HEIGHT, WIDTH } from "./config.js";

const TAU = Math.PI * 2;

const roundRect = (ctx, x, y, w, h, r) => {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }

  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.dpr = 1;
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.canvas.width = Math.max(1, Math.floor(clientWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(clientHeight * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  drawBackground(time, mode = "menu") {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const image = this.assets.images.get("grid-bg");

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, PALETTE.bgTop);
    bg.addColorStop(0.55, PALETTE.bgMid);
    bg.addColorStop(1, PALETTE.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    for (let index = 0; index < 120; index += 1) {
      const x = (index * 157 + time * 28) % w;
      const y = (index * 67) % (h * 0.72);
      const size = 1 + (index % 3);
      ctx.fillStyle = `rgba(255,255,255,${0.09 + (index % 4) * 0.08})`;
      ctx.fillRect(x, y, size, size);
    }

    if (image) {
      const shift = (time * 22) % w;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(image, -shift * 0.24, 0, w, h);
      ctx.drawImage(image, w - shift * 0.24, 0, w, h);
      ctx.globalAlpha = 1;
    }

    const haze = ctx.createRadialGradient(w * 0.5, h * 0.32, 40, w * 0.5, h * 0.32, Math.max(w, h) * 0.72);
    haze.addColorStop(0, "rgba(255,255,255,0.03)");
    haze.addColorStop(0.62, "rgba(0,0,0,0.06)");
    haze.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, h * 0.87, w, h * 0.13);

    if (mode === "play" || mode === "pause") {
      ctx.fillStyle = "rgba(118, 215, 255, 0.08)";
      ctx.fillRect(0, h * 0.54, w, h * 0.01);
    }

    ctx.restore();
  }

  panel(x, y, w, h, fill = PALETTE.panel, stroke = PALETTE.line) {
    const ctx = this.ctx;
    ctx.save();
    roundRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  titleBlock(title, subtitle, accent = PALETTE.accent) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = "700 18px Trebuchet MS, sans-serif";
    ctx.fillText(title, 54, 70);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 13px Trebuchet MS, sans-serif";
    ctx.fillText(subtitle, 54, 92);
    ctx.restore();
  }

  drawShipSprite(spriteId, x, y, size, alpha = 1, rotation = 0, glow = "rgba(118, 215, 255, 0.22)") {
    const sprite = this.assets.images.get(spriteId);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha *= alpha;
    if (sprite) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = size * 0.18;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.55);
    ctx.lineTo(size * 0.42, size * 0.3);
    ctx.lineTo(0, size * 0.18);
    ctx.lineTo(-size * 0.42, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawMeter(x, y, w, value, label, fill = PALETTE.accent) {
    const ctx = this.ctx;
    const safe = clamp(value, 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * safe, 12);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 13px Trebuchet MS, sans-serif";
    ctx.fillText(label, x, y - 6);
    ctx.restore();
  }

  drawCenterOverlay(title, subtitle, hint, accent) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.save();
    ctx.fillStyle = "rgba(4, 7, 13, 0.56)";
    ctx.fillRect(0, 0, w, h);
    this.panel(w * 0.18, h * 0.18, w * 0.64, h * 0.46, PALETTE.panelStrong);
    this.drawShipSprite("player-ship", w * 0.5, h * 0.35, 160, 0.98, 0.04);
    ctx.textAlign = "center";
    ctx.fillStyle = accent;
    ctx.font = "700 68px Trebuchet MS, sans-serif";
    ctx.fillText(title, w * 0.5, h * 0.54);
    ctx.fillStyle = PALETTE.text;
    ctx.font = "400 24px Trebuchet MS, sans-serif";
    ctx.fillText(subtitle, w * 0.5, h * 0.61);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 18px Trebuchet MS, sans-serif";
    ctx.fillText(hint, w * 0.5, h * 0.68);
    ctx.restore();
  }

  drawTerrain(terrain) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const step = 8;

    ctx.save();
    const fill = ctx.createLinearGradient(0, h * 0.55, 0, h);
    fill.addColorStop(0, "rgba(11, 18, 30, 0.92)");
    fill.addColorStop(1, "rgba(2, 5, 10, 0.98)");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += step) {
      ctx.lineTo(x, terrain.heightAt(x));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(118, 215, 255, 0.17)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      const y = terrain.heightAt(x);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(158, 243, 157, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 46) {
      const y = terrain.heightAt(x);
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x + 12, y + 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawPlayer(player, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.atan2(player.vy, player.vx || 0.001) * 0.22);
    ctx.globalAlpha = player.invuln > 0 ? 0.72 + Math.sin(time * 28) * 0.14 : 1;
    this.drawShipSprite("player-ship", 0, 0, 56, 1, 0);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawTurret(turret) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(turret.x, turret.y);
    ctx.fillStyle = "rgba(7, 12, 20, 0.98)";
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-18, -8, 36, 18, 6);
    } else {
      roundRect(ctx, -18, -8, 36, 18, 6);
    }
    ctx.fill();
    ctx.strokeStyle = "rgba(158, 243, 157, 0.6)";
    ctx.stroke();
    ctx.rotate(Math.sin(turret.spin) * 0.02);
    ctx.fillStyle = "rgba(158, 243, 157, 0.95)";
    ctx.fillRect(-2, -24, 4, 24);
    ctx.fillStyle = "rgba(118, 215, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawCivilian(civilian) {
    const ctx = this.ctx;
    if (civilian.state === "rescued") {
      return;
    }

    ctx.save();
    ctx.translate(civilian.x, civilian.y);
    const pulse = civilian.state === "grabbed" ? 0.78 : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = civilian.state === "grabbed" ? "rgba(255, 143, 124, 0.95)" : "rgba(244, 248, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(0, 0, civilian.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(118, 215, 255, 0.85)";
    ctx.fillRect(-3, -civilian.radius - 10, 6, 8);
    ctx.restore();
  }

  drawEnemy(enemy, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(Math.atan2(enemy.vy, Math.max(1, enemy.vx)));
    const flicker = 0.86 + Math.sin(time * 20 + enemy.radius) * 0.07;
    ctx.globalAlpha = flicker;
    this.drawShipSprite(
      enemy.type === "bomber" ? "enemy-bomber" : "enemy-raider",
      0,
      0,
      enemy.type === "bomber" ? 54 : 48,
      1,
      0,
      enemy.type === "bomber" ? "rgba(255, 143, 124, 0.3)" : "rgba(118, 215, 255, 0.26)"
    );
    ctx.restore();
  }

  drawProjectile(projectile) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ctx.fillStyle =
      projectile.color === "turret" ? "rgba(158, 243, 157, 0.96)" : "rgba(118, 215, 255, 0.96)";
    ctx.fillRect(-8, -2, 16, 4);
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillRect(-3, -1, 6, 2);
    ctx.restore();
  }

  drawBomb(bomb) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(bomb.x, bomb.y);
    ctx.fillStyle = "rgba(255, 143, 124, 0.92)";
    ctx.beginPath();
    ctx.arc(0, 0, bomb.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, -18);
    ctx.stroke();
    ctx.restore();
  }

  drawParticle(particle) {
    const ctx = this.ctx;
    const t = clamp(particle.age / particle.life, 0, 1);
    const fade = 1 - t;
    if (fade <= 0) {
      return;
    }

    ctx.save();
    ctx.translate(particle.x, particle.y);
    if (particle.additive) {
      ctx.globalCompositeOperation = "lighter";
    }
    ctx.globalAlpha = fade * particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.strokeStyle = particle.color;

    switch (particle.kind) {
      case "flash": {
        const radius = particle.size * (0.65 + t * 0.65);
        const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
        gradient.addColorStop(0, "rgba(255,255,255,0.95)");
        gradient.addColorStop(0.3, particle.color);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, TAU);
        ctx.fill();
        break;
      }
      case "smoke": {
        const radius = particle.size * (0.8 + t * 0.8);
        ctx.globalAlpha *= 0.7;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, TAU);
        ctx.fill();
        break;
      }
      case "thrust":
        ctx.rotate(Math.atan2(particle.vy, particle.vx || 0.001));
        ctx.fillRect(-particle.length * 0.5, -particle.size * 0.35, particle.length, particle.size * 0.7);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(-particle.length * 0.15, -particle.size * 0.18, particle.length * 0.35, particle.size * 0.36);
        break;
      case "debris":
        ctx.rotate(particle.spin || 0);
        ctx.beginPath();
        ctx.moveTo(-particle.size, particle.size * 0.8);
        ctx.lineTo(0, -particle.size);
        ctx.lineTo(particle.size * 0.95, particle.size * 0.8);
        ctx.closePath();
        ctx.fill();
        break;
      default:
        ctx.rotate(Math.atan2(particle.vy, particle.vx || 0.001));
        ctx.fillRect(-particle.length * 0.5, -particle.size * 0.25, particle.length || particle.size * 2, particle.size * 0.5);
        break;
    }

    ctx.restore();
  }

  drawParticles(particles) {
    for (const particle of particles) {
      this.drawParticle(particle);
    }
  }

  drawPlay(scene) {
    const session = scene.session;
    const ctx = this.ctx;
    this.drawTerrain(session.terrain);

    for (const civilian of session.civilians) {
      this.drawCivilian(civilian);
    }

    for (const turret of session.turrets) {
      this.drawTurret(turret);
    }

    for (const bomb of session.bombs) {
      this.drawBomb(bomb);
    }

    for (const projectile of session.projectiles) {
      this.drawProjectile(projectile);
    }

    for (const enemy of session.enemies) {
      this.drawEnemy(enemy, scene.time);
    }

    this.drawParticles(session.particles.items);

    this.drawPlayer(session.player, scene.time);

    if (scene.waveFlash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(scene.waveFlash / 1.2, 0, 1) * 0.16;
      ctx.fillStyle = "rgba(118, 215, 255, 0.7)";
      ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
      ctx.restore();
    }

    if (scene.bonusBanner) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(7, 12, 20, 0.7)";
      roundRect(ctx, this.canvas.clientWidth * 0.37, 126, this.canvas.clientWidth * 0.26, 44, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(158, 243, 157, 0.45)";
      ctx.stroke();
      ctx.fillStyle = PALETTE.accent2;
      ctx.font = "700 16px Trebuchet MS, sans-serif";
      ctx.fillText(scene.bonusBanner, this.canvas.clientWidth * 0.5, 154);
      ctx.restore();
    }
  }

  drawHud(scene) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const session = scene.session;

    this.panel(32, 28, 388, 146);
    ctx.save();
    ctx.fillStyle = PALETTE.text;
    ctx.font = "700 22px Trebuchet MS, sans-serif";
    ctx.fillText("Skylord Defender", 56, 62);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 14px Trebuchet MS, sans-serif";
    ctx.fillText("WASD / arrows move. Space fires.", 56, 86);
    ctx.fillText("T deploys turret. P / Esc pauses.", 56, 108);
    ctx.fillText("Protect civilians and clear the swarm.", 56, 130);
    ctx.restore();

    this.panel(w - 390, 28, 358, 146);
    ctx.save();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 13px Trebuchet MS, sans-serif";
    ctx.fillText("mission", w - 362, 58);
    ctx.fillStyle = PALETTE.text;
    ctx.font = "700 32px Trebuchet MS, sans-serif";
    ctx.fillText(scene.missionLabel, w - 362, 94);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 14px Trebuchet MS, sans-serif";
    ctx.fillText(scene.missionNote, w - 362, 120);
    ctx.fillText(scene.phaseLabel, w - 362, 140);
    ctx.restore();

    this.panel(32, h - 180, 492, 122);
    ctx.save();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 13px Trebuchet MS, sans-serif";
    ctx.fillText("battle status", 56, h - 146);
    ctx.fillStyle = PALETTE.text;
    ctx.font = "700 26px Trebuchet MS, sans-serif";
    ctx.fillText(`score ${scene.score}`, 56, h - 110);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 15px Trebuchet MS, sans-serif";
    ctx.fillText(`civilians saved ${scene.civiliansSaved} / ${scene.civiliansTotal}`, 56, h - 82);
    ctx.fillText(`turrets ${scene.turretsBuilt} - enemies down ${scene.enemiesDestroyed}`, 56, h - 58);
    ctx.restore();

    const logX = w * 0.34;
    const logW = w * 0.32;
    this.panel(logX, h - 180, logW, 122);
    ctx.save();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 13px Trebuchet MS, sans-serif";
    ctx.fillText("command log", logX + 24, h - 146);
    const entries = session.commandLog.recent(4);
    if (entries.length === 0) {
      ctx.fillText("no contacts logged", logX + 24, h - 114);
    } else {
      entries.forEach((entry, index) => {
        const fade = clamp(1 - entry.age / entry.ttl, 0.35, 1);
        ctx.globalAlpha = fade;
        ctx.fillStyle = entry.color;
        ctx.fillText(entry.text, logX + 24, h - 114 + index * 20);
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    this.panel(w - 534, h - 180, 502, 122);
    ctx.save();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 13px Trebuchet MS, sans-serif";
    ctx.fillText("integrity", w - 506, h - 146);
    this.drawMeter(w - 506, h - 126, 412, scene.integrity / 100, "ship health", scene.integrity > 30 ? PALETTE.accent2 : PALETTE.warn);
    this.drawMeter(w - 506, h - 94, 412, scene.timer / scene.timerMax, "wave pressure", PALETTE.accent);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 14px Trebuchet MS, sans-serif";
    ctx.fillText(`civilians alive ${scene.civiliansAlive} / ${scene.civiliansTotal}`, w - 506, h - 52);
    ctx.restore();
  }

  drawMenu(scene) {
    this.drawCenterOverlay(
      "Skylord Defender",
      "Defender remix. Protect civilians, place turrets, deform terrain, and clear 5 waves.",
      "Enter or Space to launch the defense drill",
      PALETTE.accent
    );

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.panel(w * 0.07, h * 0.72, w * 0.34, h * 0.16);
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = PALETTE.accent2;
    ctx.font = "700 18px Trebuchet MS, sans-serif";
    ctx.fillText("Core controls", w * 0.09, h * 0.765);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 15px Trebuchet MS, sans-serif";
    ctx.fillText("WASD / arrows move the ship", w * 0.09, h * 0.805);
    ctx.fillText("Space or click fires at cursor", w * 0.09, h * 0.835);
    ctx.fillText("T deploys an automated turret", w * 0.09, h * 0.865);
    ctx.fillText("Terrain craters change movement lanes", w * 0.09, h * 0.895);
    ctx.restore();
    this.drawShipSprite("player-ship", w * 0.78, h * 0.24, 190, 0.92, Math.sin(scene.time * 0.5) * 0.06);
  }

  drawPause(scene) {
    this.drawHud(scene);
    this.drawCenterOverlay(
      "Paused",
      "Defense grid frozen. Resume, restart, or return to menu.",
      "P or Esc resumes. R restarts. M opens menu.",
      PALETTE.accent2
    );
  }

  drawResult(scene) {
    const accent = scene.outcome === "win" ? PALETTE.accent2 : PALETTE.warn;
    this.drawCenterOverlay(scene.title, scene.subtitle, scene.hint, accent);

    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.panel(w * 0.11, h * 0.72, w * 0.78, h * 0.18);
    ctx.save();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "400 15px Trebuchet MS, sans-serif";
    ctx.fillText(`score ${scene.score}`, w * 0.14, h * 0.77);
    ctx.fillText(`wave ${scene.wave}`, w * 0.14, h * 0.81);
    ctx.fillText(`integrity ${scene.integrity}%`, w * 0.14, h * 0.85);
    ctx.fillText(`elapsed ${scene.elapsed.toFixed(1)}s`, w * 0.14, h * 0.89);
    ctx.fillText(`civilians rescued ${scene.rescued}`, w * 0.47, h * 0.77);
    ctx.fillText(`civilians lost ${scene.lost}`, w * 0.47, h * 0.81);
    ctx.fillText(`turrets built ${scene.turretsBuilt}`, w * 0.47, h * 0.85);
    ctx.fillText(`enemies destroyed ${scene.enemiesDestroyed}`, w * 0.47, h * 0.89);
    ctx.restore();
  }
}
