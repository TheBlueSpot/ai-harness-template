---
name: playtest-evidence-capture
description: Capture one browser-playtest session in reusable evidence form, then emit compact audit-ready JSON starters for activation-loop, onboarding, HUD readability, telegraph readability, pacing, failure-loop, mastery-motivation, choice-readback, readable-progression, forgiveness, settings-and-assists, and impact-feel passes. Use when Codex needs one shared observation record instead of re-logging the same session separately for each audit skill.
---

# Playtest Evidence Capture

## Overview

Use this skill before or during direct browser play when one session should feed several existing audit skills. Goal: log evidence once, keep scope explicit, and turn one compact observation file into reusable starter blocks plus downstream coverage gates and claim guardrails for:

- activation loop audit
- onboarding critique
- HUD readability
- telegraph readability
- pacing curve
- failure loop
- impact feel
- mastery motivation
- choice readback
- readable progression
- forgiveness
- settings and assists

Use the responsiveness probe lane when the question is whether input or restart answers fast enough to trust. That lane should prefer first-input-to-next-paint, restart-to-control-ready, and blocked-frame capture over FPS-only inference, then feed later activation or trust audits before any calmer smoothness read.

Use the control-surface lane when the question is whether the game exposes usable remap and tuning surfaces. That lane should log remap scope, whether remaps reflect back in prompts, hold-toggle alternatives, sensitivity, inversion, axis controls, and any game-speed or timing relief. Keep it separate from the input-demand lane, which stays focused on motor-tax burden, and keep both lanes distinct from settings-and-assists unless the session explicitly captured that boundary.

Current probe caveat: treat restart `control-ready` as strongest when an explicit restart control exists and the bounded post-restart probe input produces a follow-up paint. When browser support or game structure blocks that path, keep the JSON explicit about what stayed unsupported, estimated, or entirely missing instead of silently flattening the gap into `smooth enough`.

Current normalized probe contract:

- `firstInput.timing` carries `sourceLabel`, timing semantics, and explicit note text that says whether the measure came from real `PerformanceEventTiming`, `requestAnimationFrame` estimate, or no captured timing surface.
- `firstInput.eventTimings` preserves derived `inputDelay`, `handlerDuration`, and `presentationDelay` beside raw `processingStart` / `processingEnd`, so downstream trust reviews do not have to recompute the handler split by hand.
- `evidenceStatus.*` and support surfaces keep explicit `state` values, so `supported but unobserved` never collapses into `unsupported`.
- `metadata.notes` keeps the direct-browser resolution path plus any fallback reasons, so later audits can tell whether the probe ran from a slug-resolved browser path or a direct URL fixture.

Use the trace-backed evidence lane when the question is `what exactly happened during the unclear boot, restart, or readability moment and how do I inspect it later without replaying the session`. That lane should save one Playwright `trace.zip`, rely on Trace Viewer filmstrip plus DOM snapshots for step-by-step inspection, and add a few targeted screenshots so the next audit or fix pass can reopen the exact state quickly.

Use the text-and-motion smoke lane when the question is `is this visibility complaint real enough to block later HUD or busy-frame work`. That lane reuses one captured observation JSON, scores text legibility evidence, contrast stability, color-only meaning, and text-over-motion risk, and keeps the report compact enough for screenshot-driven follow-up instead of debate.

Use the cue-redundancy smoke lane when the question is `is this essential cue still too fragile to trust`. That lane reuses one captured observation JSON, scores text-only, sound-only, color-only, and edge-only cue risk, and keeps the report compact enough to direct later onboarding, HUD, or telegraph follow-up instead of re-litigating the same warning stack.

Use the timed-prompt smoke lane when the question is `did a non-core tutorial, warning, chat, or objective prompt disappear too fast or compete with live play`. That lane reuses one captured observation JSON, scores player-paced control, replayability, live obstruction, and timed-warning stack pressure, and keeps the report compact enough to hand off to onboarding, HUD, or failure work without pretending it judged core gameplay timers.

