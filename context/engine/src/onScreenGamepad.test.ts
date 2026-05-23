import { expect, test } from "bun:test";
import { bindKey, isActionDown, isActionPressed, isActionReleased } from "../input.ts";
import { createOnScreenGamepad } from "./onScreenGamepad.ts";

function createElement(tagName: string) {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const element: any = {
    tagName: tagName.toUpperCase(),
    children: [] as any[],
    dataset: {},
    className: "",
    hidden: false,
    textContent: "",
    classList: {
      add(name: string) {
        element.className = `${element.className} ${name}`.trim();
      },
      remove(name: string) {
        element.className = element.className
          .split(/\s+/)
          .filter((item: string) => item && item !== name)
          .join(" ");
      }
    },
    setAttribute() {},
    appendChild(child: any) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    append(...children: any[]) {
      for (const child of children) element.appendChild(child);
    },
    remove() {
      if (!element.parentNode) return;
      element.parentNode.children = element.parentNode.children.filter((child: any) => child !== element);
    },
    addEventListener(type: string, handler: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(handler);
    },
    removeEventListener(type: string, handler: (event: any) => void) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type: string, event: any) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
    setPointerCapture() {},
    removePointerCapture() {}
  };
  return element;
}

test("on screen gamepad registers shared virtual key state and cleans up", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  bindKey("left", "ArrowLeft");
  bindKey("jump", "Space");
  const body = createElement("body");
  const head = createElement("head");
  const buttons: any[] = [];
  const documentStub: any = {
    head,
    body,
    createElement(tagName: string) {
      const element = createElement(tagName);
      if (tagName === "button") buttons.push(element);
      return element;
    }
  };

  globalThis.document = documentStub;
  globalThis.window = globalThis.window ?? ({} as any);

  try {
    const gamepad = createOnScreenGamepad({ visible: false });
    const leftButton = buttons.find((button) => button.dataset.code === "ArrowLeft");
    expect(leftButton).toBeTruthy();

    leftButton.dispatch("pointerdown", { pointerId: 1, preventDefault() {} });
    expect(isActionDown("left")).toBe(true);
    expect(isActionPressed("left")).toBe(true);

    leftButton.dispatch("pointerup", { pointerId: 1, preventDefault() {} });
    expect(isActionDown("left")).toBe(false);
    expect(isActionReleased("left")).toBe(true);

    gamepad.destroy();
    expect(body.children.length).toBe(0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
