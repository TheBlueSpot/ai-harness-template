---
name: onboarding-critique
description: Review browser-game onboarding with evidence-backed heuristics for just-in-time teaching, practice feedback, reopenable reminders, and objective recall. Use when Codex needs a reusable pass for first-run clarity, control teaching, tutorial quality, or `what do I do now?` friction across arcade entries.
---

# Onboarding Critique

## Overview

Use this skill when a browser-playable game needs a focused onboarding pass instead of a broad design review. Goal: judge whether a new or returning player can learn core verbs in play, refresh them without penalty, recover the current objective fast after a break, and avoid being over-tutored before the loop earns it.

Concrete upgrade: this skill now turns one observation JSON into blocker-first findings, an evidence snapshot, interruption-recovery checks, temporary-prompt recovery checks, early-loop cadence notes, evidence-backed next steps, and one durable learning line saved to local skill memory so onboarding passes stay comparable across different arcade entries instead of collapsing into flat tutorial vibes. It also adds a reusable teaching-load check so simple discoverable loops are not mistaken for games that need heavy front-loaded tutorials, especially when onboarding blocks first meaningful input and offers no cheap on-demand help. The helper now accepts the `firstContact`, `earlyLoop`, `resumeProbes`, and `ephemeralMoments` fields produced by `playtest-evidence-capture`, so one shared play session can flow into onboarding review without manual field remapping.

## Workflow

1. Start from direct browser play when possible.
2. Watch first-contact moments: first prompt, first safe verb practice, first failure, and first `what now?` gap.
3. Log observations with explicit evidence scope before judging severity.
4. Judge onboarding against five reusable checks:
   - teach core verb near first need
   - require or strongly invite practice with immediate feedback
   - allow reminder of controls or mechanics during play without progress loss
   - keep current objective or next step easy to restate after interruption or short break
   - keep teaching load proportional to loop complexity so simple discoverable games earn every prompt instead of blocking first meaningful input behind forced explanation
5. If the observations came from `playtest-evidence-capture`, feed the starter JSON straight into this helper. Prefer shared evidence over retyping the same first-contact facts.
6. Treat interruption recovery as onboarding scope, not only UX polish. A short tab switch or brief break should still leave the player able to recover current goal, controls, and next action without menu spelunking.
7. Treat critical auto-dismissing prompts as onboarding failures when they cannot be replayed, reviewed later, or replaced by cheap in-run reminders.
8. Treat static control sheets as backup only, not proof that onboarding is good.
9. If controls are remappable, verify reminders and prompts match the live binding.
10. Do not treat extra tutorial text as neutral. If a low-complexity loop could teach itself through one safe action, front-loaded instruction screens and stacked prompts are friction until proven otherwise.
11. Log early-loop cadence when possible:
   - first meaningful input
   - first risk
   - first reward or clear payoff
   - first retry opportunity
12. Treat slow first agency or slow first payoff as supporting evidence when a simple loop already looks over-explained.
13. End the run by saving the generated durable learning into `./.agents/skills/onboarding-critique/LEARNINGS.md`.
14. Treat front-loaded onboarding as a blocker, not just a style preference, when a simple or discoverable loop is delayed by forced tutorial steps and the player cannot fall back to cheap on-demand help after experimentation.
15. Keep findings high level and game-local. Prefer a few concrete fixes over tutorial theory.

## Why This Shape

- Reusable onboarding judgment gets stronger when findings are severity-ranked instead of written as flat notes.
- Andersen and coauthors' 2012 experiment across 45,000+ players found tutorial value depended strongly on game complexity. Tutorials substantially helped the complex game, but did not significantly improve engagement in the simpler, more discoverable games.
- Current Microsoft accessibility guidance makes objective recall, interactive on-demand tutorials, and UI context first-class design concerns, not optional polish.
- Cao and Liu's 2022 pilot study reinforces the same split: timely feedback, self-directed practice, and implicit guidance help, especially when the game does not need a large up-front lecture.
- Sticky arcade entries often fail before the mechanic shines because players miss the verb timing, safe practice beat, reminder path, or post-interruption recovery path. Blocker-first output surfaces that fast.
- Microsoft Learn XAG 109, 114, and 116 reinforce the new shape: players need reviewable objectives, clear UI context when returning to active play, and enough time or replayability for important instructional UI.
- The concrete gap this closes: the old helper could note front-loaded teaching, but it could not consume shared playtest-capture onboarding fields directly, and it did not clearly separate harmless setup text from deeper failures where forced tutorial steps delay first meaningful input, first payoff lands too late to reinforce the verb, resume probes fail after a short break, or critical teaching prompts vanish before they can be rechecked.

## Commands

Print reusable checklist and richer observation schema:

```powershell
bun.cmd .agents/skills/onboarding-critique/scripts/onboarding_review.ts --template
```

Turn a small observation JSON file into a markdown review scaffold:

```powershell
bun.cmd .agents/skills/onboarding-critique/scripts/onboarding_review.ts `
  --observations ".local/onboarding-notes.json"
```

Write scaffold directly to a game-local note:

```powershell
bun.cmd .agents/skills/onboarding-critique/scripts/onboarding_review.ts `
  --observations ".local/onboarding-notes.json" `
  --out "some-game/onboarding-review.md"
