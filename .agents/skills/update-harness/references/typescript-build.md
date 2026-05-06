# TypeScript And Build

Use this when touching TypeScript implementation style, build scripts, automation, Bun APIs, or build command flow. Use `general-conventions.md` for naming rules.

## TypeScript Preferences

- Prefer inferred function return types over explicit return annotations.
- Use explicit return annotations only when needed for a stable external contract or when inference is genuinely insufficient.
- Do not use `as any` or `as unknown`.
- Prefer zod validation, parser helpers, narrowing helpers, and typed adapters over unsafe casts.
- Prefer explicit typed contracts over ad hoc string commands.
- Keep domain types narrow. Normalize external input before parsing rather than widening internal unions.

## Bun Preferences

- Use Bun latest syntax for scripts, tests, and generated files.
- For script invocation and repo automation glue, prefer TypeScript executed with Bun over Python or shell when adding new paths.
- Prefer Bun-native build and runtime APIs such as `Bun.build`, `Bun.file`, `Bun.write`, `Bun.spawn`, and `bun test` when they fit.
- If `bun.ps1` is blocked by PowerShell execution policy, use `bun.cmd`.

## Build Preferences

- Do not require `bun run build:ui` by default for routine dev-feature work when typecheck and tests already cover the change.
- Consider `bun run build:ui` when work touches production build behavior, deployment wiring, asset serving, bundling, or build complexity high enough that test plus typecheck coverage is not convincing.
