export type KeyboardBindings = Record<string, string>;

export type KeyboardState = {
  set(code: string, isDown: boolean): boolean;
  bind(code: string, action: string): void;
  down(action: string): boolean;
  held(action: string): boolean;
  pressed(action: string): boolean;
  released(action: string): boolean;
  consume(action: string): boolean;
  consumeRelease(action: string): boolean;
  update(): void;
  state(action: string): { down: boolean; held: boolean; pressed: boolean; released: boolean };
  dispose(): void;
};

type KeyboardEventTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;
type KeyboardInputEvent = Event & {
  code?: string;
};

const activeKeyboardStates = new Set<KeyboardState>();

export function createKeyboardState(bindings: KeyboardBindings = {}): KeyboardState {
  const held: Record<string, boolean> = {};
  const pressed: Record<string, boolean> = {};
  const released: Record<string, boolean> = {};

  function set(code: string, isDown: boolean) {
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
    bind(code: string, action: string) {
      bindings[code] = action;
    },
    down(action: string) {
      return held[action] === true;
    },
    held(action: string) {
      return held[action] === true;
    },
    pressed(action: string) {
      return pressed[action] === true;
    },
    released(action: string) {
      return released[action] === true;
    },
    consume(action: string) {
      const wasDown = pressed[action] === true;
      pressed[action] = false;
      return wasDown;
    },
    consumeRelease(action: string) {
      const wasReleased = released[action] === true;
      released[action] = false;
      return wasReleased;
    },
    update() {
      for (const action of Object.keys(pressed)) pressed[action] = false;
      for (const action of Object.keys(released)) released[action] = false;
    },
    state(action: string) {
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

export function registerVirtualKey(code: string, isDown: boolean) {
  let handled = false;
  for (const state of activeKeyboardStates) {
    handled = state.set(code, isDown) || handled;
  }
  return handled;
}

export function registerVirtualKeyMapping(code: string, action: string) {
  for (const state of activeKeyboardStates) state.bind(code, action);
}

export function createKeyboardActions(bindings: KeyboardBindings, target: KeyboardEventTarget = window) {
  const state = createKeyboardState(bindings);

  function onKeyDown(event: Event) {
    const keyboardEvent = event as KeyboardInputEvent;
    if (typeof keyboardEvent.code !== "string") return;
    if (state.set(keyboardEvent.code, true)) event.preventDefault();
  }

  function onKeyUp(event: Event) {
    const keyboardEvent = event as KeyboardInputEvent;
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
