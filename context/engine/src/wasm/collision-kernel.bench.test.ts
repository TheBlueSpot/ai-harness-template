import { expect, test } from "bun:test";
import { circleRectOverlap } from "../math/collision.ts";
import {
  createCollisionKernel,
  testCircleRectOverlap,
  type CollisionKernel,
  type CollisionKernelFallbackDiagnostic
} from "./collision-kernel.ts";

type CircleRectFixture = readonly [cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number];

function mockFetch(handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) {
  return Object.assign(handler, { preconnect: globalThis.fetch.preconnect });
}

function f32(values: ArrayLike<number>) {
  return Array.from(values, (value) => Math.fround(value));
}

function expectCloseArray(actual: ArrayLike<number>, expected: ArrayLike<number>, epsilon = 1e-4) {
  expect(actual.length).toBe(expected.length);

  for (let i = 0; i < actual.length; i += 1) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(epsilon);
  }
}

async function wasmArtifactResponse() {
  return new Response(await Bun.file(new URL("../../wasm/collision-kernel.wasm", import.meta.url)).arrayBuffer(), {
    headers: { "content-type": "application/wasm" }
  });
}

async function createFallbackKernel(): Promise<CollisionKernel> {
  return await createCollisionKernel({
    fetch: mockFetch(() => Promise.reject(new Error("missing wasm")))
  });
}

async function createWasmKernel(): Promise<CollisionKernel> {
  const diagnostics: CollisionKernelFallbackDiagnostic[] = [];
  const kernel = await createCollisionKernel({
    fetch: mockFetch(() => wasmArtifactResponse()),
    onFallback: (diagnostic) => diagnostics.push(diagnostic)
  });
  if (kernel.backend !== "wasm") {
    throw new Error(`Expected wasm collision kernel, got ${kernel.backend}: ${diagnostics.map((entry) => entry.reason).join(", ")}`);
  }
  return kernel;
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
  const kernel = await createWasmKernel();
  expect(kernel.backend).toBe("wasm");

  for (const fixture of FIXTURES) {
    const objectResult = circleRectOverlap(
      { x: fixture[0], y: fixture[1], r: fixture[2] },
      { x: fixture[3], y: fixture[4], w: fixture[5], h: fixture[6] }
    );
    expect(testCircleRectOverlap(...fixture)).toBe(objectResult);
    expect(kernel.testCircleRectOverlap(...fixture)).toBe(objectResult);
  }
});

test("circle rect benchmark gate keeps WASM interop from regressing badly", async () => {
  const kernel = await createWasmKernel();
  expect(kernel.backend).toBe("wasm");

  const iterations = 50_000;
  const tsBench = runRawCircleRect(testCircleRectOverlap, iterations);
  const wasmBench = runRawCircleRect(kernel.testCircleRectOverlap, iterations);

  expect(wasmBench.hits).toBe(tsBench.hits);
  expect(wasmBench.elapsedMs).toBeLessThan(Math.max(5, tsBench.elapsedMs * 20));
});

test("batched circle rect gate proves WASM parity and severe-regression guard", async () => {
  const kernel = await createWasmKernel();
  expect(kernel.backend).toBe("wasm");

  const iterations = 4096;
  const cx = new Float32Array(iterations);
  const cy = new Float32Array(iterations);
  const radius = new Float32Array(iterations);
  const rx = new Float32Array(iterations);
  const ry = new Float32Array(iterations);
  const rw = new Float32Array(iterations);
  const rh = new Float32Array(iterations);
  const tsOut = new Uint8Array(iterations);
  const wasmOut = new Uint8Array(iterations);

  for (let i = 0; i < iterations; i += 1) {
    const fixture = FIXTURES[i % FIXTURES.length];
    cx[i] = fixture[0];
    cy[i] = fixture[1];
    radius[i] = fixture[2];
    rx[i] = fixture[3];
    ry[i] = fixture[4];
    rw[i] = fixture[5];
    rh[i] = fixture[6];
  }

  const tsStart = performance.now();
  let tsHits = 0;
  for (let i = 0; i < iterations; i += 1) {
    const hit = testCircleRectOverlap(cx[i], cy[i], radius[i], rx[i], ry[i], rw[i], rh[i]) ? 1 : 0;
    tsOut[i] = hit;
    tsHits += hit;
  }
  const tsElapsedMs = performance.now() - tsStart;

  const wasmStart = performance.now();
  const wasmHits = kernel.testCircleRectOverlapBatch({ cx, cy, radius, rx, ry, rw, rh, out: wasmOut });
  const wasmElapsedMs = performance.now() - wasmStart;

  expect(wasmHits).toBe(tsHits);
  expect(Array.from(wasmOut)).toEqual(Array.from(tsOut));
  expect(wasmElapsedMs).toBeLessThan(Math.max(5, tsElapsedMs * 20));
});

