---
name: screenshot-ui
description: >
  Capture Playwright chromium screenshots of the running harness UI so the
  agent can see and fix visual bugs. Use when the user says "look at the app",
  "screenshot the UI", "see the UI", "fix visual bugs", "/screenshot", or
  describes a layout, styling, or visual regression they want inspected.
---

Runs in an isolated BranchFS mount under the hood — when you need to understand or modify the isolation layer, also load the `branchfs` skill. This skill only covers the screenshot user-facing surface.

## When to use

- User asks you to look at the running UI, inspect its visual state, or fix visual bugs.
- User describes a layout or styling issue without a screenshot and you need ground truth.
- User invokes `/screenshot`.

Do **not** auto-trigger on pure content edits (copy, translations, docs) or on backend-only changes where no UI surface moves.

## How to invoke

```bash
bun run screenshot
bun run screenshot -- --route / --route /chat/foo --viewport desktop --viewport mobile
bun run screenshot -- --base-url http://localhost:8787   # debug: skip BranchFS, hit an already-running server
```

Defaults: `--route /`, viewports `desktop` (1440×900) + `mobile` (390×844). Custom sizes via `--viewport 1280x720`. Preset names: `desktop`, `mobile`, `tablet`.

## After running

1. Parse the block between `--- SCREENSHOT_RESULT_JSON ---` and `--- END ---` on stdout. It is valid JSON of shape `{ runId, screenshots: [{ route, viewport, width, height, path }] }`.
2. For every entry in `screenshots[]`, call the `Read` tool on `path`. `Read` natively supports PNG, so vision gets the image into your context.
3. Reason about the visual bug against the HTML/TSX source in `harness/ui/src/**` and `context/index.html`.
4. Propose a fix. If you edit code, rerun `bun run screenshot` to confirm the fix is visible.

Cite the PNG by filepath in your response when you describe what's wrong (e.g. "`.local/screenshots/screenshot-1729.../home-mobile.png` shows the toaster clipping the project sidebar"). The user can open the same file to follow along.

## Output shape invariants

- Output path: `.local/screenshots/<runId>/<route-slug>-<viewport>.png` (gitignored via `.local`).
- Route slug: punctuation collapsed to dashes; `/` becomes `home`. Examples: `/chat/foo_bar` → `chat-foo-bar`, `/?q=1` → `home-q-1`.
- Exit codes: `0` on success, `1` on any error. Error detail goes to stderr with `[screenshot]` prefix.

Screenshots persist after the BranchFS mount is discarded because they're written outside the mount.

## Requirements

- `playwright` is the root `devDependency`; `@playwright/test` is not required for this script.
- Check `node_modules/playwright` when debugging dependency installs, not `node_modules/@playwright/test`.
- Chromium binary: one-time host setup via `bunx playwright install chromium`. `bun run bootstrap` invokes this automatically. If the script exits with "playwright dependency missing" or "playwright chromium launch failed", relay the install hint to the user.

## Failure modes

- **Port 8787 in use** — expected and harmless. The script sets `HARNESS_PORT=0` inside the mount, so the mounted server picks a free port regardless of the host.
- **`dev server did not report listening within 60s`** — the mounted harness failed to boot. The error message includes the last ~2KB of stdout/stderr from the mount; surface that tail to the user and investigate (usually a broken migration, missing env var, or schema drift).
- **Not inside a git repo** — BranchFS requires git. Fall back to `--base-url` against an already-running server if the user is in a non-git scratch dir.
- **Empty / blank screenshots** — the mount boots with a fresh `.local/harness.db`, so no workspace or project is selected. What you capture is the first-run / setup screen unless you pass a route that auto-selects state.

## Out of scope

- Visual regression, pixel diffs, baseline PNGs. Upgrade path: add `--baseline <path>` + `toHaveScreenshot()`. Do not bolt this on during a single screenshot invocation.
- Cross-browser coverage. Chromium only. Add an `--engine` flag if a bug is browser-specific.
- Iterative edit-in-mount → re-screenshot loops. The lease is one-shot. Edit in the host tree and rerun.

## Design notes for anyone extending the script

See `scripts/screenshot.ts`. The script uses the canonical BranchFS lifecycle (see the `branchfs` skill for the full pattern and gotchas). Key seams if you add a feature:

- `CaptureDeps` is the DI boundary. `createManager`, `startDevServer`, `capturePages` are all swappable — the existing tests in `scripts/screenshot.test.ts` exercise the lifecycle without actually touching BranchFS, Bun, or Playwright.
- `BranchfsLike` is a narrow interface; the real `BranchfsManager` is wrapped to fit it. This is the recommended pattern for any new BranchFS-driven script — do not try to construct a fake `BranchfsExperimentLease` in tests.
- The readiness detection regex `Harness server listening on (http:\/\/localhost:\d+)` is the contract with `harness/cli/src/server.ts`. If that log line changes, this script breaks and its unit tests will NOT catch it — integration coverage gap to be aware of.
