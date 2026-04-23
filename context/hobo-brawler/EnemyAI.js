function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededNoise(id, timeMs) {
  const seed = `${id}:${Math.floor(timeMs / 125)}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

export class RandomCooldown {
  constructor({ minMs = 520, maxMs = 1280 } = {}) {
    this.minMs = minMs;
    this.maxMs = maxMs;
    this.readyAt = 0;
  }

  ready(timeMs) {
    return timeMs >= this.readyAt;
  }

  trigger(timeMs, bias = 0.5) {
    const ratio = clamp(bias, 0, 1);
    this.readyAt = timeMs + this.minMs + (this.maxMs - this.minMs) * ratio;
  }
}

export class EnemyAIController {
  constructor(config = {}) {
    this.config = {
      planeTolerance: config.planeTolerance ?? 0.22,
      closeDistance: config.closeDistance ?? 1.35,
      attackDistance: config.attackDistance ?? 0.68,
      advanceBias: config.advanceBias ?? 0.18
    };
    this.cooldowns = new Map();
    this.intents = [];
  }

  reset() {
    this.cooldowns.clear();
    this.intents = [];
  }

  getCooldown(enemyId) {
    if (!this.cooldowns.has(enemyId)) {
      this.cooldowns.set(enemyId, new RandomCooldown());
    }
    return this.cooldowns.get(enemyId);
  }

  update(worldState, timeMs = 0) {
    const player = worldState?.player;
    const enemies = worldState?.enemies ?? [];
    this.intents = [];

    for (const enemy of enemies) {
      if (!enemy || enemy.health <= 0) continue;
      if (enemy.grabbed || enemy.state === "grabbed" || enemy.state === "launched" || enemy.stun > 0) continue;

      const dx = (player?.x ?? 0) - enemy.x;
      const dz = (player?.z ?? 0) - enemy.z;
      const laneAligned = Math.abs(dz) <= this.config.planeTolerance;
      const distance = Math.hypot(dx, dz);
      const cooldown = this.getCooldown(enemy.id);
      const noise = seededNoise(enemy.id, timeMs);

      const intent = {
        enemyId: enemy.id,
        moveX: 0,
        moveZ: 0,
        attack: false,
        reason: "stalk",
        targetId: player?.id ?? "player"
      };

      if (!laneAligned) {
        intent.moveZ = clamp(Math.sign(dz), -1, 1);
        intent.moveX = clamp(Math.sign(dx) * this.config.advanceBias, -1, 1);
        intent.reason = "align-plane";
        this.intents.push(intent);
        continue;
      }

      intent.moveZ = 0;
      if (distance > this.config.attackDistance) {
        intent.moveX = clamp(Math.sign(dx), -1, 1);
        intent.reason = distance > this.config.closeDistance ? "close-gap" : "press";
      } else if (cooldown.ready(timeMs) && noise > 0.12) {
        intent.attack = true;
        intent.reason = "punch";
        cooldown.trigger(timeMs, noise);
      } else {
        intent.moveX = clamp(Math.sign(dx) * 0.25, -1, 1);
        intent.reason = "feint";
      }

      this.intents.push(intent);
    }

    return this.getIntents();
  }

  getIntents() {
    return this.intents.map((intent) => ({ ...intent }));
  }
}

export default EnemyAIController;
