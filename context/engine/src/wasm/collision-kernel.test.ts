import { expect, test } from "bun:test";
import {
  createCollisionKernel,
  resolveCollisionKernelWasmUrl,
  testCircleRectOverlap,
  type CollisionKernelFallbackDiagnostic
} from "./collision-kernel.ts";

function mockFetch(handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) {
  return Object.assign(handler, { preconnect: globalThis.fetch.preconnect });
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
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(() => Promise.reject(new Error("missing wasm")));

  try {
    const kernel = await createCollisionKernel();

    expect(kernel.backend).toBe("typescript");
    expect(kernel.testOverlapRect(0, 0, 8, 8, 7, 7, 2, 2)).toBe(true);
    expect(kernel.testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4)).toBe(true);
    expect(kernel.vecDistance(0, 0, 3, 4)).toBe(5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collision kernel reports fetch fallback only when diagnostics are requested", async () => {
  const originalFetch = globalThis.fetch;
  const diagnostics: CollisionKernelFallbackDiagnostic[] = [];
  globalThis.fetch = mockFetch(() => Promise.reject(new Error("missing wasm")));

  try {
    const quietKernel = await createCollisionKernel();
    const diagnosedKernel = await createCollisionKernel({ onFallback: (diagnostic) => diagnostics.push(diagnostic) });

    expect(quietKernel.backend).toBe("typescript");
    expect(diagnosedKernel.backend).toBe("typescript");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].reason).toBe("fetch");
    expect(diagnostics[0].url.endsWith("/wasm/collision-kernel.wasm")).toBe(true);
    expect(diagnostics[0].error).toBeInstanceOf(Error);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collision kernel reports instantiation fallback after a successful fetch", async () => {
  const originalFetch = globalThis.fetch;
  const diagnostics: CollisionKernelFallbackDiagnostic[] = [];
  globalThis.fetch = mockFetch(() => Promise.resolve(new Response(new Uint8Array([0, 1, 2, 3]))));

  try {
    const kernel = await createCollisionKernel({
      url: "https://cdn.example/bad-collision-kernel.wasm",
      onFallback: (diagnostic) => diagnostics.push(diagnostic)
    });

    expect(kernel.backend).toBe("typescript");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].reason).toBe("instantiate");
    expect(diagnostics[0].url).toBe("https://cdn.example/bad-collision-kernel.wasm");
    expect(diagnostics[0].error).toBeInstanceOf(Error);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collision kernel exposes wasm-backed circle rect when artifact loads", async () => {
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
    expect(kernel.circleRectOverlap({ x: 5, y: 5, r: 2 }, { x: 6, y: 5, w: 4, h: 4 })).toBe(true);
    expect(kernel.circleRectOverlap({ x: 0, y: 0, r: 2 }, { x: 6, y: 5, w: 4, h: 4 })).toBe(false);
    expect(kernel.testCircleRectOverlap(5, 5, 2, 6, 5, 4, 4)).toBe(true);
    expect(kernel.testCircleRectOverlap(0, 0, 2, 6, 5, 4, 4)).toBe(false);
    expect(kernel.pointInRect(7, 7, 6, 5, 4, 4)).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
