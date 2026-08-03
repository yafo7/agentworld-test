import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TownActivityPresentationDirector } from '../src/demos/chii-island/presentation/TownActivityPresentationDirector.js';

function makeSubject(name, position = new THREE.Vector3()) {
  const mesh = new THREE.Group();
  mesh.name = name;
  mesh.position.copy(position);
  mesh.add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), new THREE.MeshBasicMaterial()));
  return { _petName: name, mesh, _modelGroup: mesh };
}

test('town activity presentation queues storyline dialogue and cinematic shots', async () => {
  const locks = [];
  let unlocks = 0;
  let active = false;
  const spoken = [];
  const dialogueSystem = {
    isActive: () => active,
    async sayTimed(request) {
      active = true;
      spoken.push(request);
      active = false;
      return true;
    },
  };
  const cameraController = {
    camera: { position: new THREE.Vector3(0, 3, 8) },
    lockTo(position, lookAt, fov) { locks.push({ position, lookAt, fov }); },
    unlock() { unlocks += 1; },
  };
  const player = { mesh: { position: new THREE.Vector3(0, 0, 5) } };
  const director = new TownActivityPresentationDirector({ player, cameraController, dialogueSystem });
  const mako = makeSubject('mako', new THREE.Vector3(0, 0, -2));

  assert.equal(director.showFullBody(mako, '苹果主动报名了。'), true);
  director.update(0.1);
  await Promise.resolve();

  assert.equal(spoken[0].speakerName, 'mako');
  assert.equal(spoken[0].text, '苹果主动报名了。');
  assert.equal(locks.length, 1);
  assert.ok(locks[0].fov > 0);
  director.update(0.1);
  assert.equal(unlocks, 1);
  director.dispose();
});

test('pet full-body activity shot keeps the camera outside the player model', () => {
  const locks = [];
  const cameraController = {
    camera: { position: new THREE.Vector3(0, 3, 8) },
    lockTo(position, lookAt, fov) { locks.push({ position, lookAt, fov }); },
    unlock() {},
  };
  const playerMesh = new THREE.Group();
  playerMesh.position.set(0, 0, 3.2);
  playerMesh.add(new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 3, 1.2),
    new THREE.MeshBasicMaterial(),
  ));
  const player = { mesh: playerMesh };
  const dialogueSystem = { isActive: () => false };
  const director = new TownActivityPresentationDirector({ player, cameraController, dialogueSystem });
  const pet = makeSubject('mako', new THREE.Vector3(0, 0, 0));

  director.focusInteractive(pet);

  assert.equal(locks.length, 1);
  const cameraPosition = locks[0].position.clone().setY(0);
  const playerCenter = playerMesh.position.clone().setY(0);
  assert.ok(cameraPosition.distanceTo(playerCenter) >= 1.15);
  assert.ok(Math.abs(cameraPosition.x) >= 0.85);
  assert.ok(locks[0].position.distanceTo(locks[0].lookAt) >= 5.5);
  director.dispose();
});
