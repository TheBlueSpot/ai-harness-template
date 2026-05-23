// src/input/gamepad.ts
var GAMEPAD_AXIS_DEADZONE = 0.15;
var buttonAliases = /* @__PURE__ */ new Map([
  ["a", 0],
  ["b", 1],
  ["x", 2],
  ["y", 3],
  ["leftbumper", 4],
  ["lb", 4],
  ["rightbumper", 5],
  ["rb", 5],
  ["lefttrigger", 6],
  ["lt", 6],
  ["righttrigger", 7],
  ["rt", 7],
  ["back", 8],
  ["select", 8],
  ["share", 8],
  ["start", 9],
  ["options", 9],
  ["leftstick", 10],
  ["ls", 10],
  ["rightstick", 11],
  ["rs", 11],
  ["dpadup", 12],
  ["up", 12],
  ["dpaddown", 13],
  ["down", 13],
  ["dpadleft", 14],
  ["left", 14],
  ["dpadright", 15],
  ["right", 15],
  ["home", 16],
  ["guide", 16],
  ["ps", 16],
  ["touchpad", 17],
  ["paddle1", 20],
  ["paddle2", 21],
  ["paddle3", 22],
  ["paddle4", 23]
]);
var axisAliases = /* @__PURE__ */ new Map([
  ["leftx", 0],
  ["lx", 0],
  ["leftstickx", 0],
  ["lefty", 1],
  ["ly", 1],
  ["leftsticky", 1],
  ["rightx", 2],
  ["rx", 2],
  ["rightstickx", 2],
  ["righty", 3],
  ["ry", 3],
  ["rightsticky", 3]
]);
var currentPads = [];
var previousPads = [];
var sampled = false;
var navigatorSource = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function" ? navigator : null;
function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}
function resolveButton(button) {
  if (typeof button === "number") return button;
  return buttonAliases.get(normalizeName(button));
}
function resolveAxis(axis) {
  if (typeof axis === "number") return axis;
  return axisAliases.get(normalizeName(axis));
}
function buttonDown(pad, button) {
  const resolved = resolveButton(button);
  return resolved == null ? false : pad?.buttons[resolved]?.pressed === true;
}
function axisDown(pad, axis) {
  const resolved = resolveAxis(axis);
  if (resolved == null) return 0;
  const value = pad?.axes[resolved] ?? 0;
  return Math.abs(value) < GAMEPAD_AXIS_DEADZONE ? 0 : value;
}
function sampleGamepads() {
  previousPads = currentPads;
  if (!navigatorSource) {
    currentPads = [];
    sampled = true;
    return;
  }
  const snapshot = navigatorSource.getGamepads();
  const nextPads = [];
  for (const pad of snapshot) {
    if (!pad || !pad.connected) continue;
    nextPads[pad.index] = pad;
  }
  currentPads = nextPads;
  sampled = true;
}
function ensureSampled() {
  if (!sampled) sampleGamepads();
}
function updateGamepads() {
  sampleGamepads();
}
function getGamepads() {
  ensureSampled();
  return currentPads.filter(Boolean);
}
function getGamepad(index) {
  ensureSampled();
  return currentPads[index] ?? null;
}
function isGamepadButtonDown(button, index) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(currentPads[index] ?? null, button);
  return currentPads.some((pad) => buttonDown(pad, button));
}
function isGamepadButtonPressed(button, index) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(currentPads[index] ?? null, button) && !buttonDown(previousPads[index] ?? null, button);
  return currentPads.some((pad) => buttonDown(pad, button) && !buttonDown(previousPads[pad.index] ?? null, button));
}
function isGamepadButtonReleased(button, index) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(previousPads[index] ?? null, button) && !buttonDown(currentPads[index] ?? null, button);
  return previousPads.some((pad) => buttonDown(pad, button) && !buttonDown(currentPads[pad.index] ?? null, button));
}
function getGamepadAxis(axis, index) {
  ensureSampled();
  if (typeof index === "number") return axisDown(currentPads[index] ?? null, axis);
  for (const pad of currentPads) {
    const value = axisDown(pad, axis);
    if (value !== 0) return value;
  }
  return 0;
}

