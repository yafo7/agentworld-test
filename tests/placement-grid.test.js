import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PlacementGrid } from '../src/world/placement/PlacementGrid.js';

function entity(id, x, z, size = [1, 1]) {
  return {
    id,
    _instanceId: id,
    mesh: { position: new THREE.Vector3(x, 0, z) },
    getWorldBBox: () => new THREE.Box3(
      new THREE.Vector3(x - size[0] / 2, 0, z - size[1] / 2),
      new THREE.Vector3(x + size[0] / 2, 2, z + size[1] / 2),
    ),
  };
}

test('placement grid subdivides terrain and rejects water or occupied cells', () => {
  const layout = Array.from({ length: 4 }, () => Array(4).fill('grass'));
  layout[1][1] = 'water';
  const grid = new PlacementGrid({ terrainSize: 4, terrainLayout: layout });
  const first = entity('first', -6, -6);
  grid.register(first, { placement: { footprint: { width: 2, depth: 2 } } });

  assert.equal(grid.width, 8);
  assert.equal(grid.cellSize, 2);
  assert.equal(grid.canPlace({ x: 0, z: 0 }, { width: 2, depth: 2 }).valid, false);
  assert.equal(grid.canPlace({ x: 2, z: 2 }, { width: 2, depth: 2 }).blockedTerrain.length, 4);
});

test('placement grid permits water only for explicitly registered bridge footprints', () => {
  const layout = Array.from({ length: 2 }, () => Array(2).fill('grass'));
  layout[0][0] = 'water';
  const grid = new PlacementGrid({ terrainSize: 2, terrainLayout: layout });
  const anchor = { x: 0, z: 0 };
  const footprint = { width: 2, depth: 2 };
  const position = grid.positionFor(anchor, footprint);

  assert.equal(grid.canPlace(anchor, footprint).valid, false);
  assert.equal(grid.canPlace(anchor, footprint, { allowWater: true }).valid, true);

  const bridge = entity('bridge', position.x, position.z);
  const record = grid.register(bridge, {
    placement: {
      footprint,
      allowWater: true,
    },
  });

  assert.equal(record.allowWater, true);
  assert.equal(grid.audit().invalidTerrain.length, 0);
  assert.equal(grid.canPlace({ x: 2, z: 0 }, footprint).valid, true);
  assert.equal(grid.canPlace(anchor, footprint, { ignoreEntity: bridge }).valid, false);
});

test('placement grid supports self-ignored previews and atomic footprint commits', () => {
  const layout = Array.from({ length: 4 }, () => Array(4).fill('grass'));
  const grid = new PlacementGrid({ terrainSize: 4, terrainLayout: layout });
  const item = entity('item', -6, -6);
  const record = grid.register(item, { placement: { footprint: { width: 2, depth: 2 } } });

  assert.equal(grid.canPlace(record.anchor, record.footprint).valid, false);
  assert.equal(grid.canPlace(record.anchor, record.footprint, { ignoreEntity: item }).valid, true);
  grid.commit(item, { anchor: { x: 4, z: 4 }, footprint: { width: 1, depth: 1 } });
  assert.deepEqual(grid.get(item).anchor, { x: 4, z: 4 });
  assert.equal(grid.audit().overlaps.length, 0);
});

test('placement audit reports existing overlaps without moving curated entities', () => {
  const layout = Array.from({ length: 4 }, () => Array(4).fill('grass'));
  const grid = new PlacementGrid({ terrainSize: 4, terrainLayout: layout });
  grid.register(entity('one', -6, -6), { placement: { footprint: { width: 2, depth: 2 } } });
  grid.register(entity('two', -6, -6), { placement: { footprint: { width: 2, depth: 2 } } });

  const audit = grid.audit();
  assert.equal(audit.overlaps.length, 4);
  assert.equal(audit.entities, 2);
});

test('placement clearance reports soft conflicts without changing hard validity', () => {
  const grid = new PlacementGrid({ terrainSize: 6 });
  const position = grid.positionFor({ x: 3, z: 3 }, { width: 2, depth: 2 });
  const item = entity('clearance-owner', position.x, position.z);
  grid.register(item, {
    placement: {
      footprint: { width: 2, depth: 2 },
      clearanceCells: 1,
    },
  });
  const result = grid.canPlace({ x: 5, z: 3 }, { width: 1, depth: 1 });
  assert.equal(result.valid, true);
  assert.equal(result.comfortable, false);
  assert.deepEqual(result.softConflicts, ['clearance-owner']);
});
