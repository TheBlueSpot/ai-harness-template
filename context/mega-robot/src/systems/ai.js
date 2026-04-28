export function buildAttackIntents(enemies, boss) {
  const intents = enemies.map((enemy) => enemy.attackIntent).filter(Boolean);
  if (boss?.attackIntent) intents.push({ ...boss.attackIntent, source: "boss" });
  return intents;
}
