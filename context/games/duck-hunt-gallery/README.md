# Duck Hunt Gallery

Browser-playable marsh shooting gallery about crossing flocks, clip pressure, and short nine-set campaign runs.

Open [index.html](./index.html) in a browser to play locally.

## Controls

- `Mouse`: aim
- `Click` or `Space`: fire, start, or advance
- `Enter`: start or retry
- `R`: retry from result cards

## Core Loop

- Clear each timed marsh set by meeting its hit quota before the clock or shells run out.
- Manage a three-shell clip plus reserve ammo while flock patterns shift from calm dawn sweeps to mixed night crossings.
- Golden pintails add shell caches, and night barons need two hits, so target priority matters more than raw fire rate.
- Clean clears bank reserve shells into the next set, which rewards accurate shooting without changing the base loop.

## Learnings

- Fresh May 6 browser re-open kept the ask bounded to one more atmosphere pass, not new rules: stage-5-and-up music now picks up a light canopy counterline, crossing entries get a tighter flyby chirp, shot and splash beats leave short smoke plumes, and the post pass adds moving water caustics plus a soft solar flare so the marsh feels busier without hiding birds or edge markers.
- The smoke pass also exposed one small truth gap inside the earlier positional-audio work: miss stings were still collapsing to center even when the shot lane lived on the edge. Routing the whiff cue through the real crosshair pan keeps left and right panic misses attached to their lane.
- Fresh May 6 direct browser smoke from `./duck-hunt-gallery/index.html` stayed clean after the latest patch: menu -> briefing -> play and a forced stage-9 pressure setup both ran in headless Edge with 0 page or console errors, with fresh `2026-05-06-polish-pass-*` artifacts saved in `./.local-duck-hunt-playpass/`.
- Fresh May 6 live stage-9 pressure recheck finally produced the missing busy-frame evidence instead of another calm screenshot: crossed late flocks were already readable, but their arrival still felt too center-heavy. Cross spawns and rare entries now carry a short directional flyby layer plus a restrained edge-wake post pass, so incoming side pressure reads from motion and sound before the flock fully occupies the lane.
- Fresh May 6 follow-up found one last cheap flatness gap in the polished build: the mix bed and impact stack were richer than before, but every shot, spawn, cache, and splash still landed from the same center point. Giving moment-to-moment SFX light stereo placement plus a small delayed tail makes left-edge rushes, right-edge cleanups, and offscreen entries feel anchored to the marsh instead of the HUD.
- The remaining post-processing lift was scene depth, not more particles. A soft horizon glow, angled sun shaft, and impact-ring bloom add atmosphere and hit punctuation without hiding birds, edge markers, or the crosshair.
- One quiet trust bug sat in the reload widget, not the weapon rules: if the player burned the clip near the screen edge, the progress bar could spill off-canvas. Clamping it back inside the playfield keeps reload readback visible during panic edge shots.
- Fresh May 6 browser re-open on direct `./duck-hunt-gallery/index.html` showed the remaining cheap polish gap was field atmosphere, not rules or HUD: early and late sets could feel visually still between crossings, so the live marsh now carries subtle stage-aware motes plus water shimmer that thicken scene motion without competing with birds, edge markers, or the crosshair.
- Fresh May 6 polish follow-up stayed on the same 5-star `needs bgm, and polish` ask without redesigning the hunt: shots, hits, rare spawns, and chapter-end beats now land with denser transient layers, upward spray bursts, and a brief combo-pulse treatment that adds feel without covering live lanes.
- The cheap local bug during this pass was in the marsh-radio slab, not the flock logic: longer stage callouts could overrun the single-line toast body, so the message band now wraps its main copy and keeps quota or reload readback anchored underneath instead of clipping polish into HUD debt.
- Fresh May 6 boot smoke exercised the shipped single-file runtime through script parse, `startRun()`, `startStage(0)`, and a forced reload completion under stubbed DOM/canvas APIs, so the latest feel pass did not break local boot or weapon-state recovery.
- Fresh May 6 baseline stayed aligned with the live 5-star review row: the remaining ask was still `needs bgm, and polish`, so this pass stayed on audio punctuation, FX clarity, and truthful readback instead of adding new systems.
- Fresh May 6 direct-file browser smoke still showed the single-file build booting cleanly after the latest polish pass, including menu -> briefing -> play -> lose -> retry -> play verification from one bounded headless session.
- Late mixed crossings did not need more HUD; they needed offscreen pressure markers that survive overlap. Spacing stacked edge markers and giving special birds distinct silhouettes improved threat read without adding text clutter.
- The remaining cheap presentation lift was scene punctuation, not more rules. Roomier cutscene cards plus stronger transition sweeps made briefing and retry surfaces feel more deliberate without touching the hunt loop.
- Fresh May 6 follow-up stayed on the same 5-star review ask: the intro, briefing, win, and lose cards now carry a dedicated story strip that calls out route, quota, and threat context at a glance, so the cutscene layer reads more like a deliberate chapter break than one static text slab.
- One quiet polish bug lived in the victory stats, not the combat loop: the win card was labeling total run attempts as clears. Tracking real clears separately keeps the end-card ledger truthful after failed restarts.
- The next readable polish lift came from transient cues, not thicker permanent HUD. Severity-tinted radio toasts and short edge-entry pings keep reload, miss, and incoming-lane information legible near the moment it matters.
- Added audio only helps if the player can shed it instantly. A simple `M` mute toggle is enough to keep the richer spawn and scene punctuation from turning into forced noise during repeat retry loops.
- Fresh May 6 reload-follow-through smoke found the next cheap feel lift in weapon trust, not birds or cutscenes: reload start already spoke up, but clip refill could land with stale `Reloading.` text and too little visual punctuation once the gun was actually live again.
- The bounded reload pass now gives clip refill its own completion chirp, shell-ready pulse, and truthful `Clip loaded.` readback, which makes the three-shell cadence feel more deliberate without adding a new control or slowing the retry loop.
- Fresh May 6 trust follow-up found one small honesty gap on the result flow: `Space` already advanced the cards and `R` was the expected fast retry muscle-memory, but the shipped prompts still taught `Enter` only and stale warning tint could leak into fresh stage radio copy.
- The bounded result-card pass now tells the truth about `Space` and `R`, restores info/warning/success tint on each new message, and adds a short play-entry sting plus pulse so the jump from card to live hunt feels acknowledged instead of quietly dropping straight into motion.
- Fresh May 6 audio-and-impact follow-up kept the same 5-star scope but finally pushed the mix bed forward: the BGM now carries a steadier low undertow, shots and hits pick up extra transient layers, round open/clear/fail moments throw fuller flash-plus-particle punctuation, and the ripple renderer now honors real water/special colors instead of collapsing most custom rings to the orange fallback.
- Fresh May 6 direct-browser follow-up stayed game-local and reused the same helper stack instead of layering new systems: flock entries now throw short side spray-plus-ring punctuation, rare offscreen birds carry a brighter inward tether, and the live marsh-radio footer now reports shells, reload progress, or combo state instead of inert `Clear bonus 0` filler.
- This gallery keeps getting better through clearer feedback hierarchy rather than new rules once shot, hit, and retry cadence already feel solid.

