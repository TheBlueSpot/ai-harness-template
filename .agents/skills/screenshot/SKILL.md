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
2. Prefer an already-running app URL. Do not start a dev server unless explicitly requested or needed.
3. Capture desktop and mobile viewports unless the user narrows scope.
4. Read each PNG before diagnosing the UI.
5. If you edit UI code, capture again to verify the visible result.

For browser smokes, prefer fast state setup over waiting through long app progression. If the target state is deep in a game or flow, create a temporary CDP/app-state script that places the app just before the state, then use CDP evaluation or input to trigger the visible behavior.

## Harness project adapter

In this repository, use:

```bash
bun run screenshot
bun run screenshot -- --route / --route /chat/foo --viewport desktop --viewport mobile
bun run screenshot -- --base-url http://localhost:8787
bun run screenshot -- --start-server
bun run screenshot -- --start-server --branchfs
```

Default target: already-running `http://localhost:8787`. The default command does not start a dev server and does not create a BranchFS mount.

Defaults: `--route /`, viewports `desktop` (1440x900) and `mobile` (390x844).
Custom sizes use `--viewport 1280x720`. Presets: `desktop`, `mobile`, `tablet`.
Use `--base-url` for a different already-running URL.
Use `--start-server` only when the script should launch the harness server.
Use `--start-server --branchfs` only when the launched server should run in an isolated BranchFS mount.

Parse stdout between `--- SCREENSHOT_RESULT_JSON ---` and `--- END ---`.
It is JSON shaped like `{ runId, screenshots: [{ route, viewport, width, height, path }] }`.

Output path: `./.local/screenshots/<runId>/<route-slug>-<viewport>.png`.

## Requirements

- `chrome-remote-interface` is the root dependency used for CDP screenshot capture.
- Chrome or Edge must be installed. Set `CHROME_PATH` if auto-detection fails.

## Common failures

- Connection refused on `8787`: start the app yourself or rerun with `--start-server`.
- Dev server timeout: surface the final stdout/stderr tail and investigate boot, env, or DB errors.
- Non-git scratch dir: BranchFS needs git; use an already-running server or omit `--branchfs`.
- Empty app state: if using `--branchfs`, the mount starts with fresh state unless the route selects existing state.
