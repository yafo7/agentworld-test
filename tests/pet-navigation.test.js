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

function walkingPet() {
  const pet = new ArchitectNPC();
  pet._animPlans = { idle: {}, walk: {}, run: {} };
  return pet;
}

test('walking clip advances with actual horizontal distance and stops on arrival', () => {
  const pet = walkingPet();
  pet.walkTo(6, 0, 6);
  pet.update(0.05);
  assert.ok(Math.abs(pet.mesh.position.x - 0.3) < 1e-8);
  assert.equal(pet._animState, 'walk');
  assert.ok(Math.abs(pet._animTime - 0.1) < 1e-8);
  for (let frame = 0; frame < 24; frame += 1) pet.update(0.05);
  assert.equal(pet.isWalking(), false);
  assert.ok(Math.abs(pet.mesh.position.x - 6) < 0.2);
  assert.equal(pet._animState, 'idle');
});

test('a blocked resident stops stepping and emitting run dust', () => {
  const pet = walkingPet();
  pet._collider = {};
  pet._controller = {
    computeColliderMovement() {},
    computedMovement: () => ({ x: 0, y: 0.001, z: 0 }),
  };
  let dust = 0;
  pet.onRunDust(() => dust++);
  pet.walkTo(5, 0);
  for (let frame = 0; frame < 20; frame += 1) pet.update(0.05);
  assert.equal(pet.mesh.position.x, 0);
  assert.equal(pet.isWalking(), false);
  assert.equal(pet._animState, 'idle');
  assert.equal(dust, 0);
});

test('a resident sidesteps a blocking prop and continues towards its destination', () => {
  const pet = walkingPet();
  let corrected;
  pet._collider = {};
  pet._controller = {
    computeColliderMovement(_, displacement) {
      const { x, z } = pet.mesh.position;
      const crosses = x < 1 && x + displacement.x >= 1;
      const contact = crosses ? (1 - x) / displacement.x : 0;
      const hits = crosses && Math.abs(z + displacement.z * contact) < 0.7;
      corrected = { x: hits ? 0 : displacement.x, y: 0, z: displacement.z };
    },
    computedMovement: () => corrected,
  };
  pet.walkTo(5, 0, 3);
  for (let frame = 0; frame < 120; frame += 1) pet.update(0.05);
  assert.ok(pet.mesh.position.distanceTo(new THREE.Vector3(5, 0, 0)) < 0.25);
  assert.equal(pet._animState, 'idle');
});