Concrete opportunity: local audit skills already judge well, but they repeat evidence intake and can overclaim from thin samples. Shared capture now makes cross-skill analysis more comparable, reduces drift between what was seen and what each later audit claims, marks which downstream audits are actually evidence-ready versus still unproven, states claim ceilings so thin evidence does not harden into confident catalog lore, adds one explicit interruption-resume probe so onboarding and pacing claims do not ignore what happens after a short break or tab switch, expects must-react cue notes to say whether the needed response and future path were actually visible, logs whether critical cues depended on color alone or audio alone so HUD and failure judgments do not confuse one-lucky-session readability with durable clarity, logs control/view confounders so later audits do not blame HUD or pacing for deaths actually caused by camera obstruction or unstable response, records whether one mistake chained into repeated punishment plus whether retry actually brought back the same lesson stably enough to test the intended fix, preserves urgent cue competition and mechanic-stack readability, tracks retry counts separately from death counts so downstream loop claims rest on observed re-entry instead of inferred re-entry, now logs early-loop cadence once so later onboarding and pacing passes do not hand-wave delayed agency or delayed payoff, still logs temporary-prompt recovery so later audits can tell the difference between readable short-lived information and information that simply disappeared before the player could recheck it, ships a reusable probe deck so evaluators start from the same five task-based capture beats instead of freeform wandering, records one structured outcome row per probe so later audits can distinguish full success, shaky success, and outright failure without reconstructing task results from prose, now adds lightweight workload scores per probe so the catalog can tell `worked` from `worked but only under overload`, and carries one shared cross-lens incident queue so repeated browser-play breakage gets tagged once and prioritized by recurrence instead of being rediscovered separately by each audit.

## 2026-05-02 Hardening Note

- Selection rationale for this follow-up stays narrow: telegraph readability already has meaningful shared fields and neighboring audit coverage, while responsiveness already shipped but still contained a concrete evidence defect. The hardening pass therefore prioritizes the shipped probe where `firstInput.timing` had been a marker echo instead of a real input-to-next-paint measure.
- Keep the telegraph-versus-responsiveness boundary explicit:
  - telegraph lane gap: the repo can already log `telegraphReadable`, `requiredResponseObvious`, and `futurePathVisible`, but still lacks one dedicated telegraph-first audit surface.
  - responsiveness lane gap: the repo already has a probe, but it needed real first-input timing, clearer restart/control-ready separation, and explicit unsupported-surface notes.
- Current browser-support caveats:
  - `PerformanceEventTiming` is the strongest first-input evidence when available and emitted.
  - When `PerformanceEventTiming` exists, keep derived `inputDelay`, `handlerDuration`, and `presentationDelay` with the sample so later audits can say where the interaction budget was spent.
  - `requestAnimationFrame` fallback is only an estimate and must stay labeled as such.
  - `long-animation-frame` attribution remains browser-dependent and may be absent even in a valid run.
  - restart `control-ready` is heuristic unless a game exposes a clear restart control and the bounded post-restart probe input produces a follow-up paint.
- Telegraph lane note:
  - this lane reuses the shared cue fields, but stays distinct from responsiveness. It should describe dangerous space, the implied response, future-path visibility, and how confident the read felt.
  - do not smuggle raw input latency or restart timing into this lane; those stay in the responsiveness probe.

## Workflow

1. Start from direct browser play when possible.
2. Capture one short session with explicit evidence scope: first contact, one pressure moment, one fail-and-retry when possible, one interruption-resume probe, one contact or payoff moment when relevant, and one meaningful choice moment when the game actually offers a branch worth comparing.
3. Log only observed facts in one JSON file. Do not write design conclusions into the raw capture.
4. Run helper to produce:
   - compact markdown session report
   - evidence sufficiency summary with covered and missing contexts
  - coverage gates for activation, onboarding, HUD, pacing, failure-loop, mastery-motivation, forgiveness, and impact passes
  - coverage gate for telegraph readability when cue evidence can support a telegraph-first review
  - coverage gate for choice-readback when the session captured compared alternatives, expected payoff, and after-pick state readback
  - coverage gate for readable progression when progress readback can support a next-step review
  - coverage gate for control-surface when remap and tuning surfaces can support a lane-boundary review
  - coverage gate for settings-and-assists when recovery-trust evidence can support live, pause, and post-failure settings review
  - per-audit claim guardrails that say what later audits may claim, must not claim, and still need to sample
  - starter JSON blocks for existing audit skills
  - starter JSON blocks for telegraph readability when the session captured danger-space and future-path evidence
  - starter JSON block for choice-readback when the session captured compared alternatives, predicted payoff, and after-pick comparison against the changed state or build
  - starter JSON block for readable progression when the session captured proximal goals, prerequisite progress, and next-step readback
  - starter JSON block for control-surface when the session captured remap scope, tuning surfaces, and a settings-and-assists boundary note
  - starter JSON block for settings-and-assists when the session captured recovery reachability, progress-safe changes, reminder or practice recovery, and retry persistence
  - starter JSON block for forgiveness when the session captured intent-preservation, collision-leniency, or `stolen fail` evidence
  - optional per-audit starter JSON files with embedded coverage status and claim guardrails
  - optional normalized finding/action packet that groups repeated observations into compact evidence-backed themes with artifact citations, freshness, and claim ceilings
   - one session-derived durable learning line saved to `./.agents/skills/playtest-evidence-capture/LEARNINGS.md` and mirrored to `./.local/kojima/learnings.md`
   - responsiveness probe notes when that lane was used, so later trust reviews can reuse the timing signal instead of inferring from average FPS
   - busy-frame capture merges when that lane was used, so `stressFrames`, incidents, ephemeral prompt risk, and the busy-frame probe row stay inside the same shared-evidence report instead of a sidecar note
