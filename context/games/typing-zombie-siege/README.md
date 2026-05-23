# Typing Zombie Siege

Standalone browser typing-defense entry. Hold the barricade by typing zombie words, then press `Enter` to clear the matched target before it breaches the wall.

## Play

Open [index.html](./index.html) directly in a browser.

## Controls

- `A-Z`: build the current word buffer and focus matching threats
- `Backspace`: remove the last typed letter
- `Enter`: submit the buffered word or start the run
- `Escape`: restart the siege mid-run
- `Ctrl+R` / `Cmd+R`: restart without stealing `r` from live typing

## Kojima Sweep Notes

- Fresh review pass found two trust issues: live `R` restart collided with valid zombie words, and each restart replayed the same vocabulary order.
- Reset now lives on `Ctrl+R` / `Cmd+R` plus `Escape`, so `r` stays safe for words like `crypt` while the browser shortcut remains blocked inside the game.
- Each restart reshuffles the per-tier word pools, so repeat runs no longer replay the same sequence before fresh feedback.
