---
name: chii-scene
description: Modify Chii Island terrain, roads, vegetation, buildings, props, spawn points, occupancy, random placement, scale, and static collision while preserving the current scene architecture. Use for region layout, environment dressing, collision placement, overlap bugs, or visual-density adjustments.
---

# Chii Scene Layout

Workflow:

1. Identify region and grid footprint.
2. Change deterministic layout data in `sceneLayout.js` when possible.
3. Assemble entities through `ChiiSceneAssembler` and register them in `WorldObjectRegistry`.
4. Query occupancy before placement.
5. Build static colliders through the existing collider helper.
6. Keep random variation seeded and bounded.
7. Run `$chii-verify --full` and inspect the screenshot.

Pro/Voxel/Original switching is profile-driven through `data/assetCatalog.js` and `data/sceneStyle.js`. Each scene owns independent frozen assets, manifests, environment feature flags, and scene-specific content configuration. Original specifically comes from `public/generated/history/2026-07-28-gpt56-reset/`, the automatic backup made before the large 2026-07-28 iteration; do not substitute an older Git commit for that boundary. Change only the requested profile. Keep engine, gameplay graph, registries, and reusable layout algorithms shared instead of copying implementation code.

Scene snapshots live under `public/generated/scenes/{pro,voxel,original}/`. Studio sync or autonomous generation must not silently overwrite a snapshot. Publishing a changed asset to one scene requires an explicit update to that scene directory and manifest.

Do not place trees inside buildings, overlap interactive objects, or bypass terrain painting helpers. Flowers/grass normally have no collider; buildings and trees normally do.

Read `references/placement.md` for region and placement constraints.
