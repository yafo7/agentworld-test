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

Use `$chii-dev` first when 5173 is not running. If another project owns that
port, start Chii on a free port and set the complete test URL, for example:

```powershell
$env:CHII_VERIFY_URL='http://127.0.0.1:5174/src/demos/chii-island/?church-town'
node .agents/skills/chii-verify/scripts/verify.mjs --full
```

Quick mode runs tests and build. Full mode also verifies that the URL is the
Chii page, checks desktop and mobile WebGL pixels, runtime models, browser
errors, viewport framing, Esc, WASD, E dialogue, and writes desktop/mobile
screenshots under `.agents/runtime/`.

Report failures first. The existing large-chunk warning is not a failure.
