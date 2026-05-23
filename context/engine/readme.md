# Engine

`./engine` is the shared migration target for catalog games that already run directly in the browser. The API stays small: game entries keep their own input meaning, game state, assets, audio, and deep rendering choices. The engine owns reusable canvas bootstrapping, timing, raw keyboard and pointer input primitives, canvas object event delegation, stage ordering, deterministic grid helpers, deterministic collision helpers, POJO pooling, viewport camera transforms, stateless canvas drawing helpers, a narrow WASM collision boundary, and opt-in canvas post-processing helpers.

## Catalog Findings

The catalog repeats a few patterns across otherwise independent games:

- `requestAnimationFrame` loops with clamped delta time.
- Canvas creation, context setup, high-DPI sizing, and direct browser startup code.
- Keyboard action mapping with pressed, held, and released transitions.
- Mouse and touch pointer normalization for canvas play surfaces.
- Canvas object event delegation for click and hover affordances.
- Grid coordinate checks and cell identity helpers.
- Simple deterministic collision checks.
- Camera panning, zooming, and target following.
- Repeated canvas post effects for tone and impact once gameplay readability is already stable.
- Game-local HUD, audio, art, level data, and rendering.

The first proof migrations cover distinct control models:

- `./games/snake-pit-arena`: real-time grid arena movement with held direction and boost input.
- `./games/chips-circuit`: discrete puzzle movement with one-step action input and force-floor timing.

## Layout

```text
engine/
  readme.md
  src/
    index.ts
    runtime/loop.ts
    runtime/object-pool.ts
    runtime/stage.ts
    input/keyboard.ts
    input/pointer.ts
    input/delegation.ts
    math/collision.ts
    math/grid.ts
    canvas/bootstrap.ts
    canvas/camera.ts
    canvas/drawing.ts
    canvas/text.ts
    canvas/post-processing.ts
    wasm/collision-kernel.ts
  browser/engine.js
  wasm/
    collision-kernel.wat
    collision-kernel.wasm
```

`./engine/src/index.ts` is the TypeScript source entry. `./engine/browser/engine.js` is a checked-in browser ESM build so migrated games remain directly playable without a repo-wide build step.

## Local Commands

Run engine commands from `./engine`:

- `bun run build`: rebuilds the checked-in browser ESM file.
- `bun run build:types`: refreshes declaration artifacts under `./dist`.
- `bun run typecheck`: runs the source TypeScript gate.
- `bun run check`: typechecks source and tests, rebuilds browser/declaration artifacts, runs package and Vite WASM asset smoke checks, and runs engine tests.
- `bun run release:package-consumer`: runs the slower packed external-consumer proof for release candidates.
- `bun run test`: runs the engine test suite.

## Package Contract

The package identity is `@catalog/engine` at `0.1.x`. It is not private, and the package entry exports generated declarations from `./dist` with the checked-in browser ESM build as the runtime import. Keep the browser public surface behind `./engine/src/index.ts`; package consumers should import from `@catalog/engine`, while repo-local games can keep direct browser imports from `./engine/browser/engine.js`.

Tooling and server-side consumers that only need deterministic primitives can import `@catalog/engine/core`. That subpath exposes math, grid, object-pool, and stage helpers without canvas, input, animation-frame, or WASM loader globals.

Published files are limited to the browser build, declaration output, WASM artifact, and this README. Run `bun run check` before release so browser build, declaration artifacts, source and fixture type gates, package smoke, pinned Vite WASM asset URL handling, tests, and WASM parity/benchmark coverage agree. For public package release candidates, also run `bun run release:package-consumer`; it packs the package into a temporary external consumer and verifies installed import, type, and WASM subpath behavior outside the fast automation lane.

## Public API

