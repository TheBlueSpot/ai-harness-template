# Game Catalog

This repository is a catalog of browser-game experiments, remakes, and mechanic studies. The common pattern is folder-first: each top-level game directory is its own catalog entry, with local files for play, assets, and notes when needed.

## Catalog Shape

Current scan shows 29 top-level game folders with their own playable page, plus a root landing page.

| Pattern | What it means |
| --- | --- |
| `index.html` in each entry | Most games stay directly playable from their own folder |
| `assets/` in 17 entries | Art, audio, attribution, and pack notes usually stay local to game |
| `src/` in 9 entries | Larger prototypes group gameplay systems into a source folder |
| `js/` in 7 entries | Some games use a simpler script-first layout instead of `src/` |
| `styles.css` in 8 entries | Visual styling often stays per game rather than shared globally |
| `README.md` in 8 entries | Only some entries currently explain intent, controls, or asset sourcing |

This layout favors independence over shared runtime architecture. Games can evolve, pause, or archive without forcing repo-wide rewrites.

## How To Browse

- Treat each top-level game folder as one catalog item.
- Start with local notes when a game includes its own `README.md`.
- Open the game's local page for quick play checks and visual review.
- Look at root docs for shared conventions, not game-specific behavior.

## Shared Areas

- [Architecture Overview](./architecture/overview.md): higher-level system notes for this workspace
- [Operational Rules](./prompts/operational-rules.md): shared working conventions
- [Assistant Workflow](./.agents/assistants/README.md): queue-driven assistant entrypoint for catalog work
- [Repo-Local Skills](./.agents/skills/): shared Codex skills for this catalog, kept in the generic `.agents` tree
- [Game Queue](./todo.md): authoritative list that the assistant follows when the queue is active
- [Shared Assets Notes](./assets/README.md): root-level asset guidance only

## Catalog Rules

- Keep each game self-contained unless a shared dependency is clearly intentional.
- Store game-specific notes, asset sourcing, and implementation detail near that game.
- Use root docs to explain catalog structure, curation rules, and cross-repo conventions.
- Use the assistant queue workflow for guided catalog work, and keep low-level prompt details inside the assistant docs.
- Update this file when new common patterns appear or repo navigation changes.
