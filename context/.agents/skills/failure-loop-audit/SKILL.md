---
name: failure-loop-audit
description: Review browser-game failure loops with evidence-backed heuristics for retry latency, failure readability, pressure sequencing, and learning-loop quality. Use when Codex needs a reusable pass for game-over friction, restart speed, unclear deaths, stacked threats, or whether repeated failure teaches the next attempt instead of wasting time.
---

# Failure Loop Audit

## Overview

Use this skill when a browser-playable game needs a focused failure-loop pass instead of a broad design review. Goal: judge whether failure teaches, restarts fast, preserves player intent, avoids cascade punishment, and exposes recovery support before frustration turns into churn.

Concrete upgrade: this skill now accepts the shared starter payload from `playtest-evidence-capture`, carries forward starter claim guardrails, keeps interruption-recovery, probe-load, incident-queue, and control/view-confounder evidence inside the failure pass instead of dropping it, and adds a one-sentence failure-attribution probe so the first meaningful death gets judged on whether the player can immediately name both cause and correction instead of blaming clutter or ambiguity.

Core questions stay simple:
- can player decode what happened
- can player re-enter same lesson fast
- can player recover or rehearse without losing progress
- can player state the failure and the next correction in one sentence

## Workflow

1. Start from direct browser play when possible.
2. Capture at least one full fail-and-retry sequence, not only steady-state play.
3. Log observations with an explicit evidence snapshot so later passes stay comparable.
4. If the observations already came from `playtest-evidence-capture`, feed the `failure-loop-audit.json` starter directly into this helper. Prefer shared evidence over retyping the same death, retry, and incident facts.
5. Keep starter claim guardrails in the generated audit. `partial` or `missing` coverage limits what the pass may claim.
4. Tag repeated failures with the same short `incidentTag` whenever the same trap, unreadable overlap, or restart defect happens again.
5. Mark each logged failure with lightweight severity inputs:
   - `impact`: `low`, `medium`, or `high`
   - `persistence`: `one-off`, `repeatable`, or `constant`
6. Judge each pass against these reusable checks:
   - fail state keeps lethal source, collision lane, or timing miss readable enough to answer `what killed me`
   - fail state leaves enough context to answer `what should I try next`
   - first meaningful death leaves a one-sentence cause and one-sentence correction instead of a vague `that was messy`
   - retry latency and menu depth stay short enough that failure remains inside learning loop
   - next attempt returns near same decision instead of re-clearing dead time or lost setup
   - one mistake does not chain into repeated hits, extra life loss, or forced helpless damage before control returns
   - retry reproduces a stable lesson instead of changing spawn RNG, setup state, or pressure stack so much that the player cannot test the intended fix
   - pressure layers sequence before unreadable overlap spikes
   - restart flow exposes quick-start path instead of burying replay behind menu depth or forced tally
   - harsh loops expose rehearsal, hint refresh, difficulty, assist, or skip recovery support without wiping progress
   - short interruption after failure does not erase goal, controls, or next action
   - control or view instability gets logged as a confounder instead of silently becoming a death-read verdict
7. Sort incident tags by repeat count first, then by impact and persistence. Repeated high-impact traps outrank isolated papercuts.
8. Treat long menus, splash screens, mandatory dialogue after failure, chain-punish deaths, and unstable retry lessons as design friction, not neutral presentation.
9. Run one lightweight attribution probe on the first meaningful death when possible:
   - can the player state the cause in one sentence
   - can the player state the next correction in one sentence
   - if not, did they blame clutter, overlap, or ambiguity instead of their own decision
10. Treat resume-memory tax as part of the failure loop. Fast restart is not enough if a short break after death leaves the player unable to restate the fix.
11. End run by saving generated durable learning into `./.agents/skills/failure-loop-audit/LEARNINGS.md`.
12. Keep findings high level and game-local. Prefer a few concrete fixes over theory.

## Why This Shape

- Failure review becomes more reusable when findings are severity-ranked instead of listed flat.
- Heuristic consistency improves when pass records scope, sample size, fail-state readability, re-entry cost, and recovery support before judging severity.
- Local catalog history keeps surfacing a second failure-loop trap: a quick retry is not enough if one mistake costs multiple punishments in one beat or if the retry does not actually let the player test the same correction.
- Egor Minenko's 2025 attributable-failure framework adds one concrete reusable check this skill was still missing: first death should be attributable enough that the player can state the cause in one sentence, and fail-to-retry friction should stay short enough that the lesson is still warm.
- Current accessibility guidance keeps pointing to same root truth: harsh loops need fast re-entry, legible next steps, and no-progress-loss recovery choices.
- PLAY-style heuristics add a catalog-relevant fairness check too: players should not be penalized repetitively for the same failure.
- Critical-incident practice adds one missing research discipline: capture the concrete failure event, cluster repeated versions of it, then sort by frequency before deciding what is systemic.
- Severity-rating practice adds the second missing discipline: repeated issues deserve priority only when they also carry real impact or persistence, so the skill now asks for those labels directly.
- The reusable gap closed here is cross-skill continuity plus first-death attribution. Shared playtest capture already knows evidence ceilings, repeated incidents, short-break failures, and control/view confounders. Failure review now keeps that signal, and it adds one compact probe for whether the player can actually explain the first death and next correction instead of shrinking back to retry-time notes and overconfident verdicts.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/failure-loop-audit/scripts/failure_loop_audit.ts --template
```

Turn a small observation JSON file into a markdown audit scaffold and append the durable learning to local skill memory:

```powershell
bun.cmd .agents/skills/failure-loop-audit/scripts/failure_loop_audit.ts `
  --observations ".local/failure-loop-notes.json"
```

