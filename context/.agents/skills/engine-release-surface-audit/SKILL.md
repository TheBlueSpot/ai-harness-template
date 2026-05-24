---
name: engine-release-surface-audit
description: Review ./engine package, TypeScript declaration, WASM asset, release-lane, and public API surface quality before expanding reusable primitives. Use for engine release-surface drift, public API classification, WASM boundary clarity, or package DX proof, not generic game or engine maintenance.
---

# Engine Release Surface Audit

## Overview

Use this skill when `./engine` work risks changing the reusable TypeScript/WASM library contract, public package surface, generated declarations, smoke lanes, or WASM delivery story. Goal: keep engine primitives small, typed, performant, and releasable before adding new helpers.

This is not a broad game-design audit. It is for engine stewardship: abstraction quality, package DX, deterministic fallback behavior, declaration hygiene, subpath discipline, and validation lanes.

## Workflow

1. Read `./.agents/assistants/orrn.md`, `./engine/package.json`, and `./engine/readme.md` first.
2. Reconcile todos, learnings, and recent logs against current files and scripts before trusting any priority label.
3. Identify the current top engine gap from repository evidence, not from stale todo text alone.
4. Treat interruption-only job failures as no new engine evidence unless they include a concrete package, API, WASM, declaration, or consumer finding.
5. Check the public surface before implementation:
   - root export belongs to browser-facing game consumers
   - `@catalog/engine/core` stays DOM-free and deterministic
   - future subpaths need a real consumer mode, not source-layout exposure
   - broad root conveniences need a current stable/quarantine/defer call before new helper growth
   - treat resolved root-pruning items, such as deferred on-screen gamepad export exposure, as regression guards rather than active blockers
   - legacy global input, canvas, and post-processing helpers should be classified by consumer job, not by source proximity
   - package metadata casing must match files on disk, especially README/readme allowlists
   - generated declarations must not leak `any`, private helper shapes, or source-only specifiers
   - NodeNext declaration proof is required before widening package subpaths beyond the already-proven root/core/WASM asset contract
   - every exported package subpath must either carry a matching `types` condition with smoke coverage or be removed from the public manifest
6. Prove helper weight through adoption before adding API:
   - prefer migrating one existing canvas game onto already-public `init` or pointer primitives before adding new runtime helpers
   - preserve direct browser playability from the game folder during any migration
   - use the smallest candidate that already has a local loop, canvas ownership, and input meaning close to the current public primitive
   - for post-processing proof, pick a game that already has local bloom, shake, glow, blur, or distortion plumbing; do not add a new visual need just to justify the helper
   - compare the before/after call site by ownership: engine code may own generic effect math, while timing, intensity, readability budget, and trigger rules remain in the game
   - treat a migration as proof only when the resulting game code is simpler at the call site without hiding game-specific rules, HUD, audio, enemy behavior, or level data inside `./engine`
   - treat a failed migration as useful evidence when the helper makes the call site larger, obscures presentation control, harms readability, or needs new API to fit the game
   - classify repeated local loop/input/canvas patterns as candidate evidence, not as enough proof by themselves
   - keep HUD, audio policy, level data, enemy AI, combat rules, and presentation game-local unless multiple migrated consumers prove otherwise
7. After adoption proof, prune before growing:
   - scan broad root browser conveniences for real migrated consumers before treating them as permanent API
   - start with the broadest unproven exported convenience when no fresher evidence outranks it
   - treat root post-processing as the next weight audit when release proof and root/browser pruning are green
   - classify post-processing effects by consumer job and render-loop cost before adding effects, subpaths, or convenience wrappers
   - post-processing promotion needs a direct browser-playable migrated game importing an existing helper, replacing local effect plumbing, and preserving game-local readability, rules, HUD, audio, and presentation choices
   - repeated local bloom, shake, glow, or distortion code is candidate-discovery evidence only; it does not justify new root API, subpaths, renderer convenience, or WASM kernels by itself
   - classify each candidate as stable root API, focused browser-only contract, deprecated/deferred, or game-local
   - keep package smoke, generated declaration parity, and README wording aligned with any keep/move/defer decision
   - do not add replacement helpers during pruning unless migrated consumers prove a smaller durable shape
8. Check the WASM boundary before widening it:
   - TypeScript remains the authoritative deterministic fallback
   - WASM stays limited to proven hot-path math
   - asset URL handling stays explicit and host/bundler-friendly
   - diagnostics stay opt-in so games keep quiet fallback semantics
9. Check release lanes separately:
   - fast automation gate: local metadata, generated artifacts, importability, package smoke, pinned bundler asset proof, tests
   - normal `check` must not depend on hidden network or ambient package cache; split any package-manager fetch or current-tooling proof into an explicit drift lane
   - slow release proof: packed installed-artifact consumer lane plus pinned bundler-shaped asset lane, both with deterministic temp-root lifecycle, low disk pressure, and no hidden network
   - standalone smoke commands should either rebuild required artifacts or fail with explicit rebuild guidance
   - current-version drift checks stay separate from deterministic release gates
   - direct smoke failures after declaration-only work are artifact-state failures until `dist/core.js`, browser output, and declaration output are all present
