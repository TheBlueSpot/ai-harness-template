## 2026-05-06 Late-Breach Sidebar Follow-up

- Scope: fresh direct-browser Night Market fail-state pass on `bloons-pop` at `http://localhost:2999/bloons-pop/`, using the `playtest-evidence-capture` flow to recheck a later breach after the earlier loss-copy fixes and to confirm whether one dominant retry read survived across overlay plus sidebar.
- Finding: the late `Smoke Veil` breach still carried one concrete trust drag before the patch: the overlay, threat line, and growth line all told the player to rebuild and relaunch, but the right panel still kept stale tower inspection state (`Glue Tower level 2/5.` plus live upgrade copy) under the retry overlay. The local `./src/main.js` fix now suppresses dead-run tower inspection state during win/lose, swaps the right panel to retry or replay guidance, and disables upgrade copy until a new run starts.
- Commands:
  - `node bloons-pop/.local/codex-late-breach-selection-check.js bloons-pop/.local/2026-05-06-late-breach-selection-pass-after`
  - `bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts --observations "bloons-pop/.local/2026-05-06-late-breach-selection-playtest-session.json" --out "bloons-pop/.local/2026-05-06-late-breach-selection-playtest-evidence.md" --starter-dir "bloons-pop/.local/2026-05-06-late-breach-selection-starters"`
  - `bun.cmd .agents/skills/playtest-evidence-capture/scripts/observation_finding_normalizer.ts --observations "bloons-pop/.local/2026-05-06-late-breach-selection-playtest-session.json" --starter-dir "bloons-pop/.local/2026-05-06-late-breach-selection-starters" --out "bloons-pop/.local/2026-05-06-late-breach-selection-starters/observation-finding-normalizer.json"`
  - `node bloons-pop/.local/codex-verify-playtest.js`
- Artifacts: `./bloons-pop/.local/inspect-late-fail.json`, `./bloons-pop/.local/2026-05-06-late-breach-selection-pass-after/summary.json`, `./bloons-pop/.local/2026-05-06-late-breach-selection-pass-after/late-breach.png`, `./bloons-pop/.local/2026-05-06-late-breach-selection-playtest-session.json`, `./bloons-pop/.local/2026-05-06-late-breach-selection-playtest-evidence.md`, `./bloons-pop/.local/2026-05-06-late-breach-selection-starters/`, and refreshed smoke output in `./bloons-pop/.local/codex-verify-final/summary.json`.
- Verification: the post-fix repro now lands on `Retry keeps this route. Rebuild, set pace, and relaunch.` with `Upgrade Offline`, while the existing smoke helper still reports `errors: []` for desktop placement, mobile first-contact, and fail-retry coverage.

## 2026-05-06 Interruption-Resume Follow-up

- Scope: bounded direct-browser session on `bloons-pop` at `http://localhost:2999/bloons-pop/`, using the playtest-evidence-capture flow to cover first-contact, Night Market route choice, one payout beat, one fail-retry loop, and one 45-second tab-return probe.
- Finding: the route summaries and wave-1 payout stayed truthful, but the interruption-resume probe exposed one blocker-grade trust lie: after a Night Market `Neon Split` collapse during the away window, the overlay correctly switched to retry while the sidebar still read `Live wave: Neon Split` and kept the live threat copy. The local HUD fix now flips loss state to `Route breached: Neon Split`, rewrites the threat line to rebuild guidance, and changes the growth line to retry instructions. The same repro after the patch plus the existing `node bloons-pop/.local/codex-verify-playtest.js` smoke both held `errors: []`.
- Artifacts: `./bloons-pop/.local/2026-05-06-resume-choice-pass/summary.json`, `./bloons-pop/.local/2026-05-06-resume-choice-pass-after/summary.json`, `./bloons-pop/.local/2026-05-06-resume-choice-playtest-session.json`, `./bloons-pop/.local/2026-05-06-resume-choice-playtest-evidence.md`, `./bloons-pop/.local/2026-05-06-resume-choice-starters/`, and refreshed smoke output in `./bloons-pop/.local/codex-verify-final/summary.json`.

## 2026-05-06 Late-Route Truth Follow-up

- Scope: focused direct-browser follow-up on `bloons-pop` after the Night Market menace and telegraph passes, aimed at one remaining player-facing truth gap in the short finale: whether `After Hours` actually started with the promised elite command unlocks online.
- Finding: the late-route repro still showed `Pulse Grid` clearing into `Tier 4`, which meant `Pressure Read` only arrived on the route-clear frame instead of the final live wave. Compressing command unlock timing for short routes moved `Tier 5` onto the quiet window before `After Hours`, and the same pass added a stronger route-wide command surge so the finale upgrade beat now reads on the board as well as in the sidebar. Refreshed smoke on `http://localhost:2999/bloons-pop/` kept `errors: []` and captured `Command Tier 5 online` before the `After Hours` launch.
- Artifacts: `./bloons-pop/.local/codex-late-pressure-fresh/summary.json` plus refreshed `intermission-wave-*.png`, `pulse-grid-live-*.png`, `post-pulse-grid-intermission.png`, and `final-state.png` in `./bloons-pop/.local/codex-late-pressure-fresh/`.

## 2026-05-06 Night Market Menace Follow-up