5. Copy one starter block into whichever focused audit skill the pass needs next.
6. If the slug already came from `catalog-sweep` quality prep, prefer `catalog-sweep/scripts/playtest_capture_pack.ts` first so the observation JSON, report path, and starter directory are chosen for you before direct play starts.
7. Before direct play, prefer a probe deck when you want lower evaluator drift. The deck turns the session into five explicit tasks: first contact, busy frame, fail-retry, interruption resume, and contact-payoff.
8. For the busy-frame lane, prefer the Playwright helper first when you want a small tagged frame set quickly. It saves screenshots plus a normalized JSON artifact that already uses `stressFrames` / shared-evidence vocabulary.
9. For unclear boot, restart, or cue-overlap bugs that still need post-run inspection, prefer the trace-backed evidence helper before freehand note-taking. It saves one trace plus a small screenshot set without requiring a full manual replay.
10. If a gate is `partial` or `missing`, keep later audit language narrow and evidence-scoped instead of writing a clean-pass verdict.
11. Use the interruption-resume probe to answer three concrete questions after a short pause, tab switch, or return-later moment:
   - can the player recover the current goal
   - can the player recover controls or verb reminders without menu spelunking
   - is the next action still obvious, or does the game rely on memory the player no longer has
12. For any must-react cue worth reusing in later HUD, telegraph, or failure-loop passes, log whether the telegraph made the needed response obvious and whether the future collision path or occupied space was visible.
13. For critical cues, also log channel support directly:
   - which channels carried the read: visual, audio, haptic, text
   - whether any meaning depended on color alone
   - whether any meaning depended on audio alone
   - whether mute play still preserved the critical read when relevant
14. Log at least one overlap where several urgent signals compete:
   - which signals overlapped
   - whether one dominant read won
   - whether response priority stayed obvious
   - whether non-critical UI joined the pileup
15. For pacing-sensitive beats, log stack pressure directly:
   - active demand count
   - fresh demand count
   - whether the stack still felt readable
16. For temporary prompts, warnings, and popups that matter later, log:
   - whether they auto-dismiss
   - whether the player controls the pace
   - whether the same information can be reviewed later
   - whether non-critical versions can be suppressed when they obstruct live play
17. Add one short control/view confounder note during pressure or failure sampling:
   - did input feel stable enough to trust the read
   - did response land in time for intended action
   - did camera or view support the decision, or block it
18. During fail-and-retry capture, also log:
   - whether one mistake chained into repeated punishment before control returned
   - whether the retry brought back a stable version of the same lesson or shifted pressure/setup too much to test the correction
   - how many retries were actually observed, separate from failure count
19. After each probe, log one structured `probeOutcomes` row:
   - probe name
   - outcome: `success`, `partial`, or `failed`
   - `successRating` on a 0 to 4 scale against that probe's concrete goal
   - `confidence`, `satisfaction`, and `frustration` on 1 to 7 scales
   - `mentalDemand`, `timePressure`, and `effort` on 1 to 7 scales where 1 is low and 7 is high
   - concrete blockers and a short observed note
20. When the same issue appears across more than one probe, add one `incidents` row:
   - short `incidentTag`
   - human-readable title
   - affected lenses
   - first seen time or beat
   - `repeatedCount`
   - `impact`: `low`, `medium`, or `high`
   - `persistence`: `one-off`, `repeatable`, or `constant`
   - concrete `playerCost`
   - one `nextCheck` that would confirm the root cause or the fix
21. When a meaningful choice appears, log the branch in enough detail that a later audit can tell what changed:
   - offered options
   - expected payoff before commitment
   - expected cost when relevant
   - comparison against the current state or current build before the pick
   - selected option
   - actual payoff after the pick resolves
   - whether the payoff matched expectation
   - after-pick comparison against the current state or build
