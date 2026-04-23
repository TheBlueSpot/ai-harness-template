# Coverage Matrix

Maps every shipped user story from [user-stories.md](user-stories.md) to covering tests under `harness/**/*.test.{ts,tsx}`.

**Depth legend**

- `unit` — colocated unit test at the component or function level
- `integration` — backend websocket or cross-boundary integration
- `unit+integration` — both layers
- `schema-only` — payload shape validated but behavior not asserted
- `none` — no test file touches it

**Gap legend**

- `OK` — covered at appropriate depth
- `GAP-LOW` — thin but exercised indirectly; raise only if behavior drifts
- `GAP-MED` — happy path only; edge / corner cases untested
- `GAP-HIGH` — no test file touches the story; highest priority to close

Roadmap stories are tracked in [user-stories.md](user-stories.md) and excluded from the coverage matrix until they ship.

New `US-*` stories start as `GAP-HIGH` here until at least one colocated or integration test covers them. See [../.agents/skills/update-harness/SKILL.md](../.agents/skills/update-harness/SKILL.md) `User Stories And Coverage`.

---

## WORKSPACE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-WORKSPACE-001 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/server.test.ts | integration | OK |
| US-WORKSPACE-002 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/server.test.ts, harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-WORKSPACE-003 | harness/cli/src/server.test.ts | integration | GAP-MED |
| US-WORKSPACE-004 | harness/cli/src/branchfs-subagent-integration.test.ts | integration | GAP-MED |
| US-WORKSPACE-005 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/server.test.ts, harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-WORKSPACE-006 | harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-WORKSPACE-007 | harness/cli/src/project-search-service.test.ts, harness/cli/src/server.test.ts | integration | OK |
| US-WORKSPACE-008 | harness/cli/src/server.test.ts | integration | OK |
| US-WORKSPACE-009 | harness/cli/src/server.test.ts | integration | OK |

## THREADS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-THREADS-001 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/server.test.ts | integration | OK |
| US-THREADS-002 | harness/ui/src/components/project-sidebar.test.tsx | unit | GAP-MED |
| US-THREADS-003 | harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-THREADS-004 | — | none | GAP-HIGH |
| US-THREADS-005 | harness/cli/src/workspace-repository.test.ts | integration | GAP-MED |
| US-THREADS-006 | — | none | GAP-HIGH |
| US-THREADS-007 | harness/cli/src/server.test.ts, harness/ui/src/components/project-sidebar.test.tsx, harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-THREADS-008 | harness/cli/src/protocol.test.ts, harness/cli/src/run-milestone-windows.test.ts, harness/cli/src/server.subagents.test.ts, harness/ui/src/store/store.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-THREADS-009 | harness/ui/src/components/project-sidebar.test.tsx | unit | OK |

## PLANNING

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PLANNING-001 | harness/cli/src/server.test.ts | integration | GAP-MED |
| US-PLANNING-002 | harness/cli/src/server.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | GAP-MED |
| US-PLANNING-003 | harness/cli/src/server.test.ts, harness/cli/src/workspace-repository.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PLANNING-004 | harness/ui/src/components/chat-panel.test.tsx, harness/ui/src/components/trace-panel.test.tsx | unit | OK |
| US-PLANNING-005 | harness/cli/src/server.test.ts, harness/ui/src/store/store.test.ts | unit+integration | GAP-MED |
| US-PLANNING-006 | harness/ui/src/components/chat-panel.integration.test.tsx | unit | OK |
| US-PLANNING-007 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/server.test.ts | integration | OK |
| US-PLANNING-008 | harness/cli/src/server.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PLANNING-009 | harness/ui/src/components/execution-plan-dialog.test.tsx | unit | OK |
| US-PLANNING-010 | harness/cli/src/server.test.ts | integration | GAP-MED |

