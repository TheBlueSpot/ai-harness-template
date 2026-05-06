---
name: mastery-motivation-audit
description: Review browser-game mastery support and replay pull with evidence-backed heuristics for earned early wins, competence readback, autonomy texture, proximal goals, reminder recovery, and practice without failure. Use when Codex needs a reusable pass for polished-but-thin loops, weak early stickiness, rigid progression, or failures that do not convert into `I know what to try next`.
---

# Mastery Motivation Audit

## Overview

Use this skill when a browser-playable entry works technically but still feels thin, bossy, or hard to stick with. Goal: judge whether the loop supports competence and autonomy early enough that players feel both `I can do this` and `I get to choose how` before the review reaches for more content, more rewards, or more lore.

Core questions:

- does the first minute contain at least one earned success that reads as player-caused
- does the player get one meaningful route, tactic, timing, or loadout choice early enough to feel ownership
- are current goals and short-range progress visible enough that effort points somewhere concrete
- after failure, does the loop show improvement and preserve the next useful correction
- is there a safe practice or lower-punishment path when timing or complexity is harsh

## Workflow

1. Start from direct browser play when possible.
2. Reuse `playtest-evidence-capture` output when available instead of relogging first-contact, retry, and reminder facts.
3. Capture one short opening, one fail-and-retry when possible, and one interruption-resume probe when possible.
4. Judge the run against five reusable checks:
   - early success feels earned and readable
   - proximal goal or next step stays visible enough to guide effort
   - player gets at least one meaningful early choice
   - failure preserves competence readback instead of pure loss
   - practice, help, or lower-punishment rehearsal exists when needed
5. Treat mastery support as structural, not cosmetic. If the loop lacks earned progress, clear subgoals, or readable choice, adding more content is usually the wrong next move.
6. Treat reminder recovery as motivation scope too. Losing the current goal or controls after a short break raises memory tax and weakens competence.
7. If `playtest-evidence-capture` already emitted `mastery-motivation-audit.json`, feed that starter directly into the helper and keep its claim guardrails intact.
8. Keep findings blocker-first and evidence-scoped.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/mastery-motivation-audit/scripts/mastery_motivation_audit.ts --template
```

Turn one observation JSON or shared starter into a markdown audit:

```powershell
bun.cmd .agents/skills/mastery-motivation-audit/scripts/mastery_motivation_audit.ts `
  --observations ".local/mastery-motivation-notes.json"
```

Write audit directly to a game-local note:

```powershell
bun.cmd .agents/skills/mastery-motivation-audit/scripts/mastery_motivation_audit.ts `
  --observations ".local/mastery-motivation-notes.json" `
  --out "some-game/mastery-motivation-audit.md"
```

Feed the shared starter from `playtest-evidence-capture` directly into the helper:

```powershell
bun.cmd .agents/skills/mastery-motivation-audit/scripts/mastery_motivation_audit.ts `
  --observations ".local/playtest-starters/mastery-motivation-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/mastery-motivation-audit/LEARNINGS.md
```

## Why This Shape

- Current repo skills already cover onboarding, pacing, failure readability, and activation, but no single pass decides whether the loop is building competence and autonomy strongly enough to justify deeper content work.
- Ryan, Rigby, and Przybylski's 2006 game-motivation work ties enjoyment and future play to competence and autonomy in gameplay, not just reward surfaces.
- Bandura and Schunk's 1981 proximal-goal work supports visible near-term progress and attainable subgoals as motivation infrastructure.
- Current accessibility guidance keeps objective review, reminders, and practice paths in scope because motivation collapses quickly when players forget the goal, cannot recover controls, or cannot rehearse safely.

## Sources

- Ryan, Rigby, Przybylski. `The Motivational Pull of Video Games: A Self-Determination Theory Approach.` <https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf>
- Bandura, Schunk. `Cultivating Competence, Self-Efficacy, and Intrinsic Interest Through Proximal Self-Motivation.` <https://assets-global.website-files.com/59faaf5b01b9500001e95457/5bc552d85141987915dab842_Bandura%20%26%20Schunk%2C%201981.pdf>
- Microsoft Learn. `Xbox Accessibility Guideline 109: Objective clarity.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109>
- Game Accessibility Guidelines. `Indicate / allow reminder of controls during gameplay.` <https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-controls-during-gameplay/>
- Game Accessibility Guidelines. `Indicate / allow reminder of current objectives during gameplay.` <https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-current-objectives-during-gameplay/>
- Game Accessibility Guidelines. `Include a means of practicing without failure, such as a practice level or sandbox mode.` <https://gameaccessibilityguidelines.com/include-a-means-of-practicing-without-failure-such-as-a-practice-level-or-sandbox-mode/>
