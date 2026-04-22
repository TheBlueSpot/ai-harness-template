---
name: branchfs
description: >
  Canonical reference for driving BranchFS (the harness's local materialized
  mount with isolated diff/flush semantics) from scripts, new skills, or agent
  tooling. Load when you need to run a command, dev server, or experiment in
  an isolated copy of the repo without dirtying the host working tree; when
  extending anything under `scripts/**` or `harness/cli/src/**` that calls
  `BranchfsManager`; or when a user mentions "branchfs", "virtual branch",
  "isolated experiment", or "mount a copy of the repo".
---

## What BranchFS is

BranchFS is a local-first, git-aware materialized mount shim defined in `harness/cli/src/branchfs-manager.ts`. It preserves the command surface of a future true copy-on-write virtual filesystem while today being implemented with real `cp -r` + symlinks. Treat it as stable API; the implementation may change.

Each BranchFS "experiment" is:

- A run-scoped directory under `.local/branchfs/<runId>/`.
- A `mount/` subtree that is a copy of the repo (minus `.git` and `.local`).
- Passthrough symlinks for heavy, read-mostly directories: `node_modules`, `dist`, `.bun` (see `PASSTHROUGH_DIRECTORIES` in `branchfs-manager.ts`). Writes into these from inside the mount will affect the host — treat them as read-only.
- A `base/` snapshot captured at lease time so diffs can be read after edits.
- A `dirty-seed/` that mirrors the host's uncommitted changes, so screenshots/tests/experiments reflect the user's work-in-progress, not just `HEAD`.
- An `upper/` directory reserved for future CoW diff storage.
- A `meta/manifest.json` with `runId`, base commit SHA, base branch name, a dirty-state fingerprint, and a virtual branch name of the form `ai-experiment/<runId>`.

## When to use

Use BranchFS when all of:

1. You need to run a command (dev server, test, script) that would otherwise mutate the host working tree, `.local/harness.db`, `dist/`, etc.
2. You want the command to see the user's *current* uncommitted edits.
3. You want guaranteed cleanup on failure.
4. You're inside a git repository.

Do **not** reach for BranchFS when:

- The command only reads files (no mutation → no isolation needed).
- You're running a pure unit test with already-isolated fixtures.
- You're outside a git repo (`BranchfsManager` requires `git rev-parse --show-toplevel`).
- You need true multi-process concurrency against the same mount (BranchFS is per-run; each `runId` gets its own disk copy).

## Canonical lifecycle

Every BranchFS call site must follow this shape. `try/finally` is non-negotiable: leaking a mount dirties `.local/branchfs/` and can hold file locks on Windows.

```ts
import { BranchfsManager } from "../harness/cli/src/branchfs-manager";

const manager = new BranchfsManager({ rootPath: process.cwd(), runId: `my-tool-${Date.now()}` });
const lease = await manager.prepareExperimentLease();
try {
  // `lease.projectMountPath` is where the mounted project lives.
  // `lease.repoMountPath` is the mounted repo root (same as projectMountPath when
  // the project IS the repo root).
  await doWorkInMount(lease.projectMountPath);
  // Optional: snapshot the diff before deciding flush vs discard.
  const inspection = await manager.readInspection(lease);
  console.log(`${inspection.filesChanged} files changed`);
} finally {
  await manager.discardExperiment(lease).catch(() => undefined);
}
```

## Flush vs discard

- `discardExperiment(lease)` — unmount and delete the run root. Host working tree is untouched. Default choice for read-only / ephemeral tasks (screenshots, smoke runs, dry runs).
- `flushExperiment(lease)` — copy every changed path from the mount back onto the host working tree and delete removed files. Use this only when the user has explicitly opted in to applying experiment edits.
- `readInspection(lease)` — non-destructive; returns the diff text, list of changed paths, insertions/deletions. Safe to call any number of times before a decide-and-discard.
- `unmountExperiment(lease)` — lower-level; `discardExperiment` calls it internally. Rarely called directly.

Never flush without an explicit user-initiated signal. Agents that flush silently violate the harness's plan-first / verification contract.

## Running processes inside a mount

When you spawn a child process and want it to see the mount, not the host:

