import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTerrainLayout } from '../src/engine/world/terrain.js';
import { generateSceneLayout } from '../src/demos/chii-island/systems/sceneLayout.js';

test('50x50 Chii layout preserves the three playable regions', () => {
  const terrain = generateTerrainLayout(50, 42);
  const scene = generateSceneLayout(terrain, 50, 99);

  assert.equal(scene.modifiedLayout.length, 50);
  assert.equal(scene.modifiedLayout[0].length, 50);
  assert.deepEqual(new Set(scene.buildings.map((item) => item.type)), new Set(['windmill', 'church', 'temple']));
  assert.ok(scene.pastoral.farmlandCells.size > 0);
  assert.ok(scene.pastoral.wheatCells.size > 0);
  assert.ok(scene.town.squareCells.size > 0);
  assert.deepEqual(
    {
      gridX: scene.town.bridge.gridX,
      gridZ: scene.town.bridge.gridZ,
      width: scene.town.bridge.width,
      depth: scene.town.bridge.depth,
    },
    { gridX: 27, gridZ: 16, width: 11, depth: 3 },
  );
  assert.ok(scene.town.bridge.traversalCells.size > 0);
  assert.ok([...scene.town.bridge.traversalCells].every((key) => {
    const [x, z] = key.split(',').map(Number);
    return terrain[z][x] === 'water';
  }));
  assert.ok(scene.trees.every(tree => (
    tree.gridX < scene.town.bridge.gridX - 1
    || tree.gridX > scene.town.bridge.gridX + scene.town.bridge.width
    || tree.gridZ < scene.town.bridge.gridZ - 1
    || tree.gridZ > scene.town.bridge.gridZ + scene.town.bridge.depth
  )));
  assert.ok(scene.forestTemple.trophy);
  assert.ok(scene.forestTemple.tent);
  assert.ok(scene.forestTemple.waterfall);
  assert.ok(scene.town.fountain);
  assert.ok(scene.beach.sandCells.size >= 45);
  assert.equal(
    scene.modifiedLayout[scene.beach.spawn.gridZ][scene.beach.spawn.gridX],
    'sand',
  );
  assert.ok([...scene.beach.rockCells].every(key => {
    const [x, z] = key.split(',').map(Number);
    return scene.modifiedLayout[z][x] === 'rock';
  }));
  assert.ok(scene.grasses.every(grass => !scene.beach.avoidCells.has(`${grass.gridX},${grass.gridZ}`)));
  assert.ok(scene.trees.every(tree => !scene.beach.sandCells.has(`${tree.gridX},${tree.gridZ}`)));
});
