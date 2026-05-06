---
name: control-surface-audit
description: Review browser-game control surface quality with evidence-backed heuristics for remap coverage, prompt reflection, hold-toggle clarity, sensitivity and axis options, and game-speed relief. Use when Codex needs a reusable pass for control layouts that may be playable yet still fail to expose enough player-facing control options or recovery from speed pressure.
---

# Control Surface Audit

## Overview

Use this skill when a browser-playable entry needs a blocker-first read on whether the player can inspect, remap, or soften control pressure without leaving the core loop. The audit stays narrow: it only evaluates observed remap, toggle, sensitivity, axis, and speed-relief evidence. It does not broaden into full settings-and-assists coverage.

Core questions:

- can the current control layout be remapped enough to preserve intent
- are prompts and in-play reminders reflective enough to explain the active control state
- are hold or toggle choices explicit and easy to recover
- are sensitivity, inversion, dead-zone, or axis-style options present when the game needs them
- does the game offer any speed-relief path when the default pace is too punishing
- do the claim guardrails say the sample is strong enough for broad conclusions

## Workflow

1. Start from direct play or a captured observation payload.
2. Reuse `playtest-evidence-capture` starter output when available, but keep the evidence ceiling intact.
3. Judge only the observed control-surface facts, not the whole settings model.
4. Keep findings blocker-first. When control readability or relief is missing, say so plainly.
5. Treat any missing remap, toggle, or sensitivity evidence as a control-surface gap, not as proof that the game lacks every accessibility option.
6. If starter guardrails are present, preserve them in the rendered audit and in the claim ceiling.
7. Append one durable learning line that captures the strongest reusable control-surface lesson from the run.

## Commands

Print the starter control-surface template:

```powershell
bun.cmd .agents/skills/control-surface-audit/scripts/control_surface_audit.ts --template
```

Turn one observation JSON or shared starter into a markdown audit:

```powershell
bun.cmd .agents/skills/control-surface-audit/scripts/control_surface_audit.ts `
  --observations ".local/control-surface-observations.json"
```

Write audit directly to a local note:

```powershell
bun.cmd .agents/skills/control-surface-audit/scripts/control_surface_audit.ts `
  --observations ".local/control-surface-observations.json" `
  --out "some-game/control-surface-audit.md"
```

Feed the shared starter from `playtest-evidence-capture` directly into the helper:

```powershell
bun.cmd .agents/skills/control-surface-audit/scripts/control_surface_audit.ts `
  --observations ".local/playtest-starters/control-surface-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/control-surface-audit/LEARNINGS.md
```

## Sources

- Microsoft Learn. `Xbox Accessibility Guideline 107: Input.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107>
- Microsoft Learn. `Xbox Accessibility Guidelines - Version History.` <https://learn.microsoft.com/en-us/gaming/accessibility/xag-version-history>
- Game Accessibility Guidelines. `Allow controls to be remapped.` <https://gameaccessibilityguidelines.com/allow-controls-to-be-remapped/>
- Game Accessibility Guidelines. `Allow remapping of controls during gameplay.` <https://gameaccessibilityguidelines.com/allow-remapping-of-controls-during-gameplay/>
- Game Accessibility Guidelines. `Allow controls to be turned on / off or toggled.` <https://gameaccessibilityguidelines.com/allow-controls-to-be-turned-on-off-or-toggled/>
- Game Accessibility Guidelines. `Allow sensitivity to be adjusted.` <https://gameaccessibilityguidelines.com/allow-sensitivity-to-be-adjusted/>