test("batched boundary benchmark gate covers movement, rotation, masks, and collisions", async () => {
  const fallbackKernel = await createFallbackKernel();
  const wasmKernel = await createWasmKernel();
  expect(fallbackKernel.backend).toBe("typescript");
  expect(wasmKernel.backend).toBe("wasm");

  const iterations = 4096;
  const baseX = new Array<number>(iterations);
  const baseY = new Array<number>(iterations);
  const baseVx = new Array<number>(iterations);
  const baseVy = new Array<number>(iterations);
  const baseValues = new Array<number>(iterations);
  const baseAx = new Array<number>(iterations);
  const baseAy = new Array<number>(iterations);
  const baseAw = new Array<number>(iterations);
  const baseAh = new Array<number>(iterations);
  const baseBx = new Array<number>(iterations);
  const baseBy = new Array<number>(iterations);
  const baseBw = new Array<number>(iterations);
  const baseBh = new Array<number>(iterations);
  const baseCx = new Array<number>(iterations);
  const baseCy = new Array<number>(iterations);
  const baseRadius = new Array<number>(iterations);
  const baseRx = new Array<number>(iterations);
  const baseRy = new Array<number>(iterations);
  const baseRw = new Array<number>(iterations);
  const baseRh = new Array<number>(iterations);

  for (let i = 0; i < iterations; i += 1) {
    baseX[i] = i % 17;
    baseY[i] = (i % 11) - 5;
    baseVx[i] = (i % 7) - 3;
    baseVy[i] = (i % 5) - 2;
    baseValues[i] = (i % 9) - 4;
    baseAx[i] = i % 23;
    baseAy[i] = i % 19;
    baseAw[i] = 1 + (i % 4);
    baseAh[i] = 1 + (i % 3);
    baseBx[i] = (i % 23) + (i % 2);
    baseBy[i] = (i % 19) + (i % 3);
    baseBw[i] = 1 + ((i + 1) % 4);
    baseBh[i] = 1 + ((i + 2) % 3);
    baseCx[i] = (i % 13) + 0.5;
    baseCy[i] = (i % 15) - 1.5;
    baseRadius[i] = 0.5 + (i % 4) * 0.5;
    baseRx[i] = i % 17;
    baseRy[i] = i % 11;
    baseRw[i] = 1 + (i % 5);
    baseRh[i] = 1 + (i % 4);
  }

  const movementTs = {
    x: [...baseX],
    y: [...baseY],
    vx: [...baseVx],
    vy: [...baseVy],
    dt: 0.25,
    count: iterations
  };
  const movementWasm = {
    x: new Float32Array(baseX),
    y: new Float32Array(baseY),
    vx: new Float32Array(baseVx),
    vy: new Float32Array(baseVy),
    dt: 0.25,
    count: iterations
  };
  const movementTsStart = performance.now();
  fallbackKernel.integrateMovementBatch(movementTs);
  const movementTsElapsed = performance.now() - movementTsStart;
  const movementWasmStart = performance.now();
  wasmKernel.integrateMovementBatch(movementWasm);
  const movementWasmElapsed = performance.now() - movementWasmStart;
  expect(f32(movementTs.x)).toEqual(f32(movementWasm.x));
  expect(f32(movementTs.y)).toEqual(f32(movementWasm.y));
  expect(movementWasmElapsed).toBeLessThan(Math.max(5, movementTsElapsed * 20));

  const rotationTs = {
    x: [...baseX],
    y: [...baseY],
    outX: new Array<number>(iterations).fill(0),
    outY: new Array<number>(iterations).fill(0),
    angle: Math.PI / 3,
    count: iterations
  };
  const rotationWasm = {
    x: new Float32Array(baseX),
    y: new Float32Array(baseY),
    outX: new Float32Array(iterations),
    outY: new Float32Array(iterations),
    angle: Math.PI / 3,
    count: iterations
  };
  const rotationTsStart = performance.now();
  fallbackKernel.rotatePointsBatch(rotationTs);
  const rotationTsElapsed = performance.now() - rotationTsStart;
  const rotationWasmStart = performance.now();
  wasmKernel.rotatePointsBatch(rotationWasm);
  const rotationWasmElapsed = performance.now() - rotationWasmStart;
  expectCloseArray(rotationTs.outX, rotationWasm.outX);
  expectCloseArray(rotationTs.outY, rotationWasm.outY);
  expect(rotationWasmElapsed).toBeLessThan(Math.max(5, rotationTsElapsed * 20));

  const filterTs = {
    values: [...baseValues],
    min: -2,
    max: 2,
    out: new Array<number>(iterations).fill(9),
    count: iterations
  };
  const filterWasm = {
    values: new Float32Array(baseValues),
    min: -2,
    max: 2,
    out: new Uint8Array(new Array<number>(iterations).fill(9)),
    count: iterations
  };
  const filterTsStart = performance.now();
  const filterTsHits = fallbackKernel.rangeFilterBatch(filterTs);
  const filterTsElapsed = performance.now() - filterTsStart;
  const filterWasmStart = performance.now();
  const filterWasmHits = wasmKernel.rangeFilterBatch(filterWasm);
  const filterWasmElapsed = performance.now() - filterWasmStart;
  expect(filterWasmHits).toBe(filterTsHits);
  expect(filterTs.out).toEqual(Array.from(filterWasm.out));
  expect(filterWasmElapsed).toBeLessThan(Math.max(5, filterTsElapsed * 20));

  const rectTs = {
    ax: [...baseAx],
    ay: [...baseAy],
    aw: [...baseAw],
    ah: [...baseAh],
    bx: [...baseBx],
    by: [...baseBy],
    bw: [...baseBw],
    bh: [...baseBh],
    out: new Array<number>(iterations).fill(0),
    count: iterations
  };
  const rectWasm = {
    ax: new Float32Array(baseAx),
    ay: new Float32Array(baseAy),
    aw: new Float32Array(baseAw),
    ah: new Float32Array(baseAh),
    bx: new Float32Array(baseBx),
    by: new Float32Array(baseBy),
    bw: new Float32Array(baseBw),
    bh: new Float32Array(baseBh),
    out: new Uint8Array(iterations),
    count: iterations
  };
  const rectTsStart = performance.now();
  const rectTsHits = fallbackKernel.testRectOverlapBatch(rectTs);
  const rectTsElapsed = performance.now() - rectTsStart;
  const rectWasmStart = performance.now();
  const rectWasmHits = wasmKernel.testRectOverlapBatch(rectWasm);
  const rectWasmElapsed = performance.now() - rectWasmStart;
  expect(rectWasmHits).toBe(rectTsHits);
  expect(rectTs.out).toEqual(Array.from(rectWasm.out));
  expect(rectWasmElapsed).toBeLessThan(Math.max(5, rectTsElapsed * 20));

  const circleTs = {
    cx: [...baseCx],
    cy: [...baseCy],
    radius: [...baseRadius],
    rx: [...baseRx],
    ry: [...baseRy],
    rw: [...baseRw],
    rh: [...baseRh],
    out: new Array<number>(iterations).fill(0),
    count: iterations
  };
  const circleWasm = {
    cx: new Float32Array(baseCx),
    cy: new Float32Array(baseCy),
    radius: new Float32Array(baseRadius),
    rx: new Float32Array(baseRx),
    ry: new Float32Array(baseRy),
    rw: new Float32Array(baseRw),
    rh: new Float32Array(baseRh),
    out: new Uint8Array(iterations),
    count: iterations
  };
  const circleTsStart = performance.now();
  const circleTsHits = fallbackKernel.testCircleRectOverlapBatch(circleTs);
  const circleTsElapsed = performance.now() - circleTsStart;
  const circleWasmStart = performance.now();
  const circleWasmHits = wasmKernel.testCircleRectOverlapBatch(circleWasm);
  const circleWasmElapsed = performance.now() - circleWasmStart;
  expect(circleWasmHits).toBe(circleTsHits);
  expect(circleTs.out).toEqual(Array.from(circleWasm.out));
  expect(circleWasmElapsed).toBeLessThan(Math.max(5, circleTsElapsed * 20));
});