// input.ts
var keyAliases = {
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
var keyState = /* @__PURE__ */ new Map();
var previousKeyState = /* @__PURE__ */ new Map();
var pressedKeyState = /* @__PURE__ */ new Map();
var releasedKeyState = /* @__PURE__ */ new Map();
var actionBindings = /* @__PURE__ */ new Map();
var pointerState = { x: 0, y: 0, down: false, pressed: false, released: false };
var initialized = false;
function normalizeKey(key) {
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
function updateInputFrame() {
  for (const [key, down] of keyState) previousKeyState.set(key, down);
  clearTransientState();
}
function setKey(code, down) {
  const normalized = normalizeKey(code);
  const wasDown = keyState.get(normalized) === true;
  keyState.set(normalized, down);
  if (down && !wasDown) pressedKeyState.set(normalized, true);
  if (!down && wasDown) releasedKeyState.set(normalized, true);
}
function updatePointer(point, down, pressed = false, released = false) {
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
function isKeyDown(key) {
  return keyState.get(normalizeKey(key)) === true;
}
function isKeyPressed(key) {
  const normalized = normalizeKey(key);
  return pressedKeyState.get(normalized) === true || keyState.get(normalized) === true && previousKeyState.get(normalized) !== true;
}
function isKeyReleased(key) {
  const normalized = normalizeKey(key);
  return releasedKeyState.get(normalized) === true || keyState.get(normalized) !== true && previousKeyState.get(normalized) === true;
}
function getPointerPos() {
  return { x: pointerState.x, y: pointerState.y };
}
function isPointerDown() {
  return pointerState.down;
}
function isPointerPressed() {
  return pointerState.pressed;
}
function isPointerReleased() {
  return pointerState.released;
}
function bindKey(action, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  actionBindings.set(action, { keys: new Set(list.map(normalizeKey)) });
}
function setVirtualKeyState(code, down) {
  setKey(code, down);
}
function unbindKey(action) {
  actionBindings.delete(action);
}
function isActionDown(action) {
  const binding = actionBindings.get(action);
  return binding ? [...binding.keys].some(isKeyDown) : false;
}
function isActionPressed(action) {
  const binding = actionBindings.get(action);
  return binding ? [...binding.keys].some(isKeyPressed) : false;
}
function isActionReleased(action) {
  const binding = actionBindings.get(action);
  return binding ? [...binding.keys].some(isKeyReleased) : false;
}

// src/runtime/loop.ts
function createFixedStepLoop({
  step = 1 / 60,
  maxFrame = 0.05,
  update,
  render,
  now = () => performance.now()
}) {
  let running = false;
  let last = now();
  let accumulator = 0;
  let frameId = 0;
  function frame(time) {
    if (!running) return;
    const delta = Math.min(maxFrame, (time - last) / 1e3);
    last = time;
    accumulator += delta;
    while (accumulator >= step) {
      updateGamepads();
      update(step);
      updateInputFrame();
      accumulator -= step;
    }
    render(accumulator / step);
    frameId = requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    last = now();
    accumulator = 0;
    frameId = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
    accumulator = 0;
  }
  return {
    start,
    resume: start,
    stop,
    pause: stop,
    isRunning() {
      return running;
    }
  };
}

// src/runtime/object-pool.ts
function createObjectPool({ create, reset, capacity = 256 }) {
  const free = [];
  let created = 0;
  function acquire() {
    const item = free.pop();
    if (item) return item;
    created += 1;
    return create();
  }
  function release(item) {
    reset(item);
    if (free.length < capacity) free.push(item);
  }
  return {
    acquire,
    release,
    preload(count = capacity) {
      while (free.length < count && free.length < capacity) {
        free.push(create());
        created += 1;
      }
    },
    freeCount() {
      return free.length;
    },
    createdCount() {
      return created;
    }
  };
}

// src/runtime/stage.ts
function createStage({ updateEntity, renderEntity } = {}) {
  const entities = [];
  let nextOrder = 1;
  let renderOrderDirty = false;
  function sortForRender() {
    if (!renderOrderDirty) return;
    entities.sort((a, b) => {
      const layerDelta = (a.layer || 0) - (b.layer || 0);
      if (layerDelta !== 0) return layerDelta;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    renderOrderDirty = false;
  }
  function spawn(entity, options = {}) {
    entity.active = options.active ?? entity.active ?? true;
    entity.layer = options.layer ?? entity.layer ?? 0;
    entity.order = nextOrder;
    nextOrder += 1;
    entities.push(entity);
    renderOrderDirty = true;
    return entity;
  }
  function remove(entity) {
    const index = entities.indexOf(entity);
    if (index === -1) return false;
    entities.splice(index, 1);
    return true;
  }
  function setLayer(entity, layer) {
    if (entity.layer === layer) return;
    entity.layer = layer;
    renderOrderDirty = true;
  }
  function update(delta) {
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      if (entity.active === false) continue;
      if (entity.update) {
        entity.update(entity, delta);
      } else if (updateEntity) {
        updateEntity(entity, delta);
      }
    }
  }
  function render(target, alpha = 1) {
    sortForRender();
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      if (entity.active === false || entity.visible === false) continue;
      if (entity.render) {
        entity.render(entity, target, alpha);
      } else if (renderEntity) {
        renderEntity(entity, target, alpha);
      }
    }
  }
  return {
    spawn,
    remove,
    setLayer,
    update,
    render,
    clear() {
      entities.length = 0;
      nextOrder = 1;
      renderOrderDirty = false;
    },
    entities() {
      return entities;
    },
    count() {
      return entities.length;
    }
  };
}

// src/input/keyboard.ts
var activeKeyboardStates = /* @__PURE__ */ new Set();
function createKeyboardState(bindings = {}) {
  const held = {};
  const pressed = {};
  const released = {};
  function set(code, isDown) {
    const action = bindings[code];
    if (!action) return false;
    const wasHeld = held[action] === true;
    held[action] = isDown;
    if (isDown && !wasHeld) pressed[action] = true;
    if (!isDown && wasHeld) released[action] = true;
    return true;
  }
  const state = {
    set,
    bind(code, action) {
      bindings[code] = action;
    },
    down(action) {
      return held[action] === true;
    },
    held(action) {
      return held[action] === true;
    },
    pressed(action) {
      return pressed[action] === true;
    },
    released(action) {
      return released[action] === true;
    },
    consume(action) {
      const wasDown = pressed[action] === true;
      pressed[action] = false;
      return wasDown;
    },
    consumeRelease(action) {
      const wasReleased = released[action] === true;
      released[action] = false;
      return wasReleased;
    },
    update() {
      for (const action of Object.keys(pressed)) pressed[action] = false;
      for (const action of Object.keys(released)) released[action] = false;
    },
    state(action) {
      return {
        down: held[action] === true,
        held: held[action] === true,
        pressed: pressed[action] === true,
        released: released[action] === true
      };
    },
    dispose() {
      activeKeyboardStates.delete(state);
    }
  };
  activeKeyboardStates.add(state);
  return state;
}
function createKeyboardActions(bindings, target = window) {
  const state = createKeyboardState(bindings);
  function onKeyDown(event) {
    const keyboardEvent = event;
    if (typeof keyboardEvent.code !== "string") return;
    if (state.set(keyboardEvent.code, true)) event.preventDefault();
  }
  function onKeyUp(event) {
    const keyboardEvent = event;
    if (typeof keyboardEvent.code !== "string") return;
    if (state.set(keyboardEvent.code, false)) event.preventDefault();
  }
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  return {
    ...state,
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      state.dispose();
    }
  };
}

// src/onScreenGamepad.ts
var DEFAULT_MAPPING = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Space: "jump",
  KeyZ: "action",
  KeyX: "action2"
};
var DEFAULT_BUTTONS = ["jump", "action", "action2"];
var styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-onscreen-gamepad", "true");
  style.textContent = `
    .codex-gamepad {
      position: fixed;
      inset: auto 0 0 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1rem;
      padding: 1rem;
      pointer-events: none;
      z-index: 2147483647;
      touch-action: none;
      user-select: none;
    }
    .codex-gamepad[hidden] { display: none; }
    .codex-gamepad__cluster {
      display: grid;
      gap: 0.5rem;
      pointer-events: auto;
    }
    .codex-gamepad__dpad {
      grid-template-columns: repeat(3, 3rem);
      grid-template-rows: repeat(3, 3rem);
    }
    .codex-gamepad__buttons {
      grid-auto-flow: column;
      grid-auto-columns: 3.5rem;
      align-items: end;
    }
    .codex-gamepad__key {
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 999px;
      background: rgba(18, 18, 22, 0.72);
      color: #fff;
      font: 600 0.72rem/1 system-ui, sans-serif;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      min-width: 3rem;
      min-height: 3rem;
      display: grid;
      place-items: center;
      -webkit-tap-highlight-color: transparent;
    }
    .codex-gamepad__key:active,
    .codex-gamepad__key.is-down {
      background: rgba(255,255,255,0.18);
      transform: translateY(1px);
    }
    .codex-gamepad__spacer { visibility: hidden; }
  `;
  document.head.appendChild(style);
}
function createButton(label, code) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "codex-gamepad__key";
  button.textContent = label;
  button.dataset.code = code;
  button.dataset.action = code;
  const activePointers = /* @__PURE__ */ new Set();
  const down = (pointerId) => {
    activePointers.add(pointerId);
    setVirtualKeyState(code, true);
    button.classList.add("is-down");
  };
  const up = (pointerId) => {
    activePointers.delete(pointerId);
    if (activePointers.size === 0) {
      setVirtualKeyState(code, false);
      button.classList.remove("is-down");
    }
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    down(event.pointerId);
  });
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    up(event.pointerId);
  });
  button.addEventListener("pointercancel", (event) => {
    event.preventDefault();
    up(event.pointerId);
  });
  button.addEventListener("lostpointercapture", (event) => {
    up(event.pointerId);
  });
  return { button, down, up };
}
function createOnScreenGamepad(options = {}) {
  injectStyles();
  const container = options.container ?? document.body;
  const root = document.createElement("div");
  root.className = "codex-gamepad";
  root.hidden = options.visible === false;
  const controls = [];
  const mapping = { ...DEFAULT_MAPPING, ...options.mapping ?? {} };
  for (const [code, action] of Object.entries(mapping)) bindKey(action, code);
  const dpad = document.createElement("div");
  dpad.className = "codex-gamepad__cluster codex-gamepad__dpad";
  const dpadLayout = [null, { code: "ArrowUp", label: "Up" }, null, { code: "ArrowLeft", label: "Left" }, { code: "ArrowDown", label: "Down" }, { code: "ArrowRight", label: "Right" }, null, null, null];
  for (const spec of dpadLayout) {
    if (!spec) {
      const spacer = document.createElement("span");
      spacer.className = "codex-gamepad__key codex-gamepad__spacer";
      dpad.appendChild(spacer);
      continue;
    }
    const control = createButton(spec.label, spec.code);
    dpad.appendChild(control.button);
    controls.push(control);
  }
  const buttons = document.createElement("div");
  buttons.className = "codex-gamepad__cluster codex-gamepad__buttons";
  const labels = options.buttons ?? DEFAULT_BUTTONS;
  const mappings = labels.map((label, index) => {
    const code = index === 0 ? "Space" : index === 1 ? "KeyZ" : `Key${String.fromCharCode(88 + index - 2)}`;
    return { code, label };
  });
  for (const spec of mappings) {
    const control = createButton(spec.label, spec.code);
    buttons.appendChild(control.button);
    controls.push(control);
  }
  root.append(dpad, buttons);
  container.appendChild(root);
  function show() {
    root.hidden = false;
  }
  function hide() {
    root.hidden = true;
  }
  function destroy() {
    for (const control of controls) {
      control.button.remove();
    }
    root.remove();
  }
  function setButtonMapping(mapping2) {
    for (const [code, action] of Object.entries(mapping2)) bindKey(action, code);
  }
  return { destroy, show, hide, setButtonMapping };
}

