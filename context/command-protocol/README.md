# Command Protocol

This entry documents the websocket command surface used by the harness.

## Scope

- Client commands stay fixed and typed.
- Server events stay structured and narrow.
- Project and thread actions carry validated ids or paths, not raw shell input.
- Sweep note: this folder is documentation-only, so the stable surface is the websocket contract itself rather than a browser entrypoint or local game loop.

## Reference

Open [websocket-contract.md](./websocket-contract.md) for the current command and event shape.
- Patrol note: no new blocker found in this cohort pass; this folder stays contract-only and stable.
