const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const toInt = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
};

const createSeededRng = (seedInput) => {
  let seed = (toInt(seedInput, 1) >>> 0) || 1;
  return () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 0x100000000;
  };
};

const getCityEffects = (summary = {}) => {
  const cityEffects = summary.cityEffects ?? summary.aggregate ?? summary ?? {};
  return {
    scavenged: toInt(cityEffects.scavenged, 0),
    repairs: toInt(cityEffects.repairs, 0),
    defense: toInt(cityEffects.defense, 0),
    injuries: toInt(cityEffects.injuries, 0),
    deaths: toInt(cityEffects.deaths, 0),
    living: toInt(cityEffects.living, 0)
  };
};

const weakestFirst = (a, b) => {
  if (a.wallHealth !== b.wallHealth) {
    return a.wallHealth - b.wallHealth;
  }
  return b.dangerLevel - a.dangerLevel;
};

export class EventEngine {
  constructor(config = {}) {
    this.config = {
      baseBreachChance: 0.08,
      seed: toInt(config.seed, 4242),
      ...config
    };
    this.random = createSeededRng(this.config.seed);
    this.log = [];
  }

  calculateBreachProbability(borderTile, citySnapshot = {}, survivorOutcomeSummary = {}) {
    const borderTiles = (citySnapshot.tiles ?? []).filter((tile) => tile.border && !tile.destroyed);
    const cityEffects = getCityEffects(survivorOutcomeSummary);
    const defenseShare = borderTiles.length ? cityEffects.defense / borderTiles.length : cityEffects.defense;
    const repairShare = borderTiles.length ? cityEffects.repairs / borderTiles.length : cityEffects.repairs;
    const wallWeakness = 1 - clamp((borderTile.wallHealth ?? 0) / (borderTile.maxWallHealth ?? 6), 0, 1);
    const localNoise = clamp((borderTile.noise ?? 0) / 10, 0, 1);
    const localDanger = clamp((borderTile.dangerLevel ?? 0) / 10, 0, 1);
    const defenseMitigation = clamp(defenseShare / 6.5, 0, 0.38);
    const repairMitigation = clamp(repairShare / 7, 0, 0.22);

    return clamp(
      this.config.baseBreachChance +
        wallWeakness * 0.28 +
        localNoise * 0.12 +
        localDanger * 0.14 -
        defenseMitigation -
        repairMitigation,
      0.04,
      0.82
    );
  }

