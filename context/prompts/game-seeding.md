# Game Seeding Prompt

Use this only when `todo.md` has no real `PENDING` entries.

Work from the catalog first:

1. Inspect the current top-level game folders in the repository root.
2. Read root markdown docs for shared rules, catalog shape, and assistant workflow.
3. Avoid duplicating an existing game theme, mechanic, or folder name.
4. Choose one distinct next concept that fits the catalog-first, browser-playable repo style.
5. Write one new raw `PENDING` record line into the `## Pending` section of `todo.md`.
6. Use that new queue item as the implementation target.

Selection rules:

- Prefer a concept that feels clearly different from nearby entries.
- Keep the idea scoped to one independent top-level game folder.
- Keep the proposal high-level and practical, not code-heavy.
- If several ideas fit, pick the one with the cleanest separation from existing catalog entries.

Return only the chosen queue item and the reason it is distinct enough to seed next.

Prompt example

```
Act as a Lead Game Design Architect. Generate 10 highly sophisticated, ultra-detailed prompts designed to instruct an AI to code a complete, modular HTML5 Canvas/JS game.

Each generated prompt must adhere to the following strict criteria:
1. Remix Concept: Take a cult classic from either the 8/16-bit era or the early 00s-mid 10s Flash era (Miniclip/Kongregate/Newgrounds) and add a high-complexity (8/10+) mechanical twist.
2. Technical Specifications: Demand a single-file 'index.html' entry point using modular ES6 imports (`type="module"`) with NO external libraries.
3. Depth & Ambitiousness: Each prompt should be 250-400 words long, detailing the exact technical solutions for:
    - Physics Models: (e.g., Verlet integration, centripetal force, ray-casting, or impulse-based collision manifolds).
    - Entity AI: Detailed behavior trees, flocking logic, A* pathfinding, or predictive interception algorithms.
    - Architecture: A robust state machine (MENU, PLAYING, WIN, LOSE) and a component-based or class-based system.
4. Asset Sourcing: Specify that all transparent PNG imagery and SFX must be sourced from public domain repositories (OpenGameArt, Kenney.nl) or utilize craftpx-download skill
5. Folder Naming: Specify a concise, unique folder name for the project.
6. UI Requirements: Require a fully stylized Main Menu, a functional in-game HUD, and clear Win/Lose screens.

Focus on making the game mechanics "ambitious"—incorporating concepts like time-dilation, destructible tile-maps, momentum-based grappling, or complex hierarchical limb physics.
```
