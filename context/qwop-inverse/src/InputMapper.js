import { CONFIG } from "./config.js";

const DEFAULT_BINDINGS = {
  leftThigh: ["q", "a"],
  rightThigh: ["w", "s"],
  leftCalf: ["o", "k"],
  rightCalf: ["p", "l"],
  leftSole: ["z", ","],
  rightSole: ["x", "."],
};

export class InputMapper {
  constructor(bindings = null) {
    this.bindings = bindings ?? CONFIG.controlChannels ?? DEFAULT_BINDINGS;
    this.state = {
      torqueIntents: { leftThigh: 0, rightThigh: 0, leftCalf: 0, rightCalf: 0, leftSole: 0, rightSole: 0 },
      start: false,
      restart: false,
    };
    this.pendingUiAction = null;
    this._target = null;
    this._down = (event) => this.handleKey(event, true);
    this._up = (event) => this.handleKey(event, false);
  }

  attach(target = window) {
    if (this._target) this.detach();
    this._target = target;
    target.addEventListener("keydown", this._down);
    target.addEventListener("keyup", this._up);
  }

  detach() {
    if (!this._target) return;
    this._target.removeEventListener("keydown", this._down);
    this._target.removeEventListener("keyup", this._up);
    this._target = null;
  }

  handleKey(event, pressed) {
    const key = event.key.toLowerCase();
    if (key === "enter" || key === " ") {
      this.state.start = pressed;
      if (pressed) this.pendingUiAction = "start";
    }
    if (key === "r") {
      this.state.restart = pressed;
      if (pressed) this.pendingUiAction = "restart";
    }
    for (const [limb, pair] of Object.entries(this.bindings)) {
      if (pair[0] === key) this.state.torqueIntents[limb] = pressed ? 1 : 0;
      if (pair[1] === key) this.state.torqueIntents[limb] = pressed ? -1 : 0;
    }
  }

  getControlState() {
    return {
      torqueIntents: { ...this.state.torqueIntents },
      start: this.state.start,
      restart: this.state.restart,
    };
  }

  consumeUiAction() {
    const action = this.pendingUiAction;
    this.pendingUiAction = null;
    return action;
  }
}
