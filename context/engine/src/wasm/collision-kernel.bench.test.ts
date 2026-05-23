import { expect, test } from "bun:test";
import { circleRectOverlap } from "../math/collision.ts";
import { createCollisionKernel, testCircleRectOverlap, type CollisionKernel } from "./collision-kernel.ts";

type CircleRectFixture = readonly [cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number];

function mockFetch(handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) {
  return Object.assign(handler, { preconnect: globalThis.fetch.preconnect });
}

const FIXTURES: readonly CircleRectFixture[] = [
  [5, 5, 2, 6, 5, 4, 4],
  [0, 0, 2, 6, 5, 4, 4],
  [10, -2, 4, 8, -4, 5, 8],
  [-3, 7, 1.5, -1, 4, 2, 2],
  [12, 12, 3, 9, 9, 2, 2],
  [2, 2, 1, 1, 1, 1, 1]
];

function runRawCircleRect(fn: CollisionKernel["testCircleRectOverlap"], iterations: number) {
  let hits = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    const fixture = FIXTURES[i % FIXTURES.length];
    if (fn(fixture[0], fixture[1], fixture[2], fixture[3], fixture[4], fixture[5], fixture[6])) {
      hits += 1;
    }
  }

  return { hits, elapsedMs: performance.now() - start };
}

test("circle rect benchmark fixtures preserve parity across object, raw TS, and WASM paths", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(() =>
    Promise.resolve(
      new Response(Bun.file(new URL("../../wasm/collision-kernel.wasm", import.meta.url)), {
        headers: { "content-type": "application/wasm" }
      })
    ));

  try {
    const kernel = await createCollisionKernel();
    expect(kernel.backend).toBe("wasm");

    for (const fixture of FIXTURES) {
      const objectResult = circleRectOverlap(
        { x: fixture[0], y: fixture[1], r: fixture[2] },
        { x: fixture[3], y: fixture[4], w: fixture[5], h: fixture[6] }
      );
      expect(testCircleRectOverlap(...fixture)).toBe(objectResult);
      expect(kernel.testCircleRectOverlap(...fixture)).toBe(objectResult);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("circle rect benchmark gate keeps WASM interop from regressing badly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(() =>
    Promise.resolve(
      new Response(Bun.file(new URL("../../wasm/collision-kernel.wasm", import.meta.url)), {
        headers: { "content-type": "application/wasm" }
      })
    ));

  try {
    const kernel = await createCollisionKernel();
    expect(kernel.backend).toBe("wasm");

    const iterations = 50_000;
    const tsBench = runRawCircleRect(testCircleRectOverlap, iterations);
    const wasmBench = runRawCircleRect(kernel.testCircleRectOverlap, iterations);

    expect(wasmBench.hits).toBe(tsBench.hits);
    expect(wasmBench.elapsedMs).toBeLessThan(Math.max(5, tsBench.elapsedMs * 20));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
