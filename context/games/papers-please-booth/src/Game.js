import { ENTRANT_TEMPLATES, DOCUMENT_TEMPLATES } from "./data.js";
import { getRuleSetForDay } from "./rules.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDocuments(entrant, ruleSet) {
  return ruleSet.requiredDocuments.map((documentKey) => {
    const template = DOCUMENT_TEMPLATES[documentKey];
    const value = entrant.documents[documentKey] ?? "Missing";
    const valid = template.validValues.includes(value);
    return {
      id: template.id,
      kind: template.kind,
      label: template.label,
      value,
      ruleId: template.ruleId,
      status: valid ? "valid" : "invalid",
    };
  });
}

function evaluateDecision(documents, accepted) {
  const hasInvalid = documents.some((document) => document.status !== "valid");
  const shouldApprove = !hasInvalid;
  const correct = accepted ? shouldApprove : !shouldApprove;
  return { correct, shouldApprove };
}

export class Game {
  constructor() {
    this.restart();
  }

  start() {
    this.restart();
    this.mode = "playing";
  }

  restart() {
    this.day = 1;
    this.mode = "menu";
    this.score = 0;
    this.strikes = 0;
    this.queue = [];
    this.queueIndex = 0;
    this.focusIndex = 0;
    this.timeRemaining = 60;
    this.message = "Open the booth and inspect the stack.";
    this.outcome = null;
    this.activeRuleSet = getRuleSetForDay(this.day);
    this.entrant = null;
    this.documents = [];
    this._seedQueue();
    this._loadNextEntrant();
  }

  update(dt) {
    if (this.mode !== "playing") {
      return;
    }
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    if (this.timeRemaining <= 0) {
      this.mode = "fail";
      this.outcome = "time";
      this.message = "Shift failed. Time ran out.";
    }
  }

  handleAction(actionId) {
    if (actionId === "start") {
      this.start();
      return;
    }
    if (actionId === "restart") {
      this.restart();
      return;
    }
    if (this.mode !== "playing") {
      return;
    }
    if (actionId === "approve" || actionId === "reject") {
      this._resolveDecision(actionId === "approve");
      return;
    }
    if (actionId === "next") {
      this._stepFocus(1);
      return;
    }
    if (actionId === "prev") {
      this._stepFocus(-1);
    }
  }

  getFrameState() {
    return {
      mode: this.mode,
      day: this.day,
      score: this.score,
      strikes: this.strikes,
      queue: clone(this.queue),
      queueIndex: this.queueIndex,
      focusIndex: this.focusIndex,
      entrant: this.entrant ? clone(this.entrant) : null,
      documents: clone(this.documents),
      rules: clone(this.activeRuleSet.activeRules),
      message: this.message,
      outcome: this.outcome,
      timeRemaining: this.timeRemaining,
      activeRuleSet: {
        day: this.activeRuleSet.day,
        shiftLimit: this.activeRuleSet.shiftLimit,
        passingScore: this.activeRuleSet.passingScore,
        maxStrikes: this.activeRuleSet.maxStrikes,
      },
    };
  }

  _seedQueue() {
    this.queue = ENTRANT_TEMPLATES.map((entrant) => entrant.id);
    this.queueIndex = 0;
  }

  _loadNextEntrant() {
    if (this.queueIndex >= this.queue.length) {
      this._finishShift();
      return;
    }
    const entrantId = this.queue[this.queueIndex];
    this.entrant = clone(ENTRANT_TEMPLATES.find((entrant) => entrant.id === entrantId));
    this.documents = buildDocuments(this.entrant, this.activeRuleSet);
    this.focusIndex = 0;
    this.message = `Inspect ${this.entrant.name} from ${this.entrant.origin}.`;
  }

  _resolveDecision(accepted) {
    const result = evaluateDecision(this.documents, accepted);
    if (result.correct) {
      this.score += 1;
      this.message = accepted ? "Approved cleanly." : "Rejected cleanly.";
    } else {
      this.strikes += 1;
      this.message = accepted ? "Bad approval. Documents fail inspection." : "Bad rejection. Papers were valid.";
    }
    this.queueIndex += 1;
    if (this.strikes >= this.activeRuleSet.maxStrikes) {
      this.mode = "fail";
      this.outcome = "strikes";
      this.message = "Shift failed. Too many strikes.";
      return;
    }
    if (this.queueIndex >= this.activeRuleSet.shiftLimit || this.queueIndex >= this.queue.length) {
      this._finishShift();
      return;
    }
    this._loadNextEntrant();
  }

  _finishShift() {
    if (this.score >= this.activeRuleSet.passingScore) {
      this.mode = "clear";
      this.outcome = "cleared";
      this.message = "Shift clear. Booth held.";
      return;
    }
    this.mode = "fail";
    this.outcome = "underflow";
    this.message = "Shift failed. Not enough correct calls.";
  }

  _stepFocus(direction) {
    if (!this.documents.length) {
      return;
    }
    this.focusIndex = (this.focusIndex + direction + this.documents.length) % this.documents.length;
    this.message = `Focus ${this.documents[this.focusIndex].label}.`;
  }
}

