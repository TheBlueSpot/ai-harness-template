function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowSeconds(now) {
  return typeof now === "number" ? now : 0;
}

function distance(a, b) {
  return Math.abs((a?.progress ?? a?.x ?? 0) - (b?.progress ?? b?.x ?? 0));
}

function inLaneHitRange(source, target, radius) {
  return distance(source, target) <= radius;
}

export function createDefaultAbilities() {
  return [
    {
      id: "arrows",
      label: "Arrows",
      cost: 18,
      cooldown: 6,
      radius: 110,
      effect: "damage",
      damage: 20,
      target: "lane",
      description: "Rain arrows over the selected lane.",
      hitCastle: false,
    },
    {
      id: "heal",
      label: "Heal",
      cost: 24,
      cooldown: 8,
      radius: 120,
      effect: "heal",
      heal: 28,
      target: "lane",
      description: "Restore the selected lane and your wall.",
    },
    {
      id: "rally",
      label: "Rally",
      cost: 16,
      cooldown: 9,
      radius: 0,
      effect: "buff",
      duration: 6,
      multiplier: 1.25,
      target: "lane",
      description: "Speed up allied pressure in the selected lane.",
    },
    {
      id: "meteor",
      label: "Meteor",
      cost: 34,
      cooldown: 12,
      radius: 100,
      effect: "damage",
      damage: 34,
      target: "lane",
      description: "Drop a heavy strike on the selected lane.",
      hitCastle: true,
    },
  ];
}

export class AbilitySystem {
  constructor(abilities = createDefaultAbilities()) {
    this.abilities = new Map(abilities.map((ability) => [ability.id, { ...ability, readyAt: 0 }]));
  }

  getAbility(id) {
    return this.abilities.get(id) ?? null;
  }

  canCast(id, state, now) {
    const ability = this.getAbility(id);
    if (!ability) return false;
    const time = nowSeconds(now);
    if (time < (ability.readyAt ?? 0)) return false;
    if ((state?.mana ?? 0) < ability.cost) return false;
    return true;
  }

  updateCooldowns(now) {
    const time = nowSeconds(now);
    for (const ability of this.abilities.values()) {
      if (ability.readyAt > time) {
        continue;
      }
      ability.readyAt = Math.max(0, ability.readyAt);
    }
    return this.getStatus(now);
  }

  getStatus(now) {
    const time = nowSeconds(now);
    return [...this.abilities.values()].map((ability) => ({
      id: ability.id,
      label: ability.label,
      description: ability.description,
      ready: time >= ability.readyAt,
      readyAt: ability.readyAt,
      cooldownRemaining: Math.max(0, ability.readyAt - time),
      cost: ability.cost,
    }));
  }

  cast(id, laneOrPoint, state, now) {
    const ability = this.getAbility(id);
    const time = nowSeconds(now);
    if (!ability || !this.canCast(id, state, time)) {
      return { ok: false, reason: "unavailable" };
    }

    const laneIndex = typeof laneOrPoint === "number" ? laneOrPoint : laneOrPoint?.lane ?? 0;
    const laneState = state?.lanes?.[laneIndex];
    if (!laneState) {
      return { ok: false, reason: "invalid_lane" };
    }

    state.mana = clamp((state.mana ?? 0) - ability.cost, 0, state.maxMana ?? 100);
    ability.readyAt = time + ability.cooldown;

    const payload = {
      ok: true,
      id,
      lane: laneIndex,
      readyAt: ability.readyAt,
      effects: [],
    };

    if (ability.effect === "damage") {
      const hits = [];
      for (const unit of laneState.enemyUnits ?? []) {
        if (!unit || unit.alive === false || (unit.hp ?? 1) <= 0) continue;
        if (!inLaneHitRange(laneOrPoint ?? {}, unit, ability.radius)) continue;
        unit.hp = Math.max(0, (unit.hp ?? 0) - ability.damage);
        if (unit.hp <= 0) unit.alive = false;
        hits.push(unit.id);
      }
      if (ability.hitCastle && laneState.enemyCastle && inLaneHitRange(laneOrPoint ?? {}, laneState.enemyCastle, ability.radius)) {
        laneState.enemyCastle.hp = Math.max(0, (laneState.enemyCastle.hp ?? 0) - ability.damage);
        hits.push("enemyCastle");
      }
      payload.effects.push({ type: "damage", hits });
    }

    if (ability.effect === "heal") {
      const healed = [];
      for (const unit of laneState.playerUnits ?? []) {
        if (unit.alive === false || (unit.hp ?? 1) <= 0) continue;
        if (!inLaneHitRange(laneOrPoint ?? {}, unit, ability.radius)) continue;
        unit.hp = Math.min(unit.maxHp ?? unit.hp, (unit.hp ?? 0) + ability.heal);
        healed.push(unit.id);
      }
      if (laneState.playerCastle && inLaneHitRange(laneOrPoint ?? {}, laneState.playerCastle, ability.radius)) {
        laneState.playerCastle.hp = Math.min(laneState.playerCastle.maxHp ?? laneState.playerCastle.hp, (laneState.playerCastle.hp ?? 0) + ability.heal);
        healed.push("playerCastle");
      }
      payload.effects.push({ type: "heal", healed });
    }

    if (ability.effect === "buff") {
      payload.effects.push({
        type: "buff",
        buff: ability.id,
        duration: ability.duration ?? 0,
        multiplier: ability.multiplier ?? 1,
      });
    }

    return payload;
  }
}
