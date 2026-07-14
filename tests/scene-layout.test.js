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
  assert.ok(scene.forestTemple.trophy);
  assert.ok(scene.forestTemple.tent);
});

