# Project Setup Notes

This document outlines recent setup changes and required user actions.

## Module Resolution for Three.js

To resolve 'three' module specifier errors and enable Three.js in the browser environment:

1.  An `import-map.json` file has been created at the project root. This file configures the import specifier `three` to resolve to `./lib/3js/build/three.module.js`.
2.  A directory structure `lib/3js` has been created to facilitate vendoring of the Three.js library.

## Action Required

To complete the setup and ensure Three.js functions correctly, please perform the following steps:

1.  **Obtain the Three.js library files.**
2.  **Place the `three.module.js` file** (and any other required Three.js assets) into the `lib/3js/build/` directory within this repository.

## Verification

After placing the necessary Three.js files, you can verify the TypeScript setup by running:

```bash
bunx tsc --noEmit
```
