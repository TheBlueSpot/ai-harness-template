---
name: pacing-curve-audit
description: Review browser-game pacing and learning curves with evidence-backed heuristics for novelty sequencing, skill chaining, rest beats, and fast retest after failure. Use when Codex needs a reusable pass for overstacked mechanics, muddy escalation, weak mid-run cadence, or whether a sticky arcade loop teaches one demand at a time before combining it.
---

# Pacing Curve Audit

## Overview

Use this skill when a browser-playable game needs a focused pacing pass instead of a broad design review. Goal: judge whether the game teaches one demand at a time, gives a short consolidation beat before stacking the next ask, and returns the player to the relevant lesson quickly after failure.

Concrete upgrade: this skill now consumes the interruption-recovery and control/view-confounder fields already produced by `playtest-evidence-capture`, and it now carries forward the starter payload's evidence sufficiency and claim guardrails instead of silently dropping them. That means pacing passes can tell the difference between cadence problems, memory-tax resume problems, stack reads broken by unstable input or blocked view, and plain thin-sample limits where one bad stack spike should stay a narrow claim instead of turning into a whole-run verdict. One observation JSON now turns into blocker-first findings, an evidence snapshot, a starter-guardrail section, an early-loop cadence snapshot, an interruption-recovery section, a mechanic-stack snapshot, a control-and-view confounder section, evidence-backed next steps, and one durable learning line saved to local skill memory so pacing passes stay comparable across different arcade entries instead of collapsing into loose beat notes.

## Workflow

1. Start from direct browser play when possible.
2. Log a short beat timeline from first interaction through at least one fail-and-retry or first meaningful escalation.
3. Mark each beat by what changed:
   - new verb
   - new combination of known verbs
   - escalation of an existing demand
   - rest or consolidation beat
   - failure and return point
4. Log evidence scope before judging severity.
5. Judge pacing against five reusable checks:
   - new verbs appear before the game demands them under pressure
   - new combinations arrive after their component skills have been seen and lightly practiced
   - novelty is spaced with short consolidation beats instead of back-to-back stackups
   - escalation changes one variable at a time before overlap spikes
   - failure returns player to the same lesson quickly enough to preserve the learning loop
   - short interruption or tab return does not make the current lesson, controls, or next action expensive to recover
6. Log stack pressure on meaningful beats once the loop starts combining asks:
   - `activeDemands`: how many things the player must track or execute at once
   - `newDemands`: how many of those asks are new on this beat
   - `stackReadable`: whether the combined ask is still easy to parse in motion
7. If observations came from `playtest-evidence-capture`, feed the starter JSON straight into this helper. Prefer shared evidence over retyping the same beat and resume facts.
8. If the observation file includes starter guardrails, keep them in the generated audit. Treat `partial` or `missing` coverage as a claim limit, not as proof that the game is clean or broken.
9. Treat short-break recovery as pacing scope, not just onboarding scope. A teach-test loop cools fast when the player returns and has to reconstruct the current lesson from memory.
10. Treat control or view instability as pacing confounders. If camera obstruction, auto-camera behavior, input slip, or late response broke the read, do not blame cadence alone.
11. Treat back-to-back novelty spikes, dead-time retries, unreadable escalation, and fresh mechanics landing inside already-dense stacks as loop problems, not polish notes.
12. End the run by saving the generated durable learning into `./.agents/skills/pacing-curve-audit/LEARNINGS.md`.
13. Keep findings high level and game-local. Prefer a few concrete pacing fixes over theory.
14. When evidence is thin, keep claims narrow. One bad stack spike proves that spike exists, not that the whole game is overloaded.
15. Log early-loop cadence when possible:
   - first meaningful input
   - first risk
   - first reward or clear payoff
   - first retry opportunity

## Why This Shape

- Linehan et al. show a repeatable learning-curve pattern in successful games: introduce main skills separately, require only basic performance first, allow practice and integration, then raise complexity until the next skill arrives.
- The same paper matters here because it frames complex problem solving as chaining already learned behaviors. This catalog needs to judge whether chaining lands as satisfying depth or unreadable pile-on.
- Gee's cycles-of-expertise framing reinforces the same pacing need: extended practice, mastery test, then a new challenge, with information arriving just in time instead of front-loaded.
- Later difficulty-curve work reinforces the same operational gap for this skill: challenge should stay compatible with player skill so the player is not overwhelmed by demands beyond current capability.
- Current Microsoft accessibility guidance still treats objective clarity and reviewable next steps as active gameplay support, which matters here because pacing breaks when the player cannot recover the current lesson after interruption or failure. XAG 109 was updated on 2026-03-04, and its current emphasis on always-available objective review maps directly to `does the loop stay warm after a short break`.
- Current Microsoft UI-context guidance reinforces the same catalog risk from a second angle: if the resume surface does not explain what state the player is in or what the next interaction means, a good beat sequence can still feel cold on return.
- This catalog already treats retry cost and readability as gameplay blockers. Pacing review needed the same blocker-first structure so mechanic depth is judged through teach-test-rest evidence plus readable stack pressure, interruption recovery, and control/view confounders, not vibes. Early-loop cadence closes a second gap: a run can have decent later beat spacing but still lose stickiness if first agency, first risk, or first payoff arrives too cold.

## Commands

Print reusable checklist and richer observation schema:

```powershell
bun.cmd .agents/skills/pacing-curve-audit/scripts/pacing_curve_audit.ts --template
```

