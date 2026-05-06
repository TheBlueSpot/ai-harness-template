# Playtest Evidence Session

Game: duck-hunt-gallery
Date: 2026-05-02
Focus: first-contact, busy-frame, impact, retry

## Evidence Snapshot

- Mode: mixed
- Runs: 1
- Failures: 0
- Retries: 0
- Busy frames: 1
- Encounters: 2
- Contacts: 4
- Resume probes: 0
- Notes: Used current code inspection plus saved title and play screenshots from 2026-04-30 because no local browser automation path exists in this repo. | Focus stayed on feedback stack, readability under overlays, and whether retry remains instant.

## Evidence Sufficiency

- Directness: mixed
- Covered contexts: first-contact
- Missing contexts: busy-frame | fail-retry | contact | beat-timeline | resume-probe
- Claim ceiling: session is not strong enough for broad feel verdicts; treat outputs as provisional until direct-play coverage improves.

## Early Loop Cadence

- First meaningful input: menu click (1s).
- First risk: first flock spawn (4s).
- First reward or clear payoff: first duck hit (5s).
- First retry opportunity: lose or win card (25s).
- Cadence note: The loop exposes aim-and-fire immediately and keeps the route readable, but long-term freshness depends more on stronger moment-to-moment payoff than on new instruction..

## Session Read

- minor: shared capture complete with no obvious cross-audit blocker. Evidence: logged session covers multiple lenses without a clear blocker pattern in raw evidence.

## Coverage Gates

- onboarding critique: partial. Missing: capture at least one interruption-resume probe before claiming reminders survive a short break or tab switch. | if temporary onboarding prompts appeared, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.
- HUD readability audit: partial. Missing: capture at least one busy frame under pressure; calm screenshots are not enough. | log at least one overlapping-signal moment before claiming urgent cue priority stays readable under stack pressure.
- pacing curve audit: partial. Missing: log a beat timeline before judging pacing or escalation. | mark teach, test, or fail beats so the learning curve is visible. | log active-demand count, fresh-demand count, or stack readability for at least one beat before claiming escalation stays readable. | record at least one observed retry so return-to-lesson claims are grounded in real re-entry evidence.
- impact feel audit: partial. Missing: log at least one contact event before judging impact feel. | capture contact readability or force notes, not only vague feel words.
- failure loop audit: missing. Missing: capture at least one full fail-and-retry sequence. | record failure sample count so harsh-loop claims have scope. | record at least one observed retry so failure-loop claims do not infer re-entry from death count alone. | log retry path or recovery support instead of guessing re-entry quality. | log whether retry brings back a stable lesson or shifts setup and pressure too much to teach the intended correction. | log whether one mistake chains into repeated punishment before control returns. | log whether failure lesson was confounded by input certainty or obstructed view before blaming loop design alone.

## Cross-Audit Confounders

- Input certainty: unknown
- Response latency: unknown
- Camera supports action: unknown
- View obstructed at decision: unknown
- Auto-camera interference: unknown
- Notes: none

## Cue Channel Support

- Critical info multi-channel: unknown
- Critical info uses color only: unknown
- Critical info uses audio only: unknown
- Critical info still playable on mute: unknown
- Critical info has non-color backup: unknown
- Haptics used: unknown
- Haptics configurable: unknown
- Haptics carry critical info alone: unknown
- Cue detail: duck hit confirmation [channels=visual, audio, text; color-only=no; audio-only=no] | empty-clip feedback [channels=visual, audio, text; color-only=no; audio-only=no]

## Cue Competition

- none logged

## Temporary Prompt Recovery

- none logged

## Probe Outcomes

- first-contact: outcome=success; success rating=4/4; confidence=6/7; satisfaction=5/7; frustration=2/7-not-frustrated; mental demand=2/7-high; time pressure=3/7-high; effort=2/7-high; blockers=; notes=none
- busy-frame: outcome=partial; success rating=3/4; confidence=5/7; satisfaction=5/7; frustration=2/7-not-frustrated; mental demand=4/7-high; time pressure=4/7-high; effort=3/7-high; blockers=; notes=none
- impact: outcome=success; success rating=4/4; confidence=6/7; satisfaction=6/7; frustration=2/7-not-frustrated; mental demand=3/7-high; time pressure=4/7-high; effort=2/7-high; blockers=; notes=none

## Probe Load

