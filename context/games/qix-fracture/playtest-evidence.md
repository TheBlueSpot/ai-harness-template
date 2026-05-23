# Playtest Evidence Session

Game: qix-fracture
Date: 2026-04-30
Focus: first-contact, busy-frame, fail-retry, resume-probe, capture

## Evidence Snapshot

- Mode: direct-play
- Runs: 2
- Failures: 1
- Busy frames: 1
- Encounters: 2
- Contacts: 1
- Resume probes: 1
- Notes: first run used a deliberate self-cross to confirm the reset stays instant | second run sealed the stage-one anomaly and verified the shield boon plus HUD update

## Evidence Sufficiency

- Directness: strong
- Covered contexts: first-contact | busy-frame | fail-retry | contact | beat-timeline | resume-probe
- Missing contexts: none
- Claim ceiling: session supports focused audit claims for covered lenses, but still only for observed contexts and sample size.

## Session Read

- minor: shared capture complete with no obvious cross-audit blocker. Evidence: logged session covers multiple lenses without a clear blocker pattern in raw evidence.

## Coverage Gates

- onboarding critique: ready. Ready for downstream audit.
- HUD readability audit: ready. Ready for downstream audit.
- pacing curve audit: ready. Ready for downstream audit.
- failure loop audit: ready. Ready for downstream audit.
- impact feel audit: ready. Ready for downstream audit.

## Downstream Claim Guardrails

### onboarding critique

- Gate: ready
- Allowed: report only observed onboarding critique strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge first-contact clarity, reminder availability, and teaching load only if logged | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim return-after-break clarity without a logged interruption-resume probe
- Next evidence: none

### HUD readability audit

- Gate: ready
- Allowed: report only observed hud readability audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge cue/HUD readability only for logged busy-frame or critical-read moments | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not call HUD readable from calm screens alone
- Next evidence: none

### pacing curve audit

- Gate: ready
- Allowed: report only observed pacing curve audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge sequencing only from logged beat order and retry loop | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim full run pacing from one partial opening without later beat evidence | do not claim interruption recovery support without a logged resume probe or reminder check
- Next evidence: none

### failure loop audit

- Gate: ready
- Allowed: report only observed failure loop audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge failure readability and retry cost only from logged fail-retry sequence | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim restart loop quality without an observed retry path
- Next evidence: none

### impact feel audit

- Gate: ready
- Allowed: report only observed impact feel audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge contact truth or force hierarchy only for logged contact samples | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim heavy-hit payoff if no heavy or high-stakes contact was observed
- Next evidence: none

## Strengths

- first action stays legible without a tutorial wall
- failure loop remains near-instant after a bad cut
- the new anomaly reward adds variety through the same cut-and-close action instead of a separate subsystem

## Frictions

- the objective panel carries most of the anomaly explanation, so the board icon itself stays more thematic than self-explanatory

## Starter JSON

### Onboarding Critique

```json
{
  "game": "qix-fracture",
  "sessionDate": "2026-04-30",
  "verbs": [
    {
      "name": "leave border + close cut",
      "firstPromptAt": "00:02",
      "firstRequiredAt": "00:02",
      "practiceBeforeRisk": true,
      "feedback": "clear"
    },
    {
      "name": "route safely + seal optional reward",
      "firstPromptAt": "00:17",
      "firstRequiredAt": "00:17",
      "practiceBeforeRisk": true,
      "feedback": "clear"
    }
  ],
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
  "teachingLoad": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "upfrontInstructionScreens": 0,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 2,
    "sampledFailures": 1,
    "sampledResumeProbes": 1,
    "notes": [
      "first run used a deliberate self-cross to confirm the reset stays instant",
      "second run sealed the stage-one anomaly and verified the shield boon plus HUD update"
    ]
  },
  "resumeProbes": [
    {
      "breakType": "tab-switch",
      "secondsAway": 20,
      "resumeSurface": "active run",
      "currentGoalRecoverable": true,
      "controlsRecoverable": true,
      "nextActionClear": true,
      "needsMenuDive": false,
      "stalePromptMismatch": false,
      "notes": "the live objective and persistent controls note are still enough to resume the cut after a short break"
    }
  ],
  "strengths": [
    "first action stays legible without a tutorial wall",
    "failure loop remains near-instant after a bad cut",
    "the new anomaly reward adds variety through the same cut-and-close action instead of a separate subsystem"
  ],
  "frictions": [
    "the objective panel carries most of the anomaly explanation, so the board icon itself stays more thematic than self-explanatory"
  ]
}
```

