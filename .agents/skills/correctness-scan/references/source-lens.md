# Source Lens

Online source scan date: 2026-04-24.

Use this as a compact review lens. Prefer current official sources when a task needs fresh guidance.

## Sources

- Nielsen Norman Group, 10 usability heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- Command Line Interface Guidelines: https://clig.dev/
- W3C WAI-ARIA Authoring Practices Guide: https://www.w3.org/WAI/ARIA/apg/
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Apple accessibility guidance: https://developer.apple.com/design/human-interface-guidelines/accessibility
- Material Design accessibility: https://m1.material.io/usability/accessibility.html

## UI/UX Review Lens

Check for:

- Clear system status for long-running work, queued states, retries, pauses, disabled actions, and background jobs.
- User control: cancel, undo, retry, resume, explicit exits, and non-destructive defaults.
- Error prevention before expensive or destructive actions.
- Plain-language errors that name the problem and next recovery step.
- Recognition over recall: visible labels, discoverable actions, contextual help, examples, and consistent placement.
- Efficient expert paths: keyboard shortcuts, command palette, quick actions, copy buttons, and reusable defaults.
- Minimal but complete information density: no decorative chrome that competes with task-critical state.
- Consistent platform conventions, icons, focus behavior, and state colors.
- Accessibility: keyboard-only operation, focus trap/release, contrast, text scaling, non-color status cues, touch target size, reduced-motion paths, semantic roles, accessible names, and ARIA patterns only when native HTML cannot express the control.
- Responsive stability: controls, boards, toolbars, grids, and panels should not shift or overlap at mobile and desktop sizes.

## Harness UI Review Lens

For this repo, also check:

- Every button-like interaction uses shared button primitives and visible tooltip behavior.
- Disabled buttons explain why.
- Dialogs use shared dialog primitive, close on Escape, and contain scroll safely.
- Dense coding surfaces stay utilitarian: compact controls, scan-friendly status, no landing-page composition.
- Trace, chat, run cockpit, job inbox, and assistant panels do not duplicate state unless it removes workflow friction.
- Toasts surface caught UI and command errors, and dev mode rethrows where expected.
- Multi-client websocket state stays consistent after events.

## CLI Review Lens

Check for:

- `--help`, `-h`, and subcommand help with concise description, examples, flags, and support path.
- Examples first for common and complex commands.
- Correct exit codes: zero for success, non-zero by failure class.
- Primary output on stdout, diagnostics and progress on stderr.
- Machine-readable output where useful, preferably stable JSON.
- Interactive prompts only when appropriate; noninteractive flags for automation.
- Dry-run or confirmation for destructive operations.
- Idempotent retry behavior where possible.
- Clear config precedence among flags, env vars, config files, and defaults.
- Helpful suggestions for invalid commands, missing dependencies, auth failures, occupied ports, and unsupported platforms.
- Robust behavior under Windows PowerShell and `cmd`, including quoting, paths with spaces, and execution policy fallback.

## Correctness Probe Prompts

Ask these while reviewing:

- What happens if the same command is sent twice?
- What happens if the user switches project/thread while work is active?
- What happens after refresh, reconnect, or process restart?
- What happens if persisted state is old, malformed, or partially migrated?
- What happens when a provider is missing auth, rate-limited, or lacks a capability?
- What happens when a file, path, upload, branch, run, thread, job, or notification is deleted before action?
- Are optimistic UI updates reconciled with backend rejection?
- Are all terminal states timestamped and retry/resume-safe?
- Are status predicates duplicated across backend, shared protocol, UI store, and UI helpers?
- Are ids collision-safe when inputs are long?
- Are path comparisons correct on Windows case-insensitive filesystems?
