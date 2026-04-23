export class InputController {
  constructor() {
    this.held = new Set();
    this.queue = [];
    this.bound = false;
    this.onInput = null;
  }

  bind(target = window) {
    if (this.bound) return;
    this.bound = true;
    this.target = target;
    this._down = (event) => {
      this.held.add(event.code);
      this.queue.push({ type: "down", code: event.code, timeStamp: event.timeStamp });
      this.onInput?.({ type: "down", code: event.code, timeStamp: event.timeStamp });
    };
    this._up = (event) => {
      this.held.delete(event.code);
      this.queue.push({ type: "up", code: event.code, timeStamp: event.timeStamp });
      this.onInput?.({ type: "up", code: event.code, timeStamp: event.timeStamp });
    };
    target.addEventListener("keydown", this._down);
    target.addEventListener("keyup", this._up);
  }

  unbind() {
    if (!this.bound) return;
    this.bound = false;
    this.target.removeEventListener("keydown", this._down);
    this.target.removeEventListener("keyup", this._up);
  }

  consume() {
    const events = this.queue.slice();
    this.queue.length = 0;
    return events;
  }
}