### HUD Readability Audit

```json
{
  "game": "qix-fracture",
  "sessionDate": "2026-04-30",
  "criticalElements": [
    {
      "name": "field mod meter",
      "location": "top HUD",
      "importance": "supporting",
      "readsWithoutText": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "glanceCost": "low",
      "notes": "reads as None, shield, or timer without covering the play lane"
    },
    {
      "name": "objective panel",
      "location": "top-right playfield edge",
      "importance": "critical",
      "readsWithoutText": false,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "glanceCost": "medium",
      "notes": "restates the current zone lesson and anomaly reward during active play"
    }
  ],
  "cues": [
    {
      "name": "hazard sweep projection",
      "importance": "critical",
      "nearAction": true,
      "redundantSignal": false,
      "telegraphReadable": true,
      "requiredResponseObvious": true,
      "futurePathVisible": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "notes": "the projected line still reads during the anomaly signal stack"
    },
    {
      "name": "anomaly core",
      "importance": "supporting",
      "nearAction": true,
      "redundantSignal": true,
      "telegraphReadable": true,
      "requiredResponseObvious": true,
      "futurePathVisible": false,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "notes": "glowing diamond plus objective text makes the optional reward legible"
    }
  ],
  "stressFrames": [
    {
      "moment": "stage-one anomaly capture with field mod and capture cards on screen",
      "clutterSource": "stacked signal cards plus live hazard projections",
      "movingBackground": false,
      "blinkingContent": false,
      "autoUpdatingContent": true,
      "cameraMotion": false,
      "criticalInfoLost": false,
      "cueMasked": false,
      "responseStillReadable": true,
      "criticalElementsReadableUnderMotion": true,
      "notes": "top-left cards stay off the main cut lane and the projected hazards still read"
    }
  ],
  "clutter": {
    "cornerDashboard": true,
    "overlapBlocksAction": false,
    "backgroundNoiseHurtsRead": false,
    "movingUiDistraction": false,
    "blinkingUiDistraction": false,
    "autoUpdatingUiDistraction": true,
    "backgroundMotionDistractsRead": false,
    "subtitleOrToastOverlap": false,
    "peripheralScanLoad": "low"
  },
  "evidence": {
    "mode": "direct-play",
    "sampledEncounters": 2,
    "sampledBusyFrames": 1,
    "notes": [
      "first run used a deliberate self-cross to confirm the reset stays instant",
      "second run sealed the stage-one anomaly and verified the shield boon plus HUD update"
    ]
  },
  "strengths": [
    "first action stays legible without a tutorial wall",
    "failure loop remains near-instant after a bad cut",
    "the new anomaly reward adds variety through the same cut-and-close action instead of a separate subsystem"
  ],
  "frictions": [
    "the objective panel carries most of the anomaly explanation, so the board icon itself stays more thematic than self-explanatory"
  ]
}
```

### Pacing Curve Audit

```json
{
  "game": "qix-fracture",
  "sessionDate": "2026-04-30",
  "beats": [
    {
      "at": "00:02",
      "label": "first cut prompt",
      "kind": "teach",
      "novelty": "new-verb",
      "skills": [
        "leave border",
        "close cut"
      ],
      "practicedBefore": true,
      "readable": true,
      "notes": "start card and persistent objective make the first action explicit"
    },
    {
      "at": "00:07",
      "label": "deliberate self-cross reset",
      "kind": "fail",
      "novelty": "none",
      "skills": [
        "route safely"
      ],
      "practicedBefore": true,
      "readable": true,
      "notes": "failure fires immediately and returns to the same stage without menu friction"
    },
    {
      "at": "00:17",
      "label": "anomaly rectangle",
      "kind": "test",
      "novelty": "new-combo",
      "skills": [
        "route safely",
        "seal optional reward"
      ],
      "practicedBefore": true,
      "readable": true,
      "notes": "optional boon adds one extra decision without changing the base verb set"
    }
  ],
  "retrySeconds": 1,
  "returnsToCurrentTestQuickly": true,
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 2,
    "sampledFailures": 1,
    "sampledResumeProbes": 1,
    "notes": [
      "first run used a deliberate self-cross to confirm the reset stays instant",
      "second run sealed the stage-one anomaly and verified the shield boon plus HUD update"
    ]
  },
  "resumeProbes": [
    {
      "breakType": "tab-switch",
      "secondsAway": 20,
      "resumeSurface": "active run",
      "currentGoalRecoverable": true,
      "controlsRecoverable": true,
      "nextActionClear": true,
      "needsMenuDive": false,
      "stalePromptMismatch": false,
      "notes": "the live objective and persistent controls note are still enough to resume the cut after a short break"
    }
  ],
  "strengths": [
    "first action stays legible without a tutorial wall",
    "failure loop remains near-instant after a bad cut",
    "the new anomaly reward adds variety through the same cut-and-close action instead of a separate subsystem"
  ],
  "frictions": [
    "the objective panel carries most of the anomaly explanation, so the board icon itself stays more thematic than self-explanatory"
  ]
}
```

