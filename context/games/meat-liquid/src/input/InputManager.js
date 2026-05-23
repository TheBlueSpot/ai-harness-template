const DEFAULT_KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  jump: ["ArrowUp", "KeyW", "Space"],
  restart: ["KeyR", "Enter"],
};

function makeFrame() {
  return {
    left: false,
    right: false,
    jump: false,
    restart: false,
    moveX: 0,
    jumpPressed: false,
    jumpReleased: false,
    restartPressed: false,
  };
}

export class InputManager {
  constructor(keyMap = DEFAULT_KEYS) {
    this.keyMap = keyMap;
    this.keysDown = new Set();
    this.current = makeFrame();
    this.previous = makeFrame();
    this.handlers = null;
  }

  attach(target = window) {
    if (this.handlers || !target) return;

    const onKeyDown = (event) => {
      this.keysDown.add(event.code);
      if (this.isControlledKey(event.code)) {
        event.preventDefault();
      }
    };

    const onKeyUp = (event) => {
      this.keysDown.delete(event.code);
      if (this.isControlledKey(event.code)) {
        event.preventDefault();
      }
    };

    const onBlur = () => {
      this.keysDown.clear();
    };

    target.addEventListener("keydown", onKeyDown, { passive: false });
    target.addEventListener("keyup", onKeyUp, { passive: false });
    window.addEventListener("blur", onBlur);
    this.handlers = { target, onKeyDown, onKeyUp, onBlur };
  }

  detach() {
    if (!this.handlers) return;
    const { target, onKeyDown, onKeyUp, onBlur } = this.handlers;
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    this.handlers = null;
    this.keysDown.clear();
  }

  isControlledKey(code) {
    return Object.values(this.keyMap).some((codes) => codes.includes(code));
  }

  readKey(group) {
    return this.keyMap[group]?.some((code) => this.keysDown.has(code));
  }

  sampleFrame() {
    this.previous = this.current;
    this.current = makeFrame();
    this.current.left = this.readKey("left");
    this.current.right = this.readKey("right");
    this.current.jump = this.readKey("jump");
    this.current.restart = this.readKey("restart");
    this.current.moveX = (this.current.right ? 1 : 0) - (this.current.left ? 1 : 0);
    this.current.jumpPressed = this.current.jump && !this.previous.jump;
    this.current.jumpReleased = !this.current.jump && this.previous.jump;
    this.current.restartPressed = this.current.restart && !this.previous.restart;
    return this.current;
  }
}