// src/input/pointer.ts
function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width || canvas.width || 1);
  const scaleY = canvas.height / (rect.height || canvas.height || 1);
  return {
    x: ((event.clientX ?? 0) - rect.left) * scaleX,
    y: ((event.clientY ?? 0) - rect.top) * scaleY
  };
}
function eventTouches(event) {
  return event.changedTouches ? Array.from(event.changedTouches) : [];
}
function createPointerInput(canvas, options = {}) {
  const listeners = /* @__PURE__ */ new Map();
  const pointers = /* @__PURE__ */ new Map();
  let primary = null;
  function emit(type, pointer) {
    const handlers = listeners.get(type);
    if (!handlers) return;
    for (const handler of handlers) handler(pointer);
  }
  function snapshot(source, id, pointerType, point, changes = {}) {
    const world = options.toWorld ? options.toWorld(point) : point;
    const next = {
      id,
      type: pointerType,
      x: point.x,
      y: point.y,
      worldX: world.x,
      worldY: world.y,
      down: false,
      pressed: false,
      released: false,
      moved: false,
      source,
      ...changes
    };
    pointers.set(id, next);
    primary = next;
    return next;
  }
  function mouse(event, type, changes = {}) {
    const pointer = snapshot(event, 1, "mouse", canvasPoint(canvas, event), changes);
    emit(type, pointer);
    event.preventDefault();
  }
  function touch(event, type, changes = {}) {
    for (const changed of eventTouches(event)) {
      const pointer = snapshot(event, changed.identifier, "touch", canvasPoint(canvas, changed), changes);
      emit(type, pointer);
    }
    event.preventDefault();
  }
  function onMouseDown(event) {
    mouse(event, "down", { down: true, pressed: true });
  }
  function onMouseMove(event) {
    mouse(event, "move", { down: (event.buttons ?? 0) > 0, moved: true });
  }
  function onMouseUp(event) {
    mouse(event, "up", { released: true });
  }
  function onMouseLeave(event) {
    mouse(event, "leave", { released: primary?.down === true });
  }
  function onTouchStart(event) {
    touch(event, "down", { down: true, pressed: true });
  }
  function onTouchMove(event) {
    touch(event, "move", { down: true, moved: true });
  }
  function onTouchEnd(event) {
    touch(event, "up", { released: true });
  }
  function onTouchCancel(event) {
    touch(event, "cancel", { released: true });
  }
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchCancel, { passive: false });
  return {
    on(type, handler) {
      if (!listeners.has(type)) listeners.set(type, /* @__PURE__ */ new Set());
      listeners.get(type)?.add(handler);
      return () => listeners.get(type)?.delete(handler);
    },
    pointer(id = primary?.id ?? 1) {
      return pointers.get(id) ?? null;
    },
    primary() {
      return primary;
    },
    update() {
      for (const pointer of pointers.values()) {
        pointer.pressed = false;
        pointer.released = false;
        pointer.moved = false;
      }
    },
    dispose() {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchCancel);
    }
  };
}

// src/input/delegation.ts
function defaultHitTest(object, x, y) {
  if (object.active === false || object.visible === false) return false;
  if (object.containsPoint) return object.containsPoint(x, y);
  const radius = object.r ?? object.radius;
  if (radius !== void 0) {
    const dx = x - (object.x ?? 0);
    const dy = y - (object.y ?? 0);
    return dx * dx + dy * dy <= radius * radius;
  }
  const width = object.w ?? object.width ?? 0;
  const height = object.h ?? object.height ?? 0;
  return x >= (object.x ?? 0) && x <= (object.x ?? 0) + width && y >= (object.y ?? 0) && y <= (object.y ?? 0) + height;
}
function createCanvasObjectEvents(canvas, objects, options = {}) {
  const pointer = createPointerInput(canvas, { toWorld: options.toWorld });
  const listeners = /* @__PURE__ */ new Map();
  let hoverTarget = null;
  function list() {
    return typeof objects === "function" ? objects() : objects;
  }
  function hit(x, y) {
    const candidates = list();
    let top = null;
    let topLayer = -Infinity;
    let topIndex = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      const object = candidates[i];
      const isHit = options.hitTest ? options.hitTest(object, x, y) : defaultHitTest(object, x, y);
      const layer = object.layer ?? 0;
      if (isHit && (layer > topLayer || layer === topLayer && i > topIndex)) {
        top = object;
        topLayer = layer;
        topIndex = i;
      }
    }
    return top;
  }
  function emit(object, type, event) {
    if (!object) return;
    const handlers = listeners.get(object)?.get(type);
    if (!handlers) return;
    for (const handler of handlers) handler(event);
  }
  pointer.on("down", (event) => emit(hit(event.worldX, event.worldY), "down", event));
  pointer.on("up", (event) => emit(hit(event.worldX, event.worldY), "click", event));
  pointer.on("move", (event) => {
    const next = hit(event.worldX, event.worldY);
    if (next !== hoverTarget) {
      emit(hoverTarget, "leave", event);
      emit(next, "enter", event);
      hoverTarget = next;
    }
    emit(next, "hover", event);
  });
  pointer.on("leave", (event) => {
    emit(hoverTarget, "leave", event);
    hoverTarget = null;
  });
  return {
    on(object, type, handler) {
      if (!listeners.has(object)) listeners.set(object, /* @__PURE__ */ new Map());
      const objectListeners = listeners.get(object);
      if (!objectListeners?.has(type)) objectListeners?.set(type, /* @__PURE__ */ new Set());
      objectListeners?.get(type)?.add(handler);
      return () => objectListeners?.get(type)?.delete(handler);
    },
    hit,
    pointer,
    dispose() {
      pointer.dispose();
      listeners.clear();
      hoverTarget = null;
    }
  };
}

