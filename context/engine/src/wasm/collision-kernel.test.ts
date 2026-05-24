import { expect, test } from "bun:test";
import {
  createCollisionKernel,
  resolveCollisionKernelWasmUrl,
  testCircleRectOverlap,
  type CollisionKernel,
  type CollisionKernelFallbackDiagnostic
} from "./collision-kernel.ts";

function mockFetch(handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) {
  return Object.assign(handler, { preconnect: globalThis.fetch.preconnect });
}

function f32(values: ArrayLike<number>) {
  return Array.from(values, (value) => Math.fround(value));
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
    throw new Error(`Expected wasm collision kernel, got ${kernel.backend}: ${diagnostics.map((entry) => `${entry.reason}:${String(entry.error)}`).join(", ")}`);
  }
  return kernel;
}

test("raw circle rect fallback matches object helper semantics", () => {
  expect(testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4)).toBe(true);
  expect(testCircleRectOverlap(0, 0, 2, 6, 5, 4, 4)).toBe(false);
});

test("collision kernel wasm url resolves from source and browser build bases", () => {
  expect(resolveCollisionKernelWasmUrl({ baseUrl: "https://cdn.example/engine/src/wasm/collision-kernel.js" })).toBe(
    "https://cdn.example/engine/wasm/collision-kernel.wasm"
  );
  expect(resolveCollisionKernelWasmUrl({ baseUrl: "https://cdn.example/engine/browser/engine.js" })).toBe(
    "https://cdn.example/engine/wasm/collision-kernel.wasm"
  );
});

test("collision kernel falls back when wasm cannot load", async () => {
  const kernel = await createCollisionKernel({
    fetch: mockFetch(() => Promise.reject(new Error("missing wasm")))
  });

  expect(kernel.backend).toBe("typescript");
  expect(kernel.testOverlapRect(0, 0, 8, 8, 7, 7, 2, 2)).toBe(true);
  expect(kernel.testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4)).toBe(true);
  expect(kernel.vecDistance(0, 0, 3, 4)).toBe(5);
});

test("collision kernel reports fetch fallback only when diagnostics are requested", async () => {
  const diagnostics: CollisionKernelFallbackDiagnostic[] = [];
  const fetch = mockFetch(() => Promise.reject(new Error("missing wasm")));
  const quietKernel = await createCollisionKernel({ fetch });
  const diagnosedKernel = await createCollisionKernel({ fetch, onFallback: (diagnostic) => diagnostics.push(diagnostic) });

  expect(quietKernel.backend).toBe("typescript");
  expect(diagnosedKernel.backend).toBe("typescript");
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0].reason).toBe("fetch");
  expect(diagnostics[0].url.endsWith("/wasm/collision-kernel.wasm")).toBe(true);
  expect(diagnostics[0].error).toBeInstanceOf(Error);
});

test("collision kernel reports instantiation fallback after a successful fetch", async () => {
  const diagnostics: CollisionKernelFallbackDiagnostic[] = [];
  const kernel = await createCollisionKernel({
    url: "https://cdn.example/bad-collision-kernel.wasm",
    fetch: mockFetch(() => Promise.resolve(new Response(new Uint8Array([0, 1, 2, 3])))),
    onFallback: (diagnostic) => diagnostics.push(diagnostic)
  });

  expect(kernel.backend).toBe("typescript");
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0].reason).toBe("instantiate");
  expect(diagnostics[0].url).toBe("https://cdn.example/bad-collision-kernel.wasm");
  expect(diagnostics[0].error).toBeInstanceOf(Error);
});

test("collision kernel exposes wasm-backed circle rect when artifact loads", async () => {
  const kernel = await createWasmKernel();

  expect(kernel.backend).toBe("wasm");
  expect(kernel.circleRectOverlap({ x: 5, y: 5, r: 2 }, { x: 6, y: 5, w: 4, h: 4 })).toBe(true);
  expect(kernel.circleRectOverlap({ x: 0, y: 0, r: 2 }, { x: 6, y: 5, w: 4, h: 4 })).toBe(false);
  expect(kernel.testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4)).toBe(true);
  expect(kernel.testCircleRectOverlap(0, 0, 2, 6, 5, 4, 4)).toBe(false);
  expect(kernel.pointInRect(7, 7, 6, 5, 4, 4)).toBe(true);
});

