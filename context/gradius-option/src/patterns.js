import { spawnEnemy } from "./enemies.js";

export function buildStarfield(width, height, count = 72) {
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: ((i * 37) % width) / width,
      y: ((i * 91) % height) / height,
      size: 1 + (i % 3),
      color: i % 5 === 0 ? "#9cecff" : "#f5fbff",
      drift: 14 + (i % 4) * 8,
    });
  }
  return stars;
}

export function buildWave(time, width, height) {
  const lane = height * (0.22 + ((time * 0.1) % 0.4));
  const enemies = [];
  for (let i = 0; i < 4; i += 1) {
    enemies.push(spawnEnemy("drone", width + i * 130, lane + (i % 2 ? 34 : -22), { hp: 1 + (i % 2), score: 120 }));
  }
  return enemies;
}
