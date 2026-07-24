import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { getObjectMoveCameraFrame } from '../src/demos/chii-island/systems/ObjectEditorController.js';

test('object move camera frames the model from a fixed north-up overhead angle', () => {
  const root = new THREE.Group();
  const model = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 10));
  model.position.y = 4;
  root.add(model);
  const entity = {
    mesh: root,
    getWorldBBox() {
      root.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(model);
    },
  };
  const frame = getObjectMoveCameraFrame(entity);
  const horizontalDistance = Math.hypot(
    frame.position.x - frame.lookAt.x,
    frame.position.z - frame.lookAt.z,
  );

  assert.ok(frame.position.y - frame.lookAt.y >= 18);
  assert.ok(frame.position.y - frame.lookAt.y > horizontalDistance);
  assert.equal(frame.position.x, frame.lookAt.x);
  assert.ok(frame.position.z > frame.lookAt.z);
  assert.equal(frame.fov, 55);
});

test('object move camera is independent of the incoming gameplay camera', () => {
  const entity = {
    mesh: new THREE.Group(),
    getWorldBBox: () => new THREE.Box3(
      new THREE.Vector3(-2, 0, -3),
      new THREE.Vector3(2, 5, 3),
    ),
  };
  const fromEast = new THREE.PerspectiveCamera();
  fromEast.position.set(30, 8, 0);
  const fromWest = new THREE.PerspectiveCamera();
  fromWest.position.set(-30, 8, 0);

  const first = getObjectMoveCameraFrame(entity, fromEast);
  const second = getObjectMoveCameraFrame(entity, fromWest);

  assert.deepEqual(first.position.toArray(), second.position.toArray());
  assert.deepEqual(first.lookAt.toArray(), second.lookAt.toArray());
});
