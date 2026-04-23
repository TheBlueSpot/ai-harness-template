import { HEIGHT, WIDTH } from "./config.js";

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.pointer = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      down: false,
      pressed: false,
      released: false,
    };
    this.attach();
  }

  attach() {
    const readPointer = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    };

    window.addEventListener("keydown", (event) => {
      if (!this.keysDown.has(event.code)) {
        this.keysPressed.add(event.code);
      }
      this.keysDown.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keysDown.delete(event.code);
    });

    window.addEventListener("blur", () => this.reset());

    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      const pointer = readPointer(event);
      this.pointer.x = pointer.x;
      this.pointer.y = pointer.y;
      this.pointer.down = true;
      this.pointer.pressed = true;
    });

    this.canvas.addEventListener("pointermove", (event) => {
      const pointer = readPointer(event);
      this.pointer.x = pointer.x;
      this.pointer.y = pointer.y;
    });

    const finishPointer = (event) => {
      const pointer = readPointer(event);
      this.pointer.x = pointer.x;
      this.pointer.y = pointer.y;
      this.pointer.down = false;
      this.pointer.released = true;
    };

    this.canvas.addEventListener("pointerup", finishPointer);
    this.canvas.addEventListener("pointercancel", finishPointer);
  }

  reset() {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.pointer.down = false;
    this.pointer.pressed = false;
    this.pointer.released = false;
  }

  beginFrame() {
    this.keysPressed.clear();
    this.pointer.pressed = false;
    this.pointer.released = false;
  }

  isDown(...codes) {
    return codes.some((code) => this.keysDown.has(code));
  }

  wasPressed(...codes) {
    return codes.some((code) => this.keysPressed.has(code));
  }
}
