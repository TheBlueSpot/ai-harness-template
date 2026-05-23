const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function hashInt(seed, value) {
  let hash = seed ^ value;
  hash = Math.imul(hash, FNV_PRIME);
  return hash >>> 0;
}

function seededValue(seed, x, y = 0) {
  let hash = FNV_OFFSET;
  hash = hashInt(hash, seed);
  hash = hashInt(hash, x | 0);
  hash = hashInt(hash, y | 0);
  return (hash % 10000) / 10000;
}

export function sampleThermals(seed, distance, altitude) {
  const cell = Math.floor(distance / 220);
  const thermals = [];
  for (let i = -1; i <= 3; i += 1) {
    const index = cell + i;
    const chance = seededValue(seed, index, 17);
    if (chance < 0.42) continue;
    const x = index * 220 + 110 + seededValue(seed, index, 23) * 60;
    const centerY = 140 + seededValue(seed, index, 29) * 260;
    const strength = 4.5 + seededValue(seed, index, 31) * 7.5;
    const radius = 42 + seededValue(seed, index, 37) * 58;
    thermals.push({ id: `thermal-${index}`, x, centerY, strength, radius, active: altitude > 5 });
  }
  return thermals;
}

export function sampleHazards(seed, distance) {
  const hazards = [];
  const cell = Math.floor(distance / 260);
  for (let i = 0; i < 4; i += 1) {
    const index = cell + i;
    const chance = seededValue(seed, index, 53);
    if (chance < 0.35) continue;
    hazards.push({
      id: `hazard-${index}`,
      x: index * 260 + 70 + seededValue(seed, index, 59) * 120,
      y: 220 + seededValue(seed, index, 61) * 210,
      radius: 18 + seededValue(seed, index, 67) * 18,
      kind: chance > 0.8 ? "updraft-shear" : "bird-shock",
    });
  }
  return hazards;
}

export function generateRunTarget(seed, upgrades) {
  const bonus = (upgrades.lift || 0) * 40 + (upgrades.glide || 0) * 55 + (upgrades.thermal || 0) * 30;
  const baseline = 720 + Math.floor(seededValue(seed, 1, 2) * 260);
  return Math.round(baseline + bonus);
}

export function sampleWind(seed, distance) {
  const band = Math.floor(distance / 180);
  return (seededValue(seed, band, 83) - 0.5) * 3.5;
}