  resolveNight(citySnapshot = {}, survivorOutcomeSummary = {}) {
    const cityEffects = getCityEffects(survivorOutcomeSummary);
    const borderTiles = (Array.isArray(citySnapshot.tiles) ? citySnapshot.tiles : [])
      .filter((tile) => tile.border && !tile.destroyed)
      .map((tile) => ({ ...tile }));

    const tileChanges = [];
    const breachEvents = [];
    const logLines = [];
    let repairPool = cityEffects.repairs;
    let wallDelta = 0;
    let foodDelta = cityEffects.scavenged;
    let materialsDelta = 0;
    let casualties = cityEffects.deaths;
    let moraleDelta = 0;

    const repairTargets = [...borderTiles].sort(weakestFirst);
    for (const tile of repairTargets) {
      if (repairPool <= 0) {
        break;
      }
      const repairAmount = Math.min(repairPool, Math.max(0, (tile.maxWallHealth ?? 6) - tile.wallHealth));
      if (repairAmount <= 0) {
        continue;
      }
      tile.wallHealth += repairAmount;
      repairPool -= repairAmount;
      wallDelta += repairAmount;
      materialsDelta -= repairAmount;
      tileChanges.push({
        tileId: tile.id,
        wallHealthDelta: repairAmount
      });
      logLines.push(`${tile.label} reinforced before dusk. Wall +${repairAmount}.`);
    }

    const defenseShare = borderTiles.length ? cityEffects.defense / borderTiles.length : 0;

    for (const tile of borderTiles) {
      const probability = this.calculateBreachProbability(tile, citySnapshot, survivorOutcomeSummary);
      const roll = this.random();
      const breached = roll < probability;

      if (breached) {
        const severityScore = probability + clamp((tile.noise ?? 0) / 18, 0, 0.24) - clamp(defenseShare / 9, 0, 0.22);
        const severity = severityScore >= 0.75 ? 'critical' : severityScore >= 0.48 ? 'serious' : 'minor';
        const wallDamage = severity === 'critical' ? 3 : severity === 'serious' ? 2 : 1;
        const foodLoss = severity === 'critical' ? 2 : severity === 'serious' ? 1 : 0;
        const casualtyGain = severity === 'critical' ? 1 : 0;

        wallDelta -= wallDamage;
        foodDelta -= foodLoss;
        casualties += casualtyGain;
        moraleDelta -= severity === 'critical' ? 2 : 1;

        breachEvents.push({
          tileId: tile.id,
          label: tile.label,
          severity,
          breachProbability: Number(probability.toFixed(3)),
          roll: Number(roll.toFixed(3)),
          wallDamage,
          foodLoss
        });
        tileChanges.push({
          tileId: tile.id,
          wallHealthDelta: -wallDamage,
          noiseDelta: 2,
          dangerDelta: 1,
          destroyed: tile.wallHealth - wallDamage <= 0
        });
        logLines.push(`${tile.label} suffered a ${severity} breach. Wall -${wallDamage}, food -${foodLoss}.`);
      } else {
        const calmBonus = defenseShare > 0.9 ? -1 : 0;
        tileChanges.push({
          tileId: tile.id,
          noiseDelta: calmBonus,
          dangerDelta: -1
        });
        logLines.push(`${tile.label} held against the swarm.`);
      }
    }

    materialsDelta += Math.max(0, Math.floor(cityEffects.scavenged / 3));
    const finalWalls = toInt(citySnapshot.walls, 0) + wallDelta;
    const finalFood = toInt(citySnapshot.food, 0) + foodDelta;
    const finalMaterials = toInt(citySnapshot.materials, 0) + materialsDelta;
    const finalSnapshot = {
      ...citySnapshot,
      walls: finalWalls,
      food: finalFood,
      materials: finalMaterials
    };

    const gameOverReport = this.buildGameOverReport(finalSnapshot, {
      breachEvents,
      casualties,
      wallDelta,
      foodDelta
    });

    const report = {
      type: 'night-report',
      day: toInt(citySnapshot.day, 0) + 1,
      breachEvents,
      tileChanges,
      wallDelta,
      resourceDelta: {
        food: foodDelta,
        materials: materialsDelta,
        power: 0
      },
      casualties,
      moraleDelta,
      logLines,
      summary: gameOverReport.summary ?? this.#summary(breachEvents, foodDelta, cityEffects),
      gameOver: gameOverReport.gameOver,
      gameOverReason: gameOverReport.reason,
      gameOverReport
    };

    this.log.push(...logLines);
    return report;
  }

  buildGameOverReport(finalSnapshot = {}, nightReport = {}) {
    const walls = toInt(finalSnapshot.walls, 0);
    const food = toInt(finalSnapshot.food, 0);
    const destroyedBorderTiles = (finalSnapshot.tiles ?? []).filter((tile) => tile.border && tile.destroyed).length;
    let reason = null;

    if (walls <= 0) {
      reason = 'walls-failed';
    } else if (food <= 0) {
      reason = 'food-exhausted';
    } else if (destroyedBorderTiles >= 5 && (nightReport.breachEvents ?? []).length >= 2) {
      reason = 'perimeter-collapsed';
    }

    return {
      gameOver: Boolean(reason),
      reason,
      summary: reason ? this.#gameOverSummary(reason, finalSnapshot, nightReport) : null,
      finalSnapshot,
      nightReport
    };
  }

  getLog() {
    return [...this.log];
  }

  #summary(breachEvents, foodDelta, cityEffects) {
    const foodText = foodDelta >= 0 ? `food +${foodDelta}` : `food ${foodDelta}`;
    return `${breachEvents.length} breach${breachEvents.length === 1 ? '' : 'es'}, ${foodText}, defense ${cityEffects.defense}.`;
  }

  #gameOverSummary(reason, finalSnapshot, nightReport) {
    if (reason === 'walls-failed') {
      return `Perimeter walls hit ${finalSnapshot.walls}. The city was overrun.`;
    }
    if (reason === 'food-exhausted') {
      return `Food stores hit ${finalSnapshot.food}. The settlement starved out.`;
    }
    return `Too many border sectors fell in one night. ${nightReport.casualties} casualties reported.`;
  }
}
