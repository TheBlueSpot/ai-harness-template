# Low-Rated Game Design Observations

This note distills repeated weaknesses from the current `3/5 and below` set:

`1/5`:
[defender-citadel-rescue](../games/defender-citadel-rescue/README.md),
[excitebike-trackflow](../games/excitebike-trackflow/README.md),
[ff-turn-engine](../games/ff-turn-engine/README.md),
[lemmings-shift](../games/lemmings-shift/README.md),
[lode-runner-burrow](../games/lode-runner-burrow/README.md),
[metroid-bio](../games/metroid-bio/README.md),
[pang-skyburst](../games/pang-skyburst/README.md),
[pikmin-swarm](../games/pikmin-swarm/README.md),
[qwop-inverse](../games/qwop-inverse/README.md),
[qwop-ragdoll](../games/qwop-ragdoll/README.md),
[rampage-city-smash](../games/rampage-city-smash/README.md),
[road-rash-breakaway](../games/road-rash-breakaway/README.md),
[simtower-elevator-ops](../games/simtower-elevator-ops/README.md),
[sonic-loops](../games/sonic-loops/README.md),
[stand-breach](../games/stand-breach/README.md),
[star-fox-poly](../games/star-fox-poly/README.md),
[storm-defense](../games/storm-defense/README.md),
[sword-souls-train](../games/sword-souls-train/README.md), and
[thps-combo-lines](../games/thps-combo-lines/README.md).

`2/5`:
[battle-city-ricochet](../games/battle-city-ricochet/README.md),
[castle-spectral](../games/castle-spectral/README.md),
[dk-barrel-blast](../games/dk-barrel-blast/README.md),
[dr-mario-capsule](../games/dr-mario-capsule/README.md),
[epic-war](../games/epic-war/README.md),
[gradius-option](../games/gradius-option/README.md),
[guitar-neo](../games/guitar-neo/README.md),
[hardest-game](../games/hardest-game/README.md),
[hobo-brawler](../games/hobo-brawler/README.md),
[insaniquarium-tide](../games/insaniquarium-tide/README.md),
[katamari-clump](../games/katamari-clump/README.md),
[lunar-thrust-rescue](../games/lunar-thrust-rescue/README.md),
[mario-game](../games/mario-game/README.md),
[meat-liquid](../games/meat-liquid/README.md),
[mega-robot](../games/mega-robot/README.md),
[mini-golf-windmill](../games/mini-golf-windmill/README.md),
[pac-ghost-ai](../games/pac-ghost-ai/README.md),
[pinball-reactor](../games/pinball-reactor/README.md),
[rebuild-sim](../games/rebuild-sim/README.md),
[skifree-avalanche](../games/skifree-avalanche/README.md),
[spelunky-pocket-ruins](../games/spelunky-pocket-ruins/README.md),
[street-combat](../games/street-combat/README.md),
[typing-zombie-siege](../games/typing-zombie-siege/README.md), and
[worms-artillery-duel](../games/worms-artillery-duel/README.md).

`3/5`:
[advance-wars-skirmish](../games/advance-wars-skirmish/README.md),
[bomberman-fuse](../games/bomberman-fuse/README.md),
[boulder-dash-cavern](../games/boulder-dash-cavern/README.md),
[braid-time-echo](../games/braid-time-echo/README.md),
[breakout](../games/breakout/README.md),
[castle-siege-toss](../games/castle-siege-toss/README.md),
[chips-circuit](../games/chips-circuit/README.md),
[contra-boss](../games/contra-boss/README.md),
[crazy-climber-rush](../games/crazy-climber-rush/README.md),
[diner-dash-rush](../games/diner-dash-rush/README.md),
[golden-axe-engine](../games/golden-axe-engine/README.md),
[hexcells-logic](../games/hexcells-logic/README.md),
[jam-hoops-turbo](../games/jam-hoops-turbo/README.md),
[motherload-abyss](../games/motherload-abyss/README.md),
[osmos-drift](../games/osmos-drift/README.md),
[pac-shadows](../games/pac-shadows/README.md),
[pants-vector](../games/pants-vector/README.md),
[portal-engine](../games/portal-engine/README.md),
[puyo-chain-reactor](../games/puyo-chain-reactor/README.md),
[rampart-rubble](../games/rampart-rubble/README.md),
[skylord-defender](../games/skylord-defender/README.md),
[string-theory](../games/string-theory/README.md), and
[zuma-sunburst](../games/zuma-sunburst/README.md).

The shared pattern is not "bad ideas." A surprising number of low-rated entries already have a strong fantasy, a neat rendering hook, or one promising mechanic. They score poorly when trust breaks before the fantasy can land: the game may not boot, the first action may lie, the controls may fight the player, the HUD may hide the point, or the run may collapse before the player understands why it exists.

