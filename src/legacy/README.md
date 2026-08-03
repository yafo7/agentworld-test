# Legacy Runtime Paths

This directory contains code still required by the root historical demo, but not by the current Chii Island runtime.

- `chii/Pet.js`: older rich pet implementation used by `src/main.js`.
- `interaction/interact.js`: older global interaction router used by `src/main.js`.

Current Chii Island code must not import from `src/legacy/`. Delete a legacy module only after its remaining entry points have been migrated or removed.