// src/math/collision.ts
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function testOverlapRect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function testOverlapCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const radius = ar + br;
  return dx * dx + dy * dy <= radius * radius;
}
function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}
function circleRectOverlap(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
}
function vecDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
function vecAngle(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}
function vecNormalize(x, y, out = { x: 0, y: 0 }) {
  const length = Math.hypot(x, y);
  if (length === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = x / length;
  out.y = y / length;
  return out;
}
function rayIntersectRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  if (dx === 0) {
    if (x1 < rx || x1 > rx + rw) return false;
  } else {
    const tx1 = (rx - x1) / dx;
    const tx2 = (rx + rw - x1) / dx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }
  if (dy === 0) {
    if (y1 < ry || y1 > ry + rh) return false;
  } else {
    const ty1 = (ry - y1) / dy;
    const ty2 = (ry + rh - y1) / dy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }
  return tMin <= tMax;
}
function rayIntersectMap(x1, y1, x2, y2, boxes) {
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    if (Array.isArray(box)) {
      if (rayIntersectRect(x1, y1, x2, y2, box[0], box[1], box[2], box[3])) return true;
    } else {
      const rect = box;
      if (rayIntersectRect(x1, y1, x2, y2, rect.x, rect.y, rect.w, rect.h)) {
        return true;
      }
    }
  }
  return false;
}

// src/math/grid.ts
function gridKey(cell) {
  return `${cell.x},${cell.y}`;
}
function inBounds(cell, width, height) {
  return cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height;
}
function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}
function opposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

// src/wasm/collision-kernel.ts
function isCircleRectExport(value) {
  return typeof value === "function";
}
function testCircleRectOverlap(cx, cy, radius, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(rx + rw, cx));
  const closestY = Math.max(ry, Math.min(ry + rh, cy));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}
function resolveCollisionKernelWasmUrl(options = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const base = String(baseUrl);
  const relativePath = base.includes("/src/wasm/") || base.includes("\\src\\wasm\\") ? "../../wasm/collision-kernel.wasm" : "../wasm/collision-kernel.wasm";
  return new URL(relativePath, baseUrl).href;
}
function normalizeCollisionKernelOptions(input = {}) {
  if (typeof input === "string") {
    return { url: input };
  }
  return { url: input.url ?? resolveCollisionKernelWasmUrl(), onFallback: input.onFallback };
}
async function createCollisionKernel(options = {}) {
  const { url, onFallback } = normalizeCollisionKernelOptions(options);
  try {
    const response = await fetch(url);
    let exports;
    try {
      const instance = typeof WebAssembly.instantiateStreaming === "function" && response.headers.get("content-type") === "application/wasm" ? await WebAssembly.instantiateStreaming(Promise.resolve(response), {}) : await WebAssembly.instantiate(await response.arrayBuffer(), {});
      exports = instance.instance.exports;
    } catch (error) {
      onFallback?.({ reason: "instantiate", url, error });
      return createTypescriptCollisionKernel();
    }
    const circleRect = exports.circle_rect_overlap;
    if (isCircleRectExport(circleRect)) {
      return {
        backend: "wasm",
        testOverlapRect,
        testOverlapCircle,
        pointInRect,
        circleRectOverlap(circle, rect) {
          return Boolean(circleRect(circle.x, circle.y, circle.r, rect.x, rect.y, rect.w, rect.h));
        },
        testCircleRectOverlap(cx, cy, radius, rx, ry, rw, rh) {
          return Boolean(circleRect(cx, cy, radius, rx, ry, rw, rh));
        },
        vecDistance,
        vecAngle,
        vecNormalize,
        rayIntersectMap
      };
    }
    onFallback?.({ reason: "missing-export", url });
  } catch (error) {
    onFallback?.({ reason: "fetch", url, error });
  }
  return createTypescriptCollisionKernel();
}
function createTypescriptCollisionKernel() {
  return {
    backend: "typescript",
    testOverlapRect,
    testOverlapCircle,
    pointInRect,
    circleRectOverlap,
    testCircleRectOverlap,
    vecDistance,
    vecAngle,
    vecNormalize,
    rayIntersectMap
  };
}

// src/canvas/camera.ts
function lerp(from, to, amount) {
  return from + (to - from) * amount;
}
function targetCenter(target) {
  return {
    x: target.x + (target.w ?? target.width ?? 0) * 0.5,
    y: target.y + (target.h ?? target.height ?? 0) * 0.5
  };
}
function createCamera(options) {
  let viewportWidth = options.viewportWidth;
  let viewportHeight = options.viewportHeight;
  let x = options.x ?? 0;
  let y = options.y ?? 0;
  let zoom = options.zoom ?? 1;
  let minZoom = options.minZoom ?? 0.25;
  let maxZoom = options.maxZoom ?? 4;
  let bounds = options.bounds ?? null;
  let followTarget = options.follow ?? null;
  let deadzoneX = options.deadzoneX ?? 0;
  let deadzoneY = options.deadzoneY ?? 0;
  let smoothing = options.smoothing ?? 1;
  function visibleWidth() {
    return viewportWidth / zoom;
  }
  function visibleHeight() {
    return viewportHeight / zoom;
  }
  function constrain() {
    zoom = clamp(zoom, minZoom, maxZoom);
    if (!bounds) return;
    const width = visibleWidth();
    const height = visibleHeight();
    if (width >= bounds.w) {
      x = bounds.x + (bounds.w - width) * 0.5;
    } else {
      x = clamp(x, bounds.x, bounds.x + bounds.w - width);
    }
    if (height >= bounds.h) {
      y = bounds.y + (bounds.h - height) * 0.5;
    } else {
      y = clamp(y, bounds.y, bounds.y + bounds.h - height);
    }
  }
  function moveToward(targetX, targetY, amount = smoothing) {
    const t = clamp(amount, 0, 1);
    x = lerp(x, targetX, t);
    y = lerp(y, targetY, t);
    constrain();
  }
  function centerOn(point, amount = 1) {
    moveToward(point.x - visibleWidth() * 0.5, point.y - visibleHeight() * 0.5, amount);
  }
  function update() {
    if (!followTarget) {
      constrain();
      return;
    }
    const center = targetCenter(followTarget);
    const left = x + deadzoneX;
    const right = x + visibleWidth() - deadzoneX;
    const top = y + deadzoneY;
    const bottom = y + visibleHeight() - deadzoneY;
    let targetX = x;
    let targetY = y;
    if (center.x < left) targetX = center.x - deadzoneX;
    if (center.x > right) targetX = center.x + deadzoneX - visibleWidth();
    if (center.y < top) targetY = center.y - deadzoneY;
    if (center.y > bottom) targetY = center.y + deadzoneY - visibleHeight();
    moveToward(targetX, targetY);
  }
  constrain();
  return {
    pan(dx, dy) {
      x += dx;
      y += dy;
      constrain();
      return this;
    },
    centerOn(point, amount = 1) {
      centerOn(point, amount);
      return this;
    },
    follow(target, followOptions = {}) {
      followTarget = target;
      deadzoneX = followOptions.deadzoneX ?? deadzoneX;
      deadzoneY = followOptions.deadzoneY ?? deadzoneY;
      smoothing = followOptions.smoothing ?? smoothing;
      return this;
    },
    clearFollow() {
      followTarget = null;
      return this;
    },
    update,
    zoomTo(value, anchor = { x: viewportWidth * 0.5, y: viewportHeight * 0.5 }) {
      const worldAnchor = this.screenToWorld(anchor);
      zoom = clamp(value, minZoom, maxZoom);
      x = worldAnchor.x - anchor.x / zoom;
      y = worldAnchor.y - anchor.y / zoom;
      constrain();
      return this;
    },
    zoomBy(factor, anchor) {
      return this.zoomTo(zoom * factor, anchor);
    },
    setViewport(width, height) {
      viewportWidth = width;
      viewportHeight = height;
      constrain();
      return this;
    },
    setBounds(nextBounds) {
      bounds = nextBounds;
      constrain();
      return this;
    },
    worldToScreen(point) {
      return { x: (point.x - x) * zoom, y: (point.y - y) * zoom };
    },
    screenToWorld(point) {
      return { x: x + point.x / zoom, y: y + point.y / zoom };
    },
    visibleRect() {
      return { x, y, w: visibleWidth(), h: visibleHeight() };
    },
    apply(ctx, render) {
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-x, -y);
      render();
      ctx.restore();
    },
    state() {
      return { x, y, zoom, viewportWidth, viewportHeight, bounds, follow: followTarget };
    }
  };
}

