---
name: sync-studio-assets
description: Sync only the Chii Island runtime models and animations that the local agentworld-test project actually uses from the local Voxel Studio / 3d-generate backend on port 8000. Use when the user asks to synchronize Studio edits into Chii Island, update local public/generated assets from Voxel Studio, or refresh all island-used models/animations after editing them in 3d-generate.
---

# Sync Studio Assets

Use this skill to copy edited/published Voxel Studio assets into Chii Island's local runtime files.

The sync direction is always:

```text
agentworld-test Chii Island asset allowlist
-> local Voxel Studio on http://localhost:8000
-> agentworld-test/public/generated/
```

Do not sync every model in Voxel Studio. Only sync entries in the Chii Island allowlist embedded in `scripts/sync-from-studio.mjs`.

## Command

From the `agentworld-test` repo root:

```powershell
node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --all
```

Useful options:

```powershell
node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --dry-run
node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --all --publish
node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --only nailong,mako,yafo
node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --source edit
node .agents/skills/sync-studio-assets/scripts/sync-from-studio.mjs --studio http://localhost:8000
```

## Source Policy

- Default model source order: `runtime`, then `edit`, then legacy `load-edited`, then original `model`.
- Use `--publish` when the Studio edit should become the official runtime JSON before copying.
- Use `--source edit` when previewing unsafely edited work in Chii Island without publishing.
- Never generate missing animations. Missing configured animations should be reported as warnings.

## Outputs

The script writes:

```text
public/generated/models/*.json
public/generated/animations/*.json
public/generated/chii-runtime-manifest.json
public/generated/_sync-backup/
```

`chii-runtime-manifest.json` records which local file came from which Studio `assetId`, `commit`, `folder`, and source kind.

## After Sync

Report:

- number of models written
- number of animations written
- warnings for missing Studio assets or animations
- exact command used

If Chii Island is running, refresh `http://localhost:5173/src/demos/chii-island/` after sync.
