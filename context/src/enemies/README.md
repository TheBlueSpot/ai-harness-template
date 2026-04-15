# Core Enemies

This directory contains the implementations for the core enemy types in the game.

- **`enemy.ts`**: Defines the abstract base class `Enemy`.
- **`zako.ts`**: Implements the `Zako` enemy.
- **`goei.ts`**: Implements the `Goei` enemy.
- **`boss-galaga.ts`**: Implements the `BossGalaga` enemy.

Each enemy class extends the `Enemy` base class and provides specific implementations for `diveAttack`, `move`, and `updateAI` methods, defining their unique behaviors and combat patterns.