// src/canvas/bootstrap.ts
function resolveParent(parent) {
  if (!parent) return document.body;
  if (typeof parent === "string") {
    const target = document.querySelector(parent);
    if (!target) throw new Error(`Canvas parent not found: ${parent}`);
    return target;
  }
  return parent;
}
function viewportOf(parent) {
  if (parent === document.body || parent === document.documentElement) {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  const rect = parent.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  };
}
function acquireContext(canvas, type) {
  const context = canvas.getContext(type);
  if (!context) throw new Error(`Unable to acquire ${type} canvas context`);
  return context;
}
function setGlobalTimes(deltaTime, elapsedTime) {
  const target = globalThis;
  target.deltaTime = deltaTime;
  target.elapsedTime = elapsedTime;
}
function init(options = {}) {
  const logicalWidth = options.width ?? 960;
  const logicalHeight = options.height ?? 540;
  const contextType = options.context ?? "2d";
  const scaleMode = options.scaleMode ?? "letterbox";
  const autoStart = options.autoStart ?? true;
  const maxDelta = options.maxDelta ?? 0.05;
  const exposeGlobals = options.globals ?? true;
  const parent = resolveParent(options.parent);
  const canvas = options.canvas ?? document.createElement("canvas");
  const context = acquireContext(canvas, contextType);
  let dpr = 1;
  let deltaTime = 0;
  let elapsedTime = 0;
  let lastTime = 0;
  let frameId = 0;
  let running = false;
  if (!canvas.parentElement) parent.appendChild(canvas);
  if (options.background) canvas.style.background = options.background;
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const viewport = viewportOf(parent);
    canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
    canvas.height = Math.max(1, Math.round(logicalHeight * dpr));
    if (scaleMode === "stretch" || scaleMode === "fit") {
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
    } else {
      const scale = Math.min(viewport.width / logicalWidth, viewport.height / logicalHeight);
      canvas.style.width = `${Math.max(1, Math.floor(logicalWidth * scale))}px`;
      canvas.style.height = `${Math.max(1, Math.floor(logicalHeight * scale))}px`;
      canvas.style.margin = "auto";
    }
    if (contextType === "2d") {
      const ctx = context;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  function frame(time) {
    if (!running) return;
    const rawDelta = lastTime ? (time - lastTime) / 1e3 : 0;
    lastTime = time;
    deltaTime = Math.min(maxDelta, Math.max(0, rawDelta));
    elapsedTime += deltaTime;
    if (exposeGlobals) setGlobalTimes(deltaTime, elapsedTime);
    options.update?.(deltaTime, elapsedTime);
    options.render?.(deltaTime, elapsedTime);
    frameId = requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    frameId = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
  function destroy() {
    stop();
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("contextmenu", preventContextMenu);
  }
  function preventContextMenu(event) {
    event.preventDefault();
  }
  if (options.silenceContextMenu ?? true) {
    canvas.addEventListener("contextmenu", preventContextMenu);
  }
  window.addEventListener("resize", resize);
  resize();
  if (exposeGlobals) setGlobalTimes(deltaTime, elapsedTime);
  if (autoStart) start();
  return {
    canvas,
    context,
    ctx: context,
    contextType,
    width: logicalWidth,
    height: logicalHeight,
    resize,
    start,
    stop,
    pause: stop,
    resume: start,
    destroy,
    isRunning() {
      return running;
    },
    get deltaTime() {
      return deltaTime;
    },
    get elapsedTime() {
      return elapsedTime;
    },
    get devicePixelRatio() {
      return dpr;
    }
  };
}

// src/canvas/drawing.ts
var spriteAssets = /* @__PURE__ */ new Map();
var transformDepth = /* @__PURE__ */ new WeakMap();
var activeContext;
function getDrawContext(options) {
  const ctx = options?.ctx ?? options?.context ?? activeContext;
  if (!ctx) throw new Error("No canvas context available. Pass { ctx } or call setDrawContext(ctx).");
  return ctx;
}
function sourceSize(image) {
  if ("naturalWidth" in image && image.naturalWidth) return { width: image.naturalWidth, height: image.naturalHeight };
  if ("videoWidth" in image && image.videoWidth) return { width: image.videoWidth, height: image.videoHeight };
  if ("width" in image && "height" in image) return { width: Number(image.width) || 0, height: Number(image.height) || 0 };
  return { width: 0, height: 0 };
}
function anchorOffset(anchor, width, height) {
  if (!anchor) return { x: 0, y: 0 };
  if (typeof anchor === "object") return { x: (anchor.x ?? 0) * width, y: (anchor.y ?? 0) * height };
  const x = anchor.includes("right") ? width : anchor === "top" || anchor === "center" || anchor === "bottom" ? width / 2 : 0;
  const y = anchor.includes("bottom") ? height : anchor === "left" || anchor === "center" || anchor === "right" ? height / 2 : 0;
  return { x, y };
}
function scaleParts(scale) {
  if (typeof scale === "number") return { x: scale, y: scale };
  return { x: scale?.x ?? 1, y: scale?.y ?? 1 };
}
function withState(ctx, alpha, draw) {
  ctx.save();
  if (alpha !== void 0) ctx.globalAlpha *= alpha;
  draw();
  ctx.restore();
}
function setDrawContext(ctx) {
  activeContext = ctx;
}
function registerSprite(id, image) {
  spriteAssets.set(id, "image" in image ? image : { image });
}
function unregisterSprite(id) {
  spriteAssets.delete(id);
}
function getSprite(id) {
  return spriteAssets.get(id);
}
function drawSprite(id, x, y, options = {}) {
  const asset = spriteAssets.get(id);
  if (!asset) throw new Error(`Sprite not registered: ${id}`);
  const ctx = getDrawContext(options);
  const size = sourceSize(asset.image);
  const sx = options.sourceX ?? 0;
  const sy = options.sourceY ?? 0;
  const sw = options.sourceWidth ?? asset.width ?? size.width;
  const sh = options.sourceHeight ?? asset.height ?? size.height;
  const dw = options.width ?? sw;
  const dh = options.height ?? sh;
  const anchor = anchorOffset(options.anchor, dw, dh);
  const scale = scaleParts(options.scale);
  withState(ctx, options.alpha, () => {
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    ctx.scale((options.flipX ? -1 : 1) * scale.x, (options.flipY ? -1 : 1) * scale.y);
    ctx.drawImage(asset.image, sx, sy, sw, sh, -anchor.x, -anchor.y, dw, dh);
  });
}
function drawSpriteSlice(id, x, y, frameIndex, options) {
  const asset = spriteAssets.get(id);
  if (!asset) throw new Error(`Sprite not registered: ${id}`);
  const size = sourceSize(asset.image);
  const columns = options.columns ?? Math.max(1, Math.floor(size.width / options.frameWidth));
  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const frameX = frameIndex % columns;
  const frameY = Math.floor(frameIndex / columns);
  drawSprite(id, x, y, {
    ...options,
    sourceX: options.sourceX ?? margin + frameX * (options.frameWidth + spacing),
    sourceY: options.sourceY ?? margin + frameY * (options.frameHeight + spacing),
    sourceWidth: options.sourceWidth ?? options.frameWidth,
    sourceHeight: options.sourceHeight ?? options.frameHeight,
    width: options.width ?? options.frameWidth,
    height: options.height ?? options.frameHeight
  });
}
function drawRect(x, y, width, height, options = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    if (options.fill) {
      ctx.fillStyle = options.fill;
      ctx.fillRect(x, y, width, height);
    }
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      ctx.lineWidth = options.lineWidth ?? 1;
      ctx.strokeRect(x, y, width, height);
    }
  });
}
function drawCircle(x, y, radius, options = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    fillStroke(ctx, options);
  });
}
function drawLine(x1, y1, x2, y2, options = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.lineCap = options.cap ?? ctx.lineCap;
    ctx.lineJoin = options.join ?? ctx.lineJoin;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = options.stroke ?? "#fff";
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.stroke();
  });
}
function drawPolygon(points, options = {}) {
  if (points.length < 2) return;
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    fillStroke(ctx, options);
  });
}
function fillStroke(ctx, options) {
  if (options.fill) {
    ctx.fillStyle = options.fill;
    ctx.fill();
  }
  if (options.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.stroke();
  }
}
function pushTransform(options = {}) {
  const ctx = getDrawContext(options);
  ctx.save();
  transformDepth.set(ctx, (transformDepth.get(ctx) ?? 0) + 1);
  if (options.alpha !== void 0) ctx.globalAlpha *= options.alpha;
  ctx.translate(options.x ?? options.translateX ?? 0, options.y ?? options.translateY ?? 0);
  if (options.rotation) ctx.rotate(options.rotation);
  const scale = scaleParts(options.scale);
  ctx.scale(scale.x, scale.y);
}
function popTransform(options = {}) {
  const ctx = getDrawContext(options);
  const depth = transformDepth.get(ctx) ?? 0;
  if (depth <= 0) return false;
  ctx.restore();
  transformDepth.set(ctx, depth - 1);
  return true;
}

