# FF Turn Engine

FF Turn Engine is a browser-playable active-time battle about waiting on gauges, choosing commands quickly, and breaking the enemy line before the party collapses.

## Concept

- Menu-driven ATB combat
- Command selection with simple enemy AI
- Clear win and lose states
- Fast restart loop for repeated runs

## Controls

- `Arrow Up` and `Arrow Down` move through commands
- `Arrow Left` and `Arrow Right` change target
- `Enter` confirms
- `Escape` cancels
- `R` restarts

## Notes

- Open [index.html](./index.html) in a browser to play.
- Direct browser smoke on 2026-04-30 confirmed menu start, ATB flow, and result states are currently working, so older repo-local reports that the entry does not start appear stale.
- Result and HUD screens now toggle the same visible state, so the defeat or victory view actually appears after a battle ends.
- Combatants now carry inline name, HP, ATB, and selection cards on the battle lane so command confirms and target swaps read from the play space instead of only from the top HUD.

## Learnings

- ATB shells feel broken fast when charging, ready, selected target, and current HP live in separate places; putting those reads on each combatant is the cheapest clarity pass.
- Stored May 6 review confusion was not only about screen state. The commands also lacked visible philosophy, so `Attack`, `Skill`, `Guard`, and `Item` now publish concrete tradeoffs in the live command panel and no longer collapse into the same choice with different numbers.
- Fresh May 6 follow-up treated the old `not playable` report as stale but kept the `confusing` residue real: enemy turns now publish a compact `ENEMY NEXT` panel plus stronger imminent-hit banner copy, so target priority and incoming damage read before the strike lands instead of only after the log updates.
- Another cheap ATB truth pass landed on May 6: enemy cards and the intent rail now name each foe's role and targeting habit, and the AI actually follows those rules, so `Imp`, `Drone`, and `Warden` read as different pressure problems before their gauges fill.

## Next Todo

- Recheck with fresh feedback whether explicit role tells are enough, or if the next cheap win is stronger hit timing telegraph on the exact ready frame so queued player actions and enemy interrupts never feel simultaneous by surprise.