10. Before creating or changing skills, inspect `./.agents/skills/` for an existing workflow that already owns the friction.
11. Create a new skill only for repeated, durable workflow friction that is broader than one engine bug or todo.
12. On recurring skill-finder passes, run a light all-skill structure and overlap scan, then refine the smallest existing workflow or Orrn note instead of adding another skill when the friction is already covered.
13. If implementation is needed, keep edits inside `./engine` or a single proven consumer game unless the repo evidence proves a shared workflow gap.
14. Update Orrn notes with one concise learning or todo only when the evidence changes the next durable priority.
15. For recurring Orrn skill-maintenance passes, prefer one of these outcomes: no change with a note, one narrow refinement to this workflow, or one assistant-owned todo. A new skill is justified only when the friction repeats outside release-surface, package-consumer, declaration, WASM delivery, or adoption-proof judgment.
16. If the fresh evidence only changes the active engine priority, update Current Evidence or Orrn notes instead of adding a new workflow.
17. When several consecutive skill-finder passes reach the same no-new-skill conclusion, treat that repetition as a stop signal for skill churn: preserve the existing workflow, refresh only stale evidence, and move the next real effort back to the engine adoption or quarantine todo.
18. If a skill-finder pass only rediscovers known green lanes such as camera declaration hygiene, fixed-step adoption, package subpath parity, deterministic WASM fallback, or loose benchmark parity, do not create another workflow; record only the evidence delta that changes promotion, quarantine, or release-lane priority.
19. When the top evidence is consumer-facing package-contract clarity rather than a broken package surface, treat it as docs/proof ergonomics for `./engine/readme.md`; do not turn it into a new workflow unless several packages or assistants repeat the same release-confusion pattern.
20. When docs/proof ergonomics are already current, move the next pass back to API weight, prototype quarantine, migrated-consumer proof, or benchmark evidence; do not create a benchmark or WASM skill unless real migrated hot paths or consumer setup failures repeat outside this workflow.
21. If several Orrn routines are running at once, keep skill-maintenance edits narrow and evidence-only unless the current run finds a distinct failure class; overlapping jobs are coordination evidence, not a reason to widen engine API or skill surface.
22. If a skill-finder pass finds only known no-new-skill evidence, make the smallest durable update in Orrn notes rather than editing skill instructions again; repeated confirmation is planning evidence, not workflow design evidence.

## Verification

Run the narrowest command that proves the touched contract. Prefer these from `./engine`:

```powershell
bun.cmd run typecheck
bun.cmd run typecheck:tests
bun.cmd run smoke:package
bun.cmd run smoke:vite-wasm-asset
bun.cmd test ./src/wasm
```

For release candidates or package-boundary changes, also run:

```powershell
bun.cmd run release:package-consumer
bun.cmd run release:wasm-asset
```

If the installed-artifact lane fails with `ENOENT`, check that the temp consumer root is created and verified before fixture reads or cleanup. If it fails with `ENOSPC`, remove stale temp artifacts and avoid BranchFS or full-repo copies before retrying.

If `smoke:package` fails after declaration-only work, check for a partial artifact state such as missing `dist/core.js`. Prefer running `bun.cmd run build` before retrying, or harden the smoke to report the stale/missing artifact directly.

Use `bun.cmd run check` only when the change crosses multiple engine contracts or before treating the full fast lane as green.

## Guardrails

- Do not expand WASM kernels without batched APIs, parity tests, and benchmark gates.
- Do not add root exports for one game's convenience.
- Do not add broad subpaths unless a distinct consumer job is already proven.
- Do not turn repeated hand-rolled game code into engine API until at least one real migration proves the consumer shape.
- Do not count an adoption scan as adoption proof; the proof is a direct browser-playable migrated game using the existing public primitive.
- Do not let one successful adoption proof become permission for helper growth; first prune or quarantine broad root conveniences that still lack migrated consumers.
- Do not treat documented post-processing cost tiers as proof that every effect belongs on the root API; migrated use and clear cost/readback boundaries still decide permanence.
- Do not promote post-processing prototypes from catalog scans alone; require one direct migrated game and smaller call-site proof first.
- Do not force a post-processing migration if the existing helper does not reduce local ownership or clarify the render path; record the mismatch and keep the helper classified as prototype/deferred.
- Do not treat the documented root API classification as permanent permission to grow; recheck consumer job, package proof, and game-local alternatives for each new helper.
- Do not make fallback diagnostics noisy by default.
- Do not replace pinned release gates with rolling latest-version checks.
- Do not treat a pinned dependency as deterministic if the lane still installs from network or relies on an unverified cache.
- Do not rely on package smoke alone for generated declaration hygiene; the declaration build should fail on artifact-level leaks such as `/*elided*/ any`.
- Do not treat a green Bundler-resolution consumer as proof that NodeNext declaration consumers are covered.
- Do not leave runtime-only package subpaths public; untyped subpaths are release-surface bugs even when the root export is typed.
- Do not prioritize new runtime API while the installed package-consumer release proof is weaker than the public package surface.
- Do not create narrow skills for single known release risks; refine the package or release-surface workflow unless the same friction has repeated across contexts.
- Do not add skill sprawl for recurring Orrn maintenance when the evidence still points to release-surface judgment, installed-artifact proof, or adoption-before-growth discipline.
- Do not edit `./harness`.