22. Keep notes high level and game-local. Use this skill for shared evidence, not final game verdicts.
23. For telegraph reviews, log the dangerous space, implied response, future-path visibility, timing/readability confidence, and evidence ceiling from the same cue sample.
24. Log one early-loop cadence snapshot:
   - first meaningful input
   - first risk
   - first reward or clear payoff
   - first retry opportunity
   - one short note on whether those beats stayed warm or cooled
25. If the responsiveness probe lane is used, log the control-ready gap and any blocked-frame detail that explains it, then reuse that evidence for later trust, boot, or activation reviews instead of restating it as a generic smoothness issue.
26. If the busy-frame capture lane is used, either merge the artifact's `observationPatch` into the observation JSON or pass `--busy-frame-capture <artifact.json>` to the report helper so the saved frames, tags, incidents, and probe row land in the normal report and starter files.
27. If the trace-backed evidence lane is used, keep the resulting JSON next to the trace and screenshot paths so later browser, HUD, or activation follow-up can reopen the same artifact bundle instead of restaging the run.

## Why This Shape

- Objective review and prescriptive next-step support are active gameplay supports, not optional memory work.
- On-demand tutorials must explain mechanics through gameplay or demonstration, not only static control sheets.
- Reminder paths, practice without failure, readable contrast, and low-distraction UI all become stronger when one session records the same evidence once and reuses it across audits.
- Learning-curve research reinforces structured capture: teach, practice, combine, escalate.
- Impact-feel research reinforces structured capture too: the same moment should log contact truth, force hierarchy, and scene preservation before anyone argues about juice.
- Current accessibility evaluation practice reinforces the coverage-gate step too: define scope, test representative contexts, and document findings before making broad review claims.
- W3C WCAG-EM 2.0 adds a second comparability rule that fits this catalog well: keep evaluation scope explicit, sample representative contexts, include whole processes, and document the sampling path so later claims stay tied to what was actually tested.
- Current accessibility guidance also reinforces the new resume probe: players may return after a break, lose the current micro-objective, or forget what the next action was unless the game exposes reminders and UI context on demand.
- Task-based usability guidance reinforces the new probe deck: specific tasks exercise the exact moments you want to test, and script-like instructions keep repeated evaluations more comparable than `just explore` play.
- Nielsen Norman Group's usability-study measurement guidance adds a second missing discipline for this catalog: pre-assign task success criteria, then log confidence, satisfaction, and frustration after each task so one nominal success does not hide low-trust or high-friction play.
- NASA TLX practice adds the missing overload lens for this catalog: even when a probe technically succeeds, mental demand, time pressure, and effort can still reveal `dynamic but too overwhelming`, which is exactly the failure mode sticky arcade reviews often miss when they stop at pass or fail.
- AHRQ's critical-incident method adds the missing prioritization discipline for this catalog: cluster repeated incidents by tag and sort them by recurrence so the same browser-play breakage does not get rewritten as several unrelated notes.
- Microsoft Learn XAG 116 plus Game Accessibility Guidelines on prompt pacing and reminder access add a second temporary-information lens: some critical reads fail not because they were badly worded, but because they disappeared before the player could finish reading or reopen them later.
- Microsoft Learn XAG 102 and XAG 103, plus Game Accessibility Guidelines on color-alone and sound-alone failures, reinforce a second cue-risk for this catalog: one session can make a warning look readable even when it actually depends on color alone or audio alone and breaks under common real play conditions.
- Pinelle, Wong, and Stach's 2008 playability heuristics reinforce a second catalog risk: reviews often misdiagnose training, game-status, view obstruction, and difficult controls as separate vibes when they interact inside the same failure moment. Shared capture should mark these confounders once so later audits do not pin everything on the wrong lens.
- Microsoft Learn XAG 117, last updated 2026-03-04, reinforces the same practical risk for this catalog: camera motion, auto-updating UI, and view settings can directly interfere with reading or acting, so shared evidence should record when camera/view support itself was unstable.
- Current Game Accessibility Guidelines quick-start guidance reinforces a second failure-loop discipline for this catalog: restart friction is its own observable cost, so shared evidence should count retries directly instead of assuming each logged death also included a real replay attempt.
- NASA attentional-tunneling research reinforces a second overlap risk: once several urgent signals fire together, players can fixate on one channel and miss another unless the dominant read stays obvious. Shared capture should preserve that overlap moment directly instead of letting later HUD notes reconstruct it from memory.
- Linehan et al.'s learning-curve framing reinforces the pacing half of the same gap: escalation quality depends on when and how new demands stack, not only on a beat timeline. Shared capture should therefore preserve active-demand count, fresh-demand count, stack readability at the decisive beat, and early-loop timing that determines whether the first teach-test-payoff chain stays warm enough to matter.
- New gap closed here: starter payloads now carry explicit claim guardrails, the shared capture samples interruption recovery directly, the evidence log carries one control/view confounder probe so downstream audits cannot silently convert one partial uninterrupted session into a full-game verdict about clarity, pacing, or failure readability, failure-loop starters can now preserve chain-punish and retry-stability evidence instead of reducing every harsh loop to retry speed alone, HUD plus pacing starters now keep cue-competition, cue-channel fallback, and stack-readability evidence instead of forcing manual re-entry, and onboarding plus pacing starters now preserve early-loop cadence so delayed agency or payoff can be judged from the same raw session instead of after-the-fact memory.

