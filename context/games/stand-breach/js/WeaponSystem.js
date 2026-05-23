(() => {
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const WEAPON_LIBRARY = [
  {
    id: "rifle",
    label: "Rifle",
    hint: "Reliable single shots.",
    baseDamage: 23,
    baseCooldown: 0.16,
    projectileSpeed: 1120,
    spread: 0.01,
    pellets: 1,
    knockback: 34,
    range: 980,
    magazine: 18,
    reserve: 72,
    reloadTime: 1.25,
    color: "#7fe0b0"
  },
  {
    id: "burst",
    label: "Burst",
    hint: "Three quick rounds.",
    baseDamage: 12,
    baseCooldown: 0.28,
    projectileSpeed: 1000,
    spread: 0.03,
    pellets: 3,
    knockback: 20,
    range: 820,
    magazine: 12,
    reserve: 60,
    reloadTime: 1.45,
    color: "#ffb86b"
  },
  {
    id: "scatter",
    label: "Scatter",
    hint: "Short range wall shredder.",
    baseDamage: 8,
    baseCooldown: 0.42,
    projectileSpeed: 900,
    spread: 0.14,
    pellets: 7,
    knockback: 16,
    range: 520,
    magazine: 7,
    reserve: 35,
    reloadTime: 1.85,
    color: "#ff6a5c"
  }
];

function resolveWeaponKey(slotOrName) {
  if (typeof slotOrName === "number" && Number.isFinite(slotOrName)) {
    return slotOrName;
  }
  const key = String(slotOrName ?? "").toLowerCase();
  if (/^\d+$/.test(key)) {
    return Number(key);
  }
  const index = WEAPON_LIBRARY.findIndex((weapon) => weapon.id === key || weapon.label.toLowerCase() === key);
  return index;
}

function upgradeAlias(key) {
  const map = {
    weaponDamage: "damage",
    weaponRate: "rate",
    damage: "damage",
    rate: "rate",
    reload: "reload",
    spread: "spread",
    magazine: "magazine",
    pellets: "pellets",
    ammo: "magazine"
  };
  return map[key] ?? key;
}

class WeaponSystem {
  constructor(options = {}) {
    this.weapons = WEAPON_LIBRARY.map((weapon, index) => ({
      ...weapon,
      upgrades: {
        damage: 0,
        rate: 0,
        reload: 0,
        spread: 0,
        magazine: 0,
        pellets: 0,
        ...(options.weaponUpgrades?.[weapon.id] ?? {})
      },
      clip: options.clip?.[weapon.id] ?? weapon.magazine,
      reserve: options.reserve?.[weapon.id] ?? weapon.reserve
    }));
    this.weaponIndex = 0;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.reloadWeaponIndex = null;
    this.sequence = 0;
  }

  _weaponAt(index = this.weaponIndex) {
    const bounded = ((index % this.weapons.length) + this.weapons.length) % this.weapons.length;
    return this.weapons[bounded];
  }

  _statsFor(weapon, externalUpgrades = {}, night = 0) {
    const internal = weapon.upgrades ?? {};
    const damageBoost = (internal.damage + (externalUpgrades.weaponDamage ?? 0)) * 0.12;
    const rateBoost = (internal.rate + (externalUpgrades.weaponRate ?? 0)) * 0.07;
    const reloadBoost = internal.reload * 0.08;
    const spreadBoost = (internal.spread ?? 0) * 0.04;
    const magazineBoost = (internal.magazine ?? 0) * 2;
    const pelletBoost = internal.pellets ?? 0;
    const nightFactor = 1 + night * 0.08;
    return {
      damage: Math.max(1, Math.round(weapon.baseDamage * (1 + damageBoost) * nightFactor)),
      cooldown: clamp(weapon.baseCooldown * (1 - rateBoost) * (1 + night * 0.05), 0.07, 1.2),
      spread: clamp(weapon.spread * (1 + spreadBoost) * (1 + night * 0.08), 0.005, 0.36),
      pellets: Math.max(1, weapon.pellets + Math.floor(pelletBoost / 2)),
      knockback: weapon.knockback * (1 + internal.damage * 0.04),
      range: weapon.range,
      magazine: Math.max(1, weapon.magazine + magazineBoost),
      reloadTime: clamp(weapon.reloadTime * (1 - reloadBoost), 0.45, 3),
      ammo: weapon.clip,
      reserve: weapon.reserve,
      color: weapon.color,
      projectileSpeed: weapon.projectileSpeed
    };
  }

  getCurrentWeapon() {
    const weapon = this._weaponAt();
    const stats = this._statsFor(weapon);
    return {
      id: weapon.id,
      label: weapon.label,
      hint: weapon.hint,
      color: weapon.color,
      ...stats,
      clip: weapon.clip,
      reserve: weapon.reserve,
      ready: this.cooldown <= 0 && this.reloadTimer <= 0 && weapon.clip > 0,
      cooldownRemaining: this.cooldown,
      reloadRemaining: this.reloadTimer
    };
  }

  get current() {
    return this.getCurrentWeapon();
  }

  switchWeapon(slotOrName) {
    const index = resolveWeaponKey(slotOrName);
    if (index >= 0) {
      this.weaponIndex = ((index % this.weapons.length) + this.weapons.length) % this.weapons.length;
    }
    return this.getCurrentWeapon();
  }

  nextWeapon() {
    return this.switchWeapon(this.weaponIndex + 1);
  }

  previousWeapon() {
    return this.switchWeapon(this.weaponIndex - 1);
  }

  selectWeapon(index) {
    return this.switchWeapon(index);
  }

  cycle(step = 1) {
    return this.switchWeapon(this.weaponIndex + step);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0 && this.reloadWeaponIndex !== null) {
        const weapon = this._weaponAt(this.reloadWeaponIndex);
        const stats = this._statsFor(weapon);
        const missing = Math.max(0, stats.magazine - weapon.clip);
        const loaded = Math.min(missing, weapon.reserve);
        weapon.clip += loaded;
        weapon.reserve -= loaded;
        this.reloadWeaponIndex = null;
      }
    }
  }

  reload() {
    const weapon = this._weaponAt();
    const stats = this._statsFor(weapon);
    if (this.reloadTimer > 0 || weapon.clip >= stats.magazine || weapon.reserve <= 0) {
      return false;
    }
    this.reloadWeaponIndex = this.weaponIndex;
    this.reloadTimer = stats.reloadTime;
    return true;
  }

  upgradeWeapon(name, upgradeKey) {
    const index = resolveWeaponKey(name);
    const weapon = index >= 0 ? this._weaponAt(index) : this._weaponAt();
    const key = upgradeAlias(upgradeKey);
    if (!weapon.upgrades[key]) {
      weapon.upgrades[key] = 0;
    }
    weapon.upgrades[key] += 1;
    return this.getCurrentWeapon();
  }

  _buildShotPayload(origin, target, externalUpgrades = {}, night = 0, timestamp = 0) {
    const weapon = this._weaponAt();
    const stats = this._statsFor(weapon, externalUpgrades, night);
    if (this.cooldown > 0 || this.reloadTimer > 0 || weapon.clip <= 0) {
      return {
        fired: false,
        weapon: this.getCurrentWeapon(),
        reason: weapon.clip <= 0 ? "empty" : this.reloadTimer > 0 ? "reloading" : "cooldown",
        cooldown: this.cooldown,
        reload: this.reloadTimer,
        ammo: this.getAmmoState()
      };
    }

    const start = origin ?? { x: 0, y: 0 };
    const end = target ?? { x: start.x + 1, y: start.y };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const spread = stats.spread;
    const pellets = stats.pellets;
    const shots = [];

    for (let index = 0; index < pellets; index += 1) {
      const offset = pellets === 1 ? 0 : (index - (pellets - 1) / 2) * spread;
      shots.push({
        id: `${weapon.id}-${timestamp}-${this.sequence += 1}`,
        weaponId: weapon.id,
        x: start.x,
        y: start.y,
        vx: Math.cos(angle + offset) * stats.projectileSpeed,
        vy: Math.sin(angle + offset) * stats.projectileSpeed,
        damage: stats.damage,
        range: stats.range,
        spread,
        pellets,
        knockback: stats.knockback,
        ammo: Math.max(0, weapon.clip - 1),
        cooldown: stats.cooldown,
        color: stats.color,
        life: Math.max(0.18, stats.range / Math.max(1, stats.projectileSpeed)),
        radius: weapon.id === "scatter" ? 5 : weapon.id === "burst" ? 4 : 3
      });
    }

    weapon.clip = Math.max(0, weapon.clip - 1);
    this.cooldown = stats.cooldown;
    if (weapon.clip <= 0 && weapon.reserve > 0) {
      this.reload();
    }

    return {
      fired: true,
      weapon: this.getCurrentWeapon(),
      shots,
      range: stats.range,
      damage: stats.damage,
      spread,
      pellets,
      knockback: stats.knockback,
      ammo: this.getAmmoState(),
      cooldown: stats.cooldown,
      reload: this.reloadTimer
    };
  }

  tryFire(origin, target, context = {}) {
    return this._buildShotPayload(origin, target, context.upgrades ?? context, context.night ?? 0, context.timestamp ?? 0);
  }

  getShotPlan(options = {}) {
    const payload = this._buildShotPayload(
      options.origin,
      options.target,
      options.upgrades ?? {},
      options.night ?? 0,
      options.timestamp ?? 0
    );
    return payload.fired ? payload.shots : null;
  }

  getAmmoState() {
    const weapon = this._weaponAt();
    const stats = this._statsFor(weapon);
    return {
      weaponId: weapon.id,
      label: weapon.label,
      clip: weapon.clip,
      reserve: weapon.reserve,
      magazine: stats.magazine,
      reloadRemaining: this.reloadTimer,
      cooldownRemaining: this.cooldown,
      ready: this.cooldown <= 0 && this.reloadTimer <= 0 && weapon.clip > 0
    };
  }

  getCardData(upgrades = {}, night = 0) {
    return this.weapons.map((weapon, index) => {
      const stats = this._statsFor(weapon, upgrades, night);
      return {
        id: weapon.id,
        label: weapon.label,
        hint: weapon.hint,
        active: index === this.weaponIndex,
        damage: stats.damage,
        cooldown: stats.cooldown,
        pellets: stats.pellets,
        ammo: weapon.clip,
        reserve: weapon.reserve,
        reloadTime: stats.reloadTime
      };
    });
  }

  drawReticle(ctx, player, pointer) {
    if (!ctx || !player || !pointer) {
      return;
    }
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const distance = Math.hypot(dx, dy);
    ctx.save();
    ctx.strokeStyle = "rgba(127, 224, 176, 0.8)";
    ctx.fillStyle = "rgba(127, 224, 176, 0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.globalAlpha = 0.26;
    ctx.stroke();
    ctx.restore();
    return distance;
  }
}

window.StandBreach = window.StandBreach || {};
window.StandBreach.WeaponSystem = WeaponSystem;
})();
