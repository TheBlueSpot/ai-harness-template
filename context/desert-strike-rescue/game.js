(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayBody = document.getElementById("overlayBody");
  const overlayButton = document.getElementById("overlayButton");

  const hud = {
    fuel: document.getElementById("fuelValue"),
    cannon: document.getElementById("cannonValue"),
    rockets: document.getElementById("rocketValue"),
    rescued: document.getElementById("rescuedValue"),
    cargo: document.getElementById("cargoValue"),
    armor: document.getElementById("armorValue"),
    threat: document.getElementById("threatValue"),
    status: document.getElementById("statusValue"),
  };

  const WORLD = { width: 2800, height: 1800 };
  const ISO = { scaleX: 1.08, scaleY: 0.58 };
  const MAX_PASSENGERS = 3;
  const TOTAL_SURVIVORS = 7;

  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    rocket: false,
    land: false,
    restart: false,
    mouseX: 0,
    mouseY: 0,
  };

  let state = null;
  let lastTime = 0;
  let audioLocked = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function angleTo(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function isoProject(x, y) {
    return {
      x: (x - y) * ISO.scaleX,
      y: (x + y) * ISO.scaleY,
    };
  }

  function screenFromWorld(x, y, camera) {
    const p = isoProject(x, y);
    return {
      x: p.x - camera.x + canvas.width * 0.5,
      y: p.y - camera.y + canvas.height * 0.55,
    };
  }

  function worldFromScreen(screenX, screenY, camera) {
    const isoX = screenX + camera.x - canvas.width * 0.5;
    const isoY = screenY + camera.y - canvas.height * 0.55;
    const a = isoX / ISO.scaleX;
    const b = isoY / ISO.scaleY;
    return {
      x: (a + b) * 0.5,
      y: (b - a) * 0.5,
    };
  }

  function makeState() {
    const evac = { x: 230, y: 260, radius: 110 };
    const survivors = [
      { x: 760, y: 360, alive: true, carried: false, rescued: false, pulse: 0.4 },
      { x: 1290, y: 420, alive: true, carried: false, rescued: false, pulse: 0.9 },
      { x: 1750, y: 540, alive: true, carried: false, rescued: false, pulse: 1.7 },
      { x: 2140, y: 720, alive: true, carried: false, rescued: false, pulse: 2.5 },
      { x: 1950, y: 1170, alive: true, carried: false, rescued: false, pulse: 3.1 },
      { x: 1380, y: 1360, alive: true, carried: false, rescued: false, pulse: 4.1 },
      { x: 860, y: 1160, alive: true, carried: false, rescued: false, pulse: 4.7 },
    ];

    const tanks = [
      { x: 1180, y: 540, hp: 110, cooldown: 1.6 },
      { x: 1660, y: 720, hp: 110, cooldown: 2.4 },
      { x: 2080, y: 1010, hp: 110, cooldown: 1.1 },
      { x: 1000, y: 1320, hp: 110, cooldown: 2.8 },
    ];

    const sams = [
      { x: 1410, y: 320, hp: 80, lock: 0, reload: 3.2, telegraph: 0, dead: false },
      { x: 2220, y: 850, hp: 80, lock: 0, reload: 2.4, telegraph: 0, dead: false },
      { x: 1220, y: 1520, hp: 80, lock: 0, reload: 3.6, telegraph: 0, dead: false },
    ];

    const depots = [
      { x: evac.x + 40, y: evac.y + 35 },
      { x: evac.x - 55, y: evac.y + 20 },
    ];

    return {
      mode: "menu",
      result: "",
      timer: 0,
      camera: { x: 0, y: 0 },
      player: {
        x: 260,
        y: 260,
        vx: 0,
        vy: 0,
        angle: 0,
        cannonCooldown: 0,
        rocketCooldown: 0,
        armor: 100,
        fuel: 120,
        cannonAmmo: 420,
        rockets: 14,
        carrying: 0,
        landing: 0,
      },
      evac,
      depots,
      survivors,
      tanks,
      sams,
      bullets: [],
      rockets: [],
      missiles: [],
      shells: [],
      particles: [],
      scoreRescued: 0,
      threatenedBySam: false,
      threatText: "Clear",
      statusText: "Launch",
    };
  }

  function showOverlay(title, body, button) {
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlayButton.textContent = button;
    overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function startMission() {
    state = makeState();
    state.mode = "playing";
    hideOverlay();
    lastTime = 0;
  }

  function setEndState(mode, title, body) {
    state.mode = mode;
    state.result = mode;
    showOverlay(title, body, "Restart Mission");
  }

  function emitBurst(x, y, count, color, speedMin, speedMax) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = lerp(speedMin, speedMax, Math.random());
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: lerp(0.35, 0.8, Math.random()),
        size: lerp(2, 6, Math.random()),
        color,
      });
    }
  }

  function damagePlayer(amount) {
    state.player.armor = clamp(state.player.armor - amount, 0, 100);
    state.player.vx *= 0.82;
    state.player.vy *= 0.82;
    emitBurst(state.player.x, state.player.y, 12, "#ffb16f", 20, 120);
    if (state.player.armor <= 0) {
      setEndState(
        "lose",
        "Gunship down.",
        "Armor failed before the evac line was clear. Restart and route the SAM nests earlier."
      );
    }
  }

  function killSurvivor(target) {
    if (!target.alive || target.carried || target.rescued) {
      return;
    }
    target.alive = false;
    emitBurst(target.x, target.y, 12, "#ff6c55", 20, 80);
    const remainingAlive = state.survivors.filter((s) => s.alive || s.carried || s.rescued).length;
    const possibleTotal = state.scoreRescued + state.player.carrying + remainingAlive;
    if (possibleTotal < TOTAL_SURVIVORS - 2) {
      setEndState(
        "lose",
        "Evac collapsed.",
        "Too many civilians were lost to finish the rescue chain. Restart and land cleaner under pressure."
      );
    }
  }

  function fireCannon() {
    if (state.player.cannonCooldown > 0 || state.player.cannonAmmo <= 0) {
      return;
    }
    const angle = state.player.angle;
    state.player.cannonCooldown = 0.09;
    state.player.cannonAmmo -= 1;
    state.bullets.push({
      x: state.player.x + Math.cos(angle) * 32,
      y: state.player.y + Math.sin(angle) * 32,
      vx: Math.cos(angle) * 760 + state.player.vx * 0.25,
      vy: Math.sin(angle) * 760 + state.player.vy * 0.25,
      life: 1.2,
      damage: 20,
    });
    emitBurst(state.player.x + Math.cos(angle) * 28, state.player.y + Math.sin(angle) * 28, 3, "#fff0c0", 20, 70);
  }

  function fireRocket() {
    if (state.player.rocketCooldown > 0 || state.player.rockets <= 0) {
      return;
    }
    const angle = state.player.angle;
    state.player.rocketCooldown = 0.55;
    state.player.rockets -= 1;
    state.rockets.push({
      x: state.player.x + Math.cos(angle) * 24,
      y: state.player.y + Math.sin(angle) * 24,
      vx: Math.cos(angle) * 310 + state.player.vx * 0.4,
      vy: Math.sin(angle) * 310 + state.player.vy * 0.4,
      life: 3,
      damage: 70,
      splash: 115,
    });
  }

  function updatePlayer(dt) {
    const player = state.player;
    const thrustX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const thrustY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const magnitude = Math.hypot(thrustX, thrustY) || 1;
    const thrusting = thrustX !== 0 || thrustY !== 0;
    const thrustPower = player.carrying > 0 ? 184 : 210;

    if (thrusting && player.fuel > 0) {
      player.vx += (thrustX / magnitude) * thrustPower * dt;
      player.vy += (thrustY / magnitude) * thrustPower * dt;
      player.fuel = clamp(player.fuel - dt * (thrustPower * 0.016 + player.carrying * 0.2), 0, 120);
    }

    player.vx *= Math.pow(0.91, dt * 60);
    player.vy *= Math.pow(0.91, dt * 60);
    const maxSpeed = player.carrying > 0 ? 190 : 240;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      player.vx *= scale;
      player.vy *= scale;
    }

    player.x = clamp(player.x + player.vx * dt, 70, WORLD.width - 70);
    player.y = clamp(player.y + player.vy * dt, 70, WORLD.height - 70);

    const aimWorld = worldFromScreen(input.mouseX, input.mouseY, state.camera);
    player.angle = angleTo(player, aimWorld);

    player.cannonCooldown = Math.max(0, player.cannonCooldown - dt);
    player.rocketCooldown = Math.max(0, player.rocketCooldown - dt);

    if (player.fuel <= 0 && speed < 16) {
      setEndState(
        "lose",
        "Fuel dry in open sand.",
        "The helicopter settled before the evac was complete. Restart and make earlier depot returns."
      );
    }

    if (input.fire) {
      fireCannon();
    }
    if (input.rocket) {
      fireRocket();
      input.rocket = false;
    }

    player.landing = Math.max(0, player.landing - dt);
    if (input.land) {
      tryLandOrPickup();
      input.land = false;
    }
  }

  function tryLandOrPickup() {
    const player = state.player;
    if (Math.hypot(player.vx, player.vy) > 34) {
      state.statusText = "Too fast to land";
      return;
    }

    const evacDistance = Math.hypot(player.x - state.evac.x, player.y - state.evac.y);
    if (evacDistance < state.evac.radius && player.carrying > 0) {
      state.scoreRescued += player.carrying;
      player.carrying = 0;
      player.fuel = 120;
      player.cannonAmmo = 420;
      player.rockets = Math.max(player.rockets, 8);
      player.landing = 0.8;
      state.statusText = "Evac complete";
      emitBurst(state.evac.x, state.evac.y, 16, "#ffe28f", 20, 90);
      if (state.scoreRescued >= TOTAL_SURVIVORS) {
        setEndState(
          "win",
          "All survivors lifted out.",
          "The landing zone held, every rescue made it home, and the desert battery line is silent."
        );
      }
      return;
    }

    if (evacDistance < state.evac.radius) {
      player.fuel = clamp(player.fuel + 14, 0, 120);
      player.cannonAmmo = Math.min(420, player.cannonAmmo + 30);
      if (player.rockets < 14) {
        player.rockets += 1;
      }
      state.statusText = "Pad resupply";
      player.landing = 0.5;
      return;
    }

    if (player.carrying >= MAX_PASSENGERS) {
      state.statusText = "Cabin full";
      return;
    }

    let picked = false;
    for (const survivor of state.survivors) {
      if (!survivor.alive || survivor.carried || survivor.rescued) {
        continue;
      }
      if (Math.hypot(player.x - survivor.x, player.y - survivor.y) < 68) {
        survivor.carried = true;
        player.carrying += 1;
        player.landing = 0.55;
        state.statusText = "Survivor aboard";
        emitBurst(survivor.x, survivor.y, 10, "#f6efcd", 10, 60);
        picked = true;
        break;
      }
    }
    if (!picked) {
      state.statusText = "No landing target";
    }
  }

  function updateSurvivors(dt) {
    for (const survivor of state.survivors) {
      survivor.pulse += dt;
      if (survivor.carried) {
        survivor.x = state.player.x - 10 + Math.sin(state.timer * 6 + survivor.pulse) * 6;
        survivor.y = state.player.y + 18 + Math.cos(state.timer * 5 + survivor.pulse) * 4;
      }
      if (survivor.carried && state.scoreRescued + state.player.carrying <= TOTAL_SURVIVORS) {
        if (Math.hypot(state.player.x - state.evac.x, state.player.y - state.evac.y) < state.evac.radius && state.player.landing > 0) {
          survivor.carried = false;
          survivor.rescued = true;
          survivor.x = state.evac.x + Math.random() * 20 - 10;
          survivor.y = state.evac.y + Math.random() * 20 - 10;
        }
      }
    }
  }

  function dealAreaDamage(x, y, damage, radius) {
    for (const tank of state.tanks) {
      if (tank.hp <= 0) continue;
      const d = Math.hypot(tank.x - x, tank.y - y);
      if (d < radius) {
        tank.hp -= damage * (1 - d / radius);
        if (tank.hp <= 0) {
          emitBurst(tank.x, tank.y, 22, "#ff8e4d", 30, 120);
        }
      }
    }

    for (const sam of state.sams) {
      if (sam.dead) continue;
      const d = Math.hypot(sam.x - x, sam.y - y);
      if (d < radius) {
        sam.hp -= damage * (1 - d / radius);
        if (sam.hp <= 0) {
          sam.dead = true;
          sam.telegraph = 0;
          emitBurst(sam.x, sam.y, 20, "#ff8e4d", 30, 120);
        }
      }
    }

    for (const survivor of state.survivors) {
      if (!survivor.alive || survivor.carried || survivor.rescued) continue;
      if (Math.hypot(survivor.x - x, survivor.y - y) < radius * 0.55) {
        killSurvivor(survivor);
      }
    }
  }

  function updateWeapons(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;

      let hit = false;
      for (const tank of state.tanks) {
        if (tank.hp > 0 && Math.hypot(tank.x - bullet.x, tank.y - bullet.y) < 34) {
          tank.hp -= bullet.damage;
          emitBurst(bullet.x, bullet.y, 4, "#ffd39c", 20, 60);
          if (tank.hp <= 0) {
            emitBurst(tank.x, tank.y, 18, "#ff8a4f", 20, 110);
          }
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const sam of state.sams) {
          if (!sam.dead && Math.hypot(sam.x - bullet.x, sam.y - bullet.y) < 28) {
            sam.hp -= bullet.damage;
            emitBurst(bullet.x, bullet.y, 4, "#ffd39c", 20, 60);
            if (sam.hp <= 0) {
              sam.dead = true;
              emitBurst(sam.x, sam.y, 18, "#ff8a4f", 20, 110);
            }
            hit = true;
            break;
          }
        }
      }

      if (hit || bullet.life <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD.width || bullet.y > WORLD.height) {
        state.bullets.splice(i, 1);
      }
    }

    for (let i = state.rockets.length - 1; i >= 0; i -= 1) {
      const rocket = state.rockets[i];
      rocket.x += rocket.vx * dt;
      rocket.y += rocket.vy * dt;
      rocket.life -= dt;
      emitBurst(rocket.x - rocket.vx * dt * 0.18, rocket.y - rocket.vy * dt * 0.18, 1, "#ffb86a", 6, 18);

      let exploded = rocket.life <= 0;
      for (const tank of state.tanks) {
        if (tank.hp > 0 && Math.hypot(tank.x - rocket.x, tank.y - rocket.y) < 40) {
          exploded = true;
          break;
        }
      }
      for (const sam of state.sams) {
        if (!sam.dead && Math.hypot(sam.x - rocket.x, sam.y - rocket.y) < 36) {
          exploded = true;
          break;
        }
      }

      if (exploded) {
        dealAreaDamage(rocket.x, rocket.y, rocket.damage, rocket.splash);
        emitBurst(rocket.x, rocket.y, 28, "#ffb85e", 20, 130);
        state.rockets.splice(i, 1);
      }
    }

    for (let i = state.missiles.length - 1; i >= 0; i -= 1) {
      const missile = state.missiles[i];
      missile.life -= dt;
      const targetAngle = angleTo(missile, state.player);
      const turn = clamp(wrapAngle(targetAngle - missile.angle), -2.4 * dt, 2.4 * dt);
      missile.angle += turn;
      missile.vx = Math.cos(missile.angle) * missile.speed;
      missile.vy = Math.sin(missile.angle) * missile.speed;
      missile.x += missile.vx * dt;
      missile.y += missile.vy * dt;

      if (Math.hypot(missile.x - state.player.x, missile.y - state.player.y) < 34) {
        damagePlayer(28);
        emitBurst(missile.x, missile.y, 24, "#ff7d4f", 20, 120);
        state.missiles.splice(i, 1);
        continue;
      }
      if (missile.life <= 0 || missile.x < -80 || missile.y < -80 || missile.x > WORLD.width + 80 || missile.y > WORLD.height + 80) {
        state.missiles.splice(i, 1);
      }
    }

    for (let i = state.shells.length - 1; i >= 0; i -= 1) {
      const shell = state.shells[i];
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      shell.life -= dt;
      if (Math.hypot(shell.x - state.player.x, shell.y - state.player.y) < 28) {
        damagePlayer(14);
        emitBurst(shell.x, shell.y, 14, "#ffb86e", 20, 90);
        state.shells.splice(i, 1);
        continue;
      }
      if (shell.life <= 0) {
        state.shells.splice(i, 1);
      }
    }
  }

  function updateEnemies(dt) {
    state.threatenedBySam = false;
    let nearestThreat = Infinity;

    for (const tank of state.tanks) {
      if (tank.hp <= 0) continue;
      tank.cooldown -= dt;
      const d = dist(tank, state.player);
      if (d < nearestThreat) nearestThreat = d;
      if (d < 420 && tank.cooldown <= 0) {
        const angle = angleTo(tank, state.player);
        state.shells.push({
          x: tank.x + Math.cos(angle) * 22,
          y: tank.y + Math.sin(angle) * 22,
          vx: Math.cos(angle) * 260,
          vy: Math.sin(angle) * 260,
          life: 2.4,
        });
        tank.cooldown = 1.7 + Math.random() * 0.7;
        emitBurst(tank.x, tank.y, 4, "#ffe9b8", 10, 40);
      }
    }

    for (const sam of state.sams) {
      if (sam.dead) continue;
      const d = dist(sam, state.player);
      if (d < nearestThreat) nearestThreat = d;
      if (d < 460) {
        state.threatenedBySam = true;
      }

      sam.reload = Math.max(0, sam.reload - dt);
      if (d < 520 && sam.reload <= 0) {
        sam.lock += dt;
        sam.telegraph = clamp(sam.lock / 1.5, 0, 1);
        if (sam.lock >= 1.5) {
          const angle = angleTo(sam, state.player);
          state.missiles.push({
            x: sam.x + Math.cos(angle) * 26,
            y: sam.y + Math.sin(angle) * 26,
            angle,
            speed: 220,
            vx: Math.cos(angle) * 220,
            vy: Math.sin(angle) * 220,
            life: 5.5,
          });
          sam.lock = 0;
          sam.telegraph = 0;
          sam.reload = 3.8 + Math.random() * 0.9;
          emitBurst(sam.x, sam.y, 7, "#ffdd77", 15, 65);
        }
      } else {
        sam.lock = Math.max(0, sam.lock - dt * 1.3);
        sam.telegraph = clamp(sam.lock / 1.5, 0, 1);
      }
    }

    if (state.threatenedBySam) {
      state.threatText = "SAM lock";
    } else if (nearestThreat < 420) {
      state.threatText = "Armor range";
    } else {
      state.threatText = "Clear";
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.9, dt * 60);
      p.vy *= Math.pow(0.9, dt * 60);
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
      }
    }
  }

  function updateCamera(dt) {
    const target = isoProject(state.player.x, state.player.y);
    state.camera.x = lerp(state.camera.x, target.x, 1 - Math.pow(0.0001, dt));
    state.camera.y = lerp(state.camera.y, target.y, 1 - Math.pow(0.0001, dt));
  }

  function updateHud() {
    hud.fuel.textContent = `${Math.ceil(state.player.fuel)}%`;
    hud.cannon.textContent = state.player.cannonAmmo;
    hud.rockets.textContent = state.player.rockets;
    hud.rescued.textContent = `${state.scoreRescued} / ${TOTAL_SURVIVORS}`;
    hud.cargo.textContent = `${state.player.carrying} / ${MAX_PASSENGERS}`;
    hud.armor.textContent = `${Math.ceil(state.player.armor)}%`;
    hud.threat.textContent = state.threatText;
    hud.status.textContent = state.statusText;
  }

  function update(dt) {
    if (!state || state.mode !== "playing") {
      return;
    }
    state.timer += dt;
    state.statusText = "Sweep active";
    updatePlayer(dt);
    updateSurvivors(dt);
    updateWeapons(dt);
    updateEnemies(dt);
    updateParticles(dt);
    updateCamera(dt);
    updateHud();
  }

  function drawGround(camera) {
    const cols = 16;
    const rows = 12;
    const tileW = WORLD.width / cols;
    const tileH = WORLD.height / rows;

    for (let gy = 0; gy < rows; gy += 1) {
      for (let gx = 0; gx < cols; gx += 1) {
        const x = gx * tileW;
        const y = gy * tileH;
        const center = screenFromWorld(x + tileW * 0.5, y + tileH * 0.5, camera);
        const width = tileW * ISO.scaleX;
        const height = tileH * ISO.scaleY;
        const tone = ((gx + gy) % 2 === 0) ? "#5c4123" : "#6b4b28";
        ctx.beginPath();
        ctx.moveTo(center.x, center.y - height * 0.5);
        ctx.lineTo(center.x + width * 0.5, center.y);
        ctx.lineTo(center.x, center.y + height * 0.5);
        ctx.lineTo(center.x - width * 0.5, center.y);
        ctx.closePath();
        ctx.fillStyle = tone;
        ctx.fill();
      }
    }

    for (let i = 0; i < 120; i += 1) {
      const x = (i * 197) % WORLD.width;
      const y = (i * 131) % WORLD.height;
      const s = screenFromWorld(x, y, camera);
      ctx.fillStyle = "rgba(255, 219, 148, 0.09)";
      ctx.fillRect(s.x, s.y, 2, 2);
    }
  }

  function drawEvac() {
    const p = screenFromWorld(state.evac.x, state.evac.y, state.camera);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, state.evac.radius * ISO.scaleX, state.evac.radius * ISO.scaleY, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(87, 174, 153, 0.22)";
    ctx.fill();
    ctx.strokeStyle = "rgba(179, 240, 223, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = "#e1f8ef";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y);
    ctx.lineTo(p.x + 18, p.y);
    ctx.moveTo(p.x, p.y - 18);
    ctx.lineTo(p.x, p.y + 18);
    ctx.stroke();

    for (const depot of state.depots) {
      const d = screenFromWorld(depot.x, depot.y, state.camera);
      ctx.fillStyle = "#8f6c3b";
      ctx.fillRect(d.x - 12, d.y - 10, 24, 20);
      ctx.fillStyle = "#d9b56c";
      ctx.fillRect(d.x - 8, d.y - 6, 16, 12);
    }
  }

  function drawTank(tank) {
    const p = screenFromWorld(tank.x, tank.y, state.camera);
    ctx.fillStyle = "#5c6c42";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 18);
    ctx.lineTo(p.x + 28, p.y);
    ctx.lineTo(p.x, p.y + 18);
    ctx.lineTo(p.x - 28, p.y);
    ctx.closePath();
    ctx.fill();
    const angle = angleTo(tank, state.player);
    ctx.strokeStyle = "#2f341f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 16);
    ctx.stroke();

    ctx.fillStyle = "#24160d";
    ctx.fillRect(p.x - 26, p.y + 20, 52, 5);
    ctx.fillStyle = "#cfa86a";
    ctx.fillRect(p.x - 26, p.y + 20, clamp(tank.hp / 110, 0, 1) * 52, 5);
  }

  function drawSam(sam) {
    const p = screenFromWorld(sam.x, sam.y, state.camera);
    ctx.fillStyle = sam.dead ? "#513426" : "#724126";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 24);
    ctx.lineTo(p.x + 20, p.y);
    ctx.lineTo(p.x, p.y + 24);
    ctx.lineTo(p.x - 20, p.y);
    ctx.closePath();
    ctx.fill();

    if (!sam.dead) {
      if (sam.telegraph > 0) {
        ctx.strokeStyle = `rgba(255, 126, 73, ${0.25 + sam.telegraph * 0.65})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 90 + sam.telegraph * 22, 44 + sam.telegraph * 16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "#24160d";
      ctx.fillRect(p.x - 22, p.y + 28, 44, 5);
      ctx.fillStyle = "#d78d56";
      ctx.fillRect(p.x - 22, p.y + 28, clamp(sam.hp / 80, 0, 1) * 44, 5);
    }
  }

  function drawSurvivor(survivor) {
    if (!survivor.alive || survivor.rescued) {
      return;
    }
    const p = screenFromWorld(survivor.x, survivor.y, state.camera);
    const bob = Math.sin(survivor.pulse * 4) * 4;
    ctx.fillStyle = "#1d120a";
    ctx.beginPath();
    ctx.arc(p.x, p.y + 10, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = survivor.carried ? "#d3f1d2" : "#f2ebd3";
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, 8, 0, Math.PI * 2);
    ctx.fill();

    if (!survivor.carried) {
      ctx.strokeStyle = "rgba(255, 244, 177, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 16 + bob, 10 + Math.sin(survivor.pulse * 5) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const p = screenFromWorld(state.player.x, state.player.y, state.camera);
    const bodyAngle = state.player.angle;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(bodyAngle);
    ctx.fillStyle = "#d6c8a0";
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(0, -16);
    ctx.lineTo(-24, -12);
    ctx.lineTo(-30, 0);
    ctx.lineTo(-24, 12);
    ctx.lineTo(0, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#7e3423";
    ctx.fillRect(-10, -24, 20, 48);
    ctx.fillStyle = "#2f1f13";
    ctx.fillRect(-42, -3, 84, 6);

    ctx.strokeStyle = "#20120c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(50, 0);
    ctx.stroke();
    ctx.restore();

    if (state.player.landing > 0) {
      ctx.strokeStyle = "rgba(221, 255, 223, 0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 18, 48, 20, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawProjectiles() {
    ctx.fillStyle = "#fff3c4";
    for (const bullet of state.bullets) {
      const p = screenFromWorld(bullet.x, bullet.y, state.camera);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const rocket of state.rockets) {
      const p = screenFromWorld(rocket.x, rocket.y, state.camera);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(rocket.vy, rocket.vx));
      ctx.fillStyle = "#ffb45b";
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillStyle = "#fff2bf";
      ctx.fillRect(4, -2, 6, 4);
      ctx.restore();
    }

    for (const missile of state.missiles) {
      const p = screenFromWorld(missile.x, missile.y, state.camera);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(missile.angle);
      ctx.fillStyle = "#ff7652";
      ctx.fillRect(-11, -4, 22, 8);
      ctx.fillStyle = "#ffd996";
      ctx.fillRect(6, -2, 5, 4);
      ctx.restore();
    }

    ctx.fillStyle = "#f2d49f";
    for (const shell of state.shells) {
      const p = screenFromWorld(shell.x, shell.y, state.camera);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      const s = screenFromWorld(p.x, p.y, state.camera);
      ctx.globalAlpha = clamp(p.life / 0.8, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(s.x - p.size * 0.5, s.y - p.size * 0.5, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawCompass() {
    const pad = 18;
    const x = canvas.width - 152;
    const y = canvas.height - 116;
    ctx.fillStyle = "rgba(26, 17, 10, 0.74)";
    ctx.fillRect(x, y, 134, 92);
    ctx.strokeStyle = "rgba(244, 212, 133, 0.32)";
    ctx.strokeRect(x, y, 134, 92);

    const evacDx = state.evac.x - state.player.x;
    const evacDy = state.evac.y - state.player.y;
    const evacAngle = Math.atan2(evacDy, evacDx);

    ctx.save();
    ctx.translate(x + 67, y + 44);
    ctx.strokeStyle = "#7aa895";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(evacAngle);
    ctx.strokeStyle = "#f6e2b1";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(10, -6);
    ctx.lineTo(10, 6);
    ctx.closePath();
    ctx.fillStyle = "#f6e2b1";
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#f0e2ba";
    ctx.font = "12px Georgia";
    ctx.fillText("Pad bearing", x + pad, y + 75);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state) return;

    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#d4a65d");
    sky.addColorStop(0.34, "#a56d35");
    sky.addColorStop(1, "#3f2817");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGround(state.camera);
    drawEvac();

    const drawables = [];
    for (const tank of state.tanks) {
      if (tank.hp > 0) drawables.push({ y: tank.y, draw: () => drawTank(tank) });
    }
    for (const sam of state.sams) {
      drawables.push({ y: sam.y, draw: () => drawSam(sam) });
    }
    for (const survivor of state.survivors) {
      if (survivor.alive && !survivor.rescued) drawables.push({ y: survivor.y, draw: () => drawSurvivor(survivor) });
    }
    drawables.push({ y: state.player.y, draw: drawPlayer });
    drawables.sort((a, b) => a.y - b.y);
    for (const item of drawables) {
      item.draw();
    }

    drawProjectiles();
    drawParticles();
    drawCompass();

    if (state.threatenedBySam && state.mode === "playing") {
      ctx.strokeStyle = "rgba(255, 112, 73, 0.75)";
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    }
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    const dt = Math.min(0.033, (time - lastTime) / 1000);
    lastTime = time;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function onKey(event, pressed) {
    const key = event.key.toLowerCase();
    if (key === "w" || key === "arrowup") input.up = pressed;
    if (key === "s" || key === "arrowdown") input.down = pressed;
    if (key === "a" || key === "arrowleft") input.left = pressed;
    if (key === "d" || key === "arrowright") input.right = pressed;
    if (key === "q" && pressed) input.rocket = true;
    if (key === " " && pressed) input.land = true;
    if (key === "r" && pressed && state && state.mode !== "playing") startMission();
    if (key === "enter" && pressed && state && state.mode !== "playing") startMission();
  }

  overlayButton.addEventListener("click", startMission);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => onKey(event, true));
  window.addEventListener("keyup", (event) => onKey(event, false));
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 0) input.fire = true;
    if (event.button === 2) input.rocket = true;
  });
  canvas.addEventListener("mouseup", (event) => {
    if (event.button === 0) input.fire = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("mouseleave", () => {
    input.fire = false;
  });

  resize();
  state = makeState();
  updateHud();
  showOverlay(
    "Dustoff the convoy line.",
    "Thrust with WASD or arrows. Aim with the mouse. Hold left click for cannon fire, press right click or Q for rockets, and tap Space while nearly stopped to pick up survivors or unload them at the evac pad.",
    "Launch Mission"
  );
  requestAnimationFrame(frame);
})();
