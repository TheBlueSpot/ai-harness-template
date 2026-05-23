---
name: screenshot
description: >
  Capture browser screenshots so the agent can inspect visual state and fix UI
  bugs. Use when the user says "look at the app", "screenshot", "see the UI",
  "fix visual bugs", "/screenshot", or describes a layout, styling, or visual
  regression that needs visual ground truth.
---

## When to use

- User asks you to inspect a running app visually.
- User describes a layout or styling issue without a screenshot.
- User invokes `/screenshot`.

Do not auto-trigger on pure copy, docs, or backend-only changes.

## Generic workflow

1. Prefer an existing project screenshot command if one exists.
2. If no project command exists, use Playwright Chromium against a provided or running URL.
3. Capture desktop and mobile viewports unless the user narrows scope.
4. Read each PNG before diagnosing the UI.
5. If you edit UI code, capture again to verify the visible result.

## Harness project adapter

In this repository, use:

```bash
bun run screenshot
bun run screenshot -- --route / --route /chat/foo --viewport desktop --viewport mobile
bun run screenshot -- --base-url http://localhost:8787
```

Defaults: `--route /`, viewports `desktop` (1440x900) and `mobile` (390x844).
Custom sizes use `--viewport 1280x720`. Presets: `desktop`, `mobile`, `tablet`.

Parse stdout between `--- SCREENSHOT_RESULT_JSON ---` and `--- END ---`.
It is JSON shaped like `{ runId, screenshots: [{ route, viewport, width, height, path }] }`.

Output path: `./.local/screenshots/<runId>/<route-slug>-<viewport>.png`.
Screenshots persist after the BranchFS mount is discarded.

## Requirements

- `playwright` is the root dev dependency.
- Chromium setup: `bunx playwright install chromium`.
- `bun run bootstrap` installs Chromium automatically when possible.

## Common failures

- Port `8787` in use: expected. The harness screenshot script uses a random port inside the mount.
- Dev server timeout: surface the final stdout/stderr tail and investigate boot, env, or DB errors.
- Non-git scratch dir: BranchFS needs git; use `--base-url` against an already-running server.
- Empty app state: screenshot mount starts with fresh state unless the route selects existing state.
