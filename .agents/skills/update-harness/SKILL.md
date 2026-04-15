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
- Prefer Bun-native build and runtime APIs such as `Bun.build`, `Bun.file`, `Bun.write`, `Bun.spawn`, and `bun test` when they fit.
- Do not require `bun run build:ui` by default for routine dev-feature work when typecheck and tests already cover the change.
- Consider `bun run build:ui` when work touches production build behavior, deployment wiring, asset serving, bundling, or build complexity high enough that test plus typecheck coverage is not convincing.

## UI Preferences

- Prefer shadcn-style Solid components for UI primitives already established in repo.
- Prefer `lucide-solid` for icons.
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
