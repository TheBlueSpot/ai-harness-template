const JUDGEMENT_ORDER = ["Perfect", "Great", "Poor"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class ScoreEngine {
  constructor({ perfectWindowMs = 35, greatWindowMs = 75, poorWindowMs = 140 } = {}) {
    this.windows = {
      perfect: perfectWindowMs * 1000,
      great: greatWindowMs * 1000,
      poor: poorWindowMs * 1000,
    };
    this.reset();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfect = 0;
    this.great = 0;
    this.poor = 0;
    this.miss = 0;
    this.hits = 0;
    this.totalNotes = 0;
    this.totalWeight = 0;
    this.hitWeight = 0;
  }

  registerChart(notes = []) {
    this.totalNotes = notes.length;
    this.totalWeight = notes.reduce((sum, note) => sum + (note.weight ?? 1), 0) || notes.length || 1;
  }

  judge(deltaMicros, note = {}) {
    const absDelta = Math.abs(deltaMicros);
    const weight = note.weight ?? 1;
    let judgement = "Miss";
    let comboDelta = 0;
    let scoreDelta = 0;

    if (absDelta <= this.windows.perfect) {
      judgement = "Perfect";
      comboDelta = 1;
      scoreDelta = 1000 * weight;
      this.perfect += 1;
    } else if (absDelta <= this.windows.great) {
      judgement = "Great";
      comboDelta = 1;
      scoreDelta = 650 * weight;
      this.great += 1;
    } else if (absDelta <= this.windows.poor) {
      judgement = "Poor";
      comboDelta = 0;
      scoreDelta = 250 * weight;
      this.poor += 1;
    } else {
      this.miss += 1;
      this.combo = 0;
      return { judgement: "Miss", comboDelta: -this.combo, scoreDelta: 0, hit: false, late: deltaMicros > 0 };
    }

    this.hits += 1;
    this.hitWeight += weight;
    this.score += scoreDelta;
    this.combo = comboDelta ? this.combo + comboDelta : 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    return { judgement, comboDelta, scoreDelta, hit: true, late: deltaMicros > 0 };
  }

  missNote() {
    const previousCombo = this.combo;
    this.miss += 1;
    this.combo = 0;
    return { judgement: "Miss", comboDelta: -previousCombo, scoreDelta: 0, hit: false, late: false };
  }

  getAccuracy() {
    if (!this.totalWeight) return 0;
    const weightedHits = (this.perfect * 1 + this.great * 0.75 + this.poor * 0.35);
    return clamp((weightedHits / this.totalWeight) * 100, 0, 100);
  }

  getResults(extra = {}) {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: this.getAccuracy(),
      breakdown: {
        perfect: this.perfect,
        great: this.great,
        poor: this.poor,
        miss: this.miss,
      },
      counts: {
        hit: this.hits,
        total: this.totalNotes,
      },
      ...extra,
    };
  }
}

export { JUDGEMENT_ORDER };