## RUNS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-RUNS-001 | harness/cli/src/server.test.ts, harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-002 | harness/cli/src/server.test.ts, harness/cli/src/workspace-repository.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-003 | harness/cli/src/server.test.ts, harness/cli/src/workspace-repository.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-004 | harness/cli/src/server.test.ts, harness/ui/src/components/trace-panel.test.tsx | unit+integration | OK |
| US-RUNS-005 | harness/cli/src/server.test.ts, harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-RUNS-006 | harness/ui/src/components/followup-reset.integration.test.tsx, harness/ui/src/store/store.test.ts | unit | OK |
| US-RUNS-007 | harness/cli/src/branchfs-manager.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | GAP-MED |
| US-RUNS-008 | harness/cli/src/server.test.ts, harness/cli/src/protocol.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-009 | harness/cli/src/protocol.test.ts, harness/cli/src/server.test.ts | integration | GAP-MED |
| US-RUNS-010 | harness/cli/src/server.test.ts, harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-011 | harness/cli/src/server.test.ts | integration | GAP-MED |
| US-RUNS-012 | harness/cli/src/server.test.ts, harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-013 | harness/cli/src/server.test.ts | integration | OK |
| US-RUNS-014 | harness/cli/src/git-preflight.test.ts, harness/cli/src/server.execution-main.test.ts, harness/ui/src/store/store.test.ts | unit+integration | OK |

## PROVIDERS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PROVIDERS-001 | harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PROVIDERS-002 | harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, harness/cli/src/pi-orchestrator.test.ts | unit | OK |
| US-PROVIDERS-003 | harness/cli/src/server.test.ts | integration | OK |
| US-PROVIDERS-004 | harness/cli/src/server.test.ts | integration | OK |
| US-PROVIDERS-005 | harness/cli/src/subagent-defaults.test.ts, harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, harness/cli/src/server.test.ts | unit+integration | OK |
| US-PROVIDERS-006 | harness/cli/src/workspace-repository.test.ts, harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-PROVIDERS-007 | harness/ui/src/components/preferences-modal.test.tsx | unit | GAP-MED |

## RUNTIMES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-RUNTIMES-001 | harness/cli/src/agent-runtimes/codex-installation.test.ts, harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, harness/cli/src/agent-runtimes/cli-health.test.ts, harness/cli/src/pi-agent-adapter.test.ts | unit | OK |
| US-RUNTIMES-002 | harness/cli/src/agent-runtimes/codex-installation.test.ts, harness/cli/src/agent-runtimes/codex-sandbox-policy.test.ts, harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, harness/cli/src/agent-runtimes/codex-sdk-live.test.ts, harness/cli/src/pi-orchestrator.test.ts, harness/cli/src/server.test.ts | unit/integration | OK |
| US-RUNTIMES-003 | harness/cli/src/protocol.test.ts | schema-only | GAP-HIGH |
| US-RUNTIMES-004 | harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, harness/cli/src/pi-agent-adapter.test.ts | unit | GAP-MED |
| US-RUNTIMES-005 | harness/cli/src/protocol.test.ts | schema-only | GAP-HIGH |
| US-RUNTIMES-006 | harness/ui/src/components/chat-panel.test.tsx, harness/ui/src/store/store.test.ts, harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, harness/cli/src/pi-agent-adapter.test.ts, harness/cli/src/protocol.test.ts | unit | GAP-MED |

## WORKTREE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-WORKTREE-001 | harness/cli/src/branchfs-manager.test.ts | integration | OK |
| US-WORKTREE-002 | harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-003 | harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-004 | harness/cli/src/pi-subagents.test.ts, harness/cli/src/server.subagents.test.ts, harness/cli/src/pi-planner.test.ts | unit+integration | OK |
| US-WORKTREE-005 | harness/cli/src/pi-subagents.test.ts, harness/cli/src/server.subagents.test.ts, harness/cli/src/pi-planner.test.ts | unit+integration | OK |
| US-WORKTREE-006 | harness/cli/src/branchfs-subagent-integration.test.ts, harness/cli/src/pi-orchestrator.test.ts | unit+integration | OK |
| US-WORKTREE-007 | harness/cli/src/branchfs-subagent-integration.test.ts, harness/cli/src/pi-subagents.test.ts, harness/cli/src/pi-orchestrator.test.ts | unit+integration | OK |
| US-WORKTREE-008 | harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-009 | harness/cli/src/pi-subagents.test.ts | unit | OK |
| US-WORKTREE-010 | harness/cli/src/pi-subagents.test.ts, harness/cli/src/pi-orchestrator.test.ts | unit | GAP-MED |