## 1. First-input trust is the floor, not polish

- The lowest ratings cluster around browser-entry failure and false start states. If `Start` looks dead, the game is effectively already lost. That shows up in [excitebike-trackflow](../games/excitebike-trackflow/README.md), [metroid-bio](../games/metroid-bio/README.md), [defender-citadel-rescue](../games/defender-citadel-rescue/README.md), [sword-souls-train](../games/sword-souls-train/README.md), and [storm-defense](../games/storm-defense/README.md).
- Overlay honesty matters almost as much as booting. [pang-skyburst](../games/pang-skyburst/README.md), [pikmin-swarm](../games/pikmin-swarm/README.md), [rampage-city-smash](../games/rampage-city-smash/README.md), and [star-fox-poly](../games/star-fox-poly/README.md) all had some version of `the menu is still here` or `the menu owns the first read`.
- A game does not get credit for its deeper systems until the very first click, key, or touch proves the shell is telling the truth. Many of these entries lost all goodwill before active play even began.

## 2. A cool premise still fails if the player cannot name the next action

- Low-rated games repeatedly ask the player to parse too much too early. [rebuild-sim](../games/rebuild-sim/README.md) reads as large strategy possibility without one immediate mission. [epic-war](../games/epic-war/README.md) reads as a lot of battlefield state without one obvious first move. [advance-wars-skirmish](../games/advance-wars-skirmish/README.md) and [simtower-elevator-ops](../games/simtower-elevator-ops/README.md) both show how tactics or management can become unreadable when the first turn asks for system comprehension instead of one concrete job.
- The recurring complaint is not only `confusing`; it is `confusing before I care`. [insaniquarium-tide](../games/insaniquarium-tide/README.md), [guitar-neo](../games/guitar-neo/README.md), [stand-breach](../games/stand-breach/README.md), and [lode-runner-burrow](../games/lode-runner-burrow/README.md) all had promising genre hooks, but the player could not quickly answer `what do I do now?`
- Low scores often mean the design did not establish one reachable next goal in the playfield. A strategy game can be complex later. A rhythm game can be demanding later. A survival game can become layered later. The first minute still needs one visible next task.

## 3. Controls do not get to be "close enough"

- The low set is full of control dishonesty: [katamari-clump](../games/katamari-clump/README.md) had reversed movement, [dr-mario-capsule](../games/dr-mario-capsule/README.md) had rotation trust problems, [typing-zombie-siege](../games/typing-zombie-siege/README.md) let a valid letter also trigger reset, and [battle-city-ricochet](../games/battle-city-ricochet/README.md) could spawn the player into a blocked opening state.
- Some entries fail because the verbs are unclear, not absent. [street-combat](../games/street-combat/README.md) has frame-data ambition, but if one move has no readable startup or cooldown the entire move set collapses into one dominant exploit. [worms-artillery-duel](../games/worms-artillery-duel/README.md) had decent physics, yet aiming was not prominent enough to make the artillery fantasy feel satisfying.
- Input trust is binary from the player's point of view. If one key means the wrong thing, if one move dominates the game, or if the expected interaction never happens, the player stops exploring the system honestly.

## 4. Physics, collision, and camera quality decide whether motion genres live or die

- The biggest design split between high-rated and low-rated action games is not theme. It is motion trust. [sonic-loops](../games/sonic-loops/README.md), [qwop-inverse](../games/qwop-inverse/README.md), [qwop-ragdoll](../games/qwop-ragdoll/README.md), [spelunky-pocket-ruins](../games/spelunky-pocket-ruins/README.md), [pants-vector](../games/pants-vector/README.md), [mega-robot](../games/mega-robot/README.md), and [thps-combo-lines](../games/thps-combo-lines/README.md) were all judged through collision, carry, landing, wall interaction, or camera follow before anything else.
- Motion-heavy games fail fast when consequence feels arbitrary. `Jumped but did not clear`, `touched the wall and clipped through`, `landed cleanly but the game dropped the trick`, `hit the enemy but the ring logic feels wrong`, `road perspective makes speed unreadable` all destroy the fantasy underneath.
- This repo's low-rated motion games show a consistent rule: if the genre promise is speed, weight, swing, arc, balance, traction, or drift, the simulation has to preserve player intent first. Decorative rendering or added content cannot compensate for broken state transitions.

## 5. Difficulty is often wrong in sequence, not only in magnitude

