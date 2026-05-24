import {
  circleRectOverlap,
  pointInRect,
  rayIntersectMap,
  testOverlapCircle,
  testOverlapRect,
  type CircleLike,
  type RectLike,
  type Vec2,
  vecAngle,
  vecDistance,
  vecNormalize
} from "../math/collision.ts";
import type {
  CircleRectBatch,
  MutableFloatBatch,
  MutableMaskBatch,
  MovementBatch,
  RangeFilterBatch,
  RectRectBatch,
  RotationBatch
} from "../types.ts";

type CircleRectWasmExport = (cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number) => number;
type WasmBatchExport = (...args: number[]) => number | void;
type WasmAllocatorExport = (bytes: number) => number;

export type CollisionKernelBackend = "wasm" | "typescript";

export type CollisionKernel = {
  backend: CollisionKernelBackend;
  testOverlapRect: typeof testOverlapRect;
  testOverlapCircle: typeof testOverlapCircle;
  pointInRect: typeof pointInRect;
  circleRectOverlap: (circle: CircleLike, rect: RectLike) => boolean;
  testCircleRectOverlap: (
    cx: number,
    cy: number,
    radius: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ) => boolean;
  vecDistance: typeof vecDistance;
  vecAngle: typeof vecAngle;
  vecNormalize: <T extends Vec2 = Vec2>(x: number, y: number, out?: T) => T;
  rayIntersectMap: typeof rayIntersectMap;
  integrateMovementBatch: (batch: MovementBatch) => void;
  rotatePointsBatch: (batch: RotationBatch) => void;
  rotateVectorsBatch: (batch: RotationBatch) => void;
  rangeFilterBatch: (batch: RangeFilterBatch) => number;
  predicateFilterMaskBatch: (batch: RangeFilterBatch) => number;
  testRectOverlapBatch: (batch: RectRectBatch) => number;
  testCircleRectOverlapBatch: (batch: CircleRectBatch) => number;
};

export type CollisionKernelWasmUrlOptions = {
  baseUrl?: string | URL;
};

export type CollisionKernelFallbackReason =
  | "fetch"
  | "instantiate"
  | "missing-export";

export type CollisionKernelFallbackDiagnostic = {
  reason: CollisionKernelFallbackReason;
  url: string;
  error?: unknown;
};

export type CollisionKernelOptions = {
  url?: string;
  fetch?: typeof fetch;
  onFallback?: (diagnostic: CollisionKernelFallbackDiagnostic) => void;
};

function isCircleRectExport(value: unknown): value is CircleRectWasmExport {
  return typeof value === "function";
}

function isWasmBatchExport(value: unknown): value is WasmBatchExport {
  return typeof value === "function";
}

function isWasmAllocatorExport(value: unknown): value is WasmAllocatorExport {
  return typeof value === "function";
}

function assertBatchLength(name: string, value: ArrayLike<number>, count: number) {
  if (value.length < count) {
    throw new RangeError(`${name} length ${value.length} is smaller than count ${count}`);
  }
}

function countBatch(name: string, explicitCount: number | undefined, values: readonly ArrayLike<number>[]) {
  const count = explicitCount ?? Math.min(...values.map((value) => value.length));
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`${name} count must be a non-negative integer`);
  }
  for (let i = 0; i < values.length; i += 1) {
    assertBatchLength(`${name}[${i}]`, values[i], count);
  }
  return count;
}

function writeF32(target: Float32Array, offset: number, values: ArrayLike<number>, count: number) {
  for (let i = 0; i < count; i += 1) {
    target[offset + i] = values[i];
  }
}

function readF32(source: Float32Array, offset: number, target: MutableFloatBatch, count: number) {
  for (let i = 0; i < count; i += 1) {
    target[i] = source[offset + i];
  }
}

function readMask(source: Uint8Array, offset: number, target: MutableMaskBatch, count: number) {
  for (let i = 0; i < count; i += 1) {
    target[i] = source[offset + i];
  }
}

function rangeFilterFallback(batch: RangeFilterBatch) {
  const count = countBatch("rangeFilterBatch", batch.count, [batch.values, batch.out]);
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const hit = batch.values[i] >= batch.min && batch.values[i] <= batch.max ? 1 : 0;
    batch.out[i] = hit;
    hits += hit;
  }
  return hits;
}

function integrateMovementFallback(batch: MovementBatch) {
  const count = countBatch("integrateMovementBatch", batch.count, [batch.x, batch.y, batch.vx, batch.vy]);
  for (let i = 0; i < count; i += 1) {
    batch.x[i] += batch.vx[i] * batch.dt;
    batch.y[i] += batch.vy[i] * batch.dt;
  }
}

