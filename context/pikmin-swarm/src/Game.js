import { ACTORS, CONTROLS, INITIAL_PIKMIN, WORLD } from "./data.js";
import { cloneForFrame, createRunState } from "./state.js";
import { clamp, distance, moveToward, nearestBy, projectPoint } from "./sim.js";

export class Game {
  constructor() {
    this.world = WORLD;
    this.defs = {
      initialPikmin: INITIAL_PIKMIN,
      enemies: ACTORS.enemies,
      tasks: ACTORS.tasks,
    };
    this.viewport = { width: WORLD.width, height: WORLD.height };
    this.throwSerial = 0;
    this.start();
  }

  start() {
    this.state = createRunState(this.world, this.defs);
    this.state.phase = "menu";
    this.state.overlay = "menu";
    this.state.menuEyebrow = "Launch";
    this.state.menuTitle = "Pikmin Swarm";
    this.state.prompt = "Press Enter to start. Whistle with Space, throw with Enter.";
  }

  restart() {
    this.start();
  }

  resize(width, height) {
    this.viewport = { width, height };
  }

  update(dt, input = {}) {
    const pressed = input.pressed || {};
    const held = input.held || {};

    if (this.state.phase !== "play") {
      if (pressed.Enter || pressed.Space) this.beginRun();
      return;
    }

    this.state.time += dt;

    const moveX = (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
    const moveY = (held.ArrowDown || held.KeyS ? 1 : 0) - (held.ArrowUp || held.KeyW ? 1 : 0);
    this.state.command.x = clamp(this.state.command.x + moveX * 26, 60, this.world.width - 60);
    this.state.command.y = clamp(this.state.command.y + moveY * 26, 110, this.world.groundY - 10);
    this.state.leader = moveToward(this.state.leader, this.state.command, 240, dt);

    if (pressed.Space) this.whistle();
    if (pressed.Enter) this.throwSquad();

    this.recruitNearby();
    this.updateThrown(dt);
    this.updateSquad(dt);
    this.updateTasks(dt);
    this.updateEnemies(dt);
    this.resolveFights();
    this.updateVictory();
    this.updateFailure();
  }

  getFrameState() {
    return {
      state: this.state.phase,
      phase: this.state.phase,
      overlay: this.state.overlay,
      overlayEyebrow: this.state.menuEyebrow,
      overlayTitle: this.state.menuTitle,
      overlayCopy:
        this.state.phase === "win"
          ? "Harvest complete. Press Enter to run it back."
          : this.state.phase === "lose"
            ? "The day is over. Press Enter for a fast retry."
            : "Lead, whistle, and throw. Keep the squad near the action and finish the objective.",
      overlayButton: this.state.phase === "lose" ? "Retry" : "Launch",
      world: { ...this.world, viewport: { ...this.viewport } },
      base: { ...this.world.base },
      leader: cloneForFrame(this.state.leader),
      cursor: cloneForFrame(this.state.command),
      command: cloneForFrame(this.state.command),
      squad: this.state.squad.map(cloneForFrame),
      thrown: this.state.thrown.map(cloneForFrame),
      pellets: this.state.pellets.map(cloneForFrame),
      gates: this.state.gates.map(cloneForFrame),
      enemies: this.state.enemies.map(cloneForFrame),
      hud: {
        day: 1,
        seeds: this.state.recruited,
        carried: this.state.carried,
        rescued: this.state.rescueCount,
        health: this.state.health,
        score: this.state.score,
        timeLeft: Math.max(0, this.world.daySeconds - this.state.time),
      },
      prompts: this.buildPrompts(),
      effects: this.buildEffects(),
      controls: CONTROLS,
      message: this.state.prompt,
      day: 1,
      score: this.state.score,
      seeds: this.state.recruited,
      carried: this.state.carried,
      rescued: this.state.rescueCount,
      health: this.state.health,
      timeLeft: Math.max(0, this.world.daySeconds - this.state.time),
    };
  }

  beginRun() {
    if (this.state.phase !== "menu") this.state = createRunState(this.world, this.defs);
    this.state.phase = "play";
    this.state.overlay = "";
    this.state.prompt = "Move to recruit stray pikmin, whistle them back, then push the objective.";
    this.state.leader.x = this.world.base.x;
    this.state.leader.y = this.world.base.y;
  }

  whistle() {
    this.state.command = {
      x: clamp(this.state.leader.x + 12, 60, this.world.width - 60),
      y: clamp(this.state.leader.y - 12, 110, this.world.groundY - 10),
    };
    for (const pikmin of this.state.squad) {
      if (!pikmin.alive) continue;
      if (distance(pikmin, this.state.leader) < this.world.whistleRadius) {
        pikmin.mode = "follow";
        pikmin.targetId = "leader";
      }
    }
    this.state.prompt = "Whistle keeps idle allies tight to the leader.";
  }

  throwSquad() {
    const idle = this.state.squad.find((pikmin) => pikmin.alive && pikmin.mode !== "carry");
    if (!idle) return;
    const target = nearestBy([...this.state.pellets, ...this.state.gates, ...this.state.enemies], this.state.command, (item) => !item.defeated && !item.delivered && !item.open);
    if (!target) return;
    idle.mode = "throw";
    idle.targetId = target.id;
    idle.throwTarget = { x: target.x, y: target.y };
    this.state.thrown.push({
      id: `throw-${this.throwSerial += 1}`,
      x: idle.x,
      y: idle.y,
      tx: target.x,
      ty: target.y,
      ttl: 0.35,
      ownerId: idle.id,
      targetId: target.id,
    });
    this.state.prompt = "Throw assignment is local and deterministic.";
  }

  recruitNearby() {
    for (const pikmin of this.state.squad) {
      if (!pikmin.alive || pikmin.mode !== "idle") continue;
      if (distance(pikmin, this.state.leader) <= this.world.recruitRadius) {
        pikmin.mode = "follow";
        pikmin.targetId = "leader";
        this.state.recruited += 1;
      }
    }
  }

  updateThrown(dt) {
    for (const thrown of this.state.thrown) {
      thrown.ttl -= dt;
      const targetEnemy = this.state.enemies.find((enemy) => enemy.id === thrown.targetId && !enemy.defeated);
      if (targetEnemy && distance(thrown, targetEnemy) <= targetEnemy.radius + 10) {
        targetEnemy.health -= 2;
        thrown.ttl = 0;
      }
    }
    this.state.thrown = this.state.thrown.filter((thrown) => thrown.ttl > 0);
  }

  updateSquad(dt) {
    for (const pikmin of this.state.squad) {
      if (!pikmin.alive) continue;
      if (pikmin.mode === "follow") {
        const followerIndex = Math.max(0, pikmin.id - 1);
        const target = followerIndex === 0 ? this.state.leader : this.state.squad[followerIndex - 1] || this.state.leader;
        const offset = projectPoint(target, Math.PI / 2, 14 + followerIndex * 4);
        Object.assign(pikmin, moveToward(pikmin, offset, 180, dt));
      } else if (pikmin.mode === "carry") {
        const pellet = this.state.pellets.find((item) => item.id === pikmin.carryId);
        if (pellet) {
          pikmin.x = pellet.x - 14 + pikmin.id * 3;
          pikmin.y = pellet.y - 8 + (pikmin.id % 2 ? 4 : -4);
        }
      } else if (pikmin.mode === "throw") {
        pikmin.mode = "follow";
        pikmin.targetId = "leader";
      }
    }
  }

  updateTasks(dt) {
    for (const pellet of this.state.pellets) {
      if (pellet.delivered) continue;
      const carriers = this.state.squad.filter((pikmin) => pikmin.alive && distance(pikmin, pellet) < 28);
      if (!pellet.carried && carriers.length >= pellet.required) {
        pellet.carried = true;
        pellet.liftedBy = carriers.length;
        this.state.carried += pellet.value;
        this.state.prompt = "Carry the load back to base.";
        for (const pikmin of carriers) {
          pikmin.mode = "carry";
          pikmin.carryId = pellet.id;
        }
      }
      if (pellet.carried) {
        const assignedCarriers = this.state.squad.filter((pikmin) => pikmin.alive && pikmin.carryId === pellet.id);
        if (assignedCarriers.length >= pellet.required) {
          const carried = moveToward(
            pellet,
            this.world.base,
            44 + assignedCarriers.length * 18,
            dt,
          );
          pellet.x = carried.x;
          pellet.y = carried.y;
        }
      }
      if (pellet.carried && distance(pellet, this.world.base) < this.world.homeRadius) {
        pellet.delivered = true;
        pellet.carried = false;
        this.state.carried = Math.max(0, this.state.carried - pellet.value);
        this.state.rescueCount += pellet.value;
        this.state.score += pellet.value * 100;
        for (const pikmin of this.state.squad) {
          if (pikmin.carryId === pellet.id) {
            pikmin.mode = "follow";
            pikmin.carryId = null;
          }
        }
        this.state.prompt = "Payload home. Push to the gate and enemy line.";
      }
    }

    for (const gate of this.state.gates) {
      if (gate.open) continue;
      const pushers = this.state.squad.filter((pikmin) => pikmin.alive && distance(pikmin, gate) <= gate.radius + 26);
      if (pushers.length >= 2) {
        gate.progress = Math.min(gate.progress + pushers.length * dt * 40, gate.progressNeeded);
        this.state.prompt = "Stay on the gate until it opens.";
        if (gate.progress >= gate.progressNeeded) {
          gate.open = true;
          this.state.score += 250;
          this.state.prompt = "Gate open. Route is clear.";
        }
      }
    }
  }

  updateEnemies(dt) {
    for (const enemy of this.state.enemies) {
      if (enemy.defeated) continue;
      const target = nearestBy(this.state.squad, enemy, (pikmin) => pikmin.alive);
      if (!target) continue;
      const chase = distance(enemy, target) <= enemy.sight;
      const next = moveToward(enemy, target, chase ? enemy.speed : enemy.speed * 0.35, dt);
      enemy.x = clamp(next.x, 40, this.world.width - 40);
      enemy.y = clamp(next.y, 150, this.world.groundY - 20);
      enemy.vx = next.vx;
      enemy.vy = next.vy;
      if (distance(enemy, target) <= enemy.radius + 8) {
        target.alive = false;
        this.state.health -= enemy.damage;
        this.state.prompt = "Enemy pressure hit the squad.";
      }
      const closePikmin = this.state.squad.filter((pikmin) => pikmin.alive && distance(pikmin, enemy) <= enemy.radius + 18);
      if (closePikmin.length >= 2) enemy.health -= dt * closePikmin.length * 3;
    }
  }

  resolveFights() {
    for (const enemy of this.state.enemies) {
      if (enemy.defeated || enemy.health > 0) continue;
      enemy.defeated = true;
      this.state.score += 150;
    }
  }

  updateVictory() {
    const tasksDone = this.state.pellets.every((pellet) => pellet.delivered) && this.state.gates.every((gate) => gate.open);
    const enemiesGone = this.state.enemies.every((enemy) => enemy.defeated);
    if (tasksDone && enemiesGone) {
      this.state.phase = "win";
      this.state.overlay = "win";
      this.state.menuEyebrow = "Mission complete";
      this.state.prompt = "All goals secure.";
    }
  }

  updateFailure() {
    if (this.state.phase !== "play") return;
    if (this.state.health > 0 && this.state.time < this.world.daySeconds) return;
    this.state.phase = "lose";
    this.state.overlay = "lose";
    this.state.menuEyebrow = "Mission failed";
    this.state.prompt = "The run ended. Press Enter to restart.";
  }

  buildPrompts() {
    const activeTask = this.state.pellets.find((pellet) => !pellet.delivered) || this.state.gates.find((gate) => !gate.open) || this.state.enemies.find((enemy) => !enemy.defeated);
    return activeTask ? [activeTask.prompt || activeTask.telegraph || "Move toward the next objective."] : ["Return to base and restart."];
  }

  buildEffects() {
    return this.state.thrown.map((throwEvent) => ({
      kind: "throw",
      x: throwEvent.x,
      y: throwEvent.y,
      tx: throwEvent.tx,
      ty: throwEvent.ty,
    }));
  }
}
