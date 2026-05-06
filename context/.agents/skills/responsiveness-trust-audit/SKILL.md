---
name: responsiveness-trust-audit
description: Review browser-game input and restart trust with evidence-backed heuristics for first-input response, restart control-ready timing, blocked-frame attribution, and probe evidence quality. Use when Codex needs a reusable pass for sluggish controls, uncertain restart readiness, or a newly captured responsiveness probe that needs blocker-first interpretation.
---

# Responsiveness Trust Audit

## Overview

Use this skill when a browser-playable entry feels late, mushy, or unfair and you need one focused pass on whether the game answered player input fast and clearly enough to trust. Goal: turn one `browser_responsiveness_probe.ts` artifact into blocker-first findings, a compact evidence snapshot, timing interpretation, and a next action without collapsing measured latency, estimated latency, and unsupported browser surfaces into the same vague `felt laggy` note.

Core questions:

- did first input produce a visible answer quickly enough to trust
- does restart return to visible feedback fast enough to preserve the learning loop
- does restart return to control-ready state fast enough for the next correction attempt
- do blocked-frame samples explain where the delay lived
- does the probe evidence actually support a strong claim, or only an estimate

## Workflow

1. Start from the dedicated responsiveness probe lane before broad feel review.
2. Prefer raw probe JSON from `playtest-evidence-capture/scripts/browser_responsiveness_probe.ts`.
3. Keep evidence categories separate:
   - `measured` means reusable timing evidence exists
   - `estimated` means fallback timing exists but confidence is lower
   - `unsupported` means the browser surface was absent
   - `missing` means the probe did not observe the needed moment
4. Judge four reusable checks:
   - first-input answer trust
   - restart visible answer trust
   - restart control-ready trust
   - blocked-frame attribution quality
5. Treat unsupported timing surfaces as evidence gaps first, not instant gameplay verdicts.
6. If blocked frames exist, use them to decide whether the delay lived in event delay, handler work, or long-frame rendering pressure.
7. Keep findings blocker-first and evidence-scoped.

## Commands

Print the expected input shape and source command:

```powershell
bun.cmd .agents/skills/responsiveness-trust-audit/scripts/responsiveness_trust_audit.ts --template
```

Turn one responsiveness probe JSON into a markdown audit:

```powershell
bun.cmd .agents/skills/responsiveness-trust-audit/scripts/responsiveness_trust_audit.ts `
  --observations ".local/some-game-responsiveness.json"
```

Write audit directly to a game-local or local note:

```powershell
bun.cmd .agents/skills/responsiveness-trust-audit/scripts/responsiveness_trust_audit.ts `
  --observations ".local/some-game-responsiveness.json" `
  --out "some-game/responsiveness-trust-audit.md"
```

Saved learnings accumulate in:

```text
./.agents/skills/responsiveness-trust-audit/LEARNINGS.md
```

## Why This Shape

- The catalog already ships a strong responsiveness probe, but it still lacked a focused audit lane that converts probe artifacts into closure-ready findings quickly.
- Microsoft Learn and current accessibility guidance keep readable, reviewable objectives and low-distraction reads in scope, but fast arcade trust also depends on whether the control answer itself arrived in time.
- MDN's March 27, 2026 Long Animation Frames guidance distinguishes long-frame attribution from older long-task-only views, which maps directly to the catalog's need to explain where a delayed answer came from instead of only noticing that it felt late.
- Playwright Trace Viewer remains the fastest local inspectability path when the probe says something was slow but the exact visual state still needs inspection.
- Recent developer-facing game writeups still reinforce the same product truth for this catalog: readable action and strong replayability rely on stable response plus choices that stay legible under pressure, not on reward layers alone.

## Sources

- MDN. `Long animation frame timing.` Last modified March 27, 2026. <https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing>
- Playwright. `Trace viewer.` <https://playwright.dev/docs/next/trace-viewer>
- Microsoft Learn. `Xbox Accessibility Guideline 109: Objective clarity.` Last updated March 4, 2026. <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/109>
- Microsoft Learn. `Xbox Accessibility Guideline 117: Visual distractions and motion settings.` Published April 2026. <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117>
- Game Accessibility Guidelines. `Avoid placing essential temporary information outside the player's eye-line.` <https://gameaccessibilityguidelines.com/avoid-placing-essential-temporary-information-outside-the-players-eye-line/>
- PlayStation Blog. `Inside the gameplay systems of 4:Loop.` Published February 12, 2026. <https://blog.playstation.com/2026/02/12/inside-the-gameplay-systems-of-4loop/>
- PlayStation Blog. `Wrath: Aeon of Ruin VR - Brutal Edition launches on PS VR2 April 9.` Published April 6, 2026. <https://blog.playstation.com/2026/04/06/wrath-aeon-of-ruin-vr-brutal-edition-launches-on-ps-vr2-april-9/>
