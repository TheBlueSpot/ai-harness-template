export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.map = new Map([
      ["ArrowLeft", "left"],
      ["KeyA", "left"],
      ["ArrowRight", "right"],
      ["KeyD", "right"],
      ["ArrowUp", "up"],
      ["KeyW", "up"],
      ["Space", "jump"],
      ["ShiftLeft", "dash"],
      ["ShiftRight", "dash"],
      ["Enter", "start"],
      ["KeyR", "restart"]
    ]);
    this.onKeyDown = (event) => {
      const code = this.map.get(event.code);
      if (!code) return;
      event.preventDefault();
      this.down.add(code);
      this.pressed.add(code);
    };
    this.onKeyUp = (event) => {
      const code = this.map.get(event.code);
      if (!code) return;
      event.preventDefault();
      this.down.delete(code);
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }
  isDown(code) { return this.down.has(code); }
  wasPressed(...codes) { return codes.some((code) => this.pressed.has(code)); }
  clearFrame() { this.pressed.clear(); }
  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