## Todo

- Run one audible late-stage browser pass and confirm the new canopy counterline plus crossing flyby chirp read as support instead of mix clutter once both margins light up together.
- Capture one fresh live screenshot right after an edge miss or water ricochet and confirm the new smoke plumes still stay behind the crosshair and birds on smaller laptop-height windows.
- Re-review the new water-caustic and solar-flare pass during stage 8 or 9 and confirm it adds motion depth without washing out ace health bars, edge markers, or quota readback.
- Run one audible direct-browser stage-9 pass and confirm the new cross-spawn flyby sweep helps incoming-side read without making stacked left/right entries feel noisy.
- Run one audible late-stage browser pass and confirm the new positional shot, spawn, cache, and splash cues help lane read instead of pulling attention away from the crosshair during crossed flocks.
- Capture one fresh live screenshot with the reload bar near both lower corners and confirm the clamped widget still reads cleanly without covering birds or edge markers.
- Run one more live late-stage browser pass and confirm the new ambient motes plus shimmer stay supportive once barons, edge markers, and radio toasts all overlap.
- Run one audible live-browser pass and confirm the denser shot, hit, spawn, and combo layers still read as support instead of mix clutter once late crossings overlap.
- Capture one fresh long-radio screenshot during live play and confirm the wrapped toast body still leaves the footer readable on shorter laptop-height windows.
- Run one audible live-browser pass and confirm the reload-complete chirp stays supportive instead of noisy when panic reloads chain with miss, cache, and entry-ping cues.
- Re-review whether the new edge spray plus offscreen tether glow stay supportive instead of noisy once late crossed flocks and both margins light up together.
- Re-review stages 8 and 9 on smaller laptop-height windows and confirm the spaced edge-marker stack still reads cleanly when both sides light up at once.
- Re-review whether ace and golden marker variants stay glanceable without competing with live shot, hit, cache, and reload-ready pulses near the playfield edge.
- Re-review the taller cutscene card on shorter laptop-height windows and confirm the new story strip plus prompt bar still breathe without crowding the lower edge.
- Run one audible live-browser pass and confirm the new scene-transition wash still helps menu, briefing, win, and lose cards without over-ducking active-play music.
- Run one audible live-browser pass and confirm the new play-entry sting plus stage pulse feel supportive across repeated retries instead of reading like one more false start cue.
- Run one audible live-browser pass and confirm the fuller undertow plus added shot/hit layers stay supportive instead of turning late-stage crossings into mix clutter.

## Related Docs

- Evidence capture: [playtest-evidence.md](./playtest-evidence.md)
- Impact review: [impact-feel-audit.md](./impact-feel-audit.md)
- Cue redundancy smoke: [cue-redundancy-smoke.md](./cue-redundancy-smoke.md)