- Several games are not simply too hard or too easy. They are hard or easy at the wrong time. [hobo-brawler](../games/hobo-brawler/README.md), [diner-dash-rush](../games/diner-dash-rush/README.md), [star-fox-poly](../games/star-fox-poly/README.md), and [advance-wars-skirmish](../games/advance-wars-skirmish/README.md) front-load more speed or pressure than the loop can teach.
- Others deflate their own premise. [hardest-game](../games/hardest-game/README.md), [boulder-dash-cavern](../games/boulder-dash-cavern/README.md), and [string-theory](../games/string-theory/README.md) lose value because the pressure never catches up to the fantasy being advertised.
- The low set also contains several examples of runs that end before the mechanic stack matures. [simtower-elevator-ops](../games/simtower-elevator-ops/README.md) reportedly let the player win without doing much. [crazy-climber-rush](../games/crazy-climber-rush/README.md) and [golden-axe-engine](../games/golden-axe-engine/README.md) were called too short. [bomberman-fuse](../games/bomberman-fuse/README.md) and [portal-engine](../games/portal-engine/README.md) show the same general issue at `3/5`: the base is workable, but the run stops before variety or authored escalation makes it memorable.
- Difficulty tuning works best here when it teaches, then compresses. A low-rated game often does one of the opposite things: it overwhelms before it teaches, or it teaches and never escalates.

## 6. HUD and guidance fail in two opposite ways: too much or not enough

- [rebuild-sim](../games/rebuild-sim/README.md) and [epic-war](../games/epic-war/README.md) show the `too much` failure mode. The HUD becomes scan tax. The player sees menus, clicks, labels, and commands before understanding why any of them matter.
- [guitar-neo](../games/guitar-neo/README.md), [mini-golf-windmill](../games/mini-golf-windmill/README.md), [worms-artillery-duel](../games/worms-artillery-duel/README.md), and [breakout](../games/breakout/README.md) show the `not enough at the decision point` failure mode. A rhythm lane, a shot arrow, a visible arc, or cleaner action-state readback would answer the live question faster than more chrome.
- [castle-spectral](../games/castle-spectral/README.md) is a useful middle case. Even at `2/5`, its notes show repeated HUD and routing work because route clarity in dark platform spaces is hard. The lesson is not `add more text`. The lesson is `put the right cue at the right place, then stop`.
- The strongest guidance in this repo stays local to the decision: near the ledge, near the shot path, near the lane, near the active objective. Low-rated games often force the player to translate from detached panels or from a cluttered top bar.

## 7. Rendering quality matters only when it improves readability

- Some low-rated games already have positive visual reactions: [star-fox-poly](../games/star-fox-poly/README.md), [insaniquarium-tide](../games/insaniquarium-tide/README.md), [meat-liquid](../games/meat-liquid/README.md), [hexcells-logic](../games/hexcells-logic/README.md), [motherload-abyss](../games/motherload-abyss/README.md), and [string-theory](../games/string-theory/README.md) all got some version of `looks cool`.
- But visual appeal does not offset unreadability. [pac-shadows](../games/pac-shadows/README.md) was too dark around immediate danger. [gradius-option](../games/gradius-option/README.md) needed larger bullets. [jam-hoops-turbo](../games/jam-hoops-turbo/README.md) lost trust because the shot arc perspective did not sell the ball's path. [road-rash-breakaway](../games/road-rash-breakaway/README.md) was judged through perspective discomfort before race structure.
- Low-rated rendering problems usually come from one of three sources: the important thing is too small, too dark, or visually mislabeled. The fix is rarely `more effects`. It is usually `make the state read sooner and more truthfully`.

## 8. Post-processing is a multiplier, not a rescue plan

- Players occasionally asked for more particles, post, or polish in games like [chips-circuit](../games/chips-circuit/README.md), [portal-engine](../games/portal-engine/README.md), [pinball-reactor](../games/pinball-reactor/README.md), and [osmos-drift](../games/osmos-drift/README.md). Those asks mostly appear at `3/5`, not `1/5`.
- That pattern matters. Post-processing only becomes meaningful after the shell, verbs, and routing reads are already trustworthy. [bomberman-fuse](../games/bomberman-fuse/README.md) getting praise for clean particles while still needing more authored variety is a good example. [pinball-reactor](../games/pinball-reactor/README.md) getting called out for score overload and weak graphics shows that spectacle without strong table read does not help.
- In this repo, low-rated games do benefit from bloom, particles, and stronger visual atmosphere once the loop works. They do not climb out of a broken state with post alone.

## 9. Performance is gameplay quality