// src/canvas/text.ts
var fontFamilies = /* @__PURE__ */ new Map();
var pendingFonts = /* @__PURE__ */ new Map();
function fontString(options = {}) {
  const family = options.fontId ? fontFamilies.get(options.fontId) ?? options.fontId : options.fontFamily ?? "sans-serif";
  const style = options.style ?? "normal";
  const weight = options.weight ?? "400";
  const size = options.size ?? 16;
  return `${style} ${weight} ${size}px ${family}`;
}
function registerFont(id, family) {
  fontFamilies.set(id, family);
}
function loadFont(id, source, options = {}) {
  const family = options.family ?? id;
  registerFont(id, family);
  const FontFaceCtor = globalThis.FontFace;
  if (!FontFaceCtor) return Promise.resolve(void 0);
  const promise = new FontFaceCtor(family, `url(${source})`, {
    weight: options.weight,
    style: options.style,
    display: options.display
  }).load().then((font) => {
    const fonts = globalThis.document?.fonts;
    if (fonts && "add" in fonts && typeof fonts.add === "function") {
      fonts.add(font);
    }
    return font;
  });
  pendingFonts.set(id, promise);
  return promise;
}
function textReady(id) {
  if (id) return pendingFonts.get(id) ?? Promise.resolve(void 0);
  return Promise.all([...pendingFonts.values()]);
}
function measureText(text, options = {}) {
  const ctx = getDrawContext(options);
  ctx.save();
  ctx.font = fontString(options);
  const metrics = ctx.measureText(text);
  ctx.restore();
  return metrics;
}
function drawText(text, x, y, options = {}) {
  const ctx = getDrawContext(options);
  pushTransform({ ...options, x, y });
  try {
    ctx.font = fontString(options);
    ctx.textAlign = options.align ?? "left";
    ctx.textBaseline = options.baseline ?? "alphabetic";
    if (options.lineWidth !== void 0) ctx.lineWidth = options.lineWidth;
    const fill = options.fill ?? "#fff";
    ctx.fillStyle = fill;
    if (options.maxWidth !== void 0) ctx.fillText(text, 0, 0, options.maxWidth);
    else ctx.fillText(text, 0, 0);
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      if (options.maxWidth !== void 0) ctx.strokeText(text, 0, 0, options.maxWidth);
      else ctx.strokeText(text, 0, 0);
    }
  } finally {
    popTransform({ ctx });
  }
  return measureText(text, options);
}

