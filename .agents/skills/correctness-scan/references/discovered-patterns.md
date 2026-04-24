# Discovered Patterns

Living catalog for repeated correctness and product-quality gaps found while using `correctness-scan`.

Update this file when a scan finds a reusable failure pattern, missing probe, or recurring category that future scans should check by default.

## 2026-04-24

### Transcript vs runtime drift

- Watch for flows that promise "clean transcript forks" or "runtime-only state" while persistence helpers clone or replay every message row.
- Probe thread fork, retry, restore, and import flows for plan cards, milestone rows, system errors, and other transcript noise leaking into supposedly clean clones.

### Command ownership and state-transition validation

- Typed websocket contracts are not enough by themselves.
- Check that mutating commands validate project ownership, current status, and one-way lifecycle rules before changing persisted rows.
- Background jobs, approvals, retries, stop actions, and notification commands are common drift points.

### Schema-only transport promises

- A contract can validate while the runtime behavior behind it stays under-tested.
- Treat attach or reconnect transport, background control commands, and browser approval flows as risky whenever coverage stops at protocol parsing or UI dispatch.

### Top-level CLI ergonomics as product surface

- Scan `index-main.ts`, launch scripts, and packaging scripts as real user-facing CLI, not only bootstrap glue.
- Verify help text, flag validation, stdout vs stderr, machine-readable modes, and exit-code classes for `--doctor`, `bootstrap`, packaging, and startup recovery paths.

### Disabled affordance vs submit-path drift

- A disabled button is not enough when keyboard shortcuts, form submit handlers, or alternate triggers dispatch the same command through a different path.
- For chat composers, dialogs, approval forms, and schedule editors, verify that `Enter`, hotkeys, and imperative submit use the same eligibility predicate as the visible button state and tooltip reason.

### Thread-owned runtime state stored at project scope

- Watch for transport or runtime overlays that belong to one thread but are cached on whole-project state and then reused after thread activation changes.
- Live CLI sessions, terminal attach state, browser approvals, pending questions, and similar bridge-owned overlays should validate ownership on every command and rehydrate the right thread-scoped surface after reconnect.
- Probe thread switch during active bridge state, then try stop, attach, resize, retry, or capture actions from the new thread. If caller-supplied ids win over persisted ownership, UI and backend can relabel or mutate the wrong session.