- Scope: focused direct-play follow-up on `bloons-pop` after the May 6 late-pressure polish, aimed at the still-open truth question from `README.md` and `todo.md`: whether Night Market `Pulse Grid` and `After Hours` had become too soft once bomb coverage came online.
- Finding: the sampled pre-fix route still coasted to victory with `10 / 14` lives left by `9400ms` after `Pulse Grid` opened, so the remaining gap was menace truth, not cue readability. Tightening late Night Market send density in `./src/data.js` restored bite without adding HUD noise: the same route plan now reaches `Pulse Grid` at `6 / 14`, is still fighting `After Hours` at `9400ms`, and keeps desktop opener, fail-retry, and `390x844` first-contact browser-playable with `0` console errors.
- Artifacts: `./bloons-pop/.local/2026-05-06-night-market-menace-pass/summary.json`, `./bloons-pop/.local/2026-05-06-night-market-menace-pass/summary-after.json`, `./bloons-pop/.local/2026-05-06-night-market-menace-pass/smoke-after.json`, `./bloons-pop/.local/2026-05-06-night-market-menace-playtest-session.json`, `./bloons-pop/.local/2026-05-06-night-market-menace-playtest-evidence.md`, and `./bloons-pop/.local/2026-05-06-night-market-menace-starters/`.

## 2026-05-06 Short-Mobile Opener Follow-up

- Scope: direct-play follow-up on `bloons-pop` after the taller-mobile and speed-reminder fixes, focused on the still-open `360x640` opener where the route plan was technically present but the board arrived too low in the viewport.
- Finding: the strongest remaining friction was vertical overhead, not missing guidance. Compressing the quiet-window hint to route labels plus a shorter control strap, and shifting the short-mobile HUD to three columns, cut the hint from `107px` to `69px` and moved the board top from `353px` to `227px` while preserving the starter pads, pace reminder, desktop live play, and fast retry path.
- Artifacts: `./bloons-pop/.local/2026-05-06-short-mobile-opener-playtest-session.json`, `./bloons-pop/.local/2026-05-06-short-mobile-opener-playtest-evidence.md`, `./bloons-pop/.local/2026-05-06-short-mobile-opener-starters/`, `./bloons-pop/.local/codex-short-mobile-check/summary.json`, and `./bloons-pop/.local/codex-short-mobile-check-after/summary.json`.

## 2026-05-06 Wave-One Route Follow-up

- Scope: direct-play follow-up on `bloons-pop` after the May 6 opener and threat-hint passes, focused on whether Orchard still dropped the route plan too early once the first tower was down and Warmup went live.
- Finding: fresh smoke on the existing Playwright path showed a real mid-opener truth gap: quiet-window guidance taught `Start`, `Anchor`, and `Late`, but wave one dropped the remaining route reminder exactly when a second placement was still part of the live decision. The local fix now keeps only unclaimed starter pads visible through wave 1 and carries `Anchor` / `Late` follow-up copy in the live hint until that calm window closes.
- Artifacts: `./bloons-pop/.local/2026-05-06-wave1-route-followup-playtest-session.json`, `./bloons-pop/.local/2026-05-06-wave1-route-followup-playtest-evidence.md`, `./bloons-pop/.local/2026-05-06-wave1-route-followup-starters/`, and refreshed smoke output in `./bloons-pop/.local/codex-verify-final/summary.json`.

## 2026-05-06 Threat Hint Follow-up

- Scope: focused smoke-path pass on `bloons-pop` after the May 6 opener and speed fixes, aimed at the remaining Night Market readability gap where late mixed-threat waves could still teach the wrong response.
- Finding: a direct `Game` state replay across all Night Market waves showed the real miss was copy truth, not layout or boot: mixed heavy plus volatile plus fast waves flattened into one shell-only live hint, and some heavy-wave breach copy told the player to cash gold when no gold bloons existed in the sampled wave. The follow-up copy pass now composes only the sampled threat clauses present on that wave.
- Artifacts: `./bloons-pop/.local/2026-05-06-threat-hint-playtest-session.json`, `./bloons-pop/.local/2026-05-06-threat-hint-wave-rows.json`, `./bloons-pop/.local/2026-05-06-threat-hint-playtest-evidence.md`, `./bloons-pop/.local/2026-05-06-threat-hint-starters/`, and refreshed smoke output in `./bloons-pop/.local/codex-verify-final/summary.json`.

## 2026-05-06 Speed Reminder Follow-up

- Scope: direct-play check at `http://localhost:2999/bloons-pop/` after the mobile opener fix, focused on whether pace relief still depended on the below-fold controls panel.
- Finding: menu overlay, quiet-window hint, live-wave hint, and breach overlay now all expose `F` speed control above fold on both `1365x768` and `390x844`.
- Artifacts: `./bloons-pop/.local/2026-05-06-speed-reminder-playtest-session.json`, `./bloons-pop/.local/2026-05-06-speed-reminder-playtest-evidence.md`, `./bloons-pop/.local/2026-05-06-speed-reminder-starters/`, and refreshed smoke output in `./bloons-pop/.local/codex-verify-final/summary.json`.

# Playtest Evidence Session

Game: bloons-pop
Date: 2026-05-06
Focus: first-contact, mobile-opener, fail-retry

## Evidence Snapshot

- Mode: direct-play
- Runs: 3
- Failures: 1
- Retries: 1
- Busy frames: 1
- Encounters: 2
- Contacts: 1
- Resume probes: 0
- Notes: Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844. | On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener. | Desktop quiet-window and wave-one placement stayed readable after the layout change. | Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state. | Console errors observed during smoke: 0.

## Evidence Sufficiency

- Directness: strong
- Covered contexts: first-contact | fail-retry | beat-timeline
- Missing contexts: busy-frame | contact | resume-probe
- Claim ceiling: session supports narrow claims only for logged moments; missing contexts stay unproven.

