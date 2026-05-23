import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type EngineModule = {
  createCollisionKernel(url?: string): Promise<{
    backend: "typescript" | "wasm";
    testCircleRectOverlap(cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number): boolean;
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
} finally {
  server.stop(true);
}