- Average mental demand: 3/7-high.
- Average time pressure: 3.7/7-high.
- Average effort: 2.3/7-high.
- High-load probes: none.
- Read load alongside success. A probe that technically worked can still mark overload if demand, rush, or effort stayed high.

## Cross-Lens Incident Queue

- fresh-busy-frame-missing: title=No fresh post-pass live capture; lenses=hud, pacing, impact; first seen=verification planning; repeats=1; impact=medium; persistence=one-off; player cost=attention-tax; next check=Capture one active cross-flock frame after the new particle and popup stack lands.; notes=none

## Stack Pressure

- none logged

## Downstream Claim Guardrails

### onboarding critique

- Gate: partial
- Allowed: report only observed onboarding critique strengths or frictions from this session | keep wording scoped to mixed evidence and sampled contexts | judge first-contact clarity, reminder availability, and teaching load only if logged | judge temporary onboarding prompt recovery only when ephemeral moments were logged | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim return-after-break clarity without a logged interruption-resume probe | do not call transient tutorials harmless if prompt persistence or replayability was not sampled | do not issue clean-pass or comprehensive verdict language
- Next evidence: capture at least one interruption-resume probe before claiming reminders survive a short break or tab switch. | if temporary onboarding prompts appeared, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.

### HUD readability audit

- Gate: partial
- Allowed: report only observed hud readability audit strengths or frictions from this session | keep wording scoped to mixed evidence and sampled contexts | judge cue/HUD readability only for logged busy-frame or critical-read moments | flag when read failures may be compounded by obstructed view or auto-camera interference | judge overlap priority only when at least one cue-competition moment was logged | judge temporary warning or popup recovery only when ephemeral moments were logged | judge color-only or audio-only cue fragility only when cue-channel support was logged | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not call HUD readable from calm screens alone | do not claim multi-warning clarity if no competition moment was sampled | do not treat disappearing prompts as readable if replayability or player pacing was not checked | do not assume critical cues survive mute play or color ambiguity if no fallback-channel evidence was logged | do not issue clean-pass or comprehensive verdict language
- Next evidence: capture at least one busy frame under pressure; calm screenshots are not enough. | log at least one overlapping-signal moment before claiming urgent cue priority stays readable under stack pressure.

### pacing curve audit

- Gate: partial
- Allowed: report only observed pacing curve audit strengths or frictions from this session | keep wording scoped to mixed evidence and sampled contexts | judge sequencing only from logged beat order and retry loop | separate stack overload from control/view confounders when those were logged | judge escalation readability only when beat notes include active or fresh demand counts | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim full run pacing from one partial opening without later beat evidence | do not claim interruption recovery support without a logged resume probe or reminder check | do not claim mechanic stack stayed readable if beat-level stack evidence was not logged | do not issue clean-pass or comprehensive verdict language
- Next evidence: log a beat timeline before judging pacing or escalation. | mark teach, test, or fail beats so the learning curve is visible. | log active-demand count, fresh-demand count, or stack readability for at least one beat before claiming escalation stays readable. | record at least one observed retry so return-to-lesson claims are grounded in real re-entry evidence.

### impact feel audit

- Gate: partial
- Allowed: report only observed impact feel audit strengths or frictions from this session | keep wording scoped to mixed evidence and sampled contexts | judge contact truth or force hierarchy only for logged contact samples | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim heavy-hit payoff if no heavy or high-stakes contact was observed | do not issue clean-pass or comprehensive verdict language
- Next evidence: log at least one contact event before judging impact feel. | capture contact readability or force notes, not only vague feel words.

### failure loop audit

- Gate: missing
- Allowed: report only observed failure loop audit strengths or frictions from this session | keep wording scoped to mixed evidence and sampled contexts | judge failure readability and retry cost only from logged fail-retry sequence | judge chain punishment and lesson stability only when those fields were logged | say when death readability was confounded by control or camera support instead of loop structure alone
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim restart loop quality without an observed retry path | do not claim fair retry teaching if chain-punish or retry-stability evidence was not sampled | do not run downstream verdict as if audit evidence exists
- Next evidence: capture at least one full fail-and-retry sequence. | record failure sample count so harsh-loop claims have scope. | record at least one observed retry so failure-loop claims do not infer re-entry from death count alone. | log retry path or recovery support instead of guessing re-entry quality. | log whether retry brings back a stable lesson or shifts setup and pressure too much to teach the intended correction. | log whether one mistake chains into repeated punishment before control returns. | log whether failure lesson was confounded by input certainty or obstructed view before blaming loop design alone.

