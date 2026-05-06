---
name: settings-and-assists-audit
description: Review browser-game recovery surfaces with evidence-backed heuristics for mid-run settings reachability, post-failure assist access, progress-safe changes, reminder replay, and whether assist state persists across retry. Use when Codex needs a reusable pass for games that may already expose remap or difficulty knobs somewhere, but still fail to let players reach or trust them at the moment they need help.
---

# Settings And Assists Audit

## Overview

Use this skill when a browser-playable entry may already have some control or difficulty options, yet still strands the player because the right recovery knob is hard to reach, unsafe to use, or forgotten after failure. Goal: judge whether live recovery trust exists when the player needs help now, not only whether a setting technically exists.

Core questions:

- can the player reach controls, objectives, difficulty, or assists during active play
- can the player reach those same surfaces after failure or from pause without long menu recovery
- do difficulty or assist changes keep progress safe and apply without forcing a restart or save loss
- do reminder and practice surfaces exist when the player needs to recover knowledge, not just motor comfort
- do changed settings or assists persist across retry strongly enough to trust the next attempt

## Workflow

1. Start from direct browser play when possible.
2. Keep this lane separate from `control-surface-audit`, `input-demand-audit`, `failure-loop-audit`, and `mastery-motivation-audit`.
3. Capture at least one live-play recovery attempt and one post-failure or pause recovery attempt when possible.
4. Judge the run against five reusable checks:
   - mid-run settings or assist access is reachable without abandoning the loop
   - post-failure or pause surfaces still expose the needed recovery knobs
   - changing difficulty or assists does not silently cost progress
   - reminder or practice relief exists when the player needs to recover controls or goals
   - changed assist state persists across retry strongly enough to trust the next attempt
5. Treat thin evidence honestly. A visible settings button is not proof that settings are usable under pressure.
6. Keep findings blocker-first and evidence-scoped.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/settings-and-assists-audit/scripts/settings_and_assists_audit.ts --template
```

Turn one observation JSON into a markdown audit:

```powershell
bun.cmd .agents/skills/settings-and-assists-audit/scripts/settings_and_assists_audit.ts `
  --observations ".local/settings-and-assists-notes.json"
```

Use the shared starter emitted by playtest capture:

```powershell
bun.cmd .agents/skills/settings-and-assists-audit/scripts/settings_and_assists_audit.ts `
  --observations ".local/playtest-starters/some-game/settings-and-assists-audit.json"
```

Write audit directly to a game-local note:

```powershell
bun.cmd .agents/skills/settings-and-assists-audit/scripts/settings_and_assists_audit.ts `
  --observations ".local/settings-and-assists-notes.json" `
  --out "some-game/settings-and-assists-audit.md"
```

Run the local verification test for this helper:

```powershell
bun.cmd test .agents/skills/settings-and-assists-audit/scripts/settings_and_assists_audit.test.ts
```

Saved learnings accumulate in:

```text
./.agents/skills/settings-and-assists-audit/LEARNINGS.md
```

## Why This Shape

- Current repo skills already cover control remap surfaces, motor-tax burden, restart friction, and competence support, but no single pass decides whether the player can safely reach and trust the needed recovery knobs during live play or right after failure.
- Microsoft Learn `Xbox Accessibility Guideline 108: Game difficulty options` now explicitly supports changing difficulty at any time without losing progress, which maps directly to progress-safe recovery surfaces.
- Microsoft Learn `Xbox Accessibility Guideline 109: Objective clarity` still supports replayable objective and summary access, which matters when the player returns after a fail or short break.
- Microsoft Learn `Xbox Accessibility Guideline 107: Input` still treats input accessibility as more than remapping alone, which supports distinguishing remap truth from live recovery reachability.
- Apple guidance keeps onboarding and accessibility fast, optional, replayable, and adaptable, which supports reminder recovery and player-controlled help surfaces instead of one-shot tutorial debt.
- Apple accessibility testing guidance reinforces task-based evaluation with accessibility settings enabled, which matches this lane's focus on whether the needed repair path is actually completable.

## Sources

- Microsoft Learn. `Xbox Accessibility Guideline 107: Input.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107>
- Microsoft Learn. `Xbox Accessibility Guideline 108: Game difficulty options.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/108>
- Microsoft Learn. `Xbox Accessibility Guideline 109: Objective clarity.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109>
- Microsoft Learn. `Xbox Accessibility Guidelines - Version History.` <https://learn.microsoft.com/en-us/gaming/accessibility/xag-version-history>
- Apple Developer. `Onboarding for Games.` <https://developer.apple.com/app-store/onboarding-for-games/>
- Apple Developer. `Accessibility.` <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- Apple Developer. `Performing accessibility testing for your app.` <https://developer.apple.com/documentation/accessibility/performing-accessibility-testing-for-your-app>
- Apple Developer. `Settings.` <https://developer.apple.com/design/human-interface-guidelines/settings>