## Commands

Print reusable session template:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts --template
```

Write one slug-aware observation template straight to the local evidence path:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/init_playtest_observation.ts `
  --game burgertime-stack `
  --out ".local/burgertime-stack-playtest.json"
```

Write one observation template plus a task-based probe deck:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/init_playtest_observation.ts `
  --game burgertime-stack `
  --out ".local/burgertime-stack-playtest.json" `
  --probe-out ".local/burgertime-stack-playtest-probes.md"
```

Turn one observation JSON into compact markdown report:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts `
  --observations ".local/playtest-session.json"
```

Turn one observation JSON into compact markdown report plus per-audit starter files:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts `
  --observations ".local/playtest-session.json" `
  --starter-dir ".local/playtest-starters"
```

Turn one observation JSON plus starter payloads into a normalized finding/action packet:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/observation_finding_normalizer.ts `
  --observations ".local/playtest-session.json" `
  --starter-dir ".local/playtest-starters/some-game" `
  --out ".local/playtest-starters/some-game/observation-finding-normalizer.json"
```

Run the browser responsiveness probe:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/browser_responsiveness_probe.ts `
  --slug some-game `
  --out ".local/some-game-responsiveness.json"
```

Verify the hardened schema against the local fixture without touching any game folder:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/browser_responsiveness_probe.ts `
  --url "file:///C:/Users/MindOverMelee/ai-harness-template/context/.agents/skills/playtest-evidence-capture/fixtures/responsiveness-probe-fixture.html" `
  --out ".local/responsiveness-probe-fixture.json"
```

Run the busy-frame capture lane:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/busy_frame_capture.ts `
  --slug some-game `
  --out ".local/some-game-busy-frame-capture.json"
```

Run the trace-backed evidence lane:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/trace_evidence_pack.ts `
  --slug some-game `
  --out ".local/some-game-trace-evidence.json"
```

Turn the same observation into AGI/XAG-aligned tags:

```powershell
bun.cmd .agents/skills/agi-tag-snapshot/scripts/agi_tag_snapshot.ts `
  --observations ".local/playtest-session.json" `
  --json-out ".local/playtest-session-agi-tags.json"
```

Run the reminder-reentry smoke lane from one captured observation packet:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/reminder_reentry_smoke.ts `
  --observations ".local/playtest-session.json" `
  --out "some-game/reminder-reentry-smoke.md"
```

Run the text-and-motion smoke lane from one captured observation packet:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/text_motion_smoke.ts `
  --observations ".local/playtest-session.json" `
  --out "some-game/text-motion-smoke.md"
```

Run the cue-redundancy smoke lane from one captured observation packet:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/cue_redundancy_smoke.ts `
  --observations ".local/playtest-session.json" `
  --out "some-game/cue-redundancy-smoke.md"
```

Run the timed-prompt smoke lane from one captured observation packet:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/timed_prompt_smoke.ts `
  --observations ".local/playtest-session.json" `
  --out "some-game/timed-prompt-smoke.md"
```

Merge the busy-frame artifact into the normal report flow:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts `
  --observations ".local/playtest-session.json" `
  --busy-frame-capture ".local/some-game-busy-frame-capture.json" `
  --out "some-game/playtest-evidence.md"
```

Write report directly to game-local note:

```powershell
bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts `
  --observations ".local/playtest-session.json" `
  --out "some-game/playtest-evidence.md"