## Current Evidence

- Engine package, WASM URL resolution, DOM-free core export, post-processing cost tiers, benchmark parity, strict public-source typing, test-fixture typechecking, and camera declaration hygiene are green.
- Generated declaration hygiene is guarded at build time; keep that gate before package smoke.
- The slow packed external-consumer proof exists as `release:package-consumer` and uses deterministic offline artifact proof; the pinned bundler WASM URL recipe is split into `release:wasm-asset`.
- Bundler and NodeNext declaration consumers are both covered for the current root, core, and WASM asset exports.
- Root API classification is documented in `./engine/readme.md`; future helper growth must reapply that boundary instead of reopening broad root expansion by default.
- `@catalog/engine/browser` is now typed and covered by package smoke; keep it as regression evidence for subpath parity, not as the active top blocker.
- `./games/typing-zombie-siege` now proves existing `init` adoption without new engine API growth.
- `./games/bloons-pop` now proves the existing stable `screenShake` helper in a direct browser game; keep that as proof for the helper already shipped, not permission to promote prototype effects.
- `./games/bubble-cluster` now proves the existing prototype `flashbang` helper in one direct browser game; keep that proof scoped to `flashbang` until another helper earns its own smaller call site.
- On-screen gamepad root exposure has been deferred out of the public package surface; keep it as regression evidence, not the active blocker.
- The release-grade `release:package-consumer` and `release:wasm-asset` lanes are green; keep them as release-candidate proof while root post-processing weight becomes the next API-restraint audit before adding more browser convenience.
- `createFixedStepLoop` is now separable from legacy global input through `advanceGlobalInput`; classify it by consumer job rather than assuming loop runtime is legacy-coupled.
- Fixed-step loop adoption has enough current proof for the existing public shape; revisit it only for regression evidence, scoped-input friction, or a migrated consumer that exposes a smaller contract.
- The next recurring risks are helper proposals outrunning migrated consumer proof, partial artifact states in standalone smoke commands, typed subpath parity drift, and current-tool drift tracking outside deterministic release gates.
- Recent scanned games show repeated fixed-step loop, clamped delta, canvas sizing, grid bounds, and keyboard translation patterns; treat these as adoption candidates only when they lead to direct migrated-consumer proof, not as evidence for immediate helper growth.
- Current post-processing prototype evidence is profile/cost documentation, local game effect candidates, and one `flashbang` migrated call site. This does not prove prototype-family promotion, new renderer convenience, subpaths, or WASM kernels.
- One migrated prototype-helper proof should not graduate the whole post-processing family. Treat each prototype helper as individually guilty until it has a smaller real call site, clear game-local ownership boundaries, and either repeated migrated demand or a deliberately documented narrow stable role.
- After `screenShake` and `flashbang` migrated proofs, the remaining reusable risk is not a missing skill; it is per-helper promotion discipline for any later post-processing prototype.
- Benchmark parity, declaration guards, and fixed-step adoption are currently maintenance evidence, not skill-creation evidence. Reopen them only on fresh regression, migrated hot-path timing, or a new consumer contract.
- Repeated 2026-05-24 skill-finder passes found the same friction already covered here and in package-consumer proof: adoption-before-growth, typed subpath parity, artifact-state clarity, and deterministic release lanes. That repetition is evidence to stop adding workflow surface until a different class of failure appears.
- Current top Orrn work is consumer-facing package-contract clarity around root, browser, core, WASM asset URLs, fallback semantics, and release-lane meaning. That is documentation/proof ergonomics, not evidence for another skill or API surface.
- Latest 2026-05-24 live TS/WASM research still validates the current explicit package contract: TypeScript follows `exports` in modern resolution, Node treats exported subpaths as the visible surface, Vite supports caller-owned WASM asset URLs through explicit URL imports, and WebAssembly streaming remains MIME/CSP-sensitive. When package smoke is green, shift attention from package mechanics to API weight, prototype-helper quarantine, release-lane drift separation, and migrated-consumer proof before growth.
- Package-contract docs are now current enough that recurring maintenance should prefer root/browser API weight audit and per-helper post-processing quarantine over more skill churn.
- Latest Orrn state can have multiple assistant-owned routines running simultaneously. Treat that as a reason to avoid speculative skill churn and leave clear notes, not as evidence for new package surface or a new engine workflow.
- Latest skill-finder pass again found no missing reusable workflow. The durable next action remains root/browser API weight classification or one evidence-backed prototype-helper proof/quarantine, not another skill.
