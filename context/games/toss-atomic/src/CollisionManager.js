import {
  COLLISION,
  ENTITY_TYPES,
  PARTICLE_PALETTES,
  PHYSICS,
  RUN_STATES,
  SCORING,
  WORLD,
} from "./constants.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

function magnitude(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const mag = Math.hypot(x, y) || 1;
  return [x / mag, y / mag];
}

function sampleTerrainHeight(x, terrain = null) {
  if (typeof terrain === "function") {
    return terrain(x);
  }

  const waveA = Math.sin(x / 430) * 72;
  const waveB = Math.sin(x / 970 + 0.55) * 122;
  const waveC = Math.cos(x / 2160 - 0.3) * 48;
  const crater = Math.sin(x / 115 + 1.75) * Math.cos(x / 280) * 30;
  return WORLD.groundBase + waveA + waveB + waveC + crater;
}

function terrainNormal(x, terrain = null, epsilon = 12) {
  const h1 = sampleTerrainHeight(x - epsilon, terrain);
  const h2 = sampleTerrainHeight(x + epsilon, terrain);
  const slope = (h2 - h1) / (epsilon * 2);
  return normalize(-slope, 1);
}

function impactIntensity(speed, mass = 1) {
  return clamp(speed * mass * 0.016, 0.15, 5.6);
}

export class CollisionManager {
  constructor(options = {}) {
    this.boundGame = options && typeof options === "object" && "projectile" in options ? options : null;
    this.impacts = arguments.length > 1 ? arguments[1] : options?.impacts ?? null;
    this.time = 0;
    this.state = {
      mode: RUN_STATES.READY,
    };
    this.config = {
      groundRestitution: options.groundRestitution ?? PHYSICS.groundRestitution,
      groundFriction: options.groundFriction ?? PHYSICS.groundFriction,
      hazardRestitution: options.hazardRestitution ?? PHYSICS.hazardRestitution,
      hazardFriction: options.hazardFriction ?? PHYSICS.hazardFriction,
      bombRestitution: options.bombRestitution ?? PHYSICS.bombRestitution,
      hazardKnockback: options.hazardKnockback ?? COLLISION.hazardKnockback,
      bombBlastImpulse: options.bombBlastImpulse ?? COLLISION.bombBlastImpulse,
      bombBlastRadius: options.bombBlastRadius ?? COLLISION.bombBlastRadius,
      settleSpeed: options.settleSpeed ?? PHYSICS.settleSpeed,
      bounceSleepSpeed: options.bounceSleepSpeed ?? PHYSICS.bounceSleepSpeed,
      contactGrace: options.contactGrace ?? COLLISION.contactGrace,
      scorePerMeter: options.scorePerMeter ?? COLLISION.scorePerMeter,
      scorePerHit: options.scorePerHit ?? COLLISION.scorePerHit,
      scorePerBomb: options.scorePerBomb ?? COLLISION.scorePerBomb,
    };
  }

  resetRound() {
    this.time = 0;
    this.state.mode = RUN_STATES.READY;

    if (!this.boundGame) {
      return;
    }

    const { projectile, hazards, bombs } = this.boundGame;

    if (projectile) {
      projectile.active = false;
      projectile.launched = false;
      projectile.settled = false;
      projectile.vx = 0;
      projectile.vy = 0;
      projectile.speed = 0;
      if (this.boundGame.launcher) {
        projectile.x = this.boundGame.launcher.x;
        projectile.y = this.boundGame.launcher.y;
      }
    }

    if (Array.isArray(hazards)) {
      for (const hazard of hazards) {
        if (!hazard) {
          continue;
        }
        hazard.active = true;
        hazard.wobble = 0;
      }
    }

    if (Array.isArray(bombs)) {
      for (const bomb of bombs) {
        if (!bomb) {
          continue;
        }
        bomb.active = true;
        bomb.detonated = false;
        bomb.smokeLife = 0;
      }
    }
  }

  update(...args) {
    if (args.length === 1 && typeof args[0] === "number" && this.boundGame) {
      return this.updateBoundGame(args[0]);
    }
    return this.resolve(...args);
  }

