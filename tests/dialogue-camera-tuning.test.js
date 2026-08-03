import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DialogueCameraDirector } from '../src/demos/chii-island/presentation/DialogueCameraDirector.js';

function subject(height) {
  const mesh = new THREE.Group();
  mesh.position.set(4, 0, 0);
  const visual = new THREE.Mesh(new THREE.BoxGeometry(2, height, 2));
  visual.position.y = height / 2;
  mesh.add(visual);
  return {
    mesh,
    _modelGroup: visual,
    getPosition: () => mesh.position.clone(),
    getWorldBBox: () => new THREE.Box3().setFromObject(visual),
  };
}

test('dialogue camera adds framing distance for a tall subject', () => {
  const captures = [];
  const director = new DialogueCameraDirector({
    player: { mesh: new THREE.Group() },
    thirdPersonCamera: {
      lockTo(position, target, fov) {
        captures.push({ position: position.clone(), target: target.clone(), fov });
      },
    },
    dialogueSystem: { isActive: () => false },
  });
  director.framePair(subject(3));
  director.framePair(subject(12));
  assert.ok(captures[1].position.distanceTo(captures[1].target)
    > captures[0].position.distanceTo(captures[0].target));
});
