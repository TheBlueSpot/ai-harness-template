# General Conventions

Use this when a task touches broad harness conventions, naming, docs policy, or workflow expectations that are not specific to backend, UI, TypeScript, or tests.

## Context Budget

- Keep `SKILL.md` as a routing index.
- Load only the reference files needed for the current edit.
- Prefer targeted `rg` and nearby source files over reading broad docs.
- When adding or changing harness guidance, put the rule in the narrowest owning reference file.
- If a rule applies across all harness work, put it here.

## Harness Shape

- Keep the harness local-first.
- Prefer explicit typed contracts over ad hoc strings.
- Keep websocket command handling behind a narrow typed bridge.
- Preserve plan-first execution and verification flow.
- Persist workspace, project, thread, and chat history locally unless repo docs explicitly change strategy.

## Naming

- Keep filenames and directories in kebab-case by default.
- Keep generated test, script, and fixture filenames in kebab-case unless an upstream tool requires another shape.
- Keep `data-test-*` hook names in kebab-case.
- Do not rename existing non-kebab-case public API symbols just for style.

## Docs Touch Policy

- After finishing a harness task, locate the nearest `readme.md` and update it as needed.
- If no nearby `readme.md` exists, create one only when the change creates durable knowledge future agents need.
- Skill work under `.agents/skills/**` does not need README updates.
- Keep README updates high-level. Link to context and skill docs rather than embedding code-heavy explanations.

## Workflow

- Explore first, then ask only blocking ambiguity questions.
- Never ask for facts discoverable from repository files, package metadata, tests, or existing docs.
- Batch non-overlapping reads in parallel.
- Prefer symbol-aware or AST-aware tools when available; otherwise use targeted `rg`.
- Stop when completion criteria are met. Do not spend final turns on optional polish.
- Use `run.complete` as the typed lifecycle completion command; do not treat it as markdown output.
