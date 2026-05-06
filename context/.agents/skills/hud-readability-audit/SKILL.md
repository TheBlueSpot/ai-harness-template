---
name: hud-readability-audit
description: Review browser-game HUDs and must-react cues with evidence-backed heuristics for peripheral readability, contrast, clutter, motion distraction, focal placement, and low-glance-cost signaling. Use when Codex needs a reusable pass for unreadable HUD text, noisy overlays, weak danger cues, animated UI noise, corner-dashboard overload, or whether gameplay-critical information can be identified without stopping to read.
---

# HUD Readability Audit

## Overview

Use this skill when a browser-playable game needs a focused HUD and cue readability pass instead of a broad design review. Goal: judge whether gameplay-critical information survives peripheral viewing, changing backgrounds, action pressure, clutter spikes, and animated UI noise without turning the HUD into extra difficulty.

Concrete upgrade: this skill now turns one observation JSON into blocker-first findings, a critical-read matrix, a cue-competition check, a temporary-prompt recovery check, an evidence snapshot, shared-starter claim guardrails, cross-lens incident carryover, probe-load notes, control/view confounders, evidence-backed next steps, and one durable learning line saved to local skill memory so HUD passes stay comparable across different arcade entries instead of collapsing into flat vibe notes. The same pass also flags motion-heavy UI that competes with active play reads, treats must-react telegraphs as incomplete when they warn about danger but do not show the needed response or the future collision path, checks whether overlapping urgent signals collapse into one unreadable `which thing matters first` moment, catches the separate catalog failure where a prompt is visually readable but disappears before the player can recheck it, and keeps cue-channel fallback in scope so color-only or audio-only warnings do not slip through a short successful play sample.

## Workflow

1. Start from direct browser play when possible.
2. Watch at least one active pressure sequence, not only menus or idle states.
3. Capture at least one `busy frame` where particles, score popups, celebration overlays, subtitle text, scenery noise, or auto-updating UI peaks.
4. Log observations with explicit evidence scope before judging severity, including any motion distraction that competes with the focal play read.
5. Judge each pass against these reusable checks:
   - critical state reads from shape, contrast, position, or motion before text
   - peripheral HUD stays sparse enough for quick glances instead of dashboard scanning
   - must-react cues live near focal action or get an earlier duplicate signal
   - must-react cues reveal the needed response early enough to preserve player choice
   - dodge or avoid telegraphs show the future collision path, not just a generic danger flash
   - warning and HUD elements survive changing scenery, particles, subtitles, and camera motion
   - busy-frame clutter does not mask must-read cue or target at exact response moment
   - clutter does not bury targets, prompts, or failure causes
   - overlapping urgent signals still expose a dominant read, so the player knows what matters first when several warnings fire together
   - critical temporary prompts stay player-paced or reviewable later instead of vanishing on fixed timing
   - non-critical temporary popups can be postponed, hidden, or suppressed when they obstruct live action reads
6. Treat unreadable HUD text, weak cue contrast, overlap-heavy overlays, and motion-distraction noise as gameplay blockers, not cosmetic debt.
7. Do not call a HUD pass clean without at least one logged busy frame from active pressure.
8. End the run by saving the generated durable learning into `./.agents/skills/hud-readability-audit/LEARNINGS.md`.
9. Keep findings high level and game-local. Prefer a few concrete fixes over UI theory.
10. Use the generated critical-read matrix to compare which specific signals fail from text dependence, weak contrast, focal distance, missing redundancy, busy-frame masking, motion distraction, or cue competition.
11. When two or more urgent signals overlap, log the moment explicitly instead of burying it in generic clutter notes. Record which signals competed, whether one clearly won attention, whether the needed response priority stayed obvious, and whether non-critical UI joined the pileup.
12. If observations came from `playtest-evidence-capture`, feed the `hud-readability-audit.json` starter directly into this helper. Keep the starter's evidence sufficiency, claim guardrails, incidents, probe outcomes, and confounders in the audit instead of flattening them away.
13. Treat cue-channel fallback as HUD scope, not only accessibility garnish. A warning that reads only by color or only by sound is still fragile in real browser play.

## Why This Shape

- The main overlap with nearby audit skills is not topic but output quality: failure-loop review already produces blocker-first, evidence-tied notes that travel well across the catalog.
- HUD review needed the same structure because readable playfield signaling is a gameplay gate in sticky arcade entries, not a polish-only concern.
- Current Microsoft XAG guidance reinforces the same audit priorities: text and icons must remain readable in active gameplay, HUD/cues need strong contrast against shifting backgrounds, and critical signals should not rely on one fragile visual channel.
- March 4, 2026 XAG 117 guidance adds a practical motion lens for this catalog: animated UI noise, auto-updating overlays, and other moving decorations should not compete with active play reads.
- Game Accessibility Guidelines add a second practical lens for this catalog: temporary must-react prompts should stay near the player eye-line, and fixed color alone should not carry essential meaning.
- Microsoft Learn XAG 116 plus Game Accessibility Guidelines on prompt pacing add a third practical lens for this catalog: important temporary information should not disappear on a timer unless the player can still control the pace or reopen it later.
- The reusable gap closed here is starter continuity plus channel fallback. Shared capture already knows evidence ceilings, repeated incidents, workload spikes, and color-only or audio-only cue risks. HUD review now preserves that signal instead of silently dropping it.