// src/canvas/post-processing.ts
var postProcessCosts = {
  overlay: { tier: "overlay", readsPixels: false, writesPixels: false, fullCanvasPasses: 1 },
  pixel: { tier: "pixel", readsPixels: true, writesPixels: true, fullCanvasPasses: 1 },
  distortion: { tier: "distortion", readsPixels: true, writesPixels: true, fullCanvasPasses: 2 }
};
var clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
var clampUnit = (value) => Math.max(0, Math.min(1, value));
var hasApply = (effect) => "apply" in effect;
var hasDraw = (effect) => "draw" in effect;
var overlayCost = postProcessCosts.overlay;
var pixelCost = postProcessCosts.pixel;
var distortionCost = postProcessCosts.distortion;
function hashNoise(x, y, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}
function sampleNearest(source, width, height, x, y) {
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (sy * width + sx) * 4;
  return [source[index], source[index + 1], source[index + 2], source[index + 3]];
}
function getPostProcessEffectCost(effect) {
  if (effect.cost) return effect.cost;
  return hasApply(effect) ? pixelCost : overlayCost;
}
function summarizePostProcessCost(effects) {
  let pixelEffects = 0;
  let distortionEffects = 0;
  let fullCanvasPasses = 0;
  for (const effect of effects) {
    const cost = getPostProcessEffectCost(effect);
    if (cost.tier === "pixel") pixelEffects += 1;
    if (cost.tier === "distortion") distortionEffects += 1;
    fullCanvasPasses += cost.fullCanvasPasses;
  }
  return { ok: true, pixelEffects, distortionEffects, fullCanvasPasses, violations: [] };
}
function checkPostProcessBudget(effects, budget) {
  const report = summarizePostProcessCost(effects);
  const violations = [];
  if (budget.maxPixelEffects !== void 0 && report.pixelEffects > budget.maxPixelEffects) {
    violations.push(`pixel effects ${report.pixelEffects} exceeds ${budget.maxPixelEffects}`);
  }
  if (budget.maxDistortionEffects !== void 0 && report.distortionEffects > budget.maxDistortionEffects) {
    violations.push(`distortion effects ${report.distortionEffects} exceeds ${budget.maxDistortionEffects}`);
  }
  if (budget.maxFullCanvasPasses !== void 0 && report.fullCanvasPasses > budget.maxFullCanvasPasses) {
    violations.push(`full canvas passes ${report.fullCanvasPasses} exceeds ${budget.maxFullCanvasPasses}`);
  }
  if (budget.allowDistortion === false && report.distortionEffects > 0) {
    violations.push("distortion effects are not allowed");
  }
  return { ...report, ok: violations.length === 0, violations };
}
function createPostProcessStack(effects = []) {
  const stack = [...effects];
  return {
    add(effect) {
      stack.push(effect);
      return this;
    },
    remove(name) {
      const index = stack.findIndex((effect) => effect.name === name);
      if (index === -1) return false;
      stack.splice(index, 1);
      return true;
    },
    clear() {
      stack.length = 0;
    },
    apply(ctx, partial = {}) {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      if (width <= 0 || height <= 0 || stack.length === 0) return;
      const context = {
        width,
        height,
        time: 0,
        intensity: 1,
        centerX: width * 0.5,
        centerY: height * 0.5,
        seed: 1,
        ...partial
      };
      const pixelEffects = stack.filter(hasApply);
      if (pixelEffects.length > 0) {
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            let pixel = [data[index], data[index + 1], data[index + 2], data[index + 3]];
            for (const effect of pixelEffects) {
              pixel = effect.apply(pixel, x, y, context);
            }
            data[index] = clampByte(pixel[0]);
            data[index + 1] = clampByte(pixel[1]);
            data[index + 2] = clampByte(pixel[2]);
            data[index + 3] = clampByte(pixel[3]);
          }
        }
        ctx.putImageData(image, 0, 0);
      }
      for (const effect of stack.filter(hasDraw)) {
        effect.draw(ctx, context);
      }
    },
    effects() {
      return stack;
    }
  };
}
function grayscale(amount = 1) {
  return {
    name: "grayscale",
    cost: pixelCost,
    apply: ([r, g, b, a]) => {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      return [r + (gray - r) * amount, g + (gray - g) * amount, b + (gray - b) * amount, a];
    }
  };
}
function invert(amount = 1) {
  return { name: "invert", cost: pixelCost, apply: ([r, g, b, a]) => [r + (255 - r * 2) * amount, g + (255 - g * 2) * amount, b + (255 - b * 2) * amount, a] };
}
function brightness(amount = 0) {
  return { name: "brightness", cost: pixelCost, apply: ([r, g, b, a]) => [r + amount * 255, g + amount * 255, b + amount * 255, a] };
}
function contrast(amount = 0) {
  const factor = 1 + amount;
  return { name: "contrast", cost: pixelCost, apply: ([r, g, b, a]) => [(r - 128) * factor + 128, (g - 128) * factor + 128, (b - 128) * factor + 128, a] };
}
function sepia(amount = 1) {
  return {
    name: "sepia",
    cost: pixelCost,
    apply: ([r, g, b, a]) => [
      r + (r * 0.393 + g * 0.769 + b * 0.189 - r) * amount,
      g + (r * 0.349 + g * 0.686 + b * 0.168 - g) * amount,
      b + (r * 0.272 + g * 0.534 + b * 0.131 - b) * amount,
      a
    ]
  };
}
function threshold(level = 128) {
  return { name: "threshold", cost: pixelCost, apply: ([r, g, b, a]) => {
    const value = r * 0.299 + g * 0.587 + b * 0.114 >= level ? 255 : 0;
    return [value, value, value, a];
  } };
}
function tint(color, amount = 0.25) {
  return { name: "tint", cost: pixelCost, apply: ([r, g, b, a]) => [r + (color[0] - r) * amount, g + (color[1] - g) * amount, b + (color[2] - b) * amount, a] };
}
function posterize(levels = 4) {
  const count = Math.max(2, Math.floor(levels));
  const step = 255 / (count - 1);
  return { name: "posterize", cost: pixelCost, apply: ([r, g, b, a]) => [Math.round(r / step) * step, Math.round(g / step) * step, Math.round(b / step) * step, a] };
}
function gamma(value = 1) {
  const inverse = 1 / Math.max(0.01, value);
  return { name: "gamma", cost: pixelCost, apply: ([r, g, b, a]) => [255 * (r / 255) ** inverse, 255 * (g / 255) ** inverse, 255 * (b / 255) ** inverse, a] };
}
function colorGrading(options = {}) {
  const { lift = 0, gain = 1, temperature = 0, saturation = 1 } = options;
  return {
    name: "color-grading",
    cost: pixelCost,
    apply: ([r, g, b, a]) => {
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      return [
        luma + ((r + lift * 255) * gain + temperature * 32 - luma) * saturation,
        luma + ((g + lift * 255) * gain - luma) * saturation,
        luma + ((b + lift * 255) * gain - temperature * 32 - luma) * saturation,
        a
      ];
    }
  };
}
function filmGrain(amount = 0.08) {
  return { name: "film-grain", cost: pixelCost, apply: ([r, g, b, a], x, y, context) => {
    const noise = (hashNoise(x, y, (context.seed ?? 0) + Math.floor((context.time ?? 0) * 24)) - 0.5) * amount * 255;
    return [r + noise, g + noise, b + noise, a];
  } };
}
function digitalNoise(amount = 0.08) {
  return { ...filmGrain(amount), name: "digital-noise" };
}
function retroDithering(levels = 4) {
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return { name: "retro-dithering", cost: pixelCost, apply: ([r, g, b, a], x, y) => {
    const n = matrix[y % 4 * 4 + x % 4] / 16 - 0.5;
    const shift = n * (255 / Math.max(2, levels));
    return posterize(levels).apply([r + shift, g + shift, b + shift, a], x, y, { width: 1, height: 1 });
  } };
}
function vignette(amount = 0.45, radius = 0.72) {
  return { name: "vignette", cost: pixelCost, apply: ([r, g, b, a], x, y, context) => {
    const dx = (x - (context.centerX ?? context.width * 0.5)) / context.width;
    const dy = (y - (context.centerY ?? context.height * 0.5)) / context.height;
    const edge = clampUnit((Math.sqrt(dx * dx + dy * dy) / radius) ** 2);
    const scale = 1 - edge * amount;
    return [r * scale, g * scale, b * scale, a];
  } };
}
function pixelate(ctx, size = 4) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const block = Math.max(1, Math.floor(size));
  const source = ctx.getImageData(0, 0, width, height);
  const data = source.data;
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      const sample = sampleNearest(data, width, height, x, y);
      for (let yy = y; yy < Math.min(height, y + block); yy += 1) {
        for (let xx = x; xx < Math.min(width, x + block); xx += 1) {
          const index = (yy * width + xx) * 4;
          data[index] = sample[0];
          data[index + 1] = sample[1];
          data[index + 2] = sample[2];
          data[index + 3] = sample[3];
        }
      }
    }
  }
  ctx.putImageData(source, 0, 0);
}
pixelate.cost = distortionCost;
function screenShake(amount, time = 0) {
  return {
    x: Math.sin(time * 71.3) * amount + Math.sin(time * 19.7) * amount * 0.35,
    y: Math.cos(time * 83.1) * amount * 0.7
  };
}
function bloom(ctx, amount = 0.35, blur = 8) {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = amount;
  ctx.filter = `blur(${blur}px) brightness(1.45)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}
bloom.cost = overlayCost;
function neonGlow(ctx, color = "rgba(0, 255, 220, 0.22)", blur = 12) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
neonGlow.cost = overlayCost;
function flashbang(ctx, amount = 1) {
  ctx.save();
  ctx.globalAlpha = clampUnit(amount);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
flashbang.cost = overlayCost;
function crtScanlines(spacing = 3, alpha = 0.18) {
  return { name: "crt-scanlines", cost: overlayCost, draw: (ctx) => {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = 0; y < ctx.canvas.height; y += spacing) ctx.fillRect(0, y, ctx.canvas.width, 1);
    ctx.restore();
  } };
}
var scanlineFlicker = (spacing = 3, alpha = 0.12) => ({
  name: "scanline-flicker",
  cost: overlayCost,
  draw: (ctx, context) => crtScanlines(spacing, alpha + Math.sin((context.time ?? 0) * 40) * alpha * 0.35).draw(ctx, context)
});
function chromaticAberration(ctx, offset = 2) {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.55;
  ctx.filter = "sepia(1) saturate(4) hue-rotate(-35deg)";
  ctx.drawImage(canvas, offset, 0);
  ctx.filter = "sepia(1) saturate(4) hue-rotate(165deg)";
  ctx.drawImage(canvas, -offset, 0);
  ctx.restore();
}
chromaticAberration.cost = overlayCost;
var colorFringe = chromaticAberration;
var chromaticDistortion = chromaticAberration;
function motionBlur(ctx, dx = 3, dy = 0, samples = 4, alpha = 0.12) {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 1; i <= samples; i += 1) ctx.drawImage(canvas, dx * i, dy * i);
  ctx.restore();
}
motionBlur.cost = overlayCost;
function radialBlur(ctx, amount = 0.02, samples = 5) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let i = 1; i <= samples; i += 1) {
    const scale = 1 + amount * i;
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(scale, scale);
    ctx.drawImage(ctx.canvas, -width * 0.5, -height * 0.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}
radialBlur.cost = overlayCost;
function barrelDistortion(ctx, amount = 0.18) {
  distort(ctx, (nx, ny) => {
    const r2 = nx * nx + ny * ny;
    const factor = 1 + amount * r2;
    return [nx * factor, ny * factor];
  });
}
barrelDistortion.cost = distortionCost;
function shockwaveDistortion(ctx, centerX, centerY, radius, amount = 8) {
  distort(ctx, (nx, ny, width, height) => {
    const x = nx * width * 0.5 + width * 0.5;
    const y = ny * height * 0.5 + height * 0.5;
    const distance = Math.hypot(x - centerX, y - centerY);
    const ring = Math.max(0, 1 - Math.abs(distance - radius) / 24);
    const push = ring * amount / Math.max(1, distance);
    return [nx + (x - centerX) * push / width, ny + (y - centerY) * push / height];
  });
}
shockwaveDistortion.cost = distortionCost;
function heatHaze(ctx, time = 0, amount = 3) {
  distort(ctx, (nx, ny, width) => [nx + Math.sin(ny * 28 + time * 5) * amount / width, ny]);
}
heatHaze.cost = distortionCost;
function glitch(ctx, amount = 6, seed = 1) {
  const { width, height } = ctx.canvas;
  const source = ctx.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y += 4) {
    const shift = Math.round((hashNoise(y, seed) - 0.5) * amount * 2);
    ctx.putImageData(source, shift, 0, 0, y, width, Math.min(4, height - y));
  }
}
glitch.cost = distortionCost;
function lensFlare(ctx, x, y, amount = 0.5) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(ctx.canvas.width, ctx.canvas.height) * 0.28);
  gradient.addColorStop(0, `rgba(255, 255, 230, ${0.65 * amount})`);
  gradient.addColorStop(0.2, `rgba(255, 180, 90, ${0.22 * amount})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
lensFlare.cost = overlayCost;
function starStreak(ctx, x, y, length = 120, amount = 0.5) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(255, 255, 245, ${amount})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - length * 0.5, y);
  ctx.lineTo(x + length * 0.5, y);
  ctx.moveTo(x, y - length * 0.2);
  ctx.lineTo(x, y + length * 0.2);
  ctx.stroke();
  ctx.restore();
}
starStreak.cost = overlayCost;
function colorLut(mapper) {
  return { name: "color-lut", cost: pixelCost, apply: (pixel) => mapper(pixel) };
}
function distort(ctx, map) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const source = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width * 2 - 1;
      const ny = y / height * 2 - 1;
      const [mx, my] = map(nx, ny, width, height);
      const sample = sampleNearest(source.data, width, height, (mx + 1) * width * 0.5, (my + 1) * height * 0.5);
      const index = (y * width + x) * 4;
      output.data[index] = sample[0];
      output.data[index + 1] = sample[1];
      output.data[index + 2] = sample[2];
      output.data[index + 3] = sample[3];
    }
  }
  ctx.putImageData(output, 0, 0);
}
export {
  GAMEPAD_AXIS_DEADZONE,
  barrelDistortion,
  bindKey,
  bloom,
  brightness,
  checkPostProcessBudget,
  chromaticAberration,
  chromaticDistortion,
  circleRectOverlap,
  clamp,
  colorFringe,
  colorGrading,
  colorLut,
  contrast,
  createCamera,
  createCanvasObjectEvents,
  createCollisionKernel,
  createFixedStepLoop,
  createKeyboardActions,
  createObjectPool,
  createOnScreenGamepad,
  createPointerInput,
  createPostProcessStack,
  createStage,
  crtScanlines,
  digitalNoise,
  drawCircle,
  drawLine,
  drawPolygon,
  drawRect,
  drawSprite,
  drawSpriteSlice,
  drawText,
  filmGrain,
  flashbang,
  gamma,
  getGamepad,
  getGamepadAxis,
  getGamepads,
  getPointerPos,
  getPostProcessEffectCost,
  getSprite,
  glitch,
  grayscale,
  gridKey,
  heatHaze,
  inBounds,
  init,
  invert,
  isActionDown,
  isActionPressed,
  isActionReleased,
  isGamepadButtonDown,
  isGamepadButtonPressed,
  isGamepadButtonReleased,
  isKeyDown,
  isKeyPressed,
  isKeyReleased,
  isPointerDown,
  isPointerPressed,
  isPointerReleased,
  lensFlare,
  loadFont,
  measureText,
  motionBlur,
  neonGlow,
  opposite,
  pixelate,
  pointInRect,
  popTransform,
  postProcessCosts,
  posterize,
  pushTransform,
  radialBlur,
  rayIntersectMap,
  rayIntersectRect,
  rectsOverlap,
  registerFont,
  registerSprite,
  resolveCollisionKernelWasmUrl,
  retroDithering,
  sameCell,
  scanlineFlicker,
  screenShake,
  sepia,
  setDrawContext,
  setVirtualKeyState,
  shockwaveDistortion,
  starStreak,
  summarizePostProcessCost,
  testCircleRectOverlap,
  testOverlapCircle,
  testOverlapRect,
  textReady,
  threshold,
  tint,
  unbindKey,
  unregisterSprite,
  updateGamepads,
  updateInputFrame,
  vecAngle,
  vecDistance,
  vecNormalize,
  vignette
};
