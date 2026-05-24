# Engine

`./engine` is the shared migration target for catalog games that already run directly in the browser. The API stays small: game entries keep their own input meaning, game state, assets, audio, and deep rendering choices. The engine owns reusable canvas bootstrapping, timing, raw keyboard and pointer input primitives, canvas object event delegation, stage ordering, deterministic grid helpers, deterministic collision helpers, opt-in collision broadphase indexing, POJO pooling, viewport camera transforms, stateless canvas drawing helpers, tagged tile-map generation and queries, a narrow WASM collision kernel, and opt-in canvas post-processing helpers.

## Catalog Findings

The catalog repeats a few patterns across otherwise independent games:

- `requestAnimationFrame` loops with clamped delta time.
- Canvas creation, context setup, high-DPI sizing, and direct browser startup code.
- Keyboard action mapping with pressed, held, and released transitions.
- Mouse and touch pointer normalization for canvas play surfaces.
- Canvas object event delegation for click and hover affordances.
- Grid coordinate checks and cell identity helpers.
- Simple deterministic collision checks.
- Passive broadphase candidate queries for collision-heavy scenes.
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
  assembly/
    collision-kernel.ts
  src/
    index.ts
    runtime/loop.ts
    runtime/object-pool.ts
    runtime/stage.ts
    input/keyboard.ts
    input/pointer.ts
    input/delegation.ts
    math/collision.ts
    math/broadphase.ts
    math/grid.ts
    canvas/bootstrap.ts
    canvas/camera.ts
    canvas/drawing.ts
    canvas/text.ts
    canvas/post-processing.ts
    map/
      index.ts
    wasm/collision-kernel.ts
  browser/engine.js
  wasm/
    collision-kernel.wasm
```

`./engine/src/index.ts` is the TypeScript source entry. `./engine/browser/engine.js` is a checked-in browser ESM build so migrated games remain directly playable without a repo-wide build step.

## Local Commands

Run engine commands from `./engine`:

- `bun run build`: rebuilds the checked-in browser ESM file.
- `bun run build:types`: refreshes declaration artifacts under `./dist`.
- `bun run typecheck`: runs the source TypeScript gate.
- `bun run bench`: runs the batched collision benchmark gate.
- `bun run check`: typechecks source and tests, rebuilds browser/declaration artifacts, runs fast package smoke checks, and runs engine tests.
- `bun run release:package-consumer`: runs the slower packed external-consumer proof for release candidates.
- `bun run release:wasm-asset`: runs the pinned Vite proof for the explicit WASM asset URL recipe.
- `bun run release:wasm-hosting`: runs the native static-host proof for serving the checked-in WASM asset with `application/wasm`.
- `bun run smoke:vite-wasm-asset:current`: runs the non-release current Vite compatibility drift check for the explicit WASM asset URL recipe.
- `bun run test`: runs the engine test suite.

## Package Contract

The package identity is `@catalog/engine` at `0.1.x`. It is not private, and the package entry exports generated declarations from `./dist` with the checked-in browser ESM build as the runtime import. Keep the browser public surface behind `./engine/src/index.ts`; package consumers should import from `@catalog/engine`, while repo-local games can keep direct browser imports from `./engine/browser/engine.js`.

Tooling and server-side consumers that only need deterministic primitives can import `@catalog/engine/core`. That subpath exposes math, grid, object-pool, and stage helpers without canvas, input, animation-frame, or WASM loader globals.

Published files are limited to the browser build, declaration output, WASM artifact, and this README. Camera fluent methods intentionally return the closed camera instance and avoid implementation `this` coupling, so generated declarations stay tied to the named public `Camera` type.

## Import Choices

Use the root package for browser-facing games that want the full public surface:

```ts
import { init, createFixedStepLoop, createCollisionKernel } from "@catalog/engine";
```

Use `@catalog/engine/browser` only when package tooling needs an explicit browser subpath. It shares the root declarations and runtime build; it is not a separate API family.

Use `@catalog/engine/core` for deterministic tooling, tests, and server-side consumers that need no DOM, RAF, canvas, input globals, or WASM asset loading:

```ts
import { clamp, createStage, gridKey } from "@catalog/engine/core";
```

Repo-local browser games can keep direct imports from the checked-in browser artifact so each game remains playable from its folder without a build step:

```js
import { init } from "../../engine/browser/engine.js";
```

Bundlers that rewrite static assets should import the explicit WASM URL subpath and pass that URL into the kernel loader:

```ts
import wasmUrl from "@catalog/engine/wasm/collision-kernel.wasm?url";
import { createCollisionKernel } from "@catalog/engine";