## ATTACHMENTS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ATTACHMENTS-001 | harness/cli/src/chat-attachment-prompt.test.ts, harness/shared/chat-attachments.test.ts, harness/cli/src/server.test.ts | unit+integration | OK |
| US-ATTACHMENTS-002 | harness/ui/src/components/chat-panel-attachments.test.tsx, harness/cli/src/document-extractors/document-extractors.test.ts | unit | GAP-MED |
| US-ATTACHMENTS-003 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/chat-attachment-prompt.test.ts | integration | OK |
| US-ATTACHMENTS-004 | harness/cli/src/document-extractors/document-extractors.test.ts | unit | OK |

## MODES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-MODES-001 | harness/cli/src/server.test.ts, harness/shared/mode-intent.test.ts | unit+integration | GAP-MED |
| US-MODES-002 | harness/shared/mode-intent.test.ts, harness/cli/src/workspace-path-intent.test.ts, harness/cli/src/pi-planner.test.ts, harness/cli/src/pi-orchestrator.test.ts, harness/cli/src/server.test.ts | unit+integration | OK |
| US-MODES-003 | harness/cli/src/server.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-MODES-004 | harness/shared/mode-intent.test.ts, harness/cli/src/server.test.ts | unit+integration | OK |
| US-MODES-005 | harness/cli/src/protocol.test.ts | schema-only | GAP-MED |
| US-MODES-006 | harness/cli/src/pi-orchestrator.test.ts, harness/cli/src/server.test.ts, harness/cli/src/workspace-repository.test.ts | unit+integration | OK |
| US-MODES-007 | harness/cli/src/protocol.test.ts | schema-only | OK |

## ASSISTANTS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ASSISTANTS-001 | harness/cli/src/workspace-repository.test.ts, harness/ui/src/components/assistants-panel.test.tsx, harness/ui/src/store/store.test.ts | unit | GAP-HIGH |
| US-ASSISTANTS-002 | harness/ui/src/components/assistants-panel.test.tsx | unit | GAP-HIGH |
| US-ASSISTANTS-003 | harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-ASSISTANTS-004 | harness/cli/src/workspace-repository.test.ts | integration | GAP-HIGH |

## JOBS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-JOBS-001 | harness/cli/src/background-job-schedule.test.ts, harness/cli/src/background-job-scheduler.test.ts | integration | GAP-MED |
| US-JOBS-002 | — | none | GAP-HIGH |
| US-JOBS-003 | harness/cli/src/background-job-scheduler.test.ts | integration | GAP-MED |
| US-JOBS-004 | harness/cli/src/background-job-schedule.test.ts | integration | GAP-MED |

## NOTIFICATIONS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-NOTIFICATIONS-001 | harness/ui/src/components/notification-inbox.test.tsx | unit | GAP-MED |
| US-NOTIFICATIONS-002 | harness/cli/src/protocol.test.ts, harness/ui/src/components/notification-inbox.test.tsx | unit+integration | GAP-MED |
| US-NOTIFICATIONS-003 | — | none | GAP-HIGH |

## BROWSER

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-BROWSER-001 | harness/cli/src/browser-session-state.test.ts, harness/ui/src/components/trace-panel.test.tsx | unit+integration | OK |
| US-BROWSER-002 | harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-BROWSER-003 | harness/cli/src/workspace-repository.test.ts | integration | GAP-MED |

## ACTIVATION

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ACTIVATION-001 | — | none | GAP-HIGH |
| US-ACTIVATION-002 | harness/ui/src/components/setup-checklist-card.test.tsx | unit | GAP-MED |
| US-ACTIVATION-003 | harness/ui/src/components/setup-checklist-card.test.tsx | unit | OK |
| US-ACTIVATION-004 | harness/ui/src/components/help-tutorial-dialog.test.tsx, harness/ui/src/components/tutorial-overlay.test.tsx | unit | OK |
| US-ACTIVATION-005 | harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-ACTIVATION-006 | harness/cli/src/server.test.ts | integration | GAP-MED |
| US-ACTIVATION-007 | harness/cli/src/server.preferences-and-modes.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |

## UI

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-UI-001 | harness/ui/src/app.test.tsx | unit | OK |
| US-UI-002 | harness/ui/src/components/primitives/dialog.test.tsx, harness/ui/src/components/primitives/sheet.test.tsx | unit | GAP-HIGH |
| US-UI-003 | harness/ui/src/components/preferences-modal.test.tsx | unit | GAP-MED |
| US-UI-004 | — | none | GAP-LOW |
| US-UI-005 | — | none | GAP-HIGH |
| US-UI-006 | harness/ui/src/app.test.tsx | unit | OK |
| US-UI-007 | harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-008 | harness/ui/src/components/chat-panel.test.tsx | unit | GAP-MED |
| US-UI-009 | harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-010 | harness/ui/src/components/markdown-content.test.tsx | unit | OK |
| US-UI-011 | harness/ui/src/components/primitives/dialog.test.tsx, harness/ui/src/components/primitives/sheet.test.tsx | unit | OK |
| US-UI-012 | harness/ui/src/components/project-sidebar.test.tsx | unit | OK |
| US-UI-013 | harness/ui/src/toast-store.test.ts, harness/ui/src/components/markdown-content.test.tsx | unit | OK |
| US-UI-014 | harness/ui/src/app.test.tsx | unit | OK |
| US-UI-015 | harness/cli/src/run-milestone-windows.test.ts, harness/cli/src/server.subagents.test.ts, harness/ui/src/components/chat-panel.test.tsx, harness/ui/src/components/trace-panel.test.tsx | unit+integration | OK |
| US-UI-016 | harness/cli/src/protocol.test.ts, harness/ui/src/store/store.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-017 | harness/ui/src/components/chat-panel.test.tsx, harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-UI-018 | harness/ui/src/components/notification-inbox.test.tsx | unit | GAP-MED |
| US-UI-019 | harness/ui/src/store/store.test.ts | unit | OK |
| US-UI-020 | harness/cli/src/tool-activity-state.test.ts, harness/ui/src/components/chat-panel.test.tsx, harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |

## PERSISTENCE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PERSISTENCE-001 | harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PERSISTENCE-002 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-003 | harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-004 | harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-005 | harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-006 | harness/cli/src/workspace-repository.test.ts | integration | GAP-MED |
| US-PERSISTENCE-007 | harness/cli/src/workspace-repository.test.ts, harness/cli/src/server.test.ts, harness/ui/src/store/store.test.ts, harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PERSISTENCE-008 | harness/cli/src/browser-session-state.test.ts, harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-009 | harness/cli/src/browser-session-state.test.ts, harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-010 | harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PERSISTENCE-011 | harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-012 | harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-013 | harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PERSISTENCE-014 | harness/cli/src/browser-session-state.test.ts | unit | OK |
| US-PERSISTENCE-015 | harness/ui/src/store/store.test.ts | unit | GAP-MED |

## PREFERENCES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PREFERENCES-001 | harness/cli/src/server.test.ts, harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-PREFERENCES-002 | harness/cli/src/pi-agent-adapter.test.ts, harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PREFERENCES-003 | harness/ui/src/store/store.test.ts | unit | OK |