## Early Loop Cadence

- First meaningful input: unknown (unknown).
- First risk: unknown (unknown).
- First reward or clear payoff: unknown (unknown).
- First retry opportunity: unknown (unknown).
- Cadence note: none logged.

## Session Read

- minor: shared capture complete with no obvious cross-audit blocker. Evidence: logged session covers multiple lenses without a clear blocker pattern in raw evidence.

## Coverage Gates

- telegraph readability audit: ready. Ready for downstream audit.
- pacing curve audit: ready. Ready for downstream audit.
- failure loop audit: ready. Ready for downstream audit.
- activation loop audit: partial. Missing: if temporary prompts appeared on the start path, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.
- onboarding critique: partial. Missing: capture at least one interruption-resume probe before claiming reminders survive a short break or tab switch. | if temporary onboarding prompts appeared, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.
- HUD readability audit: partial. Missing: capture at least one busy frame under pressure; calm screenshots are not enough.
- choice-readback audit: partial. Missing: log at least one sampled choice point before making choice-readback claims. | capture at least two offered options so the audit can judge contrast instead of one picked branch in isolation. | log whether options looked meaningfully different before the pick and how they compared to the current state or build. | capture actual payoff timing and after-pick comparison before judging whether the player could see what changed after choosing.
- mastery motivation audit: partial. Missing: log at least one early choice point before claiming the loop supports autonomy instead of only obedience.
- forgiveness audit: partial. Missing: log at least one forgiveness observation before judging whether the game preserves player intent. | log whether coyote time, input buffering, corner correction, collision leniency, or grace consistency were actually observed.
- input demand audit: partial. Missing: log at least one explicit input-demand observation before judging motor-tax burden. | capture at least one demand type or sample so the audit can name the real burden instead of inferring it from vibes. | distinguish progression-critical demands from optional flourishes before calling the burden blocker-grade. | log remap truth separately from timing-speed burden before claiming the issue is solved or unsolved by remapping. | log whether lower-demand alternatives, assists, or difficulty relief exist before judging the demanded action as acceptably harsh.
- impact feel audit: partial. Missing: log at least one contact event before judging impact feel. | capture contact readability or force notes, not only vague feel words.
- readable progression audit: missing. Missing: log a short-range goal or progress surface before judging readable progression. | capture prerequisite progress, evaluative readback, or the next step before claiming the loop explains advancement. | log whether the next step still feels reachable and recoverable from play. | capture one note about how the progression read back to the player.
- control-surface audit: missing. Missing: log at least one control-surface observation before judging remap and tuning coverage. | capture remap scope and whether remaps reflect in prompts before claiming control-surface support. | record whether hold-toggle, sensitivity, inversion, or axis controls exist before judging tuning breadth. | log whether game-speed or timing relief exists before treating hard timing as purely motor-tax burden. | state whether this lane stays separate from settings-and-assists so later audits do not blur the boundary.
- settings-and-assists audit: missing. Missing: log at least one settings-and-assists observation before judging recovery-trust surfaces. | capture live, pause, or post-failure reachability before claiming players can find recovery knobs when they need them. | log whether difficulty or assist changes stay progress-safe before claiming the recovery path is trustworthy. | capture reminder replay, practice relief, or prompt-usage evidence before treating the lane as more than raw menu reachability. | log retry persistence before claiming the sampled assist or difficulty repair path earns trust on the next attempt.

## Readable Progression

- Proximal goal visible: unknown
- Prerequisite progress visible: unknown
- Evaluative readback available: unknown
- Non-comparative next step visible: unknown
- Progress feels reachable: unknown
- Progress reminders available: unknown
- Notes: none logged

## Choice Moments

- none logged

## Forgiveness

- Coyote time present: unknown
- Input buffer present: unknown
- Corner correction present: unknown
- Collision leniency fair: unknown
- Grace windows consistent: unknown
- Dropped intent caused failures: unknown
- Failure felt stolen: unknown
- Retry clarified missed timing: unknown
- Practice window available: unknown
- Notes: none logged
- Moments: none logged

## Settings And Assists

- Mid-run settings reachable: unknown
- Pause settings reachable: unknown
- Post-failure settings reachable: unknown
- Post-failure assist reachable: unknown
- Difficulty adjustable mid-run: unknown
- Assists adjustable mid-run: unknown
- Changes apply without restart: unknown
- Progress preserved when changed: unknown
- Controls reminder available: unknown
- Objective reminder available: unknown
- Tutorial replay available: unknown
- Practice relief available: unknown
- Prompt readable long enough to use knob: unknown
- Assist state persists across retry: unknown
- Difficulty state persists across retry: unknown
- Retry reenters expected state: unknown
- Notes: none logged

## Cross-Audit Confounders

- Input certainty: stable
- Response latency: stable
- Camera supports action: yes
- View obstructed at decision: no
- Auto-camera interference: no
- Notes: Observed mobile opener improvement came from layout only, not camera or input changes.

## Cue Channel Support

- Critical info multi-channel: unknown
- Critical info uses color only: unknown
- Critical info uses audio only: unknown
- Critical info still playable on mute: unknown
- Critical info has non-color backup: unknown
- Haptics used: unknown
- Haptics configurable: unknown
- Haptics carry critical info alone: unknown
- Cue detail: starter pad labels [channels=visual, text; color-only=no; audio-only=no]

## Cue Competition

- 390x844 first-contact layout: signals=quiet-window hint card, starter pad labels, route board; dominant read=yes; response priority=yes; non-critical UI competing=no; notes=The hint explained the pads without covering them, so the route plan kept one dominant read.

