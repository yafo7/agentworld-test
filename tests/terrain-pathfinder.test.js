import assert from 'node:assert/strict';
import test from 'node:test';
import { TerrainPathfinder } from '../src/world/navigation/TerrainPathfinder.js';

function riverLayout() {
  return Array.from({ length: 7 }, (_, z) => (
    Array.from({ length: 7 }, (_, x) => x === 3 ? 'water' : 'grass')
  ));
}

test('terrain pathfinder routes across the declared bridge cell', () => {
  const pathfinder = new TerrainPathfinder({
    terrainLayout: riverLayout(),
    traversalCells: ['3,3'],
  });
  const from = pathfinder.cellToWorld({ x: 1, z: 1 });
  const to = pathfinder.cellToWorld({ x: 5, z: 1 });
  const path = pathfinder.findPath(from, to);

  assert.ok(path.length > 0);
  assert.ok(path.some(point => pathfinder.worldToCell(point).z === 3));
  const route = [from, ...path];
  assert.ok(route.slice(1).every((point, index) => (
    pathfinder.isSegmentWalkable(route[index], point)
  )));
});

test('terrain pathfinder rejects a river crossing without a bridge', () => {
  const pathfinder = new TerrainPathfinder({ terrainLayout: riverLayout() });
  const from = pathfinder.cellToWorld({ x: 1, z: 1 });
  const to = pathfinder.cellToWorld({ x: 5, z: 1 });

  assert.deepEqual(pathfinder.findPath(from, to), []);
});

test('terrain pathfinder keeps a clear same-bank route direct', () => {
  const pathfinder = new TerrainPathfinder({ terrainLayout: riverLayout() });
  const from = pathfinder.cellToWorld({ x: 1, z: 1 });
  const to = pathfinder.cellToWorld({ x: 1, z: 5 });

  assert.deepEqual(pathfinder.findPath(from, to), [{ ...to, y: 0 }]);
});
