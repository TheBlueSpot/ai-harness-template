# Worms Artillery Duel

Worms Artillery Duel is a browser-playable one-on-one artillery match built around wind, splash damage, and deformable hills. Each round is short, readable, and self-contained inside this folder.

## Play Loop

- Trade shots across a generated ridge line
- Adjust aim and power as wind shifts every turn
- Use craters to open new lines or trap movement
- Finish the rival worm before your own hull gives out

## Controls

- `A` and `D` move on your turn
- `Arrow Up` and `Arrow Down` change angle
- `Arrow Left` and `Arrow Right` change power
- `Space` fires
- `R` restarts

## Notes

- Open `worms-artillery-duel/index.html` in a browser to play
- The entry is isolated and does not depend on shared runtime changes
- Recent sweep: enemy aim now tracks shots more tightly and direct hits land harder, so the duel reaches a decision faster.

## Sweep Learnings

- Review-selected pass stayed local to `worms-artillery-duel/`: the clearest high-leverage complaint was `aiming needs to be more prominent`, so the active worm now projects a live shell arc with a landing marker on the playfield instead of forcing the player to infer the shot from angle and power text alone.
- The same pass nudged blast damage upward so clean hits convert into faster round resolution without changing movement, wind, or terrain-deformation rules.

## Next Todos

- Re-review whether the new landing ring stays readable once craters stack and the enemy stands near the impact point. If it starts to blend into late-turn terrain, prefer stronger contrast before adding more HUD text.