  updateBoundGame(dt = 1 / 60) {
    if (!this.boundGame) {
      return null;
    }

    const projectile = this.boundGame.projectile;
    if (!projectile?.active) {
      return null;
    }

    const result = this.resolve(projectile, {
      terrain: this.boundGame.terrain ?? null,
      hazards: this.boundGame.hazards ?? [],
      bombs: this.boundGame.bombs ?? [],
      stats: this.boundGame.stats ?? this.boundGame,
    }, dt);

    if (this.impacts && Array.isArray(result?.particles) && typeof this.impacts.emitBurst === "function") {
      for (const particle of result.particles) {
        const palette = Array.isArray(particle.palette) ? particle.palette : [particle.color ?? "#ffb347"];
        this.impacts.emitBurst(particle.x, particle.y, palette[0], particle.intensity ?? 1);
      }
    }

    return result;
  }

  resolve(entity, world = {}, dt = 1 / 60) {
    const events = [];
    const particles = [];
    const stats = world.stats ?? {};
    const terrain = world.terrain ?? null;
    const hazards = Array.isArray(world.hazards) ? world.hazards : [];
    const bombs = Array.isArray(world.bombs) ? world.bombs : [];

    const groundY = sampleTerrainHeight(entity.x, terrain);
    const altitude = Math.max(0, groundY - (entity.y + entity.radius));
    entity.altitude = altitude;
    entity.maxAltitude = Math.max(entity.maxAltitude ?? 0, altitude);
    entity.speed = magnitude(entity.vx, entity.vy);
    if (stats.maxAltitude !== undefined) {
      stats.maxAltitude = Math.max(stats.maxAltitude, altitude);
    }

    if (entity.y + entity.radius >= groundY - this.config.contactGrace) {
      const normal = terrainNormal(entity.x, terrain);
      const tangent = [normal[1], -normal[0]];
      const speed = magnitude(entity.vx, entity.vy);
      entity.speed = speed;
      const vn = dot(entity.vx, entity.vy, normal[0], normal[1]);
      const vt = dot(entity.vx, entity.vy, tangent[0], tangent[1]);

      if (vn > 0) {
        const restitution = this.config.groundRestitution;
        const friction = this.config.groundFriction;
        const bounce = Math.max(0, vn * restitution);
        const retainedTangent = vt * (1 - friction);

        entity.vx = tangent[0] * retainedTangent - normal[0] * bounce;
        entity.vy = tangent[1] * retainedTangent - normal[1] * bounce;
        entity.y = groundY - entity.radius - 0.5;
        entity.bounceCount = (entity.bounceCount ?? 0) + 1;
        entity.impactCooldown = 0.08;

        const hardHit = speed > this.config.bounceSleepSpeed;
        const intensity = impactIntensity(speed, entity.mass ?? 1);
        const particlePalette = hardHit ? PARTICLE_PALETTES.ground : PARTICLE_PALETTES.smoke;

        events.push({
          type: "terrainContact",
          x: entity.x,
          y: groundY,
          speed,
          normal,
          bounce,
          tangentSpeed: retainedTangent,
          intensity,
          hardHit,
        });

        particles.push({
          kind: "impact",
          x: entity.x,
          y: groundY,
          intensity,
          palette: particlePalette,
          spread: hardHit ? 1.45 : 0.75,
          size: hardHit ? 4.6 : 2.5,
        });

        if (stats.bounces !== undefined) {
          stats.bounces += 1;
        }
        if (stats.impacts !== undefined) {
          stats.impacts += 1;
        }
        if (stats.score !== undefined) {
          stats.score += Math.round(intensity * this.config.scorePerMeter * SCORING.hardImpactBonusFactor);
        }

        if (speed <= this.config.settleSpeed) {
          entity.vx *= 0.42;
          entity.vy = 0;
          entity.grounded = true;
          entity.settled = true;
          entity.launched = true;
          entity.airborne = false;
          stats.settled = true;
        } else {
          entity.grounded = false;
          entity.settled = false;
          entity.airborne = true;
        }
      }
    }

    for (const hazard of hazards) {
      if (!hazard || !hazard.active) {
        continue;
      }

      const dx = entity.x - hazard.x;
      const dy = entity.y - hazard.y;
      const hitDistance = (entity.radius ?? COLLISION.heroRadius) + (hazard.radius ?? COLLISION.hazardRadius);
      const distance = Math.hypot(dx, dy);
      if (distance >= hitDistance) {
        continue;
      }

      const [nx, ny] = normalize(dx || 0.01, dy || -0.01);
      const vn = dot(entity.vx, entity.vy, nx, ny);
      const speed = magnitude(entity.vx, entity.vy);
      entity.speed = speed;
      const restitution = hazard.restitution ?? this.config.hazardRestitution;
      const friction = hazard.friction ?? this.config.hazardFriction;
      const separation = hitDistance - distance + 0.5;

      entity.x += nx * separation;
      entity.y += ny * separation;

      if (vn < 0) {
        const bounceImpulse = Math.max(220, -vn * restitution + hazard.knockback * 0.15);
        const tangent = [ny, -nx];
        const tangential = dot(entity.vx, entity.vy, tangent[0], tangent[1]) * (1 - friction);

        entity.vx = tangent[0] * tangential + nx * bounceImpulse;
        entity.vy = tangent[1] * tangential + ny * bounceImpulse;
      } else {
        entity.vx += nx * hazard.knockback * 0.008;
        entity.vy += ny * hazard.knockback * 0.008;
      }

      entity.hazardHits = (entity.hazardHits ?? 0) + 1;
      entity.combo = Math.min((entity.combo ?? 0) + 1, 10);

      const intensity = impactIntensity(speed + hazard.knockback * 0.1, entity.mass ?? 1);
      events.push({
        type: "hazardHit",
        x: hazard.x,
        y: hazard.y,
        hazard,
        intensity,
        speed,
      });
      particles.push({
        kind: "hazard",
        x: hazard.x,
        y: hazard.y,
        intensity,
        palette: PARTICLE_PALETTES.hazard,
        spread: 1.2,
        size: 3.8,
      });

      if (stats.hazards !== undefined) {
        stats.hazards += 1;
      }
      if (stats.impacts !== undefined) {
        stats.impacts += 1;
      }
      if (stats.score !== undefined) {
        stats.score += hazard.score ?? this.config.scorePerHit;
      }

      hazard.active = hazard.kind === "crusher" ? false : hazard.active;
    }

    for (const bomb of bombs) {
      if (!bomb || bomb.detonated || !bomb.active) {
        continue;
      }

      const dx = entity.x - bomb.x;
      const dy = entity.y - bomb.y;
      const radius = (entity.radius ?? COLLISION.heroRadius) + (bomb.radius ?? COLLISION.bombRadius);
      if (dx * dx + dy * dy > radius * radius) {
        continue;
      }

      const distance = Math.hypot(dx, dy) || 1;
      const [nx, ny] = [dx / distance, dy / distance];
      const speed = magnitude(entity.vx, entity.vy);
      entity.speed = speed;
      const blastRadius = bomb.blastRadius ?? this.config.bombBlastRadius;
      const blastImpulse = bomb.blastImpulse ?? this.config.bombBlastImpulse;
      const directImpulse = Math.max(this.config.bombBlastImpulse * 0.72, blastImpulse);
      const push = directImpulse * (1 + clamp(1 - distance / radius, 0, 1));

      entity.vx += nx * push * 0.55;
      entity.vy += ny * push * 0.55;
      entity.vy -= directImpulse * 0.22;
      entity.combo = Math.min((entity.combo ?? 0) + 2, 12);
      entity.bombHits = (entity.bombHits ?? 0) + 1;

      bomb.detonated = true;
      bomb.active = false;
      bomb.smokeLife = 1.4;

      const intensity = impactIntensity(speed + directImpulse * 0.0015, entity.mass ?? 1);
      events.push({
        type: "bombDetonation",
        x: bomb.x,
        y: bomb.y,
        bomb,
        intensity,
        speed,
        blastRadius,
        blastImpulse,
      });
      particles.push({
        kind: "bomb",
        x: bomb.x,
        y: bomb.y,
        intensity: intensity * 1.55,
        palette: PARTICLE_PALETTES.bomb,
        spread: 1.7,
        size: 5.4,
      });
      particles.push({
        kind: "smoke",
        x: bomb.x,
        y: bomb.y,
        intensity: 2.1,
        palette: PARTICLE_PALETTES.smoke,
        spread: 1.15,
        size: 6.2,
      });

      if (stats.bombs !== undefined) {
        stats.bombs += 1;
      }
      if (stats.impacts !== undefined) {
        stats.impacts += 1;
      }
      if (stats.score !== undefined) {
        stats.score += bomb.score ?? this.config.scorePerBomb;
      }

      for (const otherBomb of bombs) {
        if (!otherBomb || otherBomb === bomb || otherBomb.detonated) {
          continue;
        }

        const ox = otherBomb.x - bomb.x;
        const oy = otherBomb.y - bomb.y;
        const dist = Math.hypot(ox, oy);
        if (dist > blastRadius) {
          continue;
        }

        const falloff = 1 - dist / blastRadius;
        const burst = blastImpulse * falloff * 0.42;
        const [bx, by] = normalize(ox, oy);
        otherBomb.smokeLife = Math.max(otherBomb.smokeLife, 0.85);
        events.push({
          type: "blastChain",
          x: otherBomb.x,
          y: otherBomb.y,
          bomb: otherBomb,
          impulse: burst,
        });
        if (falloff > 0.55) {
          otherBomb.detonated = true;
          otherBomb.active = false;
        }
        entity.vx += bx * burst * 0.06;
        entity.vy += by * burst * 0.06;
      }
    }

    if (entity.x <= 0 || entity.x >= WORLD.width) {
      events.push({
        type: "worldBounds",
        x: entity.x,
        y: entity.y,
        side: entity.x <= 0 ? "left" : "right",
      });
      entity.x = clamp(entity.x, 0, WORLD.width);
      entity.vx *= -0.22;
    }

    if (entity.y > WORLD.height + 200) {
      entity.y = WORLD.height + 200;
      entity.vy = -Math.abs(entity.vy) * 0.1;
    }

    if (Math.abs(entity.vx) < this.config.settleSpeed && Math.abs(entity.vy) < this.config.settleSpeed && entity.altitude <= 1) {
      entity.settled = true;
      entity.grounded = true;
      entity.vx *= 0.55;
      entity.vy = 0;
      this.state.mode = RUN_STATES.SETTLING;
    } else {
      entity.settled = false;
    }

    entity.vx = clamp(entity.vx, -PHYSICS.terminalSpeed, PHYSICS.terminalSpeed);
    entity.vy = clamp(entity.vy, -PHYSICS.terminalSpeed, PHYSICS.terminalSpeed);
    entity.speed = magnitude(entity.vx, entity.vy);

    if (stats.distance !== undefined) {
      stats.distance = Math.max(stats.distance, entity.distance ?? entity.x);
    }
    if (stats.altitude !== undefined) {
      stats.altitude = Math.max(stats.altitude, altitude);
    }
    if (stats.speed !== undefined) {
      stats.speed = Math.max(stats.speed, entity.speed);
    }

    return {
      entity,
      events,
      particles,
      terrainY: groundY,
      altitude,
      finished: Boolean(entity.settled),
      stats,
    };
  }

  applyBlastImpulse(entity, source, distance, impulse, radius) {
    const dx = entity.x - source.x;
    const dy = entity.y - source.y;
    const dist = distance ?? (Math.hypot(dx, dy) || 1);
    if (dist > (radius ?? this.config.bombBlastRadius)) {
      return 0;
    }

    const falloff = 1 - dist / (radius ?? this.config.bombBlastRadius);
    const strength = impulse * falloff;
    const [nx, ny] = normalize(dx, dy);
    entity.vx += nx * strength;
    entity.vy += ny * strength;
    return strength;
  }
}

export function createCollisionManager(options) {
  return new CollisionManager(options);
}

export default CollisionManager;