Write scaffold directly to a game-local note:

```powershell
bun.cmd .agents/skills/failure-loop-audit/scripts/failure_loop_audit.ts `
  --observations ".local/failure-loop-notes.json" `
  --out "some-game/failure-loop-audit.md"
```

Feed a starter JSON from `playtest-evidence-capture` directly into failure review:

```powershell
bun.cmd .agents/skills/failure-loop-audit/scripts/failure_loop_audit.ts `
  --observations ".local/playtest-starters/failure-loop-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/failure-loop-audit/LEARNINGS.md
```

## Observation Shape

Use small JSON note with only what pass actually observed.

```json
{
  "game": "some-game",
  "sessionDate": "2026-04-29",
  "failures": [
    {
      "at": "02:14",
      "incidentTag": "popup-hides-second-sawblade",
      "cause": "second sawblade hidden behind score pop-up",
      "causeReadable": false,
      "correctiveActionClear": false,
      "retrySeconds": 11,
      "menuLayersBeforeRetry": 2,
      "checkpointLossSeconds": 18,
      "sourceVisibleOnFail": false,
      "returnsToRelevantDecision": false,
      "repeatedPenaltyFromSingleMistake": true,
      "controlRecoveredBeforeNextHit": false,
      "retryContextStable": false,
      "impact": "high",
      "persistence": "constant",
      "notes": "overlay crossed the lethal lane during death beat"
    }
  ],
  "failState": {
    "blockingOverlayDuringDeath": true,
    "futurePathVisible": false,
    "objectiveReminderAvailableAfterFail": false
  },
  "pressure": {
    "newThreatBeforeMastery": true,
    "overlapSpike": true,
    "telegraphReadable": false
  },
  "learningLoop": {
    "immediateRetry": false,
    "practiceWithoutFailure": false,
    "sameSkillRetestedQuickly": false,
    "sameLessonStableAcrossRetries": false
  },
  "recoverySupport": {
    "quickStartAfterFailure": false,
    "difficultyAdjustableAfterFailure": false,
    "assistOrSkipAvailable": false,
    "tutorialOrHintReopenable": false
  },
  "attributionProbe": {
    "testedOnFailureIndex": 1,
    "canStateCauseInOneSentence": false,
    "canStateCorrectionInOneSentence": false,
    "blamedClutterOrAmbiguity": true,
    "notes": "player only says the screen got messy and cannot name the corrective action"
  },
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "death readability issue came from overlap, not camera drift"
  },
  "evidence": {
    "mode": "direct-play",
    "sampledFailures": 3,
    "sampledRetries": 3,
    "sampledResumeProbes": 1,
    "notes": [
      "captured one full fail-retry cycle on level start",
      "repeated same hazard twice to confirm death readability issue"
    ]
  },
  "resumeProbes": [
    {
      "breakType": "after-failure",
      "secondsAway": 30,
      "resumeSurface": "death screen",
      "currentGoalRecoverable": false,
      "controlsRecoverable": false,
      "nextActionClear": false,
      "needsMenuDive": true,
      "stalePromptMismatch": false,
      "notes": "player can restart quickly but cannot restate the needed correction after stepping away"
    }
  ],
  "probeOutcomes": [
    {
      "probe": "fail-retry",
      "goal": "die once, restart, and retest the same lesson",
      "outcome": "partial",
      "successRating": 2,
      "confidence": 3,
      "satisfaction": 3,
      "frustration": 6,
      "mentalDemand": 6,
      "timePressure": 6,
      "effort": 6,
      "blockers": ["restart hides correction behind clutter and menu depth"],
      "notes": "loop technically restarts, but the replay path is hot and noisy"
    }
  ],
  "incidents": [
    {
      "incidentTag": "popup-hides-second-sawblade",
      "title": "reward popup hides second sawblade",
      "lenses": ["failure", "hud"],
      "firstSeenAt": "02:14",
      "repeatedCount": 2,
      "impact": "high",
      "persistence": "constant",
      "playerCost": ["confusion", "death", "dead-time"],
      "nextCheck": "confirm moving the popup restores readable death cause on the same obstacle",
      "notes": "same trap appears across both failure and readability evidence"
    }
  ],
  "strengths": [
    "restart button appears on failure screen"
  ],
  "frictions": [
    "player must wait through reward tally before trying same obstacle again"
  ]
}
```

## Heuristic Lens

- Good failure loops teach through quick, legible repetition.
- Good fail states answer `what killed me` and `what should I try next`.
- Good first deaths are attributable. If the player cannot state the cause and correction in one sentence, the loop is already leaking fairness before restart speed even matters.
- Good failure notes identify repeated incidents by the same tag so systemic traps do not get buried among one-off mistakes.
- Good prioritization sorts repeated incidents by frequency, impact, and persistence instead of by annoyance alone.
- Good failure loops do not convert one mistake into repeated punishment before control returns.
- Good re-entry preserves player setup and objective context whenever possible.
- Good retries bring back the same lesson with enough stability that the player can test a hypothesis, not a fresh random problem.
- Good pressure ramps sequence one new demand at a time before overlap spikes.
- Good retries return player near relevant decision, not far upstream in dead time.
- Good recovery support lets players practice safely, reopen hints, change difficulty, use assists, or skip non-core friction after failure without throwing away progress.
- Good audit outputs keep evidence and severity coupled so repeated passes stay comparable across different games.

## Output Shape

- `Findings`: blocker first, then major, then minor.
- `Evidence Snapshot`: how much direct evidence the pass actually sampled.
- `Evidence Scope Guardrail`: starter coverage gate, claim ceiling, allowed claims, blocked claims, next evidence.
- `Observation Frame`: fail-state decode, re-entry cost, pressure ramp, recovery support.
- `Failure Attribution`: whether the first meaningful death produced a one-sentence cause and correction or collapsed into clutter blame.
- `Incident Clusters`: repeated failure patterns grouped by tag so one-off surprise does not outrank systemic loop breakage.
- `Shared Incident Queue`: cross-lens repeated issues that already showed up in playtest capture.
- `Interruption Recovery`: whether a short break after death still preserves the next lesson cheaply enough.
- `Probe Outcomes`: whether fail-retry technically succeeded but still carried high overload or low confidence.
- `Control And View Confounders`: whether camera or response instability may be distorting the failure diagnosis.
- `Evidence-Backed Next Steps`: only steps supported by logged failures.
- `Durable Learning`: one concise line worth carrying into catalog-wide taste memory and saving in `./.agents/skills/failure-loop-audit/LEARNINGS.md`.

## Sources

- [Microsoft Learn XAG 109](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109): prescriptive next steps and on-demand interactive tutorials matter when fail state leaves player unsure what to do next.
- [Microsoft Learn XAG 108](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/108): difficulty changes and save support should remain available without major progress loss after failure.
- [Game Accessibility Guidelines: practice without failure](https://gameaccessibilityguidelines.com/include-a-means-of-practicing-without-failure-such-as-a-practice-level-or-sandbox-mode/): safe rehearsal matters when actual play is too failure-heavy to teach.
- [Game Accessibility Guidelines: quick start without menu depth](https://gameaccessibilityguidelines.com/allow-the-game-to-be-started-without-the-need-to-navigate-through-multiple-levels-of-menus/): restart friction and menu depth are real barriers, not neutral presentation.
- [Game Accessibility Guidelines: alter difficulty during play or upon death](https://gameaccessibilityguidelines.com/allow-difficulty-level-to-be-altered-during-gameplay-either-through-settings-or-adaptive-difficulty/): recovery support should remain available after failure without wiping progress.
- PLAY / Desurvire-style playability heuristics, summarized in later heuristic reviews: players should not be penalized repetitively for the same failure, which maps directly to chain-punish deaths and unstable retry lessons in this catalog.
- [AHRQ critical-incident method](https://digital.ahrq.gov/health-it-tools-and-resources/evaluation-resources/workflow-assessment-health-it-toolkit/all-workflow-tools/critical-incident): identify the concrete incident first, then sort by frequency to decide what needs prevention.
- [NN/g severity ratings](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/): prioritize issues by frequency, impact, and persistence, not by raw annoyance alone.
- [Readability and Designing for Attributable Failure: A Heuristic Framework and its application to Commercial Action-Roguelites](https://www.theseus.fi/handle/10024/900621): operationalizes first-death attribution and short fail-to-retry friction as concrete readability and fairness checks.
- Microsoft Learn XAG 109 was current as of 2026-03-04 and still emphasizes objective review and progress visibility, which maps directly to post-death reminder and short-break recovery.
- Microsoft Learn XAG 108 was current as of 2026-03-04 and still emphasizes changing difficulty without progress loss, which maps directly to recovery support after harsh failures.
