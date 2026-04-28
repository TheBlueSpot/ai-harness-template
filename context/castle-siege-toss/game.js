(function () {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const GROUND_Y = 628;
  const GRAVITY = 1100;
  const AIR_DRAG = 0.0007;
  const BLOCK_FRICTION = 0.86;
  const RESTITUTION = 0.16;
  const SUPPORT_GAP = 18;
  const PROJECTILE_RADIUS = 16;
  const FORTS = [
    {
      name: "Gatehouse",
      ammo: 7,
      king: { x: 1005, y: 412, r: 18 },
      blocks: [
        { x: 920, y: 584, w: 34, h: 88, type: "stone" },
        { x: 962, y: 584, w: 34, h: 88, type: "stone" },
        { x: 1004, y: 584, w: 34, h: 88, type: "stone" },
        { x: 1046, y: 584, w: 34, h: 88, type: "stone" },
        { x: 1088, y: 584, w: 34, h: 88, type: "stone" },
        { x: 941, y: 514, w: 64, h: 28, type: "wood" },
        { x: 1005, y: 514, w: 64, h: 28, type: "wood" },
        { x: 1069, y: 514, w: 64, h: 28, type: "wood" },
        { x: 962, y: 452, w: 34, h: 82, type: "stone" },
        { x: 1048, y: 452, w: 34, h: 82, type: "stone" },
        { x: 1005, y: 410, w: 108, h: 24, type: "roof" },
        { x: 1005, y: 374, w: 58, h: 18, type: "roof" },
      ],
    },
    {
      name: "Twin Towers",
      ammo: 8,
      king: { x: 1042, y: 332, r: 20 },
      blocks: [
        { x: 950, y: 586, w: 36, h: 92, type: "stone" },
        { x: 990, y: 586, w: 36, h: 92, type: "stone" },
        { x: 1094, y: 586, w: 36, h: 92, type: "stone" },
        { x: 1134, y: 586, w: 36, h: 92, type: "stone" },
        { x: 970, y: 498, w: 76, h: 24, type: "roof" },
        { x: 1114, y: 498, w: 76, h: 24, type: "roof" },
        { x: 970, y: 426, w: 36, h: 86, type: "stone" },
        { x: 1114, y: 426, w: 36, h: 86, type: "stone" },
        { x: 1042, y: 566, w: 84, h: 24, type: "wood" },
        { x: 1042, y: 534, w: 84, h: 24, type: "wood" },
        { x: 1042, y: 464, w: 34, h: 88, type: "stone" },
        { x: 1042, y: 376, w: 34, h: 88, type: "stone" },
        { x: 1042, y: 304, w: 118, h: 24, type: "roof" },
      ],
    },
    {
      name: "Royal Keep",
      ammo: 9,
      king: { x: 1048, y: 292, r: 22 },
      blocks: [
        { x: 920, y: 590, w: 34, h: 96, type: "stone" },
        { x: 962, y: 590, w: 34, h: 96, type: "stone" },
        { x: 1004, y: 590, w: 34, h: 96, type: "stone" },
        { x: 1046, y: 590, w: 34, h: 96, type: "stone" },
        { x: 1088, y: 590, w: 34, h: 96, type: "stone" },
        { x: 1130, y: 590, w: 34, h: 96, type: "stone" },
        { x: 941, y: 516, w: 64, h: 24, type: "roof" },
        { x: 1005, y: 516, w: 64, h: 24, type: "roof" },
        { x: 1069, y: 516, w: 64, h: 24, type: "roof" },
        { x: 947, y: 440, w: 30, h: 84, type: "stone" },
        { x: 1001, y: 440, w: 30, h: 84, type: "stone" },
        { x: 1055, y: 440, w: 30, h: 84, type: "stone" },
        { x: 1109, y: 440, w: 30, h: 84, type: "stone" },
        { x: 1028, y: 370, w: 150, h: 24, type: "wood" },
        { x: 1048, y: 312, w: 38, h: 86, type: "stone" },
        { x: 1048, y: 246, w: 122, h: 22, type: "roof" },
      ],
    },
  ];

  const MATERIALS = {
    stone: { hp: 110, density: 1, color: "#91837c", stroke: "#5d534f", points: 120, debris: "#d6c4b4" },
    wood: { hp: 70, density: 0.72, color: "#8d6031", stroke: "#55361a", points: 95, debris: "#d0a269" },
    roof: { hp: 60, density: 0.54, color: "#ab3b3b", stroke: "#662020", points: 140, debris: "#ed9183" },
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayEyebrow = document.getElementById("overlayEyebrow");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayCopy = document.getElementById("overlayCopy");
  const overlayButton = document.getElementById("overlayButton");
  const fortText = document.getElementById("fortText");
  const ammoText = document.getElementById("ammoText");
  const angleText = document.getElementById("angleText");
  const powerText = document.getElementById("powerText");
  const scoreText = document.getElementById("scoreText");
  const statusText = document.getElementById("statusText");

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function overlapsHorizontally(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w - 4;
  }

  function rectCirclePenetration(circle, block) {
    const dx = circle.x - clamp(circle.x, block.x - block.w / 2, block.x + block.w / 2);
    const dy = circle.y - clamp(circle.y, block.y - block.h / 2, block.y + block.h / 2);
    return circle.r * circle.r - (dx * dx + dy * dy);
  }

  function makeBlock(spec, fortIndex, index) {
    const material = MATERIALS[spec.type];
    return {
      id: `f${fortIndex}-b${index}`,
      x: spec.x,
      y: spec.y,
      w: spec.w,
      h: spec.h,
      type: spec.type,
      hp: material.hp,
      maxHp: material.hp,
      density: material.density,
      color: material.color,
      stroke: material.stroke,
      points: material.points,
      debris: material.debris,
      vx: 0,
      vy: 0,
      dynamic: false,
      removed: false,
      restTime: 0,
      supportMissingTime: 0,
      impactLock: 0,
      lastGroundY: spec.y,
    };
  }

  class Game {
    constructor() {
      this.input = {
        angleUp: false,
        angleDown: false,
        powerUp: false,
        powerDown: false,
      };
      this.restart();
    }

    restart() {
      this.mode = "menu";
      this.fortIndex = 0;
      this.score = 0;
      this.angle = 44;
      this.power = 63;
      this.projectile = null;
      this.particles = [];
      this.shake = 0;
      this.message = "Tune the trebuchet, then launch.";
      this.loadFort(0);
    }

    loadFort(index) {
      const fort = FORTS[index];
      this.fortIndex = index;
      this.blocks = fort.blocks.map((block, blockIndex) => makeBlock(block, index, blockIndex));
      this.king = {
        x: fort.king.x,
        y: fort.king.y,
        r: fort.king.r,
        alive: true,
        vy: 0,
      };
      this.projectile = null;
      this.particles = [];
      this.ammo = fort.ammo;
      this.fortCleared = false;
      this.collapseBonus = 0;
      this.settleTimer = 0;
      this.message = `Fort ${index + 1}: ${fort.name}. Break support columns for bigger collapse score.`;
    }

    start() {
      if (this.mode === "menu") {
        this.mode = "playing";
      }
    }

    fire() {
      if (this.mode !== "playing" || this.projectile || this.ammo <= 0 || this.fortCleared) {
        return;
      }
      const radians = (this.angle * Math.PI) / 180;
      const powerScale = 430 + this.power * 8.2;
      this.projectile = {
        x: 164,
        y: 516,
        vx: Math.cos(radians) * powerScale,
        vy: -Math.sin(radians) * powerScale,
        r: PROJECTILE_RADIUS,
        alive: true,
      };
      this.ammo -= 1;
      this.message = "Stone airborne.";
      this.shake = 6;
    }

    update(dt) {
      this.tickInput(dt);
      this.tickProjectile(dt);
      this.tickBlocks(dt);
      this.tickKing(dt);
      this.tickParticles(dt);
      this.resolveFort(dt);
    }

    tickInput(dt) {
      if (this.mode !== "playing") {
        return;
      }
      const angleRate = 44;
      const powerRate = 38;
      if (this.input.angleUp) {
        this.angle = clamp(this.angle + angleRate * dt, 20, 78);
      }
      if (this.input.angleDown) {
        this.angle = clamp(this.angle - angleRate * dt, 20, 78);
      }
      if (this.input.powerUp) {
        this.power = clamp(this.power + powerRate * dt, 28, 100);
      }
      if (this.input.powerDown) {
        this.power = clamp(this.power - powerRate * dt, 28, 100);
      }
      this.shake = Math.max(0, this.shake - 18 * dt);
    }

    tickProjectile(dt) {
      const projectile = this.projectile;
      if (!projectile || !projectile.alive) {
        return;
      }
      projectile.vy += GRAVITY * dt;
      projectile.vx *= 1 - AIR_DRAG;
      projectile.vy *= 1 - AIR_DRAG;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;

      if (projectile.y + projectile.r >= GROUND_Y) {
        projectile.y = GROUND_Y - projectile.r;
        this.splashImpact(projectile.x, projectile.y, Math.abs(projectile.vy) * 0.7 + Math.abs(projectile.vx) * 0.22, 88);
        this.projectile = null;
        return;
      }

      for (const block of this.blocks) {
        if (block.removed) {
          continue;
        }
        const penetration = rectCirclePenetration(projectile, block);
        if (penetration > 0) {
          const impact = Math.hypot(projectile.vx, projectile.vy);
          this.damageBlock(block, 36 + impact * 0.05, "projectile");
          block.dynamic = true;
          block.vx += projectile.vx * 0.05;
          block.vy += projectile.vy * 0.03;
          this.splashImpact(projectile.x, projectile.y, impact, 108);
          this.projectile = null;
          return;
        }
      }

      if (this.king.alive) {
        const dx = projectile.x - this.king.x;
        const dy = projectile.y - this.king.y;
        if (Math.hypot(dx, dy) < projectile.r + this.king.r) {
          this.king.alive = false;
          this.score += 1500;
          this.message = "Royal target down. The keep is compromised.";
          this.spawnBurst(this.king.x, this.king.y, "#ffd76d", 18, 220);
          this.projectile = null;
          this.shake = 14;
        }
      }

      if (projectile.x > WIDTH + 80 || projectile.y > HEIGHT + 80) {
        this.projectile = null;
      }
    }

    tickBlocks(dt) {
      const activeBlocks = this.blocks.filter((block) => !block.removed);

      for (const block of activeBlocks) {
        block.impactLock = Math.max(0, block.impactLock - dt);
        const grounded = this.isBlockGrounded(block, activeBlocks);
        if (!grounded) {
          block.supportMissingTime += dt;
          if (block.supportMissingTime > 0.08) {
            block.dynamic = true;
          }
        } else {
          block.supportMissingTime = 0;
          if (Math.abs(block.vx) < 8 && Math.abs(block.vy) < 12) {
            block.restTime += dt;
            if (block.restTime > 0.2) {
              block.dynamic = false;
              block.vx = 0;
              block.vy = 0;
            }
          } else {
            block.restTime = 0;
          }
        }

        if (!block.dynamic) {
          continue;
        }

        block.vy += GRAVITY * dt * (0.74 + block.density * 0.36);
        block.x += block.vx * dt;
        block.y += block.vy * dt;
        block.vx *= 0.996;

        if (block.y + block.h / 2 >= GROUND_Y) {
          const fallSpeed = Math.abs(block.vy);
          block.y = GROUND_Y - block.h / 2;
          block.vy = -block.vy * RESTITUTION;
          block.vx *= BLOCK_FRICTION;
          if (fallSpeed > 210) {
            this.damageBlock(block, fallSpeed * 0.07, "ground");
            this.score += Math.round(fallSpeed * 0.12);
            this.message = "Ground impact scored collapse points.";
            this.spawnBurst(block.x, GROUND_Y - 10, block.debris, 7, 120);
          }
          block.lastGroundY = block.y;
        }

        for (const other of activeBlocks) {
          if (other === block || other.removed) {
            continue;
          }
          if (!this.blocksOverlap(block, other)) {
            continue;
          }
          const overlapY = block.y + block.h / 2 - (other.y - other.h / 2);
          if (overlapY > 0 && block.y < other.y) {
            block.y -= overlapY;
            const impact = Math.abs(block.vy - other.vy);
            const lateral = (block.x - other.x) * 0.5;
            block.vy = Math.min(0, -block.vy * 0.12);
            other.vy += impact * 0.1;
            other.vx -= lateral;
            block.vx += lateral * 0.3;
            if (impact > 190 && block.impactLock === 0) {
              block.impactLock = 0.12;
              other.impactLock = 0.12;
              this.damageBlock(other, impact * 0.05, "collapse");
              this.damageBlock(block, impact * 0.035, "collapse");
              this.score += Math.round(impact * 0.18);
              this.spawnBurst(block.x, block.y, block.debris, 5, 96);
            }
          }
        }
      }
    }

    tickKing(dt) {
      if (!this.king.alive) {
        return;
      }
      const support = this.blocks.some((block) => {
        if (block.removed) {
          return false;
        }
        const kingBottom = this.king.y + this.king.r;
        const blockTop = block.y - block.h / 2;
        return (
          Math.abs(kingBottom - blockTop) < 26 &&
          Math.abs(this.king.x - block.x) < block.w / 2 + this.king.r + 4
        );
      });
      if (!support) {
        this.king.vy += GRAVITY * dt;
        this.king.y += this.king.vy * dt;
        if (this.king.y + this.king.r >= GROUND_Y) {
          this.king.alive = false;
          this.score += 1500;
          this.message = "The royal target fell with the rubble.";
          this.spawnBurst(this.king.x, GROUND_Y - 12, "#ffd76d", 16, 180);
          this.shake = 16;
        }
      } else {
        this.king.vy = 0;
      }
    }

    tickParticles(dt) {
      for (const particle of this.particles) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 440 * dt;
      }
      this.particles = this.particles.filter((particle) => particle.life > 0);
    }

    resolveFort(dt) {
      if (this.mode !== "playing") {
        return;
      }
      const remainingBlocks = this.blocks.filter((block) => !block.removed);
      const lowMass = remainingBlocks.length <= 3;
      if (!this.fortCleared && (!this.king.alive || lowMass)) {
        this.fortCleared = true;
        this.settleTimer = 1.2;
        this.score += 700 + this.ammo * 100;
        this.message = `Fort ${this.fortIndex + 1} collapsed. Remaining ammo converted to bonus score.`;
      }

      if (this.fortCleared) {
        this.settleTimer -= dt;
        if (this.settleTimer <= 0) {
          if (this.fortIndex >= FORTS.length - 1) {
            this.mode = "win";
          } else {
            this.loadFort(this.fortIndex + 1);
          }
        }
        return;
      }

      if (this.ammo <= 0 && !this.projectile) {
        const moving = remainingBlocks.some((block) => Math.abs(block.vx) > 20 || Math.abs(block.vy) > 20);
        if (!moving) {
          this.mode = "lose";
          this.message = "Siege spent. Break more support with earlier shots.";
        }
      }
    }

    blocksOverlap(a, b) {
      return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
    }

    isBlockGrounded(block, blocks) {
      if (block.y + block.h / 2 >= GROUND_Y - 2) {
        return true;
      }
      for (const other of blocks) {
        if (other === block || other.removed) {
          continue;
        }
        const touchingTop = Math.abs(block.y + block.h / 2 - (other.y - other.h / 2)) < SUPPORT_GAP;
        if (touchingTop && overlapsHorizontally(block, other)) {
          return true;
        }
      }
      return false;
    }

    damageBlock(block, amount, source) {
      if (block.removed) {
        return;
      }
      block.hp -= amount;
      if (block.hp > 0) {
        return;
      }
      block.removed = true;
      const structuralBonus = source === "collapse" ? 1.35 : source === "ground" ? 1.15 : 1;
      const points = Math.round(block.points * structuralBonus);
      this.score += points;
      this.spawnBurst(block.x, block.y, block.debris, 10, 160);
      this.shake = Math.max(this.shake, source === "projectile" ? 9 : 6);
      if (source === "collapse") {
        this.message = "Support failure chained into a structural break.";
      }
    }

    splashImpact(x, y, impact, radius) {
      this.spawnBurst(x, y, "#f4e2bf", 14, 210);
      for (const block of this.blocks) {
        if (block.removed) {
          continue;
        }
        const dx = block.x - x;
        const dy = block.y - y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > radius + Math.max(block.w, block.h)) {
          continue;
        }
        const force = (1 - distance / (radius + Math.max(block.w, block.h))) * impact;
        block.dynamic = true;
        block.vx += (dx / distance) * force * 0.16;
        block.vy += (dy / distance) * force * 0.1;
        this.damageBlock(block, force * 0.06, "projectile");
      }
    }

    spawnBurst(x, y, color, count, speed) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = speed * (0.3 + Math.random() * 0.7);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity - 60,
          life: 0.25 + Math.random() * 0.35,
          color,
          size: 2 + Math.random() * 4,
        });
      }
    }

    getOverlay() {
      if (this.mode === "menu") {
        return {
          eyebrow: "siege physics",
          title: "Crush the Castle Siege-Toss",
          copy: "Use each stone to break supports, topple roofs, and cash in on collapse scoring across three forts.",
          button: "Start Siege",
        };
      }
      if (this.mode === "win") {
        return {
          eyebrow: "forts down",
          title: "All keeps collapsed.",
          copy: `Final score ${this.score}. Restart for another siege run and cleaner support breaks.`,
          button: "Restart Siege",
        };
      }
      if (this.mode === "lose") {
        return {
          eyebrow: "ammo spent",
          title: "The walls are still standing.",
          copy: "Lower-angle shots into support legs usually score better than center-mass roof hits.",
          button: "Restart Siege",
        };
      }
      return null;
    }

    getState() {
      return {
        fortLabel: `${Math.min(this.fortIndex + 1, FORTS.length)} / ${FORTS.length}`,
        ammo: this.ammo,
        angle: `${Math.round(this.angle)} deg`,
        power: `${Math.round(this.power)}%`,
        score: this.score,
        status: this.message,
        overlay: this.getOverlay(),
      };
    }

    render(context) {
      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      context.save();
      context.translate(shakeX, shakeY);

      context.clearRect(-40, -40, WIDTH + 80, HEIGHT + 80);
      this.drawSky(context);
      this.drawGround(context);
      this.drawTrebuchet(context);
      this.drawTrajectoryGuide(context);
      this.drawCastle(context);
      this.drawProjectile(context);
      this.drawParticles(context);

      context.restore();
    }

    drawSky(context) {
      const sky = context.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, "#8fc4e5");
      sky.addColorStop(0.55, "#c7d9c5");
      sky.addColorStop(1, "#e4cf9d");
      context.fillStyle = sky;
      context.fillRect(0, 0, WIDTH, GROUND_Y);

      context.fillStyle = "rgba(255,255,255,0.3)";
      context.beginPath();
      context.arc(210, 112, 44, 0, Math.PI * 2);
      context.arc(250, 104, 54, 0, Math.PI * 2);
      context.arc(300, 118, 36, 0, Math.PI * 2);
      context.fill();
    }

    drawGround(context) {
      context.fillStyle = "#7c6b45";
      context.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
      context.fillStyle = "#9e8b5d";
      context.fillRect(0, GROUND_Y - 18, WIDTH, 18);
      context.fillStyle = "#5a7f45";
      context.fillRect(0, GROUND_Y - 8, WIDTH, 8);
    }

    drawTrebuchet(context) {
      context.save();
      context.translate(130, GROUND_Y - 10);
      context.fillStyle = "#6f4824";
      context.fillRect(-38, -18, 80, 18);
      context.fillRect(-26, -96, 14, 78);
      context.fillRect(16, -110, 14, 92);
      context.strokeStyle = "#50311b";
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(-20, -88);
      context.lineTo(24, -102);
      context.stroke();

      const radians = (this.angle * Math.PI) / 180;
      context.save();
      context.translate(-20, -88);
      context.rotate(-radians);
      context.strokeStyle = "#3d2715";
      context.lineWidth = 10;
      context.beginPath();
      context.moveTo(-28, 0);
      context.lineTo(88, 0);
      context.stroke();
      context.fillStyle = "#d7b981";
      context.beginPath();
      context.arc(92, 0, 14, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.restore();
    }

    drawTrajectoryGuide(context) {
      if (this.mode !== "playing" || this.projectile) {
        return;
      }
      const radians = (this.angle * Math.PI) / 180;
      const speed = 430 + this.power * 8.2;
      let x = 164;
      let y = 516;
      let vx = Math.cos(radians) * speed;
      let vy = -Math.sin(radians) * speed;
      context.strokeStyle = "rgba(255,255,255,0.28)";
      context.setLineDash([8, 8]);
      context.beginPath();
      context.moveTo(x, y);
      for (let i = 0; i < 30; i += 1) {
        vx *= 1 - AIR_DRAG;
        vy = vy * (1 - AIR_DRAG) + GRAVITY * 0.06;
        x += vx * 0.06;
        y += vy * 0.06;
        context.lineTo(x, y);
        if (y > GROUND_Y) {
          break;
        }
      }
      context.stroke();
      context.setLineDash([]);
    }

    drawCastle(context) {
      context.fillStyle = "#6b5f4c";
      context.fillRect(840, GROUND_Y - 20, 360, 20);

      for (const block of this.blocks) {
        if (block.removed) {
          continue;
        }
        context.fillStyle = block.color;
        context.strokeStyle = block.stroke;
        context.lineWidth = 3;
        context.fillRect(block.x - block.w / 2, block.y - block.h / 2, block.w, block.h);
        context.strokeRect(block.x - block.w / 2, block.y - block.h / 2, block.w, block.h);
        const hpRatio = clamp(block.hp / block.maxHp, 0, 1);
        if (hpRatio < 1) {
          context.fillStyle = "rgba(0,0,0,0.2)";
          context.fillRect(block.x - block.w / 2, block.y - block.h / 2, block.w, block.h * (1 - hpRatio));
        }
      }

      if (this.king.alive) {
        context.fillStyle = "#ffd76d";
        context.beginPath();
        context.arc(this.king.x, this.king.y, this.king.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#7b3b2b";
        context.fillRect(this.king.x - 10, this.king.y - 28, 20, 8);
        context.fillStyle = "#a42020";
        context.beginPath();
        context.moveTo(this.king.x, this.king.y - 44);
        context.lineTo(this.king.x + 18, this.king.y - 28);
        context.lineTo(this.king.x - 18, this.king.y - 28);
        context.closePath();
        context.fill();
      }
    }

    drawProjectile(context) {
      if (!this.projectile) {
        return;
      }
      context.fillStyle = "#4b3d33";
      context.beginPath();
      context.arc(this.projectile.x, this.projectile.y, this.projectile.r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(255,255,255,0.2)";
      context.stroke();
    }

    drawParticles(context) {
      for (const particle of this.particles) {
        context.globalAlpha = clamp(particle.life / 0.6, 0, 1);
        context.fillStyle = particle.color;
        context.fillRect(particle.x, particle.y, particle.size, particle.size);
      }
      context.globalAlpha = 1;
    }
  }

  const game = new Game();
  window.__castleSiegeToss = game;

  function syncUi() {
    const state = game.getState();
    fortText.textContent = state.fortLabel;
    ammoText.textContent = `${state.ammo}`;
    angleText.textContent = state.angle;
    powerText.textContent = state.power;
    scoreText.textContent = `${state.score}`;
    statusText.textContent = state.status;
    if (state.overlay) {
      overlay.hidden = false;
      overlayEyebrow.textContent = state.overlay.eyebrow;
      overlayTitle.textContent = state.overlay.title;
      overlayCopy.textContent = state.overlay.copy;
      overlayButton.textContent = state.overlay.button;
    } else {
      overlay.hidden = true;
    }
  }

  overlayButton.addEventListener("click", () => {
    if (game.mode === "menu") {
      game.start();
    } else {
      game.restart();
      game.start();
    }
    syncUi();
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "ArrowUp") {
      game.input.angleUp = true;
    } else if (event.code === "ArrowDown") {
      game.input.angleDown = true;
    } else if (event.code === "ArrowRight") {
      game.input.powerUp = true;
    } else if (event.code === "ArrowLeft") {
      game.input.powerDown = true;
    } else if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        game.fire();
      }
    } else if (event.code === "KeyR" && !event.repeat) {
      game.restart();
      game.start();
    } else if (event.code === "Enter" && !event.repeat) {
      if (game.mode === "menu") {
        game.start();
      } else if (game.mode === "win" || game.mode === "lose") {
        game.restart();
        game.start();
      }
    }
    syncUi();
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowUp") {
      game.input.angleUp = false;
    } else if (event.code === "ArrowDown") {
      game.input.angleDown = false;
    } else if (event.code === "ArrowRight") {
      game.input.powerUp = false;
    } else if (event.code === "ArrowLeft") {
      game.input.powerDown = false;
    }
  });

  syncUi();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.render(ctx);
    syncUi();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
