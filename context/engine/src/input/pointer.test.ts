import { expect, test } from "bun:test";
import { createCanvasObjectEvents } from "./delegation.ts";
import { createPointerInput } from "./pointer.ts";

function createCanvas() {
  const handlers = new Map<string, Set<(event: any) => void>>();
  return {
    width: 200,
    height: 100,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
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
  } as unknown as HTMLCanvasElement & { dispatch(type: string, event: any): void };
}

test("pointer input normalizes mouse and touch to canvas coordinates", () => {
  const canvas = createCanvas();
  const input = createPointerInput(canvas, { toWorld: (point) => ({ x: point.x + 5, y: point.y + 7 }) });
  const events: any[] = [];
  input.on("down", (event) => events.push(event));

  canvas.dispatch("mousedown", { clientX: 60, clientY: 45, preventDefault() {} });
  canvas.dispatch("touchstart", {
    changedTouches: [{ identifier: 9, clientX: 35, clientY: 30 }],
    preventDefault() {}
  });

  expect(events[0]).toMatchObject({ id: 1, type: "mouse", x: 100, y: 50, worldX: 105, worldY: 57, down: true, pressed: true });
  expect(events[1]).toMatchObject({ id: 9, type: "touch", x: 50, y: 20, worldX: 55, worldY: 27, down: true, pressed: true });

  input.update();
  expect(input.pointer(9)?.pressed).toBe(false);
});

test("canvas object events delegates click and hover to topmost hit object", () => {
  const canvas = createCanvas();
  const back = { x: 0, y: 0, w: 200, h: 100 };
  const front = { x: 80, y: 40, w: 50, h: 30, layer: 1 };
  const delegated = createCanvasObjectEvents(canvas, [back, front]);
  const seen: string[] = [];

  delegated.on(back, "click", () => seen.push("back-click"));
  delegated.on(front, "enter", () => seen.push("front-enter"));
  delegated.on(front, "hover", () => seen.push("front-hover"));
  delegated.on(front, "click", () => seen.push("front-click"));

  canvas.dispatch("mousemove", { clientX: 55, clientY: 45, buttons: 0, preventDefault() {} });
  canvas.dispatch("mouseup", { clientX: 55, clientY: 45, preventDefault() {} });

  expect(seen).toEqual(["front-enter", "front-hover", "front-click"]);
  expect(delegated.hit(10, 10)).toBe(back);
});
