(() => {
  // mega-robot/src/entities/boss.js
  function createBossEncounter() {
    return {
      active: false,
      completed: false,
      phase: 0,
      hp: 18,
      maxHp: 18,
      x: 860,
      y: 210,
      vx: 0,
      weakpoint: { exposed: false, side: -1 },
      attackIntent: null,
      phaseTimer: 0,
      fireTimer: 1.2,
      completionEvent: null
    };
  }
  function updateBossEncounter(boss, dt, playerState) {
    const shots = [];
    const events = [];
    if (!boss.active || boss.completed) {
      boss.weakpoint.exposed = false;
      boss.attackIntent = null;
      return { shots, events };
    }
    boss.phaseTimer += dt;
    boss.fireTimer = Math.max(0, boss.fireTimer - dt);
    if (boss.phase === 0 && boss.hp <= boss.maxHp * 0.72) {
      boss.phase = 1;
      boss.phaseTimer = 0;
      events.push({ type: "boss-phase", phase: 1 });
    }
    if (boss.phase === 1 && boss.hp <= boss.maxHp * 0.4) {
      boss.phase = 2;
      boss.phaseTimer = 0;
      events.push({ type: "boss-phase", phase: 2 });
    }
    boss.weakpoint.side = playerState.x < boss.x ? -1 : 1;
    boss.weakpoint.exposed = boss.phaseTimer > 0.35;
    boss.attackIntent = boss.weakpoint.exposed ? { type: "telegraph", phase: boss.phase } : { type: "shielded", phase: boss.phase };
    if (boss.fireTimer === 0) {
      const speed = boss.phase === 2 ? 330 : boss.phase === 1 ? 280 : 230;
      shots.push({
        from: "boss",
        kind: boss.phase === 2 ? "spread-shot" : "boss-shot",
        x: boss.x,
        y: boss.y,
        vx: boss.weakpoint.side * speed,
        vy: boss.phase === 2 ? 40 : 0,
        damage: boss.phase === 2 ? 2 : 1,
        blockedByShield: false
      });
      boss.fireTimer = boss.phase === 2 ? 0.75 : boss.phase === 1 ? 1 : 1.3;
      boss.attackIntent = { type: "burst", phase: boss.phase };
    }
    if (boss.hp <= 0) {
      boss.completed = true;
      boss.completionEvent = { type: "boss-defeated" };
      events.push(boss.completionEvent);
    }
    return { shots, events };
  }

  // mega-robot/src/entities/enemies.js
  var DEFAULT_BOUNDS = { left: 220, right: 760 };
  var nextEnemyId = 1;
  function spawnSniperJoe(x, y, options = {}) {
    return {
      id: options.id ?? `sniper-${nextEnemyId++}`,
      type: "sniper-joe",
      x,
      y,
      vx: options.vx ?? 0,
      hp: options.hp ?? 3,
      shieldFacing: options.shieldFacing ?? -1,
      exposeTimer: options.exposeTimer ?? 0,
      exposeWindow: options.exposeWindow ?? 0,
      fireCooldown: options.fireCooldown ?? 1.2,
      attackIntent: null,
      weakpoint: { facing: options.shieldFacing ?? -1, exposed: false },
      bounds: { ...DEFAULT_BOUNDS, ...options.bounds ?? {} }
    };
  }
  function createEnemyWave(index = 0) {
    return [
      spawnSniperJoe(340 + index * 24, 420, { shieldFacing: -1, exposeTimer: 0.8 }),
      spawnSniperJoe(640 - index * 20, 340, { shieldFacing: 1, exposeTimer: 1.2 })
    ];
  }
  function updateEnemies(enemies, dt, playerState, context = {}) {
    const shots = [];
    for (const enemy of enemies) {
      if (enemy.type !== "sniper-joe")
        continue;
      const playerSide = Math.sign(playerState.x - enemy.x) || enemy.shieldFacing;
      enemy.shieldFacing = playerSide < 0 ? -1 : 1;
      enemy.weakpoint.facing = enemy.shieldFacing;
      if (enemy.exposeTimer > 0) {
        enemy.exposeTimer = Math.max(0, enemy.exposeTimer - dt);
        enemy.attackIntent = { type: "shield-up", from: enemy.id, facing: enemy.shieldFacing };
        enemy.weakpoint.exposed = false;
        continue;
      }
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
      if (enemy.exposeWindow > 0) {
        enemy.exposeWindow = Math.max(0, enemy.exposeWindow - dt);
        enemy.weakpoint.exposed = true;
        enemy.attackIntent = { type: "exposed", from: enemy.id, facing: enemy.shieldFacing };
        if (enemy.fireCooldown === 0) {
          shots.push({
            from: enemy.id,
            kind: "sniper-shot",
            x: enemy.x,
            y: enemy.y - 10,
            vx: enemy.shieldFacing * 390,
            vy: 0,
            damage: 1,
            blockedByShield: true
          });
          enemy.fireCooldown = 1.15;
        }
        if (enemy.exposeWindow === 0) {
          enemy.exposeTimer = context.recoverDelay ?? 1.3;
        }
        continue;
      }
      enemy.weakpoint.exposed = Math.abs(playerState.x - enemy.x) < 100 && Math.abs(playerState.y - enemy.y) < 72;
      enemy.attackIntent = { type: "charge", from: enemy.id, facing: enemy.shieldFacing };
      if (enemy.fireCooldown === 0) {
        enemy.exposeWindow = 0.55;
        enemy.attackIntent = { type: "open-shield", from: enemy.id, facing: enemy.shieldFacing };
        enemy.fireCooldown = 1.75;
      }
    }
    return { enemies, shots };
  }

  // mega-robot/src/systems/ai.js
  function buildAttackIntents(enemies, boss) {
    const intents = enemies.map((enemy) => enemy.attackIntent).filter(Boolean);
    if (boss?.attackIntent)
      intents.push({ ...boss.attackIntent, source: "boss" });
    return intents;
  }

  // mega-robot/src/systems/weapons.js
  var DEFAULT_WEAPONS = ["buster"];
  function createWeaponState() {
    return {
      equipped: "buster",
      unlocked: new Set(DEFAULT_WEAPONS),
      inventory: new Map(DEFAULT_WEAPONS.map((weaponId) => [weaponId, { ammo: Infinity, unlocked: true }])),
      rewardQueue: [],
      pendingReward: null,
      lastFiredAt: 0,
      fireCooldown: 0
    };
  }
  function grantBossWeapon(state, weaponId) {
    if (!weaponId)
      return false;
    if (!state.weapon)
      state.weapon = createWeaponState();
    const weaponState = state.weapon;
    weaponState.unlocked.add(weaponId);
    weaponState.inventory.set(weaponId, { ammo: Infinity, unlocked: true });
    weaponState.rewardQueue.push(weaponId);
    weaponState.pendingReward = weaponId;
    weaponState.equipped = weaponId;
    return true;
  }
  function equipWeapon(state, weaponId) {
    if (!state.weapon?.unlocked?.has(weaponId))
      return false;
    state.weapon.equipped = weaponId;
    return true;
  }

  // mega-robot/src/systems/stage.js
  var PLAYER_HALF_WIDTH = 12;
  var PLAYER_HALF_HEIGHT = 18;
  var WALL_GRIP_BUFFER = 14;
  function createStageState(view) {
    return {
      mode: "menu",
      view: { ...view },
      camera: { x: 0, y: 0 },
      groundY: 470,
      score: 0,
      events: [],
      rewardQueued: false,
      rewardGranted: false,
      player: { x: 110, y: 420, vx: 0, vy: 0, facing: 1, onGround: true, onWall: false, wallSide: 0, wallKick: 0, wallGrace: 0, jumpHold: 0, hp: 5 },
      core: { x: 900, y: 200, hp: 4, shielded: true },
      enemies: createEnemyWave(0),
      shots: [],
      attackIntents: [],
      boss: createBossEncounter(),
      combat: {
        projectiles: [],
        effects: [],
        weapon: createWeaponState(),
        damageTotals: { player: 0, enemy: 0, boss: 0 },
        feedback: { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false },
        hitEvents: [],
        unlocks: []
      },
      walls: [
        { x: 180, y: 360, w: 30, h: 110 },
        { x: 430, y: 240, w: 30, h: 230 },
        { x: 700, y: 180, w: 30, h: 290 }
      ]
    };
  }
  var createStage = createStageState;
  function updateStage(stage, dt, playerState) {
    const p = stage.player;
    stage.events.length = 0;
    const previousX = p.x;
    const previousY = p.y;
    const previousLeft = previousX - PLAYER_HALF_WIDTH;
    const previousRight = previousX + PLAYER_HALF_WIDTH;
    const previousTop = previousY - PLAYER_HALF_HEIGHT;
    const previousBottom = previousY + PLAYER_HALF_HEIGHT;
    p.wallKick = Math.max(0, p.wallKick - dt);
    p.wallGrace = Math.max(0, p.wallGrace - dt);
    const accel = p.onGround ? 1040 : 660;
    const maxSpeed = 280;
    if (playerState.left)
      p.vx -= accel * dt;
    if (playerState.right)
      p.vx += accel * dt;
    p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
    p.facing = p.vx < 0 ? -1 : p.vx > 0 ? 1 : p.facing;
    const jumpPressed = playerState.jump && p.jumpHold <= 0;
    if (jumpPressed && p.onGround) {
      p.vy = -430;
      p.onGround = false;
      p.jumpHold = 0.18;
    } else if (playerState.jump && !p.onGround && (p.onWall || p.wallGrace > 0) && p.wallKick <= 0 && (p.jumpHold <= 0 || p.onWall)) {
      p.vy = -410;
      p.vx = 235 * -p.wallSide;
      p.wallKick = 0.28;
      p.wallGrace = 0;
      p.onWall = false;
      p.jumpHold = 0.18;
    }
    if (playerState.jump && p.jumpHold > 0) {
      p.jumpHold -= dt;
      if (p.vy < 0)
        p.vy -= 620 * dt;
    } else {
      p.jumpHold = 0;
    }
    p.vy += 980 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= p.onGround ? 0.82 : 0.96;
    p.x = Math.max(18, Math.min(stage.view.width - 18, p.x));
    p.onGround = false;
    p.onWall = false;
    for (const wall of stage.walls) {
      const playerLeft = p.x - PLAYER_HALF_WIDTH;
      const playerRight = p.x + PLAYER_HALF_WIDTH;
      const playerTop = p.y - PLAYER_HALF_HEIGHT;
      const playerBottom = p.y + PLAYER_HALF_HEIGHT;
      const wallCatchActive = p.wallKick <= 0;
      const overlapsWall = playerRight > wall.x && playerLeft < wall.x + wall.w && playerBottom > wall.y && playerTop < wall.y + wall.h;
      const canCatchLeft = wallCatchActive && previousRight <= wall.x + WALL_GRIP_BUFFER && playerRight >= wall.x - WALL_GRIP_BUFFER && playerBottom > wall.y + 2 && playerTop < wall.y + wall.h - 6;
      const canCatchRight = wallCatchActive && previousLeft >= wall.x + wall.w - WALL_GRIP_BUFFER && playerLeft <= wall.x + wall.w + WALL_GRIP_BUFFER && playerBottom > wall.y + 2 && playerTop < wall.y + wall.h - 6;
      const canLatch = overlapsWall || canCatchLeft || canCatchRight;
      if (!canLatch)
        continue;
    const landedFromAbove = previousBottom <= wall.y + 4 && previousTop < wall.y && previousLeft < wall.x + wall.w - 6 && previousRight > wall.x + 6;
    const canLandOnTop = landedFromAbove && p.vy >= 0 && playerBottom >= wall.y && !canCatchLeft && !canCatchRight;
      if (canLandOnTop && p.vy >= 0) {
        p.y = wall.y - PLAYER_HALF_HEIGHT;
        p.vy = 0;
        p.onGround = true;
        continue;
      }
      const canHitUnderside = previousTop >= wall.y + wall.h && playerTop <= wall.y + wall.h;
      if (canHitUnderside && p.vy <= 0) {
        p.y = wall.y + wall.h + PLAYER_HALF_HEIGHT;
        p.vy = Math.max(0, p.vy);
        continue;
      }
      const overlapX = Math.min(playerRight, wall.x + wall.w) - Math.max(playerLeft, wall.x);
      const overlapY = Math.min(playerBottom, wall.y + wall.h) - Math.max(playerTop, wall.y);
      const cameFromLeft = canCatchLeft || previousRight <= wall.x;
      const cameFromRight = canCatchRight || previousLeft >= wall.x + wall.w;
      const edgeGrazedTop = p.x <= wall.x + 2 || p.x >= wall.x + wall.w - 2;
      if (cameFromLeft) {
        p.x = wall.x - PLAYER_HALF_WIDTH;
        p.onWall = true;
        p.wallSide = -1;
        p.wallGrace = 0.28;
        p.vx = Math.min(0, p.vx);
      } else if (cameFromRight) {
        p.x = wall.x + wall.w + PLAYER_HALF_WIDTH;
        p.onWall = true;
        p.wallSide = 1;
        p.wallGrace = 0.28;
        p.vx = Math.max(0, p.vx);
      } else if (overlapX > 0 && overlapY > 0 && (overlapX < overlapY || edgeGrazedTop)) {
        const leftDistance = Math.abs(previousRight - wall.x);
        const rightDistance = Math.abs(previousLeft - (wall.x + wall.w));
        const resolveLeft = leftDistance <= rightDistance;
        p.x = resolveLeft ? wall.x - PLAYER_HALF_WIDTH : wall.x + wall.w + PLAYER_HALF_WIDTH;
        p.onWall = true;
        p.wallSide = resolveLeft ? -1 : 1;
        p.wallGrace = 0.28;
        p.vx = resolveLeft ? Math.min(0, p.vx) : Math.max(0, p.vx);
    } else {
      const fromLeft = previousRight <= wall.x;
      const fromRight = previousLeft >= wall.x + wall.w;
      if (fromLeft || fromRight || canCatchLeft || canCatchRight) {
        const resolveLeft = fromLeft ? true : fromRight ? false : previousX < wall.x + wall.w / 2;
        p.x = resolveLeft ? wall.x - PLAYER_HALF_WIDTH : wall.x + wall.w + PLAYER_HALF_WIDTH;
          p.onWall = true;
          p.wallSide = resolveLeft ? -1 : 1;
          p.wallGrace = 0.28;
          p.vx = resolveLeft ? Math.min(0, p.vx) : Math.max(0, p.vx);
      } else {
        const resolveTop = previousBottom <= wall.y || previousY <= wall.y;
        p.y = resolveTop ? wall.y - PLAYER_HALF_HEIGHT : wall.y + wall.h + PLAYER_HALF_HEIGHT;
      }
      p.vy = 0;
    }
      if (p.onWall && p.vy > 160)
        p.vy = 160;
    }
    if (p.y >= stage.groundY - 18) {
      p.y = stage.groundY - 18;
      p.vy = 0;
      p.onGround = true;
    }
    p.y = Math.max(24, p.y);
    const inputLead = playerState.left ? -18 : playerState.right ? 18 : 0;
    const cameraLeadX = p.facing * 48 + p.vx * 0.12 + inputLead;
    const airborneLookAheadY = p.vy < -40 ? -34 : p.vy > 120 ? 18 : -10;
    const cameraTargetX = Math.max(-108, Math.min(108, (p.x - stage.view.width * 0.5) * 0.5 + cameraLeadX));
    const cameraTargetY = Math.max(-124, Math.min(28, (p.y - stage.view.height * 0.5) * 0.58 + Math.min(52, p.vy * 0.1) + airborneLookAheadY));
    const cameraCatchup = p.onGround ? 5.4 : 7.2;
    stage.camera.x += (cameraTargetX - stage.camera.x) * Math.min(1, dt * cameraCatchup);
    stage.camera.y += (cameraTargetY - stage.camera.y) * Math.min(1, dt * cameraCatchup);
    const enemyResult = updateEnemies(stage.enemies, dt, p);
    stage.shots.push(...enemyResult.shots);
    stage.attackIntents = buildAttackIntents(stage.enemies, stage.boss);
    if (!stage.boss.active && stage.enemies.length === 0 && stage.mode === "play") {
      stage.boss.active = true;
      stage.events.push({ type: "boss-encounter", source: "stage" });
    }
    const bossResult = updateBossEncounter(stage.boss, dt, p);
    stage.shots.push(...bossResult.shots);
    stage.events.push(...bossResult.events);
    if (stage.boss.completed && !stage.rewardQueued) {
      stage.rewardQueued = true;
      stage.core.shielded = false;
      stage.events.push({ type: "reward-ready", source: "boss" });
      stage.combat.feedback.bossReward = "boss-defeated";
    }
    if (p.y < 120)
      stage.score += Math.round((120 - p.y) * 0.05);
    if (p.hp <= 0)
      stage.mode = "lose";
  }

  // mega-robot/src/entities/effects.js
  var nextEffectId = 1;
  function spawnHitEffect(x, y, kind = "hit") {
    return {
      id: `${kind}-${nextEffectId++}`,
      kind,
      x,
      y,
      age: 0,
      ttl: 0.35
    };
  }
  function updateEffects(effects, dt) {
    const alive = [];
    for (const effect of effects) {
      effect.age += dt;
      if (effect.age < effect.ttl)
        alive.push(effect);
    }
    return alive;
  }

  // mega-robot/src/entities/projectiles.js
  var nextProjectileId = 1;
  function makeProjectile(base) {
    return {
      id: `${base.type}-${nextProjectileId++}`,
      active: true,
      ttl: 3,
      owner: "player",
      type: "shot",
      damage: 1,
      ...base
    };
  }
  function spawnPlayerShot(origin, facing = 1, weaponId = "buster") {
    const speed = weaponId === "sniper" ? 540 : 420;
    const damage = weaponId === "sniper" ? 2 : 1;
    const shot = makeProjectile({
      owner: "player",
      type: weaponId,
      x: origin.x + facing * 18,
      y: origin.y - 6,
      vx: facing * speed,
      vy: 0,
      damage
    });
    return shot;
  }
  function spawnEnemyShot(origin, aim = 1, mode = "patrol") {
    const speed = mode === "sniper" ? 300 : 240;
    return makeProjectile({
      owner: "enemy",
      type: mode,
      x: origin.x,
      y: origin.y,
      vx: aim * speed,
      vy: 0,
      damage: 1
    });
  }
  function updateProjectiles(projectiles, dt, bounds) {
    const alive = [];
    for (const projectile of projectiles) {
      projectile.ttl -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      const inBounds = projectile.x > -40 && projectile.x < bounds.width + 40 && projectile.y > -40 && projectile.y < bounds.height + 40;
      if (projectile.ttl > 0 && inBounds) {
        alive.push(projectile);
      }
    }
    return alive;
  }

  // mega-robot/src/systems/combat.js
  var PLAYER_HITBOX = { w: 22, h: 34 };
  var ENEMY_HITBOX = { w: 24, h: 24 };
  var BOSS_HITBOX = { w: 56, h: 56 };
  function ensureCombatState(stage) {
    stage.combat ??= {};
    stage.combat.weapon ??= createWeaponState();
    stage.combat.projectiles ??= [];
    stage.combat.effects ??= [];
    stage.combat.damageTotals ??= { player: 0, enemy: 0, boss: 0 };
    stage.combat.feedback ??= { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false };
    stage.combat.hitEvents ??= [];
    stage.combat.unlocks ??= [];
    stage.player.invuln ??= 0;
    stage.player.fireLatch ??= false;
    return stage.combat;
  }
  function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
  }
  function resetFrameSignals(combat) {
    combat.feedback = { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false };
    combat.hitEvents.length = 0;
    combat.unlocks.length = 0;
  }
  function handleWeaponInput(stage, input, combat) {
    const weapon = combat.weapon;
    weapon.fireCooldown = Math.max(0, weapon.fireCooldown - stage.dt);
    weapon.lastFiredAt += stage.dt;
    if (input.digit1)
      equipWeapon(stage.combat, "buster");
    if (input.digit2)
      equipWeapon(stage.combat, "sniper");
    const wantsFire = Boolean(input.fire);
    if (wantsFire && !stage.player.fireLatch && weapon.fireCooldown === 0) {
      combat.projectiles.push(spawnPlayerShot(stage.player, stage.player.facing, weapon.equipped));
      combat.feedback.playerFired = true;
      weapon.lastFiredAt = 0;
      weapon.fireCooldown = weapon.equipped === "sniper" ? 0.38 : 0.17;
    }
    stage.player.fireLatch = wantsFire;
  }
  function integrateEnemyShots(stage) {
    for (const shot of stage.shots) {
      stage.combat.projectiles.push(spawnEnemyShot({ x: shot.x, y: shot.y }, Math.sign(shot.vx) || 1, shot.kind === "sniper-shot" ? "sniper" : "patrol"));
    }
    stage.shots.length = 0;
  }
  function applyPlayerDamage(stage, amount, sourceX, sourceY) {
    if (stage.player.invuln > 0 || amount <= 0)
      return;
    stage.player.hp = Math.max(0, stage.player.hp - amount);
    stage.player.invuln = 0.9;
    stage.combat.damageTotals.player += amount;
    stage.combat.feedback.playerHit = true;
    stage.combat.effects.push(spawnHitEffect(sourceX, sourceY, "player-hit"));
  }
  function hitSniperJoeShield(player, enemy) {
    const attackDir = Math.sign(enemy.x - player.x) || player.facing;
    return !enemy.weakpoint.exposed && attackDir === enemy.shieldFacing;
  }
  function resolvePlayerShots(stage, alive) {
    for (const projectile of stage.combat.projectiles) {
      if (projectile.owner !== "player") {
        alive.push(projectile);
        continue;
      }
      let consumed = false;
      for (const enemy of stage.enemies) {
        if (!overlaps(projectile.x, projectile.y, 10, 8, enemy.x, enemy.y - 4, ENEMY_HITBOX.w, ENEMY_HITBOX.h))
          continue;
        if (enemy.type === "sniper-joe" && hitSniperJoeShield(stage.player, enemy)) {
          stage.combat.feedback.shieldBlocked = true;
          stage.combat.hitEvents.push({ type: "shield-block", target: enemy.id });
          stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "shield"));
        } else {
          enemy.hp = Math.max(0, enemy.hp - projectile.damage);
          stage.combat.damageTotals.enemy += projectile.damage;
          stage.combat.hitEvents.push({ type: "enemy-hit", target: enemy.id, damage: projectile.damage });
          stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "enemy-hit"));
          if (enemy.hp === 0) {
            stage.score += 150;
          }
        }
        consumed = true;
        break;
      }
      if (!consumed && stage.boss.active && !stage.boss.completed) {
        if (overlaps(projectile.x, projectile.y, 12, 10, stage.boss.x, stage.boss.y, BOSS_HITBOX.w, BOSS_HITBOX.h)) {
          if (stage.boss.weakpoint.exposed) {
            stage.boss.hp = Math.max(0, stage.boss.hp - projectile.damage);
            stage.combat.damageTotals.boss += projectile.damage;
            stage.combat.hitEvents.push({ type: "boss-hit", damage: projectile.damage });
            stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "boss-hit"));
            if (stage.boss.hp === 0) {
              stage.score += 900;
            }
          } else {
            stage.combat.hitEvents.push({ type: "boss-block" });
            stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "shield"));
          }
          consumed = true;
        }
      }
      if (!consumed && overlaps(projectile.x, projectile.y, 12, 10, stage.core.x, stage.core.y, 44, 44)) {
        if (stage.core.shielded) {
          stage.combat.hitEvents.push({ type: "core-block" });
          stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "shield"));
        } else {
          stage.core.hp = Math.max(0, stage.core.hp - projectile.damage);
          stage.combat.hitEvents.push({ type: "core-hit", damage: projectile.damage });
          stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "core-hit"));
          if (stage.core.hp === 0)
            stage.score += 600;
        }
        consumed = true;
      }
      if (!consumed)
        alive.push(projectile);
    }
  }
  function resolveEnemyShots(stage, alive) {
    for (const projectile of alive) {
      if (projectile.owner !== "enemy")
        continue;
      if (overlaps(projectile.x, projectile.y, 10, 10, stage.player.x, stage.player.y - 2, PLAYER_HITBOX.w, PLAYER_HITBOX.h)) {
        applyPlayerDamage(stage, projectile.damage, projectile.x, projectile.y);
        projectile.active = false;
      }
    }
    return alive.filter((projectile) => projectile.active !== false);
  }
  function resolveBodyCollisions(stage) {
    for (const enemy of stage.enemies) {
      if (overlaps(stage.player.x, stage.player.y, PLAYER_HITBOX.w, PLAYER_HITBOX.h, enemy.x, enemy.y - 4, ENEMY_HITBOX.w, ENEMY_HITBOX.h)) {
        applyPlayerDamage(stage, 1, enemy.x, enemy.y);
      }
    }
    if (stage.boss.active && !stage.boss.completed) {
      if (overlaps(stage.player.x, stage.player.y, PLAYER_HITBOX.w, PLAYER_HITBOX.h, stage.boss.x, stage.boss.y, BOSS_HITBOX.w, BOSS_HITBOX.h)) {
        applyPlayerDamage(stage, 1, stage.boss.x, stage.boss.y);
      }
    }
  }
  function handleBossReward(stage, combat) {
    const ready = stage.events.find((event) => event.type === "reward-ready");
    if (!ready || stage.rewardGranted)
      return;
    if (grantBossWeapon(combat, "sniper")) {
      stage.rewardGranted = true;
      combat.feedback.bossReward = "sniper";
      combat.unlocks.push("sniper");
      stage.score += 400;
    }
  }
  function updateCombat(stage, dt, input = {}) {
    stage.dt = dt;
    const combat = ensureCombatState(stage);
    resetFrameSignals(combat);
    stage.player.invuln = Math.max(0, stage.player.invuln - dt);
    handleWeaponInput(stage, input, combat);
    integrateEnemyShots(stage);
    combat.projectiles = updateProjectiles(combat.projectiles, dt, stage.view);
    resolveBodyCollisions(stage);
    const survivors = [];
    resolvePlayerShots(stage, survivors);
    combat.projectiles = resolveEnemyShots(stage, survivors);
    combat.effects = updateEffects(combat.effects, dt);
    stage.enemies = stage.enemies.filter((enemy) => enemy.hp > 0);
    handleBossReward(stage, combat);
  }
  function resolveCombat(stage) {
    const combat = ensureCombatState(stage);
    if (stage.core.hp <= 0) {
      stage.mode = "win";
    }
    if (stage.player.hp <= 0) {
      stage.mode = "lose";
    }
    stage.combat = combat;
  }

  // mega-robot/src/render.js
  function renderFrame(ctx, frame) {
    const { width, height } = frame.view;
    ctx.save();
    const camera = frame.camera || { x: 0, y: 0 };
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0f1118";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(-camera.x, -camera.y);
    const groundY = frame.groundY;
    ctx.fillStyle = "#1f2734";
    ctx.fillRect(-400, groundY, width + 800, height - groundY + 320);
    ctx.fillStyle = "#2d3950";
    for (const wall of frame.walls) {
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    }
    ctx.fillStyle = "#7bd6ff";
    for (const shot of frame.projectiles) {
      ctx.fillStyle = shot.owner === "player" ? "#ffd166" : "#ff6b6b";
      ctx.fillRect(shot.x - 3, shot.y - 2, 6, 4);
    }
    for (const effect of frame.effects) {
      ctx.fillStyle = effect.kind === "block" ? "#8be9fd" : effect.kind === "shield" ? "#c084fc" : "#ffffff";
      const size = 12 + effect.age * 18;
      ctx.fillRect(effect.x - size / 2, effect.y - size / 2, size, size);
    }
    ctx.fillStyle = "#7bd6ff";
    for (const enemy of frame.enemies) {
      ctx.fillStyle = enemy.weakpoint?.exposed ? "#9ff7ff" : "#7bd6ff";
      ctx.fillRect(enemy.x - 12, enemy.y - 12, 24, 24);
      ctx.fillStyle = "#94a3b8";
      const shieldX = enemy.shieldFacing < 0 ? enemy.x - 20 : enemy.x + 8;
      ctx.fillRect(shieldX, enemy.y - 16, 12, 32);
    }
    if (frame.boss?.active || frame.boss?.completed) {
      ctx.fillStyle = frame.boss.completed ? "#5a6" : "#b38cff";
      ctx.fillRect(frame.boss.x - 28, frame.boss.y - 28, 56, 56);
      if (frame.boss.weakpoint?.exposed) {
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(frame.boss.x - 18, frame.boss.y - 18, 36, 36);
      }
    }
    ctx.fillStyle = "#ffcf5c";
    ctx.fillRect(frame.core.x - 22, frame.core.y - 22, 44, 44);
    if (frame.core.shielded) {
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 3;
      ctx.strokeRect(frame.core.x - 30, frame.core.y - 30, 60, 60);
    }
    ctx.fillStyle = frame.player.invuln > 0 ? "#f9a8d4" : "#ff6b6b";
    ctx.fillRect(frame.player.x - 12, frame.player.y - 18, 24, 36);
    if (frame.player.onWall) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(frame.player.x - 14, frame.player.y - 22, 28, 4);
    }
    ctx.fillStyle = "#f0f4ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(`Score ${frame.score}`, 18, 28);
    ctx.fillText(`Weapon ${frame.weapon.equipped}`, 18, 48);
    ctx.fillText(`HP ${frame.player.hp}`, 18, 68);
    if (frame.message) {
      ctx.fillStyle = "rgba(8, 10, 16, 0.72)";
      ctx.fillRect(width * 0.24, height * 0.2, width * 0.52, 110);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.fillText(frame.message.title, width * 0.31, height * 0.25);
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(frame.message.body, width * 0.31, height * 0.32);
    }
    ctx.restore();
  }

  // mega-robot/src/Game.js
  var VIEW = { width: 960, height: 540 };

  class Game {
    constructor(canvas = null, ui = {}) {
      this.canvas = canvas;
      this.ctx = canvas?.getContext?.("2d") ?? null;
      this.ui = ui;
      this.stage = createStage(VIEW);
      this.frame = this.buildFrameState();
    }
    start() {
      this.stage.mode = "play";
      this.frame = this.buildFrameState();
    }
    restart() {
      this.stage = createStage(this.stage.view);
      this.stage.mode = "play";
      this.frame = this.buildFrameState();
    }
    resize(width, height) {
      this.stage.view = { width, height };
      this.frame = this.buildFrameState();
    }
    update(dt, input = {}) {
      const seconds = Math.max(0, Math.min(0.05, Number(dt) || 0));
      if (this.stage.mode === "menu") {
        if (input.jump || input.start) {
          this.start();
        }
        return;
      }
      if (this.stage.mode === "win" || this.stage.mode === "lose") {
        if (input.restart || input.start) {
          this.restart();
        }
        return;
      }
      updateStage(this.stage, seconds, input);
      updateCombat(this.stage, seconds, input);
      resolveCombat(this.stage);
      this.frame = this.buildFrameState();
    }
    render(ctx = this.ctx) {
      if (!ctx)
        return;
      renderFrame(ctx, this.frame);
    }
    syncUI() {
      const frame = this.frame;
      if (this.ui.hudRoot) {
        const unlocked = frame.weapon.unlocked.join(", ");
        this.ui.hudRoot.innerHTML = `
        <div class="hud-card">
          <div class="hud-row"><span>Mode</span><strong>${frame.mode}</strong></div>
          <div class="hud-row"><span>HP</span><strong>${frame.player.hp}</strong></div>
          <div class="hud-row"><span>Boss</span><strong>${frame.boss.active ? `${frame.boss.hp}/${frame.boss.maxHp}` : "offline"}</strong></div>
          <div class="hud-row"><span>Core</span><strong>${frame.core.hp}</strong></div>
          <div class="hud-row"><span>Score</span><strong>${frame.score}</strong></div>
          <div class="hud-row"><span>Weapon</span><strong>${frame.weapon.equipped}</strong></div>
          <div class="hud-row"><span>Unlocks</span><strong>${unlocked}</strong></div>
          <div class="hud-row"><span>Shots</span><strong>${frame.projectiles.length}</strong></div>
        </div>
      `;
      }
      if (this.ui.menuRoot) {
        this.ui.menuRoot.innerHTML = frame.message ? `<div class="menu-card"><strong>${frame.message.title}</strong><p>${frame.message.body}</p></div>` : "";
      }
    }
    getFrameState() {
      return this.frame;
    }
    buildFrameState() {
      const s = this.stage;
    return {
      mode: s.mode,
      score: s.score,
      view: s.view,
      camera: { ...s.camera },
      player: { ...s.player },
        core: { ...s.core },
        enemies: s.enemies.map((enemy) => ({ ...enemy })),
        projectiles: s.combat?.projectiles.map((shot) => ({ ...shot })) ?? [],
        effects: s.combat?.effects.map((effect) => ({ ...effect })) ?? [],
        shots: s.shots.map((shot) => ({ ...shot })),
        boss: { ...s.boss, weakpoint: { ...s.boss.weakpoint } },
        attackIntents: [...s.attackIntents ?? []],
        events: [...s.events ?? []],
        groundY: s.groundY,
        weapon: s.combat?.weapon ? {
          equipped: s.combat.weapon.equipped,
          unlocked: [...s.combat.weapon.unlocked]
        } : { equipped: "buster", unlocked: ["buster"] },
        combat: {
          projectiles: s.combat?.projectiles.map((shot) => ({ ...shot })) ?? [],
          damageTotals: s.combat?.damageTotals ?? { player: 0, enemy: 0, boss: 0 },
          feedback: s.combat?.feedback ?? { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false },
          hitEvents: s.combat?.hitEvents ?? [],
          unlocks: s.combat?.unlocks ?? []
        },
        message: s.mode === "menu" ? { title: "Ready", body: "Press Enter to deploy. Hold jump for height, kick off walls, fire with J or Ctrl." } : s.mode === "win" ? { title: "Win", body: "Fortress cleared. Press Enter to retry with your new weapon." } : s.mode === "lose" ? { title: "Lose", body: "Robot frame cracked. Press Enter to relaunch." } : null,
        walls: s.walls
      };
    }
  }

  // mega-robot/src/core/input.js
  function createInput(target) {
    const keys = new Set;
    const pressed = new Set;
    target.addEventListener("keydown", (event) => {
      if (!keys.has(event.code))
        pressed.add(event.code);
      keys.add(event.code);
    });
    target.addEventListener("keyup", (event) => {
      keys.delete(event.code);
    });
    return {
      sample() {
        const start = pressed.has("Enter");
        const restart = pressed.has("KeyR");
        const fire = keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyJ");
        const jump = keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW");
        const left = keys.has("ArrowLeft") || keys.has("KeyA");
        const right = keys.has("ArrowRight") || keys.has("KeyD");
        const digit1 = pressed.has("Digit1");
        const digit2 = pressed.has("Digit2");
        const result = { start, restart, fire, jump, left, right, digit1, digit2 };
        pressed.clear();
        return result;
      }
    };
  }

  // mega-robot/src/main.js
  var canvas = document.getElementById("game");
  var hudRoot = document.getElementById("hud-root");
  var menuRoot = document.getElementById("menu-root");
  var game = new Game(canvas, { hudRoot, menuRoot });
  var input = createInput(window);
  var lastTime = performance.now();
  function resize() {
    const shell = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(shell.width * window.devicePixelRatio));
    const height = Math.max(240, Math.floor(shell.height * window.devicePixelRatio));
    canvas.width = width;
    canvas.height = height;
    game.resize(width, height);
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    game.update(dt, input.sample());
    game.render();
    game.syncUI();
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && game.getFrameState().mode !== "play") {
      if (game.getFrameState().mode === "menu") {
        game.start();
      } else {
        game.restart();
      }
    }
  });
  resize();
  game.render();
  game.syncUI();
  requestAnimationFrame(frame);
})();
