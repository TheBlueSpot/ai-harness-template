---
name: screenshot-ui
description: >
  Capture UI screenshots for this repository using the fastest available browser
  path, then inspect the image before making or judging UI changes.
---

## Workflow

1. Prefer an already-running app URL.
2. Use the repository screenshot command before writing custom browser scripts.
3. Capture desktop and mobile unless the user narrows scope.
4. Open the PNGs and inspect actual visible state before diagnosing.
5. Re-capture after UI edits when visual behavior changed.

For browser smokes, prefer fast state setup over waiting through long app progression. If the target state is deep in a game or flow, create a temporary CDP/app-state script that places the app just before the state, then use CDP evaluation or input to trigger the visible behavior.

## Harness Command

```bash
bun run screenshot
bun run screenshot -- --base-url http://localhost:8787
bun run screenshot -- --route / --viewport desktop --viewport mobile
bun run screenshot -- --start-server
bun run screenshot -- --start-server --branchfs
```

Default target is an already-running `http://localhost:8787`. Default capture does not start a dev server and does not create a BranchFS mount.

Use `--start-server` only when the command should launch the harness server. Add `--branchfs` only when that launched server should run in an isolated mount.

Screenshots are written to `./.local/screenshots/<runId>/` and reported in stdout between `--- SCREENSHOT_RESULT_JSON ---` and `--- END ---`.