function rotatePointsFallback(batch: RotationBatch) {
  const count = countBatch("rotatePointsBatch", batch.count, [batch.x, batch.y, batch.outX, batch.outY]);
  const sin = Math.sin(batch.angle);
  const cos = Math.cos(batch.angle);
  for (let i = 0; i < count; i += 1) {
    const x = batch.x[i];
    const y = batch.y[i];
    batch.outX[i] = x * cos - y * sin;
    batch.outY[i] = x * sin + y * cos;
  }
}

function rotateVectorsFallback(batch: RotationBatch) {
  rotatePointsFallback(batch);
}

function testRectOverlapBatchFallback(batch: RectRectBatch) {
  const count = countBatch("testRectOverlapBatch", batch.count, [
    batch.ax,
    batch.ay,
    batch.aw,
    batch.ah,
    batch.bx,
    batch.by,
    batch.bw,
    batch.bh,
    batch.out
  ]);
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const hit = testOverlapRect(batch.ax[i], batch.ay[i], batch.aw[i], batch.ah[i], batch.bx[i], batch.by[i], batch.bw[i], batch.bh[i])
      ? 1
      : 0;
    batch.out[i] = hit;
    hits += hit;
  }
  return hits;
}

function testCircleRectOverlapBatchFallback(batch: CircleRectBatch) {
  const count = countBatch("testCircleRectOverlapBatch", batch.count, [
    batch.cx,
    batch.cy,
    batch.radius,
    batch.rx,
    batch.ry,
    batch.rw,
    batch.rh,
    batch.out
  ]);
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const hit = testCircleRectOverlap(batch.cx[i], batch.cy[i], batch.radius[i], batch.rx[i], batch.ry[i], batch.rw[i], batch.rh[i])
      ? 1
      : 0;
    batch.out[i] = hit;
    hits += hit;
  }
  return hits;
}