test("collision kernel batch helpers stay aligned across TS fallback and wasm", async () => {
  const fallbackKernel = await createFallbackKernel();
  const wasmKernel = await createWasmKernel();

  const movementTs = {
    x: [0, 10, -2, 8, 99],
    y: [0, -5, 4, 1, -99],
    vx: [2, -4, 1, 0, 123],
    vy: [1, 3, -2, 5, -123],
    dt: 0.5,
    count: 4
  };
  const movementWasm = {
    x: new Float32Array(movementTs.x),
    y: new Float32Array(movementTs.y),
    vx: new Float32Array(movementTs.vx),
    vy: new Float32Array(movementTs.vy),
    dt: movementTs.dt,
    count: movementTs.count
  };
  fallbackKernel.integrateMovementBatch(movementTs);
  wasmKernel.integrateMovementBatch(movementWasm);
  expect(f32(movementTs.x)).toEqual(f32(movementWasm.x));
  expect(f32(movementTs.y)).toEqual(f32(movementWasm.y));

  const rotationTs = {
    x: [1, 0, -1, 0],
    y: [0, 1, 0, -1],
    outX: [9, 9, 9, 9],
    outY: [8, 8, 8, 8],
    angle: Math.PI / 2
  };
  const rotationWasm = {
    x: new Float32Array(rotationTs.x),
    y: new Float32Array(rotationTs.y),
    outX: new Float32Array(rotationTs.outX),
    outY: new Float32Array(rotationTs.outY),
    angle: rotationTs.angle
  };
  fallbackKernel.rotatePointsBatch(rotationTs);
  wasmKernel.rotatePointsBatch(rotationWasm);
  expect(f32(rotationTs.outX)).toEqual(f32(rotationWasm.outX));
  expect(f32(rotationTs.outY)).toEqual(f32(rotationWasm.outY));

  const vectorRotationTs = {
    x: [1, 0, -1, 0, 7],
    y: [0, 1, 0, -1, 8],
    outX: [6, 6, 6, 6, 6],
    outY: [5, 5, 5, 5, 5],
    angle: Math.PI / 2,
    count: 4
  };
  const vectorRotationWasm = {
    x: new Float32Array(vectorRotationTs.x),
    y: new Float32Array(vectorRotationTs.y),
    outX: new Float32Array(vectorRotationTs.outX),
    outY: new Float32Array(vectorRotationTs.outY),
    angle: vectorRotationTs.angle,
    count: vectorRotationTs.count
  };
  fallbackKernel.rotateVectorsBatch(vectorRotationTs);
  wasmKernel.rotateVectorsBatch(vectorRotationWasm);
  expect(f32(vectorRotationTs.outX)).toEqual(f32(vectorRotationWasm.outX));
  expect(f32(vectorRotationTs.outY)).toEqual(f32(vectorRotationWasm.outY));

  const filterTs = {
    values: [-3, 0, 1.5, 4, 7],
    min: 0,
    max: 4,
    out: [9, 9, 9, 9, 9],
    count: 0
  };
  const filterWasm = {
    values: new Float32Array(filterTs.values),
    min: filterTs.min,
    max: filterTs.max,
    out: new Uint8Array(filterTs.out),
    count: filterTs.count
  };
  expect(fallbackKernel.rangeFilterBatch(filterTs)).toBe(0);
  expect(wasmKernel.rangeFilterBatch(filterWasm)).toBe(0);
  expect(filterTs.out).toEqual([9, 9, 9, 9, 9]);
  expect(Array.from(filterWasm.out)).toEqual([9, 9, 9, 9, 9]);

  const predicateTs = {
    values: [-3, 0, 1.5, 4, 7],
    min: 0,
    max: 4,
    out: [0, 0, 0, 0, 0]
  };
  const predicateWasm = {
    values: new Float32Array(predicateTs.values),
    min: predicateTs.min,
    max: predicateTs.max,
    out: new Uint8Array(predicateTs.out)
  };
  expect(fallbackKernel.predicateFilterMaskBatch(predicateTs)).toBe(3);
  expect(wasmKernel.predicateFilterMaskBatch(predicateWasm)).toBe(3);
  expect(predicateTs.out).toEqual([0, 1, 1, 1, 0]);
  expect(Array.from(predicateWasm.out)).toEqual([0, 1, 1, 1, 0]);

  const rectTs = {
    ax: [0, 0, 10, 4, 50],
    ay: [0, 0, 10, 4, 50],
    aw: [4, 1, 2, 3, 1],
    ah: [4, 1, 2, 3, 1],
    bx: [3, 4, 20, 5, 0],
    by: [3, 4, 20, 5, 0],
    bw: [4, 2, 2, 1, 1],
    bh: [4, 2, 2, 1, 1],
    out: [9, 9, 9, 9, 9],
    count: 4
  };
  const rectWasm = {
    ax: new Float32Array(rectTs.ax),
    ay: new Float32Array(rectTs.ay),
    aw: new Float32Array(rectTs.aw),
    ah: new Float32Array(rectTs.ah),
    bx: new Float32Array(rectTs.bx),
    by: new Float32Array(rectTs.by),
    bw: new Float32Array(rectTs.bw),
    bh: new Float32Array(rectTs.bh),
    out: new Uint8Array(rectTs.out),
    count: rectTs.count
  };
  expect(fallbackKernel.testRectOverlapBatch(rectTs)).toBe(2);
  expect(wasmKernel.testRectOverlapBatch(rectWasm)).toBe(2);
  expect(rectTs.out).toEqual([1, 0, 0, 1, 9]);
  expect(Array.from(rectWasm.out)).toEqual([1, 0, 0, 1, 9]);

  const circleTs = {
    cx: [5, 0, 10, -3, 12],
    cy: [5, 0, -2, 7, 12],
    radius: [2, 2, 4, 1.5, 3],
    rx: [6, 6, 8, -1, 9],
    ry: [5, 5, -4, 4, 9],
    rw: [4, 4, 5, 2, 2],
    rh: [4, 4, 8, 2, 2],
    out: [0, 0, 0, 0, 0],
    count: 4
  };
  const circleWasm = {
    cx: new Float32Array(circleTs.cx),
    cy: new Float32Array(circleTs.cy),
    radius: new Float32Array(circleTs.radius),
    rx: new Float32Array(circleTs.rx),
    ry: new Float32Array(circleTs.ry),
    rw: new Float32Array(circleTs.rw),
    rh: new Float32Array(circleTs.rh),
    out: new Uint8Array(circleTs.out),
    count: circleTs.count
  };
  expect(fallbackKernel.testCircleRectOverlapBatch(circleTs)).toBe(2);
  expect(wasmKernel.testCircleRectOverlapBatch(circleWasm)).toBe(2);
  expect(circleTs.out).toEqual([1, 0, 1, 0, 0]);
  expect(Array.from(circleWasm.out)).toEqual([1, 0, 1, 0, 0]);

  expect(fallbackKernel.testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4)).toBe(true);
  expect(wasmKernel.testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4)).toBe(true);
});
