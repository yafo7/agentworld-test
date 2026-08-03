import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ArchitectNPC } from '../src/demos/chii-island/entities/ArchitectNPC.js';
import { TerrainPathfinder } from '../src/world/navigation/TerrainPathfinder.js';

test('following pet reaches the opposite bank without entering unbridged water', () => {
  const terrainLayout = Array.from({ length: 7 }, () => (
    Array.from({ length: 7 }, (_, x) => x === 3 ? 'water' : 'grass')
  ));
  const navigation = new TerrainPathfinder({
    terrainLayout,
    traversalCells: ['3,3'],
  });
  const start = navigation.cellToWorld({ x: 1, z: 1 });
  const destination = navigation.cellToWorld({ x: 5, z: 1 });
  const pet = new ArchitectNPC();
  pet.setPosition(start.x, 0, start.z);
  pet.setNavigation(navigation);
  pet.followTarget({
    position: new THREE.Vector3(destination.x, 0, destination.z),
  }, 0.5, 4);

  for (let frame = 0; frame < 600; frame += 1) {
    pet.update(1 / 60);
    assert.equal(navigation.isWalkableWorld(pet.mesh.position), true);
  }

  assert.ok(Math.hypot(
    pet.mesh.position.x - destination.x,
    pet.mesh.position.z - destination.z,
  ) <= 0.5);
});