function createWasmBatchBridge(exports: WebAssembly.Exports) {
  const memory = exports.memory instanceof WebAssembly.Memory ? exports.memory : undefined;
  const allocate = isWasmAllocatorExport(exports.__new) ? exports.__new : undefined;
  const integrate = isWasmBatchExport(exports.integrate_movement_f32) ? exports.integrate_movement_f32 : undefined;
  const rotate = isWasmBatchExport(exports.rotate_points_f32) ? exports.rotate_points_f32 : undefined;
  const rotateVectors = isWasmBatchExport(exports.rotate_vectors_f32) ? exports.rotate_vectors_f32 : rotate;
  const range = isWasmBatchExport(exports.range_filter_f32)
    ? exports.range_filter_f32
    : isWasmBatchExport(exports.predicate_filter_mask_f32)
      ? exports.predicate_filter_mask_f32
      : undefined;
  const rectRect = isWasmBatchExport(exports.rect_rect_overlap_batch_f32) ? exports.rect_rect_overlap_batch_f32 : undefined;
  const circleRect = isWasmBatchExport(exports.circle_rect_overlap_batch_f32) ? exports.circle_rect_overlap_batch_f32 : undefined;
  let scratchPtr = 0;
  let scratchBytes = 0;

  function ensureScratch(bytes: number) {
    if (!memory || !allocate) return undefined;
    if (bytes > scratchBytes) {
      scratchPtr = allocate(bytes);
      scratchBytes = bytes;
    }
    return scratchPtr;
  }

  function f32View() {
    if (!memory) throw new Error("WASM memory export missing");
    return new Float32Array(memory.buffer);
  }

  function u8View() {
    if (!memory) throw new Error("WASM memory export missing");
    return new Uint8Array(memory.buffer);
  }

  function f32Ptr(base: number, index: number, count: number) {
    return base + index * count * 4;
  }

  function u8Ptr(base: number, f32Count: number, index: number) {
    return base + f32Count * 4 + index;
  }

  function runRangeFilter(batch: RangeFilterBatch) {
    const count = countBatch("rangeFilterBatch", batch.count, [batch.values, batch.out]);
    const ptr = ensureScratch(count * 4 + count);
    if (count === 0 || ptr === undefined || !range) return rangeFilterFallback(batch);
    let heap = f32View();
    writeF32(heap, ptr >> 2, batch.values, count);
    const outPtr = u8Ptr(ptr, count, 0);
    const hits = Number(range(ptr, batch.min, batch.max, outPtr, count));
    readMask(u8View(), outPtr, batch.out, count);
    return hits;
  }

  return {
    integrateMovementBatch(batch: MovementBatch) {
      const count = countBatch("integrateMovementBatch", batch.count, [batch.x, batch.y, batch.vx, batch.vy]);
      const ptr = ensureScratch(count * 4 * 4);
      if (count === 0 || ptr === undefined || !integrate) return integrateMovementFallback(batch);
      let heap = f32View();
      writeF32(heap, ptr >> 2, batch.x, count);
      writeF32(heap, (ptr >> 2) + count, batch.y, count);
      writeF32(heap, (ptr >> 2) + count * 2, batch.vx, count);
      writeF32(heap, (ptr >> 2) + count * 3, batch.vy, count);
      integrate(f32Ptr(ptr, 0, count), f32Ptr(ptr, 1, count), f32Ptr(ptr, 2, count), f32Ptr(ptr, 3, count), batch.dt, count);
      heap = f32View();
      readF32(heap, ptr >> 2, batch.x, count);
      readF32(heap, (ptr >> 2) + count, batch.y, count);
    },
    rotatePointsBatch(batch: RotationBatch) {
      const count = countBatch("rotatePointsBatch", batch.count, [batch.x, batch.y, batch.outX, batch.outY]);
      const ptr = ensureScratch(count * 4 * 4);
      if (count === 0 || ptr === undefined || !rotate) return rotatePointsFallback(batch);
      let heap = f32View();
      writeF32(heap, ptr >> 2, batch.x, count);
      writeF32(heap, (ptr >> 2) + count, batch.y, count);
      rotate(
        f32Ptr(ptr, 0, count),
        f32Ptr(ptr, 1, count),
        f32Ptr(ptr, 2, count),
        f32Ptr(ptr, 3, count),
        Math.sin(batch.angle),
        Math.cos(batch.angle),
        count
      );
      heap = f32View();
      readF32(heap, (ptr >> 2) + count * 2, batch.outX, count);
      readF32(heap, (ptr >> 2) + count * 3, batch.outY, count);
    },
    rotateVectorsBatch(batch: RotationBatch) {
      const count = countBatch("rotateVectorsBatch", batch.count, [batch.x, batch.y, batch.outX, batch.outY]);
      const ptr = ensureScratch(count * 4 * 4);
      if (count === 0 || ptr === undefined || !rotateVectors) return rotateVectorsFallback(batch);
      let heap = f32View();
      writeF32(heap, ptr >> 2, batch.x, count);
      writeF32(heap, (ptr >> 2) + count, batch.y, count);
      rotateVectors(
        f32Ptr(ptr, 0, count),
        f32Ptr(ptr, 1, count),
        f32Ptr(ptr, 2, count),
        f32Ptr(ptr, 3, count),
        Math.sin(batch.angle),
        Math.cos(batch.angle),
        count
      );
      heap = f32View();
      readF32(heap, (ptr >> 2) + count * 2, batch.outX, count);
      readF32(heap, (ptr >> 2) + count * 3, batch.outY, count);
    },
    rangeFilterBatch: runRangeFilter,
    predicateFilterMaskBatch: runRangeFilter,
    testRectOverlapBatch(batch: RectRectBatch) {
      const values = [batch.ax, batch.ay, batch.aw, batch.ah, batch.bx, batch.by, batch.bw, batch.bh] as const;
      const count = countBatch("testRectOverlapBatch", batch.count, [...values, batch.out]);
      const ptr = ensureScratch(count * 4 * values.length + count);
      if (count === 0 || ptr === undefined || !rectRect) return testRectOverlapBatchFallback(batch);
      let heap = f32View();
      values.forEach((value, index) => writeF32(heap, (ptr >> 2) + count * index, value, count));
      const outPtr = u8Ptr(ptr, count * values.length, 0);
      const hits = Number(rectRect(...values.map((_, index) => f32Ptr(ptr, index, count)), outPtr, count));
      readMask(u8View(), outPtr, batch.out, count);
      return hits;
    },
    testCircleRectOverlapBatch(batch: CircleRectBatch) {
      const values = [batch.cx, batch.cy, batch.radius, batch.rx, batch.ry, batch.rw, batch.rh] as const;
      const count = countBatch("testCircleRectOverlapBatch", batch.count, [...values, batch.out]);
      const ptr = ensureScratch(count * 4 * values.length + count);
      if (count === 0 || ptr === undefined || !circleRect) return testCircleRectOverlapBatchFallback(batch);
      let heap = f32View();
      values.forEach((value, index) => writeF32(heap, (ptr >> 2) + count * index, value, count));
      const outPtr = u8Ptr(ptr, count * values.length, 0);
      const hits = Number(circleRect(...values.map((_, index) => f32Ptr(ptr, index, count)), outPtr, count));
      readMask(u8View(), outPtr, batch.out, count);
      return hits;
    }
  } satisfies Pick<
    CollisionKernel,
    | "integrateMovementBatch"
    | "rotatePointsBatch"
    | "rotateVectorsBatch"
    | "rangeFilterBatch"
    | "predicateFilterMaskBatch"
    | "testRectOverlapBatch"
    | "testCircleRectOverlapBatch"
  >;
}

