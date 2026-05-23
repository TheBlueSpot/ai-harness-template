export class InputManager {
  constructor(target = window) {
    this.target = target;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    this._onBlur = this.clear.bind(this);
  }

  attach() {
    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("keyup", this._onKeyUp);
    this.target.addEventListener("blur", this._onBlur);
  }

  detach() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    this.target.removeEventListener("blur", this._onBlur);
  }

  onKeyDown(event) {
    if (!this.down.has(event.code)) {
      this.pressed.add(event.code);
    }
    this.down.add(event.code);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
  }

  onKeyUp(event) {
    this.down.delete(event.code);
    this.released.add(event.code);
  }

  isDown(...codes) {
    return codes.some((code) => this.down.has(code));
  }

  wasPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  wasReleased(...codes) {
    return codes.some((code) => this.released.has(code));
  }

  clear() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
