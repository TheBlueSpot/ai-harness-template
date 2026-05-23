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

type CircleRectWasmExport = (cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number) => number;

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
  onFallback?: (diagnostic: CollisionKernelFallbackDiagnostic) => void;
};

function isCircleRectExport(value: unknown): value is CircleRectWasmExport {
  return typeof value === "function";
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

function normalizeCollisionKernelOptions(input: string | CollisionKernelOptions = {}): Required<Pick<CollisionKernelOptions, "url">> & Pick<CollisionKernelOptions, "onFallback"> {
  if (typeof input === "string") {
    return { url: input };
  }
  return { url: input.url ?? resolveCollisionKernelWasmUrl(), onFallback: input.onFallback };
}

export async function createCollisionKernel(options: string | CollisionKernelOptions = {}): Promise<CollisionKernel> {
  const { url, onFallback } = normalizeCollisionKernelOptions(options);
  try {
    const response = await fetch(url);
    let exports: WebAssembly.Exports;
    try {
      const instance =
        typeof WebAssembly.instantiateStreaming === "function" && response.headers.get("content-type") === "application/wasm"
          ? await WebAssembly.instantiateStreaming(Promise.resolve(response), {})
          : await WebAssembly.instantiate(await response.arrayBuffer(), {});
      exports = instance.instance.exports;
    } catch (error) {
      onFallback?.({ reason: "instantiate", url, error });
      return createTypescriptCollisionKernel();
    }
    const circleRect = exports.circle_rect_overlap;
    if (isCircleRectExport(circleRect)) {
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
        rayIntersectMap
      };
    }
    onFallback?.({ reason: "missing-export", url });
  } catch (error) {
    onFallback?.({ reason: "fetch", url, error });
    // Static file hosting can omit the wasm artifact; the deterministic TS path remains authoritative.
  }

  return createTypescriptCollisionKernel();
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
    rayIntersectMap
  };
}