export function testCircleRectOverlap(cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number) {
  const closestX = Math.max(rx, Math.min(rx + rw, cx));
  const closestY = Math.max(ry, Math.min(ry + rh, cy));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function resolveCollisionKernelWasmUrl(options: CollisionKernelWasmUrlOptions = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const base = String(baseUrl);
  const relativePath = base.includes("/src/wasm/") || base.includes("\\src\\wasm\\")
    ? "../../wasm/collision-kernel.wasm"
    : "../wasm/collision-kernel.wasm";
  return new URL(relativePath, baseUrl).href;
}

type NormalizedCollisionKernelOptions = {
  url: string;
  fetch: typeof fetch;
  onFallback?: (diagnostic: CollisionKernelFallbackDiagnostic) => void;
};

function normalizeCollisionKernelOptions(input: string | CollisionKernelOptions = {}): NormalizedCollisionKernelOptions {
  if (typeof input === "string") {
    return { url: input, fetch: globalThis.fetch };
  }
  return {
    url: input.url ?? resolveCollisionKernelWasmUrl(),
    fetch: input.fetch ?? globalThis.fetch,
    onFallback: input.onFallback
  };
}

export async function createCollisionKernel(options: string | CollisionKernelOptions = {}): Promise<CollisionKernel> {
  const { url, fetch: fetchWasm, onFallback } = normalizeCollisionKernelOptions(options);
  try {
    const response = await fetchWasm(url);
    let exports: WebAssembly.Exports;
    try {
      const imports = { env: { abort() {} } };
      const instance = await instantiateWasmResponse(response, imports);
      exports = instance.instance.exports;
    } catch (error) {
      onFallback?.({ reason: "instantiate", url, error });
      return createTypescriptCollisionKernel();
    }
    const circleRect = exports.circle_rect_overlap;
    if (isCircleRectExport(circleRect)) {
      const batchBridge = createWasmBatchBridge(exports);
      return {
        backend: "wasm",
        testOverlapRect,
        testOverlapCircle,
        pointInRect,
        circleRectOverlap(circle, rect) {
          return Boolean(circleRect(circle.x, circle.y, circle.r, rect.x, rect.y, rect.w, rect.h));
        },
        testCircleRectOverlap(cx, cy, radius, rx, ry, rw, rh) {
          return Boolean(circleRect(cx, cy, radius, rx, ry, rw, rh));
        },
        vecDistance,
        vecAngle,
        vecNormalize,
        rayIntersectMap,
        ...batchBridge
      };
    }
    onFallback?.({ reason: "missing-export", url });
  } catch (error) {
    onFallback?.({ reason: "fetch", url, error });
    // Static file hosting can omit the wasm artifact; the deterministic TS path remains authoritative.
  }

  return createTypescriptCollisionKernel();
}

async function instantiateWasmResponse(response: Response, imports: WebAssembly.Imports) {
  if (typeof WebAssembly.instantiateStreaming === "function" && response.headers.get("content-type") === "application/wasm") {
    try {
      return await WebAssembly.instantiateStreaming(Promise.resolve(response), imports);
    } catch (error) {
      if (response.bodyUsed) {
        throw error;
      }
    }
  }
  return await WebAssembly.instantiate(await response.arrayBuffer(), imports);
}

function createTypescriptCollisionKernel(): CollisionKernel {
  return {
    backend: "typescript",
    testOverlapRect,
    testOverlapCircle,
    pointInRect,
    circleRectOverlap,
    testCircleRectOverlap,
    vecDistance,
    vecAngle,
    vecNormalize,
    rayIntersectMap,
    integrateMovementBatch: integrateMovementFallback,
    rotatePointsBatch: rotatePointsFallback,
    rotateVectorsBatch: rotateVectorsFallback,
    rangeFilterBatch: rangeFilterFallback,
    predicateFilterMaskBatch: rangeFilterFallback,
    testRectOverlapBatch: testRectOverlapBatchFallback,
    testCircleRectOverlapBatch: testCircleRectOverlapBatchFallback
  };
}
