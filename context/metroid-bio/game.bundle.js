(() => {
  // metroid-bio/src/world.js
  var VIEW_WIDTH = 1280;
  var VIEW_HEIGHT = 720;
  var ROOM_WIDTH = 880;
  var ROOM_HEIGHT = 520;
  var FLOOR_Y = 430;
  function rect(x, y, width, height) {
    return { x, y, width, height };
  }
  function ledge(x, y, width, height = 18) {
    return rect(x, y, width, height);
  }
  function verticalGate(x, y, width, height, requires, note) {
    return { x, y, width, height, requires, note, axis: "vertical" };
  }
  function hatchGate(x, y, width, height, requires, note) {
    return { x, y, width, height, requires, note, axis: "hatch" };
  }
  var ROOM_LAYOUT = [
    { id: "dock", gridX: 0, gridY: 0, name: "Dock", color: "#22354a" },
    { id: "atrium", gridX: 1, gridY: 0, name: "Atrium", color: "#1e3d3d" },
    { id: "morph", gridX: 2, gridY: 0, name: "Morph Vault", color: "#44363c" },
    { id: "junction", gridX: 0, gridY: 1, name: "Service Junction", color: "#2d2e4f" },
    { id: "spore", gridX: 1, gridY: 1, name: "Spore Gallery", color: "#3b3f26" },
    { id: "highJump", gridX: 2, gridY: 1, name: "High Jump Lab", color: "#4a312d" },
    { id: "reactor", gridX: 1, gridY: 2, name: "Reactor Nest", color: "#4d2a25" }
  ];
  var ROOMS = {
    dock: {
      id: "dock",
      name: "Dock",
      zone: "Dock",
      color: "#22354a",
      connections: { right: "atrium", down: "junction" },
      platforms: [ledge(300, 350, 170), ledge(560, 300, 180)],
      solids: [],
      hazards: [],
      pickups: [],
      enemies: [{ type: "zoomer", path: "dockLoop", startT: 0.08 }, { type: "drone", x: 620, y: 250 }],
      gates: [],
      drops: [{ x: 24, width: 82, to: "junction", requires: null, note: "Drop through the freight elevator shaft." }],
      notes: "Survey the station and find a route to the reactor."
    },
    atrium: {
      id: "atrium",
      name: "Atrium",
      zone: "Central Atrium",
      color: "#1e3d3d",
      connections: { left: "dock", right: "morph", down: "spore" },
      platforms: [ledge(120, 300, 160), ledge(360, 240, 160), ledge(620, 190, 140)],
      solids: [],
      hazards: [],
      pickups: [],
      enemies: [{ type: "zoomer", path: "atriumLoop", startT: 0.44 }, { type: "drone", x: 420, y: 170 }],
      gates: [],
      drops: [{ x: 760, width: 90, to: "spore", requires: null, note: "Drop through the atrium maintenance gap." }],
      notes: "Upper catwalks lead deeper into the lab."
    },
    morph: {
      id: "morph",
      name: "Morph Vault",
      zone: "Morph Vault",
      color: "#44363c",
      connections: { left: "atrium", down: "highJump" },
      platforms: [ledge(180, 330, 160), ledge(500, 270, 180)],
      solids: [rect(720, FLOOR_Y - 60, 120, 60)],
      hazards: [],
      pickups: [{ id: "morphBall", label: "Morph Ball", x: 765, y: FLOOR_Y - 100 }],
      enemies: [{ type: "zoomer", path: "vaultLoop", startT: 0.12 }],
      gates: [hatchGate(700, FLOOR_Y - 18, 80, 18, "morphBall", "Compress through the floor hatch.")],
      drops: [{ x: 700, width: 80, to: "highJump", requires: "morphBall", note: "Compress through the floor hatch." }],
      notes: "A sealed hatch hides a compact mobility module."
    },
    junction: {
      id: "junction",
      name: "Service Junction",
      zone: "Service Junction",
      color: "#2d2e4f",
      connections: { up: "dock", right: "spore" },
      platforms: [ledge(180, 280, 120), ledge(430, 320, 180)],
      solids: [rect(0, FLOOR_Y - 110, 90, 110)],
      hazards: [],
      pickups: [],
      enemies: [{ type: "zoomer", path: "junctionLoop", startT: 0.58 }],
      gates: [verticalGate(760, FLOOR_Y - 110, 32, 110, "morphBall", "Roll through the conduit to the gallery.")],
      drops: [],
      notes: "Maintenance conduits only admit a compact suit profile."
    },
    spore: {
      id: "spore",
      name: "Spore Gallery",
      zone: "Spore Gallery",
      color: "#3b3f26",
      connections: { left: "junction", up: "atrium", right: "highJump", down: "reactor" },
      platforms: [ledge(140, 260, 140), ledge(340, 200, 120), ledge(620, 280, 150)],
      solids: [],
      hazards: [rect(370, FLOOR_Y - 20, 130, 20)],
      pickups: [],
      enemies: [
        { type: "zoomer", path: "sporeLoop", startT: 0.26 },
        { type: "zoomer", path: "sporeLoop", startT: 0.78 },
        { type: "drone", x: 700, y: 190 }
      ],
      gates: [verticalGate(780, FLOOR_Y - 160, 34, 160, "highJump", "Reach the elevated blast door with high jump.")],
      drops: [{ x: 420, width: 74, to: "reactor", requires: null, note: "Drop through the spore trench." }],
      notes: "Toxic spores flood the floor trench."
    },
    highJump: {
      id: "highJump",
      name: "High Jump Lab",
      zone: "High Jump Lab",
      color: "#4a312d",
      connections: { left: "spore", up: "morph" },
      platforms: [ledge(160, 320, 150), ledge(370, 240, 130), ledge(560, 160, 120)],
      solids: [rect(740, FLOOR_Y - 150, 100, 150)],
      hazards: [],
      pickups: [{ id: "highJump", label: "High Jump", x: 610, y: 120 }],
      enemies: [{ type: "zoomer", path: "jumpLoop", startT: 0.19 }, { type: "drone", x: 310, y: 140 }],
      gates: [],
      drops: [],
      notes: "Experimental jump servos wait at the top of the chamber."
    },
    reactor: {
      id: "reactor",
      name: "Reactor Nest",
      zone: "Reactor Nest",
      color: "#4d2a25",
      connections: { up: "spore" },
      platforms: [ledge(170, 280, 140), ledge(530, 240, 170)],
      solids: [rect(370, FLOOR_Y - 150, 90, 150)],
      hazards: [rect(260, FLOOR_Y - 12, 330, 12)],
      pickups: [{ id: "reactorCore", label: "Containment Core", x: 705, y: 170 }],
      enemies: [
        { type: "zoomer", path: "reactorLoop", startT: 0.42 },
        { type: "zoomer", path: "reactorLoop", startT: 0.84 },
        { type: "drone", x: 640, y: 180, hp: 6 }
      ],
      gates: [hatchGate(620, FLOOR_Y - 18, 90, 18, "morphBall", "Slip under the reactor shielding."), verticalGate(660, 110, 36, 110, "highJump", "Leap to the suspended reactor ledge.")],
      drops: [],
      notes: "Break quarantine by extracting the containment core."
    }
  };
  var ZOOMER_PATHS = {
    dockLoop: [
      { x: 120, y: FLOOR_Y },
      { x: 120, y: 240 },
      { x: 320, y: 240 },
      { x: 320, y: FLOOR_Y }
    ],
    atriumLoop: [
      { x: 80, y: FLOOR_Y },
      { x: 80, y: 250 },
      { x: 250, y: 250 },
      { x: 250, y: FLOOR_Y }
    ],
    vaultLoop: [
      { x: 680, y: FLOOR_Y },
      { x: 680, y: FLOOR_Y - 140 },
      { x: 840, y: FLOOR_Y - 140 },
      { x: 840, y: FLOOR_Y }
    ],
    junctionLoop: [
      { x: 700, y: FLOOR_Y },
      { x: 700, y: FLOOR_Y - 130 },
      { x: 860, y: FLOOR_Y - 130 },
      { x: 860, y: FLOOR_Y }
    ],
    sporeLoop: [
      { x: 510, y: FLOOR_Y },
      { x: 510, y: 200 },
      { x: 770, y: 200 },
      { x: 770, y: FLOOR_Y }
    ],
    jumpLoop: [
      { x: 720, y: FLOOR_Y },
      { x: 720, y: 110 },
      { x: 850, y: 110 },
      { x: 850, y: FLOOR_Y }
    ],
    reactorLoop: [
      { x: 600, y: FLOOR_Y },
      { x: 600, y: 120 },
      { x: 820, y: 120 },
      { x: 820, y: FLOOR_Y }
    ]
  };
  function createWorldState() {
    return {
      roomId: "dock",
      visited: new Set(["dock"]),
      acquired: new Set,
      pickupsTaken: new Set,
      doorMessage: "",
      objectiveLog: "Survey the station"
    };
  }

  // metroid-bio/src/render.js
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
  function drawBackground(ctx, room) {
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
    gradient.addColorStop(0, room.color);
    gradient.addColorStop(1, "#081019");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.fillStyle = "rgba(124, 226, 194, 0.06)";
    for (let i = 0;i < 12; i += 1) {
      ctx.fillRect(80 + i * 100, 60 + i % 3 * 130, 42, 260);
    }
    ctx.strokeStyle = "rgba(186, 240, 219, 0.08)";
    ctx.lineWidth = 2;
    for (let y = 86;y < VIEW_HEIGHT - 40; y += 58) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(VIEW_WIDTH - 30, y);
      ctx.stroke();
    }
  }
  function drawPlatforms(ctx, room) {
    ctx.fillStyle = "#3f5a6e";
    for (const platform of room.platforms) {
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      ctx.fillStyle = "#88dec6";
      ctx.fillRect(platform.x, platform.y, platform.width, 4);
      ctx.fillStyle = "#3f5a6e";
    }
    ctx.fillStyle = "#274050";
    for (const solid of room.solids) {
      ctx.fillRect(solid.x, solid.y, solid.width, solid.height);
    }
    ctx.fillStyle = "#1a2634";
    ctx.fillRect(0, FLOOR_Y, ROOM_WIDTH, ROOM_HEIGHT - FLOOR_Y);
  }
  function drawHazards(ctx, room) {
    for (const hazard of room.hazards) {
      const gradient = ctx.createLinearGradient(hazard.x, hazard.y, hazard.x, hazard.y + hazard.height);
      gradient.addColorStop(0, "#7ff9b2");
      gradient.addColorStop(1, "#13392d");
      ctx.fillStyle = gradient;
      ctx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
    }
  }
  function drawGates(ctx, room, abilities) {
    for (const gate of room.gates) {
      const unlocked = abilities.has(gate.requires);
      ctx.fillStyle = unlocked ? "rgba(96, 232, 183, 0.22)" : "rgba(231, 132, 132, 0.26)";
      ctx.strokeStyle = unlocked ? "#5df0ba" : "#ff8b8b";
      ctx.lineWidth = 3;
      ctx.fillRect(gate.x, gate.y, gate.width, gate.height);
      ctx.strokeRect(gate.x, gate.y, gate.width, gate.height);
    }
  }
  function drawPickups(ctx, room, pickupsTaken) {
    for (const pickup of room.pickups) {
      if (pickupsTaken.has(pickup.id))
        continue;
      ctx.fillStyle = pickup.id === "reactorCore" ? "#ffb770" : "#9ef6da";
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  function drawPlayer(ctx, player) {
    const alpha = player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0 ? 0.45 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (player.form === "morph") {
      ctx.fillStyle = "#f0d36a";
      ctx.beginPath();
      ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#20495c";
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#d8c36c";
      ctx.fillRect(player.x + 10, player.y + 8, player.width - 20, player.height - 18);
      ctx.fillStyle = "#66d4b1";
      ctx.fillRect(player.x + 12, player.y + 18, player.width - 24, player.height - 26);
      ctx.fillStyle = "#d95061";
      ctx.fillRect(player.x + (player.facing > 0 ? player.width - 12 : 4), player.y + 28, 26, 12);
    }
    ctx.restore();
  }
  function drawEnemies(ctx, enemies) {
    for (const enemy of enemies) {
      if (enemy.hp <= 0)
        continue;
      if (enemy.kind === "zoomer") {
        ctx.fillStyle = "#f3b669";
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#6b3419";
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.fillStyle = "#e16978";
        ctx.fillRect(enemy.x - 16, enemy.y - 16, 32, 32);
        ctx.fillStyle = "#ffe0b5";
        ctx.fillRect(enemy.x - 10, enemy.y - 10, 20, 8);
      }
    }
  }
  function drawProjectiles(ctx, projectiles) {
    for (const shot of projectiles) {
      ctx.fillStyle = shot.owner === "player" ? "#8af8e0" : "#ff9d78";
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawEffects(ctx, effects) {
    for (const effect of effects) {
      ctx.strokeStyle = effect.color;
      ctx.globalAlpha = Math.max(0, effect.life / effect.maxLife);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function drawMinimap(ctx, frame) {
    const mapX = 970;
    const mapY = 24;
    const cell = 62;
    roundRect(ctx, mapX - 18, mapY - 18, 270, 240, 18);
    ctx.fillStyle = "rgba(8, 18, 28, 0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(153, 255, 223, 0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#d6fff5";
    ctx.font = "18px sans-serif";
    ctx.fillText("Minimap", mapX, mapY - 28);
    for (const room of ROOM_LAYOUT) {
      const x = mapX + room.gridX * cell;
      const y = mapY + room.gridY * cell;
      const visited = frame.visited.has(room.id);
      ctx.fillStyle = visited ? room.color : "rgba(47, 60, 74, 0.85)";
      ctx.fillRect(x, y, cell - 10, cell - 10);
      ctx.strokeStyle = frame.roomId === room.id ? "#ffd56a" : "rgba(153, 255, 223, 0.28)";
      ctx.lineWidth = frame.roomId === room.id ? 4 : 2;
      ctx.strokeRect(x, y, cell - 10, cell - 10);
      if (frame.upgrades.has("morphBall") && room.id === "morph") {
        ctx.fillStyle = "#9ef6da";
        ctx.beginPath();
        ctx.arc(x + 14, y + 14, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (frame.upgrades.has("highJump") && room.id === "highJump") {
        ctx.fillStyle = "#9ef6da";
        ctx.fillRect(x + 9, y + 9, 10, 10);
      }
      if (frame.coreRecovered && room.id === "reactor") {
        ctx.fillStyle = "#ffb770";
        ctx.fillRect(x + 30, y + 10, 10, 10);
      }
    }
  }
  function drawMessage(ctx, frame) {
    if (!frame.toast)
      return;
    roundRect(ctx, 36, 36, 420, 74, 18);
    ctx.fillStyle = "rgba(7, 14, 23, 0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(153, 255, 223, 0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#e9fff8";
    ctx.font = "18px sans-serif";
    ctx.fillText(frame.toast, 58, 82);
  }
  function renderFrame(ctx, frame) {
    const room = frame.room;
    drawBackground(ctx, room);
    drawPlatforms(ctx, room);
    drawHazards(ctx, room);
    drawGates(ctx, room, frame.upgrades);
    drawPickups(ctx, room, frame.pickupsTaken);
    drawEnemies(ctx, frame.enemies);
    drawProjectiles(ctx, frame.projectiles);
    drawPlayer(ctx, frame.player);
    drawEffects(ctx, frame.effects);
    drawMinimap(ctx, frame);
    drawMessage(ctx, frame);
  }

  // metroid-bio/src/Game.js
  var GRAVITY = 1850;
  var MOVE_SPEED = 250;
  var JUMP_SPEED = 700;
  var HIGH_JUMP_SPEED = 870;
  var MORPH_SPEED = 180;
  var SHOT_SPEED = 580;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }
  function pointInRect(x, y, rect2) {
    return x >= rect2.x && x <= rect2.x + rect2.width && y >= rect2.y && y <= rect2.y + rect2.height;
  }
  function createPlayer() {
    return {
      x: 120,
      y: FLOOR_Y - 88,
      width: 44,
      height: 88,
      vx: 0,
      vy: 0,
      facing: 1,
      form: "combat",
      hp: 99,
      onGround: false,
      invuln: 0,
      shotCooldown: 0
    };
  }
  function createEnemy(roomId, blueprint) {
    if (blueprint.type === "zoomer") {
      const path = ZOOMER_PATHS[blueprint.path];
      const enemy = {
        kind: "zoomer",
        roomId,
        pathId: blueprint.path,
        path,
        progress: blueprint.startT ?? 0,
        speed: 0.18,
        hp: 3,
        x: path[0].x,
        y: path[0].y,
        width: 28,
        height: 28,
        damage: 14
      };
      updateZoomer(enemy, 0);
      return enemy;
    }
    return {
      kind: "drone",
      roomId,
      x: blueprint.x,
      y: blueprint.y,
      originX: blueprint.x,
      originY: blueprint.y,
      width: 34,
      height: 34,
      vx: 0,
      hp: blueprint.hp ?? 4,
      damage: 12,
      shotCooldown: 1.1
    };
  }
  function updateZoomer(enemy, dt) {
    enemy.progress = (enemy.progress + enemy.speed * dt) % 1;
    const path = enemy.path;
    const scaled = enemy.progress * path.length;
    const index = Math.floor(scaled);
    const next = (index + 1) % path.length;
    const t = scaled - index;
    const from = path[index];
    const to = path[next];
    enemy.x = from.x + (to.x - from.x) * t;
    enemy.y = from.y + (to.y - from.y) * t;
  }
  function buildRoomEnemies() {
    const map = {};
    for (const room of Object.values(ROOMS)) {
      map[room.id] = room.enemies.map((enemy) => createEnemy(room.id, enemy));
    }
    return map;
  }

  class Game {
    constructor() {
      this.reset();
    }
    reset() {
      this.mode = "menu";
      this.world = createWorldState();
      this.player = createPlayer();
      this.roomEnemies = buildRoomEnemies();
      this.projectiles = [];
      this.effects = [];
      this.toast = "Survey the quarantine sector.";
      this.toastTimer = 4;
      this.frame = this.buildFrameState();
    }
    start() {
      this.mode = "playing";
      this.toast = this.currentRoom().notes;
      this.toastTimer = 4;
      this.frame = this.buildFrameState();
    }
    restart() {
      this.reset();
      this.mode = "playing";
      this.toast = this.currentRoom().notes;
      this.toastTimer = 4;
      this.frame = this.buildFrameState();
    }
    currentRoom() {
      return ROOMS[this.world.roomId];
    }
    activeEnemies() {
      return this.roomEnemies[this.world.roomId];
    }
    update(dt, input) {
      const seconds = Math.max(0, Math.min(0.05, Number(dt) || 0));
      if (this.mode === "menu") {
        if (input.pressed.start)
          this.start();
        this.frame = this.buildFrameState();
        return;
      }
      if (this.mode === "win" || this.mode === "lose") {
        if (input.pressed.restart || input.pressed.start)
          this.restart();
        this.frame = this.buildFrameState();
        return;
      }
      this.toastTimer = Math.max(0, this.toastTimer - seconds);
      this.player.invuln = Math.max(0, this.player.invuln - seconds);
      this.player.shotCooldown = Math.max(0, this.player.shotCooldown - seconds);
      this.handleMorph(input);
      this.handleMovement(seconds, input);
      this.handleShots(input);
      this.updateProjectiles(seconds);
      this.updateEnemies(seconds);
      this.collectPickups();
      this.checkHazards(seconds);
      this.checkTransitions();
      this.cleanupEffects(seconds);
      if (this.player.hp <= 0) {
        this.mode = "lose";
        this.toast = "Suit integrity failed.";
        this.toastTimer = 99;
      }
      if (this.world.pickupsTaken.has("reactorCore") && this.world.roomId === "dock") {
        this.mode = "win";
        this.toast = "Extraction tunnel secure.";
        this.toastTimer = 99;
      }
      this.frame = this.buildFrameState();
    }
    handleMorph(input) {
      if (!input.pressed.morph || !this.world.acquired.has("morphBall"))
        return;
      if (this.player.form === "combat") {
        this.player.form = "morph";
        this.player.width = 34;
        this.player.height = 34;
        this.player.y = Math.min(this.player.y + 54, FLOOR_Y - this.player.height);
        this.world.objectiveLog = "Roll through narrow hatches";
      } else {
        const standingHeight = 88;
        const room = this.currentRoom();
        const testRect = {
          x: this.player.x,
          y: this.player.y - (standingHeight - this.player.height),
          width: 44,
          height: standingHeight
        };
        const blocked = room.solids.concat(room.platforms).some((solid) => intersects(testRect, solid));
        if (!blocked) {
          this.player.form = "combat";
          this.player.width = 44;
          this.player.height = standingHeight;
          this.player.y -= standingHeight - 34;
        } else {
          this.toast = "Not enough clearance to stand.";
          this.toastTimer = 2.2;
        }
      }
    }
    handleMovement(dt, input) {
      const player = this.player;
      const room = this.currentRoom();
      const moveSpeed = player.form === "morph" ? MORPH_SPEED : MOVE_SPEED;
      player.vx = 0;
      if (input.down.left) {
        player.vx = -moveSpeed;
        player.facing = -1;
      } else if (input.down.right) {
        player.vx = moveSpeed;
        player.facing = 1;
      }
      if (input.pressed.jump && player.form === "combat" && player.onGround) {
        player.vy = -(this.world.acquired.has("highJump") ? HIGH_JUMP_SPEED : JUMP_SPEED);
        player.onGround = false;
      }
      player.vy += GRAVITY * dt;
      player.x += player.vx * dt;
      player.x = clamp(player.x, 0, ROOM_WIDTH - player.width);
      player.y += player.vy * dt;
      player.onGround = false;
      const surfaces = room.platforms.concat(room.solids, [{ x: 0, y: FLOOR_Y, width: ROOM_WIDTH, height: ROOM_HEIGHT - FLOOR_Y }]);
      for (const surface of surfaces) {
        if (player.vy >= 0 && player.x + player.width > surface.x && player.x < surface.x + surface.width) {
          const previousBottom = player.y + player.height - player.vy * dt;
          if (previousBottom <= surface.y && player.y + player.height >= surface.y) {
            player.y = surface.y - player.height;
            player.vy = 0;
            player.onGround = true;
          }
        }
      }
      for (const solid of room.solids) {
        if (!intersects(player, solid))
          continue;
        if (player.x + player.width / 2 < solid.x + solid.width / 2) {
          player.x = solid.x - player.width;
        } else {
          player.x = solid.x + solid.width;
        }
      }
      player.y = clamp(player.y, 0, FLOOR_Y - player.height);
    }
    handleShots(input) {
      if (!input.pressed.shoot || this.player.form === "morph" || this.player.shotCooldown > 0)
        return;
      this.player.shotCooldown = 0.28;
      this.projectiles.push({
        owner: "player",
        x: this.player.x + (this.player.facing > 0 ? this.player.width + 8 : -8),
        y: this.player.y + 38,
        vx: this.player.facing * SHOT_SPEED,
        vy: 0,
        radius: 6,
        damage: 1,
        roomId: this.world.roomId,
        life: 1.1
      });
    }
    updateProjectiles(dt) {
      const enemies = this.activeEnemies();
      for (const projectile of this.projectiles) {
        projectile.life -= dt;
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        if (projectile.owner === "player" && projectile.roomId === this.world.roomId) {
          for (const enemy of enemies) {
            if (enemy.hp <= 0)
              continue;
            const hitbox = { x: enemy.x - enemy.width / 2, y: enemy.y - enemy.height / 2, width: enemy.width, height: enemy.height };
            if (pointInRect(projectile.x, projectile.y, hitbox)) {
              enemy.hp -= projectile.damage;
              projectile.life = 0;
              this.effects.push({ x: projectile.x, y: projectile.y, radius: 10, life: 0.22, maxLife: 0.22, color: "#8af8e0" });
              if (enemy.hp <= 0) {
                this.toast = enemy.kind === "drone" ? "Drone neutralized." : "Zoomer scrubbed from the wall.";
                this.toastTimer = 1.2;
              }
              break;
            }
          }
        } else if (projectile.owner === "enemy" && projectile.roomId === this.world.roomId) {
          if (pointInRect(projectile.x, projectile.y, this.player)) {
            projectile.life = 0;
            this.damagePlayer(projectile.damage, projectile.x, projectile.y);
          }
        }
      }
      this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0 && projectile.x > -40 && projectile.x < ROOM_WIDTH + 40 && projectile.y > -40 && projectile.y < VIEW_HEIGHT + 40);
    }
    updateEnemies(dt) {
      const enemies = this.activeEnemies();
      for (const enemy of enemies) {
        if (enemy.hp <= 0)
          continue;
        if (enemy.kind === "zoomer") {
          updateZoomer(enemy, dt);
          const zoomerRect = { x: enemy.x - 14, y: enemy.y - 14, width: 28, height: 28 };
          if (intersects(this.player, zoomerRect)) {
            this.damagePlayer(enemy.damage, enemy.x, enemy.y);
          }
        } else {
          enemy.shotCooldown -= dt;
          enemy.y = enemy.originY + Math.sin(performance.now() / 360 + enemy.originX * 0.01) * 16;
          const direction = Math.sign(this.player.x - enemy.x) || 1;
          enemy.x += direction * 28 * dt;
          enemy.x = clamp(enemy.x, 80, ROOM_WIDTH - 80);
          if (enemy.shotCooldown <= 0 && Math.abs(this.player.x - enemy.x) < 330) {
            enemy.shotCooldown = 1.4;
            this.projectiles.push({
              owner: "enemy",
              x: enemy.x,
              y: enemy.y,
              vx: direction * 260,
              vy: 0,
              radius: 6,
              damage: 10,
              roomId: this.world.roomId,
              life: 2
            });
          }
          const droneRect = { x: enemy.x - 16, y: enemy.y - 16, width: 32, height: 32 };
          if (intersects(this.player, droneRect)) {
            this.damagePlayer(enemy.damage, enemy.x, enemy.y);
          }
        }
      }
    }
    damagePlayer(amount, x, y) {
      if (this.player.invuln > 0)
        return;
      this.player.hp -= amount;
      this.player.invuln = 1;
      this.player.vx = this.player.facing * -140;
      this.player.vy = -240;
      this.effects.push({ x, y, radius: 14, life: 0.3, maxLife: 0.3, color: "#ff9d78" });
      this.toast = "Suit integrity dropping.";
      this.toastTimer = 1.4;
    }
    collectPickups() {
      const room = this.currentRoom();
      for (const pickup of room.pickups) {
        if (this.world.pickupsTaken.has(pickup.id))
          continue;
        const hitbox = { x: pickup.x - 20, y: pickup.y - 20, width: 40, height: 40 };
        if (!intersects(this.player, hitbox))
          continue;
        this.world.pickupsTaken.add(pickup.id);
        this.world.acquired.add(pickup.id);
        if (pickup.id === "morphBall") {
          this.toast = "Morph Ball recovered.";
          this.world.objectiveLog = "Use morph ball in Service Junction";
        } else if (pickup.id === "highJump") {
          this.toast = "High Jump servos online.";
          this.world.objectiveLog = "Reach the Reactor Nest";
        } else if (pickup.id === "reactorCore") {
          this.toast = "Containment core secured. Return to Dock.";
          this.world.objectiveLog = "Extract through Dock";
        }
        this.toastTimer = 3.2;
      }
    }
    checkHazards(dt) {
      for (const hazard of this.currentRoom().hazards) {
        if (intersects(this.player, hazard)) {
          this.damagePlayer(18 * dt * 5, this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
          break;
        }
      }
    }
    gateAllows(gate) {
      if (gate.requires && !this.world.acquired.has(gate.requires)) {
        this.toast = gate.note;
        this.toastTimer = 2;
        return false;
      }
      return true;
    }
    transitionTo(roomId, entrySide) {
      this.world.roomId = roomId;
      this.world.visited.add(roomId);
      const room = this.currentRoom();
      this.toast = room.notes;
      this.toastTimer = 3;
      if (entrySide === "left")
        this.player.x = 36;
      if (entrySide === "right")
        this.player.x = ROOM_WIDTH - this.player.width - 36;
      if (entrySide === "up")
        this.player.y = FLOOR_Y - this.player.height - 4;
      if (entrySide === "down")
        this.player.y = 80;
      this.player.vx = 0;
      this.player.vy = 0;
    }
    checkTransitions() {
      const room = this.currentRoom();
      for (const gate of room.gates) {
        const touchingGate = intersects(this.player, gate);
        if (!touchingGate)
          continue;
        if (gate.axis === "vertical" && !this.gateAllows(gate)) {
          if (this.player.x < gate.x)
            this.player.x = gate.x - this.player.width - 1;
          else
            this.player.x = gate.x + gate.width + 1;
        }
        if (gate.axis === "hatch" && !this.gateAllows(gate)) {
          this.player.y = gate.y - this.player.height;
          this.player.vy = 0;
        }
      }
      if (this.player.x <= 0 && room.connections.left) {
        this.transitionTo(room.connections.left, "right");
        return;
      }
      if (this.player.x + this.player.width >= ROOM_WIDTH && room.connections.right) {
        const blockingGate = room.gates.find((gate) => gate.axis === "vertical" && gate.x > ROOM_WIDTH - 140);
        if (!blockingGate || this.world.acquired.has(blockingGate.requires)) {
          this.transitionTo(room.connections.right, "left");
          return;
        }
      }
      if (this.player.y <= 0 && room.connections.up) {
        this.transitionTo(room.connections.up, "down");
        return;
      }
      if (this.player.y + this.player.height >= FLOOR_Y && room.connections.down) {
        const drop = (room.drops ?? []).find((entry) => this.player.x + this.player.width > entry.x && this.player.x < entry.x + entry.width && (!entry.requires || this.world.acquired.has(entry.requires)) && (!entry.requires || this.player.form === "morph"));
        if (drop) {
          this.transitionTo(drop.to, "up");
          return;
        }
        const blockedDrop = (room.drops ?? []).find((entry) => this.player.x + this.player.width > entry.x && this.player.x < entry.x + entry.width);
        if (blockedDrop && !this.gateAllows(blockedDrop)) {
          this.player.y = FLOOR_Y - this.player.height;
          this.player.vy = 0;
        }
      }
    }
    cleanupEffects(dt) {
      for (const effect of this.effects) {
        effect.life -= dt;
        effect.radius += 60 * dt;
      }
      this.effects = this.effects.filter((effect) => effect.life > 0);
    }
    buildFrameState() {
      return {
        appState: this.mode === "playing" ? "playing" : this.mode,
        roomId: this.world.roomId,
        room: this.currentRoom(),
        visited: new Set(this.world.visited),
        upgrades: new Set(this.world.acquired),
        pickupsTaken: new Set(this.world.pickupsTaken),
        coreRecovered: this.world.pickupsTaken.has("reactorCore"),
        player: { ...this.player },
        enemies: this.activeEnemies().map((enemy) => ({ ...enemy })),
        projectiles: this.projectiles.filter((projectile) => projectile.roomId === this.world.roomId).map((projectile) => ({ ...projectile })),
        effects: this.effects.map((effect) => ({ ...effect })),
        objectiveLog: this.world.objectiveLog,
        toast: this.toastTimer > 0 ? this.toast : "",
        result: this.mode === "win" ? { eyebrow: "mission complete", title: "Containment core extracted.", copy: "Press restart to run the bio-lab again." } : this.mode === "lose" ? { eyebrow: "suit failure", title: "The lab overran the hunter.", copy: "Press restart to redeploy." } : null
      };
    }
    render(ctx) {
      renderFrame(ctx, this.frame);
    }
    getFrameState() {
      return this.frame;
    }
  }

  // metroid-bio/src/main.js
  var canvas = document.getElementById("game-canvas");
  var ctx = canvas.getContext("2d");
  var app = document.getElementById("app");
  var hud = document.getElementById("hud");
  var menuScreen = document.getElementById("menu-screen");
  var resultScreen = document.getElementById("result-screen");
  var startButton = document.getElementById("start-button");
  var restartButton = document.getElementById("restart-button");
  var hudNodes = {
    sector: document.getElementById("sector-value"),
    energy: document.getElementById("energy-value"),
    suit: document.getElementById("suit-value"),
    log: document.getElementById("log-value")
  };
  var resultNodes = {
    eyebrow: document.getElementById("result-eyebrow"),
    title: document.getElementById("result-title"),
    copy: document.getElementById("result-copy")
  };
  var game = new Game;
  var input = {
    down: {
      left: false,
      right: false
    },
    pressed: {
      jump: false,
      shoot: false,
      morph: false,
      start: false,
      restart: false
    }
  };
  var keyMap = {
    KeyA: { type: "down", key: "left" },
    ArrowLeft: { type: "down", key: "left" },
    KeyD: { type: "down", key: "right" },
    ArrowRight: { type: "down", key: "right" },
    KeyW: { type: "pressed", key: "jump" },
    ArrowUp: { type: "pressed", key: "jump" },
    Space: { type: "pressed", key: "jump" },
    KeyJ: { type: "pressed", key: "shoot" },
    KeyX: { type: "pressed", key: "shoot" },
    ControlLeft: { type: "pressed", key: "shoot" },
    ShiftLeft: { type: "pressed", key: "morph" },
    ShiftRight: { type: "pressed", key: "morph" },
    KeyS: { type: "pressed", key: "morph" },
    ArrowDown: { type: "pressed", key: "morph" },
    Enter: { type: "pressed", key: "start" },
    KeyR: { type: "pressed", key: "restart" }
  };
  function resize() {
    const rect2 = canvas.parentElement.getBoundingClientRect();
    const scale = Math.min(rect2.width / VIEW_WIDTH, rect2.height / VIEW_HEIGHT);
    canvas.width = VIEW_WIDTH;
    canvas.height = VIEW_HEIGHT;
    canvas.style.width = `${VIEW_WIDTH * scale}px`;
    canvas.style.height = `${VIEW_HEIGHT * scale}px`;
  }
  function consumePressed() {
    for (const key of Object.keys(input.pressed)) {
      input.pressed[key] = false;
    }
  }
  function setKey(code, isDown) {
    const mapping = keyMap[code];
    if (!mapping)
      return;
    if (mapping.type === "down") {
      input.down[mapping.key] = isDown;
    } else if (isDown) {
      input.pressed[mapping.key] = true;
    }
  }
  function updateUi(frame) {
    app.dataset.state = frame.appState;
    menuScreen.setAttribute("aria-hidden", frame.appState === "menu" ? "false" : "true");
    hud.setAttribute("aria-hidden", frame.appState === "playing" ? "false" : "true");
    resultScreen.setAttribute("aria-hidden", frame.appState === "win" || frame.appState === "lose" ? "false" : "true");
    hudNodes.sector.textContent = frame.room.zone;
    hudNodes.energy.textContent = `${Math.max(0, Math.ceil(frame.player.hp))}`;
    hudNodes.suit.textContent = frame.player.form === "morph" ? "Morph" : frame.upgrades.has("highJump") ? "High Jump" : "Combat";
    hudNodes.log.textContent = frame.objectiveLog;
    if (frame.result) {
      resultNodes.eyebrow.textContent = frame.result.eyebrow;
      resultNodes.title.textContent = frame.result.title;
      resultNodes.copy.textContent = frame.result.copy;
    }
  }
  var lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    game.update(dt, input);
    game.render(ctx);
    updateUi(game.getFrameState());
    consumePressed();
    requestAnimationFrame(frame);
  }
  window.addEventListener("keydown", (event) => {
    if (!keyMap[event.code])
      return;
    event.preventDefault();
    setKey(event.code, true);
  });
  window.addEventListener("keyup", (event) => {
    if (!keyMap[event.code])
      return;
    event.preventDefault();
    setKey(event.code, false);
  });
  startButton.addEventListener("click", () => {
    if (game.getFrameState().appState === "menu") {
      game.start();
      updateUi(game.getFrameState());
      return;
    }
    input.pressed.start = true;
  });
  restartButton.addEventListener("click", () => {
    const appState = game.getFrameState().appState;
    if (appState === "win" || appState === "lose") {
      game.restart();
      updateUi(game.getFrameState());
      return;
    }
    input.pressed.restart = true;
  });
  window.addEventListener("resize", resize);
  resize();
  updateUi(game.getFrameState());
  requestAnimationFrame(frame);
})();
