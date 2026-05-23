# Puyo Chain Reactor

Standalone browser puzzle entry about building color chains before reactor pressure shoves new sludge rows into the stack.

## Play

Open `./puyo-chain-reactor/index.html` in a browser.

## Controls

- `A` / `D` or arrow keys move the falling pair.
- `W` / `Up` rotates the pair.
- `S` / `Down` soft-drops.
- `Space` hard-drops.
- `Enter` starts or restarts.

## Loop

Match four or more connected blobs of one color to clear them. Gravity can create follow-up chains, and every clear resets the pressure meter. If six placed pairs pass without a clear, the reactor pushes a full sludge row up from the bottom.

## Goal

Reach the target score before the stack blocks the feed pipe.

## Sweep Learnings

- Durable learning: in pressure-based puzzle games, theme lands harder when the fail timer is exposed as live in-world hardware instead of a text-only rule. Visible injectors, coolant, and alarm states make the pressure system easier to read and more memorable at the same time.
