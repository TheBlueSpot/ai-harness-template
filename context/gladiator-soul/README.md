# Gladiator Soul

Browser arena tactics game about training a gladiator, buying gear, and winning a single-bout championship loop.

Open [index.html](./index.html) in a browser to play.

## Play Loop

- Start from the menu and enter the arena when your build is ready.
- Spend gold in the marketplace for loadout upgrades.
- Use the training yard to push core stats before the next bout.
- Balance stamina, block timing, taunts, and heavy swings to finish the enemy before you gas out.

## Structure

- [./index.html](./index.html) boots the standalone browser entry.
- [./docs/assets.md](./docs/assets.md) keeps the shipped gladiator art provenance at a high level.

## Sweep learnings

- Training-yard guidance is now screen-aware instead of reusing the menu-wide next-spend headline, so the yard's lead card recommends the best drill on that screen and only points back to gear as the fallback comparison.
- Fresh May 2, 2026 feedback still exposed one decision-quality gap after the earlier stat copy pass: players could read what a stat meant in theory, but the shop and training screens still did not compare that choice against the current build or show what it changed in the arena.
- Marketplace cards now compare each item against the currently equipped slot and preview the resulting swing, jab, and power numbers so tradeoffs read before you spend gold.
- Training cards now preview the next-bout move sheet, and arena action buttons now spell out stamina cost plus expected effect so build philosophy stays visible during combat instead of only in menu text.
- Menu, market, and training now share a build-specific next-spend recommendation so the current fighter state points at one concrete buy-or-train choice instead of only showing isolated stat facts.
- Marketplace and training cards now also label each option as the current best next pick, same-route support, or a pivot, so `why buy this now` reads at scan speed instead of requiring players to infer it from stat deltas alone.
- Art framing now caps the hero and champion images so the menu and result screens stay balanced instead of letting portraits sprawl across the panel.
- The arena flow, loadout loop, and screen swaps stay unchanged; this pass only tightened the display scale for readability.
- The arena screen now carries a short turn reminder in the combat log area so the battle flow is easier to read at a glance.
- Market and training cards now show projected stat changes plus a short use-case note so build choices explain their arena role before you spend gold.
- Strength, agility, defense, stamina, and favor now advertise their actual combat jobs in menu, market, and training surfaces so the build philosophy reads before you commit gold.
- Jab pressure now scales from agility while block reduction scales harder from defense, which makes non-strength routes feel intentional instead of ornamental.
- The folder stays focused on menu, market, training, combat, and result flow rather than broader simulation detail.

## Next todo

- Recheck with fresh player feedback whether the screen-aware training recommendation plus the existing `best next pick / route support / pivot` labels fully close the remaining choice-philosophy confusion before adding more enemy or item variety.
