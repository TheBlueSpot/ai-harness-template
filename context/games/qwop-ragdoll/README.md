# qwop-ragdoll

Direct-browser ragdoll runner with a local shell, canvas playfield, and HUD overlays driven from the game snapshot.

## Controls

- `Q` and `W` work the left leg
- `O` and `P` work the right leg
- `Enter` or `Space` starts a run
- `R` restarts after a fall or finish

## Local run

Open [`./index.html`](./index.html) from this folder in a browser, or serve this folder with the repo's normal local static workflow.

## Notes

- The entry stays self-contained inside `qwop-ragdoll`.
- Menu, fail, and finish overlays follow the runtime frame state.
- The canvas render reads only the `Game` snapshot and stays responsive to local sizing.
