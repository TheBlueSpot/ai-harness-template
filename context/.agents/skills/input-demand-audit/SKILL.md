---
name: input-demand-audit
description: Review browser-game input burden with evidence-backed heuristics for mash, hold, simultaneous, rapid-sequence, precision-timing, and path-based demands, plus whether lower-demand alternatives or assists exist. Use when Codex needs a reusable pass for games that may be mechanically clear yet still block play through motor tax, brittle timing-speed requirements, or remap-only accessibility claims.
---

# Input Demand Audit

## Overview

Use this skill when a browser-playable entry may be understandable yet still hard to operate because input burden itself blocks progress. Goal: separate `can remap it` from `can physically and temporally perform it`, then judge whether the game offers lower-demand alternatives when the demanded action is harsh.

Core questions:

- does the game demand mash, hold, simultaneous presses, rapid sequences, analog/path-tracing, or tight timing under pressure
- are those demands optional flavor or progression blockers
- does the game offer lower-demand alternatives, assists, or mechanic-level simplifications
- do failures read like deserved challenge, or like hidden motor tax
- does the current evidence support a strong claim, or only a narrow sampled warning

## Workflow

1. Start from direct browser play when possible.
2. Reuse `playtest-evidence-capture` output when available instead of relogging first-contact, fail-retry, and practice-support facts.
3. Capture at least one demanded action sample and one consequence sample when possible:
   - one mash, hold, simultaneous, sequence, analog, or timing-tight input moment
   - one fail or near-fail caused by that demand
   - one retry, assist, or lower-demand alternative if the game offers one
4. Judge the run against five reusable checks:
   - demanded input types are explicitly identified
   - progression-critical demands are distinguished from optional flourishes
   - remap access is separated from timing-speed burden
   - lower-demand alternatives or assists exist when the burden is harsh
   - retry and failure readback make the burden understandable instead of opaque
5. Treat input demand as structural playability, not cosmetic accessibility garnish. If a loop hides a motor-tax wall behind otherwise good design, more content or polish will not fix it.
6. Keep findings blocker-first and evidence-scoped.
7. If `playtest-evidence-capture` already emitted `input-demand-audit.json`, feed that starter directly into the helper and keep its claim guardrails intact.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/input-demand-audit/scripts/input_demand_audit.ts --template
```

Turn one observation JSON or shared starter into a markdown audit:

```powershell
bun.cmd .agents/skills/input-demand-audit/scripts/input_demand_audit.ts `
  --observations ".local/input-demand-notes.json"
```

Write audit directly to a game-local note:

```powershell
bun.cmd .agents/skills/input-demand-audit/scripts/input_demand_audit.ts `
  --observations ".local/input-demand-notes.json" `
  --out "some-game/input-demand-audit.md"
```

Feed the shared starter from `playtest-evidence-capture` directly into the helper:

```powershell
bun.cmd .agents/skills/input-demand-audit/scripts/input_demand_audit.ts `
  --observations ".local/playtest-starters/input-demand-audit.json"
```

Saved learnings accumulate in:

```text
./.agents/skills/input-demand-audit/LEARNINGS.md
```

## Why This Shape

- Current repo skills already cover onboarding, reminder recovery, progression clarity, forgiveness, and responsiveness, but no single pass isolates motor-tax burden from general difficulty.
- Microsoft Learn `Xbox Accessibility Guideline 107: Input` keeps timing, speed, hold, and simultaneous demands in scope, not only control mapping.
- Microsoft Learn `Xbox Accessibility Guideline 108: Game difficulty options` supports lower-demand or adjustable alternatives when harsh demands would otherwise gate progress.
- Apple onboarding guidance still supports teaching one demanded action at a time and letting players act quickly instead of front-loading opaque control tax.
- Accessible Games Initiative and Game Accessibility Guidelines reinforce that rapid repeated input, prolonged holds, and simultaneous/path-based demands should not become silent blockers without alternatives.

## Sources

- Microsoft Learn. `Xbox Accessibility Guideline 107: Input.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107>
- Microsoft Learn. `Xbox Accessibility Guideline 108: Game difficulty options.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/108>
- Apple Developer. `Onboarding for Games.` <https://developer.apple.com/app-store/onboarding-for-games/>
- Apple Developer. `Onboarding.` <https://developer.apple.com/design/human-interface-guidelines/onboarding>
- Accessible Games Initiative. `Tags and Requirements.` <https://accessiblegames.com/wp-content/uploads/2025/03/Accessible-Games-Initiative-Tags-and-Criteria-March-2025.pdf>
- Game Accessibility Guidelines. `Avoid repeated inputs (button-mashing/quick time events).` <https://gameaccessibilityguidelines.com/avoid-repeated-inputs-button-mashing-quick-time-events/>
- Game Accessibility Guidelines. `Avoid / provide alternatives to requiring buttons to be held down.` <https://gameaccessibilityguidelines.com/avoid-provide-alternatives-to-requiring-buttons-to-be-held-down/>
- Game Accessibility Guidelines. `Ensure that multiple simultaneous actions (eg. click/drag or swipe) are not required, and included only as a supplementary / alternative input method.` <https://gameaccessibilityguidelines.com/ensure-that-multiple-simultaneous-actions-eg-click-drag-or-swipe-are-not-required-and-included-only-as-a-supplementary-alternative-input-method/>