## Strengths

- none logged

## Frictions

- none logged

## Starter JSON

### Onboarding Critique

```json
{
  "game": "duck-hunt-gallery",
  "sessionDate": "2026-05-02",
  "verbs": [],
  "reminders": {
    "controlsDuringPlay": true,
    "objectiveDuringPlay": true,
    "progressSafe": true,
    "remapSafe": false
  },
  "objectiveClarity": {
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true
  },
  "earlyLoop": {
    "firstMeaningfulInputAt": "menu click",
    "secondsToFirstMeaningfulInput": 1,
    "firstRiskAt": "first flock spawn",
    "secondsToFirstRisk": 4,
    "firstRewardAt": "first duck hit",
    "secondsToFirstReward": 5,
    "firstRetryOpportunityAt": "lose or win card",
    "secondsToFirstRetryOpportunity": 25,
    "notes": "The loop exposes aim-and-fire immediately and keeps the route readable, but long-term freshness depends more on stronger moment-to-moment payoff than on new instruction."
  },
  "teachingLoad": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "upfrontInstructionScreens": 0,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": false
  },
  "evidence": {
    "mode": "mixed",
    "sampledRuns": 1,
    "sampledFailures": 0,
    "sampledRetries": 0,
    "sampledResumeProbes": 0,
    "notes": [
      "Used current code inspection plus saved title and play screenshots from 2026-04-30 because no local browser automation path exists in this repo.",
      "Focus stayed on feedback stack, readability under overlays, and whether retry remains instant."
    ]
  },
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 3,
      "effort": 2,
      "blockers": [],
      "note": "Menu and briefing already communicate the loop fast."
    },
    {
      "probe": "busy-frame",
      "outcome": "partial",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 4,
      "timePressure": 4,
      "effort": 3,
      "blockers": [],
      "note": "Readability looks stable from current captures and code, but a fresh live busy-frame screenshot is still missing."
    },
    {
      "probe": "impact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 2,
      "mentalDemand": 3,
      "timePressure": 4,
      "effort": 2,
      "blockers": [],
      "note": "This pass mainly targeted shot, hit, and shell-state feedback."
    }
  ],
  "incidents": [
    {
      "incidentTag": "fresh-busy-frame-missing",
      "title": "No fresh post-pass live capture",
      "lenses": [
        "hud",
        "pacing",
        "impact"
      ],
      "firstSeenAt": "verification planning",
      "repeatedCount": 1,
      "impact": "medium",
      "persistence": "one-off",
      "playerCost": [
        "attention-tax"
      ],
      "nextCheck": "Capture one active cross-flock frame after the new particle and popup stack lands."
    }
  ],
  "strengths": [],
  "frictions": []
}
```

### HUD Readability Audit

