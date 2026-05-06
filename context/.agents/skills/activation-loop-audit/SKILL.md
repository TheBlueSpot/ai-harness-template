---
name: activation-loop-audit
description: Review browser-game activation trust across first input, quick-start path, reminder recovery, and death-to-control-ready re-entry. Use when Codex needs one reusable pass for hidden second starts, inert first input, restart friction, missing control/objective reminders, or post-fail confusion.
---

# Activation Loop Audit

## Overview

Use this skill when a browser-playable entry may technically boot yet still feel broken because the player cannot quickly act, understand the current goal, recover controls, or re-enter after failure. Goal: treat start flow and retry flow as one trust system instead of splitting them across separate light audits.

Core questions:

- does the first normal input produce a visible answer quickly
- does outer `Play` reach a control-ready state without a hidden second start
- can the player recover controls and current objective without menu spelunking
- after failure, can the player retry and restate the next useful action while the lesson is still warm

## Workflow

1. Start from direct browser play when possible.
2. Capture one first-contact sequence, one fail-and-retry sequence, and one short interruption-resume probe when possible.
3. Record two timings whenever evidence allows:
   - `action -> first visible response`
   - `action -> controls armed`
4. Check whether outer `Play` or first in-canvas input begins real play immediately, or whether a second hidden start gate blocks action.
5. Test reminder recovery:
   - current objective reviewable during play
   - controls reviewable during play
   - next useful action still obvious after a short break or after death
6. Treat restart friction as both time cost and memory cost. A fast restart still fails if the player cannot recover the lesson, controls, or next objective.
7. Reuse evidence from `playtest-evidence-capture` when available instead of relogging the same session.
8. Keep findings blocker-first and evidence-scoped.
9. If `playtest-evidence-capture` already emitted `activation-loop-audit.json`, feed that starter directly into the helper and keep its claim guardrails intact.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/activation-loop-audit/scripts/activation_loop_audit.ts --template
```

Turn one observation JSON or shared starter into a markdown audit:

```powershell
bun.cmd .agents/skills/activation-loop-audit/scripts/activation_loop_audit.ts `
  --observations ".local/activation-loop-notes.json"
```

Write audit directly to a game-local note:

```powershell
bun.cmd .agents/skills/activation-loop-audit/scripts/activation_loop_audit.ts `
  --observations ".local/activation-loop-notes.json" `
  --out "some-game/activation-loop-audit.md"
```

Feed the shared starter from `playtest-evidence-capture` directly into the helper:

```powershell
bun.cmd .agents/skills/activation-loop-audit/scripts/activation_loop_audit.ts `
  --observations ".local/playtest-starters/activation-loop-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/activation-loop-audit/LEARNINGS.md
```

## Why This Shape

- Current primary sources keep tying responsiveness, objective clarity, quick start, and reminder recovery to the same felt question: `can the player get back to meaningful action with confidence`.
- Separating boot-flow and retry-flow audits risks duplicate evidence intake and misses that both breaks often share one root cause: control-ready uncertainty plus missing reminder recovery.
- This skill should stay narrow and reusable. It is about activation trust, not broad onboarding or balance review.

## Sources

- web.dev. `Interaction to Next Paint (INP).` <https://web.dev/inp>
- Chrome for Developers. `Long Animation Frames API.` <https://developer.chrome.com/docs/web-platform/long-animation-frames>
- MDN. `Long animation frame timing.` <https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing>
- Microsoft Learn. `Xbox Accessibility Guideline 109: Objective clarity.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109>
- Game Accessibility Guidelines. `Allow the game to be started without the need to navigate through multiple levels of menus.` <https://gameaccessibilityguidelines.com/allow-the-game-to-be-started-without-the-need-to-navigate-through-multiple-levels-of-menus/>
- Game Accessibility Guidelines. `Indicate / allow reminder of controls during gameplay.` <https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-controls-during-gameplay/>
- Game Accessibility Guidelines. `Indicate / allow reminder of current objectives during gameplay.` <https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-current-objectives-during-gameplay/>
- Game Accessibility Guidelines. `Allow players to progress through text prompts at their own pace.` <https://gameaccessibilityguidelines.com/allow-players-to-progress-through-text-prompts-at-their-own-pace/>
- Game Accessibility Guidelines. `Include a means of practicing without failure, such as a practice level or sandbox mode.` <https://gameaccessibilityguidelines.com/include-a-means-of-practicing-without-failure-such-as-a-practice-level-or-sandbox-mode/>
- Ryan, Rigby, Przybylski. `The Motivational Pull of Video Games: A Self-Determination Theory Approach.` <https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf>