## Commands

Print reusable checklist and richer observation schema:

```powershell
bun.cmd .agents/skills/hud-readability-audit/scripts/hud_readability_audit.ts --template
```

Turn a small observation JSON file into a markdown audit scaffold and append the durable learning to local skill memory:

```powershell
bun.cmd .agents/skills/hud-readability-audit/scripts/hud_readability_audit.ts `
  --observations ".local/hud-readability-notes.json"
```

Write scaffold directly to a game-local note:

```powershell
bun.cmd .agents/skills/hud-readability-audit/scripts/hud_readability_audit.ts `
  --observations ".local/hud-readability-notes.json" `
  --out "some-game/hud-readability-audit.md"
```

Feed a starter JSON from `playtest-evidence-capture` directly into HUD review:

```powershell
bun.cmd .agents/skills/hud-readability-audit/scripts/hud_readability_audit.ts `
  --observations ".local/playtest-starters/hud-readability-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/hud-readability-audit/LEARNINGS.md
```

## Observation Shape

Use a tiny JSON note with only what the pass actually observed. Keep field names aligned with the helper script.

```json
{
  "game": "some-game",
  "sessionDate": "2026-04-29",
  "criticalElements": [
    {
      "name": "low-health state",
      "location": "top-left corner",
      "importance": "critical",
      "readsWithoutText": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "glanceCost": "low",
      "notes": "bar depletion and heartbeat icon both read without number check"
    }
  ],
  "cues": [
    {
      "name": "incoming-hit indicator",
      "importance": "critical",
      "nearAction": true,
      "redundantSignal": true,
      "signalChannels": ["visual", "audio"],
      "reliesOnColorAlone": false,
      "reliesOnAudioAlone": false,
      "telegraphReadable": true,
      "requiredResponseObvious": true,
      "futurePathVisible": true,
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low",
      "notes": "arrow survives smoke burst"
    }
  ],
  "stressFrames": [
    {
      "moment": "boss phase transition burst",
      "clutterSource": "white flash plus score popup plus particles",
      "movingBackground": true,
      "blinkingContent": false,
      "autoUpdatingContent": true,
      "cameraMotion": false,
      "criticalInfoLost": true,
      "cueMasked": true,
      "responseStillReadable": false,
      "criticalElementsReadableUnderMotion": false,
      "notes": "dodge lane disappears during reward burst"
    }
  ],
  "competitionMoments": [
    {
      "moment": "boss adds plus low-health flash",
      "signals": ["incoming-hit indicator", "low-health state", "combo toast"],
      "urgentSignalCount": 2,
      "dominantReadClear": false,
      "responsePriorityClear": false,
      "nonCriticalUiCompeting": true,
      "notes": "player sees several warnings at once but priority order is muddy"
    }
  ],
  "ephemeralMoments": [
    {
      "name": "phase-start warning text",
      "kind": "warning",
      "importance": "critical",
      "appearsNearAction": true,
      "autoDismisses": true,
      "dismissSeconds": 2,
      "playerControlledAdvance": false,
      "reviewableLater": false,
      "suppressibleWhenNonCritical": true,
      "obstructsCriticalRead": false,
      "notes": "important warning disappears before player can recheck it"
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
      "notes": "reward popup crosses the dodge lane during pressure"
    }
  ],
  "clutter": {
    "cornerDashboard": false,
    "overlapBlocksAction": true,
    "backgroundNoiseHurtsRead": true,
    "movingUiDistraction": true,
    "blinkingUiDistraction": false,
    "autoUpdatingUiDistraction": true,
    "backgroundMotionDistractsRead": true,
    "subtitleOrToastOverlap": true,
    "peripheralScanLoad": "medium"
  },
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "read failure came from overlap, not camera drift"
  },
  "evidence": {
    "mode": "direct-play",
    "sampledEncounters": 3,
    "sampledBusyFrames": 2,
    "notes": [
      "captured one calm combat read and two peak-effect moments",
      "confirmed overlap issue on second miniboss transition"
    ]
  },
  "probeOutcomes": [
    {
      "probe": "busy-frame",
      "outcome": "partial",
      "successRating": 2,
      "confidence": 3,
      "satisfaction": 3,
      "frustration": 5,
      "mentalDemand": 6,
      "timePressure": 6,
      "effort": 5,
      "blockers": ["reward popup crosses dodge lane"],
      "notes": "read technically survives, but only under overload"
    }
  ],
  "incidents": [
    {
      "incidentTag": "combo-toast-hides-dodge",
      "title": "combo toast hides dodge lane",
      "lenses": ["hud", "failure"],
      "repeatedCount": 2,
      "impact": "high",
      "persistence": "repeatable",
      "playerCost": ["confusion", "damage"],
      "nextCheck": "verify lane stays open after moving the toast"
    }
  ],
  "strengths": [
    "health and ammo read by bar shape before any numbers"
  ],
  "frictions": [
    "quest toast and score popup overlap enemy lane during dodge-heavy moments"
  ]
}
```

