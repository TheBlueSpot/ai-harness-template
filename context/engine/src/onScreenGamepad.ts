import { bindKey, setVirtualKeyState } from "../input.ts";

type GamepadOptions = {
  buttons?: string[];
  mapping?: Record<string, string>;
  container?: HTMLElement;
  visible?: boolean;
};

const DEFAULT_MAPPING: Record<string, string> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Space: "jump",
  KeyZ: "action",
  KeyX: "action2"
};

const DEFAULT_BUTTONS = ["jump", "action", "action2"];

let styleInjected = false;

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

function createButton(label: string, code: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "codex-gamepad__key";
  button.textContent = label;
  button.dataset.code = code;
  button.dataset.action = code;
  const activePointers = new Set<number>();

  const down = (pointerId: number) => {
    activePointers.add(pointerId);
    setVirtualKeyState(code, true);
    button.classList.add("is-down");
  };
  const up = (pointerId: number) => {
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
    up((event as PointerEvent).pointerId);
  });
  return { button, down, up };
}

export function createOnScreenGamepad(options: GamepadOptions = {}) {
  injectStyles();
  const container = options.container ?? document.body;
  const root = document.createElement("div");
  root.className = "codex-gamepad";
  root.hidden = options.visible === false;

  const controls: { button: HTMLButtonElement; down(id: number): void; up(id: number): void }[] = [];
  const mapping = { ...DEFAULT_MAPPING, ...(options.mapping ?? {}) };
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

  function setButtonMapping(mapping: Record<string, string>) {
    for (const [code, action] of Object.entries(mapping)) bindKey(action, code);
  }

  return { destroy, show, hide, setButtonMapping };
}
