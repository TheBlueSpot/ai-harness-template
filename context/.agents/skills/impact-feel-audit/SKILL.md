---
name: impact-feel-audit
description: Review browser-game impact and contact feel with evidence-backed heuristics for hit clarity, force hierarchy, channel layering, and scene preservation. Use when Codex needs a reusable pass for weak combat payoff, muddy hit feedback, flat juice, unclear contact events, or whether stronger hits feel stronger without hiding control.
---

# Impact Feel Audit

## Overview

Use this skill when a browser-playable game needs a focused impact-feel pass instead of a broad design review. Goal: judge whether contact reads immediately, whether heavier events feel heavier, whether feedback channels reinforce the same event coherently, and whether the game preserves player understanding after the hit instead of burying control in spectacle.

Concrete opportunity: this catalog already keeps rediscovering impact-feel and control-honesty issues in durable notes, but had no reusable audit skill for them. This skill turns one observation JSON into blocker-first findings, an evidence snapshot, a compact impact-stack review, evidence-backed next steps, and one durable learning line saved to local skill memory.

## Workflow

1. Start from direct browser play when possible.
2. Sample at least one light contact and one heavy or high-stakes contact. Do not judge only from menu footage or one flashy finisher.
3. Log observations with explicit evidence scope before judging severity.
4. Judge impact against five reusable checks:
   - contact event confirms fast enough that the player can tell `did that hit`
   - stronger hits create stronger readable hierarchy instead of giving every tap the same full-intensity reaction
   - sound, hit stop, camera, and visual effects reinforce the same event coherently instead of competing
   - feedback preserves scene understanding and control after impact instead of masking targets, lanes, or recovery timing
   - haptics, if used, stay optional reinforcement and never become the only carrier of important information
5. Treat unreadable contact, flat heavy-hit hierarchy, and scene-obscuring feedback as gameplay issues, not polish-only notes.
6. End the run by saving the generated durable learning into `./.agents/skills/impact-feel-audit/LEARNINGS.md`.
7. Keep findings high level and game-local. Prefer a few concrete fixes over broad juice theory.

## Why This Shape

- The current local audit set already covers onboarding, HUD readability, pacing, and failure loops. Impact feel remained an uncovered repeat problem even though the catalog's arcade bias depends on readable moment-to-moment payoff.
- Lin, Duan, Wen, and Cai's 2022 impact-feedback study found hit stop, sound coherence, and camera control were especially influential in stronger action-game impact feel.
- Pichlmair and Johansen's game-feel survey provides a reusable framing for this catalog: physicality, amplification, and support. That helps keep impact review grounded in contact truth, readable reinforcement, and player-intent support instead of `more juice = better`.
- Zhou and Forbes reinforce the same practical angle: many effects help players reason about the game world, not just decorate it.
- Current Microsoft accessibility guidance also supports treating haptics and cue layering as reinforcement channels rather than single points of failure.

## Commands

Print reusable checklist and observation schema:

```powershell
bun.cmd .agents/skills/impact-feel-audit/scripts/impact_feel_audit.ts --template
```

Turn a small observation JSON file into a markdown audit scaffold and append the durable learning to local skill memory:

```powershell
bun.cmd .agents/skills/impact-feel-audit/scripts/impact_feel_audit.ts `
  --observations ".local/impact-feel-notes.json"
```

Write scaffold directly to a game-local note:

```powershell
bun.cmd .agents/skills/impact-feel-audit/scripts/impact_feel_audit.ts `
  --observations ".local/impact-feel-notes.json" `
  --out "some-game/impact-feel-audit.md"
```

Saved learnings accumulate in:

```text
./.agents/skills/impact-feel-audit/LEARNINGS.md
```

## Observation Shape

Use a tiny JSON note with only what the pass actually observed.

```json
{
  "game": "some-game",
  "sessionDate": "2026-04-29",
  "contacts": [
    {
      "event": "basic punch on grunt",
      "intensity": "light",
      "hitReadable": true,
      "forceReadable": true,
      "scenePreserved": true,
      "audioCoherent": true,
      "hitStop": "subtle",
      "cameraSupport": "none",
      "notes": "small pop confirms contact without freezing movement"
    },
    {
      "event": "charged slam on armored target",
      "intensity": "heavy",
      "hitReadable": true,
      "forceReadable": false,
      "scenePreserved": false,
      "audioCoherent": true,
      "hitStop": "weak",
      "cameraSupport": "heavy",
      "notes": "full-screen shake hides follow-up lane so big hit feels loud but not trustworthy"
    }
  ],
  "channelSupport": {
    "criticalInfoMultiChannel": true,
    "hapticsUsed": true,
    "hapticsConfigurable": true,
    "hapticsCarryCriticalInfoAlone": false
  },
  "evidence": {
    "mode": "direct-play",
    "sampledEncounters": 3,
    "sampledContacts": 9,
    "sampledHeavyContacts": 2,
    "notes": [
      "compared light jab, launcher, and charged slam",
      "rechecked same slam during busier enemy wave"
    ]
  },
  "strengths": [
    "light hits confirm contact without covering enemy silhouette"
  ],
  "frictions": [
    "heavy slam adds shake and flash but hides recovery window"
  ]
}
```

## Heuristic Lens

- Good impact first answers `did contact happen`.
- Good heavy-hit payoff creates readable hierarchy instead of maxing every effect layer on every strike.
- Good channel layering gives each layer a job: one confirms contact, one sells force, one preserves the next decision.
- Good impact review treats screen shake, flash, and hit stop as tools with costs, not free upgrades.
- Good audit outputs keep evidence and severity coupled so repeated passes stay comparable across different games.

## Output Shape

- `Findings`: blocker first, then major, then minor.
- `Evidence Snapshot`: how much direct evidence the pass actually sampled.
- `Impact Stack`: compact per-contact review of contact truth, force hierarchy, and post-hit readability.
- `Evidence-Backed Next Steps`: only steps supported by logged impact failures.
- `Durable Learning`: one concise line worth carrying into catalog-wide taste memory and saving in `./.agents/skills/impact-feel-audit/LEARNINGS.md`.

## Sources

- Lin, Duan, Wen, Cai. `What Features Influence Impact Feel? A Study of Impact Feedback in Action Games.` <https://arxiv.org/abs/2208.06155>
- Pichlmair, Johansen. `Designing Game Feel. A Survey.` <https://arxiv.org/abs/2011.09201>
- Zhou, Forbes. `Data Feel: Exploring Visual Effects in Video Games to Support Sensemaking Tasks.` <https://arxiv.org/abs/2210.03800>
- Microsoft Learn. `Xbox Accessibility Guideline 103: Additional channels for visual and audio cues.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/103>
- Microsoft Learn. `Xbox Accessibility Guideline 110: Haptic feedback.` <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/110>
