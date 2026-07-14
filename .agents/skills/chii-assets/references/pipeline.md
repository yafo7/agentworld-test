# Asset Pipeline

## Runtime truth

```text
AI original history
→ Studio editable asset
→ explicit publish
→ Runtime JSON
→ chii-assets sync
→ public/generated
→ assetCatalog.js
→ Three.js
```

Runtime JSON is the default game input. Edit and original are explicit diagnostic or preview sources, never silent fallbacks.

## Current files

- Runtime catalog: `src/demos/chii-island/data/assetCatalog.js`
- Studio source mapping: `scripts/sync-from-studio.mjs` in this skill
- Sync provenance: `public/generated/chii-runtime-manifest.json`
- Generated gameplay results: `public/generated/generated-library-manifest.json`

When adding an asset, update the runtime catalog and Studio source mapping together. A dry run must report every missing source or animation.

## Diagnosis order

1. Compare Studio runtime JSON with the local synced file.
2. Compare `VoxelModel.fromJSON` results.
3. Compare mirror/optimize output.
4. Compare renderer input.
5. Inspect Mesh only when every earlier value is identical.
