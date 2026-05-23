export function createInput(target) {
  const keys = new Set();
  const pressed = new Set();

  target.addEventListener("keydown", (event) => {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
  });

  target.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  return {
    sample() {
      const start = pressed.has("Enter");
      const restart = pressed.has("KeyR");
      const fire = keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyJ");
      const jump = keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW");
      const left = keys.has("ArrowLeft") || keys.has("KeyA");
      const right = keys.has("ArrowRight") || keys.has("KeyD");
      const digit1 = pressed.has("Digit1");
      const digit2 = pressed.has("Digit2");
      const result = { start, restart, fire, jump, left, right, digit1, digit2 };
      pressed.clear();
      return result;
    },
  };
}
