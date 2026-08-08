import assert from 'node:assert/strict';
import test from 'node:test';
import { ForgeMapPhysicsAdapter } from '../src/integrations/worldforge/ForgeMapPhysicsAdapter.js';
import { createTerrainLayoutFromForge } from '../src/integrations/worldforge/forgeTerrainLayout.js';

const map = {
  box: { size: [8, 4, 8] },
  terrain: { resolutionX: 3, resolutionZ: 3, heights: [0, 0, 0, 0, 1, 0, 0, 0, 0] },
  waterBodies: [{ type: 'river', width: 2, points: [[0, -4], [0, 4]] }],
  collisionBake: { boxes: [{ min: [2, 0, 2], max: [4, 2, 4] }] },
};

test('Forge water is projected into the current Chii navigation grid', () => {
  const layout = createTerrainLayoutFromForge(map, 4);
  assert.deepEqual(layout.map(row => row.filter(cell => cell === 'water').length), [2, 2, 2, 2]);
});

test('Forge physics registers terrain and baked boxes and releases both', () => {
  const removed = [];
  const terrainBody = { id: 'terrain' };
  const boxBody = { id: 'box' };
  const physics = {
    addStaticTrimesh(vertices, indices) {
      assert.equal(vertices.length, 27);
      assert.equal(indices.length, 24);
      return terrainBody;
    },
    addStaticBox() { return { parent: () => boxBody }; },
    removeRigidBody(body) { removed.push(body); },
  };
  const adapter = new ForgeMapPhysicsAdapter({ physics, map }).attach();
  adapter.dispose();
  assert.deepEqual(removed, [terrainBody, boxBody]);
});
