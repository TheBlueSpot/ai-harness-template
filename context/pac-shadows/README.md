# Pac Shadows

Stand-alone canvas game module for the `pac-shadows` slice.

## Entry

- [index.html](./index.html) boots the module in a browser.

## Structure

- Asset sources live in [`js/asset-manifest.js`](./js/asset-manifest.js).
- [`js/assets.js`](./js/assets.js) loads the manifest and falls back when remote art or audio is missing.
- [`js/state-machine.js`](./js/state-machine.js) manages the menu, play, win, and lose scenes.
- [`js/scenes/`](./js/scenes) contains the scene modules.
- [`js/systems/`](./js/systems) contains the maze, player, lighting, ghost, and FX boundaries.
- See [`assets/README.md`](../assets/README.md) for the broader asset policy used in this checkout.

## Notes

- The module is self-contained and safe to open directly in a browser.
- Missing PNG or SFX files fall back to generated placeholders and synthesized tones.
- Asset credits are kept at the manifest level so the loader stays swap-friendly.