```

Feed a starter JSON from `playtest-evidence-capture` directly into onboarding review:

```powershell
bun.cmd .agents/skills/onboarding-critique/scripts/onboarding_review.ts `
  --observations ".local/playtest-starters/onboarding-critique.json"
```

## Observation Shape

Use a tiny JSON note with only what the pass actually observed.

```json
{
  "game": "some-game",
  "sessionDate": "2026-04-29",
  "verbs": [
    {
      "name": "dash",
      "firstPromptAt": "00:18",
      "firstRequiredAt": "00:22",
      "practiceBeforeRisk": true,
      "feedback": "clear"
    }
  ],
  "reminders": {
    "controlsDuringPlay": true,
    "objectiveDuringPlay": false,
    "progressSafe": true,
    "remapSafe": false
  },
  "objectiveClarity": {
    "currentGoalEasyToRestate": false,
    "nextStepPrescriptive": false
  },
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "currentGoalEasyToRestate": false,
    "nextStepPrescriptive": false,
    "controlsReminderAvailable": false,
    "objectiveReminderAvailable": false,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 2,
    "promptsBeforeMeaningfulPlay": 4,
    "blocksFirstMeaningfulInput": true,
    "forcedTutorialSteps": 3,
    "optionalHelpOnDemand": true
  },
  "teachingLoad": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "upfrontInstructionScreens": 2,
    "promptsBeforeMeaningfulPlay": 4,
    "blocksFirstMeaningfulInput": true,
    "forcedTutorialSteps": 3,
    "optionalHelpOnDemand": true
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 2,
    "sampledFailures": 1,
    "notes": [
      "watched first-run prompt timing and one return-after-failure moment"
    ]
  },
  "resumeProbes": [
    {
      "breakType": "tab-switch",
      "secondsAway": 45,
      "resumeSurface": "active run",
      "currentGoalRecoverable": false,
      "controlsRecoverable": false,
      "nextActionClear": false,
      "needsMenuDive": true,
      "stalePromptMismatch": false,
      "notes": "returning player sees motion again but no cheap way to recover the live lesson"
    }
  ],
  "ephemeralMoments": [
    {
      "name": "first dodge tip",
      "kind": "tutorial",
      "importance": "critical",
      "appearsNearAction": true,
      "autoDismisses": true,
      "dismissSeconds": 2,
      "playerControlledAdvance": false,
      "reviewableLater": false,
      "suppressibleWhenNonCritical": true,
      "obstructsCriticalRead": false,
      "notes": "critical teaching prompt vanishes before the player can recheck it"
    }
  ],
  "strengths": [
    "jump prompt appears inside safe space before first gap"
  ],
  "frictions": [
    "pause menu has controls but active run has no reminder or objective recap"
  ]
}
```

## Heuristic Lens

- Good onboarding acts like memory support, not one-shot lecture.
- Good prompts teach close to first use and pay off with immediate feedback.
- Good onboarding for simple loops earns every prompt. If the first verb can be learned through one safe action, extra pre-play explanation is a liability until evidence says otherwise.
- Good onboarding review distinguishes mild explanation from a real discoverability tax. Forced tutorial steps that block first meaningful input deserve higher severity when the loop is simple and reminders are not cheaply reopenable.
- Good reminder systems are cheap to reopen and safe during active progress.
- Good objective framing tells player what to do next, not only what button exists.
- Good onboarding also survives a short interruption. If the player tab-switches or returns after a pause, current goal, controls, and next action should still recover cheaply.
- Good temporary teaching prompts are player-paced or reviewable later. A critical lesson that vanishes before recheck still fails under pressure.
- Good audit outputs keep evidence and severity coupled so repeated passes stay comparable across different games.

## Output Shape

- `Findings`: blocker first, then major, then minor.
- `Evidence Snapshot`: how much direct evidence the pass actually sampled.
- `Interruption Recovery`: whether a short break still leaves current goal, controls, and next action recoverable without menu depth.
- `Temporary Prompt Recovery`: whether critical short-lived onboarding prompts stayed replayable or cheap to recheck.
- `Evidence-Backed Next Steps`: only steps supported by logged onboarding failures.
- `Durable Learning`: one concise line worth carrying into catalog-wide taste memory and saving in `./.agents/skills/onboarding-critique/LEARNINGS.md`.

## Sources

- Microsoft Learn Accessibility Feature Tags and XAG 109: objective clarity, interactive on-demand tutorials, and reminder paths that preserve progress.
- Microsoft Learn XAG 114: UI context so the player understands what an onboarding prompt, menu item, or tutorial entry point will do before activating it.
- Microsoft Learn XAG 116: important temporary instructional UI should stay visible long enough, be player-controlled, or be reviewable later when it is not core timed gameplay.
- Game Accessibility Guidelines: practice without failure, reminder of controls during gameplay, reminder of current objectives, and contextual in-game help.
- Game Accessibility Guidelines: allow players to progress through text prompts at their own pace.
- Andersen et al. (CHI 2012): tutorial value rises with game complexity, while simpler more discoverable games may not gain meaningful engagement improvement from tutorials.
- Cao and Liu (2022): just-in-time access, self-directed practice, and timely feedback improve tutorial effectiveness, with implicit guidance helping experienced players.