## Busy Frame Capture

- none logged

## Temporary Prompt Recovery

- none logged

## Probe Outcomes

- first-contact: outcome=success; success rating=4/4; confidence=6/7; satisfaction=6/7; frustration=1/7-not-frustrated; mental demand=2/7-high; time pressure=1/7-high; effort=2/7-high; blockers=; notes=390x844 opener kept both the hint and all three starter pads readable at once.
- busy-frame: outcome=success; success rating=3/4; confidence=5/7; satisfaction=5/7; frustration=2/7-not-frustrated; mental demand=2/7-high; time pressure=2/7-high; effort=2/7-high; blockers=; notes=Desktop quiet-window and live placement still matched the prior smoke.
- fail-retry: outcome=success; success rating=4/4; confidence=6/7; satisfaction=5/7; frustration=1/7-not-frustrated; mental demand=1/7-high; time pressure=2/7-high; effort=1/7-high; blockers=; notes=Retry preserved the quiet-window hint, the guided opener, and 3x speed.

## Probe Load

- Average mental demand: 1.7/7-high.
- Average time pressure: 1.7/7-high.
- Average effort: 1.7/7-high.
- High-load probes: none.
- Read load alongside success. A probe that technically worked can still mark overload if demand, rush, or effort stayed high.

## Cross-Lens Incident Queue

- mobile-opener-hint-route-conflict-cleared: title=mobile quiet-window hint no longer covers the route plan; lenses=onboarding, activation-loop, hud; first seen=00:00; repeats=2; impact=medium; persistence=constant; player cost=opener-readability; next check=keep the hint card above the board on future mobile passes if the copy grows again; notes=The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener.

## Stack Pressure

- 00:00 mobile quiet window: active demands=1; new demands=1; stack readable=yes; notes=Hint card stayed above the route and left the starter pads readable on mobile.
- 00:04 desktop first placement: active demands=2; new demands=1; stack readable=yes; notes=Desktop placement and live hint remained stable after the board-shell wrapper change.

## Downstream Claim Guardrails

### telegraph readability audit

- Gate: ready
- Allowed: report only observed telegraph readability audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge dangerous space, implied response, and future-path visibility only from logged cues | judge whether the telegraph stayed readable under overlap or pressure only when a stressed moment was logged | describe timing/readability confidence as observed confidence, not as raw input latency or restart timing | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not turn responsiveness timing into telegraph evidence | do not claim future-path clarity without a cue that logged the path or occupied space | do not claim the telegraph was readable under pressure if no stressed cue or overlap moment was sampled
- Next evidence: none

### pacing curve audit

- Gate: ready
- Allowed: report only observed pacing curve audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge sequencing only from logged beat order and retry loop | separate stack overload from control/view confounders when those were logged | judge escalation readability only when beat notes include active or fresh demand counts | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim full run pacing from one partial opening without later beat evidence | do not claim interruption recovery support without a logged resume probe or reminder check | do not claim mechanic stack stayed readable if beat-level stack evidence was not logged
- Next evidence: none

### failure loop audit

- Gate: ready
- Allowed: report only observed failure loop audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge failure readability and retry cost only from logged fail-retry sequence | judge chain punishment and lesson stability only when those fields were logged | say when death readability was confounded by control or camera support instead of loop structure alone | coverage gate ready: downstream audit may make lens-specific findings, still scoped to this sample.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim restart loop quality without an observed retry path | do not claim fair retry teaching if chain-punish or retry-stability evidence was not sampled
- Next evidence: none

### activation loop audit

- Gate: partial
- Allowed: report only observed activation loop audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge first-action trust and hidden-second-start risk only from logged first-contact or early-loop evidence | judge reminder recovery only when controls, goal, or interruption-return evidence was logged | judge death-to-control-ready re-entry only when retry or recovery-path evidence was logged | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not split boot and retry claims away from the same sampled trust path | do not call restart trust healthy without an observed retry or recovery path | do not claim prompt persistence is harmless if temporary prompt recovery was not sampled | do not issue clean-pass or comprehensive verdict language
- Next evidence: if temporary prompts appeared on the start path, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.

### onboarding critique

- Gate: partial
- Allowed: report only observed onboarding critique strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge first-contact clarity, reminder availability, and teaching load only if logged | judge temporary onboarding prompt recovery only when ephemeral moments were logged | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim return-after-break clarity without a logged interruption-resume probe | do not call transient tutorials harmless if prompt persistence or replayability was not sampled | do not issue clean-pass or comprehensive verdict language
- Next evidence: capture at least one interruption-resume probe before claiming reminders survive a short break or tab switch. | if temporary onboarding prompts appeared, log whether they auto-dismissed, could be advanced by the player, or could be reviewed later.

### HUD readability audit

- Gate: partial
- Allowed: report only observed hud readability audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge cue/HUD readability only for logged busy-frame or critical-read moments | flag when read failures may be compounded by obstructed view or auto-camera interference | judge overlap priority only when at least one cue-competition moment was logged | judge temporary warning or popup recovery only when ephemeral moments were logged | judge color-only or audio-only cue fragility only when cue-channel support was logged | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not call HUD readable from calm screens alone | do not claim multi-warning clarity if no competition moment was sampled | do not treat disappearing prompts as readable if replayability or player pacing was not checked | do not assume critical cues survive mute play or color ambiguity if no fallback-channel evidence was logged | do not issue clean-pass or comprehensive verdict language
- Next evidence: capture at least one busy frame under pressure; calm screenshots are not enough.

### choice-readback audit

