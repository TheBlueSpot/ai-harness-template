---
name: readable-progression-audit
description: Review browser-game progression readability with evidence-backed heuristics for proximal goals, prerequisite visibility, evaluative readback, and next-step guidance. Use when a loop feels directionless, progress is hard to read, or the player cannot tell what changed and what to do next.
---

# Readable Progression Audit

## Scope

Use this lane when a playable entry is mechanically fine but progression feels vague, grindy, or hard to recover after a break. Judge whether the game shows one reachable next goal, keeps prerequisite progress concrete, gives readback that explains what changed, and points to the next action without leaning on comparison.

Core checks:

- one short-range goal stays visible or easy to reopen
- prerequisite progress is concrete enough to guide effort
- evaluative readback says what improved or what still blocks progress
- next-step guidance is self-referenced and actionable
- reminder recovery keeps current goal and progress cheap to reopen

## Workflow

1. Start from shared playtest evidence when available.
2. Normalize the observation JSON into a small progression model.
3. Score the run against proximal goals, prerequisite visibility, evaluative readback, and next-step guidance.
4. Keep findings blocker-first and tied to observed evidence only.
5. Append one durable learning line when the audit surfaces a stable pattern.

## Commands

Show template and expected starter shape:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --template
```

Audit a captured observation file:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --observations ".local/readable-progression-notes.json"
```

Write markdown output directly:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --observations ".local/readable-progression-notes.json" --out "some-game/readable-progression-audit.md"
```

Feed shared starter JSON from `playtest-evidence-capture` into the same CLI:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --observations ".local/playtest-starters/readable-progression-audit.json"
```

## Evidence

The audit stays on:

- proximal goal visibility
- prerequisite progress visibility
- evaluative readback quality
- next-step guidance quality
- reminder recovery for the active goal

## Learnings

Durable notes live in `./.agents/skills/readable-progression-audit/LEARNINGS.md`.