- [meat-liquid](../games/meat-liquid/README.md) and [motherload-abyss](../games/motherload-abyss/README.md) show the most obvious version: if FPS collapses, the game no longer owns its intended feel. A precision platformer and a drilling survival game both become harder to trust when frame time spikes.
- Performance bugs also rewrite design perception. The player may report `too easy`, `too hard`, `weird movement`, or `bad camera` when the deeper cause is that the game is no longer rendering the intended feedback budget consistently.
- The low set reinforces a hard rule: if a genre depends on timing, momentum, or peripheral read, performance debt is not secondary debt.

## 10. Audio, music, and assets help quality jumps, but only after the loop is honest

- The review set contains a direct compliment here: [skylord-defender](../games/skylord-defender/README.md) was praised because sound effects made the game feel higher quality. [chips-circuit](../games/chips-circuit/README.md) was explicitly asked to add more SFX and post once the puzzle base existed.
- Some low-rated entries already have solid asset or music intentions. [guitar-neo](../games/guitar-neo/README.md) uses local audio assets. [pac-shadows](../games/pac-shadows/README.md) supports sound-driven mood. [mario-game](../games/mario-game/README.md) shows that theming matters because a mechanically functional game can still feel generic if the fantasy readback is missing.
- The common lesson is that assets and music should reinforce state, genre identity, and payoff. They cannot create loop clarity on their own, but once the loop is readable they can move a game upward fast.

## 11. Content and progression need authored change, not just more minutes

- [bomberman-fuse](../games/bomberman-fuse/README.md), [portal-engine](../games/portal-engine/README.md), [worms-artillery-duel](../games/worms-artillery-duel/README.md), [puyo-chain-reactor](../games/puyo-chain-reactor/README.md), [zuma-sunburst](../games/zuma-sunburst/README.md), and [string-theory](../games/string-theory/README.md) all point at the same design truth: a working loop still scores low if each minute feels like the same minute.
- The better requests in these reviews are not `add systems for their own sake`. They are `more levels`, `more interactables`, `more objectives`, `powerups`, `procedural variation where genre expects it`, or `a stronger theme`. Players are asking for authored shifts that make the next decision feel different.
- The low set suggests a good threshold rule: do not widen progression until the base verb is trustworthy, but once the base verb is trustworthy, the absence of authored variation becomes the next major rating cap.

## 12. Forgiveness and catch-up tools are part of feel, not softness

- [mini-golf-windmill](../games/mini-golf-windmill/README.md) asks for the cup to be more generous when the shot is close. [braid-time-echo](../games/braid-time-echo/README.md) was called unforgiving at one spike sequence. [zuma-sunburst](../games/zuma-sunburst/README.md) was criticized because once the chain got ahead it felt impossible to recover. [lunar-thrust-rescue](../games/lunar-thrust-rescue/README.md) improved simply by loosening gravity, thrust, and fuel budget.
- These are not requests to remove challenge. They are requests to preserve player intent and keep failure inside a learnable loop.
- A low-rated game often punishes correctly aimed, correctly understood, or nearly correct actions too harshly. Small forgiveness windows, catch-up tools, or clearer recovery beats often unlock far more quality than broader content work.

## 13. The low set still shows what is worth saving

- Many of these games are one or two trust layers away from working: [portal-engine](../games/portal-engine/README.md) is already called competent, [bomberman-fuse](../games/bomberman-fuse/README.md) has clean visuals, [worms-artillery-duel](../games/worms-artillery-duel/README.md) has good physics bones, [jam-hoops-turbo](../games/jam-hoops-turbo/README.md) has a strong concept, [rebuild-sim](../games/rebuild-sim/README.md) and [insaniquarium-tide](../games/insaniquarium-tide/README.md) both have interesting management fantasies, and [meat-liquid](../games/meat-liquid/README.md) has attractive presentation.
- That makes the main negative conclusion sharper: low ratings here usually come from broken trust ordering, not from lack of imagination.
- The best rescue path is usually:
  1. Make the game boot and make the first input truthful.
  2. Make one next goal visible in-world or in a tiny honest HUD.
  3. Fix control, collision, camera, and restart trust.
  4. Tune pace so the mechanic teaches before it escalates.
  5. Only then spend effort on more content, stronger theming, richer post, and more spectacle.

## Durable takeaways

- A broken start screen can erase every deeper strength in the game.
- The first minute must answer `what do I do now?` without making the player parse the whole ruleset.
- Controls, collision, camera, and timing define quality faster than art direction in action-heavy genres.
- HUDs fail both when they intimidate and when they hide the one live decision.
- Rendering and post should clarify danger, route, aim, and objective before they try to impress.
- Performance, restart speed, and small forgiveness windows are core game feel, not optional polish.
- Many low-rated games already have a good hook. They mostly need trust repaired in the right order.

That is the clearest repeated story across the current `3/5 and below` set.
