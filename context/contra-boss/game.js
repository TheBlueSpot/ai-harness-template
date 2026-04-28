(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const prompt = document.getElementById("prompt");
  const healthEl = document.getElementById("health");
  const bossEl = document.getElementById("boss");
  const phaseEl = document.getElementById("phase");
  const scoreEl = document.getElementById("score");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GROUND_Y = 452;
  const keys = new Set();

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function magnitude(x, y) {
    return Math.hypot(x, y) || 1;
  }

  function aimVector(input) {
    let x = 0;
    let y = 0;
    if (input.aimLeft) x -= 1;
    if (input.aimRight) x += 1;
    if (input.aimUp) y -= 1;
    if (input.aimDown) y += 1;
    if (!x && !y) x = input.facing;
    const mag = magnitude(x, y);
    return { x: x / mag, y: y / mag };
  }

  function spawnBurst(state, x, y, color, count, speedMin, speedMax, sizeMin, sizeMax) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = lerp(speedMin, speedMax, Math.random());
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: lerp(0.25, 0.7, Math.random()),
        maxLife: 1,
        size: lerp(sizeMin, sizeMax, Math.random()),
        color,
      });
    }
  }

  function createPlayer() {
    return {
      x: 120,
      y: GROUND_Y - 54,
      w: 32,
      h: 54,
      vx: 0,
      vy: 0,
      speed: 280,
      jumpVelocity: -510,
      onGround: true,
      facing: 1,
      fireCooldown: 0,
      dodgeCooldown: 0,
      dodgeTime: 0,
      invulnerable: 0,
      hp: 7,
      maxHp: 7,
    };
  }

  function createBossRush() {
    return [
      {
        name: "Iron Reaper",
        intro: "Walker chassis with shield emitters and exposed core.",
        maxHp: 230,
        partLayout: [
          { id: "leftPod", label: "Left pod", x: 690, y: 250, w: 48, h: 42, hp: 50, role: "turret" },
          { id: "rightPod", label: "Right pod", x: 810, y: 250, w: 48, h: 42, hp: 50, role: "turret" },
          { id: "core", label: "Core", x: 742, y: 210, w: 66, h: 72, hp: 130, role: "core" },
        ],
        phaseThresholds: [0.62, 0.28],
        attacks: [
          { id: "burst", weight: [4, 3, 2] },
          { id: "sweep", weight: [1, 3, 2] },
          { id: "missileRain", weight: [0, 2, 3] },
          { id: "charge", weight: [0, 1, 2] },
        ],
      },
      {
        name: "Aerial Mantis",
        intro: "Hover fortress with blade arms and a pulse eye.",
        maxHp: 260,
        partLayout: [
          { id: "leftBlade", label: "Left blade", x: 668, y: 170, w: 60, h: 118, hp: 60, role: "blade" },
          { id: "eye", label: "Eye", x: 746, y: 186, w: 84, h: 84, hp: 140, role: "core" },
          { id: "rightBlade", label: "Right blade", x: 850, y: 170, w: 60, h: 118, hp: 60, role: "blade" },
        ],
        phaseThresholds: [0.65, 0.25],
        attacks: [
          { id: "fan", weight: [4, 3, 2] },
          { id: "bladeDash", weight: [1, 2, 3] },
          { id: "orbGrid", weight: [0, 3, 3] },
          { id: "beam", weight: [0, 1, 3] },
        ],
      },
    ];
  }

  function createState() {
    return {
      mode: "menu",
      player: createPlayer(),
      bullets: [],
      enemyBullets: [],
      particles: [],
      bosses: createBossRush(),
      bossIndex: 0,
      boss: null,
      bossTimer: 0,
      bossAttackCooldown: 1.8,
      score: 0,
      flash: 0,
      shake: 0,
      message: "Press Enter to deploy.",
      victoryTimer: 0,
    };
  }

  const state = createState();

  function cloneBoss(template) {
    return {
      name: template.name,
      intro: template.intro,
      maxHp: template.maxHp,
      hp: template.maxHp,
      phaseThresholds: template.phaseThresholds.slice(),
      attacks: template.attacks.map((attack) => ({ ...attack, weight: attack.weight.slice() })),
      parts: template.partLayout.map((part) => ({
        ...part,
        maxHp: part.hp,
        alive: true,
      })),
      x: template.name === "Iron Reaper" ? 720 : 700,
      y: template.name === "Iron Reaper" ? 180 : 132,
      vx: 0,
      hover: 0,
      phase: 1,
      attackWindup: 0,
      activeAttack: null,
      spawnInvuln: 1.1,
      defeated: false,
    };
  }

  function resetRun() {
    state.mode = "playing";
    state.player = createPlayer();
    state.bullets = [];
    state.enemyBullets = [];
    state.particles = [];
    state.bossIndex = 0;
    state.score = 0;
    state.flash = 0;
    state.shake = 0;
    state.message = "";
    state.victoryTimer = 0;
    loadBoss();
  }

  function loadBoss() {
    const template = state.bosses[state.bossIndex];
    state.boss = cloneBoss(template);
    state.bossTimer = 0;
    state.bossAttackCooldown = 1.7;
    state.message = `${state.boss.name}: ${template.intro}`;
  }

  function getInput() {
    const left = keys.has("ArrowLeft");
    const right = keys.has("ArrowRight");
    return {
      left,
      right,
      jump: keys.has("KeyZ"),
      dodge: keys.has("KeyX"),
      fire: keys.has("Space"),
      aimUp: keys.has("KeyW"),
      aimDown: keys.has("KeyS"),
      aimLeft: keys.has("KeyA"),
      aimRight: keys.has("KeyD"),
      facing: right ? 1 : left ? -1 : state.player.facing,
    };
  }

  function chooseAttack(boss) {
    const phaseIndex = boss.phase - 1;
    const pool = [];
    for (const attack of boss.attacks) {
      const weight = attack.weight[phaseIndex] || 0;
      for (let i = 0; i < weight; i += 1) pool.push(attack.id);
    }
    return pool[Math.floor(Math.random() * pool.length)] || boss.attacks[0].id;
  }

  function damagePlayer(amount, x, y) {
    const player = state.player;
    if (player.invulnerable > 0 || state.mode !== "playing") return;
    player.hp = Math.max(0, player.hp - amount);
    player.invulnerable = 1.0;
    state.flash = 0.22;
    state.shake = Math.max(state.shake, 10);
    spawnBurst(state, x, y, "#ff6b6b", 16, 60, 210, 2, 4);
    if (player.hp <= 0) {
      state.mode = "gameover";
      state.message = "Unit down. Press Enter to redeploy.";
      prompt.textContent = state.message;
      overlay.hidden = false;
    }
  }

  function damageBossPart(part, damage) {
    if (!part.alive || state.mode !== "playing") return false;
    part.hp = Math.max(0, part.hp - damage);
    if (part.role === "core") {
      state.boss.hp = Math.max(0, state.boss.hp - damage);
    } else {
      state.boss.hp = Math.max(0, state.boss.hp - damage * 0.45);
    }
    if (part.hp <= 0) {
      part.alive = false;
      state.score += part.role === "core" ? 2000 : 600;
      spawnBurst(state, part.x + part.w / 2, part.y + part.h / 2, "#ffb347", 28, 80, 260, 2, 6);
      state.shake = Math.max(state.shake, 16);
    }
    return true;
  }

  function updatePlayer(dt, input) {
    const player = state.player;
    if (input.left) {
      player.vx = -player.speed;
      player.facing = -1;
    } else if (input.right) {
      player.vx = player.speed;
      player.facing = 1;
    } else {
      player.vx = 0;
    }

    if (input.jump && player.onGround) {
      player.vy = player.jumpVelocity;
      player.onGround = false;
    }

    if (input.dodge && player.dodgeCooldown <= 0 && player.dodgeTime <= 0) {
      player.dodgeTime = 0.2;
      player.dodgeCooldown = 0.85;
      player.invulnerable = Math.max(player.invulnerable, 0.24);
      player.vx = player.facing * 420;
      spawnBurst(state, player.x + player.w / 2, player.y + player.h / 2, "#7ce8ff", 10, 40, 140, 1, 3);
    }

    if (player.dodgeTime > 0) {
      player.dodgeTime -= dt;
    }

    player.fireCooldown -= dt;
    player.dodgeCooldown -= dt;
    player.invulnerable -= dt;
    player.vy += 1180 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.y + player.h >= GROUND_Y) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    player.x = clamp(player.x, 40, 530);

    if (input.fire && player.fireCooldown <= 0) {
      const aim = aimVector({ ...input, facing: player.facing });
      state.bullets.push({
        x: player.x + player.w * 0.5 + aim.x * 20,
        y: player.y + player.h * 0.36 + aim.y * 16,
        vx: aim.x * 620,
        vy: aim.y * 620,
        w: 10,
        h: 4,
        ttl: 0.9,
        damage: 10,
      });
      player.fireCooldown = 0.12;
      spawnBurst(state, player.x + player.w * 0.5, player.y + player.h * 0.4, "#f6fcff", 4, 20, 70, 1, 2);
    }
  }

  function updateBullets(dt) {
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.ttl -= dt;

      if (!state.boss || state.boss.defeated) continue;
      for (const part of state.boss.parts) {
        if (!part.alive) continue;
        if (rectsOverlap(bullet, part)) {
          damageBossPart(part, bullet.damage);
          bullet.ttl = 0;
          state.score += 15;
          state.shake = Math.max(state.shake, 4);
          spawnBurst(state, bullet.x, bullet.y, "#7ce8ff", 7, 20, 120, 1, 3);
          break;
        }
      }
    }

    state.bullets = state.bullets.filter((bullet) => bullet.ttl > 0 && bullet.x < WIDTH + 20 && bullet.y > -30 && bullet.y < HEIGHT + 30);

    for (const bullet of state.enemyBullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.ttl -= dt;
      if (bullet.gravity) bullet.vy += bullet.gravity * dt;
      if (rectsOverlap(bullet, state.player)) {
        bullet.ttl = 0;
        damagePlayer(bullet.damage, bullet.x, bullet.y);
      }
    }

    state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.ttl > 0 && bullet.x > -50 && bullet.x < WIDTH + 50 && bullet.y > -80 && bullet.y < HEIGHT + 80);
  }

  function updateBossParts() {
    const boss = state.boss;
    if (!boss) return;
    if (boss.name === "Iron Reaper") {
      const bob = Math.sin(boss.hover) * 6;
      for (const part of boss.parts) {
        if (part.id === "leftPod") {
          part.x = boss.x - 18;
          part.y = boss.y + 64 + bob;
        } else if (part.id === "rightPod") {
          part.x = boss.x + 102;
          part.y = boss.y + 64 - bob;
        } else {
          part.x = boss.x + 34;
          part.y = boss.y + 22;
        }
      }
    } else {
      const wave = Math.sin(boss.hover * 1.3) * 12;
      for (const part of boss.parts) {
        if (part.id === "leftBlade") {
          part.x = boss.x - 20;
          part.y = boss.y + 36 + wave;
        } else if (part.id === "rightBlade") {
          part.x = boss.x + 162;
          part.y = boss.y + 36 - wave;
        } else {
          part.x = boss.x + 58;
          part.y = boss.y + 56;
        }
      }
    }
  }

  function spawnEnemyBullet(x, y, tx, ty, speed, damage, color, extra) {
    const dx = tx - x;
    const dy = ty - y;
    const mag = magnitude(dx, dy);
    state.enemyBullets.push({
      x,
      y,
      vx: (dx / mag) * speed,
      vy: (dy / mag) * speed,
      w: extra?.w || 14,
      h: extra?.h || 14,
      ttl: extra?.ttl || 4,
      damage,
      color,
      gravity: extra?.gravity || 0,
    });
  }

  function executeBossAttack(boss, attack) {
    const player = state.player;
    if (boss.name === "Iron Reaper") {
      if (attack === "burst") {
        for (const part of boss.parts.filter((item) => item.alive && item.role === "turret")) {
          for (let i = -1; i <= 1; i += 1) {
            spawnEnemyBullet(part.x + part.w / 2, part.y + part.h / 2, player.x + player.w / 2, player.y + player.h / 2 + i * 40, 240 + Math.abs(i) * 20, 1, "#ff8d66");
          }
        }
      } else if (attack === "sweep") {
        const core = boss.parts.find((part) => part.id === "core");
        for (let i = 0; i < 7; i += 1) {
          const angle = -0.85 + i * 0.28;
          state.enemyBullets.push({
            x: core.x + core.w / 2,
            y: core.y + core.h / 2,
            vx: Math.cos(angle) * 260,
            vy: Math.sin(angle) * 210,
            w: 16,
            h: 16,
            ttl: 3.2,
            damage: 1,
            color: "#ffd166",
            gravity: 0,
          });
        }
      } else if (attack === "missileRain") {
        for (let i = 0; i < 5; i += 1) {
          state.enemyBullets.push({
            x: 620 + i * 62,
            y: 70 - i * 18,
            vx: -110 - i * 18,
            vy: 65 + i * 14,
            w: 18,
            h: 22,
            ttl: 4.2,
            damage: 1,
            color: "#ff5768",
            gravity: 120,
          });
        }
      } else if (attack === "charge") {
        boss.vx = -210;
      }
    } else {
      if (attack === "fan") {
        const eye = boss.parts.find((part) => part.id === "eye");
        for (let i = -3; i <= 3; i += 1) {
          spawnEnemyBullet(eye.x + eye.w / 2, eye.y + eye.h / 2, player.x + player.w / 2, player.y + player.h / 2 + i * 22, 250, 1, "#a987ff", { w: 14, h: 14, ttl: 3.8 });
        }
      } else if (attack === "bladeDash") {
        boss.vx = -260 - boss.phase * 30;
      } else if (attack === "orbGrid") {
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 4; col += 1) {
            state.enemyBullets.push({
              x: 670 + col * 64,
              y: 120 + row * 72,
              vx: -150 - col * 12,
              vy: 40 + row * 25,
              w: 18,
              h: 18,
              ttl: 4.4,
              damage: 1,
              color: "#6bf2d3",
              gravity: 0,
            });
          }
        }
      } else if (attack === "beam") {
        for (let i = 0; i < 6; i += 1) {
          state.enemyBullets.push({
            x: 720 + i * 26,
            y: player.y + i * 6,
            vx: -340,
            vy: 0,
            w: 28,
            h: 12,
            ttl: 1.5,
            damage: 1,
            color: "#ff4df0",
            gravity: 0,
          });
        }
      }
    }
  }

  function updateBoss(dt) {
    const boss = state.boss;
    if (!boss) return;

    boss.hover += dt * (boss.name === "Iron Reaper" ? 2 : 2.8);
    boss.spawnInvuln -= dt;
    boss.x += boss.vx * dt;
    boss.vx = lerp(boss.vx, boss.name === "Iron Reaper" ? 0 : 30 * Math.sin(boss.hover * 0.75), dt * 2.2);

    if (boss.name === "Iron Reaper") {
      boss.x = clamp(boss.x, 650, 770);
    } else {
      boss.x = clamp(boss.x, 650, 760);
      boss.y = 122 + Math.sin(boss.hover) * 18;
    }

    updateBossParts();

    const hpRatio = boss.hp / boss.maxHp;
    if (hpRatio <= boss.phaseThresholds[1]) boss.phase = 3;
    else if (hpRatio <= boss.phaseThresholds[0]) boss.phase = 2;
    else boss.phase = 1;

    if (boss.hp <= 0 && !boss.defeated) {
      boss.defeated = true;
      state.score += 4000;
      state.shake = 22;
      state.flash = 0.35;
      spawnBurst(state, boss.x + 90, boss.y + 90, "#ffd166", 60, 80, 300, 2, 7);
      state.bossIndex += 1;
      if (state.bossIndex >= state.bosses.length) {
        state.mode = "victory";
        state.message = "Boss rush cleared. Press Enter for another run.";
        prompt.textContent = state.message;
        overlay.hidden = false;
      } else {
        loadBoss();
      }
      return;
    }

    state.bossTimer += dt;
    state.bossAttackCooldown -= dt;
    if (state.bossAttackCooldown <= 0 && boss.spawnInvuln <= 0) {
      const attack = chooseAttack(boss);
      executeBossAttack(boss, attack);
      boss.activeAttack = attack;
      state.bossAttackCooldown = Math.max(0.65, 1.85 - boss.phase * 0.2);
      state.message = `${boss.name} pattern: ${attack}`;
    }

    if (boss.name === "Iron Reaper" && boss.x < state.player.x + 120 && boss.phase >= 2) {
      damagePlayer(1, state.player.x + state.player.w / 2, state.player.y + state.player.h / 2);
      boss.vx = 140;
    }

    if (boss.name === "Aerial Mantis") {
      for (const blade of boss.parts.filter((part) => part.alive && part.role === "blade")) {
        if (rectsOverlap(blade, state.player)) {
          damagePlayer(1, state.player.x + state.player.w / 2, state.player.y + state.player.h / 2);
        }
      }
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.98;
      particle.vy = particle.vy * 0.98 + 24 * dt;
      particle.life -= dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
    state.flash = Math.max(0, state.flash - dt);
    state.shake = Math.max(0, state.shake - dt * 18);
  }

  function update(dt) {
    if (state.mode !== "playing") {
      updateParticles(dt);
      return;
    }

    const input = getInput();
    updatePlayer(dt, input);
    updateBoss(dt);
    updateBullets(dt);
    updateParticles(dt);
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#0b1930");
    sky.addColorStop(0.65, "#12243e");
    sky.addColorStop(1, "#1d1f24");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 20; i += 1) {
      ctx.fillRect((i * 73 + state.score * 0.1) % WIDTH, 76 + (i % 5) * 22, 2, 2);
    }

    ctx.fillStyle = "#203a49";
    for (let i = 0; i < 8; i += 1) {
      ctx.fillRect(40 + i * 120, 260 + (i % 3) * 18, 80, 190);
    }

    ctx.fillStyle = "#0d171f";
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.fillStyle = "#1d2b36";
    for (let i = 0; i < 18; i += 1) {
      ctx.fillRect(i * 56, GROUND_Y - (i % 2) * 6, 28, 18);
    }
  }

  function drawPlayer() {
    const player = state.player;
    ctx.save();
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 18) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
    ctx.scale(player.facing, 1);
    ctx.fillStyle = "#d9f1ff";
    ctx.fillRect(-12, -22, 18, 30);
    ctx.fillStyle = "#5fb7ff";
    ctx.fillRect(-8, -30, 16, 12);
    ctx.fillStyle = "#ff7a18";
    ctx.fillRect(6, -8, 22, 6);
    ctx.fillStyle = "#89a6c7";
    ctx.fillRect(-10, 8, 9, 20);
    ctx.fillRect(1, 8, 9, 20);
    ctx.restore();
  }

  function drawBoss() {
    const boss = state.boss;
    if (!boss) return;

    ctx.save();
    if (boss.name === "Iron Reaper") {
      ctx.fillStyle = "#394857";
      ctx.fillRect(boss.x + 10, boss.y + 88, 154, 112);
      ctx.fillStyle = "#56697a";
      ctx.fillRect(boss.x + 34, boss.y + 12, 110, 108);
      ctx.fillStyle = "#2b333d";
      ctx.fillRect(boss.x + 26, boss.y + 168, 22, 72);
      ctx.fillRect(boss.x + 126, boss.y + 168, 22, 72);
    } else {
      ctx.fillStyle = "#36435d";
      ctx.beginPath();
      ctx.ellipse(boss.x + 100, boss.y + 102, 94, 86, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#23304d";
      ctx.fillRect(boss.x + 70, boss.y + 14, 56, 32);
    }

    for (const part of boss.parts) {
      ctx.save();
      if (!part.alive) {
        ctx.globalAlpha = 0.18;
      }
      if (part.role === "core") ctx.fillStyle = boss.name === "Iron Reaper" ? "#ff7a18" : "#ff5ef0";
      else if (part.role === "turret") ctx.fillStyle = "#8bd8ff";
      else ctx.fillStyle = "#7ee7cf";
      ctx.fillRect(part.x, part.y, part.w, part.h);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(part.x + 0.5, part.y + 0.5, part.w - 1, part.h - 1);
      if (part.alive) {
        const hpRatio = part.hp / part.maxHp;
        ctx.fillStyle = "rgba(3,8,15,0.8)";
        ctx.fillRect(part.x, part.y - 8, part.w, 5);
        ctx.fillStyle = hpRatio > 0.5 ? "#7df1a6" : hpRatio > 0.25 ? "#ffd166" : "#ff5768";
        ctx.fillRect(part.x, part.y - 8, part.w * hpRatio, 5);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBullets() {
    ctx.fillStyle = "#f6fcff";
    for (const bullet of state.bullets) {
      ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
    }
    for (const bullet of state.enemyBullets) {
      ctx.fillStyle = bullet.color;
      ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
    }
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawMessage() {
    if (!state.message || state.mode === "menu" || state.mode === "gameover" || state.mode === "victory") return;
    ctx.fillStyle = "rgba(6, 11, 20, 0.6)";
    ctx.fillRect(18, 18, 430, 36);
    ctx.strokeStyle = "rgba(75,212,255,0.35)";
    ctx.strokeRect(18.5, 18.5, 429, 35);
    ctx.fillStyle = "#eff7ff";
    ctx.font = "16px Trebuchet MS";
    ctx.fillText(state.message, 32, 41);
  }

  function render() {
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;
    ctx.save();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.translate(shakeX, shakeY);
    drawBackground();
    drawBoss();
    drawPlayer();
    drawBullets();
    drawParticles();
    drawMessage();
    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.45})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const boss = state.boss;
    healthEl.textContent = `${state.player.hp}/${state.player.maxHp}`;
    bossEl.textContent = boss ? boss.name : "-";
    phaseEl.textContent = boss ? `${boss.phase}` : "-";
    scoreEl.textContent = `${state.score}`;
  }

  function tick(timestamp) {
    if (!tick.last) tick.last = timestamp;
    const dt = Math.min(0.033, (timestamp - tick.last) / 1000);
    tick.last = timestamp;
    update(dt);
    render();
    requestAnimationFrame(tick);
  }

  function startRun() {
    overlay.hidden = true;
    resetRun();
  }

  document.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    keys.add(event.code);
    if (event.code === "Enter") {
      if (state.mode === "menu" || state.mode === "gameover" || state.mode === "victory") {
        startRun();
      }
    }
  });

  document.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  prompt.textContent = "Press Enter to deploy.";
  render();
  requestAnimationFrame(tick);
})();
