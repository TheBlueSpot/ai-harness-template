# Orrn Game Pattern Scan

## Scope

Scanned five varied browser-playable entries:

- `./games/panel-panic`
- `./games/tower-hologram`
- `./games/zuma-sunburst`
- `./games/motherload-core`
- `./games/xevious-sky-assault`
- `./games/bubble-cluster`

The cut focuses on repeated local patterns around input handling, frame loops, collision/path logic, camera or canvas sizing, asset loading, and hot-path object churn.

## Repeated Pattern Evidence

| Pattern | Games | Evidence | Candidate primitive | Judgment |
|---|---|---|---|---|
| RAF loop with clamped or fixed delta, then update/render split | `panel-panic`, `motherload-core`, `xevious-sky-assault`, `zuma-sunburst`, `bubble-cluster`, `tower-hologram` | `panel-panic` runs `requestAnimationFrame(frame)` and maintains its own frame loop; `motherload-core` clamps dt to `0.033` before `game.update(dt, input)`; `xevious-sky-assault` updates then schedules `window.requestAnimationFrame(tick)`; `zuma-sunburst` and `bubble-cluster` do the same; `tower-hologram` has its own `frame` loop plus `requestAnimationFrame(frame)` | `createFixedStepLoop` / `init` | Belongs in `./engine` if the same loop contract keeps showing up across entries. Repeated pressure is already present across more than two games. |
| Canvas sizing and DPR handling | `tower-hologram`, `motherload-core`, `zuma-sunburst`, `xevious-sky-assault`, `bubble-cluster`, `panel-panic` | `tower-hologram` reads `getBoundingClientRect()` and writes `canvas.width`/`canvas.height` using `devicePixelRatio`; `motherload-core` does the same in `resizeCanvas`; `zuma-sunburst` and `xevious-sky-assault` both resize against DPR; `bubble-cluster` and `panel-panic` also manage canvas sizing directly | `init`, `canvas/bootstrap`, fit or letterbox sizing | Belongs in `./engine` as shared platform code. This is repeated across unrelated games and is not game-semantic. |
| Keyboard action state and pressed/held/released style input bookkeeping | `panel-panic`, `motherload-core`, `xevious-sky-assault`, `zuma-sunburst`, `bubble-cluster` | `panel-panic` tracks keydown/keyup state and uses it to drive the loop; `motherload-core` keeps a dedicated `input` object with booleans for movement, start, shop, and pointer-start; `xevious-sky-assault` and `zuma-sunburst` map keyboard and pointer events into game-local control state; `bubble-cluster` has separate `firePressed`, `startPressed`, and held flags | `createKeyboardActions` / `createPointerInput` | Belongs in `./engine` when the abstraction remains thin and preserves game-specific bindings. This is repeated enough to justify a shared adapter layer. |
| Pointer normalization from event coordinates to canvas space | `tower-hologram`, `zuma-sunburst`, `bubble-cluster` | `tower-hologram` uses `canvas.getBoundingClientRect()` for placement hover and click logic; `zuma-sunburst` converts `clientX/clientY` into canvas coordinates in `pointerFromEvent`; `bubble-cluster` performs the same conversion in `toCanvasPoint` | `createPointerInput` | Belongs in `./engine` because the math is identical and only the game action changes. |
| Path / collision helper duplication that stays deterministic | `tower-hologram`, `xevious-sky-assault`, `bubble-cluster`, `panel-panic` | `tower-hologram` already carries a dedicated `Pathfinder` plus blocker updates and route queries; `xevious-sky-assault` has enemy wave and radar logic with repeated clamping and spawn bookkeeping; `bubble-cluster` contains motion and shot state bookkeeping; `panel-panic` tracks chain clears, collision-ish row checks, and line-fill effects locally | `grid helpers`, `deterministic collision helpers`, or local-only math | Mixed. The shape belongs in `./engine` only where the helper is generic and repeated. The game-specific route logic, wave logic, and puzzle clear rules stay local. |
| Asset loading bootstrap | `tower-hologram` | `loadAssets()` resolves image/audio manifest entries and uses base-URL resolution for direct browser playability | `canvas/bootstrap` adjacent asset helper, or game-local loader | Do not promote from one game only. Keep local unless another game repeats the same manifest-driven loader shape. |

## Engine Candidate Judgments

### Belongs in `./engine`

- `createFixedStepLoop` or `init` for the repeated RAF + dt clamp + update/render split.
- `canvas/bootstrap` for shared canvas creation, DPR sizing, and resize handling.
- `createKeyboardActions` for action-state mapping with held and pressed semantics.
- `createPointerInput` for canvas-space pointer normalization.

### Does Not Belong Yet

- `Pathfinder` as a general engine primitive from `tower-hologram` alone. It is strong code, but the pressure is not yet broad enough across the catalog to justify a shared API from one game.
- `WaveManager` and tower-specific placement rules. These are tower-defense semantics, not reusable browser substrate.
- `panel-panic` board logic, clear chains, and audio pacing. These are game rules, not shared engine concerns.
- `xevious-sky-assault` radar/wave behavior and `bubble-cluster` shot lifecycle. Both are local domain rules.

## DX Delight Opportunities

- Make the common bootstrap path boring: one call for canvas sizing, RAF, and pointer/key wiring so games stop copying the same scaffolding.
- Keep the adapter thin enough that game authors still own action meaning, but do not make them hand-roll coordinate transforms or dt clamp code.
- Preserve direct browser playability by keeping the browser build as the runtime import surface, not a repo-wide build requirement.
- Add tiny docs examples for `init`, keyboard actions, and pointer input so new games can start from the same pattern instead of pasting old code.

## Next Engine Todo

Add a small browser bootstrap helper that covers:

- canvas creation or attachment,
- DPR-aware resize,
- RAF loop with clamped delta,
- optional input wiring hooks for keyboard and pointer adapters.

### Acceptance Criteria

- At least two existing entries can replace local bootstrap code with the helper without changing game rules.
- The helper stays thin: it must not pull in HUD, audio, or game state policy.
- The API must remain browser-facing and direct-playable.
- The change must be justified by repeated pressure across the scanned games, not a single-game pattern.