- Gate: partial
- Allowed: report only observed choice-readback audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge pre-pick option contrast only from logged offered alternatives and expected tradeoff notes | judge post-pick payoff readback only when actual payoff timing or after-pick comparison was logged | say when weak choice readback may be compounded by broader progression, failure, or control-view issues | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not infer meaningful choice from count alone | do not claim a skipped option would have played out differently unless the offered comparison actually logged that distinction | do not declare the whole upgrade, loadout, or route economy solved from one sampled branch | do not issue clean-pass or comprehensive verdict language
- Next evidence: log at least one sampled choice point before making choice-readback claims. | capture at least two offered options so the audit can judge contrast instead of one picked branch in isolation. | log whether options looked meaningfully different before the pick and how they compared to the current state or build. | capture actual payoff timing and after-pick comparison before judging whether the player could see what changed after choosing.

### mastery motivation audit

- Gate: partial
- Allowed: report only observed mastery motivation audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge whether the sampled opening showed one earned success, one short goal, and one meaningful early choice | judge whether the sampled fail-retry preserved a concrete improvement signal | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not declare the whole game motivationally strong or weak from one opening slice | do not generalize autonomy or competence support beyond sampled contexts | do not issue clean-pass or comprehensive verdict language
- Next evidence: log at least one early choice point before claiming the loop supports autonomy instead of only obedience.

### forgiveness audit

- Gate: partial
- Allowed: report only observed forgiveness audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge coyote time, input buffering, corner correction, or collision leniency only from logged intent-preservation moments | judge whether failure felt stolen only when the sampled moment names the intended action and the observed outcome | judge retry teaching only when the sampled retry clarifies the missed timing or preserves the same lesson | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not call the whole control model fair from one clean sample | do not treat generic fast retry as forgiveness evidence when the edge-timing or collision moment was not logged | do not call harsh timing acceptable if no practice, assist, or lower-punishment path was sampled for the brittle demand | do not issue clean-pass or comprehensive verdict language
- Next evidence: log at least one forgiveness observation before judging whether the game preserves player intent. | log whether coyote time, input buffering, corner correction, collision leniency, or grace consistency were actually observed.

### input demand audit

- Gate: partial
- Allowed: report only observed input demand audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge mash, hold, simultaneous, rapid-sequence, analog, or timing-speed burden only from logged demand samples or explicit demand fields | judge remap truth separately from motor-tax burden only when both surfaces were logged | judge lower-demand alternatives or assists only when those fields were sampled | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not collapse general difficulty into input-demand evidence without a named demanded action | do not treat remapping as a complete accessibility answer if timing-speed burden or simultaneous demand stayed unsampled | do not call harsh demanded inputs acceptable if no lower-demand path, assist, or readability-before-failure evidence was logged | do not issue clean-pass or comprehensive verdict language
- Next evidence: log at least one explicit input-demand observation before judging motor-tax burden. | capture at least one demand type or sample so the audit can name the real burden instead of inferring it from vibes. | distinguish progression-critical demands from optional flourishes before calling the burden blocker-grade. | log remap truth separately from timing-speed burden before claiming the issue is solved or unsolved by remapping. | log whether lower-demand alternatives, assists, or difficulty relief exist before judging the demanded action as acceptably harsh.

### impact feel audit

- Gate: partial
- Allowed: report only observed impact feel audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge contact truth or force hierarchy only for logged contact samples | coverage gate partial: downstream audit may flag observed issues, but must name evidence gaps.
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not claim heavy-hit payoff if no heavy or high-stakes contact was observed | do not issue clean-pass or comprehensive verdict language
- Next evidence: log at least one contact event before judging impact feel. | capture contact readability or force notes, not only vague feel words.

### readable progression audit

- Gate: missing
- Allowed: report only observed readable progression audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge proximal goals, prerequisite progress, and next-step clarity only from logged progression evidence | judge whether the progression read felt reachable or evaluative only when that field was logged
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not turn general mastery tone into progression evidence | do not claim readable progression without a logged progress surface or next-step readback | do not run downstream verdict as if audit evidence exists
- Next evidence: log a short-range goal or progress surface before judging readable progression. | capture prerequisite progress, evaluative readback, or the next step before claiming the loop explains advancement. | log whether the next step still feels reachable and recoverable from play. | capture one note about how the progression read back to the player.

### control-surface audit

- Gate: missing
- Allowed: report only observed control-surface audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge remap scope, remap reflection, hold-toggle alternatives, and tuning surfaces only when logged | describe game-speed or timing relief as control-surface support, not as a full accessibility verdict | keep the lane separate from settings-and-assists and say when the boundary was explicitly checked
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not turn motor-tax burden claims into control-surface claims | do not claim broader accessibility relief from remap or tuning alone | do not fold assist menus or difficulty presets into this lane unless the session explicitly logged them as control-surface evidence | do not run downstream verdict as if audit evidence exists
- Next evidence: log at least one control-surface observation before judging remap and tuning coverage. | capture remap scope and whether remaps reflect in prompts before claiming control-surface support. | record whether hold-toggle, sensitivity, inversion, or axis controls exist before judging tuning breadth. | log whether game-speed or timing relief exists before treating hard timing as purely motor-tax burden. | state whether this lane stays separate from settings-and-assists so later audits do not blur the boundary.

### settings-and-assists audit

