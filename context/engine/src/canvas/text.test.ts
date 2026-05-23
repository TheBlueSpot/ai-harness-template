import { expect, test } from "bun:test";
import { setDrawContext } from "./drawing.ts";
import { drawText, measureText, registerFont } from "./text.ts";

function createContext() {
  const calls: string[] = [];
  return {
    calls,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
    rotate: () => undefined,
    scale: (x: number, y: number) => calls.push(`scale:${x},${y}`),
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText: (text: string, x: number, y: number, maxWidth?: number) => calls.push(`fillText:${text},${x},${y},${maxWidth ?? ""}`),
    strokeText: (text: string, x: number, y: number, maxWidth?: number) => calls.push(`strokeText:${text},${x},${y},${maxWidth ?? ""}`)
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
}

test("measureText applies registered font settings", () => {
  const ctx = createContext();
  registerFont("ui", "Inter");

  const metrics = measureText("Hello", { ctx, fontId: "ui", size: 20, weight: 700 });

  expect(metrics.width).toBe(50);
  expect(ctx.font).toBe("normal 700 20px Inter");
  expect(ctx.calls).toEqual(["save", "restore"]);
});

test("drawText balances transform state and returns metrics", () => {
  const ctx = createContext();

  const metrics = drawText("Score", 4, 8, { ctx, fill: "white", stroke: "black", maxWidth: 100, align: "center" });

  expect(metrics.width).toBe(50);
  expect(ctx.textAlign).toBe("center");
  expect(ctx.calls).toEqual([
    "save",
    "translate:4,8",
    "scale:1,1",
    "fillText:Score,0,0,100",
    "strokeText:Score,0,0,100",
    "restore",
    "save",
    "restore"
  ]);
});

test("drawText supports the minimal active-context call", () => {
  const ctx = createContext();
  setDrawContext(ctx);

  const metrics = drawText("Ready", 12, 16);

  expect(metrics.width).toBe(50);
  expect(ctx.calls).toEqual(["save", "translate:12,16", "scale:1,1", "fillText:Ready,0,0,", "restore", "save", "restore"]);
  setDrawContext(undefined);
});