## Heuristic Lens

- Good HUDs keep peripheral signals sparse and low-interpretation-cost.
- Good must-react cues read from position, shape, contrast, and motion before fine text.
- Good must-react cues also preserve meaning if one sensory channel drops out. Color alone or sound alone is still a fragile read in short browser-play sessions.
- Good warning design survives busy scenery and duplicates edge signals when response timing matters.
- Good telegraphs show what to do, not only that danger exists.
- Good dodge telegraphs show likely future path or occupied space early enough that the player can choose, not only react late to impact.
- Good overlapping-warning design preserves one dominant read. If several urgent signals fire together, the player should still know what matters first without stopping to decode the stack.
- Good temporary-prompt design keeps critical short-lived information on player pacing or cheap replay, because a prompt that disappears before recheck still fails under pressure.
- Good non-critical popup design lets the player suppress, postpone, or relocate interruptions that repeatedly obstruct live action reads.
- Good HUD review also rejects motion distraction that pulls attention away from the play read, even when the static layout is otherwise legible.
- Good readability review inspects worst busy frame, not only calm screenshot, because many cue failures happen exactly when pressure and effects peak.
- Good HUD audit does not treat missing busy-frame evidence as a pass. No peak-clutter sample means active-play readability is still unproven.
- Good readability review treats clutter and overlap as gameplay pressure, not visual polish debt.
- Good motion audit treats auto-updating overlays and decorative animation as gameplay risks when they compete with current action reads.
- Good audit output includes a critical-read matrix so recurring failures can be grouped by signal type and failure mode instead of being buried in prose.

## Output Shape

- `Findings`: blocker first, then major, then minor.
- `Evidence Snapshot`: how much direct evidence the pass actually sampled.
- `Evidence Scope Guardrail`: starter coverage, allowed claims, blocked claims, and next evidence when shared capture produced the observations.
- `Critical Read Matrix`: one row per important HUD state or must-react cue, with risk level, failure modes, and next action.
- `Cue Competition`: moments where multiple urgent signals overlapped, whether one dominant read survived, and whether non-critical UI joined the pileup.
- `Probe Outcomes`: whether a busy-frame read technically worked but only under overload.
- `Shared Incident Queue`: repeated HUD breakage already tagged in shared playtest capture.
- `Control And View Confounders`: whether camera, view, or response instability may be exaggerating the HUD diagnosis.
- `Temporary Prompt Recovery`: whether critical temporary information auto-dismissed safely or vanished without a replay path, and whether non-critical popups could be suppressed when they obstructed play.
- `Evidence-Backed Next Steps`: only steps supported by logged read failures.
- `Durable Learning`: one concise line worth carrying into catalog-wide taste memory and saving in `./.agents/skills/hud-readability-audit/LEARNINGS.md`.

## Sources

- Microsoft Learn XAG 101: text display for gameplay text, HUD elements, instructional cues, icon/glyph scaling, and minimum default readability expectations.
- Microsoft Learn XAG 102: contrast for HUD meters, directional cues, map elements, and gameplay-critical visual elements against changing backgrounds and other active gameplay contexts.
- Microsoft Learn XAG 103: additional channels for critical cues so key information is not trapped in one fragile visual signal.
- Microsoft Learn XAG 104: opaque or configurable backing and placement rules to keep readable text from being lost against active gameplay backgrounds or obscuring key playfield information.
- Microsoft Learn XAG 117, March 4, 2026: motion-distraction guidance for animated UI noise and auto-updating overlays that compete with active play reads.
- Microsoft Learn XAG 116: important temporary UI should stay visible long enough, be dismissible on input, or be adjustable instead of disappearing on a fixed timer.
- NASA TM-2018-219932: attentional tunneling under simultaneous distractors reinforces this catalog check for overlapping urgent signals, because players can fixate on one channel and miss another unless the alert stack makes the dominant read obvious.
- Game Accessibility Guidelines: avoid placing essential temporary information outside the player's eye-line.
- Game Accessibility Guidelines: allow players to progress through text prompts at their own pace.
- Game Accessibility Guidelines: ensure no essential information is conveyed by a fixed color alone.
- Game Accessibility Guidelines: allow hazards to be anticipated by appearance and sound.
