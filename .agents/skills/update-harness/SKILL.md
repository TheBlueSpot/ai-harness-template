---
name: update-harness
description: >
  Harness-specific engineering defaults for Bun-first runtime/build/test flow,
  typed websocket contracts, zod validation, local-first persistence, Solid UI
  behavior, and required coverage for core changes. Use when changing harness
  CLI/UI/shared protocol/docs or when applying harness repository preferences.
---

Apply when work touches harness behavior, defaults, protocol shape, runtime wiring, UI ergonomics, or harness docs.

## Scope

- Use for `harness/**`, `scripts/**`, root Bun or TypeScript config, websocket contract docs, and harness-facing README updates.
- Treat `/context` as search source for harness knowledge before guessing.

## Ideal Harness Shape

- Local-first coding harness.
- Typed websocket command bridge between UI and backend.
- Explicit contracts instead of stringly commands.
- Plan-first execution and verification flow.
- Local persistence for workspace, project, thread, and chat history unless repo docs explicitly change strategy.

## Runtime And Architecture

- Prefer Bun APIs and Bun runtime features when possible.
- Use Bun TypeScript for harness internals unless lower-level code gives a clear extreme performance win.
- Never execute raw shell commands from websocket input.
- Keep command handling behind a narrow, typed bridge.
- Fail fast on invalid input, malformed payloads, and unexpected message types.
- Validate unknown payloads with zod at boundaries.
- Keep development local-first.
- Do not reintroduce old OpenAI-only restriction. Current harness can support multiple providers.
- Developer builds must keep toggleable debugging and tracing. Preserve or improve existing debug switches instead of removing them.

## TypeScript Preferences

- Prefer inferred function return types over explicit return annotations.
- Use explicit return annotations only when needed for a stable external contract or when inference is genuinely insufficient.
- Do not use `as any` or `as unknown`.
- Prefer zod validation, parser helpers, narrowing helpers, and typed adapters over unsafe casts.
- Prefer explicit typed contracts over ad hoc string commands.

## File And Build Preferences

- Keep filenames and directories in kebab-case.
- Use Bun latest syntax for scripts, tests, and generated files.
- For script invocation and repo automation glue, prefer TypeScript executed with Bun over Python or shell when adding new paths.
- Prefer Bun-native build and runtime APIs such as `Bun.build`, `Bun.file`, `Bun.write`, `Bun.spawn`, and `bun test` when they fit.
- Do not require `bun run build:ui` by default for routine dev-feature work when typecheck and tests already cover the change.
- Consider `bun run build:ui` when work touches production build behavior, deployment wiring, asset serving, bundling, or build complexity high enough that test plus typecheck coverage is not convincing.

## UI Preferences

- Harness UI should stay tight by default. New chrome must earn its visual footprint in dense workflows.
- Do not duplicate status, controls, or summaries across header, chat, trace, and local subpanes unless the duplication removes a real workflow break.
- Prefer compact embedded tab strips, pills, or progressive disclosure over large standalone cockpit cards when exposing secondary panes inside an existing surface.
- Prefer shadcn-style Solid components for UI primitives already established in repo.
- Prefer `lucide-solid` for icons.
- If a UI pattern, interaction pattern, or UI-adjacent behavior is likely to be reused, create or extend a shared primitive immediately instead of duplicating markup, classes, or behavior.
- Do not wait for a third copy. First-use is enough when reuse is likely.
- Shared visual behavior belongs in `harness/ui/src/components/primitives/**`.
- Shared higher-level UI behavior belongs in a dedicated wrapper component near the feature or in `components/primitives/**` if broadly reusable.
- Shared primitives and main reusable containers must expose root `data-test-${component-name}` hooks in kebab-case.
- All modal and dialog surfaces must use the shared `Dialog` primitive.
- Dialogs must keep `title` required, close on `Escape`, and default their content body to `max-height: 80vh` plus `overflow: auto`.
- Dialog call sites should not reimplement shell layout, close behavior, or scroll containment unless a documented exception exists.
- All button-like interactions must use `Button`, `ActionButton`, or a derivative built on top of them.
- Preserve existing shared button interaction rules, including `cursor: pointer`.
- Repeated icon-dismiss actions should become a shared derivative instead of repeated raw button markup.
- Checkbox, switch, and toggle-style controls must use a shared primitive rather than repeated checkbox-plus-label card markup.
- Shared toggle primitives must own consistent label, description, disabled, cursor, and click-target behavior.
- When behavior is likely to be reused but is not visual, extract a shared helper, hook, or adapter at introduction time rather than duplicating logic.
- Repeated prop pass-through is a smell. Shared commands and shared state should move into Solid store or context instead of being drilled through intermediate components.
- Keep Tailwind classes in canonical form. Prefer official utilities and canonical CSS variable shorthand over arbitrary-value spellings when Tailwind can express same style directly.
- Treat Tailwind canonical-class diagnostics as part of normal quality bar. Editor hints should stay clean, and lint should enforce same preference in CI.
- Every button must have tooltip copy.
- Disabled buttons must explain why in tooltip copy.
- Icon-only list actions must use icons plus accessible labels.
- Surface caught UI and command errors through toast notifications.

## Testing Preferences

- Core functionality updates must be thoroughly covered with both unit tests and integration tests before done.
- Treat websocket protocol, workspace persistence, planning or run lifecycle, preferences storage, worktree orchestration, and shared UI state or transport logic as core functionality.
- Pure copy, content, or visual-only layout tweaks without behavior change do only need unit testing.
- Prefer colocated harness tests next to source files.
- Backend websocket integration tests are authoritative for command, protocol, and run lifecycle behavior.
- Add focused UI or store tests for local branching logic, plus integration tests when behavior crosses component or transport boundaries.
- For core harness changes, run `bun test` and `bun run typecheck` unless blocked. If blocked, state exact blocker.
- Run `bun run build:ui` only when the change meaningfully risks production build output or asset delivery behavior.

## Docs

- Keep README updates high-level.
- Prefer linking to context and skill docs over embedding code-heavy explanations.

