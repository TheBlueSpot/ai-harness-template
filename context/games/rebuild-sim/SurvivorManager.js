const DEFAULT_NAMES = ['Ada', 'Bo', 'Cora', 'Dane', 'Eli', 'Faye', 'Gus', 'Hana'];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toInt = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
};

const createSeededRng = (seedInput) => {
  let seed = (toInt(seedInput, 1) >>> 0) || 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

export class SurvivorManager {
  constructor(config = {}) {
    this.config = {
      survivorCount: clamp(toInt(config.survivorCount, 6), 3, 10),
      seed: toInt(config.seed, 1337),
      names: Array.isArray(config.names) && config.names.length ? config.names : DEFAULT_NAMES
    };

    this.random = createSeededRng(this.config.seed);
    this.turn = 0;
    this.lastReport = null;
    this.survivors = this.createInitialSurvivors();
  }

  createInitialSurvivors() {
    this.survivors = Array.from({ length: this.config.survivorCount }, (_, index) => {
      const name = this.config.names[index % this.config.names.length] ?? `Survivor ${index + 1}`;
      const statSeed = 3 + index;
      return {
        id: `survivor-${index + 1}`,
        name,
        status: 'ready',
        assignment: null,
        stats: {
          Scavenging: clamp(statSeed + (index % 3), 2, 9),
          Defense: clamp(statSeed + ((index + 1) % 3), 2, 9),
          Engineering: clamp(statSeed + ((index + 2) % 3), 2, 9)
        },
        lastAction: null
      };
    });

    return this.getSurvivors();
  }

  getSurvivors() {
    return this.survivors.map((survivor) => deepClone(survivor));
  }

  getSurvivor(id) {
    const survivor = this.survivors.find((entry) => entry.id === id);
    return survivor ? deepClone(survivor) : null;
  }

  assignSurvivor(id, assignment) {
    const survivor = this.survivors.find((entry) => entry.id === id);
    if (!survivor || survivor.status === 'deceased') {
      return null;
    }

    const nextAssignment = typeof assignment === 'string'
      ? { tileId: assignment }
      : { ...(assignment ?? {}) };

    survivor.assignment = {
      tileId: String(nextAssignment.tileId ?? ''),
      tileLabel: String(nextAssignment.tileLabel ?? nextAssignment.tileId ?? 'Unknown Tile'),
      tileType: String(nextAssignment.tileType ?? 'unknown'),
      border: Boolean(nextAssignment.border)
    };
    survivor.status = survivor.status === 'injured' ? 'injured' : 'assigned';
    return this.getSurvivor(id);
  }

  clearAssignments() {
    for (const survivor of this.survivors) {
      survivor.assignment = null;
      if (survivor.status !== 'deceased') {
        survivor.status = survivor.status === 'injured' ? 'injured' : 'ready';
      }
    }
  }

  resolvePlanningActions(citySnapshot = {}) {
    this.turn += 1;

    const tiles = new Map((Array.isArray(citySnapshot.tiles) ? citySnapshot.tiles : []).map((tile) => [tile.id, tile]));
    const survivors = {};
    const aggregate = {
      scavenged: 0,
      repairs: 0,
      defense: 0,
      injuries: 0,
      deaths: 0,
      active: 0,
      living: this.survivors.filter((survivor) => survivor.status !== 'deceased').length
    };
    const logLines = [];

    for (const survivor of this.survivors) {
      if (survivor.status === 'deceased') {
        continue;
      }

      const tile = survivor.assignment?.tileId ? tiles.get(survivor.assignment.tileId) : null;
      if (!tile || tile.destroyed) {
        survivor.status = survivor.status === 'injured' ? 'injured' : 'ready';
        survivor.lastAction = null;
        continue;
      }

      const task = this.#taskForTile(tile);
      const statName = task === 'repair' ? 'Engineering' : task === 'defend' ? 'Defense' : 'Scavenging';
      const stat = toInt(survivor.stats[statName], 0);
      const danger = clamp(toInt(tile.dangerLevel ?? tile.danger ?? 0, 0), 0, 10);
      const weightedScore = stat + this.random() * 5.5;
      const targetScore = 2.5 + danger * 0.72;
      const success = weightedScore >= targetScore;
      const injuryRoll = this.random();
      const injuryChance = clamp((danger * 0.07) + (success ? 0.03 : 0.16), 0.02, 0.75);
      const injured = injuryRoll < injuryChance;
      const died = injured && injuryRoll > 0.93;

      const outcome = {
        scavenged: task === 'scavenge' && success ? clamp(Math.round(stat / 2), 1, 5) : 0,
        repairs: task === 'repair' && success ? clamp(Math.ceil(stat / 3), 1, 3) : 0,
        defense: task === 'defend' ? clamp(Math.round(stat / (success ? 1.6 : 3.4)), 0, 5) : 0
      };

      if (success) {
        aggregate.scavenged += outcome.scavenged;
        aggregate.repairs += outcome.repairs;
        aggregate.defense += outcome.defense;
        aggregate.active += 1;
      }

      if (injured) {
        aggregate.injuries += 1;
      }
      if (died) {
        aggregate.deaths += 1;
      }

      survivor.status = died ? 'deceased' : injured ? 'injured' : 'ready';
      survivor.lastAction = {
        turn: this.turn,
        tileId: tile.id,
        tileLabel: tile.label,
        task,
        statName,
        success,
        danger,
        weightedScore: Number(weightedScore.toFixed(2)),
        targetScore: Number(targetScore.toFixed(2)),
        injured,
        died,
        outcome
      };

      survivors[survivor.id] = {
        survivorId: survivor.id,
        name: survivor.name,
        tileId: tile.id,
        tileLabel: tile.label,
        tileType: tile.type,
        task,
        statName,
        success,
        danger,
        injured,
        died,
        outcome
      };
      logLines.push(this.#toLogLine(survivor, tile, task, success, injured, died, outcome));
    }

    const report = {
      turn: this.turn,
      survivors,
      aggregate,
      cityEffects: {
        scavenged: aggregate.scavenged,
        repairs: aggregate.repairs,
        defense: aggregate.defense,
        injuries: aggregate.injuries,
        deaths: aggregate.deaths,
        living: aggregate.living - aggregate.deaths
      },
      logLines
    };

    this.lastReport = deepClone(report);
    return report;
  }

  getRosterSummary() {
    const living = this.survivors.filter((survivor) => survivor.status !== 'deceased');
    const totals = living.reduce((sum, survivor) => {
      sum.Scavenging += survivor.stats.Scavenging;
      sum.Defense += survivor.stats.Defense;
      sum.Engineering += survivor.stats.Engineering;
      return sum;
    }, { Scavenging: 0, Defense: 0, Engineering: 0 });

    const divisor = living.length || 1;
    return {
      total: this.survivors.length,
      living: living.length,
      assigned: this.survivors.filter((survivor) => survivor.assignment && survivor.status !== 'deceased').length,
      averageStats: {
        Scavenging: Number((totals.Scavenging / divisor).toFixed(1)),
        Defense: Number((totals.Defense / divisor).toFixed(1)),
        Engineering: Number((totals.Engineering / divisor).toFixed(1))
      }
    };
  }

  getSnapshot() {
    return {
      turn: this.turn,
      survivors: this.getSurvivors(),
      roster: this.getRosterSummary(),
      lastReport: this.lastReport ? deepClone(this.lastReport) : null
    };
  }

  #taskForTile(tile) {
    if (tile.border || tile.type === 'park') {
      return 'defend';
    }
    if (tile.type === 'utility' || tile.type === 'industrial') {
      return 'repair';
    }
    return 'scavenge';
  }

  #toLogLine(survivor, tile, task, success, injured, died, outcome) {
    const verb = task === 'repair' ? 'repaired' : task === 'defend' ? 'guarded' : 'scavenged';
    const payload = [];
    if (outcome.scavenged) payload.push(`food +${outcome.scavenged}`);
    if (outcome.repairs) payload.push(`walls +${outcome.repairs}`);
    if (outcome.defense) payload.push(`defense +${outcome.defense}`);
    if (injured) payload.push('injured');
    if (died) payload.push('lost');
    return `${survivor.name} ${success ? verb : `failed to ${task}`} at ${tile.label}${payload.length ? ` (${payload.join(', ')})` : ''}.`;
  }
}