```json
{
  "game": "duck-hunt-gallery",
  "sessionDate": "2026-05-02",
  "criticalElements": [
    {
      "name": "left quota and score panel",
      "location": "top-left",
      "importance": "critical",
      "readsWithoutText": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "glanceCost": "low",
      "notes": "Panel stays edge-anchored and separate from the flight lanes."
    },
    {
      "name": "crosshair reload meter",
      "location": "near action",
      "importance": "critical",
      "readsWithoutText": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "glanceCost": "low",
      "notes": "Reload progress sits on the aiming reticle, so the player does not have to leave the action to check clip recovery."
    }
  ],
  "cues": [
    {
      "name": "duck hit confirmation",
      "importance": "critical",
      "nearAction": true,
      "redundantSignal": true,
      "signalChannels": [
        "visual",
        "audio",
        "text"
      ],
      "reliesOnColorAlone": false,
      "reliesOnAudioAlone": false,
      "telegraphReadable": true,
      "requiredResponseObvious": true,
      "futurePathVisible": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "notes": "Post-pass feedback stack adds burst particles, score popups, and a short freeze so hits should read faster without covering the next lane."
    },
    {
      "name": "empty-clip feedback",
      "importance": "critical",
      "nearAction": true,
      "redundantSignal": true,
      "signalChannels": [
        "visual",
        "audio",
        "text"
      ],
      "reliesOnColorAlone": false,
      "reliesOnAudioAlone": false,
      "telegraphReadable": true,
      "requiredResponseObvious": true,
      "futurePathVisible": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "notes": "Ammo-empty edge case now distinguishes real reload from true shell exhaustion instead of always claiming reload."
    }
  ],
  "stressFrames": [],
  "competitionMoments": [],
  "ephemeralMoments": [],
  "clutter": {},
  "confounders": {},
  "evidence": {
    "mode": "mixed",
    "sampledEncounters": 2,
    "sampledBusyFrames": 1,
    "notes": [
      "Used current code inspection plus saved title and play screenshots from 2026-04-30 because no local browser automation path exists in this repo.",
      "Focus stayed on feedback stack, readability under overlays, and whether retry remains instant."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 3,
      "effort": 2,
      "blockers": [],
      "note": "Menu and briefing already communicate the loop fast."
    },
    {
      "probe": "busy-frame",
      "outcome": "partial",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 4,
      "timePressure": 4,
      "effort": 3,
      "blockers": [],
      "note": "Readability looks stable from current captures and code, but a fresh live busy-frame screenshot is still missing."
    },
    {
      "probe": "impact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 2,
      "mentalDemand": 3,
      "timePressure": 4,
      "effort": 2,
      "blockers": [],
      "note": "This pass mainly targeted shot, hit, and shell-state feedback."
    }
  ],
  "incidents": [
    {
      "incidentTag": "fresh-busy-frame-missing",
      "title": "No fresh post-pass live capture",
      "lenses": [
        "hud",
        "pacing",
        "impact"
      ],
      "firstSeenAt": "verification planning",
      "repeatedCount": 1,
      "impact": "medium",
      "persistence": "one-off",
      "playerCost": [
        "attention-tax"
      ],
      "nextCheck": "Capture one active cross-flock frame after the new particle and popup stack lands."
    }
  ],
  "strengths": [],
  "frictions": []
}
```

### Pacing Curve Audit

```json
{
  "game": "duck-hunt-gallery",
  "sessionDate": "2026-05-02",
  "beats": [],
  "earlyLoop": {
    "firstMeaningfulInputAt": "menu click",
    "secondsToFirstMeaningfulInput": 1,
    "firstRiskAt": "first flock spawn",
    "secondsToFirstRisk": 4,
    "firstRewardAt": "first duck hit",
    "secondsToFirstReward": 5,
    "firstRetryOpportunityAt": "lose or win card",
    "secondsToFirstRetryOpportunity": 25,
    "notes": "The loop exposes aim-and-fire immediately and keeps the route readable, but long-term freshness depends more on stronger moment-to-moment payoff than on new instruction."
  },
  "confounders": {},
  "evidence": {
    "mode": "mixed",
    "sampledRuns": 1,
    "sampledFailures": 0,
    "sampledRetries": 0,
    "sampledResumeProbes": 0,
    "notes": [
      "Used current code inspection plus saved title and play screenshots from 2026-04-30 because no local browser automation path exists in this repo.",
      "Focus stayed on feedback stack, readability under overlays, and whether retry remains instant."
    ]
  },
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 3,
      "effort": 2,
      "blockers": [],
      "note": "Menu and briefing already communicate the loop fast."
    },
    {
      "probe": "busy-frame",
      "outcome": "partial",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 4,
      "timePressure": 4,
      "effort": 3,
      "blockers": [],
      "note": "Readability looks stable from current captures and code, but a fresh live busy-frame screenshot is still missing."
    },
    {
      "probe": "impact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 2,
      "mentalDemand": 3,
      "timePressure": 4,
      "effort": 2,
      "blockers": [],
      "note": "This pass mainly targeted shot, hit, and shell-state feedback."
    }
  ],
  "incidents": [
    {
      "incidentTag": "fresh-busy-frame-missing",
      "title": "No fresh post-pass live capture",
      "lenses": [
        "hud",
        "pacing",
        "impact"
      ],
      "firstSeenAt": "verification planning",
      "repeatedCount": 1,
      "impact": "medium",
      "persistence": "one-off",
      "playerCost": [
        "attention-tax"
      ],
      "nextCheck": "Capture one active cross-flock frame after the new particle and popup stack lands."
    }
  ],
  "strengths": [],
  "frictions": []
}
```

### Failure Loop Audit

