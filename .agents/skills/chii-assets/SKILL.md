---
name: chii-assets
description: Sync, audit, or selectively refresh only the saved voxel models and animations used by Chii Island from local Voxel Studio on port 8000. Use after Studio edits, when local game assets are stale or mismatched, or when the user asks to update, inspect, or synchronize Chii assets.
---

# Chii Runtime Assets

Default safe workflow:

```powershell
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --all --dry-run
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --all
```

Useful explicit operations:

```powershell
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --only nailong,mako,yafo
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --only forest-trophy
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --only forest-trophy --source original
```

Rules:

- Default source is the latest JSON saved by Studio through `/api/load-edited`; models without an edited save fall back to their original JSON.
- Use `--source original` only for migration or diagnosis.
- Never generate a missing configured animation during sync.
- Never pull the whole Studio library; sync only Chii's allowlist.
- Always select a scope with `--all` or `--only`; a bare command is rejected.
- Dry-run performs semantic JSON comparison and reports `same`, `changed`, `missing`, and `ambiguous` without touching the manifest.
- A real sync skips semantically unchanged JSON instead of rewriting it.
- Studio sync updates the normal staging assets under `public/generated/`; it does not silently replace the independent Pro, Voxel, or Original scene snapshots. Publishing into one scene must be explicit and must update only that scene's manifest.
- Run `$chii-verify` after writing assets.

Read `references/pipeline.md` only when changing source policy, adding an asset, or diagnosing JSON provenance.

Report model count, animation count, warnings, source kind, and exact command.
