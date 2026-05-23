# Advance Wars Skirmish

Browser tactics sketch for direct play from this folder.

## Premise

Push a compact grid front, hold your HQ, and capture the enemy HQ before their pressure wins the map.

## Controls

- Arrow keys or mouse to move the cursor.
- `Enter` to confirm.
- `Esc` to clear selection.
- `M` move, `A` attack, `C` capture, `E` end turn, `R` restart.

## Play

Open [index.html](./index.html) in a browser to play.

## Notes

- The shell stays self-contained and browser-ready.
- The live HUD stays edge-anchored so the board keeps priority.
- The opening turn keeps one obvious next move visible, which teaches move, capture, and frontline protection in sequence.

## Patrol Notes

- Keep the first capture reachable on turn one.
- Keep dense status details in edge panels instead of over the map.

## Sweep learnings

- Player feedback said the tactics loop felt too fast and unreadable. This pass moved the first capture into immediate reach and tightened the opening handoff so the first turn teaches one concrete job at a time instead of asking the player to infer the plan from a large HUD.
- Durable learning: small-grid tactics onboarding lands better when the first capture is reachable on turn one. A tactics opener should demonstrate move, capture, and frontline protection as immediate actions, not as promises for a later turn.
- Patrol note: no new blocker found in this cohort pass; the opener still reads as a compact browser-first tactics loop.