const kernel = await createCollisionKernel(wasmUrl);
```

Use `createCollisionKernel()` without arguments only when the emitted package layout is hosted as-is and `../wasm/collision-kernel.wasm` is reachable from the browser build. Serve the asset as `application/wasm` for streaming instantiation. If hosting, MIME, CSP, or runtime constraints block WASM, the TypeScript fallback remains authoritative and quiet by default; pass `onFallback` when setup needs diagnostics.

## Verification Lanes

Run `bun run check` before normal engine handoff. It typechecks source and tests, rebuilds browser, WASM, core, and declaration artifacts, runs fast package smoke, and runs the engine test suite.

Run `bun run release:package-consumer` for public package release candidates. It packs the package into a temporary external consumer and verifies installed root import, `@catalog/engine/browser`, `@catalog/engine/core`, Bundler and NodeNext declaration consumers, and WASM subpath behavior outside the fast automation lane.

Run `bun run release:wasm-asset` when validating the pinned Vite WASM asset URL recipe. Keep it separate from `check` because it creates a temporary Vite consumer and may depend on package-manager cache or network state.

Run `bun run release:wasm-hosting` when validating native static hosting. It proves the checked-in browser build can load the checked-in WASM artifact from a served `application/wasm` URL and still exercise scalar plus batched kernel calls on the WASM backend.

Run `bun run smoke:vite-wasm-asset:current` only as an explicit drift check against the latest Vite release. It is not deterministic release proof.

## Public API

The root package is intentionally browser-facing. Keep root exports for primitives that a direct browser game can import without building its own platform layer: canvas setup, frame loops, raw input adapters, stage/object pooling, camera transforms, drawing/text helpers, collision helpers, WASM collision loading, and explicit post-processing budget helpers.

`@catalog/engine/core` is the deterministic, DOM-free surface for tooling, tests, and non-browser consumers. Math, grid, object-pool, and stage primitives that do not depend on canvas, input globals, RAF, or WASM asset loading belong there as well as on root when browser games need them.

Do not promote new helpers to root only because a single game needs them. Prefer game-local code until at least two migrated entries prove the same abstraction. Add future subpaths only for distinct consumer jobs with their own package proof; do not expose source-layout folders as API.

- Keep on root: `createFixedStepLoop`, `init`, keyboard/pointer/canvas-object input helpers, hardware gamepad helpers, camera, drawing/text helpers, deterministic collision/grid helpers, passive collision broadphase helpers, tagged tile-map helpers, WASM collision loading, and costed post-processing helpers.
- Keep on `@catalog/engine/core`: object-pool, stage, collision, broadphase, vector, ray, and grid helpers that stay DOM-free.
- Defer to future focused subpaths: on-screen touch controls, any richer renderer, asset pipeline, audio system, scene graph, physics expansion, Node-native WASM loader, or editor/tooling API.
- Keep game-local: game action semantics, HUD, audio choices, art loading policy, level data, economy/progression systems, enemy AI, and one-off visual effects.

- `createFixedStepLoop(options)`: RAF timing, delta clamping, pause, resume, running-state readback, update/render ordering, and optional legacy global input frame advancement.
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
- `createCollisionBroadphase(options)`: opt-in R-tree-style AABB index for passive collision candidate management. Consumers own entity state and pass ids plus bounds through `upsert`, `remove`, or `rebuild`; games query candidates or unique pairs before running narrowphase checks.
- `gridKey`, `inBounds`, `sameCell`, `opposite`: deterministic grid helpers.
- `createTileset`, `createTileMap`, `generateTileMap`, `renderTileLayer`, `getTileAt`, `worldToTile`, `tileToWorld`, `extractCollisionRects`, and `seededRandom`: tagged tile-sheet definitions, compact tile layers, deterministic generated maps, visible canvas tile rendering, spawn marker placement, and collision extraction for browser games that keep their art and rules local.
- `resolveCollisionKernelWasmUrl(options)`: resolves the packaged collision WASM asset from the current engine module URL or an explicit base URL.
- `createCollisionKernel(options)`: loads the WASM math module when available and falls back to the TypeScript helper. The default URL comes from `resolveCollisionKernelWasmUrl()`, and package consumers can opt into fallback diagnostics when debugging asset hosting. The kernel also exposes batched movement integration, point rotation, range filtering, rect collision, and circle/rect collision helpers.
- `createPostProcessStack(effects)`: ordered canvas post-processing pass for pixel effects and overlay effects.
- `getPostProcessEffectCost`, `summarizePostProcessCost`, and `checkPostProcessBudget`: explicit post-processing cost readback for overlay, pixel, and distortion tiers before games commit full-canvas work to the render loop.
- `postProcessApiProfiles`: stability, cost-tier, proof, promotion, and exposure classification for each exported post-processing helper, so games can keep stable root API separate from quarantined prototype-root spectacle helpers and avoid treating one migrated proof as family-wide promotion.
- Post helpers cover grayscale, invert, brightness, contrast, sepia, threshold, vignette, tint, posterize, gamma, bloom, chromatic aberration, CRT scanlines, glitch, screen shake, motion blur, pixelate, color grading, film grain, lens flare, radial blur, shockwave distortion, scanline flicker, color fringe, neon glow, retro dithering, chromatic distortion, heat haze, star streak, flashbang, barrel distortion, color LUT mapping, and digital noise.

Post-processing tiers are deliberately blunt. `overlay` effects draw with normal canvas commands or compositing and do not require pixel readback. `pixel` effects share one stack-level `getImageData` and `putImageData` pass but still touch every pixel. `distortion` effects perform dedicated source-to-output canvas passes and should stay rare, opt-in, and guarded by a game-local budget.

Stable post-processing API is the stack, cost/budget readback, deterministic pixel filters, `screenShake`, and `crtScanlines`. Prototype helpers are root-exposed only under `prototype-root` quarantine for direct browser games. `flashbang` has one migrated-game proof but remains prototype; blur, glow, flare, flicker, chromatic, motion, radial, pixelate, distortion, haze, and glitch effects remain candidate-only until migrated-game proof shows smaller call sites with timing, intensity, readability, HUD, audio, art, and rules still owned by the game. A failed fit audit is not promotion evidence: if a candidate only matches a shader/composer pipeline, positional game art, or one-off timing behavior, keep that effect prototype or game-local instead of widening the engine surface.

## WASM Boundary

WASM is limited to deterministic hot-path math. The compiled module at `./engine/wasm/collision-kernel.wasm` is generated from AssemblyScript in `./engine/assembly/collision-kernel.ts` with SIMD enabled.

AssemblyScript is the kernel source. The WASM build owns the batched SIMD hot paths, while TypeScript owns the memory views, scalar-compatible fallback behavior, and release-time parity checks. The module still stays inside deterministic math, writes batch masks or transformed values into caller-owned arrays, and never touches DOM, rendering, input, assets, audio, timers, random state, or game state. Broader simulation should stay in TypeScript until multiple migrated games prove a shared hot path.

Package consumers can use the default `createCollisionKernel()` path when the package layout is hosted as emitted, because the engine resolves `../wasm/collision-kernel.wasm` from the browser ESM build. Bundlers that rewrite asset URLs should import the explicit WASM asset URL subpath and pass that resolved URL into `createCollisionKernel(url)`. Native static hosts should serve the asset with `application/wasm` for streaming instantiation; when MIME type, CSP, hosting, or non-browser runtime constraints block the asset, the kernel uses the deterministic TypeScript fallback. Fallback remains quiet by default for games; pass `onFallback` when package setup needs fetch, instantiation, or export-shape diagnostics.

## Migration Pattern

Games import the browser build:

```js
import { init, createKeyboardActions, createStage } from "../../engine/browser/engine.js";
```

Keep game-specific logic inside `./games/<slug>/`. Move only repeated, deterministic, browser-agnostic primitives into `./engine`.

## Drawing Example

`./engine/examples/drawing-demo.html` is a direct browser-playable demo for stateless sprites, sprite-sheet slicing, primitive shapes, transform stacks, and text rendering.

`./engine/examples/magic-map-shmup/index.html` is a direct browser-playable demo for tagged tilesets, seeded map generation, tile rendering, map queries, collision extraction, and marker-driven spawns.

Drawing APIs accept a `{ ctx }` option or use `setDrawContext(ctx)` during a render pass. Custom fonts load asynchronously with `loadFont(id, url)`, and games can await `textReady(id)` before depending on a font for exact measurement.
