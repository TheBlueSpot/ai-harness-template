---
name: readable-progression-audit
description: Review browser-game progression readability with evidence-backed heuristics for proximal goals, visible prerequisite progress, evaluative readback, and non-comparative next-step guidance. Use when Codex needs a reusable pass for loops that seem content-thin, goals that feel distant or vague, progress trackers that do not guide action, or feedback that compares players instead of helping the next attempt.
---

# Readable Progression Audit

## Overview

Use this skill when a browser-playable entry works mechanically but still feels directionless, grindy, or motivationally cold because the player cannot read near progress. Goal: judge whether the loop exposes one reachable next goal, shows prerequisite progress clearly enough to guide effort, names what improved, and points to the next action without leaning on comparative pressure.

Core questions:

- does the player have one reachable short-range goal during live play or on-demand review
- when progression has prerequisites, are remaining steps or counts visible enough to guide effort
- does feedback say what improved or what still blocks progress instead of only celebrating or comparing
- after success or failure, does the game tell the player what to do next in a concrete self-referenced way
- can the player recover current progress and next-step context after a short break

## Workflow

1. Start from direct browser play when possible.
2. Reuse `playtest-evidence-capture` output when available instead of relogging goal, progress, and retry facts.
3. Capture one short opening, one progress-relevant success or near-miss, and one fail-and-retry when possible.
4. Judge the run against five reusable checks:
   - proximal goal stays visible enough to guide effort
   - prerequisite progress is concrete and reviewable
   - evaluative readback names what changed or what remains
   - next-step guidance stays actionable without comparative pressure
   - reminder recovery keeps the current goal and progress cheap to reopen
5. Treat progression readability as structural, not cosmetic. If the next goal is vague or prerequisite progress is hidden, more content rarely fixes the problem.
6. If `playtest-evidence-capture` already emitted `readable-progression-audit.json`, feed that starter directly into the helper and keep its claim guardrails intact.
7. Keep findings blocker-first and evidence-scoped.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --template
```

Turn one observation JSON or shared starter into a markdown audit:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts `
  --observations ".local/readable-progression-notes.json"
```

Write audit directly to a game-local note:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts `
  --observations ".local/readable-progression-notes.json" `
  --out "some-game/readable-progression-audit.md"
```

Feed the shared starter from `playtest-evidence-capture` directly into the helper:

```powershell
bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts `
  --observations ".local/playtest-starters/readable-progression-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/readable-progression-audit/LEARNINGS.md
```

## Why This Shape

- Current repo skills already cover onboarding, failure teaching, and broad mastery support, but no single pass decides whether near progress itself is readable enough before the review asks for more content.
- Microsoft XAG 109 explicitly keeps objective review, prerequisite progress, and prescriptive next-step support in scope, which maps directly to this lane.
- Bandura and Schunk's proximal-goal work supports visible near-term progress and attainable subgoals as motivation infrastructure.
- Hattie and Timperley's feedback model supports separating `how am I going` from `where to next`, which is why the lane checks evaluative readback separately from next-step guidance.
- Self-determination theory still matters here because self-referenced progress guidance usually supports competence better than comparative pressure does.

## Sources

- Microsoft Learn. `Xbox Accessibility Guideline 109: Objective clarity.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109>
- Game Accessibility Guidelines. `Indicate / allow reminder of current objectives during gameplay.` <https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-current-objectives-during-gameplay/>
- Game Accessibility Guidelines. `Indicate / allow reminder of controls during gameplay.` <https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-controls-during-gameplay/>
- Bandura, Schunk. `Cultivating Competence, Self-Efficacy, and Intrinsic Interest Through Proximal Self-Motivation.` <https://assets-global.website-files.com/59faaf5b01b9500001e95457/5bc552d85141987915dab842_Bandura%20%26%20Schunk%2C%201981.pdf>
- Hattie, Timperley. `The Power of Feedback.` <https://www.researchgate.net/publication/258182775_The_Power_of_Feedback>
- Ryan, Deci. `Self-Determination Theory and the Facilitation of Intrinsic Motivation, Social Development, and Well-Being.` <https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf>

