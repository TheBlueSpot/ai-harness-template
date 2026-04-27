const clampInt = (value) => Math.max(0, Math.floor(Number(value) || 0));

export class EconomyManager {
  constructor() {
    this.reset();
  }

  reset({ gold = 0 } = {}) {
    this.gold = clampInt(gold);
    this.spent = 0;
    this.earned = 0;
    this.killCount = 0;
    this.currentWave = 0;
    this.finalWaveReached = 0;
    this.goldEvents = [];
    this.purchaseHistory = [];
    this.history = [];
  }

  resetRun(options = {}) {
    this.reset(options);
  }

  setWave(waveNumber) {
    const wave = Math.max(0, Math.floor(Number(waveNumber) || 0));
    this.currentWave = wave;
    this.finalWaveReached = Math.max(this.finalWaveReached, wave);
  }

  setFinalWaveReached(waveNumber) {
    this.finalWaveReached = Math.max(this.finalWaveReached, Math.floor(Number(waveNumber) || 0));
  }

  recordGoldEvent(event = {}) {
    const amount = clampInt(event.amount);
    const entry = {
      type: event.type ?? "generic",
      amount,
      sourceId: event.sourceId ?? null,
      reason: event.reason ?? event.type ?? "generic",
      wave: Math.max(0, Math.floor(Number(event.wave) || this.currentWave || 0)),
    };
    this.goldEvents.push(entry);
    this.history.push({ action: "gold", ...entry });
    if (amount > 0) {
      this.gold += amount;
      this.earned += amount;
    }
    return entry;
  }

  earn(amount, reason = "income") {
    return this.recordGoldEvent({ type: "income", amount, reason, wave: this.currentWave });
  }

  spend(amount, reason = "purchase") {
    const cost = clampInt(amount);
    if (cost <= 0 || this.gold < cost) return false;
    this.gold -= cost;
    this.spent += cost;
    const entry = { action: "spend", amount: cost, reason, wave: this.currentWave };
    this.purchaseHistory.push(entry);
    this.history.push(entry);
    return true;
  }

  canAfford(offerId, snapshot = {}) {
    const offer = snapshot.offers?.find((item) => item.id === offerId);
    if (!offer || offer.maxed) return false;
    return this.gold >= clampInt(offer.cost);
  }

  purchaseOffer(offerId, snapshot = {}) {
    const offer = snapshot.offers?.find((item) => item.id === offerId);
    if (!offer || offer.maxed) return null;
    const cost = clampInt(offer.cost);
    if (cost <= 0 || this.gold < cost) return null;
    this.gold -= cost;
    this.spent += cost;
    const entry = {
      action: "purchase",
      offerId,
      label: offer.label ?? offerId,
      cost,
      wave: this.currentWave,
    };
    this.purchaseHistory.push(entry);
    this.history.push(entry);
    return entry;
  }

  applyEnemyDeath(enemy = {}) {
    this.killCount += 1;
    return this.recordGoldEvent({
      type: "kill",
      amount: enemy.bounty ?? enemy.gold ?? 0,
      sourceId: enemy.id ?? null,
      reason: enemy.type ?? "enemy",
      wave: this.currentWave,
    });
  }

  getSnapshot() {
    return {
      gold: this.gold,
      spent: this.spent,
      earned: this.earned,
      killCount: this.killCount,
      currentWave: this.currentWave,
      finalWaveReached: this.finalWaveReached,
      goldEvents: this.goldEvents.slice(),
      purchaseHistory: this.purchaseHistory.slice(),
      history: this.history.slice(),
    };
  }
}
