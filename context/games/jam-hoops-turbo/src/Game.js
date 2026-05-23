const COURT = {
  left: 96,
  right: 1184,
  top: 96,
  bottom: 624,
  width: 1088,
  height: 528,
  centerX: 640,
  centerY: 360,
};

const HOOPS = {
  homeTarget: { x: 1128, y: 360 },
  awayTarget: { x: 152, y: 360 },
};

const PLAYER_TEMPLATES = {
  "home-guard": { name: "Blaze", role: "Guard", team: "home", shoot: 0.74, defense: 0.57, speed: 316 },
  "home-wing": { name: "Echo", role: "Wing", team: "home", shoot: 0.66, defense: 0.62, speed: 304 },
  "away-guard": { name: "Volt", role: "Guard", team: "away", shoot: 0.7, defense: 0.58, speed: 310 },
  "away-wing": { name: "Glitch", role: "Wing", team: "away", shoot: 0.67, defense: 0.64, speed: 298 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function createPlayer(id) {
  const template = PLAYER_TEMPLATES[id];
  return {
    id,
    ...template,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 24,
    turbo: 1,
    cooldown: 0,
    hasBall: false,
    cutTimer: 1.2 + Math.random() * 0.6,
    shotReleased: false,
  };
}

export class Game {
  constructor() {
    this.width = 1280;
    this.height = 720;
    this.resetMatch();
  }

  resetMatch() {
    this.players = [
      createPlayer("home-guard"),
      createPlayer("home-wing"),
      createPlayer("away-guard"),
      createPlayer("away-wing"),
    ];
    this.playerById = new Map(this.players.map((player) => [player.id, player]));
    this.score = { home: 0, away: 0 };
    this.possessionTeam = "home";
    this.controlledId = "home-guard";
    this.pendingPossessionTeam = null;
    this.mode = "menu";
    this.pauseTimer = 0;
    this.scorePauseText = "";
    this.message = "First to 21";
    this.messageTimer = 0;
    this.lastScoringTeam = null;
    this.consecutiveScores = { home: 0, away: 0 };
    this.fireTeam = null;
    this.shotClock = 14;
    this.ball = {
      mode: "held",
      x: COURT.centerX,
      y: COURT.centerY,
      z: 0,
      vx: 0,
      vy: 0,
      holderId: null,
      targetId: null,
      shot: null,
      lastTeam: "home",
    };
    this.setPossession("home", "start");
  }

  start() {
    this.resetMatch();
    this.mode = "playing";
    this.setBanner("Tip off to 21", 1.2);
  }

  restart() {
    this.start();
  }

  setBanner(text, duration = 1) {
    this.message = text;
    this.messageTimer = duration;
  }

  getTeamPlayers(team) {
    return this.players.filter((player) => player.team === team);
  }

  getOpposingTeam(team) {
    return team === "home" ? "away" : "home";
  }

  getTargetHoop(team) {
    return team === "home" ? HOOPS.homeTarget : HOOPS.awayTarget;
  }

  setPossession(team, reason = "turnover") {
    this.possessionTeam = team;
    this.pendingPossessionTeam = null;
    this.scorePauseText = "";
    this.shotClock = 14;
    this.ball.mode = "held";
    this.ball.shot = null;
    this.ball.targetId = null;
    this.ball.lastTeam = team;

    for (const player of this.players) {
      player.hasBall = false;
      player.cooldown = Math.max(0, player.cooldown - 0.12);
      player.shotReleased = false;
    }

    const direction = team === "home" ? 1 : -1;
    const ballHandler = this.playerById.get(team === "home" ? "home-guard" : "away-guard");
    const wing = this.playerById.get(team === "home" ? "home-wing" : "away-wing");
    const defenders = this.getTeamPlayers(this.getOpposingTeam(team));

    if (!ballHandler || !wing) {
      return;
    }

    ballHandler.x = team === "home" ? 280 : 1000;
    ballHandler.y = 360;
    ballHandler.vx = 0;
    ballHandler.vy = 0;
    ballHandler.hasBall = true;

    wing.x = ballHandler.x + direction * 170;
    wing.y = 500;
    wing.vx = 0;
    wing.vy = 0;
    wing.cutTimer = 1 + Math.random() * 1.4;

    defenders[0].x = team === "home" ? 820 : 460;
    defenders[0].y = 300;
    defenders[1].x = team === "home" ? 940 : 340;
    defenders[1].y = 460;
    for (const defender of defenders) {
      defender.vx = 0;
      defender.vy = 0;
    }

    this.ball.holderId = ballHandler.id;
    this.ball.x = ballHandler.x;
    this.ball.y = ballHandler.y;
    this.ball.z = 8;
    this.controlledId = team === "home" ? ballHandler.id : this.getHomeDefender().id;

    if (reason === "score") {
      this.setBanner(`${team === "home" ? "Home" : "Away"} ball`, 1.1);
    }
  }

  getHomeDefender() {
    const homePlayers = this.getTeamPlayers("home");
    const target = this.ball.holderId ? this.playerById.get(this.ball.holderId) : this.ball;
    const sorted = [...homePlayers].sort((left, right) => distance(left, target) - distance(right, target));
    return sorted[0];
  }

  getControlledPlayer() {
    return this.playerById.get(this.controlledId) ?? this.playerById.get("home-guard");
  }

  getBallHolder() {
    return this.ball.holderId ? this.playerById.get(this.ball.holderId) : null;
  }

  update(dt, input) {
    if (input.start && (this.mode === "menu" || this.mode === "win" || this.mode === "lose")) {
      this.start();
    }
    if (input.restart && (this.mode === "playing" || this.mode === "win" || this.mode === "lose")) {
      this.restart();
    }

    if (this.mode !== "playing") {
      if (this.messageTimer > 0) {
        this.messageTimer = Math.max(0, this.messageTimer - dt);
      }
      return;
    }

    this.messageTimer = Math.max(0, this.messageTimer - dt);

    if (this.pauseTimer > 0) {
      this.pauseTimer = Math.max(0, this.pauseTimer - dt);
      if (this.pauseTimer === 0 && this.pendingPossessionTeam) {
        this.setPossession(this.pendingPossessionTeam, "score");
      }
      return;
    }

    this.shotClock -= dt;
    if (this.shotClock <= 0) {
      this.forceTurnover(this.getOpposingTeam(this.possessionTeam), "Shot clock");
    }

    this.updateControl(input);
    this.updatePlayers(dt, input);
    this.updateBall(dt);
    this.resolveLooseBallPickups();
    this.resolvePlayerCollisions();
    this.checkWinState();
  }

  updateControl(input) {
    if (this.possessionTeam === "home" && this.ball.holderId?.startsWith("home")) {
      this.controlledId = this.ball.holderId;
      return;
    }

    if (input.pass) {
      const homePlayers = this.getTeamPlayers("home");
      const currentIndex = homePlayers.findIndex((player) => player.id === this.controlledId);
      const next = homePlayers[(currentIndex + 1 + homePlayers.length) % homePlayers.length];
      if (next) {
        this.controlledId = next.id;
      }
    } else {
      this.controlledId = this.getHomeDefender().id;
    }
  }

  updatePlayers(dt, input) {
    for (const player of this.players) {
      player.cooldown = Math.max(0, player.cooldown - dt);
    }

    for (const player of this.players) {
      if (player.id === this.controlledId) {
        this.updateControlledPlayer(player, dt, input);
      } else {
        this.updateAiPlayer(player, dt);
      }
      player.x = clamp(player.x + player.vx * dt, COURT.left + player.radius, COURT.right - player.radius);
      player.y = clamp(player.y + player.vy * dt, COURT.top + player.radius, COURT.bottom - player.radius);
      player.vx *= 0.82;
      player.vy *= 0.82;
    }
  }

  updateControlledPlayer(player, dt, input) {
    const move = normalize(input.moveX, input.moveY);
    const turboing = input.turbo && player.turbo > 0.08;
    const speed = player.speed * (turboing ? 1.56 : 1);
    if (turboing) {
      player.turbo = Math.max(0, player.turbo - dt * 0.32);
    } else {
      player.turbo = Math.min(1, player.turbo + dt * 0.2);
    }
    player.vx += move.x * speed * dt * 5.5;
    player.vy += move.y * speed * dt * 5.5;

    if (player.hasBall && input.action && player.cooldown <= 0) {
      this.tryShoot(player);
    } else if (player.hasBall && input.pass && player.cooldown <= 0) {
      this.tryPass(player);
    } else if (!player.hasBall && input.action && player.cooldown <= 0) {
      this.trySteal(player);
    }
  }

  updateAiPlayer(player, dt) {
    player.turbo = Math.min(1, player.turbo + dt * 0.14);
    const team = player.team;
    const offense = this.possessionTeam === team;
    const hoop = this.getTargetHoop(team);
    let targetX = player.x;
    let targetY = player.y;

    if (offense) {
      if (player.hasBall) {
        const laneBias = player.team === "home" ? -1 : 1;
        targetX = hoop.x + (player.team === "home" ? -96 : 96);
        targetY = clamp(360 + Math.sin(Date.now() * 0.001 + player.x * 0.01) * 130, 190, 530);
        const nearestDefender = this.findNearestOpponent(player);
        const closePressure = nearestDefender && distance(player, nearestDefender) < 70;
        if ((distance(player, hoop) < 150 && (!closePressure || Math.random() < 0.14)) || this.shotClock < 3.6) {
          this.tryShoot(player);
        } else if (closePressure && Math.random() < 0.02) {
          this.tryPass(player);
        } else {
          targetY += laneBias * 24;
          targetX += team === "home" ? -80 : 80;
        }
      } else {
        player.cutTimer -= dt;
        const handler = this.getBallHolder();
        if (player.cutTimer <= 0) {
          targetX = hoop.x + (team === "home" ? -72 : 72);
          targetY = 360 + (Math.random() < 0.5 ? -90 : 90);
          if (Math.random() < 0.006 && handler?.team === team) {
            this.tryPass(handler, player.id);
          }
          if (Math.hypot(player.x - targetX, player.y - targetY) < 18) {
            player.cutTimer = 1 + Math.random() * 1.4;
          }
        } else {
          targetX = handler ? lerp(handler.x, hoop.x, 0.45) : player.x;
          targetY = player.id.endsWith("wing") ? 500 : 220;
        }
      }
    } else {
      const assignment = this.getDefensiveAssignment(player);
      targetX = assignment.x;
      targetY = assignment.y;
      if (distance(player, assignment) < 46 && this.ball.holderId && this.ball.holderId.startsWith(this.getOpposingTeam(team)) && player.cooldown <= 0 && Math.random() < 0.012) {
        this.trySteal(player);
      }
    }

    const move = normalize(targetX - player.x, targetY - player.y);
    player.vx += move.x * player.speed * dt * 4.55;
    player.vy += move.y * player.speed * dt * 4.55;
  }

  getDefensiveAssignment(player) {
    const opponents = this.getTeamPlayers(this.getOpposingTeam(player.team));
    const ballHolder = this.getBallHolder();
    const preferred = ballHolder && ballHolder.team !== player.team
      ? ballHolder
      : opponents[player.id.endsWith("guard") ? 0 : 1];
    const hoop = this.getTargetHoop(this.getOpposingTeam(player.team));
    const offsetX = player.team === "home" ? 42 : -42;
    const offsetY = player.id.endsWith("guard") ? -28 : 36;
    return {
      x: lerp(preferred.x, hoop.x, 0.18) + offsetX,
      y: preferred.y + offsetY,
    };
  }

  findNearestOpponent(player) {
    const opponents = this.getTeamPlayers(this.getOpposingTeam(player.team));
    return [...opponents].sort((left, right) => distance(left, player) - distance(right, player))[0] ?? null;
  }

  tryPass(passer, forcedTargetId = null) {
    const teammates = this.getTeamPlayers(passer.team).filter((player) => player.id !== passer.id);
    const target = forcedTargetId
      ? this.playerById.get(forcedTargetId)
      : teammates.sort((left, right) => {
          const leftScore = distance(left, this.getTargetHoop(passer.team)) - distance(left, this.findNearestOpponent(left) ?? left) * 0.6;
          const rightScore = distance(right, this.getTargetHoop(passer.team)) - distance(right, this.findNearestOpponent(right) ?? right) * 0.6;
          return leftScore - rightScore;
        })[0];
    if (!target) {
      return;
    }

    passer.hasBall = false;
    passer.cooldown = 0.36;
    this.ball.mode = "pass";
    this.ball.holderId = null;
    this.ball.targetId = target.id;
    this.ball.x = passer.x;
    this.ball.y = passer.y - 10;
    this.ball.z = 12;
    const dir = normalize(target.x - passer.x, target.y - passer.y);
    const speed = 560;
    this.ball.vx = dir.x * speed;
    this.ball.vy = dir.y * speed;
    this.ball.lastTeam = passer.team;
    if (passer.team === "home") {
      this.controlledId = target.id;
    }
  }

  tryShoot(shooter) {
    const hoop = this.getTargetHoop(shooter.team);
    const dist = distance(shooter, hoop);
    const defenders = this.getTeamPlayers(this.getOpposingTeam(shooter.team));
    const contest = defenders.filter((defender) => distance(defender, shooter) < 82).length;
    const isDunk = dist < 92;
    const isThree = Math.abs(shooter.x - hoop.x) > 260;
    let chance = shooter.shoot + (this.fireTeam === shooter.team ? 0.14 : 0) - dist * 0.00042 - contest * 0.08;
    if (isThree) {
      chance -= 0.07;
    }
    if (isDunk) {
      chance = 0.92 - contest * 0.03;
    }
    chance = clamp(chance, 0.16, 0.97);
    const made = Math.random() < chance;
    const arc = isDunk ? 40 : clamp(dist * 0.34, 90, 220);
    const duration = isDunk ? 0.42 : clamp(dist / 720, 0.64, 1.08);
    const points = isThree ? 3 : 2;

    shooter.hasBall = false;
    shooter.cooldown = 0.52;
    this.ball.mode = "shot";
    this.ball.holderId = null;
    this.ball.targetId = null;
    this.ball.lastTeam = shooter.team;
    this.ball.shot = {
      arc,
      duration,
      elapsed: 0,
      fromX: shooter.x,
      fromY: shooter.y - 12,
      isDunk,
      made,
      points,
      shooterId: shooter.id,
      team: shooter.team,
      toX: hoop.x,
      toY: hoop.y,
    };
  }

  trySteal(defender) {
    const holder = this.getBallHolder();
    if (holder && holder.team !== defender.team && distance(defender, holder) < 40) {
      const success = Math.random() < 0.34 + defender.defense * 0.12 - holder.defense * 0.08;
      defender.cooldown = 0.44;
      if (success) {
        holder.hasBall = false;
        holder.cooldown = 0.4;
        this.ball.mode = "loose";
        this.ball.holderId = null;
        const dir = normalize(holder.x - defender.x, holder.y - defender.y);
        this.ball.x = holder.x;
        this.ball.y = holder.y;
        this.ball.z = 10;
        this.ball.vx = dir.x * 220 + (defender.team === "home" ? 60 : -60);
        this.ball.vy = dir.y * 180;
        this.ball.lastTeam = defender.team;
        this.possessionTeam = this.getOpposingTeam(holder.team);
        this.shotClock = 14;
        this.setBanner("Rip steal", 0.8);
      }
      return;
    }

    if (this.ball.mode === "loose" && distance(defender, this.ball) < 36) {
      defender.cooldown = 0.24;
      this.claimLooseBall(defender);
    }
  }

  forceTurnover(team, text) {
    const holder = this.getBallHolder();
    if (holder) {
      holder.hasBall = false;
    }
    this.setBanner(text, 0.9);
    this.setPossession(team, "turnover");
  }

  updateBall(dt) {
    if (this.ball.mode === "held") {
      const holder = this.getBallHolder();
      if (holder) {
        const bob = Math.sin(performance.now() * 0.018 + holder.x * 0.03) * 8;
        this.ball.x = holder.x + (holder.team === "home" ? 10 : -10);
        this.ball.y = holder.y + 8;
        this.ball.z = 8 + Math.abs(bob);
      }
      return;
    }

    if (this.ball.mode === "pass") {
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
      this.ball.z = 18;
      const target = this.ball.targetId ? this.playerById.get(this.ball.targetId) : null;
      if (target && distance(this.ball, target) < 26) {
        this.giveBallTo(target);
        return;
      }
      const interceptors = this.getTeamPlayers(this.getOpposingTeam(this.ball.lastTeam));
      const interceptor = interceptors.find((player) => distance(player, this.ball) < 28);
      if (interceptor) {
        this.claimLooseBall(interceptor);
      }
      return;
    }

    if (this.ball.mode === "shot" && this.ball.shot) {
      const shot = this.ball.shot;
      shot.elapsed += dt;
      const t = clamp(shot.elapsed / shot.duration, 0, 1);
      this.ball.x = lerp(shot.fromX, shot.toX, t);
      this.ball.y = lerp(shot.fromY, shot.toY, t);
      this.ball.z = Math.sin(t * Math.PI) * shot.arc;
      if (t >= 1) {
        if (shot.made) {
          this.finishScore(shot.team, shot.points, this.playerById.get(shot.shooterId));
        } else {
          this.ball.mode = "loose";
          this.ball.shot = null;
          this.ball.holderId = null;
          this.ball.targetId = null;
          this.ball.z = 6;
          this.ball.vx = shot.team === "home" ? -180 : 180;
          this.ball.vy = (Math.random() - 0.5) * 120;
          this.ball.lastTeam = shot.team;
          this.setBanner("Off the iron", 0.7);
        }
      }
      return;
    }

    if (this.ball.mode === "loose") {
      this.ball.x = clamp(this.ball.x + this.ball.vx * dt, COURT.left + 12, COURT.right - 12);
      this.ball.y = clamp(this.ball.y + this.ball.vy * dt, COURT.top + 12, COURT.bottom - 12);
      this.ball.z = Math.max(0, this.ball.z - dt * 50);
      this.ball.vx *= 0.985;
      this.ball.vy *= 0.985;
      if (this.ball.x <= COURT.left + 12 || this.ball.x >= COURT.right - 12) {
        this.ball.vx *= -0.74;
      }
      if (this.ball.y <= COURT.top + 12 || this.ball.y >= COURT.bottom - 12) {
        this.ball.vy *= -0.74;
      }
    }
  }

  resolveLooseBallPickups() {
    if (this.ball.mode !== "loose") {
      return;
    }
    const sorted = [...this.players].sort((left, right) => distance(left, this.ball) - distance(right, this.ball));
    const candidate = sorted[0];
    if (candidate && distance(candidate, this.ball) < 26) {
      this.claimLooseBall(candidate);
    }
  }

  claimLooseBall(player) {
    this.giveBallTo(player);
    this.possessionTeam = player.team;
    this.shotClock = 14;
    this.setBanner(player.team === "home" ? "Home board" : "Away board", 0.8);
  }

  giveBallTo(player) {
    for (const other of this.players) {
      other.hasBall = false;
    }
    player.hasBall = true;
    this.ball.mode = "held";
    this.ball.holderId = player.id;
    this.ball.targetId = null;
    this.ball.shot = null;
    this.ball.lastTeam = player.team;
    this.ball.z = 8;
    if (player.team === "home") {
      this.controlledId = player.id;
    }
  }

  finishScore(team, points, shooter) {
    this.score[team] += points;
    const other = this.getOpposingTeam(team);
    this.lastScoringTeam = team;
    this.consecutiveScores[team] += 1;
    this.consecutiveScores[other] = 0;
    this.fireTeam = this.consecutiveScores[team] >= 2 ? team : null;
    const shotText = points === 3 ? "from deep" : "at the cup";
    const fireText = this.fireTeam === team ? " He is on fire." : "";
    this.setBanner(`${shooter?.name ?? "Scorer"} ${shotText}.${fireText}`, 1.4);
    this.pauseTimer = 1.25;
    this.scorePauseText = `${team === "home" ? "Home" : "Away"} ${this.score.home}-${this.score.away}`;
    this.pendingPossessionTeam = other;
    this.ball.mode = "held";
    this.ball.holderId = null;
    this.ball.shot = null;
    this.ball.targetId = null;
  }

  resolvePlayerCollisions() {
    for (let index = 0; index < this.players.length; index += 1) {
      for (let inner = index + 1; inner < this.players.length; inner += 1) {
        const left = this.players[index];
        const right = this.players[inner];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDistance = left.radius + right.radius - 2;
        if (dist >= minDistance) {
          continue;
        }
        const overlap = (minDistance - dist) / 2;
        const normal = { x: dx / dist, y: dy / dist };
        left.x -= normal.x * overlap;
        left.y -= normal.y * overlap;
        right.x += normal.x * overlap;
        right.y += normal.y * overlap;
      }
    }
  }

  checkWinState() {
    if (this.score.home >= 21 || this.score.away >= 21) {
      this.mode = this.score.home > this.score.away ? "win" : "lose";
      this.pauseTimer = 0;
      this.pendingPossessionTeam = null;
      this.message = this.mode === "win" ? "Home wins 21" : "Away steals it";
      this.messageTimer = 999;
    }
  }

  getFrameState() {
    return {
      ball: { ...this.ball },
      controlledId: this.controlledId,
      fireTeam: this.fireTeam,
      height: this.height,
      hoops: HOOPS,
      message: this.messageTimer > 0 || this.mode !== "playing" ? this.message : "",
      mode: this.mode,
      pauseTimer: this.pauseTimer,
      players: this.players.map((player) => ({ ...player })),
      possessionTeam: this.possessionTeam,
      score: { ...this.score },
      shotClock: Math.max(0, this.shotClock),
      width: this.width,
      winningTeam: this.mode === "win" ? "home" : this.mode === "lose" ? "away" : null,
    };
  }
}