- `createFixedStepLoop(options)`: RAF timing, delta clamping, pause, resume, running-state readback, and update/render ordering.
- `init(options)`: creates or attaches a canvas, acquires a 2D/WebGL context, silences canvas context menus, applies device-pixel-ratio backing resolution, manages fit or letterbox sizing, and runs a simple RAF loop with `deltaTime` and `elapsedTime` readback.
- `createObjectPool(options)`: fixed-capacity reuse for hot-path POJO entities and effects.
- `createStage(options)`: POJO entity spawn, update, removal, and render ordering by numeric `layer`; higher layers draw later.
- `createKeyboardActions(bindings)`: maps keyboard codes to stable action state and explicit pressed, held, and released transitions.
- `createPointerInput(canvas)`: normalizes mouse and touch input into canvas-space pointer snapshots.
- `createCanvasObjectEvents(canvas, objects)`: delegates pointer clicks and hover events to hit-tested canvas objects.
- `createCamera(options)`: viewport camera state for panning, anchored zooming, following targets with optional deadzones and smoothing, world/screen coordinate conversion, and scoped canvas transforms.
- `registerSprite(id, image)`, `drawSprite(id, x, y, options)`, and `drawSpriteSlice(id, x, y, frameIndex, options)`: stateless sprite drawing and data-driven sheet slicing for game-owned animation counters.
- `drawRect`, `drawCircle`, `drawLine`, and `drawPolygon`: primitive drawing for prototypes, debug overlays, and minimalist geometry games.
- `pushTransform(options)` and `popTransform(options)`: stack-based canvas transforms for grouped movement, rotation, scale, and alpha.
- `loadFont`, `registerFont`, `textReady`, `measureText`, and `drawText`: custom font registration plus text drawing and measurement.
- `clamp`, `rectsOverlap`, `circleRectOverlap`, `testCircleRectOverlap`: deterministic collision helpers.
- `gridKey`, `inBounds`, `sameCell`, `opposite`: deterministic grid helpers.
- `resolveCollisionKernelWasmUrl(options)`: resolves the packaged collision WASM asset from the current engine module URL or an explicit base URL.
- `createCollisionKernel(options)`: loads the WASM collision module when available and falls back to the TypeScript helper. The default URL comes from `resolveCollisionKernelWasmUrl()`, and package consumers can opt into fallback diagnostics when debugging asset hosting.
- `createPostProcessStack(effects)`: ordered canvas post-processing pass for pixel effects and overlay effects.
- `getPostProcessEffectCost`, `summarizePostProcessCost`, and `checkPostProcessBudget`: explicit post-processing cost readback for overlay, pixel, and distortion tiers before games commit full-canvas work to the render loop.
- Post helpers cover grayscale, invert, brightness, contrast, sepia, threshold, vignette, tint, posterize, gamma, bloom, chromatic aberration, CRT scanlines, glitch, screen shake, motion blur, pixelate, color grading, film grain, lens flare, radial blur, shockwave distortion, scanline flicker, color fringe, neon glow, retro dithering, chromatic distortion, heat haze, star streak, flashbang, barrel distortion, color LUT mapping, and digital noise.

Post-processing tiers are deliberately blunt. `overlay` effects draw with normal canvas commands or compositing and do not require pixel readback. `pixel` effects share one stack-level `getImageData` and `putImageData` pass but still touch every pixel. `distortion` effects perform dedicated source-to-output canvas passes and should stay rare, opt-in, and guarded by a game-local budget.

## WASM Boundary

WASM is limited to deterministic hot-path math. The compiled module at `./engine/wasm/collision-kernel.wasm` is generated from `collision-kernel.wat` and currently exposes only `circle_rect_overlap`.

The module accepts numbers, returns a numeric boolean, and never touches DOM, rendering, input, assets, audio, timers, random state, or game state. The engine check includes parity and benchmark coverage for this boundary. Broader simulation should stay in TypeScript until multiple migrated games prove a shared hot path.

Package consumers can use the default `createCollisionKernel()` path when the package layout is hosted as emitted, because the engine resolves `../wasm/collision-kernel.wasm` from the browser ESM build. Bundlers that rewrite asset URLs should import the explicit WASM asset URL subpath and pass that resolved URL into `createCollisionKernel(url)`. Native static hosts should serve the asset with `application/wasm` for streaming instantiation; when MIME type, CSP, hosting, or non-browser runtime constraints block the asset, the kernel uses the deterministic TypeScript fallback. Fallback remains quiet by default for games; pass `onFallback` when package setup needs fetch, instantiation, or export-shape diagnostics.

## Migration Pattern

Games import the browser build:

```js
import { init, createKeyboardActions, createStage } from "../../engine/browser/engine.js";
```

Keep game-specific logic inside `./games/<slug>/`. Move only repeated, deterministic, browser-agnostic primitives into `./engine`.

## Drawing Example

`./engine/examples/drawing-demo.html` is a direct browser-playable demo for stateless sprites, sprite-sheet slicing, primitive shapes, transform stacks, and text rendering.

Drawing APIs accept a `{ ctx }` option or use `setDrawContext(ctx)` during a render pass. Custom fonts load asynchronously with `loadFont(id, url)`, and games can await `textReady(id)` before depending on a font for exact measurement.
