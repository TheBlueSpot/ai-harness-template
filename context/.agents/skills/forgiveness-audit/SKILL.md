---
name: forgiveness-audit
description: Review browser-game intent preservation with evidence-backed heuristics for coyote time, input buffering, corner correction, collision leniency, and whether harsh failures come from the challenge instead of dropped player intent. Use when Codex needs a reusable pass for movement or action loops that feel unfair, brittle, frame-tight, or stolen even when the broad challenge seems correct.
---

# Forgiveness Audit

## Overview

Use this skill when a browser-playable entry may be mechanically interesting yet still feel unfair because the engine drops clearly intended inputs or pathing at edge timing. Goal: judge whether the game preserves intent with small, consistent grace windows without flattening mastery.

Core questions:

- does late or early intent still land through coyote time, input buffering, or equivalent grace
- do corner correction and collision leniency save plausible intended paths instead of turning near-misses into fake failures
- are grace windows consistent enough that the player can learn them instead of feeling random
- after a harsh miss, does retry clarify the real correction or does failure still feel stolen
- if timing remains demanding, is there a practice, assist, or lower-punishment path

## Workflow

1. Start from direct browser play when possible.
2. Reuse `playtest-evidence-capture` output when available instead of relogging near-misses, harsh fails, and retry facts.
3. Capture at least one edge-timing or near-collision sample, one harsh miss or `stolen` fail when possible, and one retry that tests the same correction.
4. Judge the run against five reusable checks:
   - timing grace preserves plausible intent
   - corner and collision leniency avoid fake punishment
   - grace rules stay consistent enough to learn
   - retry teaches the missed timing instead of repeating a stolen fail
   - practice, assists, or lower-punishment rehearsal exist when timing is severe
5. Treat forgiveness as structural mechanic feel, not as generic accessibility polish. If timing or collision logic steals intent, extra juice will not fix fairness.
6. Keep the lane narrow: this skill is about intent preservation, not general difficulty, balance, or onboarding.
7. If `playtest-evidence-capture` already emitted `forgiveness-audit.json`, feed that starter directly into the helper and keep its claim guardrails intact.
8. Keep findings blocker-first and evidence-scoped.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/forgiveness-audit/scripts/forgiveness_audit.ts --template
```

Turn one observation JSON or shared starter into a markdown audit:

```powershell
bun.cmd .agents/skills/forgiveness-audit/scripts/forgiveness_audit.ts `
  --observations ".local/forgiveness-notes.json"
```

Write audit directly to a game-local note:

```powershell
bun.cmd .agents/skills/forgiveness-audit/scripts/forgiveness_audit.ts `
  --observations ".local/forgiveness-notes.json" `
  --out "some-game/forgiveness-audit.md"
```

Feed the shared starter from `playtest-evidence-capture` directly into the helper:

```powershell
bun.cmd .agents/skills/forgiveness-audit/scripts/forgiveness_audit.ts `
  --observations ".local/playtest-starters/forgiveness-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/forgiveness-audit/LEARNINGS.md
```

## Why This Shape

- Current repo skills already cover activation trust, failure readability, mastery support, and progression clarity, but no single pass decides whether the engine preserved player intent at the decisive edge-timing moment.
- Microsoft Learn `Xbox Accessibility Guideline 107: Input` keeps timing and speed demands in scope, not just button presence, which maps directly to grace-window and brittle-input questions.
- Microsoft Learn `Xbox Accessibility Guideline 108: Game difficulty options` supports mechanic-level assists when timing or precision barriers would otherwise block progress.
- Game Accessibility Guidelines on repeated inputs, held inputs, and simultaneous actions reinforce that harsh motor demand should have lower-demand alternatives or simplifications where possible.

## Sources

- Microsoft Learn. `Xbox Accessibility Guideline 107: Input.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107>
- Microsoft Learn. `Xbox Accessibility Guideline 108: Game difficulty options.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/108>
- Microsoft Learn. `Xbox Accessibility Guideline 109: Objective clarity.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109>
- Game Accessibility Guidelines. `Avoid repeated inputs (button-mashing/quick time events).` <https://gameaccessibilityguidelines.com/avoid-repeated-inputs-button-mashing-quick-time-events/>
- Game Accessibility Guidelines. `Avoid / provide alternatives to requiring buttons to be held down.` <https://gameaccessibilityguidelines.com/avoid-provide-alternatives-to-requiring-buttons-to-be-held-down/>
- Game Accessibility Guidelines. `Ensure that multiple simultaneous actions (eg. click/drag or swipe) are not required, and included only as a supplementary / alternative input method.` <https://gameaccessibilityguidelines.com/ensure-that-multiple-simultaneous-actions-eg-click-drag-or-swipe-are-not-required-and-included-only-as-a-supplementary-alternative-input-method/>
