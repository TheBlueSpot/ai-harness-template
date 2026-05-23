import { ZOMBIE } from "../config.js";
import { updateZombies } from "../entities/zombie.js";

export function updateAI(state, dt = 0) {
  updateZombies(state, dt);
  resolveZombiePressure(state, dt);
  state.zombies = state.zombies.filter((zombie) => !zombie.dead || zombie.health > 0);
  return state.zombies;
}

export function updateThreatRouting(state) {
  return (state.zombies ?? []).map((zombie) => ({
    id: zombie.id,
    target: zombie.targetKind ?? "barricade",
  }));
}

function resolveZombiePressure(state, dt) {
  const player = state.player;
  const barricade = state.barricade;
  const liveSurvivor = state.survivors.find((survivor) => !survivor.dead) ?? null;

  for (const zombie of state.zombies) {
    if (zombie.dead || zombie.attackCooldown > 0) {
      continue;
    }

    const onPlayer = Math.hypot(zombie.x - player.x, zombie.y - player.y) <= zombie.size + player.radius + 8;
    if (onPlayer) {
      player.health = Math.max(0, player.health - zombie.damage * Math.max(0.35, dt * 3));
      zombie.attackCooldown = 0.8;
      state.message = "Zombie contact on the firing line.";
      continue;
    }

    const onBarricade = zombie.x <= barricade.x + barricade.width * 0.5 && Math.abs(zombie.y - barricade.y) <= barricade.height * 0.55;
    if (onBarricade) {
      barricade.hp = Math.max(0, barricade.hp - (ZOMBIE.contactDamage + zombie.damage) * Math.max(0.3, dt * 2.6));
      zombie.attackCooldown = 0.7;
      state.message = "The barricade is taking hits.";
      continue;
    }

    if (liveSurvivor && zombie.x < barricade.x - 40 && Math.hypot(zombie.x - liveSurvivor.x, zombie.y - liveSurvivor.y) <= 30) {
      liveSurvivor.dead = true;
      state.survivorsAlive = Math.max(0, state.survivorsAlive - 1);
      zombie.attackCooldown = 1.1;
      state.barricade.hp = Math.max(0, state.barricade.hp - ZOMBIE.breachDamage);
      state.message = "A zombie slipped through to the survivors.";
    }
  }
}