## DEV

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-DEV-001 | harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-002 | — | none | GAP-HIGH |
| US-DEV-003 | harness/cli/src/launch-harness.test.ts, harness/cli/src/server.startup.test.ts, harness/cli/src/ui-build.test.ts, harness/ui/src/mount-app.test.tsx | unit+integration | OK |
| US-DEV-004 | harness/cli/src/launch-harness.test.ts, harness/cli/src/server.startup.test.ts | integration | GAP-LOW |
| US-DEV-005 | harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-006 | harness/cli/src/ui-build.test.ts | integration | OK |
| US-DEV-007 | — | none | GAP-HIGH |
| US-DEV-008 | harness/cli/src/cli-entry.test.ts, harness/cli/src/fatal-startup-log.test.ts | unit | OK |
| US-DEV-009 | harness/cli/src/ui-build.test.ts | integration | OK |
| US-DEV-010 | scripts/test-runner.test.ts | unit | OK |
| US-DEV-011 | — | none | GAP-LOW |
| US-DEV-012 | harness/cli/src/launch-harness.test.ts, harness/cli/src/dev-db-recovery.test.ts | integration | OK |
| US-DEV-013 | harness/cli/src/dev-db-recovery.test.ts, harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-014 | harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-DEV-015 | harness/cli/src/dev-db-recovery.test.ts, harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-016 | harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-DEV-017 | harness/ui/src/utils/tests/test-harness.ts | integration | OK |
| US-DEV-018 | harness/cli/src/protocol.test.ts, harness/cli/src/server.test.ts | unit+integration | OK |
| US-DEV-019 | harness/cli/src/pi-agent-adapter.test.ts, harness/cli/src/pi-orchestrator.test.ts | unit | OK |
| US-DEV-020 | harness/cli/src/pi-orchestrator.test.ts | unit | GAP-MED |
| US-DEV-021 | — | none | GAP-HIGH |
| US-DEV-022 | — | none | GAP-LOW |
| US-DEV-023 | scripts/screenshot.test.ts | unit | GAP-MED |
| US-DEV-024 | harness/cli/src/startup-telemetry.test.ts, harness/cli/src/launch-harness.test.ts, harness/cli/src/server.test.ts | unit+integration | OK |
| US-DEV-025 | harness/cli/src/agent-runtimes/toolchain.test.ts, harness/cli/src/pi-subagents.test.ts, harness/cli/src/pi-orchestrator.test.ts | unit | OK |
| US-DEV-026 | harness/cli/src/server.startup.test.ts | integration | GAP-MED |

## SEARCH

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-SEARCH-001 | harness/cli/src/project-search-service.test.ts, harness/ui/src/components/project-switcher-dialog.test.tsx, harness/ui/src/app.test.tsx | unit+integration | OK |
| US-SEARCH-002 | harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-SEARCH-003 | harness/cli/src/server.projects-and-history.test.ts, harness/ui/src/components/project-switcher-dialog.test.tsx | unit+integration | OK |

## MARKDOWN

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-MARKDOWN-001 | harness/ui/src/components/markdown-content.test.tsx | unit | OK |
| US-MARKDOWN-002 | harness/ui/src/components/markdown-content.test.tsx | unit | OK |

---

## Priority gaps

### GAP-HIGH (close first)

- **US-THREADS-004** — pi-fork behavior (transcript-only clone, state isolation)
- **US-THREADS-006** — inline rename, copyable thread id
- **US-ASSISTANTS-001 / -002 / -004** — assistants UX (personas, scope, pause/resume, clone, circuit breaker)
- **US-JOBS-002** — dedicated Background jobs surface
- **US-NOTIFICATIONS-003** — popover primitive behavior
- **US-RUNTIMES-003 / -005** — live CLI attach/reconnect/follow-up transport (schema only today)
- **US-UI-002** — popover and toaster primitives
- **US-UI-005** — tooltip portal behavior
- **US-ACTIVATION-001** — portable launcher packaging integration
- **US-DEV-002 / -007** — `bootstrap`, `doctor` CLIs
- **US-DEV-021** — dev re-surfacing of swallowed errors after toast

### GAP-MED (happy path only)

- US-WORKSPACE-003 / -004, US-THREADS-002 / -005, US-PLANNING-001 / -002 / -005 / -010, US-RUNS-007 / -009 / -011, US-PROVIDERS-001 / -007, US-RUNTIMES-001 / -004, US-WORKTREE-004 / -005, US-ATTACHMENTS-002, US-MODES-001 / -005, US-JOBS-001 / -003 / -004, US-NOTIFICATIONS-001 / -002, US-BROWSER-002 / -003, US-ACTIVATION-002 / -006, US-UI-003 / -008 / -017 / -018, US-PERSISTENCE-006 / -013 / -015, US-DEV-020 / -026

### GAP-LOW (exercised indirectly, raise only on drift)

- US-UI-004 (lucide icon consistency), US-DEV-011 (`bun run typecheck` invocation), US-DEV-022 (Tailwind lint enforcement)

