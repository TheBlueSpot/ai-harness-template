---
name: choice-readback-audit
description: Review browser-game option clarity and payoff truth with evidence-backed heuristics for pre-pick tradeoff contrast, expected-payoff legibility, post-pick state change readback, and whether the chosen branch visibly differs from the skipped one. Use when Codex needs a reusable pass for upgrade drafts, route forks, loadout picks, or risk-reward branches that may exist mechanically but still fail to explain why one option differs or what changed after the player chose.
---

# Choice Readback Audit

## Overview

Use this skill when a browser-playable entry offers a branch, pickup line, upgrade draft, route fork, or tool/loadout pick, but the player may still be guessing what the options mean or whether the chosen branch actually changed play. Goal: judge whether the game makes options feel meaningfully different before commitment and then reads back the payoff clearly enough after the pick.

Core questions:

- do offered options read as different enough before the player commits
- does each option expose an expected payoff or cost instead of a vague label only
- can the player compare the offered choice against the current state or current build
- after the pick, does the game show what changed in state or build clearly enough to trust the branch
- when payoff differs from expectation, does the game explain that mismatch instead of quietly flattening it

## Workflow

1. Start from direct browser play when possible.
2. Reuse `playtest-evidence-capture` output when available instead of relogging branch facts.
3. Keep this lane separate from `mastery-motivation-audit` and `readable-progression-audit`.
4. Capture at least one real choice moment with offered options, expected payoff, selected option, and after-pick comparison when possible.
5. Judge the run against four reusable checks:
   - pre-pick option contrast is readable
   - expected payoff and cost are legible before commitment
   - post-pick state or build change is visible enough to compare against the prior state
   - expectation and actual payoff stay aligned enough to trust later choices
6. Treat thin evidence honestly. One logged branch is enough for a sampled lane verdict, not for a global game judgment.
7. Until dedicated workflow instrumentation lands, feed this helper either the full playtest observation JSON or the shared `mastery-motivation-audit.json` or `readable-progression-audit.json` starter that already preserves `mastery.choicePoints`.
8. Keep findings blocker-first and evidence-scoped.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/choice-readback-audit/scripts/choice_readback_audit.ts --template
```

Turn one observation JSON into a markdown audit:

```powershell
bun.cmd .agents/skills/choice-readback-audit/scripts/choice_readback_audit.ts `
  --observations ".local/choice-readback-notes.json"
```

Use the current shared starter from mastery until lane-specific starter wiring ships:

```powershell
bun.cmd .agents/skills/choice-readback-audit/scripts/choice_readback_audit.ts `
  --observations ".local/playtest-starters/some-game/mastery-motivation-audit.json"
```

Write audit directly to a game-local note:

```powershell
bun.cmd .agents/skills/choice-readback-audit/scripts/choice_readback_audit.ts `
  --observations ".local/choice-readback-notes.json" `
  --out "some-game/choice-readback-audit.md"
```

Run the local verification test for this helper:

```powershell
bun.cmd test .agents/skills/choice-readback-audit/scripts/choice_readback_audit.test.ts
```

Saved learnings accumulate in:

```text
./.agents/skills/choice-readback-audit/LEARNINGS.md
```

## Why This Shape

- Current repo capture already preserves richer `mastery.choicePoints`, but no reusable lane yet judged whether those options were legible before commitment and visibly different after the pick.
- Microsoft Learn `Xbox Accessibility Guideline 109: Objective clarity`, current page published March 4, 2026 per the live doc, still keeps reviewable goals, progress state, and prescriptive next steps in scope, which grounds this lane in observable state readback instead of vague `more agency`.
- Apple `Onboarding for Games`, current as crawled on 2026-05-06, still recommends short contextual teaching and replayable help, which supports keeping branch meaning reviewable beyond one-shot copy.
- Cardona-Rivera et al. support the core lane claim: choices feel more agentic when players can foresee meaningfully different resulting states.
- Ryan, Rigby, and Przybylski support keeping autonomy and competence together, which is why this lane judges both distinct options and trustworthy payoff readback.

## Sources

- Microsoft Learn. `Xbox Accessibility Guideline 109: Objective clarity.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109>
- Apple Developer. `Onboarding for Games.` <https://developer.apple.com/app-store/onboarding-for-games/>
- Cardona-Rivera, Robertson, Ware, Harrison, Roberts, Young. `Foreseeing Meaningful Choices.` <https://ojs.aaai.org/index.php/AIIDE/article/view/12716>
- Ryan, Rigby, Przybylski. `The Motivational Pull of Video Games: A Self-Determination Theory Approach.` <https://selfdeterminationtheory.org/wp-content/uploads/2020/10/2006_RyanRigbyPrzybylski_MandE.pdf>