### Failure Loop Audit

```json
{
  "game": "qix-fracture",
  "sessionDate": "2026-04-30",
  "failures": [
    {
      "at": "00:07",
      "cause": "player folded the open cut back onto itself",
      "causeReadable": true,
      "correctiveActionClear": true,
      "retrySeconds": 1,
      "menuLayersBeforeRetry": 0,
      "checkpointLossSeconds": 0,
      "sourceVisibleOnFail": true,
      "returnsToRelevantDecision": true,
      "notes": "the run resets straight to the border and keeps the same lesson in view"
    }
  ],
  "failState": {
    "blockingOverlayDuringDeath": false,
    "futurePathVisible": true,
    "objectiveReminderAvailableAfterFail": true
  },
  "pressure": {
    "newThreatBeforeMastery": false,
    "overlapSpike": false,
    "telegraphReadable": true
  },
  "learningLoop": {
    "immediateRetry": true,
    "practiceWithoutFailure": false,
    "sameSkillRetestedQuickly": true
  },
  "recoverySupport": {
    "quickStartAfterFailure": true,
    "difficultyAdjustableAfterFailure": false,
    "assistOrSkipAvailable": false,
    "tutorialOrHintReopenable": true
  },
  "evidence": {
    "mode": "direct-play",
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 1,
    "notes": [
      "first run used a deliberate self-cross to confirm the reset stays instant",
      "second run sealed the stage-one anomaly and verified the shield boon plus HUD update"
    ]
  },
  "resumeProbes": [
    {
      "breakType": "tab-switch",
      "secondsAway": 20,
      "resumeSurface": "active run",
      "currentGoalRecoverable": true,
      "controlsRecoverable": true,
      "nextActionClear": true,
      "needsMenuDive": false,
      "stalePromptMismatch": false,
      "notes": "the live objective and persistent controls note are still enough to resume the cut after a short break"
    }
  ],
  "strengths": [
    "first action stays legible without a tutorial wall",
    "failure loop remains near-instant after a bad cut",
    "the new anomaly reward adds variety through the same cut-and-close action instead of a separate subsystem"
  ],
  "frictions": [
    "the objective panel carries most of the anomaly explanation, so the board icon itself stays more thematic than self-explanatory"
  ]
}
```

### Impact Feel Audit

```json
{
  "game": "qix-fracture",
  "sessionDate": "2026-04-30",
  "contacts": [
    {
      "event": "anomaly seal capture",
      "intensity": "medium",
      "hitReadable": true,
      "forceReadable": true,
      "scenePreserved": true,
      "audioCoherent": false,
      "hitStop": "none",
      "cameraSupport": "none",
      "notes": "the reward lands through space conversion, signal text, and HUD state instead of heavy spectacle"
    }
  ],
  "channelSupport": {
    "criticalInfoMultiChannel": false,
    "hapticsUsed": false,
    "hapticsConfigurable": false,
    "hapticsCarryCriticalInfoAlone": false
  },
  "evidence": {
    "mode": "direct-play",
    "sampledEncounters": 2,
    "sampledContacts": 1,
    "sampledHeavyContacts": 0,
    "notes": [
      "first run used a deliberate self-cross to confirm the reset stays instant",
      "second run sealed the stage-one anomaly and verified the shield boon plus HUD update"
    ]
  },
  "strengths": [
    "first action stays legible without a tutorial wall",
    "failure loop remains near-instant after a bad cut",
    "the new anomaly reward adds variety through the same cut-and-close action instead of a separate subsystem"
  ],
  "frictions": [
    "the objective panel carries most of the anomaly explanation, so the board icon itself stays more thematic than self-explanatory"
  ]
}
```

## Durable Learning

- Shared evidence capture should include at least one interruption-resume probe for this catalog because sticky arcade judgment falls apart when first-run notes ignore whether players can recover the current goal, controls, and next action after a short break or tab switch.
