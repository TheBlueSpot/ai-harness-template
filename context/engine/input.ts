type PointerPos = { x: number; y: number };

type ActionBinding = { keys: Set<string> };

const keyAliases: Record<string, string> = {
  " ": "Space",
  Spacebar: "Space",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Esc: "Escape",
  Del: "Delete",
  Scroll: "ScrollLock",
  Apps: "ContextMenu",
  OS: "Meta",
  Win: "Meta",
  Command: "Meta",
  Cmd: "Meta",
  Ctrl: "Control",
  Enter: "Enter",
  Return: "Enter",
  Backspace: "Backspace",
  Tab: "Tab",
  Shift: "Shift",
  Alt: "Alt",
  Control: "Control",
  Meta: "Meta"
};

const keyState = new Map<string, boolean>();
const previousKeyState = new Map<string, boolean>();
const pressedKeyState = new Map<string, boolean>();
const releasedKeyState = new Map<string, boolean>();
const actionBindings = new Map<string, ActionBinding>();
const pointerState = { x: 0, y: 0, down: false, pressed: false, released: false };

let initialized = false;

function normalizeKey(key: string) {
  const trimmed = key.trim();
  if (keyAliases[trimmed]) return keyAliases[trimmed];
  if (trimmed.length === 1) return trimmed.toLowerCase();
  return trimmed;
}

function clearTransientState() {
  pressedKeyState.clear();
  releasedKeyState.clear();
  pointerState.pressed = false;
  pointerState.released = false;
}

export function updateInputFrame() {
  for (const [key, down] of keyState) previousKeyState.set(key, down);
  clearTransientState();
}

function setKey(code: string, down: boolean) {
  const normalized = normalizeKey(code);
  const wasDown = keyState.get(normalized) === true;
  keyState.set(normalized, down);
  if (down && !wasDown) pressedKeyState.set(normalized, true);
  if (!down && wasDown) releasedKeyState.set(normalized, true);
}

function updatePointer(point: PointerPos, down: boolean, pressed = false, released = false) {
  pointerState.x = point.x;
  pointerState.y = point.y;
  pointerState.down = down;
  pointerState.pressed = pressed;
  pointerState.released = released;
}

function installDomListeners() {
  if (initialized || typeof window === "undefined" || typeof document === "undefined") return;
  initialized = true;

  window.addEventListener("keydown", (event) => {
    setKey(event.code, true);
    setKey(event.key, true);
    event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    setKey(event.code, false);
    setKey(event.key, false);
    event.preventDefault();
  });

  window.addEventListener("blur", () => {
    for (const [key, down] of keyState) {
      if (down) releasedKeyState.set(key, true);
    }
    keyState.clear();
    pointerState.down = false;
    pointerState.pressed = false;
    pointerState.released = true;
  });

  document.addEventListener("pointermove", (event) => {
    updatePointer({ x: event.clientX, y: event.clientY }, pointerState.down);
  });

  document.addEventListener("pointerdown", (event) => {
    updatePointer({ x: event.clientX, y: event.clientY }, true, true, false);
  });

  document.addEventListener("pointerup", (event) => {
    updatePointer({ x: event.clientX, y: event.clientY }, false, false, true);
  });

  document.addEventListener("pointercancel", (event) => {
    updatePointer({ x: event.clientX, y: event.clientY }, false, false, true);
  });

  document.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    updatePointer({ x: touch.clientX, y: touch.clientY }, true, true, false);
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchmove", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    updatePointer({ x: touch.clientX, y: touch.clientY }, true);
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    updatePointer({ x: touch.clientX, y: touch.clientY }, false, false, true);
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchcancel", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    updatePointer({ x: touch.clientX, y: touch.clientY }, false, false, true);
    event.preventDefault();
  }, { passive: false });
}

installDomListeners();

export function isKeyDown(key: string) {
  return keyState.get(normalizeKey(key)) === true;
}

export function isKeyPressed(key: string) {
  const normalized = normalizeKey(key);
  return pressedKeyState.get(normalized) === true || (keyState.get(normalized) === true && previousKeyState.get(normalized) !== true);
}

export function isKeyReleased(key: string) {
  const normalized = normalizeKey(key);
  return releasedKeyState.get(normalized) === true || (keyState.get(normalized) !== true && previousKeyState.get(normalized) === true);
}

export function getPointerPos() {
  return { x: pointerState.x, y: pointerState.y };
}

export function isPointerDown() {
  return pointerState.down;
}

export function isPointerPressed() {
  return pointerState.pressed;
}

export function isPointerReleased() {
  return pointerState.released;
}

export function bindKey(action: string, keys: string | string[]) {
  const list = Array.isArray(keys) ? keys : [keys];
  actionBindings.set(action, { keys: new Set(list.map(normalizeKey)) });
}

export function setVirtualKeyState(code: string, down: boolean) {
  setKey(code, down);
}

export function unbindKey(action: string) {
  actionBindings.delete(action);
}

export function isActionDown(action: string) {
  const binding = actionBindings.get(action);
  return binding ? [...binding.keys].some(isKeyDown) : false;
}

export function isActionPressed(action: string) {
  const binding = actionBindings.get(action);
  return binding ? [...binding.keys].some(isKeyPressed) : false;
}

export function isActionReleased(action: string) {
  const binding = actionBindings.get(action);
  return binding ? [...binding.keys].some(isKeyReleased) : false;
}
