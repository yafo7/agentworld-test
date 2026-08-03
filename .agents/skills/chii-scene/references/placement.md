# Placement Reference

## Ownership

- Terrain generation and painting: `src/engine/world/terrain.js`
- Procedural region plan: `src/demos/chii-island/systems/sceneLayout.js`
- Entity assembly: `src/demos/chii-island/world/ChiiSceneAssembler.js`
- Lookup and occupancy: `src/world/WorldObjectRegistry.js`
- Static colliders: `src/world/physics/buildStaticColliders.js`

## Rules

- Preserve the 50x50 grid and river unless the task explicitly changes them.
- Use terrain types for semantic zones: grass, dirt, rock, farmland, brick, sand, and water.
- Keep building footprints clear, then use fragmented terrain transitions around their edges.
- Random tree/plant scale stays within the requested range and rotation uses seeded randomness.
- Treat model scale and collider size separately.
- Verify desktop framing, interaction clearance, and collider alignment.
- Terrain owns river occupancy and navigation; `WorldWaterVisualPort` owns only the animated surface.
- Bridges reserve explicit traversal cells and require a continuous named deck plus rail colliders.

## Regions

- Pastoral: farm fields, garden, paths, windmill and reserved building pads.
- Forest: dense boundary trees, temple clearance, trophy and tent interaction space.
- Town: open brick plaza, rock roads, church visibility and party movement clearance.
- Beach: sand and rock shore, clear wake spawn, gradual vegetation transition into forest.
