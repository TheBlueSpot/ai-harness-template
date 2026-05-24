import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type EngineModule = {
  createCollisionKernel(url?: string): Promise<{
    backend: "typescript" | "wasm";
    testCircleRectOverlap(cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number): boolean;
    rangeFilterBatch(batch: {
      values: Float32Array;
      min: number;
      max: number;
      out: Uint8Array;
      count?: number;
    }): number;
    testCircleRectOverlapBatch(batch: {
      cx: Float32Array;
      cy: Float32Array;
      radius: Float32Array;
      rx: Float32Array;
      ry: Float32Array;
      rw: Float32Array;
      rh: Float32Array;
      out: Uint8Array;
      count?: number;
    }): number;
  }>;
};

const rootDir = join(import.meta.dir, "..");
const browserBuildPath = join(rootDir, "browser", "engine.js");
const wasmPath = join(rootDir, "wasm", "collision-kernel.wasm");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(existsSync(browserBuildPath), "browser runtime build is missing; run bun run build first");
assert(existsSync(wasmPath), "WASM asset is missing");

const engine = (await import(pathToFileURL(browserBuildPath).href)) as EngineModule;

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/wasm/collision-kernel.wasm") {
      return new Response("not found", { status: 404 });
    }

    return new Response(Bun.file(wasmPath), {
      headers: {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'",
        "content-type": "application/wasm"
      }
    });
  }
});

try {
  const wasmUrl = `http://${server.hostname}:${server.port}/wasm/collision-kernel.wasm`;
  const response = await fetch(wasmUrl);

  assert(response.ok, "native static host must serve the WASM asset");
  assert(response.headers.get("content-type") === "application/wasm", "native static host must serve application/wasm");

  const kernel = await engine.createCollisionKernel(wasmUrl);
  assert(kernel.backend === "wasm", "hosted WASM asset must initialize the wasm backend");
  assert(kernel.testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4) === true, "hosted WASM overlap should match hit fixture");
  assert(kernel.testCircleRectOverlap(0, 0, 2, 6, 5, 4, 4) === false, "hosted WASM overlap should match miss fixture");

  const rangeMask = new Uint8Array(4);
  const rangeHits = kernel.rangeFilterBatch({
    values: new Float32Array([-1, 0.5, 2, 8]),
    min: 0,
    max: 2,
    out: rangeMask
  });
  assert(rangeHits === 2, "hosted WASM range batch should return hit count");
  assert(rangeMask.join(",") === "0,1,1,0", "hosted WASM range batch should write mask output");

  const circleMask = new Uint8Array(3);
  const circleHits = kernel.testCircleRectOverlapBatch({
    cx: new Float32Array([5, 0, 10]),
    cy: new Float32Array([5, 0, 10]),
    radius: new Float32Array([2, 2, 1]),
    rx: new Float32Array([6, 6, 8]),
    ry: new Float32Array([5, 5, 8]),
    rw: new Float32Array([4, 4, 1]),
    rh: new Float32Array([4, 4, 1]),
    out: circleMask
  });
  assert(circleHits === 1, "hosted WASM circle/rect batch should return hit count");
  assert(circleMask.join(",") === "1,0,0", "hosted WASM circle/rect batch should write mask output");
} finally {
  server.stop(true);
}
