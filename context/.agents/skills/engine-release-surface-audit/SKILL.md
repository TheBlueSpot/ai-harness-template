---
name: engine-release-surface-audit
description: Review ./engine package, TypeScript declaration, WASM asset, release-lane, and public API surface quality before expanding reusable primitives. Use when Codex needs an Orrn-style pass over engine DX, publication contracts, WASM boundary clarity, or release validation drift.
---

# Engine Release Surface Audit

## Overview

Use this skill when `./engine` work risks changing the reusable TypeScript/WASM library contract, public package surface, generated declarations, smoke lanes, or WASM delivery story. Goal: keep engine primitives small, typed, performant, and releaseable before adding new helpers.

This is not a broad game-design audit. It is for engine stewardship: abstraction quality, package DX, deterministic fallback behavior, declaration hygiene, subpath discipline, and validation lanes.

## Workflow

1. Read `./.agents/assistants/orrn.md`, `./engine/package.json`, and `./engine/readme.md` first.
2. Identify the current top engine gap from repository evidence, not from stale todo text alone.
3. Check the public surface before implementation:
   - root export belongs to browser-facing game consumers
   - `@catalog/engine/core` stays DOM-free and deterministic
   - future subpaths need a real consumer mode, not source-layout exposure
   - generated declarations must not leak `any`, private helper shapes, or source-only specifiers
4. Check the WASM boundary before widening it:
   - TypeScript remains the authoritative deterministic fallback
   - WASM stays limited to proven hot-path math
   - asset URL handling stays explicit and host/bundler-friendly
   - diagnostics stay opt-in so games keep quiet fallback semantics
5. Check release lanes separately:
   - fast automation gate: local metadata, generated artifacts, importability, package smoke, pinned bundler asset proof, tests
   - slow release proof: packed installed-artifact consumer lane
   - current-version drift checks stay separate from deterministic release gates
6. If implementation is needed, keep edits inside `./engine` unless the repo evidence proves a shared workflow gap.
7. Update Orrn notes with one concise learning or todo only when the evidence changes the next durable priority.

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
```

Use `bun.cmd run check` only when the change crosses multiple engine contracts or before treating the full fast lane as green.

## Guardrails

- Do not expand WASM kernels without batched APIs, parity tests, and benchmark gates.
- Do not add root exports for one game's convenience.
- Do not add broad subpaths unless a distinct consumer job is already proven.
- Do not make fallback diagnostics noisy by default.
- Do not replace pinned release gates with rolling latest-version checks.
- Do not edit `./harness`.

## Current Orrn Evidence

- Engine package, WASM URL resolution, DOM-free core export, post-processing cost tiers, benchmark parity, strict public-source typing, test-fixture typechecking, and camera declaration hygiene are green.
- The slow packed external-consumer proof exists as `release:package-consumer`; keep it visible as the deliberate release lane.
- The next recurring risks are release-lane visibility, current Vite drift tracking outside pinned `check`, and public API pruning before helper growth.
