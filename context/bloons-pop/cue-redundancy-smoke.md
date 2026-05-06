# bloons-pop Cue Redundancy Smoke

Session: 2026-05-06

## Findings

- `minor` no blocker-grade cue redundancy breakdown was logged in the supplied sample. Evidence: critical cues sampled 1; busy frames sampled 1.

## Smoke Verdict

- Text-only cue risk: pass. Evidence: critical cues 1; text-only critical cues 0; critical cues with channel logs 1; critical cues marked non-redundant while using text 0. Ceiling: Observed cue-channel risk only. This lane can flag text-only dependence, not the full wording or reading-load quality of the text itself.
- Sound-only cue risk: pass. Evidence: audio-only critical cues 0; channel-level audio-only risk no; mute still playable yes. Ceiling: Observed sound-channel risk only. A pass here means the sampled cues had non-audio support, not that every cue in the game was checked.
- Color-only cue risk: pass. Evidence: color-only critical cues 0; channel-level color-only risk no; non-color backup yes. Ceiling: Observed color-fallback risk only. A pass still needs later pressure sampling if busy-frame overlap changes the read.
- Edge-only cue risk: pass. Evidence: critical cues away from action 0/1; important temporary prompts away from action and not reviewable later 0; stressed overlap or masking logged yes. Ceiling: Observed placement risk only. This lane flags cues that live away from focal action or only on edge prompts, not every layout nuance.

## Evidence Snapshot

- Evidence mode: direct-play.
- Runs sampled: 3.
- Busy frames sampled: 1.
- Evidence note: Fresh headless Chromium pass on 2026-05-06 via http://localhost:2999/bloons-pop/ at 1365x768 and 390x844.
- Evidence note: Observed opener friction before the fix: a natural first click near the Orchard entrance returned 'Too close to track' even though the grass patch looked like a valid first build pocket.
- Evidence note: After the fix, menu and quiet-window states surfaced visible starter pads plus matching copy, and clicking the Orchard Start pad spent cash and selected a placed tower cleanly.
- Evidence note: Fail-retry smoke still preserved the breach overlay, Enter retry, and persisted 3x speed state.
- Evidence note: Console errors observed during smoke: 0.

## Cue Detail

- starter pad marker: channels=visual, text; redundant=yes; near action=yes; color-only=no; audio-only=no.

## Onboarding HUD Telegraph Handoff

- This smoke is strong enough to feed later onboarding, HUD, or telegraph prioritization without reopening the whole observation first.

## Strengths

- starter pads make the first valid tower pocket obvious before the first click
- live hint repeats the starter cue only until the first tower is placed
- breach retry still returns immediately with the same opener guidance

## Frictions

- full Controls section still lives below fold at both sampled viewports, though the critical opener verbs now stay on the board

## Next Steps

- Use this as a smoke verdict only and deepen with telegraph, HUD, or onboarding review if later evidence turns muddy.