```json
{
  "game": "duck-hunt-gallery",
  "sessionDate": "2026-05-02",
  "failures": [],
  "failState": {},
  "pressure": {},
  "learningLoop": {},
  "recoverySupport": {},
  "confounders": {},
  "evidence": {
    "mode": "mixed",
    "sampledFailures": 0,
    "sampledRetries": 0,
    "sampledResumeProbes": 0,
    "notes": [
      "Used current code inspection plus saved title and play screenshots from 2026-04-30 because no local browser automation path exists in this repo.",
      "Focus stayed on feedback stack, readability under overlays, and whether retry remains instant."
    ]
  },
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 3,
      "effort": 2,
      "blockers": [],
      "note": "Menu and briefing already communicate the loop fast."
    },
    {
      "probe": "busy-frame",
      "outcome": "partial",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 4,
      "timePressure": 4,
      "effort": 3,
      "blockers": [],
      "note": "Readability looks stable from current captures and code, but a fresh live busy-frame screenshot is still missing."
    },
    {
      "probe": "impact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 2,
      "mentalDemand": 3,
      "timePressure": 4,
      "effort": 2,
      "blockers": [],
      "note": "This pass mainly targeted shot, hit, and shell-state feedback."
    }
  ],
  "incidents": [
    {
      "incidentTag": "fresh-busy-frame-missing",
      "title": "No fresh post-pass live capture",
      "lenses": [
        "hud",
        "pacing",
        "impact"
      ],
      "firstSeenAt": "verification planning",
      "repeatedCount": 1,
      "impact": "medium",
      "persistence": "one-off",
      "playerCost": [
        "attention-tax"
      ],
      "nextCheck": "Capture one active cross-flock frame after the new particle and popup stack lands."
    }
  ],
  "strengths": [],
  "frictions": []
}
```

### Impact Feel Audit

```json
{
  "game": "duck-hunt-gallery",
  "sessionDate": "2026-05-02",
  "contacts": [],
  "channelSupport": {},
  "evidence": {
    "mode": "mixed",
    "sampledEncounters": 2,
    "sampledContacts": 4,
    "sampledHeavyContacts": 0,
    "notes": [
      "Used current code inspection plus saved title and play screenshots from 2026-04-30 because no local browser automation path exists in this repo.",
      "Focus stayed on feedback stack, readability under overlays, and whether retry remains instant."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 3,
      "effort": 2,
      "blockers": [],
      "note": "Menu and briefing already communicate the loop fast."
    },
    {
      "probe": "busy-frame",
      "outcome": "partial",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 4,
      "timePressure": 4,
      "effort": 3,
      "blockers": [],
      "note": "Readability looks stable from current captures and code, but a fresh live busy-frame screenshot is still missing."
    },
    {
      "probe": "impact",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 2,
      "mentalDemand": 3,
      "timePressure": 4,
      "effort": 2,
      "blockers": [],
      "note": "This pass mainly targeted shot, hit, and shell-state feedback."
    }
  ],
  "incidents": [
    {
      "incidentTag": "fresh-busy-frame-missing",
      "title": "No fresh post-pass live capture",
      "lenses": [
        "hud",
        "pacing",
        "impact"
      ],
      "firstSeenAt": "verification planning",
      "repeatedCount": 1,
      "impact": "medium",
      "persistence": "one-off",
      "playerCost": [
        "attention-tax"
      ],
      "nextCheck": "Capture one active cross-flock frame after the new particle and popup stack lands."
    }
  ],
  "strengths": [],
  "frictions": []
}
```

## Durable Learning

- Shared playtest capture should save sampled scope and claim ceilings into repo-local Kojima memory, because first-contact still leaves onboarding critique, HUD readability audit, pacing curve audit, impact feel audit, failure loop audit only partially proven.

## 2026-05-06 Verification Addendum

