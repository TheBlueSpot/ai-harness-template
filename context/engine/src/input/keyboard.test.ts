import { expect, test } from "bun:test";
import { createKeyboardActions, registerVirtualKey } from "./keyboard.ts";

function createTarget() {
  const handlers = new Map<string, Set<(event: any) => void>>();
  return {
    addEventListener(type: string, handler: (event: any) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(handler);
    },
    removeEventListener(type: string, handler: (event: any) => void) {
      handlers.get(type)?.delete(handler);
    },
    dispatch(type: string, event: any) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    }
  };
}

test("keyboard actions expose pressed held and released transitions", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ Space: "jump" }, target);
  let prevented = 0;
  const event = { code: "Space", preventDefault: () => prevented += 1 };

  target.dispatch("keydown", event);
  expect(keyboard.down("jump")).toBe(true);
  expect(keyboard.held("jump")).toBe(true);
  expect(keyboard.pressed("jump")).toBe(true);
  expect(keyboard.consume("jump")).toBe(true);
  expect(keyboard.consume("jump")).toBe(false);

  target.dispatch("keydown", event);
  expect(keyboard.pressed("jump")).toBe(false);

  target.dispatch("keyup", event);
  expect(keyboard.down("jump")).toBe(false);
  expect(keyboard.released("jump")).toBe(true);
  expect(keyboard.consumeRelease("jump")).toBe(true);
  expect(prevented).toBe(3);
});

test("keyboard update clears one-frame transitions without clearing held state", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ KeyA: "left" }, target);

  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  keyboard.update();
  expect(keyboard.down("left")).toBe(true);
  expect(keyboard.pressed("left")).toBe(false);

  target.dispatch("keyup", { code: "KeyA", preventDefault() {} });
  keyboard.update();
  expect(keyboard.released("left")).toBe(false);
});

test("virtual key registration feeds active keyboard polling state", () => {
  const keyboard = createKeyboardActions({ ArrowLeft: "left" }, createTarget());

  registerVirtualKey("ArrowLeft", true);
  expect(keyboard.down("left")).toBe(true);
  expect(keyboard.pressed("left")).toBe(true);

  keyboard.update();
  registerVirtualKey("ArrowLeft", false);
  expect(keyboard.down("left")).toBe(false);
  expect(keyboard.released("left")).toBe(true);
});