Turn a small observation JSON file into a markdown audit scaffold:

```powershell
bun.cmd .agents/skills/pacing-curve-audit/scripts/pacing_curve_audit.ts `
  --observations ".local/pacing-curve-notes.json"
```

Feed a starter JSON from `playtest-evidence-capture` directly into pacing review:

```powershell
bun.cmd .agents/skills/pacing-curve-audit/scripts/pacing_curve_audit.ts `
  --observations ".local/playtest-starters/pacing-curve-audit.json"
```

Write scaffold directly to a game-local note:

```powershell
bun.cmd .agents/skills/pacing-curve-audit/scripts/pacing_curve_audit.ts `
  --observations ".local/pacing-curve-notes.json" `
  --out "some-game/pacing-curve-audit.md"
```

Saved learnings accumulate in:

```text
./.agents/skills/pacing-curve-audit/LEARNINGS.md
```

## Observation Shape

Use a tiny JSON note with only what the pass actually observed.

```json
{
  "game": "some-game",
  "sessionDate": "2026-04-29",
  "beats": [
    {
      "at": "00:18",
      "label": "first moving hazard",
      "kind": "teach",
      "novelty": "new-verb",
      "skills": ["jump"],
      "practicedBefore": true,
      "readable": true,
      "notes": "safe lane before pit"
    },
    {
      "at": "00:42",
      "label": "gap plus enemy lane",
      "kind": "test",
      "novelty": "new-combo",
      "skills": ["jump", "timing"],
      "practicedBefore": false,
      "readable": true,
      "activeDemands": 2,
      "newDemands": 1,
      "stackReadable": true,
      "notes": "combo ask lands one beat after isolated jump"
    }
  ],
  "retrySeconds": 5,
  "returnsToCurrentTestQuickly": true,
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "stack failure came from demand load, not camera drift or late response"
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 2,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 1,
    "notes": [
      "tracked first-run timeline through first fail-and-retry",
      "confirmed second novelty stack on repeat run"
    ]
  },
  "resumeProbes": [
    {
      "breakType": "tab-switch",
      "secondsAway": 45,
      "resumeSurface": "active run",
      "currentGoalRecoverable": true,
      "controlsRecoverable": false,
      "nextActionClear": true,
      "needsMenuDive": false,
      "stalePromptMismatch": false,
      "notes": "goal holds, but current verb reminder does not survive the break"
    }
  ],
  "strengths": [
    "new jump timing appears alone before enemy overlap"
  ],
  "frictions": [
    "second mechanic arrives one beat after the first without consolidation"
  ]
}
```

## Heuristic Lens

- Good pacing teaches one demand, then asks for a readable test, then combines it later.
- Good sticky loops use short consolidation beats so mastery can stack instead of blur.
- Good escalation changes one variable at a time before overlap spikes.
- Good mechanic depth raises stack pressure after rehearsal, not during first contact with the new ask.
- Good stack review checks whether the player is solving a readable chain of learned behaviors or juggling too many fresh demands at once.
- Good retry pacing returns player near the failed lesson, not far upstream in dead time.
- Good pacing support lets the player recover the current lesson or next step after interruption instead of turning memory load into fake difficulty.
- Good pacing review rejects false rhythm diagnoses when blocked view, auto-camera behavior, or response instability made the beat unreadable.
- Good audit outputs keep evidence and severity coupled so repeated passes stay comparable across different games.

## Output Shape

- `Findings`: blocker first, then major, then minor.
- `Evidence Snapshot`: how much direct evidence the pass actually sampled.
- `Beat Timeline`: compact sequence of teach, test, rest, twist, and fail beats.
- `Interruption Recovery`: whether a short break still preserves current lesson, controls, and next action cheaply enough that the loop stays warm.
- `Mechanic Stack Snapshot`: peak active demands, where new demands entered, and whether stack pressure stayed readable.
- `Control And View Confounders`: whether pacing claims may be distorted by camera, visibility, or response-timing instability.
- `Evidence-Backed Next Steps`: only steps supported by logged pacing failures.
- `Durable Learning`: one concise line worth carrying into catalog-wide taste memory and saving in `./.agents/skills/pacing-curve-audit/LEARNINGS.md`.

## Sources

- Linehan, Bellord, Kirman, Morford, and Roche (CHI PLAY 2014): successful learning curves introduce skills separately, require basic first use, provide practice plus integration, then raise complexity until the next skill.
- Sarkar, Cooper, and Cooper (CHI 2019): difficulty should stay compatible with player skill so the player is neither overwhelmed nor underchallenged; curve analysis can drive concrete design changes.
- Gee, `Learning by Design: Games as Learning Machines` (GDC 2004): good pacing alternates extended practice, mastery tests, and new challenge; information works best just in time and on demand.
- Microsoft Learn XAG 109, last updated 2026-03-04: clear objective review and prescriptive next steps reduce memory-tax pacing failures during active play and after short breaks.
- Microsoft Learn XAG 114, last updated 2026-03-04: UI context matters because players need enough state context to understand what interaction or gameplay state they are returning to.
- Game Accessibility Guidelines: reminder of current objectives, contextual help, and practice without failure help keep pacing readable instead of memory-taxing.
- W3C WCAG-EM 2.0: define evaluation scope, sample representative contexts, and report findings against the sampled evidence so narrow observations do not get overstated as broad verdicts.
