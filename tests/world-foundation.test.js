import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WorldObjectRegistry } from '../src/world/WorldObjectRegistry.js';
import { buildStaticColliders } from '../src/world/physics/buildStaticColliders.js';

function entity(id, x, z) {
  return { id, mesh: { position: { x, y: 0, z } } };
}

test('world registry owns lookup, proximity and occupancy queries', () => {
  const registry = new WorldObjectRegistry();
  const tree = registry.add(entity('tree', 2, 1));
  registry.add(entity('house', 12, 0));

  assert.equal(registry.findById('tree'), tree);
  assert.equal(registry.nearest({ x: 0, z: 0 }, { range: 5 }).item, tree);
  assert.equal(registry.isOccupied({ x: 0, z: 0 }, 3), true);
  assert.equal(registry.isOccupied({ x: -10, z: 0 }, 3), false);
});

test('static collider builder translates entity metadata into physics calls', () => {
  const calls = [];
  const physics = {
    createStaticBody: () => ({ id: 'body' }),
    addStaticCylinderToBody: (...args) => calls.push(['cylinder', ...args]),
    addStaticBoxToBody: (...args) => calls.push(['box', ...args]),
  };
  const tree = {
    mesh: { position: new THREE.Vector3(), userData: { collider: { type: 'tree' } } },
    getWorldBBox: () => new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 4, 1)),
  };
  const building = {
    mesh: { position: new THREE.Vector3(8, 0, 4), userData: { collider: { type: 'building', width: 6, depth: 10 } } },
    getWorldBBox: () => new THREE.Box3(new THREE.Vector3(5, 0, -1), new THREE.Vector3(11, 6, 9)),
  };

  const result = buildStaticColliders(physics, [tree, building]);
  assert.equal(result.colliderCount, 2);
  assert.equal(calls[0][0], 'cylinder');
  assert.equal(calls[1][0], 'box');
  assert.equal(calls[1][2], 3);
  assert.equal(calls[1][4], 5);
});

