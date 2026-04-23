export const createLightingSystem = (config) => ({
  config,
  rays: [],
  beamPolygon: [],
  lastSampleCount: 0,
  lastVisibleRatio: 0,
  lastBeamAngle: 0,
  update(player, maze) {
    this.playerX = player.x;
    this.playerY = player.y;
    const baseAngle = player.facingAngle ?? Math.atan2(player.facingY, player.facingX) ?? 0;
    const halfFov = this.config.fov * 0.5;
    const rayCount = Math.max(8, this.config.rayCount | 0);
    const rays = [];

    for (let index = 0; index < rayCount; index += 1) {
      const t = rayCount === 1 ? 0.5 : index / (rayCount - 1);
      const angle = baseAngle - halfFov + t * this.config.fov;
      const hit = maze.castRay(player.x, player.y, angle, this.config.radius);
      rays.push({ angle, ...hit });
    }

    this.rays = rays;
    this.beamPolygon = [{ x: player.x, y: player.y }, ...rays.map((ray) => ({ x: ray.x, y: ray.y }))];
    this.lastSampleCount = rays.length;
    this.lastBeamAngle = baseAngle;
    this.lastVisibleRatio = rays.length
      ? rays.reduce((sum, ray) => sum + Math.min(1, ray.distance / this.config.radius), 0) / rays.length
      : 0;
  },
  render(ctx, player, maze) {
    const width = maze.width;
    const height = maze.height;

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${this.config.darkness})`;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "destination-out";
    if (this.beamPolygon.length > 2) {
      const fill = ctx.createRadialGradient(
        player.x,
        player.y,
        this.config.radius * 0.08,
        player.x,
        player.y,
        this.config.radius
      );
      fill.addColorStop(0, "rgba(255,255,255,1)");
      fill.addColorStop(0.7, "rgba(255,255,255,0.92)");
      fill.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(this.beamPolygon[0].x, this.beamPolygon[0].y);
      for (let index = 1; index < this.beamPolygon.length; index += 1) {
        ctx.lineTo(this.beamPolygon[index].x, this.beamPolygon[index].y);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(player.x, player.y, this.config.radius * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(
      player.x,
      player.y,
      this.config.radius * 0.12,
      player.x,
      player.y,
      this.config.radius
    );
    glow.addColorStop(0, "rgba(126,248,255,0.38)");
    glow.addColorStop(0.6, "rgba(126,248,255,0.12)");
    glow.addColorStop(1, "rgba(126,248,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(player.x, player.y, this.config.radius, 0, Math.PI * 2);
    ctx.fill();

    if (this.config.debugRays) {
      ctx.strokeStyle = "rgba(126,248,255,0.24)";
      ctx.lineWidth = 1;
      for (const ray of this.rays) {
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(ray.x, ray.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  },
  getExposureAt(x, y, maze) {
    const playerX = this.playerX ?? x;
    const playerY = this.playerY ?? y;
    const dx = x - playerX;
    const dy = y - playerY;
    const distance = Math.hypot(dx, dy);
    if (distance > this.config.radius) {
      return 0;
    }

    const targetAngle = Math.atan2(dy, dx);
    const angleDiff = shortestAngleDelta(targetAngle, this.lastBeamAngle);
    const halfFov = this.config.fov * 0.5;
    if (Math.abs(angleDiff) > halfFov) {
      return 0;
    }

    if (!maze.hasLineOfSight(playerX, playerY, x, y)) {
      return 0;
    }

    const distanceFactor = Math.pow(Math.max(0, 1 - distance / this.config.radius), this.config.exposureCurve);
    const angleFactor = Math.pow(
      Math.max(0, 1 - Math.abs(angleDiff) / halfFov),
      this.config.angleCurve
    );
    return clamp(distanceFactor * angleFactor, 0, 1);
  },
  setPlayerPosition(x, y) {
    this.playerX = x;
    this.playerY = y;
  }
});

const shortestAngleDelta = (a, b) => {
  let delta = a - b;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
