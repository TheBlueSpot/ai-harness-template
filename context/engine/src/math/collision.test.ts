import { expect, test } from "bun:test";
import {
  pointInRect,
  rayIntersectMap,
  testOverlapCircle,
  testOverlapRect,
  vecAngle,
  vecDistance,
  vecNormalize
} from "./collision.ts";

test("raw rectangle overlap uses primitive coordinates", () => {
  expect(testOverlapRect(0, 0, 10, 10, 9, 9, 4, 4)).toBe(true);
  expect(testOverlapRect(0, 0, 10, 10, 10, 0, 4, 4)).toBe(false);
});

test("raw circle and point collision helpers avoid object inputs", () => {
  expect(testOverlapCircle(0, 0, 5, 9, 0, 4)).toBe(true);
  expect(testOverlapCircle(0, 0, 5, 10, 0, 4)).toBe(false);
  expect(pointInRect(4, 5, 2, 3, 4, 4)).toBe(true);
  expect(pointInRect(7, 5, 2, 3, 4, 4)).toBe(false);
});

test("vector helpers return stable raw-number results", () => {
  expect(vecDistance(0, 0, 3, 4)).toBe(5);
  expect(vecAngle(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);

  const out = { x: 12, y: 12 };
  expect(vecNormalize(3, 4, out)).toBe(out);
  expect(out).toEqual({ x: 0.6, y: 0.8 });
  expect(vecNormalize(0, 0, out)).toEqual({ x: 0, y: 0 });
});

test("ray helper tests line of sight against box maps", () => {
  expect(rayIntersectMap(0, 0, 10, 0, [[4, -1, 2, 2]])).toBe(true);
  expect(rayIntersectMap(0, 0, 10, 0, [{ x: 4, y: 3, w: 2, h: 2 }])).toBe(false);
});
