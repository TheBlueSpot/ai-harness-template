# Age Evolution Playtest Evidence

## 2026-04-30 Kojima Patrol

- Direct browser boot worked from the catalog host with no console or page errors.
- First-run onboarding stayed simple: overlay explained the three-front siege, `Space` started the run, and `1-3` plus `Q/W/E` was enough to create pressure in all lanes without opening another panel.
- The opening loop exposed stacked choices quickly. Lane select, roster pick, tribute gain, and tech timing all showed up in the first few seconds instead of hiding behind a long warm-up.
- Current follow-up question for a later feel pass: starting gold already allows an immediate `F` tech jump into Bronze, so the opening choice may be "stabilize first" versus "skip ahead now." That is interesting, but it should be checked against real run tension before changing costs.
- Durable local learning: in multi-lane siege games, enemy pressure reads better when attacks land as short combined-arms waves with reset windows; constant single-unit spam hides roster variety and makes pacing feel faster and flatter than it really is.
- Fresh local smoke proof for this patrol lives under `./.local-age-evolution-title-2026-04-30c.png` and `./.local-age-evolution-run-2026-04-30c.png`.

## 2026-04-30 Kojima Follow-Up

- Player review pointed at the right weakness: the enemy read flatter than the roster because pressure often arrived as same-lane, same-shape spam.
- Local improvement pass changed the AI director to stage slower act-one waves, weighted mixed-role formations, and occasional later-act off-lane harass so escalation comes from clearer war beats instead of raw early flood.
- Durable local learning: in lane-war browser games, variety only feels real when pacing and composition change together. New unit names without reset windows or formation shifts still read like spam.
- Fresh verification after the fix: a 3.5 second live run reached `{\"state\":\"playing\",\"runTime\":3.5,\"units\":1,\"enemyPlan\":2}` and a 9 second idle sample reached `{\"enemyUnits\":4,\"enemySlots\":[1,0,2,2],\"laneCounts\":[1,3,0]}`, which is enough to show moderated opening pressure plus mixed slot usage instead of an immediate flood.
- Fresh local smoke proof for this follow-up lives under `./.local-age-evolution-title-fixed-2026-04-30.png` and `./.local-age-evolution-verify-2026-04-30e.png`.
