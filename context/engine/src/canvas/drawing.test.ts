import { expect, test } from "bun:test";
import {
  drawRect,
  drawSpriteSlice,
  popTransform,
  pushTransform,
  registerSprite,
  setDrawContext
} from "./drawing.ts";

function createContext() {
  const calls: string[] = [];
  return {
    calls,
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rotate: (value: number) => calls.push(`rotate:${value}`),
    scale: (x: number, y: number) => calls.push(`scale:${x},${y}`),
    drawImage: (...args: unknown[]) => calls.push(`drawImage:${args.slice(1).join(",")}`),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect:${x},${y},${w},${h}`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    beginPath: () => calls.push("beginPath"),
    arc: () => calls.push("arc"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    closePath: () => calls.push("closePath"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke")
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
}

test("drawRect uses the active context and restores drawing state", () => {
  const ctx = createContext();
  setDrawContext(ctx);

  drawRect(1, 2, 3, 4, { fill: "red", stroke: "blue", alpha: 0.5 });

  expect(ctx.calls).toEqual(["save", "fillRect:1,2,3,4", "strokeRect:1,2,3,4", "restore"]);
  setDrawContext(undefined);
});

test("drawSpriteSlice computes source frame data from counters", () => {
  const ctx = createContext();
  registerSprite("ship", { width: 64, height: 32 } as unknown as CanvasImageSource);

  drawSpriteSlice("ship", 10, 20, 3, { ctx, frameWidth: 16, frameHeight: 16, columns: 2 });

  expect(ctx.calls).toContain("drawImage:16,16,16,16,0,0,16,16");
});

test("transform stack ignores underflow", () => {
  const ctx = createContext();

  pushTransform({ ctx, x: 5, y: 6, rotation: 1, scale: 2 });
  expect(popTransform({ ctx })).toBe(true);
  expect(popTransform({ ctx })).toBe(false);

  expect(ctx.calls).toEqual(["save", "translate:5,6", "rotate:1", "scale:2,2", "restore"]);
});
