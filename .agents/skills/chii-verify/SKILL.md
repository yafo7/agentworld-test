---
name: chii-verify
description: Validate Chii Island with contract tests, production build, and optional Playwright WebGL interaction checks. Use after code, architecture, asset-loading, pet-state, scene, UI, camera, animation, or integration changes, or when the user asks whether the game still runs.
---

# Chii Verification

Quick verification:

```powershell
node .agents/skills/chii-verify/scripts/verify.mjs --quick
```

Full browser verification requires port 5173:

```powershell
node .agents/skills/chii-verify/scripts/verify.mjs --full
```

Use `$chii-dev` first when 5173 is not running.

Quick mode runs tests and build. Full mode also checks WebGL output, runtime models, browser errors, Esc, WASD, E dialogue, and writes `.agents/runtime/chii-verify.png`.

Report failures first. The existing large-chunk warning is not a failure.