- Direct browser smoke refreshed again on May 6, 2026 from `file:///.../duck-hunt-gallery/index.html` with fresh `2026-05-06-polish-pass-menu.png`, `2026-05-06-polish-pass-briefing.png`, `2026-05-06-polish-pass-play.png`, `2026-05-06-polish-pass-stage9.png`, and `2026-05-06-polish-pass-state.json` artifacts in `./.local-duck-hunt-playpass/`; menu -> briefing -> play and a forced stage-9 pressure setup both logged 0 page or console errors after the latest patch.
- Latest bounded polish pass stayed audiovisual and truth-local: stage-5-and-up BGM now carries a light upper counterline, crossing entries get a tighter flyby chirp, shot and splash beats leave short smoke plumes, and the post layer adds moving water caustics plus a soft solar flare instead of more HUD or rule work.
- The new smoke re-open also found one last cheap positional-audio honesty miss: whiff cues were still collapsing to center even when the shot lane sat on the far edge. Miss stings now pan from the real crosshair side, so panic edge shots and their failure readback agree.
- Direct browser smoke refreshed again on May 6, 2026 from `file:///.../duck-hunt-gallery/index.html` with new `2026-05-06e` artifacts in `./.local/`; the bounded run still reached menu -> briefing -> play with 0 page or console errors after the positional-audio and post-FX follow-up.
- A targeted edge-reload probe also stayed clean on May 6, 2026 with `./.local-duck-hunt-playpass/2026-05-06-reload-edge-clamp.png` plus matching JSON proof: burning the clip near the lower-right corner kept the reload bar inside the canvas and logged 0 runtime errors.
- Latest bounded follow-up stayed polish-local: shot, hit, cache, splash, and spawn cues now carry light stereo placement instead of collapsing to center, while the render pass adds a restrained horizon glow, angled light shaft, and impact-ring bloom for more scene depth without changing rules or bird timing.
- Script-level boot smoke refreshed on May 6, 2026 against `./duck-hunt-gallery/index.html` by parsing the shipped inline runtime, stubbing DOM/canvas APIs, and exercising `startRun()` -> `startStage(0)` -> forced reload completion with 0 thrown runtime errors.
- Latest bounded polish bundle stayed feel-local: shot, hit, spawn, and chapter-end beats now carry denser transient layers plus upward spray punctuation; combo streaks get a short gold pulse and the pressure pass adds a light edge tint instead of more permanent HUD.
- Cheap local bug fix stayed in the readback layer, not the rules: long marsh-radio copy now wraps inside the play toast so richer callouts do not clip into the footer line during live quota or reload readback.
- Direct browser smoke refreshed on May 6, 2026 from `file:///.../duck-hunt-gallery/index.html` with fresh artifacts in `./.local-duck-hunt-playpass/`.
- Verified path: menu -> briefing -> play -> forced lose -> retry briefing -> retry play. The active retry path still returns to a stable first-stage lesson without adding downtime.
- Latest local polish bundle stayed scene-local: stronger transition wash plus roomier non-play card presentation. The hunt loop, stage rules, and in-play timing were unchanged.
- Follow-up cutscene pass stayed scene-local too: the non-play cards now add a compact story strip for route, pattern, priority, and retry context, and the win ledger now tracks actual clears instead of raw attempt count.
- Direct browser hit-smoke refreshed again on May 6, 2026 from `file:///.../duck-hunt-gallery/index.html` with `2026-05-06-audio-polish-pass*` plus `2026-05-06-audio-polish-hit-pass*` artifacts in `./.local-duck-hunt-playpass/`; the bounded run reached menu -> briefing -> play, landed 2 live hits for 200 score, kept `Audio: On (M)` visible, and logged 0 console errors.
- Latest local polish bundle stayed feel-local: stronger BGM undertow, denser shot/hit/stage SFX layers, fuller start/clear/fail flashes and bursts, and corrected ripple color readback so water and special-hit rings render with their intended hues.
- Direct browser smoke refreshed again on May 6, 2026 straight from `file:///.../duck-hunt-gallery/index.html`; Playwright re-verified `startRun()` -> `startStage(0)` plus a forced reload path and a separate stage-9 pressure setup with 0 page errors after the latest patch.
- Fresh May 6 live pressure proof now includes `./.local-duck-hunt-playpass/2026-05-06-stage9-pressure-live.png` plus matching JSON state capture. That recheck showed the remaining cheap feel gap was incoming-side arrival truth, not rule clarity, so crossed or rare spawns now add a short directional flyby layer and restrained edge-wake post wash without widening the HUD.
- Latest local follow-up stayed bounded to edge and readback trust: spawn entries now throw short side spray-plus-ring punctuation, rare offscreen birds hold a brighter inward tether, and the live toast footer stopped spending its last line on meaningless `Clear bonus 0` text during combat.
- Evidence gap still open: one audible live pass should confirm the new transition wash plus stereo placement read as atmosphere rather than clutter, and one fresh late busy frame is still the right follow-up before broader readability claims.
