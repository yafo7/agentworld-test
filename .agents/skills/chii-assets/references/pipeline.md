# Asset Pipeline

## Runtime truth

```text
AI original history
→ Studio editable asset
→ Studio save-edited
→ chii-assets sync
→ public/generated
→ assetCatalog.js
→ Three.js
```

The latest Studio-saved Edited JSON is the source for Chii's local runtime copy. A model with no edited save falls back to its Original JSON. Chii still runs only from `public/generated`; it does not read Studio during gameplay.

## Current files

- Runtime catalog: `src/demos/chii-island/data/assetCatalog.js`
- Studio source mapping: `scripts/sync-from-studio.mjs` in this skill
- Sync provenance: `public/generated/chii-runtime-manifest.json`
- Generated gameplay results: `public/generated/generated-library-manifest.json`

When adding an asset, update the runtime catalog and Studio source mapping together. A dry run must report every missing source or animation.

The forest trophy is pinned to `m_1783574540705_1274n8` / `2026-07-09_13-20-59`. Its wait animation must exact-match `底座保持不动，奖杯上方上下跳动，同时出现星光特效`; do not select the other similarly named bounce animation.

Safe commands require an explicit scope:

```powershell
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --all --dry-run
node .agents/skills/chii-assets/scripts/sync-from-studio.mjs --only forest-trophy
```

Dry-run compares parsed JSON rather than formatting. A write skips `same` files, backs up only actual changes, and records the selected Studio source in the runtime manifest.

## Diagnosis order

1. Compare Studio edited JSON with the local synced file.
2. Compare `VoxelModel.fromJSON` results.
3. Compare mirror/optimize output.
4. Compare renderer input.
5. Inspect Mesh only when every earlier value is identical.