```

Saved learnings accumulate in:

```text
./.agents/skills/playtest-evidence-capture/LEARNINGS.md
```

Repo-local Kojima mirror:

```text
./.local/kojima/learnings.md
```

## Observation Shape

Use one compact JSON object that records observed evidence only.

```json
{
  "game": "some-game",
  "sessionDate": "2026-04-30",
  "sessionFocus": ["first-contact", "busy-frame", "fail-retry", "impact"],
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 2,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledBusyFrames": 1,
    "sampledEncounters": 2,
    "sampledContacts": 5,
    "sampledResumeProbes": 1,
    "notes": ["short first-run plus one targeted replay after death"]
  },
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "firstObjectiveClear": true,
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true,
    "controlsReminderAvailable": false,
    "objectiveReminderAvailable": true,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 0,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "criticalElements": [],
  "cues": [
    {
      "name": "sweeping laser warning",
      "importance": "critical",
      "nearAction": true,
      "redundantSignal": false,
      "signalChannels": ["visual", "audio"],
      "reliesOnColorAlone": false,
      "reliesOnAudioAlone": false,
      "telegraphReadable": true,
      "requiredResponseObvious": true,
      "futurePathVisible": false,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "notes": "danger reads, but beam travel lane is not exposed until late"
    }
  ],
  "stressFrames": [],
  "competitionMoments": [
    {
      "moment": "adds spawn during low-health flash",
      "signals": ["incoming-hit arrow", "low-health state", "combo toast"],
      "urgentSignalCount": 2,
      "dominantReadClear": false,
      "responsePriorityClear": false,
      "nonCriticalUiCompeting": true,
      "notes": "warning stack lands, but combo toast joins and muddies which response matters first"
    }
  ],
  "ephemeralMoments": [
    {
      "name": "wave-start weapon tip",
      "kind": "tutorial",
      "importance": "supporting",
      "appearsNearAction": true,
      "autoDismisses": true,
      "dismissSeconds": 3,
      "playerControlledAdvance": false,
      "reviewableLater": true,
      "suppressibleWhenNonCritical": true,
      "obstructsCriticalRead": false,
      "notes": "prompt is brief, but pause menu repeats it later"
    },
    {
      "name": "combo toast",
      "kind": "notification",
      "importance": "secondary",
      "appearsNearAction": true,
      "autoDismisses": true,
      "dismissSeconds": 2,
      "playerControlledAdvance": false,
      "reviewableLater": false,
      "suppressibleWhenNonCritical": false,
      "obstructsCriticalRead": true,
      "notes": "reward toast can cross the dodge lane during pressure"
    }
  ],
  "clutter": {},
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "read failure came from cue stack, not camera or input drift"
  },
  "beats": [
    {
      "at": "00:08",
      "label": "first dodge lane",
      "kind": "teach",
      "novelty": "new-verb",
      "skills": ["move"],
      "practicedBefore": true,
      "readable": true,
      "activeDemands": 1,
      "newDemands": 1,
      "stackReadable": true,
      "notes": "safe lane before punishment"
    }
  ],
  "retrySeconds": 4,
  "returnsToCurrentTestQuickly": true,
  "failures": [
    {
      "at": "00:31",
      "cause": "second projectile hidden behind score popup",
      "causeReadable": false,
      "correctiveActionClear": false,
      "retrySeconds": 4,
      "menuLayersBeforeRetry": 1,
      "checkpointLossSeconds": 6,
      "sourceVisibleOnFail": false,
      "returnsToRelevantDecision": true,
      "repeatedPenaltyFromSingleMistake": false,
      "controlRecoveredBeforeNextHit": true,
      "retryContextStable": true,
      "notes": "retry fast but death cause muddy"
    }
  ],
  "failState": {},
  "pressure": {},
  "learningLoop": {
    "immediateRetry": true,
    "practiceWithoutFailure": false,
    "sameSkillRetestedQuickly": true,
    "sameLessonStableAcrossRetries": true
  },
  "recoverySupport": {},
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
      "notes": "objective still obvious, but no live control refresher after returning"
    }
  ],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "reach first meaningful input and restate next step",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 6,
      "mentalDemand": 3,
      "timePressure": 2,
      "effort": 3,
      "blockers": [],
      "notes": "player acts quickly and understands the first objective without a tutorial wall"
    },
    {
      "probe": "busy-frame",
      "goal": "survive one clutter peak and keep one dominant urgent read",
      "outcome": "partial",
      "successRating": 2,
      "confidence": 4,
      "satisfaction": 4,
      "frustration": 3,
      "mentalDemand": 6,
      "timePressure": 6,
      "effort": 6,
      "blockers": ["combo toast competes with dodge read"],
      "notes": "critical warning still lands, but non-critical reward UI muddies response priority"
    }
  ],
  "incidents": [
    {
      "incidentTag": "combo-toast-hides-dodge-read",
      "title": "reward popup competes with dodge lane",
      "lenses": ["hud", "failure", "pacing"],
      "firstSeenAt": "00:31",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "repeatable",
      "playerCost": ["confusion", "death", "attention-tax"],
      "nextCheck": "confirm whether moving or suppressing the toast restores one dominant urgent read during the same wave transition",
      "notes": "same overlap appears in busy-frame sample and in one logged death"
    }
  ],
  "contacts": [],
  "channelSupport": {
    "criticalInfoMultiChannel": true,
    "criticalInfoUsesColorOnly": false,
    "criticalInfoUsesAudioOnly": false,
    "muteCriticalInfoStillPlayable": true,
    "criticalInfoHasNonColorBackup": true,
    "hapticsUsed": false,
    "hapticsConfigurable": false,
    "hapticsCarryCriticalInfoAlone": false
  },
  "strengths": ["first action readable without tutorial wall"],
  "frictions": ["no in-run control reminder"]
}
```

## Output Shape

- `Evidence Snapshot`: what session actually covered, including retries actually observed
- `Evidence Sufficiency`: directness, covered contexts, missing contexts, and claim ceiling
- `Session Read`: short blocker-risk read from observed coverage gaps
- `Coverage Gates`: which downstream audit passes are ready, partial, or still missing required evidence
- `Readable Progression`: whether proximal goals, prerequisite progress, evaluative readback, and next-step guidance were visible enough to support the new lane
- `Control Surface`: whether remap scope, remap reflection, hold-toggle alternatives, sensitivity/inversion/axis controls, and game-speed or timing relief were visible enough to support the lane without collapsing into the input-demand or settings-and-assists lanes
- `Settings And Assists`: whether recovery knobs stayed reachable during play or after failure, stayed progress-safe when changed, and persisted strongly enough across retry to earn trust
- `Cross-Audit Confounders`: whether input certainty or view support may have distorted later HUD, pacing, or failure claims
- `Cue Channel Support`: whether critical reads had backup channels or depended on color alone or audio alone
- `Downstream Claim Guardrails`: what each audit lens may say now, must not say yet, and still needs to sample
- `Cue Competition`: whether overlapping urgent signals preserved one dominant read or collapsed into priority confusion
- `Temporary Prompt Recovery`: whether critical short-lived information stayed player-paced or reviewable later, and whether non-critical popups could be suppressed when they obstructed play
- `Probe Outcomes`: one task-result row per probe with success rating plus confidence, satisfaction, and frustration, so later audits can tell outright failure from low-trust or high-friction success
- `Probe Load`: one lightweight workload row across probes so later audits can tell `good difficulty` from `success under overload`
- `Cross-Lens Incident Queue`: repeated issues tagged once with recurrence, impact, persistence, player cost, and next check so downstream audits inherit one shared priority list
- `Busy Frame Capture`: saved frame paths plus target tags in the same `stressFrames` vocabulary so the clutter lane can feed later HUD and onboarding passes without translation
- `Stack Pressure`: whether the decisive beat logged active demands, fresh demands, and readable escalation instead of only a timeline label
- `Resume Probe`: whether current goal, controls, and next action survive a short interruption without menu digging
- `Failure Teaching`: whether one mistake chained into repeated punishment and whether retry preserved the same lesson stably enough to test the fix
- `Starter JSON`: one block each for activation loop, onboarding, HUD readability, pacing, failure-loop, mastery-motivation, choice-readback, readable progression, forgiveness, settings-and-assists, impact-feel
- `Starter Files`: optional `--starter-dir` output writes one JSON file per downstream audit, each with its own evidence sufficiency summary and claim guardrail
- `Observation Finding Normalizer`: optional grouped findings packet that turns repeated observations into reusable finding/action themes with artifact citations, freshness metadata, and combined claim ceilings
- `Durable Learning`: one concise session-derived line worth carrying into catalog memory and mirroring into repo-local Kojima memory

## Sources

- Microsoft Learn XAG 109: objective clarity and reviewable next steps
- Microsoft Learn usability testing guidance: specific tasks and a facilitator script improve consistency and keep the evaluation focused on the moments being tested
- Microsoft accessibility metadata criteria for on-demand tutorials, last updated 2026-03
- Microsoft Learn XAG 102 and XAG 117: readable contrast and motion-distraction control in gameplay contexts
- Microsoft Learn XAG 103: additional channels for gameplay-critical cues so warning information is not trapped in one fragile signal
- Microsoft Learn XAG 114: UI context so players understand what a screen, prompt, or interaction means before acting, especially after attention breaks
- Microsoft Learn XAG 117, last updated 2026-03-04: moving UI, auto-updating overlays, camera motion, and field-of-view settings can interfere directly with readability and action
- Microsoft Learn XAG 116: important temporary UI should stay visible long enough, be adjustable, or be dismissible on input instead of disappearing on a fixed timer.
- AHRQ critical-incident method: sort collected incidents by frequency so repeated failures are prioritized for prevention.
- Game Accessibility Guidelines: quick start without menu depth, because restart friction should be observed directly instead of inferred from failure count.
- Game Accessibility Guidelines: readable progression should keep proximal goals, prerequisite progress, and next-step guidance legible without forcing comparison-heavy menus.
- NASA/TM-2018-219932 (2018): attentional tunneling under competing signals reinforces logging overlap moments and preserving one dominant read
- Nielsen Norman Group, `How to Conduct Usability Studies for Accessibility`: pre-assign success criteria, log task outcome, and ask post-task confidence, satisfaction, and frustration ratings so repeated sessions stay comparable.
- NASA TLX at NASA Ames: multi-dimensional workload assessment; this skill borrows a lightweight subset for mental demand, time pressure, and effort so browser-game probe success does not erase overload.
- Game Accessibility Guidelines: control reminders, objective reminders, practice without failure
- Game Accessibility Guidelines: separate control remap and tuning support from broader settings or assist menus unless the evidence explicitly covered that boundary
- Game Accessibility Guidelines: allow players to progress through text prompts at their own pace, and allow reminders of controls during gameplay
- Game Accessibility Guidelines: reminder of current objectives during gameplay and resume support after a break
- Game Accessibility Guidelines: avoid placing essential temporary information outside the player's eye-line and allow hazards to be anticipated by appearance and sound
- Game Accessibility Guidelines: ensure no essential information is conveyed by a fixed colour alone, and ensure no essential information is conveyed by sounds alone
- Linehan et al., CHI PLAY 2014: skills introduced separately, practiced, then combined
- Lin et al., 2022: impact feel strengthened by hit stop, sound coherence, and camera control
- Pinelle, Wong, and Stach, CHI 2008: common game-usability problems include mismatched camera/view, difficult control of actions, inadequate game-status information, and inadequate training/help
- W3C WCAG-EM 2.0: define evaluation scope, sample representative contexts, include complete processes, and document findings before making broad claims.
- Why this matters for the catalog: HUD claims need busy-frame evidence plus at least one logged overlap where signal priority was tested, pacing claims need beat timelines plus stack-pressure evidence, failure-loop claims need real fail-retry capture plus chain-punish and retry-stability notes, onboarding claims need first-contact plus interruption-resume evidence, temporary prompt claims need persistence or replayability evidence instead of one-off sightings, must-react cue claims need response-and-path evidence plus channel-fallback evidence instead of vague danger notes, probe results need structured success plus confidence/friction data so nominal completion does not masquerade as good onboarding or readable pressure, repeated problems need one shared incident tag so downstream skills inherit the same priority order instead of rewriting the same blocker five ways, and shared capture should also mark when camera/view or response stability distorted the moment so later audits do not fix the wrong root cause.
- Why this matters for the catalog: HUD claims need busy-frame evidence plus at least one logged overlap where signal priority was tested, pacing claims need beat timelines plus stack-pressure evidence, failure-loop claims need real fail-retry capture plus chain-punish and retry-stability notes, onboarding claims need first-contact plus interruption-resume evidence, temporary prompt claims need persistence or replayability evidence instead of one-off sightings, must-react cue claims need response-and-path evidence plus channel-fallback evidence instead of vague danger notes, probe results need structured success plus confidence/friction data so nominal completion does not masquerade as good onboarding or readable pressure, repeated problems need one shared incident tag so downstream skills inherit the same priority order instead of rewriting the same blocker five ways, shared capture should also mark when camera/view or response stability distorted the moment so later audits do not fix the wrong root cause, and control-surface claims need remap/tuning evidence plus an explicit boundary note so the lane does not swallow input-demand or settings-and-assists work.