- Gate: missing
- Allowed: report only observed settings-and-assists audit strengths or frictions from this session | keep wording scoped to direct-play evidence and sampled contexts | judge live, pause, or post-failure recovery reachability only from logged recovery-surface evidence | judge progress-safe changes, reminder replay, practice relief, or retry persistence only when those fields were sampled | keep the lane separate from control-surface tuning and raw motor-tax burden
- Blocked: do not generalize to whole game beyond logged contexts | do not turn missing sample areas into implied passes | do not collapse remap, hold-toggle, sensitivity, inversion, or axis tuning into this lane | do not claim a recovery path is trustworthy if persistence or change-safety stayed unsampled | do not generalize one sampled death or pause path into a full settings verdict | do not run downstream verdict as if audit evidence exists
- Next evidence: log at least one settings-and-assists observation before judging recovery-trust surfaces. | capture live, pause, or post-failure reachability before claiming players can find recovery knobs when they need them. | log whether difficulty or assist changes stay progress-safe before claiming the recovery path is trustworthy. | capture reminder replay, practice relief, or prompt-usage evidence before treating the lane as more than raw menu reachability. | log retry persistence before claiming the sampled assist or difficulty repair path earns trust on the next attempt.

## Strengths

- mobile quiet-window hint now preserves full route-pad visibility
- desktop opener and first placement stayed readable after the wrapper change
- retry still returns to the same guided wave-one state quickly

## Frictions

- none logged

## Starter JSON

