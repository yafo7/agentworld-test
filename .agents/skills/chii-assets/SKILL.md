---
name: chii-assets
description: Sync, audit, or selectively refresh only the runtime voxel models and animations used by Chii Island from local Voxel Studio on port 8000. Use after Studio edits, when runtime assets are stale or mismatched, or when the user asks to update, inspect, publish, or synchronize Chii assets.
---

# Chii Runtime Assets

Default safe workflow:

```powershell
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --dry-run
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --all
```

Useful explicit operations:

```powershell
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --only nailong,mako,yafo
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --all --publish
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --only forest-trophy --source edit
```

Rules:

- Default source is Runtime JSON only.
- Use `--source edit` only for an explicit unpublished preview.
- Use `--source original` only for migration or diagnosis.
- Never generate a missing configured animation during sync.
- Never pull the whole Studio library; sync only Chii's allowlist.
- Run `$chii-verify` after writing assets.

Read `references/pipeline.md` only when changing source policy, adding an asset, or diagnosing JSON provenance.

Report model count, animation count, warnings, source kind, and exact command.
