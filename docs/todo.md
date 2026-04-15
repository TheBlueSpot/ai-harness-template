# TODO

## Current Product Focus

- Keep coding harness local-first, single-user, plan-first
- Prioritize trust, context control, and fast task startup over broader assistant surfaces
- Keep new features capability-aware, retry-safe, and inspectable instead of silently degrading
- Preserve typed websocket contracts, resumable runs, trace visibility, and worktree safety while making normal flow feel simpler

## Browser Automation

- Add typed browser session model with explicit approval boundaries
- Show browser activity, replay history, and verification results in run UI
- Support frontend QA and manual flow verification without collapsing coding workflow

## GitHub Operations

- Add issue and pull-request workflows around `pi`
- Support diff-aware review summaries, issue execution, and PR follow-up loops
- Keep repository automation behind explicit opt-in and clear approval points

## Background Runs

- Add queued and scheduled runs with pause, stop, retry, and history
- Surface run state, failures, and notifications without requiring live tab focus
- Keep safeguards around long-running tasks and external side effects

## Memory And Skill Platform

- Expand local modes into reusable skill and playbook distribution
- Support install, import, export, and workspace discovery for custom workflows
- Keep memory lightweight, inspectable, and editable instead of opaque long-term agent state

## Broader Assistant Surfaces

- Revisit voice, Google Workspace, messaging channels, and remote nodes only after coding PMF is stable
- Avoid broad personal-assistant scope until core harness workflow is clearly sticky

## Workspace Sync

- Evaluate optional multi-device sync only after local workflow and background history are stable
- Keep local SQLite as source of truth during offline work
- Define reconciliation, conflict rules, and visible sync state before any remote rollout

## Non-Goals For Current Phase

- No remote execution by default
- No shared multi-user editing
- No automatic cloud dependency for normal local use
- No full personal-assistant persona stack
