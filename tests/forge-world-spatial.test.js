import assert from 'node:assert/strict';
import test from 'node:test';
import { createForgeWorldSpatialDescriptor } from '../src/integrations/worldforge/forgeTerrainLayout.js';
import { TerrainPathfinder } from '../src/world/navigation/TerrainPathfinder.js';

test('Forge spatial descriptor derives map scale and blocks baked object cells', () => {
  const map = {
    box: { size: [96, 16, 96] },
    terrain: { resolutionX: 65, resolutionZ: 65, heights: Array(65 * 65).fill(0) },
    waterBodies: [],
    spawnPoints: [[3, 2, 5]],
    collisionBake: { boxes: [{ min: [-1, 0, -1], max: [1, 3, 1] }] },
  };
  const spatial = createForgeWorldSpatialDescriptor(map);
  const pathfinder = new TerrainPathfinder({
    terrainLayout: spatial.terrainLayout,
    center: spatial.center,
    tileSize: spatial.tileSize,
  });

  assert.equal(spatial.gridSize, 64);
  assert.equal(spatial.tileSize, 1.5);
  assert.notDeepEqual(spatial.playerSpawn, [3, 2, 5]);
  assert.equal(spatial.playerSpawn[1], 0);
  assert.equal(pathfinder.isWalkableWorld({ x: 0, z: 0 }), false);
  assert.equal(pathfinder.isWalkableWorld({ x: 20, z: 20 }), true);
});
