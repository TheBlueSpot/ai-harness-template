const DEFAULT_TTL = 7;

export class CommandLog {
  constructor(limit = 6, ttl = DEFAULT_TTL) {
    this.limit = limit;
    this.ttl = ttl;
    this.entries = [];
  }

  push(text, kind = "combat", color = "#76d7ff") {
    this.entries.unshift({
      age: 0,
      color,
      kind,
      text,
      ttl: this.ttl,
    });
    if (this.entries.length > this.limit) {
      this.entries.length = this.limit;
    }
  }

  update(dt) {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      entry.age += dt;
      if (entry.age >= entry.ttl) {
        this.entries.splice(index, 1);
      }
    }
  }

  recent(limit = this.limit) {
    return this.entries.slice(0, limit);
  }

  recordTurretDeployment(remainingCharges) {
    this.push(`turret deployed - ${remainingCharges} charges left`, "deploy", "#9ef39d");
  }

  recordCombat(message, kind = "combat") {
    const color = kind === "loss" ? "#ff8f7c" : kind === "deploy" ? "#9ef39d" : "#76d7ff";
    this.push(message, kind, color);
  }

  recordSupport(message) {
    this.push(message, "support", "#9ef39d");
  }

  recordLoss(message) {
    this.push(message, "loss", "#ff8f7c");
  }
}
