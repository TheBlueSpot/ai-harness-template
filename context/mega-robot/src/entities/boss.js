export function createBossEncounter() {
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
    completionEvent: null,
  };
}

export function updateBossEncounter(boss, dt, playerState) {
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
      blockedByShield: false,
    });
    boss.fireTimer = boss.phase === 2 ? 0.75 : boss.phase === 1 ? 1.0 : 1.3;
    boss.attackIntent = { type: "burst", phase: boss.phase };
  }

  if (boss.hp <= 0) {
    boss.completed = true;
    boss.completionEvent = { type: "boss-defeated" };
    events.push(boss.completionEvent);
  }

  return { shots, events };
}
