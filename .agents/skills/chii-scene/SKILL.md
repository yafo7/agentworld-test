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

Pro/Voxel scene switching is asset-driven through `data/assetCatalog.js` and `data/sceneStyle.js`. Keep one layout and one gameplay graph; never duplicate the scene to add a visual style.

Do not place trees inside buildings, overlap interactive objects, or bypass terrain painting helpers. Flowers/grass normally have no collider; buildings and trees normally do.

Read `references/placement.md` for region and placement constraints.