- Set `cwd = lease.projectMountPath` on `Bun.spawn` / `node:child_process`.
- Pass env vars through `process.env` spread; add mount-specific overrides (e.g. `HARNESS_PORT: "0"` to force a free port).
- Pipe `stdout` and `stderr`; parse readiness markers, never assume blind sleep.
- Always register a `stop()` that calls `proc.kill()` + `await proc.exited`, and call it from the same `finally` block that discards the lease. On Windows, kill-before-discard is important because junction handles can hold directory locks.
- The mounted server will typically need to create a fresh `.local/` inside the mount (since `.local` is excluded from the materialized copy). This is expected; the mount's DB, logs, and build caches are ephemeral and die with the lease.

For a working reference, see `scripts/screenshot.ts` — it spawns the harness dev server inside a mount, parses the `Harness server listening on ...` readiness line, drives Playwright at the reported port, and tears down in one `finally`.

## Passthrough and exclusion rules

From `branchfs-manager.ts`:

- **Excluded from materialization** (never copied, never symlinked): `.git`, `.local`.
- **Passthrough symlinked** (visible inside mount, but actually the host path): `node_modules`, `dist`, `.bun` when they exist on host at lease time.
- **Everything else** is deep-copied into `mount/` at lease time.

Consequences:

- Fresh `bun install` inside the mount WILL mutate the host's `node_modules` (because it's symlinked through). Avoid installing inside the mount; instead, install on the host first so the symlink reflects the needed packages.
- The mount starts without a `.local/` at all. Anything that reads `<cwd>/.local/*` (e.g. `resolveHarnessDbPath`) will create a fresh file inside the mount. This is the intended isolation.
- Build artifacts written to `dist/` inside the mount WILL land on the host's `dist/`. This is deliberate (so `build:ui` inside a mount populates the real serving path). Do not rely on `dist/` being fresh when the mount starts.

## Windows notes

- `BranchfsManager.materializeMount` uses `symlink(..., ..., "junction")` for passthrough directories, which is the only symlink type that works on Windows without admin/developer-mode escalation.
- `git` must be on `PATH`; the manager calls `git rev-parse --show-toplevel`, `git status --porcelain -z`, and `git diff --no-index` as real subprocesses.
- Always `await proc.exited` before calling `discardExperiment`. Windows file locks on an open stdout pipe can cause `rm -rf <mount>` to fail with `EBUSY`; the manager swallows the error but the mount will linger under `.local/branchfs/`.

## Testing against BranchFS-using code

Two layers:

1. **Unit-level**: extract a narrow `BranchfsLike` interface (`prepareExperimentLease`, `discardExperiment`, plus whatever else your code calls) and inject a fake. See `scripts/screenshot.ts` + `scripts/screenshot.test.ts` for the canonical pattern. Do **not** construct a real `BranchfsExperimentLease` in tests — it has many fields and only the mount path usually matters.
2. **Integration-level**: use the real `BranchfsManager` against a real git repo. `harness/cli/src/branchfs-manager.test.ts` shows how to set up a scratch repo and exercise prepare + flush + discard end-to-end.

Prefer the unit-level approach for orchestrator code in `scripts/**`. Only reach for integration tests if the code under test depends on actual mount contents (diff reading, dirty-seed handling, deletion propagation).

## What `update-harness` says about BranchFS changes

Any new capability built on `BranchfsManager` that gets a `package.json` script or a `README.md` bullet is a first-class harness capability, not a stealth dev tool. That means:

- New `US-*` story in `docs/user-stories.md`.
- Row in `docs/coverage-matrix.md` pointing at a colocated test.
- Keep filenames kebab-case, use Bun APIs (`Bun.spawn`, `Bun.file`, etc.), and avoid `as any` / `as unknown` when typing the BranchFS interaction layer.

Skills under `.agents/skills/**` are exempt from README/US/coverage updates, per `update-harness`.

## Source of truth

When in doubt, read `harness/cli/src/branchfs-manager.ts` directly. It is the complete, authoritative surface. The existing callers under `harness/cli/src/server.ts` (search for `BranchfsManager`) are the canonical in-tree patterns for how websocket-driven experiments use the manager; `scripts/screenshot.ts` is the canonical pattern for script-driven one-shot experiments.