### Activation Loop Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "firstObjectiveClear": true,
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true,
    "controlsReminderAvailable": true,
    "objectiveReminderAvailable": true,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 1,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "earlyLoop": {},
  "retrySeconds": 1,
  "returnsToCurrentTestQuickly": true,
  "failures": [
    {
      "at": "00:22",
      "cause": "intentional no-build leak collapse during 3x send probe",
      "causeReadable": true,
      "correctiveActionClear": true,
      "retrySeconds": 1,
      "menuLayersBeforeRetry": 1,
      "checkpointLossSeconds": 22,
      "sourceVisibleOnFail": true,
      "returnsToRelevantDecision": true,
      "repeatedPenaltyFromSingleMistake": false,
      "controlRecoveredBeforeNextHit": true,
      "retryContextStable": true,
      "notes": "Breach overlay and Enter retry still returned to the same guided wave-one opener."
    }
  ],
  "failState": {},
  "learningLoop": {
    "immediateRetry": true,
    "practiceWithoutFailure": false,
    "sameSkillRetestedQuickly": true,
    "sameLessonStableAcrossRetries": true
  },
  "recoverySupport": {
    "retryHintVisible": true,
    "retryVerbMatchesInput": true,
    "notes": "Press Enter or click Retry Operation to restart immediately. Use 1 2 3 to rebuild, then N to relaunch."
  },
  "resumeProbes": [],
  "ephemeralMoments": [],
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Onboarding Critique

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "verbs": [
    {
      "name": "start + place + launch",
      "firstPromptAt": "00:00",
      "firstRequiredAt": "00:00",
      "practiceBeforeRisk": false,
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
  "earlyLoop": {},
  "teachingLoad": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "upfrontInstructionScreens": 1,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### HUD Readability Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "criticalElements": [
    {
      "name": "quiet-window hint card",
      "location": "board shell top edge",
      "purpose": "keep the first build and launch verbs visible without hiding the route plan",
      "visibleWithoutScroll": true,
      "notes": "Quiet window. Green pads mark safe first builds. Build, upgrade, or press N to launch Warmup."
    },
    {
      "name": "starter pad labels",
      "location": "playfield",
      "purpose": "show safe first-build pockets and route planning before wave 1 launches",
      "visibleWithoutScroll": true,
      "notes": "Start, Anchor, and Late were visible together on the 390x844 opener."
    }
  ],
  "cues": [
    {
      "name": "starter pad labels",
      "importance": "critical",
      "nearAction": true,
      "redundantSignal": true,
      "signalChannels": [
        "visual",
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
      "notes": "All three opener labels remained readable in the sampled mobile quiet window."
    }
  ],
  "stressFrames": [],
  "competitionMoments": [
    {
      "moment": "390x844 first-contact layout",
      "signals": [
        "quiet-window hint card",
        "starter pad labels",
        "route board"
      ],
      "urgentSignalCount": 1,
      "dominantReadClear": true,
      "responsePriorityClear": true,
      "nonCriticalUiCompeting": false,
      "notes": "The hint explained the pads without covering them, so the route plan kept one dominant read."
    }
  ],
  "ephemeralMoments": [],
  "clutter": {},
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledEncounters": 2,
    "sampledBusyFrames": 1,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Telegraph Readability Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "telegraphReadings": [
    {
      "name": "starter pad labels",
      "dangerousSpace": "All three opener labels remained readable in the sampled mobile quiet window.",
      "impliedResponse": "clear",
      "futurePathVisible": true,
      "telegraphReadable": true,
      "timingReadabilityConfidence": "high",
      "contrastStable": true,
      "readableUnderMotion": true,
      "motionDistraction": "low"
    }
  ],
  "competitionMoments": [
    {
      "moment": "390x844 first-contact layout",
      "signals": [
        "quiet-window hint card",
        "starter pad labels",
        "route board"
      ],
      "urgentSignalCount": 1,
      "dominantReadClear": true,
      "responsePriorityClear": true,
      "nonCriticalUiCompeting": false,
      "notes": "The hint explained the pads without covering them, so the route plan kept one dominant read."
    }
  ],
  "stressFrames": [],
  "channelSupport": {},
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledEncounters": 2,
    "sampledBusyFrames": 1,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Pacing Curve Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "beats": [
    {
      "at": "00:00",
      "label": "mobile quiet window",
      "kind": "teach",
      "novelty": "new-verb",
      "skills": [
        "start",
        "place",
        "launch"
      ],
      "practicedBefore": false,
      "readable": true,
      "activeDemands": 1,
      "newDemands": 1,
      "stackReadable": true,
      "notes": "Hint card stayed above the route and left the starter pads readable on mobile."
    },
    {
      "at": "00:04",
      "label": "desktop first placement",
      "kind": "test",
      "novelty": "baseline",
      "skills": [
        "place",
        "launch"
      ],
      "practicedBefore": true,
      "readable": true,
      "activeDemands": 2,
      "newDemands": 1,
      "stackReadable": true,
      "notes": "Desktop placement and live hint remained stable after the board-shell wrapper change."
    }
  ],
  "earlyLoop": {},
  "retrySeconds": 1,
  "returnsToCurrentTestQuickly": true,
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Failure Loop Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "failures": [
    {
      "at": "00:22",
      "cause": "intentional no-build leak collapse during 3x send probe",
      "causeReadable": true,
      "correctiveActionClear": true,
      "retrySeconds": 1,
      "menuLayersBeforeRetry": 1,
      "checkpointLossSeconds": 22,
      "sourceVisibleOnFail": true,
      "returnsToRelevantDecision": true,
      "repeatedPenaltyFromSingleMistake": false,
      "controlRecoveredBeforeNextHit": true,
      "retryContextStable": true,
      "notes": "Breach overlay and Enter retry still returned to the same guided wave-one opener."
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
  "recoverySupport": {
    "retryHintVisible": true,
    "retryVerbMatchesInput": true,
    "notes": "Press Enter or click Retry Operation to restart immediately. Use 1 2 3 to rebuild, then N to relaunch."
  },
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Mastery Motivation Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "firstObjectiveClear": true,
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true,
    "controlsReminderAvailable": true,
    "objectiveReminderAvailable": true,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 1,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "earlyLoop": {},
  "mastery": {},
  "learningLoop": {
    "immediateRetry": true,
    "practiceWithoutFailure": false,
    "sameSkillRetestedQuickly": true,
    "sameLessonStableAcrossRetries": true
  },
  "recoverySupport": {
    "retryHintVisible": true,
    "retryVerbMatchesInput": true,
    "notes": "Press Enter or click Retry Operation to restart immediately. Use 1 2 3 to rebuild, then N to relaunch."
  },
  "failures": [
    {
      "at": "00:22",
      "cause": "intentional no-build leak collapse during 3x send probe",
      "causeReadable": true,
      "correctiveActionClear": true,
      "retrySeconds": 1,
      "menuLayersBeforeRetry": 1,
      "checkpointLossSeconds": 22,
      "sourceVisibleOnFail": true,
      "returnsToRelevantDecision": true,
      "repeatedPenaltyFromSingleMistake": false,
      "controlRecoveredBeforeNextHit": true,
      "retryContextStable": true,
      "notes": "Breach overlay and Enter retry still returned to the same guided wave-one opener."
    }
  ],
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Choice Readback Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "firstObjectiveClear": true,
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true,
    "controlsReminderAvailable": true,
    "objectiveReminderAvailable": true,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 1,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "mastery": {},
  "readableProgression": {},
  "failures": [
    {
      "at": "00:22",
      "cause": "intentional no-build leak collapse during 3x send probe",
      "causeReadable": true,
      "correctiveActionClear": true,
      "retrySeconds": 1,
      "menuLayersBeforeRetry": 1,
      "checkpointLossSeconds": 22,
      "sourceVisibleOnFail": true,
      "returnsToRelevantDecision": true,
      "repeatedPenaltyFromSingleMistake": false,
      "controlRecoveredBeforeNextHit": true,
      "retryContextStable": true,
      "notes": "Breach overlay and Enter retry still returned to the same guided wave-one opener."
    }
  ],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Readable Progression Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "readableProgression": {},
  "mastery": {},
  "earlyLoop": {},
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "firstObjectiveClear": true,
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true,
    "controlsReminderAvailable": true,
    "objectiveReminderAvailable": true,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 1,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "failures": [
    {
      "at": "00:22",
      "cause": "intentional no-build leak collapse during 3x send probe",
      "causeReadable": true,
      "correctiveActionClear": true,
      "retrySeconds": 1,
      "menuLayersBeforeRetry": 1,
      "checkpointLossSeconds": 22,
      "sourceVisibleOnFail": true,
      "returnsToRelevantDecision": true,
      "repeatedPenaltyFromSingleMistake": false,
      "controlRecoveredBeforeNextHit": true,
      "retryContextStable": true,
      "notes": "Breach overlay and Enter retry still returned to the same guided wave-one opener."
    }
  ],
  "resumeProbes": [],
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Control Surface Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "controlSurface": {},
  "starter": {
    "remap": {
      "scope": []
    },
    "promptReflection": {},
    "holdToggle": {},
    "sensitivity": {},
    "gameSpeedRelief": {}
  },
  "inputDemand": {},
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "firstObjectiveClear": true,
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true,
    "controlsReminderAvailable": true,
    "objectiveReminderAvailable": true,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 1,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Settings And Assists Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "settingsAndAssists": {},
  "starter": {
    "recoveryTrust": {},
    "reachability": {},
    "changeSafety": {},
    "reminderPractice": {},
    "persistence": {}
  },
  "controlSurface": {},
  "firstContact": {
    "loopComplexity": "low",
    "discoverableThroughExperiment": true,
    "firstObjectiveClear": true,
    "currentGoalEasyToRestate": true,
    "nextStepPrescriptive": true,
    "controlsReminderAvailable": true,
    "objectiveReminderAvailable": true,
    "progressSafeHelp": true,
    "remapSafe": false,
    "upfrontInstructionScreens": 1,
    "promptsBeforeMeaningfulPlay": 1,
    "blocksFirstMeaningfulInput": false,
    "forcedTutorialSteps": 0,
    "optionalHelpOnDemand": true
  },
  "learningLoop": {
    "immediateRetry": true,
    "practiceWithoutFailure": false,
    "sameSkillRetestedQuickly": true,
    "sameLessonStableAcrossRetries": true
  },
  "recoverySupport": {
    "retryHintVisible": true,
    "retryVerbMatchesInput": true,
    "notes": "Press Enter or click Retry Operation to restart immediately. Use 1 2 3 to rebuild, then N to relaunch."
  },
  "resumeProbes": [],
  "failures": [
    {
      "at": "00:22",
      "cause": "intentional no-build leak collapse during 3x send probe",
      "causeReadable": true,
      "correctiveActionClear": true,
      "retrySeconds": 1,
      "menuLayersBeforeRetry": 1,
      "checkpointLossSeconds": 22,
      "sourceVisibleOnFail": true,
      "returnsToRelevantDecision": true,
      "repeatedPenaltyFromSingleMistake": false,
      "controlRecoveredBeforeNextHit": true,
      "retryContextStable": true,
      "notes": "Breach overlay and Enter retry still returned to the same guided wave-one opener."
    }
  ],
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledFailures": 1,
    "sampledRetries": 1,
    "sampledResumeProbes": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### Impact Feel Audit

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "contacts": [],
  "channelSupport": {},
  "evidence": {
    "mode": "direct-play",
    "sampledEncounters": 2,
    "sampledContacts": 1,
    "sampledHeavyContacts": 0,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

### AGI Tag Snapshot

```json
{
  "game": "bloons-pop",
  "sessionDate": "2026-05-06",
  "agiSnapshot": {},
  "inputDemand": {},
  "cues": [
    {
      "name": "starter pad labels",
      "importance": "critical",
      "nearAction": true,
      "redundantSignal": true,
      "signalChannels": [
        "visual",
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
      "notes": "All three opener labels remained readable in the sampled mobile quiet window."
    }
  ],
  "stressFrames": [],
  "channelSupport": {},
  "confounders": {
    "inputCertainty": "stable",
    "responseLatency": "stable",
    "cameraSupportsAction": true,
    "viewObstructedAtDecision": false,
    "autoCameraInterference": false,
    "notes": "Observed mobile opener improvement came from layout only, not camera or input changes."
  },
  "evidence": {
    "mode": "direct-play",
    "sampledRuns": 3,
    "sampledBusyFrames": 1,
    "sampledContacts": 1,
    "notes": [
      "Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.",
      "On 390x844, the quiet-window hint rendered above the board instead of covering the route, and the Start, Anchor, and Late starter pad labels remained visible together in the opener.",
      "Desktop quiet-window and wave-one placement stayed readable after the layout change.",
      "Fail-retry smoke still preserved the breach overlay, Enter retry, and 3x speed state.",
      "Console errors observed during smoke: 0."
    ]
  },
  "probeOutcomes": [
    {
      "probe": "first-contact",
      "goal": "keep the quiet-window hint visible without hiding mobile starter-pad guidance",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 6,
      "frustration": 1,
      "mentalDemand": 2,
      "timePressure": 1,
      "effort": 2,
      "blockers": [],
      "notes": "390x844 opener kept both the hint and all three starter pads readable at once."
    },
    {
      "probe": "busy-frame",
      "goal": "preserve desktop readability after the layout change",
      "outcome": "success",
      "successRating": 3,
      "confidence": 5,
      "satisfaction": 5,
      "frustration": 2,
      "mentalDemand": 2,
      "timePressure": 2,
      "effort": 2,
      "blockers": [],
      "notes": "Desktop quiet-window and live placement still matched the prior smoke."
    },
    {
      "probe": "fail-retry",
      "goal": "confirm the layout fix did not disturb retry trust",
      "outcome": "success",
      "successRating": 4,
      "confidence": 6,
      "satisfaction": 5,
      "frustration": 1,
      "mentalDemand": 1,
      "timePressure": 2,
      "effort": 1,
      "blockers": [],
      "notes": "Retry preserved the quiet-window hint, the guided opener, and 3x speed."
    }
  ],
  "incidents": [
    {
      "incidentTag": "mobile-opener-hint-route-conflict-cleared",
      "title": "mobile quiet-window hint no longer covers the route plan",
      "lenses": [
        "onboarding",
        "activation-loop",
        "hud"
      ],
      "firstSeenAt": "00:00",
      "repeatedCount": 2,
      "impact": "medium",
      "persistence": "constant",
      "playerCost": [
        "opener-readability"
      ],
      "nextCheck": "keep the hint card above the board on future mobile passes if the copy grows again",
      "notes": "The sampled after-fix pass showed the quiet-window hint and route pads coexisting on the same mobile opener."
    }
  ],
  "strengths": [
    "mobile quiet-window hint now preserves full route-pad visibility",
    "desktop opener and first placement stayed readable after the wrapper change",
    "retry still returns to the same guided wave-one state quickly"
  ],
  "frictions": []
}
```

## Durable Learning

- Shared playtest capture should save repeated incident tags into repo-local Kojima memory, because repeat count plus impact shows which browser-play failure keeps resurfacing across onboarding, HUD, pacing, or failure reviews.
